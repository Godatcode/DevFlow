import { 
  IntegrationAdapter, 
  WebhookProcessor,
  DataSynchronizer 
} from '../interfaces';
import {
  IntegrationProvider,
  Integration,
  Credentials,
  AuthToken,
  SyncType,
  SyncResult,
  WebhookPayload,
  UUID,
  AuthType
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  language: string;
  topics: string[];
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  head: GitHubBranch;
  base: GitHubBranch;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubBranch {
  ref: string;
  sha: string;
  repo: GitHubRepository;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: GitHubUser;
  html_url: string;
}

export class GitHubAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.GITHUB;
  private readonly logger = new Logger('GitHubAdapter');
  private readonly baseUrl = 'https://api.github.com';

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with GitHub');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateToken(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code } = credentials.data;
    
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id,
        client_secret,
        code,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      scope: data.scope?.split(',') || [],
    };
  }

  private async authenticateToken(credentials: Credentials): Promise<AuthToken> {
    const { token } = credentials.data;
    
    // Validate token by making a test request
    const response = await fetch(`${this.baseUrl}/user`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub token authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: token,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for personal tokens
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = integration.config.credentials.data.token || 
                   integration.config.credentials.data.access_token;
      
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('GitHub connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting GitHub data sync', { integrationId: integration.id, syncType });

    try {
      const token = integration.config.credentials.data.token || 
                   integration.config.credentials.data.access_token;
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync repositories
      const repositories = await this.fetchRepositories(token, integration.config.settings.organization);
      recordsProcessed += repositories.length;
      recordsCreated += repositories.length; // Simplified for now

      // Sync pull requests for each repository
      for (const repo of repositories) {
        const pullRequests = await this.fetchPullRequests(token, repo.full_name);
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

      this.logger.error('GitHub sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing GitHub webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'push':
        await this.handlePushEvent(webhook.data);
        break;
      case 'pull_request':
        await this.handlePullRequestEvent(webhook.data);
        break;
      case 'repository':
        await this.handleRepositoryEvent(webhook.data);
        break;
      case 'issues':
        await this.handleIssuesEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled GitHub webhook event', { event: webhook.event });
    }
  }

  private async fetchRepositories(token: string, organization?: string): Promise<GitHubRepository[]> {
    const url = organization 
      ? `${this.baseUrl}/orgs/${organization}/repos`
      : `${this.baseUrl}/user/repos`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    return response.json();
  }

  private async fetchPullRequests(token: string, repoFullName: string): Promise<GitHubPullRequest[]> {
    const response = await fetch(`${this.baseUrl}/repos/${repoFullName}/pulls?state=all`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pull requests: ${response.statusText}`);
    }

    return response.json();
  }

  private async handlePushEvent(data: any): Promise<void> {
    this.logger.info('Handling push event', { 
      repository: data.repository?.full_name,
      ref: data.ref,
      commits: data.commits?.length 
    });
    
    // Process push event - trigger workflows, update metrics, etc.
    // This would integrate with the orchestration service
  }

  private async handlePullRequestEvent(data: any): Promise<void> {
    this.logger.info('Handling pull request event', { 
      action: data.action,
      repository: data.repository?.full_name,
      number: data.pull_request?.number 
    });
    
    // Process PR event - trigger reviews, update status, etc.
  }

  private async handleRepositoryEvent(data: any): Promise<void> {
    this.logger.info('Handling repository event', { 
      action: data.action,
      repository: data.repository?.full_name 
    });
    
    // Process repository event - update project settings, etc.
  }

  private async handleIssuesEvent(data: any): Promise<void> {
    this.logger.info('Handling issues event', { 
      action: data.action,
      repository: data.repository?.full_name,
      number: data.issue?.number 
    });
    
    // Process issues event - update project tracking, etc.
  }
}