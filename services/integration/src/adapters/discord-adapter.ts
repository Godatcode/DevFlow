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

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  icon_hash?: string;
  splash?: string;
  discovery_splash?: string;
  owner?: boolean;
  owner_id: string;
  permissions?: string;
  region?: string;
  afk_channel_id?: string;
  afk_timeout: number;
  widget_enabled?: boolean;
  widget_channel_id?: string;
  verification_level: number;
  default_message_notifications: number;
  explicit_content_filter: number;
  roles: DiscordRole[];
  emojis: DiscordEmoji[];
  features: string[];
  mfa_level: number;
  application_id?: string;
  system_channel_id?: string;
  system_channel_flags: number;
  rules_channel_id?: string;
  max_presences?: number;
  max_members?: number;
  vanity_url_code?: string;
  description?: string;
  banner?: string;
  premium_tier: number;
  premium_subscription_count?: number;
  preferred_locale: string;
  public_updates_channel_id?: string;
  max_video_channel_users?: number;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  welcome_screen?: any;
  nsfw_level: number;
  stickers?: DiscordSticker[];
  premium_progress_bar_enabled: boolean;
}

export interface DiscordChannel {
  id: string;
  type: number;
  guild_id?: string;
  position?: number;
  permission_overwrites?: any[];
  name?: string;
  topic?: string;
  nsfw?: boolean;
  last_message_id?: string;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  recipients?: DiscordUser[];
  icon?: string;
  owner_id?: string;
  application_id?: string;
  parent_id?: string;
  last_pin_timestamp?: string;
  rtc_region?: string;
  video_quality_mode?: number;
  message_count?: number;
  member_count?: number;
  thread_metadata?: any;
  member?: any;
  default_auto_archive_duration?: number;
  permissions?: string;
  flags?: number;
  total_message_sent?: number;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  bot?: boolean;
  system?: boolean;
  mfa_enabled?: boolean;
  banner?: string;
  accent_color?: number;
  locale?: string;
  verified?: boolean;
  email?: string;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  member?: any;
  content: string;
  timestamp: string;
  edited_timestamp?: string;
  tts: boolean;
  mention_everyone: boolean;
  mentions: DiscordUser[];
  mention_roles: string[];
  mention_channels?: any[];
  attachments: any[];
  embeds: any[];
  reactions?: any[];
  nonce?: string | number;
  pinned: boolean;
  webhook_id?: string;
  type: number;
  activity?: any;
  application?: any;
  application_id?: string;
  message_reference?: any;
  flags?: number;
  referenced_message?: DiscordMessage;
  interaction?: any;
  thread?: DiscordChannel;
  components?: any[];
  sticker_items?: DiscordSticker[];
  stickers?: DiscordSticker[];
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  icon?: string;
  unicode_emoji?: string;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  tags?: any;
}

export interface DiscordEmoji {
  id?: string;
  name?: string;
  roles?: string[];
  user?: DiscordUser;
  require_colons?: boolean;
  managed?: boolean;
  animated?: boolean;
  available?: boolean;
}

export interface DiscordSticker {
  id: string;
  pack_id?: string;
  name: string;
  description?: string;
  tags: string;
  asset?: string;
  type: number;
  format_type: number;
  available?: boolean;
  guild_id?: string;
  user?: DiscordUser;
  sort_value?: number;
}

export interface DiscordNotificationPayload {
  content?: string;
  tts?: boolean;
  embeds?: any[];
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
    users?: string[];
    replied_user?: boolean;
  };
  message_reference?: {
    message_id: string;
    channel_id?: string;
    guild_id?: string;
    fail_if_not_exists?: boolean;
  };
  components?: any[];
  sticker_ids?: string[];
  attachments?: any[];
  flags?: number;
}

