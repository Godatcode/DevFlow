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

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
  organization: LinearOrganization;
  members: LinearUser[];
  projects: LinearProject[];
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: LinearWorkflowState;
  priority: number;
  estimate?: number;
  assignee?: LinearUser;
  creator: LinearUser;
  team: LinearTeam;
  project?: LinearProject;
  labels: LinearIssueLabel[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  dueDate?: string;
  url: string;
}

export interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  isMe: boolean;
  active: boolean;
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  color: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  position: number;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  state: 'backlog' | 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  progress: number;
  startDate?: string;
  targetDate?: string;
  completedAt?: string;
  lead?: LinearUser;
  members: LinearUser[];
  teams: LinearTeam[];
}

export interface LinearIssueLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface LinearOrganization {
  id: string;
  name: string;
  urlKey: string;
  logoUrl?: string;
}

export class LinearAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.LINEAR;
  private readonly logger = new Logger('LinearAdapter');
  private readonly baseUrl = 'https://api.linear.app/graphql';

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Linear');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateApiKey(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        code,
        redirect_uri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Linear OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateApiKey(credentials: Credentials): Promise<AuthToken> {
    const { api_key } = credentials.data;
    
    // Validate API key by making a test request
    const response = await this.makeGraphQLRequest(api_key, `
      query {
        viewer {
          id
          name
          email
        }
      }
    `);

    if (!response.data?.viewer) {
      throw new Error('Linear API key authentication failed');
    }

    return {
      accessToken: api_key,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for API keys
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = this.getToken(integration);
      
      const response = await this.makeGraphQLRequest(token, `
        query {
          viewer {
            id
          }
        }
      `);

      return !!response.data?.viewer;
    } catch (error) {
      this.logger.error('Linear connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Linear data sync', { integrationId: integration.id, syncType });

    try {
      const token = this.getToken(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync teams
      const teams = await this.fetchTeams(token);
      recordsProcessed += teams.length;
      recordsCreated += teams.length; // Simplified for now

      // Sync issues for each team
      for (const team of teams) {
        const issues = await this.fetchIssues(token, team.id);
        recordsProcessed += issues.length;
        recordsCreated += issues.length; // Simplified for now
      }

      // Sync projects
      const projects = await this.fetchProjects(token);
      recordsProcessed += projects.length;
      recordsCreated += projects.length; // Simplified for now

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

      this.logger.error('Linear sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Linear webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'Issue':
        await this.handleIssueEvent(webhook.data);
        break;
      case 'Project':
        await this.handleProjectEvent(webhook.data);
        break;
      case 'Comment':
        await this.handleCommentEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Linear webhook event', { event: webhook.event });
    }
  }

  private getToken(integration: Integration): string {
    const credentials = integration.config.credentials;
    return credentials.data.api_key || credentials.data.access_token;
  }

  private async makeGraphQLRequest(token: string, query: string, variables?: any): Promise<any> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`Linear GraphQL request failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
    }

    return data;
  }

  private async fetchTeams(token: string): Promise<LinearTeam[]> {
    const response = await this.makeGraphQLRequest(token, `
      query {
        teams {
          nodes {
            id
            name
            key
            description
            organization {
              id
              name
              urlKey
            }
            members {
              nodes {
                id
                name
                displayName
                email
                avatarUrl
                isMe
                active
              }
            }
          }
        }
      }
    `);

    return response.data?.teams?.nodes || [];
  }

  private async fetchIssues(token: string, teamId?: string): Promise<LinearIssue[]> {
    const teamFilter = teamId ? `, team: { id: { eq: "${teamId}" } }` : '';
    
    const response = await this.makeGraphQLRequest(token, `
      query {
        issues(filter: { state: { type: { neq: "canceled" } }${teamFilter} }) {
          nodes {
            id
            identifier
            title
            description
            state {
              id
              name
              color
              type
              position
            }
            priority
            estimate
            assignee {
              id
              name
              displayName
              email
              avatarUrl
            }
            creator {
              id
              name
              displayName
              email
              avatarUrl
            }
            team {
              id
              name
              key
            }
            project {
              id
              name
              state
              progress
            }
            labels {
              nodes {
                id
                name
                color
                description
              }
            }
            createdAt
            updatedAt
            completedAt
            dueDate
            url
          }
        }
      }
    `);

    return response.data?.issues?.nodes || [];
  }

  private async fetchProjects(token: string): Promise<LinearProject[]> {
    const response = await this.makeGraphQLRequest(token, `
      query {
        projects {
          nodes {
            id
            name
            description
            state
            progress
            startDate
            targetDate
            completedAt
            lead {
              id
              name
              displayName
              email
            }
            members {
              nodes {
                id
                name
                displayName
                email
              }
            }
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        }
      }
    `);

    return response.data?.projects?.nodes || [];
  }

  private async handleIssueEvent(data: any): Promise<void> {
    this.logger.info('Handling issue event', { 
      action: data.action,
      issueId: data.data?.id,
      identifier: data.data?.identifier 
    });
    
    // Process issue event - trigger workflows, update metrics, etc.
  }

  private async handleProjectEvent(data: any): Promise<void> {
    this.logger.info('Handling project event', { 
      action: data.action,
      projectId: data.data?.id,
      name: data.data?.name 
    });
    
    // Process project event - update project tracking, etc.
  }

  private async handleCommentEvent(data: any): Promise<void> {
    this.logger.info('Handling comment event', { 
      action: data.action,
      commentId: data.data?.id,
      issueId: data.data?.issue?.id 
    });
    
    // Process comment event - update collaboration metrics, etc.
  }

  // Additional utility methods for bidirectional sync

  async createIssue(integration: Integration, issueData: Partial<LinearIssue>): Promise<LinearIssue> {
    const token = this.getToken(integration);
    
    const response = await this.makeGraphQLRequest(token, `
      mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
          }
        }
      }
    `, {
      input: {
        title: issueData.title,
        description: issueData.description,
        teamId: issueData.team?.id,
        assigneeId: issueData.assignee?.id,
        priority: issueData.priority,
        estimate: issueData.estimate,
        projectId: issueData.project?.id,
        labelIds: issueData.labels?.map(label => label.id),
      },
    });

    if (!response.data?.issueCreate?.success) {
      throw new Error('Failed to create Linear issue');
    }

    const createdIssue = response.data.issueCreate.issue;
    this.logger.info('Issue created successfully', { identifier: createdIssue.identifier });
    
    return createdIssue;
  }

  async updateIssue(integration: Integration, issueId: string, updateData: Partial<LinearIssue>): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await this.makeGraphQLRequest(token, `
      mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
        }
      }
    `, {
      id: issueId,
      input: {
        title: updateData.title,
        description: updateData.description,
        assigneeId: updateData.assignee?.id,
        priority: updateData.priority,
        estimate: updateData.estimate,
        stateId: updateData.state?.id,
        projectId: updateData.project?.id,
        labelIds: updateData.labels?.map(label => label.id),
      },
    });

    if (!response.data?.issueUpdate?.success) {
      throw new Error('Failed to update Linear issue');
    }

    this.logger.info('Issue updated successfully', { issueId });
  }

  async createProject(integration: Integration, projectData: Partial<LinearProject>): Promise<LinearProject> {
    const token = this.getToken(integration);
    
    const response = await this.makeGraphQLRequest(token, `
      mutation ProjectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          success
          project {
            id
            name
            state
          }
        }
      }
    `, {
      input: {
        name: projectData.name,
        description: projectData.description,
        leadId: projectData.lead?.id,
        memberIds: projectData.members?.map(member => member.id),
        teamIds: projectData.teams?.map(team => team.id),
        startDate: projectData.startDate,
        targetDate: projectData.targetDate,
      },
    });

    if (!response.data?.projectCreate?.success) {
      throw new Error('Failed to create Linear project');
    }

    const createdProject = response.data.projectCreate.project;
    this.logger.info('Project created successfully', { name: createdProject.name });
    
    return createdProject;
  }
}