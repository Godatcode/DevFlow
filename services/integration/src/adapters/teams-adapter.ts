import { IntegrationAdapter } from '../interfaces';
import {
  IntegrationProvider,
  Integration,
  Credentials,
  AuthToken,
  SyncType,
  SyncResult,
  WebhookPayload,
  AuthType
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
  isFavoriteByDefault?: boolean;
  email?: string;
  webUrl: string;
  membershipType: 'standard' | 'private' | 'unknownFutureValue';
  createdDateTime: string;
}

export interface TeamsUser {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  email?: string;
  userPrincipalName: string;
  jobTitle?: string;
  mobilePhone?: string;
  officeLocation?: string;
  preferredLanguage?: string;
  businessPhones: string[];
}

export interface TeamsMessage {
  id: string;
  replyToId?: string;
  etag: string;
  messageType: 'message' | 'chatMessage' | 'typing' | 'unknownFutureValue';
  createdDateTime: string;
  lastModifiedDateTime: string;
  lastEditedDateTime?: string;
  deletedDateTime?: string;
  subject?: string;
  summary?: string;
  chatId?: string;
  importance: 'normal' | 'high' | 'urgent' | 'unknownFutureValue';
  locale: string;
  webUrl?: string;
  from: {
    application?: {
      id: string;
      displayName: string;
      applicationIdentityType: string;
    };
    device?: {
      id: string;
      displayName: string;
    };
    user?: TeamsUser;
  };
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  attachments: any[];
  mentions: any[];
  reactions: any[];
}

export interface TeamsNotificationPayload {
  channelId?: string;
  chatId?: string;
  subject?: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  importance?: 'normal' | 'high' | 'urgent';
  attachments?: any[];
  mentions?: any[];
}

