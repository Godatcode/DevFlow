import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraAdapter } from '../adapters/jira-adapter';
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

describe('JiraAdapter', () => {
  let adapter: JiraAdapter;
  let mockIntegration: Integration;

  beforeEach(() => {
    adapter = new JiraAdapter('https://test-domain.atlassian.net');
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test Jira Integration',
      provider: IntegrationProvider.JIRA,
      type: 'project_management' as any,
      config: {
        apiUrl: 'https://test-domain.atlassian.net',
        credentials: {
          type: AuthType.API_KEY,
          data: { email: 'test@example.com', token: 'test-token' },
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
          scope: 'read:jira-work write:jira-work',
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(result.scope).toEqual(['read:jira-work', 'write:jira-work']);
    });

    it('should authenticate with API token', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { email: 'test@example.com', token: 'test-token' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ accountId: 'test-account-id' }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe(Buffer.from('test@example.com:test-token').toString('base64'));
    });

    it('should authenticate with basic auth', async () => {
      const credentials: Credentials = {
        type: AuthType.BASIC_AUTH,
        data: { username: 'testuser', password: 'testpass' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ accountId: 'test-account-id' }),
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
    it('should successfully sync projects and issues', async () => {
      const mockProjects = [
        {
          id: '10000',
          key: 'TEST',
          name: 'Test Project',
          description: 'Test project description',
          projectTypeKey: 'software',
          lead: { accountId: 'test-lead', displayName: 'Test Lead' },
        },
      ];

      const mockIssues = [
        {
          id: '10001',
          key: 'TEST-1',
          fields: {
            summary: 'Test Issue',
            description: 'Test issue description',
            status: { name: 'To Do' },
            priority: { name: 'Medium' },
            issuetype: { name: 'Task' },
            created: '2023-01-01T00:00:00.000Z',
            updated: '2023-01-01T00:00:00.000Z',
          },
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockProjects),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ issues: mockIssues }),
        });

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2); // 1 project + 1 issue
      expect(result.recordsCreated).toBe(2);
    });

    it('should handle sync errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API Error'));

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
    });
  });

  describe('processWebhook', () => {
    it('should process issue created webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'jira:issue_created',
        data: {
          issue: {
            key: 'TEST-1',
            fields: {
              project: { key: 'TEST' },
              summary: 'New Issue',
            },
          },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process issue updated webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'jira:issue_updated',
        data: {
          issue: { key: 'TEST-1' },
          changelog: { items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });
  });

  describe('bidirectional sync methods', () => {
    it('should create issue successfully', async () => {
      const mockCreatedIssue = {
        key: 'TEST-2',
        id: '10002',
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockCreatedIssue),
      });

      const issueData = {
        fields: {
          summary: 'New Issue',
          description: 'New issue description',
          project: { key: 'TEST' },
          issuetype: { name: 'Task' },
        },
      };

      const result = await adapter.createIssue(mockIntegration, issueData as any);

      expect(result.key).toBe('TEST-2');
      expect(fetch).toHaveBeenCalledWith(
        'https://test-domain.atlassian.net/rest/api/3/issue',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should update issue successfully', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      const updateData = {
        fields: {
          summary: 'Updated Issue',
          assignee: { accountId: 'test-assignee' },
        },
      };

      await adapter.updateIssue(mockIntegration, 'TEST-1', updateData as any);

      expect(fetch).toHaveBeenCalledWith(
        'https://test-domain.atlassian.net/rest/api/3/issue/TEST-1',
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should transition issue successfully', async () => {
      (global.fetch as any).mockResolvedValue({ ok: true });

      await adapter.transitionIssue(mockIntegration, 'TEST-1', '31');

      expect(fetch).toHaveBeenCalledWith(
        'https://test-domain.atlassian.net/rest/api/3/issue/TEST-1/transitions',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('provider property', () => {
    it('should return correct provider', () => {
      expect(adapter.provider).toBe(IntegrationProvider.JIRA);
    });
  });
});