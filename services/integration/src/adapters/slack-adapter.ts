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

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  created: number;
  is_archived: boolean;
  is_general: boolean;
  unlinked: number;
  name_normalized: string;
  is_shared: boolean;
  is_org_shared: boolean;
  is_member: boolean;
  is_pending_ext_shared: boolean;
  pending_shared: string[];
  context_team_id: string;
  updated: number;
  parent_conversation?: string;
  creator: string;
  is_ext_shared: boolean;
  shared_team_ids: string[];
  pending_connected_team_ids: string[];
  is_pending_ext_shared_with_disconnected_team: boolean;
  topic: {
    value: string;
    creator: string;
    last_set: number;
  };
  purpose: {
    value: string;
    creator: string;
    last_set: number;
  };
  num_members?: number;
}

export interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  deleted: boolean;
  color: string;
  real_name: string;
  tz: string;
  tz_label: string;
  tz_offset: number;
  profile: {
    title: string;
    phone: string;
    skype: string;
    real_name: string;
    real_name_normalized: string;
    display_name: string;
    display_name_normalized: string;
    fields: Record<string, any>;
    status_text: string;
    status_emoji: string;
    status_expiration: number;
    avatar_hash: string;
    image_original?: string;
    is_custom_image?: boolean;
    email?: string;
    first_name: string;
    last_name: string;
    image_24: string;
    image_32: string;
    image_48: string;
    image_72: string;
    image_192: string;
    image_512: string;
    image_1024?: string;
    status_text_canonical: string;
    team: string;
  };
  is_admin: boolean;
  is_owner: boolean;
  is_primary_owner: boolean;
  is_restricted: boolean;
  is_ultra_restricted: boolean;
  is_bot: boolean;
  is_app_user: boolean;
  updated: number;
  is_email_confirmed: boolean;
  who_can_share_contact_card: string;
}

export interface SlackMessage {
  type: string;
  subtype?: string;
  text: string;
  user: string;
  ts: string;
  team?: string;
  user_team?: string;
  source_team?: string;
  user_profile?: {
    avatar_hash: string;
    image_72: string;
    first_name: string;
    real_name: string;
    display_name: string;
    team: string;
    name: string;
    is_restricted: boolean;
    is_ultra_restricted: boolean;
  };
  blocks?: any[];
  reactions?: Array<{
    name: string;
    users: string[];
    count: number;
  }>;
  reply_count?: number;
  reply_users_count?: number;
  latest_reply?: string;
  reply_users?: string[];
  is_locked?: boolean;
  subscribed?: boolean;
  last_read?: string;
}

export interface SlackNotificationPayload {
  channel: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  thread_ts?: string;
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  username?: string;
  as_user?: boolean;
  icon_url?: string;
  icon_emoji?: string;
  link_names?: boolean;
  parse?: 'full' | 'none';
}

