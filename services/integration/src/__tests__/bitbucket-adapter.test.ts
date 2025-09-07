import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BitbucketAdapter } from '../adapters/bitbucket-adapter';
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

describe('BitbucketAdapter', () => {
  let adapter: BitbucketAdapter;
  let mockIntegration: Integration;

  beforeEach(() => {
    adapter = new BitbucketAdapter();
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test Bitbucket Integration',
      provider: IntegrationProvider.BITBUCKET,
      type: 'version_control' as any,
      config: {
        apiUrl: 'https://api.bitbucket.org/2.0',
        credentials: {
          type: AuthType.BASIC_AUTH,
          data: { username: 'testuser', password: 'app-password' },
        },
        settings: { workspace: 'test-workspace' },
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
        },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          scopes: 'repositories account',
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe('test-access-token');
      expect(result.refreshToken).toBe('test-refresh-token');
      expect(result.scope).toEqual(['repositories', 'account']);
    });

    it('should authenticate with app password', async () => {
      const credentials: Credentials = {
        type: AuthType.BASIC_AUTH,
        data: { username: 'testuser', password: 'app-password' },
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ username: 'testuser' }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await adapter.authenticate(credentials);

      expect(result.accessToken).toBe(Buffer.from('testuser:app-password').toString('base64'));
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
    it('should successfully sync repositories and pull requests', async () => {
      const mockRepos = [
        {
          uuid: '{repo-uuid}',
          name: 'test-repo',
          full_name: 'test-workspace/test-repo',
          is_private: false,
          html: { href: 'https://bitbucket.org/test-workspace/test-repo' },
          clone: [
            { name: 'ssh', href: 'git@bitbucket.org:test-workspace/test-repo.git' },
            { name: 'https', href: 'https://bitbucket.org/test-workspace/test-repo.git' },
          ],
          mainbranch: { name: 'main' },
          created_on: '2023-01-01T00:00:00Z',
          updated_on: '2023-01-02T00:00:00Z',
          language: 'typescript',
        },
      ];

      const mockPRs = [
        {
          id: 1,
          title: 'Test PR',
          description: 'Test description',
          state: 'OPEN',
          author: { uuid: '{user-uuid}', username: 'testuser', display_name: 'Test User', avatar: '' },
          created_on: '2023-01-01T00:00:00Z',
          updated_on: '2023-01-01T00:00:00Z',
          source: { name: 'feature', commit: { hash: 'abc123' }, repository: mockRepos[0] },
          destination: { name: 'main', commit: { hash: 'def456' }, repository: mockRepos[0] },
        },
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ values: mockRepos }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ values: mockPRs }),
        });

      const result = await adapter.syncData(mockIntegration, SyncType.FULL);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2); // 1 repo + 1 PR
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
        event: 'repo:push',
        data: {
          repository: { full_name: 'test-workspace/test-repo' },
          push: { changes: [{ new: { name: 'main' } }] },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });

    it('should process pull request webhook', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'pullrequest:created',
        data: {
          repository: { full_name: 'test-workspace/test-repo' },
          pullrequest: { id: 1, state: 'OPEN' },
        },
        timestamp: new Date(),
      };

      await expect(adapter.processWebhook(webhook)).resolves.toBeUndefined();
    });
  });

  describe('provider property', () => {
    it('should return correct provider', () => {
      expect(adapter.provider).toBe(IntegrationProvider.BITBUCKET);
    });
  });
});