import { BaseEntity, UUID } from './common';

export enum IntegrationProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  JIRA = 'jira',
  LINEAR = 'linear',
  AZURE_DEVOPS = 'azure_devops',
  SLACK = 'slack',
  TEAMS = 'teams',
  DISCORD = 'discord',
  AWS = 'aws',
  GCP = 'gcp',
  AZURE = 'azure'
}

export enum IntegrationType {
  VERSION_CONTROL = 'version_control',
  PROJECT_MANAGEMENT = 'project_management',
  COMMUNICATION = 'communication',
  CLOUD_SERVICE = 'cloud_service',
  CI_CD = 'ci_cd',
  MONITORING = 'monitoring'
}

export enum SyncType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  REAL_TIME = 'real_time'
}

export enum AuthType {
  OAUTH2 = 'oauth2',
  API_KEY = 'api_key',
  BASIC_AUTH = 'basic_auth',
  JWT = 'jwt'
}

export interface Credentials {
  type: AuthType;
  data: Record<string, string>;
  expiresAt?: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope?: string[];
}

export interface IntegrationConfig {
  apiUrl: string;
  webhookUrl?: string;
  credentials: Credentials;
  settings: Record<string, any>;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export interface SyncSchedule {
  enabled: boolean;
  frequency: string; // cron expression
  lastSync?: Date;
  nextSync?: Date;
}

export interface Integration extends BaseEntity {
  name: string;
  provider: IntegrationProvider;
  type: IntegrationType;
  config: IntegrationConfig;
  syncSchedule: SyncSchedule;
  projectIds: UUID[];
  teamIds: UUID[];
  isActive: boolean;
}

export interface WebhookPayload {
  integrationId: UUID;
  event: string;
  data: Record<string, any>;
  timestamp: Date;
  signature?: string;
}

export interface SyncResult {
  integrationId: UUID;
  syncType: SyncType;
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsDeleted: number;
  duration: number;
  error?: string;
  startTime: Date;
  endTime: Date;
}

// Integration Service Interfaces
export interface IntegrationManager {
  registerIntegration(integration: Integration): Promise<void>;
  syncData(integrationId: UUID, syncType: SyncType): Promise<SyncResult>;
  processWebhook(webhook: WebhookPayload): Promise<void>;
  authenticateThirdParty(provider: IntegrationProvider, credentials: Credentials): Promise<AuthToken>;
  testConnection(integrationId: UUID): Promise<boolean>;
  getIntegrationStatus(integrationId: UUID): Promise<IntegrationStatus>;
}

export interface IntegrationStatus {
  integrationId: UUID;
  isConnected: boolean;
  lastSync?: Date;
  lastError?: string;
  health: 'healthy' | 'warning' | 'error';
  metrics: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    averageSyncDuration: number;
  };
}