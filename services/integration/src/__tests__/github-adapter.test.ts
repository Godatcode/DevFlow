import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubAdapter } from '../adapters/github-adapter';
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

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  let mockIntegration: Integration;

  beforeEach(() => {
    adapter = new GitHubAdapter();
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test GitHub Integration',
      provider: IntegrationProvider.GITHUB,
      type: 'version_control' as any,
      config: {
        apiUrl: 'https://api.github.com',
        credentials: {
          type: AuthType.API_KEY,
          data: { token: 'test-token' },
        },
        settings: { organization: 'test-org' },
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
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
          scope: 'repo,user',
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.scope).toEqual(['repo', 'user']);
      expect(fetch).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should authenticate with API token', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { token: 'test-token' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ login: 'testuser' }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-token');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: {
            'Authorization': 'token test-token',
            'Accept': 'application/vnd.github.v3+json',
          },
        })
      );
    });

    it('should throw error for unsupported auth type', async () => {
      const credentials: Credentials = {
        type: AuthType.BASIC_AUTH,
        data: { username: 'user', password: 'pass' },
      };

      await expect(adapter.authenticate(credentials)).rejects.toThrow(
        'Unsupported auth type: basic_auth'
      );
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const mockResponse = { ok: true };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: {
            'Authorization': 'token test-token',
            'Accept': 'application/vnd.github.v3+json',
          },
        })
      );
    });

    it('should return false for failed connection', async () => {
      const mockResponse = { ok: false };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(false);
    });

    it('should return false when fetch throws error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await adapter.testConnection(mockIntegration);

      expect(result).toBe(false);
    });
  });

  describe('syncData', () => {
    it('should successfully sync repositories and pull requests', async () => {
      const mockRepos = [
        {
          id: 1,
          name: 'test-repo',
          full_name: 'test-org/test-repo',
          private: false,
          html_url: 'https://github.com/test-org/test-repo',
          clone_url: 'https://github.com/test-org/test-repo.git',
          ssh_url: 'git@github.com:test-org/test-repo.git',
          default_branch: 'main',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          pushed_at: '2023-01-02T00:00:00Z',
          language: 'TypeScript',
          topics: ['api', 'typescript'],
        },
      ];

      const mockPRs = [
        {
          id: 1,
          number: 1,
          title: 'Test PR',
          body: 'Test description',
          state: 'open',
          user: { id: 1, login: 'testuser', avatar_url: '', html_url: '' },
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          head: { ref: 'feature', sha: 'abc123', repo: mockRepos[0] },
          base: { ref: 'main', sha: 'def456', repo: mockRepos[0] },
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockRepos),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockPRs),
        });

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2); // 1 repo + 1 PR
      expect(result.recordsCreated).toBe(2);
      expect(result.integrationId).toBe(mockIntegration.id);
      expect(result.syncType).toBe(SyncType.FULL);
    });

    it('should handle sync errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API Error'));

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error');
      expect(result.recordsProcessed).toBe(0);
    });
  });

  describe('processWebhook', () => {
    it('should process push webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'push',
        data: {
          repository: { full_name: 'test-org/test-repo' },
          ref: 'refs/heads/main',
          commits: [{ id: 'abc123', message: 'Test commit' }],
        },
        timestamp: new Date(),
      };

      // Should not throw
      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process pull request webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'pull_request',
        data: {
          action: 'opened',
          repository: { full_name: 'test-org/test-repo' },
          pull_request: { number: 1, title: 'Test PR' },
        },
        timestamp: new Date(),
      };

      // Should not throw
      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should handle unknown webhook events', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'unknown_event',
        data: {},
        timestamp: new Date(),
      };

      // Should not throw, just log warning
      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });
  });

  describe('provider property', () => {
    it('should return correct provider', () => {
      expect(adapter.provider).toBe(IntegrationProvider.GITHUB);
    });
  });
});