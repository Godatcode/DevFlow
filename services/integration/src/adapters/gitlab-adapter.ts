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

export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  default_branch: string;
  web_url: string;
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  created_at: string;
  last_activity_at: string;
  visibility: 'private' | 'internal' | 'public';
  topics: string[];
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: 'opened' | 'closed' | 'merged';
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  source_branch: string;
  target_branch: string;
  web_url: string;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
  web_url: string;
}

export class GitLabAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.GITLAB;
  private readonly logger = new Logger('GitLabAdapter');
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://gitlab.com/api/v4') {
    this.baseUrl = baseUrl;
  }

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with GitLab');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateToken(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch(`${this.baseUrl.replace('/api/v4', '')}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id,
        client_secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitLab OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateToken(credentials: Credentials): Promise<AuthToken> {
    const { token } = credentials.data;
    
    // Validate token by making a test request
    const response = await fetch(`${this.baseUrl}/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`GitLab token authentication failed: ${response.statusText}`);
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
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('GitLab connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting GitLab data sync', { integrationId: integration.id, syncType });

    try {
      const token = integration.config.credentials.data.token || 
                   integration.config.credentials.data.access_token;
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync projects
      const projects = await this.fetchProjects(token, integration.config.settings.groupId);
      recordsProcessed += projects.length;
      recordsCreated += projects.length; // Simplified for now

      // Sync merge requests for each project
      for (const project of projects) {
        const mergeRequests = await this.fetchMergeRequests(token, project.id);
        recordsProcessed += mergeRequests.length;
        recordsCreated += mergeRequests.length; // Simplified for now
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

      this.logger.error('GitLab sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing GitLab webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'Push Hook':
        await this.handlePushEvent(webhook.data);
        break;
      case 'Merge Request Hook':
        await this.handleMergeRequestEvent(webhook.data);
        break;
      case 'Project Hook':
        await this.handleProjectEvent(webhook.data);
        break;
      case 'Issue Hook':
        await this.handleIssueEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled GitLab webhook event', { event: webhook.event });
    }
  }

  private async fetchProjects(token: string, groupId?: string): Promise<GitLabProject[]> {
    const url = groupId 
      ? `${this.baseUrl}/groups/${groupId}/projects`
      : `${this.baseUrl}/projects?membership=true`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    return response.json();
  }

  private async fetchMergeRequests(token: string, projectId: number): Promise<GitLabMergeRequest[]> {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/merge_requests?state=all`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch merge requests: ${response.statusText}`);
    }

    return response.json();
  }

  private async handlePushEvent(data: any): Promise<void> {
    this.logger.info('Handling push event', { 
      project: data.project?.path_with_namespace,
      ref: data.ref,
      commits: data.commits?.length 
    });
    
    // Process push event - trigger workflows, update metrics, etc.
  }

  private async handleMergeRequestEvent(data: any): Promise<void> {
    this.logger.info('Handling merge request event', { 
      action: data.object_attributes?.action,
      project: data.project?.path_with_namespace,
      iid: data.object_attributes?.iid 
    });
    
    // Process MR event - trigger reviews, update status, etc.
  }

  private async handleProjectEvent(data: any): Promise<void> {
    this.logger.info('Handling project event', { 
      action: data.event_name,
      project: data.path_with_namespace 
    });
    
    // Process project event - update project settings, etc.
  }

  private async handleIssueEvent(data: any): Promise<void> {
    this.logger.info('Handling issue event', { 
      action: data.object_attributes?.action,
      project: data.project?.path_with_namespace,
      iid: data.object_attributes?.iid 
    });
    
    // Process issue event - update project tracking, etc.
  }
}