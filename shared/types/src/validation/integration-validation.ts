import {
  Integration,
  IntegrationConfig,
  SyncSchedule,
  WebhookPayload,
  SyncResult,
  IntegrationStatus,
  Credentials,
  AuthToken,
  IntegrationProvider,
  IntegrationType,
  SyncType,
  AuthType
} from '../integration';
import { BaseValidator, ValidationError } from './base-validation';

export class IntegrationValidator extends BaseValidator {
  static validateIntegration(integration: Integration): void {
    this.validateBaseEntity(integration);
    this.validateString(integration.name, 'name', 1, 100);
    this.validateEnum(integration.provider, IntegrationProvider, 'provider');
    this.validateEnum(integration.type, IntegrationType, 'type');
    this.validateIntegrationConfig(integration.config);
    this.validateSyncSchedule(integration.syncSchedule);
    
    this.validateArray(integration.projectIds, 'projectIds', 0, 50);
    integration.projectIds.forEach((projectId, index) => {
      this.validateUUID(projectId, `projectIds[${index}]`);
    });

    this.validateArray(integration.teamIds, 'teamIds', 0, 20);
    integration.teamIds.forEach((teamId, index) => {
      this.validateUUID(teamId, `teamIds[${index}]`);
    });

    if (typeof integration.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean', 'INVALID_TYPE');
    }

    // Validate provider and type compatibility
    this.validateProviderTypeCompatibility(integration.provider, integration.type);
  }

  static validateIntegrationConfig(config: IntegrationConfig): void {
    this.validateUrl(config.apiUrl, 'config.apiUrl');
    
    if (config.webhookUrl) {
      this.validateUrl(config.webhookUrl, 'config.webhookUrl');
    }

    this.validateCredentials(config.credentials);
    this.validateObject(config.settings, 'config.settings');
    this.validateRateLimits(config.rateLimits, 'config.rateLimits');
  }

  static validateCredentials(credentials: Credentials): void {
    this.validateEnum(credentials.type, AuthType, 'credentials.type');
    this.validateObject(credentials.data, 'credentials.data', false);

    if (credentials.expiresAt) {
      this.validateDate(credentials.expiresAt, 'credentials.expiresAt');
      
      // Validate expiration is in the future
      if (credentials.expiresAt <= new Date()) {
        throw new ValidationError(
          'credentials.expiresAt must be in the future',
          'EXPIRED_CREDENTIALS'
        );
      }
    }

    // Validate required fields based on auth type
    this.validateCredentialsByType(credentials);
  }

  static validateAuthToken(token: AuthToken): void {
    this.validateString(token.accessToken, 'accessToken', 1, 2000);
    
    if (token.refreshToken) {
      this.validateString(token.refreshToken, 'refreshToken', 1, 2000);
    }

    this.validateDate(token.expiresAt, 'expiresAt');
    
    if (token.scope) {
      this.validateArray(token.scope, 'scope', 0, 20);
      token.scope.forEach((scope, index) => {
        this.validateString(scope, `scope[${index}]`, 1, 100);
      });
    }

    // Validate token is not expired
    if (token.expiresAt <= new Date()) {
      throw new ValidationError(
        'Token has expired',
        'EXPIRED_TOKEN'
      );
    }
  }

  static validateSyncSchedule(schedule: SyncSchedule): void {
    if (typeof schedule.enabled !== 'boolean') {
      throw new ValidationError('syncSchedule.enabled must be a boolean', 'INVALID_TYPE');
    }

    this.validateString(schedule.frequency, 'syncSchedule.frequency', 1, 100);
    
    if (schedule.lastSync) {
      this.validateDate(schedule.lastSync, 'syncSchedule.lastSync');
    }

    if (schedule.nextSync) {
      this.validateDate(schedule.nextSync, 'syncSchedule.nextSync');
      
      // Validate nextSync is in the future if enabled
      if (schedule.enabled && schedule.nextSync <= new Date()) {
        throw new ValidationError(
          'syncSchedule.nextSync must be in the future when enabled',
          'PAST_NEXT_SYNC'
        );
      }
    }

    // Validate cron expression format
    this.validateCronExpression(schedule.frequency);

    // Validate lastSync is before nextSync
    if (schedule.lastSync && schedule.nextSync && schedule.lastSync >= schedule.nextSync) {
      throw new ValidationError(
        'syncSchedule.nextSync must be after lastSync',
        'INVALID_SYNC_ORDER'
      );
    }
  }

