import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureDevOpsAdapter } from '../adapters/azure-devops-adapter';
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

describe('AzureDevOpsAdapter', () => {
  let adapter: AzureDevOpsAdapter;
  let mockIntegration: Integration;

  beforeEach(() => {
    adapter = new AzureDevOpsAdapter('test-org');
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test Azure DevOps Integration',
      provider: IntegrationProvider.AZURE_DEVOPS,
      type: 'project_management' as any,
      config: {
        apiUrl: 'https://dev.azure.com/test-org',
        credentials: {
          type: AuthType.API_KEY,
          data: { pat: 'test-pat' },
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
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          scope: 'vso.work_write',
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
    });

    it('should authenticate with Personal Access Token', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { pat: 'test-pat' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'test-user-id' }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe(Buffer.from(':test-pat').toString('base64'));
    });

    it('should authenticate with basic auth', async () => {
      const credentials: Credentials = {
        type: AuthType.BASIC_AUTH,
        data: { username: 'testuser', password: 'testpass' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'test-user-id' }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe(Buffer.from('testuser:testpass').toString('base64'));
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const mockResponse = { ok: true };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      const mockResponse = { ok: false };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(false);
    });
  });

  describe('syncData', () => {
    it('should successfully sync projects and work items', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project',
          description: 'Test project description',
          state: 'wellFormed',
          visibility: 'private',
        },
      ];

      const mockWorkItemIds = {
        workItems: [{ id: 1 }, { id: 2 }],
      };

      const mockWorkItems = [
        {
          id: 1,
          fields: {
            'System.Id': 1,
            'System.WorkItemType': 'Task',
            'System.State': 'New',
            'System.Title': 'Test Work Item 1',
            'System.CreatedDate': '2023-01-01T00:00:00.000Z',
          },
        },
        {
          id: 2,
          fields: {
            'System.Id': 2,
            'System.WorkItemType': 'Bug',
            'System.State': 'Active',
            'System.Title': 'Test Work Item 2',
            'System.CreatedDate': '2023-01-02T00:00:00.000Z',
          },
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ value: mockProjects }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockWorkItemIds),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ value: mockWorkItems }),
        });

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(3); // 1 project + 2 work items
      expect(result.recordsCreated).toBe(3);
    });

    it('should handle sync errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API Error'));

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('processWebhook', () => {
    it('should process work item created webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'workitem.created',
        data: {
          resource: {
            id: 1,
            fields: {
              'System.WorkItemType': 'Task',
              'System.TeamProject': 'Test Project',
              'System.Title': 'New Work Item',
            },
          },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process work item updated webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'workitem.updated',
        data: {
          resource: {
            id: 1,
            rev: 2,
            fields: {
              'System.State': 'Active',
              'System.AssignedTo': { displayName: 'Test User' },
            },
          },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process git push webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'git.push',
        data: {
          resource: {
            repository: { name: 'test-repo' },
            refName: 'refs/heads/main',
            commits: [{ commitId: 'abc123' }],
          },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });
  });

  describe('bidirectional sync methods', () => {
    it('should create work item successfully', async () => {
      const mockCreatedWorkItem = {
        id: 3,
        fields: {
          'System.Id': 3,
          'System.Title': 'New Work Item',
          'System.WorkItemType': 'Task',
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCreatedWorkItem),
      });

      const workItemData = {
        fields: {
          'System.Title': 'New Work Item',
          'System.WorkItemType': 'Task',
          'System.Description': 'New work item description',
        },
      };

      const result = await adapter.createWorkItem(mockIntegration, workItemData as any, 'Test Project');

      expect(result.id).toBe(3);
      expect(fetch).toHaveBeenCalledWith(
        'https://dev.azure.com/test-org/Test Project/_apis/wit/workitems/$Task?api-version=6.0',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json-patch+json',
          }),
        })
      );
    });

    it('should update work item successfully', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      const updateData = {
        fields: {
          'System.Title': 'Updated Work Item',
          'System.State': 'Active',
          'System.AssignedTo': { displayName: 'Test User' },
        },
      };

      await adapter.updateWorkItem(mockIntegration, 1, updateData as any);

      expect(fetch).toHaveBeenCalledWith(
        'https://dev.azure.com/test-org/_apis/wit/workitems/1?api-version=6.0',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json-patch+json',
          }),
        })
      );
    });
  });

  describe('provider property', () => {
    it('should return correct provider', () => {
      expect(adapter.provider).toBe(IntegrationProvider.AZURE_DEVOPS);
    });
  });
});