export class SlackAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.SLACK;
  private readonly logger = new Logger('SlackAdapter');
  private readonly baseUrl = 'https://slack.com/api';

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Slack');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateBotToken(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch(`${this.baseUrl}/oauth.v2.access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack OAuth authentication failed: ${data.error}`);
    }
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 43200) * 1000), // Default 12 hours
      scope: data.scope?.split(',') || [],
    };
  }

  private async authenticateBotToken(credentials: Credentials): Promise<AuthToken> {
    const { bot_token } = credentials.data;
    
    // Validate bot token by making a test request
    const response = await fetch(`${this.baseUrl}/auth.test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bot_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      throw new Error(`Slack bot token authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Slack bot token authentication failed: ${data.error}`);
    }

    return {
      accessToken: bot_token,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for bot tokens
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = this.getToken(integration);
      
      const response = await fetch(`${this.baseUrl}/auth.test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.ok;
    } catch (error) {
      this.logger.error('Slack connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Slack data sync', { integrationId: integration.id, syncType });

    try {
      const token = this.getToken(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync channels
      const channels = await this.fetchChannels(token);
      recordsProcessed += channels.length;
      recordsCreated += channels.length; // Simplified for now

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

      this.logger.error('Slack sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Slack webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'message':
        await this.handleMessageEvent(webhook.data);
        break;
      case 'channel_created':
        await this.handleChannelCreatedEvent(webhook.data);
        break;
      case 'channel_deleted':
        await this.handleChannelDeletedEvent(webhook.data);
        break;
      case 'member_joined_channel':
        await this.handleMemberJoinedChannelEvent(webhook.data);
        break;
      case 'member_left_channel':
        await this.handleMemberLeftChannelEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Slack webhook event', { event: webhook.event });
    }
  }

  private getToken(integration: Integration): string {
    const credentials = integration.config.credentials;
    return credentials.data.bot_token || credentials.data.access_token;
  }

  private async fetchChannels(token: string): Promise<SlackChannel[]> {
    const response = await fetch(`${this.baseUrl}/conversations.list?types=public_channel,private_channel&limit=1000`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Failed to fetch channels: ${data.error}`);
    }

    return data.channels || [];
  }

  private async fetchUsers(token: string): Promise<SlackUser[]> {
    const response = await fetch(`${this.baseUrl}/users.list?limit=1000`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Failed to fetch users: ${data.error}`);
    }

    return data.members || [];
  }

  private async handleMessageEvent(data: any): Promise<void> {
    this.logger.info('Handling message event', { 
      channel: data.event?.channel,
      user: data.event?.user,
      text: data.event?.text?.substring(0, 50) 
    });
    
    // Process message event - analyze sentiment, extract mentions, etc.
  }

  private async handleChannelCreatedEvent(data: any): Promise<void> {
    this.logger.info('Handling channel created event', { 
      channelId: data.event?.channel?.id,
      channelName: data.event?.channel?.name 
    });
    
    // Process channel created event - setup integrations, notifications, etc.
  }

  private async handleChannelDeletedEvent(data: any): Promise<void> {
    this.logger.info('Handling channel deleted event', { 
      channelId: data.event?.channel 
    });
    
    // Process channel deleted event - cleanup integrations, etc.
  }

  private async handleMemberJoinedChannelEvent(data: any): Promise<void> {
    this.logger.info('Handling member joined channel event', { 
      channelId: data.event?.channel,
      userId: data.event?.user 
    });
    
    // Process member joined event - send welcome messages, etc.
  }

  private async handleMemberLeftChannelEvent(data: any): Promise<void> {
    this.logger.info('Handling member left channel event', { 
      channelId: data.event?.channel,
      userId: data.event?.user 
    });
    
    // Process member left event - cleanup notifications, etc.
  }

  // Notification methods for intelligent routing

  async sendNotification(integration: Integration, payload: SlackNotificationPayload): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Slack notification: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Failed to send Slack notification: ${data.error}`);
    }

    this.logger.info('Slack notification sent successfully', { 
      channel: payload.channel,
      timestamp: data.ts 
    });
  }

  async sendDirectMessage(integration: Integration, userId: string, message: string): Promise<void> {
    const token = this.getToken(integration);
    
    // First, open a DM channel
    const dmResponse = await fetch(`${this.baseUrl}/conversations.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        users: userId,
      }),
    });

    if (!dmResponse.ok) {
      throw new Error(`Failed to open DM channel: ${dmResponse.statusText}`);
    }

    const dmData = await dmResponse.json();
    
    if (!dmData.ok) {
      throw new Error(`Failed to open DM channel: ${dmData.error}`);
    }

    // Then send the message
    await this.sendNotification(integration, {
      channel: dmData.channel.id,
      text: message,
    });
  }

  async updateMessage(integration: Integration, channel: string, timestamp: string, newText: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/chat.update`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        ts: timestamp,
        text: newText,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update Slack message: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Failed to update Slack message: ${data.error}`);
    }

    this.logger.info('Slack message updated successfully', { channel, timestamp });
  }

  async deleteMessage(integration: Integration, channel: string, timestamp: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/chat.delete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        ts: timestamp,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete Slack message: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Failed to delete Slack message: ${data.error}`);
    }

    this.logger.info('Slack message deleted successfully', { channel, timestamp });
  }

  async addReaction(integration: Integration, channel: string, timestamp: string, emoji: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/reactions.add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        timestamp,
        name: emoji,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add Slack reaction: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`Failed to add Slack reaction: ${data.error}`);
    }

    this.logger.info('Slack reaction added successfully', { channel, timestamp, emoji });
  }
}