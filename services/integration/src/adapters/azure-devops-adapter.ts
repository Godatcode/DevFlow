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

export interface AzureDevOpsProject {
  id: string;
  name: string;
  description: string;
  url: string;
  state: 'deleting' | 'new' | 'wellFormed' | 'createPending' | 'unchanged' | 'deleted';
  revision: number;
  visibility: 'private' | 'public';
  lastUpdateTime: string;
}

export interface AzureDevOpsWorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Id': number;
    'System.WorkItemType': string;
    'System.State': string;
    'System.Reason': string;
    'System.AssignedTo'?: AzureDevOpsUser;
    'System.CreatedBy': AzureDevOpsUser;
    'System.CreatedDate': string;
    'System.ChangedDate': string;
    'System.Title': string;
    'System.Description'?: string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'Microsoft.VSTS.Scheduling.Effort'?: number;
    'System.Tags'?: string;
    'System.AreaPath': string;
    'System.IterationPath': string;
  };
  relations?: AzureDevOpsWorkItemRelation[];
  url: string;
}

export interface AzureDevOpsUser {
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl: string;
  descriptor: string;
}

export interface AzureDevOpsWorkItemRelation {
  rel: string;
  url: string;
  attributes?: {
    isLocked?: boolean;
    name?: string;
  };
}

export interface AzureDevOpsIteration {
  id: string;
  name: string;
  path: string;
  attributes: {
    startDate?: string;
    finishDate?: string;
    timeFrame: 'past' | 'current' | 'future';
  };
  url: string;
}

export interface AzureDevOpsArea {
  id: number;
  name: string;
  path: string;
  hasChildren: boolean;
  children?: AzureDevOpsArea[];
  url: string;
}