  static validateWebhookPayload(payload: WebhookPayload): void {
    this.validateUUID(payload.integrationId, 'integrationId');
    this.validateString(payload.event, 'event', 1, 100);
    this.validateObject(payload.data, 'data');
    this.validateDate(payload.timestamp, 'timestamp');
    
    if (payload.signature) {
      this.validateString(payload.signature, 'signature', 1, 500);
    }

    // Validate timestamp is not too far in the past or future
    const now = new Date();
    const maxAgeMs = 5 * 60 * 1000; // 5 minutes
    const timeDiff = Math.abs(now.getTime() - payload.timestamp.getTime());
    
    if (timeDiff > maxAgeMs) {
      throw new ValidationError(
        'Webhook timestamp is too old or too far in the future',
        'INVALID_WEBHOOK_TIMESTAMP'
      );
    }
  }

  static validateSyncResult(result: SyncResult): void {
    this.validateUUID(result.integrationId, 'integrationId');
    this.validateEnum(result.syncType, SyncType, 'syncType');
    
    if (typeof result.success !== 'boolean') {
      throw new ValidationError('success must be a boolean', 'INVALID_TYPE');
    }

    this.validateNumber(result.recordsProcessed, 'recordsProcessed', 0);
    this.validateNumber(result.recordsCreated, 'recordsCreated', 0);
    this.validateNumber(result.recordsUpdated, 'recordsUpdated', 0);
    this.validateNumber(result.recordsDeleted, 'recordsDeleted', 0);
    this.validateNumber(result.duration, 'duration', 0);
    
    if (result.error) {
      this.validateString(result.error, 'error', 1, 1000);
    }

    this.validateDate(result.startTime, 'startTime');
    this.validateDate(result.endTime, 'endTime');

    // Validate time consistency
    if (result.endTime < result.startTime) {
      throw new ValidationError(
        'endTime cannot be before startTime',
        'INVALID_DATE_RANGE'
      );
    }

    // Validate duration matches time difference
    const calculatedDuration = result.endTime.getTime() - result.startTime.getTime();
    const toleranceMs = 1000; // 1 second tolerance
    if (Math.abs(result.duration - calculatedDuration) > toleranceMs) {
      throw new ValidationError(
        'duration does not match the time difference between startTime and endTime',
        'DURATION_MISMATCH'
      );
    }

    // Validate record counts consistency
    const totalChanges = result.recordsCreated + result.recordsUpdated + result.recordsDeleted;
    if (totalChanges > result.recordsProcessed) {
      throw new ValidationError(
        'Total record changes cannot exceed records processed',
        'INVALID_RECORD_COUNTS'
      );
    }

    // Validate success/error consistency
    if (!result.success && !result.error) {
      throw new ValidationError(
        'error is required when success is false',
        'MISSING_ERROR_MESSAGE'
      );
    }
  }

  static validateIntegrationStatus(status: IntegrationStatus): void {
    this.validateUUID(status.integrationId, 'integrationId');
    
    if (typeof status.isConnected !== 'boolean') {
      throw new ValidationError('isConnected must be a boolean', 'INVALID_TYPE');
    }

    if (status.lastSync) {
      this.validateDate(status.lastSync, 'lastSync');
    }

    if (status.lastError) {
      this.validateString(status.lastError, 'lastError', 1, 1000);
    }

    this.validateEnum(
      status.health,
      { healthy: 'healthy', warning: 'warning', error: 'error' },
      'health'
    );

    this.validateStatusMetrics(status.metrics, 'metrics');
  }

