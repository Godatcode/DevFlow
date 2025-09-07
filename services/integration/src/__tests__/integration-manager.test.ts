import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationManagerService } from '../services/integration-manager';
import {
  Integration,
  IntegrationProvider,
  Credentials,
  AuthType,
  SyncType,
  WebhookPayload
} from '@devflow/shared-types';

// Mock the adapters
vi.mock('../adapters/github-adapter');
vi.mock('../adapters/gitlab-adapter');
vi.mock('../adapters/bitbucket-adapter');

describe('IntegrationManagerService', () => {
  let integrationManager: IntegrationManagerService;
  let mockIntegration: Integration;

  beforeEach(() => {
    integrationManager = new IntegrationManagerService();
    mockIntegration = {
      id: 'test-integration-id' as any,
      name: 'Test Integration',
      provider: IntegrationProvider.GITHUB,
      type: 'version_control' as any,
      config: {
        apiUrl: 'https://api.github.com',
        webhookUrl: 'https://example.com/webhook',
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

  describe('registerIntegration', () => {
    it('should register integration successfully', async () => {
      // Mock successful connection test
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValue(true);

      await integrationManager.registerIntegration(mockIntegration);

      const retrievedIntegration = await integrationManager.getIntegration(mockIntegration.id);
      expect(retrievedIntegration).toEqual(mockIntegration);
    });

    it('should throw error if connection test fails', async () => {
      // Mock failed connection test
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValue(false);

      await expect(integrationManager.registerIntegration(mockIntegration)).rejects.toThrow(
        'Failed to connect to integration'
      );
    });

    it('should throw error for invalid integration', async () => {
      const invalidIntegration = { ...mockIntegration, name: '' };

      await expect(integrationManager.registerIntegration(invalidIntegration)).rejects.toThrow(
        'Integration name is required'
      );
    });
  });

  describe('syncData', () => {
    beforeEach(async () => {
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValue(true);
      await integrationManager.registerIntegration(mockIntegration);
    });

    it('should sync data successfully', async () => {
      const mockSyncResult = {
        integrationId: mockIntegration.id,
        syncType: SyncType.FULL,
        success: true,
        recordsProcessed: 10,
        recordsCreated: 8,
        recordsUpdated: 2,
        recordsDeleted: 0,
        duration: 5000,
        startTime: new Date(),
        endTime: new Date(),
      };

      // Mock adapter syncData method
      const mockAdapter = {
        syncData: vi.fn().mockResolvedValue(mockSyncResult),
      };
      (integrationManager as any).adapters.set(IntegrationProvider.GITHUB, mockAdapter);

      const result = await integrationManager.syncData(mockIntegration.id, SyncType.FULL);

      expect(result).toEqual(mockSyncResult);
      expect(mockAdapter.syncData).toHaveBeenCalledWith(mockIntegration, SyncType.FULL);
    });

    it('should throw error for non-existent integration', async () => {
      const nonExistentId = 'non-existent-id' as any;

      await expect(integrationManager.syncData(nonExistentId, SyncType.FULL)).rejects.toThrow(
        'Integration not found: non-existent-id'
      );
    });
  });

  describe('processWebhook', () => {
    it('should process webhook successfully', async () => {
      const webhook: WebhookPayload = {
        integrationId: mockIntegration.id,
        event: 'push',
        data: { repository: { name: 'test-repo' } },
        timestamp: new Date(),
      };

      // Mock webhook processor
      const mockProcessIncomingWebhook = vi.fn().mockResolvedValue(undefined);
      (integrationManager as any).webhookProcessor.processIncomingWebhook = mockProcessIncomingWebhook;

      await integrationManager.processWebhook(webhook);

      expect(mockProcessIncomingWebhook).toHaveBeenCalledWith(webhook);
    });
  });

  describe('authenticateThirdParty', () => {
    it('should authenticate successfully', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { token: 'test-token' },
      };

      const mockAuthToken = {
        accessToken: 'test-access-token',
        expiresAt: new Date(Date.now() + 3600000),
      };

      // Mock adapter authenticate method
      const mockAdapter = {
        authenticate: vi.fn().mockResolvedValue(mockAuthToken),
      };
      (integrationManager as any).adapters.set(IntegrationProvider.GITHUB, mockAdapter);

      const result = await integrationManager.authenticateThirdParty(IntegrationProvider.GITHUB, credentials);

      expect(result).toEqual(mockAuthToken);
      expect(mockAdapter.authenticate).toHaveBeenCalledWith(credentials);
    });

    it('should throw error for unsupported provider', async () => {
      const credentials: Credentials = {
        type: AuthType.API_KEY,
        data: { token: 'test-token' },
      };

      // Remove adapter to simulate unsupported provider
      (integrationManager as any).adapters.delete(IntegrationProvider.GITHUB);

      await expect(
        integrationManager.authenticateThirdParty(IntegrationProvider.GITHUB, credentials)
      ).rejects.toThrow('No adapter found for provider: github');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      // First register the integration
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValueOnce(true); // For registration
      await integrationManager.registerIntegration(mockIntegration);
      
      // Now restore and mock for the actual test
      vi.spyOn(integrationManager, 'testConnection').mockRestore();
      
      // Mock adapter testConnection method
      const mockAdapter = {
        testConnection: vi.fn().mockResolvedValue(true),
      };
      (integrationManager as any).adapters.set(IntegrationProvider.GITHUB, mockAdapter);

      const result = await integrationManager.testConnection(mockIntegration.id);

      expect(result).toBe(true);
      expect(mockAdapter.testConnection).toHaveBeenCalledWith(mockIntegration);
    });

    it('should return false for failed connection', async () => {
      // First register the integration
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValueOnce(true); // For registration
      await integrationManager.registerIntegration(mockIntegration);
      
      // Now restore and mock for the actual test
      vi.spyOn(integrationManager, 'testConnection').mockRestore();
      
      // Mock adapter testConnection method
      const mockAdapter = {
        testConnection: vi.fn().mockResolvedValue(false),
      };
      (integrationManager as any).adapters.set(IntegrationProvider.GITHUB, mockAdapter);

      const result = await integrationManager.testConnection(mockIntegration.id);

      expect(result).toBe(false);
    });
  });

  describe('getIntegrationStatus', () => {
    beforeEach(async () => {
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValue(true);
      await integrationManager.registerIntegration(mockIntegration);
    });

    it('should return integration status', async () => {
      // Mock dependencies
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValue(true);
      
      const mockSyncStatus = {
        integrationId: mockIntegration.id,
        isRunning: false,
        lastSync: new Date(),
      };
      
      const mockSyncMetrics = {
        integrationId: mockIntegration.id,
        totalSyncs: 5,
        successfulSyncs: 4,
        failedSyncs: 1,
        averageSyncDuration: 3000,
      };

      (integrationManager as any).dataSynchronizer.getSyncStatus = vi.fn().mockResolvedValue(mockSyncStatus);
      (integrationManager as any).dataSynchronizer.getSyncMetrics = vi.fn().mockResolvedValue(mockSyncMetrics);

      const status = await integrationManager.getIntegrationStatus(mockIntegration.id);

      expect(status.integrationId).toBe(mockIntegration.id);
      expect(status.isConnected).toBe(true);
      expect(status.health).toBe('healthy');
      expect(status.metrics.totalSyncs).toBe(5);
      expect(status.metrics.successfulSyncs).toBe(4);
      expect(status.metrics.failedSyncs).toBe(1);
    });
  });

  describe('integration management', () => {
    beforeEach(async () => {
      vi.spyOn(integrationManager, 'testConnection').mockResolvedValue(true);
      await integrationManager.registerIntegration(mockIntegration);
    });

    it('should update integration', async () => {
      const updates = { name: 'Updated Integration Name' };

      await integrationManager.updateIntegration(mockIntegration.id, updates);

      const updatedIntegration = await integrationManager.getIntegration(mockIntegration.id);
      expect(updatedIntegration?.name).toBe('Updated Integration Name');
    });

    it('should delete integration', async () => {
      // Mock dependencies
      (integrationManager as any).dataSynchronizer.cancelSync = vi.fn().mockResolvedValue(undefined);
      (integrationManager as any).webhookProcessor.unregisterWebhook = vi.fn().mockResolvedValue(undefined);

      await integrationManager.deleteIntegration(mockIntegration.id);

      const deletedIntegration = await integrationManager.getIntegration(mockIntegration.id);
      expect(deletedIntegration).toBeUndefined();
    });

    it('should list integrations', async () => {
      const integrations = await integrationManager.listIntegrations();
      
      expect(integrations).toHaveLength(1);
      expect(integrations[0].id).toBe(mockIntegration.id);
    });

    it('should get integrations by provider', async () => {
      const integrations = await integrationManager.getIntegrationsByProvider(IntegrationProvider.GITHUB);
      
      expect(integrations).toHaveLength(1);
      expect(integrations[0].provider).toBe(IntegrationProvider.GITHUB);
    });

    it('should refresh integration auth', async () => {
      const mockNewToken = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
      };

      vi.spyOn(integrationManager, 'authenticateThirdParty').mockResolvedValue(mockNewToken);

      const result = await integrationManager.refreshIntegrationAuth(mockIntegration.id);

      expect(result).toEqual(mockNewToken);

      const updatedIntegration = await integrationManager.getIntegration(mockIntegration.id);
      expect(updatedIntegration?.config.credentials.data.access_token).toBe('new-access-token');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const mockStopSyncProcessor = vi.fn();
      (integrationManager as any).dataSynchronizer.stopSyncProcessor = mockStopSyncProcessor;

      await integrationManager.shutdown();

      expect(mockStopSyncProcessor).toHaveBeenCalled();
    });
  });
});