export class DiscordAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.DISCORD;
  private readonly logger = new Logger('DiscordAdapter');
  private readonly baseUrl = 'https://discord.com/api/v10';

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Discord');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateBotToken(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch(`${this.baseUrl}/oauth2/token`, {
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
      }),
    });

    if (!response.ok) {
      throw new Error(`Discord OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Discord OAuth authentication failed: ${data.error_description}`);
    }
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateBotToken(credentials: Credentials): Promise<AuthToken> {
    const { bot_token } = credentials.data;
    
    // Validate bot token by making a test request
    const response = await fetch(`${this.baseUrl}/users/@me`, {
      headers: {
        'Authorization': `Bot ${bot_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Discord bot token authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.bot) {
      throw new Error('Discord token is not a bot token');
    }

    return {
      accessToken: bot_token,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for bot tokens
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = this.getToken(integration);
      
      const response = await fetch(`${this.baseUrl}/users/@me`, {
        headers: {
          'Authorization': `Bot ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Discord connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Discord data sync', { integrationId: integration.id, syncType });

    try {
      const token = this.getToken(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync guilds
      const guilds = await this.fetchGuilds(token);
      recordsProcessed += guilds.length;
      recordsCreated += guilds.length; // Simplified for now

      // Sync channels for each guild
      for (const guild of guilds) {
        const channels = await this.fetchChannels(token, guild.id);
        recordsProcessed += channels.length;
        recordsCreated += channels.length; // Simplified for now
      }

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

      this.logger.error('Discord sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Discord webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'MESSAGE_CREATE':
        await this.handleMessageCreateEvent(webhook.data);
        break;
      case 'MESSAGE_UPDATE':
        await this.handleMessageUpdateEvent(webhook.data);
        break;
      case 'MESSAGE_DELETE':
        await this.handleMessageDeleteEvent(webhook.data);
        break;
      case 'GUILD_CREATE':
        await this.handleGuildCreateEvent(webhook.data);
        break;
      case 'CHANNEL_CREATE':
        await this.handleChannelCreateEvent(webhook.data);
        break;
      case 'GUILD_MEMBER_ADD':
        await this.handleGuildMemberAddEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Discord webhook event', { event: webhook.event });
    }
  }

  private getToken(integration: Integration): string {
    const credentials = integration.config.credentials;
    return credentials.data.bot_token || credentials.data.access_token;
  }

  private async fetchGuilds(token: string): Promise<DiscordGuild[]> {
    const response = await fetch(`${this.baseUrl}/users/@me/guilds`, {
      headers: {
        'Authorization': `Bot ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch guilds: ${response.statusText}`);
    }

    return response.json();
  }

  private async fetchChannels(token: string, guildId: string): Promise<DiscordChannel[]> {
    const response = await fetch(`${this.baseUrl}/guilds/${guildId}/channels`, {
      headers: {
        'Authorization': `Bot ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch channels: ${response.statusText}`);
    }

    return response.json();
  }

  private async handleMessageCreateEvent(data: any): Promise<void> {
    this.logger.info('Handling message create event', { 
      channelId: data.channel_id,
      authorId: data.author?.id,
      content: data.content?.substring(0, 50) 
    });
    
    // Process message create event - analyze content, extract mentions, etc.
  }

  private async handleMessageUpdateEvent(data: any): Promise<void> {
    this.logger.info('Handling message update event', { 
      channelId: data.channel_id,
      messageId: data.id,
      authorId: data.author?.id 
    });
    
    // Process message update event - track edits, etc.
  }

  private async handleMessageDeleteEvent(data: any): Promise<void> {
    this.logger.info('Handling message delete event', { 
      channelId: data.channel_id,
      messageId: data.id 
    });
    
    // Process message delete event - cleanup references, etc.
  }

  private async handleGuildCreateEvent(data: any): Promise<void> {
    this.logger.info('Handling guild create event', { 
      guildId: data.id,
      name: data.name 
    });
    
    // Process guild create event - setup integrations, etc.
  }

  private async handleChannelCreateEvent(data: any): Promise<void> {
    this.logger.info('Handling channel create event', { 
      channelId: data.id,
      name: data.name,
      guildId: data.guild_id 
    });
    
    // Process channel create event - setup notifications, etc.
  }

  private async handleGuildMemberAddEvent(data: any): Promise<void> {
    this.logger.info('Handling guild member add event', { 
      guildId: data.guild_id,
      userId: data.user?.id 
    });
    
    // Process member add event - send welcome messages, etc.
  }

  // Notification methods for intelligent routing

  async sendMessage(integration: Integration, channelId: string, payload: DiscordNotificationPayload): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send Discord message: ${response.statusText}`);
    }

    const data = await response.json();
    
    this.logger.info('Discord message sent successfully', { 
      channelId,
      messageId: data.id 
    });
  }

  async sendDirectMessage(integration: Integration, userId: string, content: string): Promise<void> {
    const token = this.getToken(integration);
    
    // First, create a DM channel
    const dmResponse = await fetch(`${this.baseUrl}/users/@me/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: userId,
      }),
    });

    if (!dmResponse.ok) {
      throw new Error(`Failed to create DM channel: ${dmResponse.statusText}`);
    }

    const dmData = await dmResponse.json();
    
    // Then send the message
    await this.sendMessage(integration, dmData.id, { content });
  }

  async updateMessage(integration: Integration, channelId: string, messageId: string, payload: DiscordNotificationPayload): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/channels/${channelId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to update Discord message: ${response.statusText}`);
    }

    this.logger.info('Discord message updated successfully', { channelId, messageId });
  }

  async deleteMessage(integration: Integration, channelId: string, messageId: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete Discord message: ${response.statusText}`);
    }

    this.logger.info('Discord message deleted successfully', { channelId, messageId });
  }

  async addReaction(integration: Integration, channelId: string, messageId: string, emoji: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to add Discord reaction: ${response.statusText}`);
    }

    this.logger.info('Discord reaction added successfully', { channelId, messageId, emoji });
  }

  async removeReaction(integration: Integration, channelId: string, messageId: string, emoji: string, userId?: string): Promise<void> {
    const token = this.getToken(integration);
    const userPath = userId ? `/${userId}` : '/@me';
    
    const response = await fetch(`${this.baseUrl}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}${userPath}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to remove Discord reaction: ${response.statusText}`);
    }

    this.logger.info('Discord reaction removed successfully', { channelId, messageId, emoji, userId });
  }
}