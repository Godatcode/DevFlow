import { WebhookProcessor } from '../interfaces';
import { 
  WebhookPayload, 
  UUID, 
  IntegrationProvider 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { GitHubAdapter } from '../adapters/github-adapter';
import { GitLabAdapter } from '../adapters/gitlab-adapter';
import { BitbucketAdapter } from '../adapters/bitbucket-adapter';
import { JiraAdapter } from '../adapters/jira-adapter';
import { LinearAdapter } from '../adapters/linear-adapter';
import { AzureDevOpsAdapter } from '../adapters/azure-devops-adapter';
import crypto from 'crypto';

export interface WebhookRegistration {
  integrationId: UUID;
  provider: IntegrationProvider;
  webhookUrl: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
}

export class WebhookProcessorService implements WebhookProcessor {
  private readonly logger = new Logger('WebhookProcessorService');
  private readonly registrations = new Map<UUID, WebhookRegistration>();
  private readonly adapters = new Map<IntegrationProvider, any>();

  constructor() {
    this.adapters.set(IntegrationProvider.GITHUB, new GitHubAdapter());
    this.adapters.set(IntegrationProvider.GITLAB, new GitLabAdapter());
    this.adapters.set(IntegrationProvider.BITBUCKET, new BitbucketAdapter());
    this.adapters.set(IntegrationProvider.JIRA, new JiraAdapter());
    this.adapters.set(IntegrationProvider.LINEAR, new LinearAdapter());
    this.adapters.set(IntegrationProvider.AZURE_DEVOPS, new AzureDevOpsAdapter());
  }

  async registerWebhook(integrationId: UUID, webhookUrl: string): Promise<string> {
    this.logger.info('Registering webhook', { integrationId, webhookUrl });

    const secret = this.generateWebhookSecret();
    const registration: WebhookRegistration = {
      integrationId,
      provider: IntegrationProvider.GITHUB, // This should come from the integration
      webhookUrl,
      secret,
      events: ['push', 'pull_request', 'issues', 'repository'],
      isActive: true,
      createdAt: new Date(),
    };

    this.registrations.set(integrationId, registration);
    
    // In a real implementation, this would also register the webhook with the external service
    // For now, we'll just store it locally
    
    return secret;
  }

  async unregisterWebhook(integrationId: UUID): Promise<void> {
    this.logger.info('Unregistering webhook', { integrationId });

    const registration = this.registrations.get(integrationId);
    if (!registration) {
      throw new Error(`Webhook registration not found for integration: ${integrationId}`);
    }

    // In a real implementation, this would also unregister the webhook from the external service
    this.registrations.delete(integrationId);
  }

  async processIncomingWebhook(payload: WebhookPayload): Promise<void> {
    this.logger.info('Processing incoming webhook', { 
      integrationId: payload.integrationId,
      event: payload.event 
    });

    const registration = this.registrations.get(payload.integrationId);
    if (!registration) {
      throw new Error(`No webhook registration found for integration: ${payload.integrationId}`);
    }

    if (!registration.isActive) {
      this.logger.warn('Webhook registration is inactive', { integrationId: payload.integrationId });
      return;
    }

    // Validate webhook signature if provided
    if (payload.signature && !this.validateWebhookSignature(payload, registration.secret)) {
      throw new Error('Invalid webhook signature');
    }

    // Route to appropriate adapter
    const adapter = this.adapters.get(registration.provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${registration.provider}`);
    }

    try {
      await adapter.processWebhook(payload);
      this.logger.info('Webhook processed successfully', { 
        integrationId: payload.integrationId,
        event: payload.event 
      });
    } catch (error) {
      this.logger.error('Failed to process webhook', { 
        error,
        integrationId: payload.integrationId,
        event: payload.event 
      });
      throw error;
    }
  }

  validateWebhookSignature(payload: WebhookPayload, secret: string): boolean {
    if (!payload.signature) {
      return false;
    }

    try {
      const expectedSignature = this.generateSignature(JSON.stringify(payload.data), secret);
      return crypto.timingSafeEqual(
        Buffer.from(payload.signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      this.logger.error('Error validating webhook signature', { error });
      return false;
    }
  }

  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  // Additional methods for webhook management

  async getWebhookRegistration(integrationId: UUID): Promise<WebhookRegistration | undefined> {
    return this.registrations.get(integrationId);
  }

  async listWebhookRegistrations(): Promise<WebhookRegistration[]> {
    return Array.from(this.registrations.values());
  }

  async updateWebhookRegistration(
    integrationId: UUID, 
    updates: Partial<WebhookRegistration>
  ): Promise<void> {
    const registration = this.registrations.get(integrationId);
    if (!registration) {
      throw new Error(`Webhook registration not found for integration: ${integrationId}`);
    }

    Object.assign(registration, updates);
    this.registrations.set(integrationId, registration);
  }

  async getWebhookStats(integrationId: UUID): Promise<WebhookStats> {
    // In a real implementation, this would query a database for webhook statistics
    return {
      integrationId,
      totalWebhooks: 0,
      successfulWebhooks: 0,
      failedWebhooks: 0,
      lastWebhook: undefined,
      averageProcessingTime: 0,
    };
  }
}

export interface WebhookStats {
  integrationId: UUID;
  totalWebhooks: number;
  successfulWebhooks: number;
  failedWebhooks: number;
  lastWebhook?: Date;
  averageProcessingTime: number;
}