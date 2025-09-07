import { 
  IntegrationManager,
  Integration,
  IntegrationProvider,
  SyncResult,
  SyncType,
  WebhookPayload,
  AuthToken,
  Credentials,
  IntegrationStatus,
  UUID 
} from '@devflow/shared-types';

export interface IntegrationAdapter {
  provider: IntegrationProvider;
  authenticate(credentials: Credentials): Promise<AuthToken>;
  testConnection(integration: Integration): Promise<boolean>;
  syncData(integration: Integration, syncType: SyncType): Promise<SyncResult>;
  processWebhook(webhook: WebhookPayload): Promise<void>;
}

export interface WebhookProcessor {
  registerWebhook(integrationId: UUID, webhookUrl: string): Promise<string>;
  unregisterWebhook(integrationId: UUID): Promise<void>;
  processIncomingWebhook(payload: WebhookPayload): Promise<void>;
  validateWebhookSignature(payload: WebhookPayload, secret: string): boolean;
}

export interface DataSynchronizer {
  scheduleSync(integrationId: UUID, syncType: SyncType): Promise<void>;
  cancelSync(integrationId: UUID): Promise<void>;
  getSyncStatus(integrationId: UUID): Promise<SyncStatus>;
  getSyncHistory(integrationId: UUID, limit?: number): Promise<SyncResult[]>;
}

export interface SyncStatus {
  integrationId: UUID;
  isRunning: boolean;
  lastSync?: Date;
  nextSync?: Date;
  progress?: number;
  error?: string;
}

export interface IntegrationHealthMonitor {
  checkHealth(integrationId: UUID): Promise<IntegrationStatus>;
  monitorAllIntegrations(): Promise<IntegrationStatus[]>;
  getHealthMetrics(integrationId: UUID): Promise<HealthMetrics>;
}

export interface HealthMetrics {
  integrationId: UUID;
  uptime: number;
  responseTime: number;
  errorRate: number;
  lastError?: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
}

export interface IntegrationManager {
  registerIntegration(integration: Integration): Promise<void>;
  syncData(integrationId: UUID, syncType: SyncType): Promise<SyncResult>;
  processWebhook(webhook: WebhookPayload): Promise<void>;
  authenticateThirdParty(provider: IntegrationProvider, credentials: Credentials): Promise<AuthToken>;
  testConnection(integrationId: UUID): Promise<boolean>;
  getIntegrationStatus(integrationId: UUID): Promise<IntegrationStatus>;
}