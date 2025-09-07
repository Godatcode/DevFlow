import { IntegrationManager } from '../interfaces';
import {
  Integration,
  IntegrationProvider,
  Credentials,
  AuthToken,
  SyncType,
  SyncResult,
  WebhookPayload,
  UUID,
  IntegrationStatus
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { GitHubAdapter } from '../adapters/github-adapter';
import { GitLabAdapter } from '../adapters/gitlab-adapter';
import { BitbucketAdapter } from '../adapters/bitbucket-adapter';
import { JiraAdapter } from '../adapters/jira-adapter';
import { LinearAdapter } from '../adapters/linear-adapter';
import { AzureDevOpsAdapter } from '../adapters/azure-devops-adapter';
import { SlackAdapter } from '../adapters/slack-adapter';
import { TeamsAdapter } from '../adapters/teams-adapter';
import { DiscordAdapter } from '../adapters/discord-adapter';
import { AWSAdapter } from '../adapters/aws-adapter';
import { GCPAdapter } from '../adapters/gcp-adapter';
import { AzureAdapter } from '../adapters/azure-adapter';
import { WebhookProcessorService } from './webhook-processor';
import { DataSynchronizerService } from './data-synchronizer';

export class IntegrationManagerService implements IntegrationManager {
  private readonly logger = new Logger('IntegrationManagerService');
  private readonly adapters = new Map<IntegrationProvider, any>();
  private readonly integrations = new Map<UUID, Integration>();
  private readonly webhookProcessor: WebhookProcessorService;
  private readonly dataSynchronizer: DataSynchronizerService;

  constructor() {
    // Initialize adapters
    this.adapters.set(IntegrationProvider.GITHUB, new GitHubAdapter());
    this.adapters.set(IntegrationProvider.GITLAB, new GitLabAdapter());
    this.adapters.set(IntegrationProvider.BITBUCKET, new BitbucketAdapter());
    this.adapters.set(IntegrationProvider.JIRA, new JiraAdapter());
    this.adapters.set(IntegrationProvider.LINEAR, new LinearAdapter());
    this.adapters.set(IntegrationProvider.AZURE_DEVOPS, new AzureDevOpsAdapter());
    this.adapters.set(IntegrationProvider.SLACK, new SlackAdapter());
    this.adapters.set(IntegrationProvider.TEAMS, new TeamsAdapter());
    this.adapters.set(IntegrationProvider.DISCORD, new DiscordAdapter());
    this.adapters.set(IntegrationProvider.AWS, new AWSAdapter());
    this.adapters.set(IntegrationProvider.GCP, new GCPAdapter());
    this.adapters.set(IntegrationProvider.AZURE, new AzureAdapter());

    // Initialize services
    this.webhookProcessor = new WebhookProcessorService();
    this.dataSynchronizer = new DataSynchronizerService();
  }

  async registerIntegration(integration: Integration): Promise<void> {
    this.logger.info('Registering integration', { 
      integrationId: integration.id,
      provider: integration.provider 
    });

    // Validate integration
    await this.validateIntegration(integration);

    // Test connection
    const isConnected = await this.testConnection(integration.id);
    if (!isConnected) {
      throw new Error('Failed to connect to integration');
    }

    // Store integration
    this.integrations.set(integration.id, integration);

    // Register webhook if configured
    if (integration.config.webhookUrl) {
      await this.webhookProcessor.registerWebhook(integration.id, integration.config.webhookUrl);
    }

    // Schedule initial sync if enabled
    if (integration.syncSchedule.enabled) {
      await this.dataSynchronizer.scheduleSync(integration.id, SyncType.FULL);
    }

    this.logger.info('Integration registered successfully', { 
      integrationId: integration.id,
      provider: integration.provider 
    });
  }

  async syncData(integrationId: UUID, syncType: SyncType): Promise<SyncResult> {
    this.logger.info('Starting data sync', { integrationId, syncType });

    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    const adapter = this.adapters.get(integration.provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${integration.provider}`);
    }

    try {
      const result = await adapter.syncData(integration, syncType);
      
      this.logger.info('Data sync completed', { 
        integrationId,
        syncType,
        success: result.success,
        recordsProcessed: result.recordsProcessed 
      });

      return result;
    } catch (error) {
      this.logger.error('Data sync failed', { error, integrationId, syncType });
      throw error;
    }
  }

  async processWebhook(webhook: WebhookPayload): Promise<void> {
    this.logger.info('Processing webhook', { 
      integrationId: webhook.integrationId,
      event: webhook.event 
    });

    await this.webhookProcessor.processIncomingWebhook(webhook);
  }

  async authenticateThirdParty(provider: IntegrationProvider, credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with third party', { provider });

    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }

    try {
      const token = await adapter.authenticate(credentials);
      
      this.logger.info('Third party authentication successful', { provider });
      return token;
    } catch (error) {
      this.logger.error('Third party authentication failed', { error, provider });
      throw error;
    }
  }

  async testConnection(integrationId: UUID): Promise<boolean> {
    this.logger.info('Testing connection', { integrationId });

    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    const adapter = this.adapters.get(integration.provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${integration.provider}`);
    }

    try {
      const isConnected = await adapter.testConnection(integration);
      
      this.logger.info('Connection test completed', { integrationId, isConnected });
      return isConnected;
    } catch (error) {
      this.logger.error('Connection test failed', { error, integrationId });
      return false;
    }
  }

  async getIntegrationStatus(integrationId: UUID): Promise<IntegrationStatus> {
    this.logger.info('Getting integration status', { integrationId });

    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    const isConnected = await this.testConnection(integrationId);
    const syncStatus = await this.dataSynchronizer.getSyncStatus(integrationId);
    const syncMetrics = await this.dataSynchronizer.getSyncMetrics(integrationId);

    const status: IntegrationStatus = {
      integrationId,
      isConnected,
      lastSync: syncStatus.lastSync,
      lastError: syncStatus.error,
      health: this.determineHealth(isConnected, syncStatus.error),
      metrics: {
        totalSyncs: syncMetrics.totalSyncs,
        successfulSyncs: syncMetrics.successfulSyncs,
        failedSyncs: syncMetrics.failedSyncs,
        averageSyncDuration: syncMetrics.averageSyncDuration,
      },
    };

    return status;
  }

  // Additional management methods

  async updateIntegration(integrationId: UUID, updates: Partial<Integration>): Promise<void> {
    this.logger.info('Updating integration', { integrationId });

    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    const updatedIntegration = { ...integration, ...updates, updatedAt: new Date() };
    
    // Validate updated integration
    await this.validateIntegration(updatedIntegration);

    this.integrations.set(integrationId, updatedIntegration);

    this.logger.info('Integration updated successfully', { integrationId });
  }

  async deleteIntegration(integrationId: UUID): Promise<void> {
    this.logger.info('Deleting integration', { integrationId });

    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    // Cancel any running syncs
    await this.dataSynchronizer.cancelSync(integrationId);

    // Unregister webhook
    try {
      await this.webhookProcessor.unregisterWebhook(integrationId);
    } catch (error) {
      this.logger.warn('Failed to unregister webhook', { error, integrationId });
    }

    // Remove integration
    this.integrations.delete(integrationId);

    this.logger.info('Integration deleted successfully', { integrationId });
  }

  async listIntegrations(): Promise<Integration[]> {
    return Array.from(this.integrations.values());
  }

  async getIntegration(integrationId: UUID): Promise<Integration | undefined> {
    return this.integrations.get(integrationId);
  }

  async getIntegrationsByProvider(provider: IntegrationProvider): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(
      integration => integration.provider === provider
    );
  }

  async refreshIntegrationAuth(integrationId: UUID): Promise<AuthToken> {
    this.logger.info('Refreshing integration auth', { integrationId });

    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }

    const newToken = await this.authenticateThirdParty(
      integration.provider,
      integration.config.credentials
    );

    // Update integration with new token
    integration.config.credentials.data.access_token = newToken.accessToken;
    if (newToken.refreshToken) {
      integration.config.credentials.data.refresh_token = newToken.refreshToken;
    }
    integration.config.credentials.expiresAt = newToken.expiresAt;

    this.integrations.set(integrationId, integration);

    this.logger.info('Integration auth refreshed successfully', { integrationId });
    return newToken;
  }

  private async validateIntegration(integration: Integration): Promise<void> {
    if (!integration.id) {
      throw new Error('Integration ID is required');
    }

    if (!integration.name) {
      throw new Error('Integration name is required');
    }

    if (!Object.values(IntegrationProvider).includes(integration.provider)) {
      throw new Error(`Invalid integration provider: ${integration.provider}`);
    }

    if (!integration.config.credentials) {
      throw new Error('Integration credentials are required');
    }

    // Provider-specific validation
    const adapter = this.adapters.get(integration.provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${integration.provider}`);
    }
  }

  private determineHealth(isConnected: boolean, lastError?: string): 'healthy' | 'warning' | 'error' {
    if (!isConnected) {
      return 'error';
    }

    if (lastError) {
      return 'warning';
    }

    return 'healthy';
  }

  // Cleanup method
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down integration manager');
    
    // Stop data synchronizer
    this.dataSynchronizer.stopSyncProcessor();
    
    this.logger.info('Integration manager shutdown complete');
  }
}