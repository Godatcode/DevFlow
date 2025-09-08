import { AuditLogger } from './audit-logger.js';
import { ComplianceEngine } from './compliance-engine.js';
import { AuditEvent, AuditFilter, ComplianceReport, ComplianceTag, AuditConfig } from './interfaces.js';

export class AuditService {
  private auditLogger: AuditLogger;
  private complianceEngine: ComplianceEngine;
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
    this.auditLogger = new AuditLogger(config);
    this.complianceEngine = new ComplianceEngine();
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Partial<AuditEvent>): Promise<void> {
    await this.auditLogger.logEvent(event);
    
    // Add to compliance engine if event has compliance tags
    if (event.compliance && event.compliance.length > 0) {
      this.complianceEngine.addAuditEvent(event as AuditEvent);
    }
  }

  /**
   * Log authentication event
   */
  async logAuthentication(
    userId: string,
    action: 'login' | 'logout' | 'password_change' | 'mfa_setup' | 'mfa_verify',
    outcome: 'success' | 'failure',
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.auditLogger.logAuthentication(userId, action, outcome, {
      ...details,
      ipAddress,
      userAgent
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
    await this.auditLogger.logAuthorization(userId, action, resource, resourceId, outcome, details);
  }

  /**
   * Log data access event
   */
  async logDataAccess(
    userId: string,
    dataType: string,
    operation: 'read' | 'write' | 'delete' | 'export',
    outcome: 'success' | 'failure',
    options: {
      recordCount?: number;
      containsPII?: boolean;
      containsPHI?: boolean;
      dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
      details?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.auditLogger.logDataAccess(
      userId,
      {
        dataType,
        operation,
        recordCount: options.recordCount,
        containsPII: options.containsPII || false,
        containsPHI: options.containsPHI || false,
        dataClassification: options.dataClassification || 'internal'
      },
      outcome,
      options.details
    );
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    eventType: 'login_attempt' | 'permission_denied' | 'suspicious_activity' | 'data_breach' | 'system_intrusion',
    threatLevel: 'low' | 'medium' | 'high' | 'critical',
    blocked: boolean,
    userId?: string,
    sourceIP?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.auditLogger.logSecurityEvent(
      {
        eventType,
        threatLevel,
        sourceIP,
        blocked
      },
      userId,
      details
    );
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
    await this.auditLogger.logWorkflowExecution(userId, workflowId, action, outcome, details);
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
    await this.auditLogger.logConfigurationChange(userId, configType, action, resourceId, outcome, details);
  }

  /**
   * Get audit events with filtering
   */
  getAuditEvents(filter: AuditFilter): AuditEvent[] {
    return this.complianceEngine.getAuditEvents(filter);
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    reportType: ComplianceTag,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    return await this.complianceEngine.generateComplianceReport(reportType, startDate, endDate);
  }

  /**
   * Validate compliance for events
   */
  async validateCompliance(standard: ComplianceTag, events: AuditEvent[]) {
    return await this.complianceEngine.validateCompliance(standard, events);
  }

  /**
   * Create audit middleware for Express.js
   */
  createAuditMiddleware() {
    const auditService = this;
    
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();
      const originalSend = res.send;

      res.send = function(data: any) {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Log the request
        const auditEvent: Partial<AuditEvent> = {
          userId: req.user?.id,
          sessionId: req.sessionID,
          action: `http_${req.method.toLowerCase()}`,
          resource: req.route?.path || req.path,
          outcome: statusCode < 400 ? 'success' : 'failure',
          details: {
            method: req.method,
            path: req.path,
            statusCode,
            duration,
            userAgent: req.get('User-Agent'),
            contentLength: data ? data.length : 0
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          requestId: req.get('X-Request-ID'),
          severity: statusCode >= 500 ? 'high' : statusCode >= 400 ? 'medium' : 'low',
          category: 'data_access'
        };

        // Don't await to avoid blocking the response
        auditService.logEvent(auditEvent).catch((error: any) => {
          console.error('Failed to log audit event:', error);
        });

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Get audit logger instance
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get compliance engine instance
   */
  getComplianceEngine(): ComplianceEngine {
    return this.complianceEngine;
  }
}