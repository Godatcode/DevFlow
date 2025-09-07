import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearAdapter } from '../adapters/linear-adapter';
import {
  IntegrationProvider,
  Integration,
  Credentials,
  AuthType,
  SyncType,
  WebhookPayload
} from '@devflow/shared-types';

// Mock fetch globally
global.fetch = vi.fn();

describe('LinearAdapter', () => {
  let adapter: LinearAdapter;
  let mockIntegration: Integration;

  beforeEach(() => {
    adapter = new LinearAdapter();
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test Linear Integration',
      provider: IntegrationProvider.LINEAR,
      type: 'project_management' as any,
      config: {
        apiUrl: 'https://api.linear.app/graphql',
        credentials: {
          type: AuthType.API_KEY,
          data: { api_key: 'test-api-key' },
        },
        settings: {},
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
      },
      syncSchedule: {
        enabled: true,
        frequency: '0 */6 * * *',
      },
      projectIds: [],
      teamIds: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate with OAuth2', async () => {
      const credentials: Credentials = {
        type: AuthType.OAUTH2,
        data: {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          code: 'test-code',
          redirect_uri: 'http://localhost:3000/callback',
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
          scope: 'read write',
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.scope).toEqual(['read', 'write']);
    });

    it('should authenticate with API key', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { api_key: 'test-api-key' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            viewer: {
              id: 'test-user-id',
              name: 'Test User',
              email: 'test@example.com',
            },
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-api-key');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            viewer: { id: 'test-user-id' },
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { viewer: null },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(false);
    });
  });

  describe('syncData', () => {
    it('should successfully sync teams, issues, and projects', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Engineering',
          key: 'ENG',
          organization: { id: 'org-1', name: 'Test Org' },
          members: { nodes: [] },
        },
      ];

      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-1',
          title: 'Test Issue',
          state: { name: 'Todo', type: 'backlog' },
          team: { id: 'team-1', name: 'Engineering' },
          createdAt: '2023-01-01T00:00:00.000Z',
        },
      ];

      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project',
          state: 'started',
          progress: 0.5,
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: { teams: { nodes: mockTeams } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: { issues: { nodes: mockIssues } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({
            data: { projects: { nodes: mockProjects } },
          }),
        });

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(3); // 1 team + 1 issue + 1 project
      expect(result.recordsCreated).toBe(3);
    });

    it('should handle sync errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('GraphQL Error'));

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(false);
      expect(result.error).toBe('GraphQL Error');
    });
  });

  describe('processWebhook', () => {
    it('should process issue webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'Issue',
        data: {
          action: 'create',
          data: {
            id: 'issue-1',
            identifier: 'ENG-1',
            title: 'New Issue',
          },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process project webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'Project',
        data: {
          action: 'update',
          data: {
            id: 'project-1',
            name: 'Updated Project',
          },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });
  });

  describe('bidirectional sync methods', () => {
    it('should create issue successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'issue-2',
                identifier: 'ENG-2',
                title: 'New Issue',
                url: 'https://linear.app/test/issue/ENG-2',
              },
            },
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const issueData = {
        title: 'New Issue',
        description: 'New issue description',
        team: { id: 'team-1' },
        priority: 2,
      };

      const result = await adapter.createIssue(mockIntegration, issueData as any);

      expect(result.identifier).toBe('ENG-2');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should update issue successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            issueUpdate: {
              success: true,
            },
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const updateData = {
        title: 'Updated Issue',
        state: { id: 'state-1' },
        priority: 1,
      };

      await adapter.updateIssue(mockIntegration, 'issue-1', updateData as any);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should create project successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: {
            projectCreate: {
              success: true,
              project: {
                id: 'project-2',
                name: 'New Project',
                state: 'planned',
              },
            },
          },
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const projectData = {
        name: 'New Project',
        description: 'New project description',
        teams: [{ id: 'team-1' }],
      };

      const result = await adapter.createProject(mockIntegration, projectData as any);

      expect(result.name).toBe('New Project');
    });
  });

  describe('provider property', () => {
    it('should return correct provider', () => {
      expect(adapter.provider).toBe(IntegrationProvider.LINEAR);
    });
  });
});