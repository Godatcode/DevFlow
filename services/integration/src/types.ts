import { UUID, IntegrationProvider, SyncType } from '@devflow/shared-types';

export interface IntegrationConfiguration {
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
    requestsPerHour: number;
    burstLimit: number;
  };
  retry: {
    maxAttempts: number;
    backoffStrategy: 'linear' | 'exponential';
    initialDelay: number;
    maxDelay: number;
  };
  timeout: {
    connection: number;
    request: number;
    total: number;
  };
  webhook: {
    secretKey: string;
    maxPayloadSize: number;
    allowedIPs?: string[];
  };
}

export interface IntegrationEvent {
  id: UUID;
  integrationId: UUID;
  type: 'sync_started' | 'sync_completed' | 'sync_failed' | 'webhook_received' | 'auth_refreshed';
  data: Record<string, any>;
  timestamp: Date;
  source: string;
}

export interface DataMapping {
  integrationId: UUID;
  sourceField: string;
  targetField: string;
  transformation?: DataTransformation;
  required: boolean;
}

export interface DataTransformation {
  type: 'format' | 'calculate' | 'lookup' | 'conditional';
  config: Record<string, any>;
}

export interface IntegrationMetrics {
  integrationId: UUID;
  provider: IntegrationProvider;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  dataTransferred: number;
  lastActivity: Date;
  syncMetrics: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    averageSyncDuration: number;
    recordsProcessed: number;
  };
}

export interface RateLimitState {
  integrationId: UUID;
  requestsThisMinute: number;
  requestsThisHour: number;
  lastReset: Date;
  isLimited: boolean;
}