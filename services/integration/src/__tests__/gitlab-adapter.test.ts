import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitLabAdapter } from '../adapters/gitlab-adapter';
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

describe('GitLabAdapter', () => {
  let adapter: GitLabAdapter;
  let mockIntegration: Integration;

  beforeEach(() => {
    adapter = new GitLabAdapter();
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test GitLab Integration',
      provider: IntegrationProvider.GITLAB,
      type: 'version_control' as any,
      config: {
        apiUrl: 'https://gitlab.com/api/v4',
        credentials: {
          type: AuthType.API_KEY,
          data: { token: 'test-token' },
        },
        settings: { groupId: 'test-group' },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 5000,
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
          scope: 'api read_user',
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(result.scope).toEqual(['api', 'read_user']);
    });

    it('should authenticate with API token', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { token: 'test-token' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ username: 'testuser' }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-token');
      expect(fetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/user',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-token',
          },
        })
      );
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
    it('should successfully sync projects and merge requests', async () => {
      const mockProjects = [
        {
          id: 1,
          name: 'test-project',
          path: 'test-project',
          path_with_namespace: 'test-group/test-project',
          default_branch: 'main',
          web_url: 'https://gitlab.com/test-group/test-project',
          ssh_url_to_repo: 'git@gitlab.com:test-group/test-project.git',
          http_url_to_repo: 'https://gitlab.com/test-group/test-project.git',
          created_at: '2023-01-01T00:00:00Z',
          last_activity_at: '2023-01-02T00:00:00Z',
          visibility: 'private',
          topics: ['api', 'typescript'],
        },
      ];

      const mockMRs = [
        {
          id: 1,
          iid: 1,
          title: 'Test MR',
          description: 'Test description',
          state: 'opened',
          author: { id: 1, username: 'testuser', name: 'Test User', avatar_url: '', web_url: '' },
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          source_branch: 'feature',
          target_branch: 'main',
          web_url: 'https://gitlab.com/test-group/test-project/-/merge_requests/1',
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockProjects),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockMRs),
        });

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2); // 1 project + 1 MR
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
    it('should process push webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'Push Hook',
        data: {
          project: { path_with_namespace: 'test-group/test-project' },
          ref: 'refs/heads/main',
          commits: [{ id: 'abc123', message: 'Test commit' }],
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process merge request webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'Merge Request Hook',
        data: {
          object_attributes: { action: 'open', iid: 1 },
          project: { path_with_namespace: 'test-group/test-project' },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });
  });

  describe('provider property', () => {
    it('should return correct provider', () => {
      expect(adapter.provider).toBe(IntegrationProvider.GITLAB);
    });
  });
});