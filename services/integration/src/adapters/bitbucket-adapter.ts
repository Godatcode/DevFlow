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

export interface BitbucketRepository {
  uuid: string;
  name: string;
  full_name: string;
  is_private: boolean;
  html: { href: string };
  clone: { ssh: string; https: string }[];
  mainbranch: { name: string };
  created_on: string;
  updated_on: string;
  language: string;
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  description: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED';
  author: BitbucketUser;
  created_on: string;
  updated_on: string;
  merge_commit?: { hash: string };
  source: BitbucketBranch;
  destination: BitbucketBranch;
}

export interface BitbucketUser {
  uuid: string;
  username: string;
  display_name: string;
  avatar: string;
}

export interface BitbucketBranch {
  name: string;
  commit: { hash: string };
  repository: BitbucketRepository;
}

export class BitbucketAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.BITBUCKET;
  private readonly logger = new Logger('BitbucketAdapter');
  private readonly baseUrl = 'https://api.bitbucket.org/2.0';

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Bitbucket');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.BASIC_AUTH) {
      return this.authenticateAppPassword(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code } = credentials.data;
    
    const response = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      throw new Error(`Bitbucket OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scopes?.split(' ') || [],
    };
  }

  private async authenticateAppPassword(credentials: Credentials): Promise<AuthToken> {
    const { username, password } = credentials.data;
    
    // Validate app password by making a test request
    const response = await fetch(`${this.baseUrl}/user`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Bitbucket app password authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for app passwords
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const authHeader = this.getAuthHeader(integration);
      
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'Authorization': authHeader,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Bitbucket connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Bitbucket data sync', { integrationId: integration.id, syncType });

    try {
      const authHeader = this.getAuthHeader(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync repositories
      const repositories = await this.fetchRepositories(authHeader, integration.config.settings.workspace);
      recordsProcessed += repositories.length;
      recordsCreated += repositories.length; // Simplified for now

      // Sync pull requests for each repository
      for (const repo of repositories) {
        const pullRequests = await this.fetchPullRequests(authHeader, repo.full_name);
        recordsProcessed += pullRequests.length;
        recordsCreated += pullRequests.length; // Simplified for now
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

      this.logger.error('Bitbucket sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Bitbucket webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'repo:push':
        await this.handlePushEvent(webhook.data);
        break;
      case 'pullrequest:created':
      case 'pullrequest:updated':
      case 'pullrequest:approved':
      case 'pullrequest:merged':
        await this.handlePullRequestEvent(webhook.data);
        break;
      case 'repo:created':
      case 'repo:updated':
        await this.handleRepositoryEvent(webhook.data);
        break;
      case 'issue:created':
      case 'issue:updated':
        await this.handleIssueEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Bitbucket webhook event', { event: webhook.event });
    }
  }

  private getAuthHeader(integration: Integration): string {
    const credentials = integration.config.credentials;
    
    if (credentials.type === AuthType.OAUTH2) {
      const token = credentials.data.access_token;
      return `Bearer ${token}`;
    } else if (credentials.type === AuthType.BASIC_AUTH) {
      const { username, password } = credentials.data;
      return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async fetchRepositories(authHeader: string, workspace?: string): Promise<BitbucketRepository[]> {
    const url = workspace 
      ? `${this.baseUrl}/repositories/${workspace}`
      : `${this.baseUrl}/repositories?role=member`;

    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  private async fetchPullRequests(authHeader: string, repoFullName: string): Promise<BitbucketPullRequest[]> {
    const response = await fetch(`${this.baseUrl}/repositories/${repoFullName}/pullrequests?state=OPEN,MERGED,DECLINED`, {
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pull requests: ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  private async handlePushEvent(data: any): Promise<void> {
    this.logger.info('Handling push event', { 
      repository: data.repository?.full_name,
      changes: data.push?.changes?.length 
    });
    
    // Process push event - trigger workflows, update metrics, etc.
  }

  private async handlePullRequestEvent(data: any): Promise<void> {
    this.logger.info('Handling pull request event', { 
      repository: data.repository?.full_name,
      id: data.pullrequest?.id,
      state: data.pullrequest?.state 
    });
    
    // Process PR event - trigger reviews, update status, etc.
  }

  private async handleRepositoryEvent(data: any): Promise<void> {
    this.logger.info('Handling repository event', { 
      repository: data.repository?.full_name 
    });
    
    // Process repository event - update project settings, etc.
  }

  private async handleIssueEvent(data: any): Promise<void> {
    this.logger.info('Handling issue event', { 
      repository: data.repository?.full_name,
      id: data.issue?.id 
    });
    
    // Process issue event - update project tracking, etc.
  }
}