import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditService } from '../audit-service.js';
import { AuditConfig } from '../interfaces.js';

describe('AuditService', () => {
  let auditService: AuditService;
  let config: AuditConfig;

  beforeEach(() => {
    config = {
      retentionPeriodDays: 365,
      encryptionEnabled: false,
      compressionEnabled: false,
      realTimeAlerting: false,
      complianceStandards: ['SOC2', 'GDPR', 'HIPAA'],
      sensitiveFields: ['password', 'ssn', 'creditCard']
    };
    auditService = new AuditService(config);
  });

  describe('logEvent', () => {
    it('should log event through audit logger', async () => {
      const loggerSpy = vi.spyOn(auditService.getAuditLogger(), 'logEvent');

      await auditService.logEvent({
        action: 'test_action',
        resource: 'test_resource',
        outcome: 'success'
      });

      expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({
        action: 'test_action',
        resource: 'test_resource',
        outcome: 'success'
      }));
    });
  });

  describe('logAuthentication', () => {
    it('should log authentication with IP and user agent', async () => {
      const loggerSpy = vi.spyOn(auditService.getAuditLogger(), 'logAuthentication');

      await auditService.logAuthentication(
        'user123',
        'login',
        'success',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'user123',
        'login',
        'success',
        expect.objectContaining({
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        })
      );
    });
  });

  describe('logDataAccess', () => {
    it('should log data access with all options', async () => {
      const loggerSpy = vi.spyOn(auditService.getAuditLogger(), 'logDataAccess');

      await auditService.logDataAccess(
        'user123',
        'user_profiles',
        'read',
        'success',
        {
          recordCount: 10,
          containsPII: true,
          containsPHI: false,
          dataClassification: 'confidential',
          details: { query: 'SELECT * FROM users' }
        }
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          dataType: 'user_profiles',
          operation: 'read',
          recordCount: 10,
          containsPII: true,
          containsPHI: false,
          dataClassification: 'confidential'
        }),
        'success',
        expect.objectContaining({
          query: 'SELECT * FROM users'
        })
      );
    });

    it('should use default values for optional parameters', async () => {
      const loggerSpy = vi.spyOn(auditService.getAuditLogger(), 'logDataAccess');

      await auditService.logDataAccess(
        'user123',
        'public_data',
        'read',
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          dataType: 'public_data',
          operation: 'read',
          containsPII: false,
          containsPHI: false,
          dataClassification: 'internal'
        }),
        'success',
        undefined
      );
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security event with all parameters', async () => {
      const loggerSpy = vi.spyOn(auditService.getAuditLogger(), 'logSecurityEvent');

      await auditService.logSecurityEvent(
        'suspicious_activity',
        'high',
        true,
        'user123',
        '192.168.1.100',
        { reason: 'Multiple failed login attempts' }
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'suspicious_activity',
          threatLevel: 'high',
          sourceIP: '192.168.1.100',
          blocked: true
        }),
        'user123',
        expect.objectContaining({
          reason: 'Multiple failed login attempts'
        })
      );
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate compliance report', async () => {
      const engineSpy = vi.spyOn(auditService.getComplianceEngine(), 'generateComplianceReport');
      
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = new Date();

      await auditService.generateComplianceReport('SOC2', startDate, endDate);

      expect(engineSpy).toHaveBeenCalledWith('SOC2', startDate, endDate);
    });
  });

  describe('getAuditEvents', () => {
    it('should get filtered audit events', () => {
      const engineSpy = vi.spyOn(auditService.getComplianceEngine(), 'getAuditEvents');
      
      const filter = {
        userId: 'user123',
        category: 'authentication' as const,
        limit: 50
      };

      auditService.getAuditEvents(filter);

      expect(engineSpy).toHaveBeenCalledWith(filter);
    });
  });

  describe('createAuditMiddleware', () => {
    it('should create Express middleware function', () => {
      const middleware = auditService.createAuditMiddleware();
      
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // req, res, next
    });

    it('should log HTTP requests', async () => {
      const middleware = auditService.createAuditMiddleware();
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue();

      const mockReq = {
        method: 'GET',
        path: '/api/users',
        route: { path: '/api/users' },
        user: { id: 'user123' },
        sessionID: 'session123',
        ip: '192.168.1.1',
        get: vi.fn().mockReturnValue('Mozilla/5.0')
      };

      const mockRes = {
        statusCode: 200,
        send: vi.fn()
      };

      const mockNext = vi.fn();

      // Call middleware
      middleware(mockReq, mockRes, mockNext);

      // Simulate response
      const originalSend = mockRes.send;
      mockRes.send('response data');

      expect(mockNext).toHaveBeenCalled();
      
      // Wait for async logging
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(logEventSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user123',
        action: 'http_get',
        resource: '/api/users',
        outcome: 'success'
      }));
    });
  });

  describe('component access', () => {
    it('should provide access to audit logger', () => {
      const logger = auditService.getAuditLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.logEvent).toBe('function');
    });

    it('should provide access to compliance engine', () => {
      const engine = auditService.getComplianceEngine();
      expect(engine).toBeDefined();
      expect(typeof engine.generateComplianceReport).toBe('function');
    });
  });
});