  private static validateProviderTypeCompatibility(
    provider: IntegrationProvider,
    type: IntegrationType
  ): void {
    const compatibilityMap: Record<IntegrationProvider, IntegrationType[]> = {
      [IntegrationProvider.GITHUB]: [IntegrationType.VERSION_CONTROL],
      [IntegrationProvider.GITLAB]: [IntegrationType.VERSION_CONTROL],
      [IntegrationProvider.BITBUCKET]: [IntegrationType.VERSION_CONTROL],
      [IntegrationProvider.JIRA]: [IntegrationType.PROJECT_MANAGEMENT],
      [IntegrationProvider.LINEAR]: [IntegrationType.PROJECT_MANAGEMENT],
      [IntegrationProvider.AZURE_DEVOPS]: [IntegrationType.PROJECT_MANAGEMENT, IntegrationType.CI_CD],
      [IntegrationProvider.SLACK]: [IntegrationType.COMMUNICATION],
      [IntegrationProvider.TEAMS]: [IntegrationType.COMMUNICATION],
      [IntegrationProvider.DISCORD]: [IntegrationType.COMMUNICATION],
      [IntegrationProvider.AWS]: [IntegrationType.CLOUD_SERVICE, IntegrationType.CI_CD],
      [IntegrationProvider.GCP]: [IntegrationType.CLOUD_SERVICE, IntegrationType.CI_CD],
      [IntegrationProvider.AZURE]: [IntegrationType.CLOUD_SERVICE, IntegrationType.CI_CD]
    };

    const compatibleTypes = compatibilityMap[provider];
    if (!compatibleTypes.includes(type)) {
      throw new ValidationError(
        `Provider ${provider} is not compatible with type ${type}`,
        'INCOMPATIBLE_PROVIDER_TYPE'
      );
    }
  }

  private static validateCredentialsByType(credentials: Credentials): void {
    switch (credentials.type) {
      case AuthType.OAUTH2:
        if (!credentials.data.clientId || !credentials.data.clientSecret) {
          throw new ValidationError(
            'OAuth2 credentials must include clientId and clientSecret',
            'MISSING_OAUTH2_FIELDS'
          );
        }
        break;

      case AuthType.API_KEY:
        if (!credentials.data.apiKey) {
          throw new ValidationError(
            'API Key credentials must include apiKey',
            'MISSING_API_KEY'
          );
        }
        break;

      case AuthType.BASIC_AUTH:
        if (!credentials.data.username || !credentials.data.password) {
          throw new ValidationError(
            'Basic Auth credentials must include username and password',
            'MISSING_BASIC_AUTH_FIELDS'
          );
        }
        break;

      case AuthType.JWT:
        if (!credentials.data.token) {
          throw new ValidationError(
            'JWT credentials must include token',
            'MISSING_JWT_TOKEN'
          );
        }
        break;
    }
  }

  private static validateRateLimits(
    rateLimits: { requestsPerMinute: number; requestsPerHour: number },
    fieldPrefix: string
  ): void {
    this.validateNumber(rateLimits.requestsPerMinute, `${fieldPrefix}.requestsPerMinute`, 1, 10000);
    this.validateNumber(rateLimits.requestsPerHour, `${fieldPrefix}.requestsPerHour`, 1, 100000);

    // Validate hourly limit is at least as high as minute limit * 60
    if (rateLimits.requestsPerHour < rateLimits.requestsPerMinute * 60) {
      throw new ValidationError(
        'requestsPerHour must be at least requestsPerMinute * 60',
        'INCONSISTENT_RATE_LIMITS'
      );
    }
  }

  private static validateStatusMetrics(
    metrics: {
      totalSyncs: number;
      successfulSyncs: number;
      failedSyncs: number;
      averageSyncDuration: number;
    },
    fieldPrefix: string
  ): void {
    this.validateNumber(metrics.totalSyncs, `${fieldPrefix}.totalSyncs`, 0);
    this.validateNumber(metrics.successfulSyncs, `${fieldPrefix}.successfulSyncs`, 0);
    this.validateNumber(metrics.failedSyncs, `${fieldPrefix}.failedSyncs`, 0);
    this.validateNumber(metrics.averageSyncDuration, `${fieldPrefix}.averageSyncDuration`, 0);

    // Validate sync counts consistency
    if (metrics.successfulSyncs + metrics.failedSyncs > metrics.totalSyncs) {
      throw new ValidationError(
        'successfulSyncs + failedSyncs cannot exceed totalSyncs',
        'INVALID_SYNC_COUNTS'
      );
    }
  }

  private static validateCronExpression(cron: string): void {
    // Basic cron validation - should have 5 or 6 parts
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      throw new ValidationError(
        'frequency must be a valid cron expression with 5 or 6 parts',
        'INVALID_CRON_FORMAT'
      );
    }

    // Validate each part contains valid characters
    const cronRegex = /^[0-9*,/-]+$/;
    for (let i = 0; i < parts.length; i++) {
      if (!cronRegex.test(parts[i])) {
        throw new ValidationError(
          `Invalid cron expression part: ${parts[i]}`,
          'INVALID_CRON_PART'
        );
      }
    }
  }
}