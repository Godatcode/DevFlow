import { createHash, randomUUID } from 'crypto';
import winston from 'winston';
import { AuditEvent, AuditCategory, ComplianceTag, AuditConfig, DataAccessEvent, SecurityEvent } from './interfaces.js';

export class AuditLogger {
  private logger: winston.Logger;
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
    this.logger = this.createLogger();
  }

  /**
   * Create Winston logger with audit-specific configuration
   */
  private createLogger(): winston.Logger {
    const formats = [
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ];

    if (this.config.encryptionEnabled) {
      formats.push(winston.format.printf(info => {
        // In production, you'd use proper encryption here
        return JSON.stringify({
          ...info,
          encrypted: true,
          hash: this.hashSensitiveData(JSON.stringify(info))
        });
      }));
    } else {
      formats.push(winston.format.json());
    }

    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(...formats),
      transports: [
        new winston.transports.File({
          filename: 'logs/audit-error.log',
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 10
        }),
        new winston.transports.File({
          filename: 'logs/audit.log',
          maxsize: 10485760, // 10MB
          maxFiles: 50
        }),
        // In production, you'd also add database transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Partial<AuditEvent>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: event.id || randomUUID(),
      timestamp: event.timestamp || new Date(),
      userId: event.userId,
      sessionId: event.sessionId,
      action: event.action || 'unknown',
      resource: event.resource || 'unknown',
      resourceId: event.resourceId,
      outcome: event.outcome || 'success',
      details: this.sanitizeDetails(event.details),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      requestId: event.requestId,
      severity: event.severity || 'low',
      category: event.category || 'system_configuration',
      compliance: event.compliance || []
    };

    // Add compliance tags based on event category and content
    auditEvent.compliance = this.determineComplianceTags(auditEvent);

    this.logger.info('AUDIT_EVENT', auditEvent);

    // Real-time alerting for critical events
    if (this.config.realTimeAlerting && auditEvent.severity === 'critical') {
      await this.sendRealTimeAlert(auditEvent);
    }
  }

  /**
   * Log authentication event
   */
  async logAuthentication(
    userId: string,
    action: 'login' | 'logout' | 'password_change' | 'mfa_setup' | 'mfa_verify',
    outcome: 'success' | 'failure',
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `auth_${action}`,
      resource: 'authentication',
      outcome,
      details,
      category: 'authentication',
      severity: outcome === 'failure' ? 'medium' : 'low'
    });
  }

  /**
   * Log authorization event
   */
  async logAuthorization(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    outcome: 'success' | 'failure',
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `authz_${action}`,
      resource,
      resourceId,
      outcome,
      details,
      category: 'authorization',
      severity: outcome === 'failure' ? 'medium' : 'low'
    });
  }

  /**
   * Log data access event
   */
  async logDataAccess(
    userId: string,
    dataEvent: DataAccessEvent,
    outcome: 'success' | 'failure',
    details?: Record<string, any>
  ): Promise<void> {
    const severity = this.calculateDataAccessSeverity(dataEvent);
    
    await this.logEvent({
      userId,
      action: `data_${dataEvent.operation}`,
      resource: dataEvent.dataType,
      outcome,
      details: {
        ...details,
        recordCount: dataEvent.recordCount,
        containsPII: dataEvent.containsPII,
        containsPHI: dataEvent.containsPHI,
        dataClassification: dataEvent.dataClassification
      },
      category: 'data_access',
      severity
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    securityEvent: SecurityEvent,
    userId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `security_${securityEvent.eventType}`,
      resource: 'security_system',
      outcome: securityEvent.blocked ? 'success' : 'failure',
      details: {
        ...details,
        threatLevel: securityEvent.threatLevel,
        sourceIP: securityEvent.sourceIP,
        geolocation: securityEvent.geolocation,
        blocked: securityEvent.blocked
      },
      category: 'security_event',
      severity: securityEvent.threatLevel
    });
  }

  /**
   * Log workflow execution event
   */
  async logWorkflowExecution(
    userId: string,
    workflowId: string,
    action: 'start' | 'complete' | 'fail' | 'pause' | 'resume',
    outcome: 'success' | 'failure',
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `workflow_${action}`,
      resource: 'workflow',
      resourceId: workflowId,
      outcome,
      details,
      category: 'workflow_execution',
      severity: outcome === 'failure' ? 'medium' : 'low'
    });
  }

  /**
   * Log system configuration change
   */
  async logConfigurationChange(
    userId: string,
    configType: string,
    action: 'create' | 'update' | 'delete',
    resourceId: string,
    outcome: 'success' | 'failure',
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      userId,
      action: `config_${action}`,
      resource: configType,
      resourceId,
      outcome,
      details,
      category: 'system_configuration',
      severity: 'medium'
    });
  }

  /**
   * Sanitize sensitive data from event details
   */
  private sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
    if (!details) return undefined;

    const sanitized = { ...details };
    
    this.config.sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Remove common sensitive patterns
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /ssn/i,
      /social.security/i,
      /credit.card/i,
      /card.number/i
    ];

    Object.keys(sanitized).forEach(key => {
      if (sensitivePatterns.some(pattern => pattern.test(key))) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Determine compliance tags based on event content
   */
  private determineComplianceTags(event: AuditEvent): ComplianceTag[] {
    const tags: ComplianceTag[] = [];

    // SOC2 - All security and access events
    if (['authentication', 'authorization', 'security_event', 'data_access'].includes(event.category)) {
      tags.push('SOC2');
    }

    // GDPR - Data access events with PII
    if (event.category === 'data_access' && event.details?.containsPII) {
      tags.push('GDPR');
    }

    // HIPAA - Healthcare data access
    if (event.category === 'data_access' && event.details?.containsPHI) {
      tags.push('HIPAA');
    }

    // ISO 27001 - All security-related events
    if (['security_event', 'system_configuration'].includes(event.category)) {
      tags.push('ISO_27001');
    }

    return tags.filter(tag => this.config.complianceStandards.includes(tag));
  }

  /**
   * Calculate severity for data access events
   */
  private calculateDataAccessSeverity(dataEvent: DataAccessEvent): 'low' | 'medium' | 'high' | 'critical' {
    if (dataEvent.containsPHI || dataEvent.dataClassification === 'restricted') {
      return 'critical';
    }
    
    if (dataEvent.containsPII || dataEvent.dataClassification === 'confidential') {
      return 'high';
    }
    
    if (dataEvent.operation === 'delete' || dataEvent.operation === 'export') {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Hash sensitive data for integrity verification
   */
  private hashSensitiveData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Send real-time alert for critical events
   */
  private async sendRealTimeAlert(event: AuditEvent): Promise<void> {
    // In production, this would integrate with alerting systems
    // like PagerDuty, Slack, email, etc.
    console.warn(`🚨 CRITICAL AUDIT EVENT: ${event.action} on ${event.resource} by ${event.userId}`);
  }

  /**
   * Get logger instance for custom logging
   */
  getLogger(): winston.Logger {
    return this.logger;
  }
}