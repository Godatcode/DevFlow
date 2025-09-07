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

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description: string;
  projectTypeKey: string;
  lead: JiraUser;
  components: JiraComponent[];
  versions: JiraVersion[];
  issueTypes: JiraIssueType[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string;
    status: JiraStatus;
    priority: JiraPriority;
    issuetype: JiraIssueType;
    assignee: JiraUser;
    reporter: JiraUser;
    created: string;
    updated: string;
    resolutiondate?: string;
    project: JiraProject;
    components: JiraComponent[];
    fixVersions: JiraVersion[];
    labels: string[];
    timetracking: {
      originalEstimate?: string;
      remainingEstimate?: string;
      timeSpent?: string;
    };
  };
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrls: {
    '48x48': string;
    '24x24': string;
    '16x16': string;
    '32x32': string;
  };
}

export interface JiraStatus {
  id: string;
  name: string;
  statusCategory: {
    id: number;
    key: string;
    colorName: string;
    name: string;
  };
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  subtask: boolean;
}

export interface JiraComponent {
  id: string;
  name: string;
  description: string;
  lead?: JiraUser;
}

export interface JiraVersion {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  released: boolean;
  releaseDate?: string;
}

export class JiraAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.JIRA;
  private readonly logger = new Logger('JiraAdapter');
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || 'https://your-domain.atlassian.net';
  }

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Jira');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateApiToken(credentials);
    } else if (credentials.type === AuthType.BASIC_AUTH) {
      return this.authenticateBasicAuth(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        code,
        redirect_uri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jira OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateApiToken(credentials: Credentials): Promise<AuthToken> {
    const { email, token } = credentials.data;
    
    // Validate token by making a test request
    const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Jira API token authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: Buffer.from(`${email}:${token}`).toString('base64'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for API tokens
    };
  }

  private async authenticateBasicAuth(credentials: Credentials): Promise<AuthToken> {
    const { username, password } = credentials.data;
    
    // Validate credentials by making a test request
    const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Jira basic auth authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const authHeader = this.getAuthHeader(integration);
      
      const response = await fetch(`${this.baseUrl}/rest/api/3/myself`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Jira connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Jira data sync', { integrationId: integration.id, syncType });

    try {
      const authHeader = this.getAuthHeader(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync projects
      const projects = await this.fetchProjects(authHeader);
      recordsProcessed += projects.length;
      recordsCreated += projects.length; // Simplified for now

      // Sync issues for each project
      for (const project of projects) {
        const issues = await this.fetchIssues(authHeader, project.key);
        recordsProcessed += issues.length;
        recordsCreated += issues.length; // Simplified for now
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

      this.logger.error('Jira sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Jira webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'jira:issue_created':
        await this.handleIssueCreatedEvent(webhook.data);
        break;
      case 'jira:issue_updated':
        await this.handleIssueUpdatedEvent(webhook.data);
        break;
      case 'jira:issue_deleted':
        await this.handleIssueDeletedEvent(webhook.data);
        break;
      case 'project_created':
        await this.handleProjectCreatedEvent(webhook.data);
        break;
      case 'project_updated':
        await this.handleProjectUpdatedEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Jira webhook event', { event: webhook.event });
    }
  }

  private getAuthHeader(integration: Integration): string {
    const credentials = integration.config.credentials;
    
    if (credentials.type === AuthType.OAUTH2) {
      const token = credentials.data.access_token;
      return `Bearer ${token}`;
    } else if (credentials.type === AuthType.API_KEY || credentials.type === AuthType.BASIC_AUTH) {
      return `Basic ${credentials.data.token || integration.config.credentials.data.access_token}`;
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async fetchProjects(authHeader: string): Promise<JiraProject[]> {
    const response = await fetch(`${this.baseUrl}/rest/api/3/project`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    return response.json();
  }

  private async fetchIssues(authHeader: string, projectKey: string): Promise<JiraIssue[]> {
    const jql = `project = ${projectKey} ORDER BY created DESC`;
    const response = await fetch(`${this.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch issues: ${response.statusText}`);
    }

    const data = await response.json();
    return data.issues || [];
  }

  private async handleIssueCreatedEvent(data: any): Promise<void> {
    this.logger.info('Handling issue created event', { 
      issueKey: data.issue?.key,
      project: data.issue?.fields?.project?.key 
    });
    
    // Process issue created event - trigger workflows, update metrics, etc.
  }

  private async handleIssueUpdatedEvent(data: any): Promise<void> {
    this.logger.info('Handling issue updated event', { 
      issueKey: data.issue?.key,
      changelogItems: data.changelog?.items?.length 
    });
    
    // Process issue updated event - track status changes, assignments, etc.
  }

  private async handleIssueDeletedEvent(data: any): Promise<void> {
    this.logger.info('Handling issue deleted event', { 
      issueKey: data.issue?.key 
    });
    
    // Process issue deleted event - clean up references, update metrics, etc.
  }

  private async handleProjectCreatedEvent(data: any): Promise<void> {
    this.logger.info('Handling project created event', { 
      projectKey: data.project?.key 
    });
    
    // Process project created event - setup integrations, workflows, etc.
  }

  private async handleProjectUpdatedEvent(data: any): Promise<void> {
    this.logger.info('Handling project updated event', { 
      projectKey: data.project?.key 
    });
    
    // Process project updated event - update configurations, etc.
  }

  // Additional utility methods for bidirectional sync

  async createIssue(integration: Integration, issueData: Partial<JiraIssue>): Promise<JiraIssue> {
    const authHeader = this.getAuthHeader(integration);
    
    const response = await fetch(`${this.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: issueData.fields,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    const createdIssue = await response.json();
    this.logger.info('Issue created successfully', { issueKey: createdIssue.key });
    
    return createdIssue;
  }

  async updateIssue(integration: Integration, issueKey: string, updateData: Partial<JiraIssue>): Promise<void> {
    const authHeader = this.getAuthHeader(integration);
    
    const response = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: updateData.fields,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update issue: ${response.statusText}`);
    }

    this.logger.info('Issue updated successfully', { issueKey });
  }

  async transitionIssue(integration: Integration, issueKey: string, transitionId: string): Promise<void> {
    const authHeader = this.getAuthHeader(integration);
    
    const response = await fetch(`${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transition: {
          id: transitionId,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to transition issue: ${response.statusText}`);
    }

    this.logger.info('Issue transitioned successfully', { issueKey, transitionId });
  }
}