export class TeamsAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.TEAMS;
  private readonly logger = new Logger('TeamsAdapter');
  private readonly baseUrl = 'https://graph.microsoft.com/v1.0';

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Microsoft Teams');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateAppToken(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri, tenant_id } = credentials.data;
    
    const tokenUrl = tenant_id 
      ? `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri,
        grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!response.ok) {
      throw new Error(`Teams OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Teams OAuth authentication failed: ${data.error_description}`);
    }
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateAppToken(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, tenant_id } = credentials.data;
    
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id,
        client_secret,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!response.ok) {
      throw new Error(`Teams app token authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Teams app token authentication failed: ${data.error_description}`);
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = this.getToken(integration);
      
      const response = await fetch(`${this.baseUrl}/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Teams connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Teams data sync', { integrationId: integration.id, syncType });

    try {
      const token = this.getToken(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync teams
      const teams = await this.fetchTeams(token);
      recordsProcessed += teams.length;
      recordsCreated += teams.length; // Simplified for now

      // Sync channels for each team
      for (const team of teams) {
        const channels = await this.fetchChannels(token, team.id);
        recordsProcessed += channels.length;
        recordsCreated += channels.length; // Simplified for now
      }

      // Sync users
      const users = await this.fetchUsers(token);
      recordsProcessed += users.length;
      recordsCreated += users.length; // Simplified for now

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        integrationId: integration.id,
        syncType,
        success: true,
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsDeleted: 0,
        duration,
        startTime,
        endTime,
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error('Teams sync failed', { error, integrationId: integration.id });

      return {
        integrationId: integration.id,
        syncType,
        success: false,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
        endTime,
      };
    }
  }

  async processWebhook(webhook: WebhookPayload): Promise<void> {
    this.logger.info('Processing Teams webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'chatMessage':
        await this.handleChatMessageEvent(webhook.data);
        break;
      case 'channelMessage':
        await this.handleChannelMessageEvent(webhook.data);
        break;
      case 'team':
        await this.handleTeamEvent(webhook.data);
        break;
      case 'channel':
        await this.handleChannelEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Teams webhook event', { event: webhook.event });
    }
  }

  private getToken(integration: Integration): string {
    const credentials = integration.config.credentials;
    return credentials.data.access_token;
  }

  private async fetchTeams(token: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/me/joinedTeams`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch teams: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async fetchChannels(token: string, teamId: string): Promise<TeamsChannel[]> {
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/channels`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async fetchUsers(token: string): Promise<TeamsUser[]> {
    const response = await fetch(`${this.baseUrl}/users?$top=999`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async handleChatMessageEvent(data: any): Promise<void> {
    this.logger.info('Handling chat message event', { 
      chatId: data.resource?.chatId,
      messageId: data.resource?.id,
      from: data.resource?.from?.user?.displayName 
    });
    
    // Process chat message event - analyze content, extract mentions, etc.
  }

  private async handleChannelMessageEvent(data: any): Promise<void> {
    this.logger.info('Handling channel message event', { 
      teamId: data.resource?.teamId,
      channelId: data.resource?.channelId,
      messageId: data.resource?.id 
    });
    
    // Process channel message event - analyze content, trigger workflows, etc.
  }

  private async handleTeamEvent(data: any): Promise<void> {
    this.logger.info('Handling team event', { 
      teamId: data.resource?.id,
      displayName: data.resource?.displayName 
    });
    
    // Process team event - setup integrations, notifications, etc.
  }

  private async handleChannelEvent(data: any): Promise<void> {
    this.logger.info('Handling channel event', { 
      teamId: data.resource?.teamId,
      channelId: data.resource?.id,
      displayName: data.resource?.displayName 
    });
    
    // Process channel event - setup integrations, notifications, etc.
  }

  // Notification methods for intelligent routing

  async sendChannelMessage(integration: Integration, teamId: string, channelId: string, payload: TeamsNotificationPayload): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Teams channel message: ${response.statusText}`);
    }

    const data = await response.json();
    
    this.logger.info('Teams channel message sent successfully', { 
      teamId,
      channelId,
      messageId: data.id 
    });
  }

  async sendChatMessage(integration: Integration, chatId: string, payload: TeamsNotificationPayload): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Teams chat message: ${response.statusText}`);
    }

    const data = await response.json();
    
    this.logger.info('Teams chat message sent successfully', { 
      chatId,
      messageId: data.id 
    });
  }

  async createChat(integration: Integration, userIds: string[], topic?: string): Promise<string> {
    const token = this.getToken(integration);
    
    const members = userIds.map(userId => ({
      '@odata.type': '#microsoft.graph.aadUserConversationMember',
      roles: ['owner'],
      'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${userId}')`,
    }));

    const chatData: any = {
      chatType: userIds.length > 2 ? 'group' : 'oneOnOne',
      members,
    };

    if (topic && userIds.length > 2) {
      chatData.topic = topic;
    }

    const response = await fetch(`${this.baseUrl}/chats`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatData),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Teams chat: ${response.statusText}`);
    }

    const data = await response.json();
    
    this.logger.info('Teams chat created successfully', { 
      chatId: data.id,
      topic: topic || 'Direct chat' 
    });
    
    return data.id;
  }

  async updateMessage(integration: Integration, teamId: string, channelId: string, messageId: string, newContent: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: {
          contentType: 'text',
          content: newContent,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update Teams message: ${response.statusText}`);
    }

    this.logger.info('Teams message updated successfully', { teamId, channelId, messageId });
  }

  async deleteMessage(integration: Integration, teamId: string, channelId: string, messageId: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/channels/${channelId}/messages/${messageId}/softDelete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete Teams message: ${response.statusText}`);
    }

    this.logger.info('Teams message deleted successfully', { teamId, channelId, messageId });
  }

  async addReaction(integration: Integration, teamId: string, channelId: string, messageId: string, emoji: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/teams/${teamId}/channels/${channelId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reactionType: emoji,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add Teams reaction: ${response.statusText}`);
    }

    this.logger.info('Teams reaction added successfully', { teamId, channelId, messageId, emoji });
  }
}