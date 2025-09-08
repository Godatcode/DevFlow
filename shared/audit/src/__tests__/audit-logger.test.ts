import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditLogger } from '../audit-logger.js';
import { AuditConfig } from '../interfaces.js';

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;
  let config: AuditConfig;

  beforeEach(() => {
    config = {
      retentionPeriodDays: 365,
      encryptionEnabled: false,
      compressionEnabled: false,
      realTimeAlerting: false,
      complianceStandards: ['SOC2', 'GDPR'],
      sensitiveFields: ['password', 'ssn', 'creditCard']
    };
    auditLogger = new AuditLogger(config);
  });

  describe('logEvent', () => {
    it('should log a basic audit event', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logEvent({
        action: 'test_action',
        resource: 'test_resource',
        outcome: 'success',
        category: 'data_access'
      });

      expect(loggerSpy).toHaveBeenCalledWith('AUDIT_EVENT', expect.objectContaining({
        action: 'test_action',
        resource: 'test_resource',
        outcome: 'success',
        category: 'data_access'
      }));
    });

    it('should generate ID and timestamp if not provided', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logEvent({
        action: 'test_action',
        resource: 'test_resource'
      });

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.id).toBeDefined();
      expect(loggedEvent.timestamp).toBeInstanceOf(Date);
    });

    it('should sanitize sensitive data', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logEvent({
        action: 'test_action',
        resource: 'test_resource',
        details: {
          password: 'secret123',
          username: 'testuser',
          ssn: '123-45-6789'
        }
      });

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.details.password).toBe('[REDACTED]');
      expect(loggedEvent.details.username).toBe('testuser');
      expect(loggedEvent.details.ssn).toBe('[REDACTED]');
    });
  });

  describe('logAuthentication', () => {
    it('should log authentication event', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logAuthentication('user123', 'login', 'success');

      expect(loggerSpy).toHaveBeenCalledWith('AUDIT_EVENT', expect.objectContaining({
        userId: 'user123',
        action: 'auth_login',
        resource: 'authentication',
        outcome: 'success',
        category: 'authentication'
      }));
    });

    it('should set higher severity for failed authentication', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logAuthentication('user123', 'login', 'failure');

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.severity).toBe('medium');
    });
  });

  describe('logDataAccess', () => {
    it('should log data access event with PII', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logDataAccess(
        'user123',
        {
          dataType: 'user_profiles',
          operation: 'read',
          containsPII: true,
          containsPHI: false,
          dataClassification: 'confidential'
        },
        'success'
      );

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.action).toBe('data_read');
      expect(loggedEvent.details.containsPII).toBe(true);
      expect(loggedEvent.severity).toBe('high');
    });

    it('should set critical severity for PHI access', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logDataAccess(
        'user123',
        {
          dataType: 'medical_records',
          operation: 'read',
          containsPII: false,
          containsPHI: true,
          dataClassification: 'restricted'
        },
        'success'
      );

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.severity).toBe('critical');
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logSecurityEvent(
        {
          eventType: 'suspicious_activity',
          threatLevel: 'high',
          sourceIP: '192.168.1.100',
          blocked: true
        },
        'user123'
      );

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.action).toBe('security_suspicious_activity');
      expect(loggedEvent.category).toBe('security_event');
      expect(loggedEvent.severity).toBe('high');
      expect(loggedEvent.outcome).toBe('success'); // blocked = success
    });
  });

  describe('compliance tag determination', () => {
    it('should add SOC2 tag for authentication events', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logAuthentication('user123', 'login', 'success');

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.compliance).toContain('SOC2');
    });

    it('should add GDPR tag for PII data access', async () => {
      const loggerSpy = vi.spyOn(auditLogger.getLogger(), 'info');

      await auditLogger.logDataAccess(
        'user123',
        {
          dataType: 'user_data',
          operation: 'read',
          containsPII: true,
          containsPHI: false,
          dataClassification: 'internal'
        },
        'success'
      );

      const loggedEvent = loggerSpy.mock.calls[0][1];
      expect(loggedEvent.compliance).toContain('GDPR');
    });
  });
});