export class AzureDevOpsAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.AZURE_DEVOPS;
  private readonly logger = new Logger('AzureDevOpsAdapter');
  private readonly baseUrl: string;

  constructor(organization?: string) {
    this.baseUrl = organization 
      ? `https://dev.azure.com/${organization}`
      : 'https://dev.azure.com';
  }

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Azure DevOps');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticatePersonalAccessToken(credentials);
    } else if (credentials.type === AuthType.BASIC_AUTH) {
      return this.authenticateBasicAuth(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch('https://app.vssps.visualstudio.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: client_secret,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: code,
        redirect_uri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure DevOps OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticatePersonalAccessToken(credentials: Credentials): Promise<AuthToken> {
    const { pat } = credentials.data;
    
    // Validate PAT by making a test request
    const response = await fetch(`${this.baseUrl}/_apis/profile/profiles/me?api-version=6.0`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Azure DevOps PAT authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: Buffer.from(`:${pat}`).toString('base64'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for PATs
    };
  }

  private async authenticateBasicAuth(credentials: Credentials): Promise<AuthToken> {
    const { username, password } = credentials.data;
    
    // Validate credentials by making a test request
    const response = await fetch(`${this.baseUrl}/_apis/profile/profiles/me?api-version=6.0`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Azure DevOps basic auth authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const authHeader = this.getAuthHeader(integration);
      
      const response = await fetch(`${this.baseUrl}/_apis/profile/profiles/me?api-version=6.0`, {
        headers: {
          'Authorization': authHeader,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Azure DevOps connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Azure DevOps data sync', { integrationId: integration.id, syncType });

    try {
      const authHeader = this.getAuthHeader(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync projects
      const projects = await this.fetchProjects(authHeader);
      recordsProcessed += projects.length;
      recordsCreated += projects.length; // Simplified for now

      // Sync work items for each project
      for (const project of projects) {
        const workItems = await this.fetchWorkItems(authHeader, project.name);
        recordsProcessed += workItems.length;
        recordsCreated += workItems.length; // Simplified for now
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

      this.logger.error('Azure DevOps sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Azure DevOps webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'workitem.created':
        await this.handleWorkItemCreatedEvent(webhook.data);
        break;
      case 'workitem.updated':
        await this.handleWorkItemUpdatedEvent(webhook.data);
        break;
      case 'workitem.deleted':
        await this.handleWorkItemDeletedEvent(webhook.data);
        break;
      case 'git.push':
        await this.handleGitPushEvent(webhook.data);
        break;
      case 'git.pullrequest.created':
      case 'git.pullrequest.updated':
        await this.handlePullRequestEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Azure DevOps webhook event', { event: webhook.event });
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

  private async fetchProjects(authHeader: string): Promise<AzureDevOpsProject[]> {
    const response = await fetch(`${this.baseUrl}/_apis/projects?api-version=6.0`, {
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async fetchWorkItems(authHeader: string, projectName: string): Promise<AzureDevOpsWorkItem[]> {
    // First, get work item IDs using WIQL
    const wiqlQuery = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' ORDER BY [System.CreatedDate] DESC`
    };

    const wiqlResponse = await fetch(`${this.baseUrl}/${projectName}/_apis/wit/wiql?api-version=6.0`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(wiqlQuery),
    });

    if (!wiqlResponse.ok) {
      throw new Error(`Failed to fetch work item IDs: ${wiqlResponse.statusText}`);
    }

    const wiqlData = await wiqlResponse.json();
    const workItemIds = wiqlData.workItems?.map((wi: any) => wi.id) || [];

    if (workItemIds.length === 0) {
      return [];
    }

    // Then fetch work item details
    const idsParam = workItemIds.slice(0, 200).join(','); // Limit to 200 items
    const response = await fetch(`${this.baseUrl}/_apis/wit/workitems?ids=${idsParam}&api-version=6.0&$expand=relations`, {
      headers: {
        'Authorization': authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch work items: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async handleWorkItemCreatedEvent(data: any): Promise<void> {
    this.logger.info('Handling work item created event', { 
      workItemId: data.resource?.id,
      workItemType: data.resource?.fields?.['System.WorkItemType'],
      project: data.resource?.fields?.['System.TeamProject'] 
    });
    
    // Process work item created event - trigger workflows, update metrics, etc.
  }

  private async handleWorkItemUpdatedEvent(data: any): Promise<void> {
    this.logger.info('Handling work item updated event', { 
      workItemId: data.resource?.id,
      revision: data.resource?.rev,
      changedFields: Object.keys(data.resource?.fields || {}).length 
    });
    
    // Process work item updated event - track status changes, assignments, etc.
  }

  private async handleWorkItemDeletedEvent(data: any): Promise<void> {
    this.logger.info('Handling work item deleted event', { 
      workItemId: data.resource?.id 
    });
    
    // Process work item deleted event - clean up references, update metrics, etc.
  }

  private async handleGitPushEvent(data: any): Promise<void> {
    this.logger.info('Handling git push event', { 
      repository: data.resource?.repository?.name,
      refName: data.resource?.refName,
      commits: data.resource?.commits?.length 
    });
    
    // Process git push event - trigger workflows, update metrics, etc.
  }

  private async handlePullRequestEvent(data: any): Promise<void> {
    this.logger.info('Handling pull request event', { 
      pullRequestId: data.resource?.pullRequestId,
      status: data.resource?.status,
      repository: data.resource?.repository?.name 
    });
    
    // Process pull request event - trigger reviews, update status, etc.
  }

  // Additional utility methods for bidirectional sync

  async createWorkItem(integration: Integration, workItemData: Partial<AzureDevOpsWorkItem>, projectName: string): Promise<AzureDevOpsWorkItem> {
    const authHeader = this.getAuthHeader(integration);
    
    const patchDocument = [
      {
        op: 'add',
        path: '/fields/System.Title',
        value: workItemData.fields?.['System.Title'],
      },
      {
        op: 'add',
        path: '/fields/System.WorkItemType',
        value: workItemData.fields?.['System.WorkItemType'],
      },
    ];

    if (workItemData.fields?.['System.Description']) {
      patchDocument.push({
        op: 'add',
        path: '/fields/System.Description',
        value: workItemData.fields['System.Description'],
      });
    }

    const response = await fetch(`${this.baseUrl}/${projectName}/_apis/wit/workitems/$${workItemData.fields?.['System.WorkItemType']}?api-version=6.0`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patchDocument),
    });

    if (!response.ok) {
      throw new Error(`Failed to create work item: ${response.statusText}`);
    }

    const createdWorkItem = await response.json();
    this.logger.info('Work item created successfully', { workItemId: createdWorkItem.id });
    
    return createdWorkItem;
  }

  async updateWorkItem(integration: Integration, workItemId: number, updateData: Partial<AzureDevOpsWorkItem>): Promise<void> {
    const authHeader = this.getAuthHeader(integration);
    
    const patchDocument = [];
    
    if (updateData.fields?.['System.Title']) {
      patchDocument.push({
        op: 'replace',
        path: '/fields/System.Title',
        value: updateData.fields['System.Title'],
      });
    }

    if (updateData.fields?.['System.State']) {
      patchDocument.push({
        op: 'replace',
        path: '/fields/System.State',
        value: updateData.fields['System.State'],
      });
    }

    if (updateData.fields?.['System.AssignedTo']) {
      patchDocument.push({
        op: 'replace',
        path: '/fields/System.AssignedTo',
        value: updateData.fields['System.AssignedTo'],
      });
    }

    const response = await fetch(`${this.baseUrl}/_apis/wit/workitems/${workItemId}?api-version=6.0`, {
      method: 'PATCH',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(patchDocument),
    });

    if (!response.ok) {
      throw new Error(`Failed to update work item: ${response.statusText}`);
    }

    this.logger.info('Work item updated successfully', { workItemId });
  }
}