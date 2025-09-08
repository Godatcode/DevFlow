import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceEngine } from '../compliance-engine.js';
import { AuditEvent } from '../interfaces.js';

describe('ComplianceEngine', () => {
  let complianceEngine: ComplianceEngine;

  beforeEach(() => {
    complianceEngine = new ComplianceEngine();
  });

  describe('generateComplianceReport', () => {
    it('should generate SOC2 compliance report', async () => {
      // Add some test events
      const events: AuditEvent[] = [
        {
          id: '1',
          timestamp: new Date(),
          userId: 'user1',
          action: 'auth_login',
          resource: 'authentication',
          outcome: 'success',
          category: 'authentication',
          severity: 'low',
          compliance: ['SOC2']
        },
        {
          id: '2',
          timestamp: new Date(),
          userId: 'user2',
          action: 'auth_login',
          resource: 'authentication',
          outcome: 'failure',
          category: 'authentication',
          severity: 'medium',
          compliance: ['SOC2']
        }
      ];

      events.forEach(event => complianceEngine.addAuditEvent(event));

      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();

      const report = await complianceEngine.generateComplianceReport('SOC2', startDate, endDate);

      expect(report.reportType).toBe('SOC2');
      expect(report.summary.totalEvents).toBe(2);
      expect(report.summary.successfulEvents).toBe(1);
      expect(report.summary.failedEvents).toBe(1);
      expect(report.findings).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });
  });

  describe('validateSOC2Compliance', () => {
    it('should detect high number of failed authentication attempts', async () => {
      const events: AuditEvent[] = [];
      
      // Create 15 failed authentication events
      for (let i = 0; i < 15; i++) {
        events.push({
          id: `failed-auth-${i}`,
          timestamp: new Date(),
          userId: `user${i}`,
          action: 'auth_login',
          resource: 'authentication',
          outcome: 'failure',
          category: 'authentication',
          severity: 'medium',
          compliance: ['SOC2']
        });
      }

      const findings = await complianceEngine.validateCompliance('SOC2', events);
      
      const failedAuthFinding = findings.find(f => 
        f.description.includes('failed authentication attempts')
      );
      
      expect(failedAuthFinding).toBeDefined();
      expect(failedAuthFinding?.severity).toBe('medium');
      expect(failedAuthFinding?.type).toBe('warning');
    });

    it('should detect unauthorized access attempts', async () => {
      const events: AuditEvent[] = [];
      
      // Create 10 unauthorized access events
      for (let i = 0; i < 10; i++) {
        events.push({
          id: `unauth-${i}`,
          timestamp: new Date(),
          userId: `user${i}`,
          action: 'authz_access',
          resource: 'sensitive_data',
          outcome: 'failure',
          category: 'authorization',
          severity: 'high',
          compliance: ['SOC2']
        });
      }

      const findings = await complianceEngine.validateCompliance('SOC2', events);
      
      const unauthorizedFinding = findings.find(f => 
        f.description.includes('Unauthorized access attempts')
      );
      
      expect(unauthorizedFinding).toBeDefined();
      expect(unauthorizedFinding?.severity).toBe('high');
      expect(unauthorizedFinding?.type).toBe('violation');
    });
  });

  describe('validateGDPRCompliance', () => {
    it('should detect unauthorized PII access', async () => {
      const events: AuditEvent[] = [
        {
          id: 'pii-violation',
          timestamp: new Date(),
          userId: 'user1',
          action: 'data_read',
          resource: 'user_profiles',
          outcome: 'failure',
          category: 'data_access',
          severity: 'high',
          compliance: ['GDPR'],
          details: {
            containsPII: true
          }
        }
      ];

      const findings = await complianceEngine.validateCompliance('GDPR', events);
      
      const piiFinding = findings.find(f => 
        f.description.includes('Unauthorized PII access')
      );
      
      expect(piiFinding).toBeDefined();
      expect(piiFinding?.severity).toBe('critical');
      expect(piiFinding?.type).toBe('violation');
    });

    it('should detect PII export without proper documentation', async () => {
      const events: AuditEvent[] = [
        {
          id: 'pii-export',
          timestamp: new Date(),
          userId: 'user1',
          action: 'data_export',
          resource: 'user_data',
          outcome: 'success',
          category: 'data_access',
          severity: 'medium',
          compliance: ['GDPR'],
          details: {
            containsPII: true
            // Missing exportReason and dataSubject
          }
        }
      ];

      const findings = await complianceEngine.validateCompliance('GDPR', events);
      
      const exportFinding = findings.find(f => 
        f.description.includes('PII export without proper documentation')
      );
      
      expect(exportFinding).toBeDefined();
      expect(exportFinding?.severity).toBe('high');
      expect(exportFinding?.type).toBe('violation');
    });
  });

  describe('validateHIPAACompliance', () => {
    it('should detect bulk PHI access', async () => {
      const events: AuditEvent[] = [
        {
          id: 'bulk-phi',
          timestamp: new Date(),
          userId: 'user1',
          action: 'data_read',
          resource: 'medical_records',
          outcome: 'success',
          category: 'data_access',
          severity: 'medium',
          compliance: ['HIPAA'],
          details: {
            containsPHI: true,
            recordCount: 500
          }
        }
      ];

      const findings = await complianceEngine.validateCompliance('HIPAA', events);
      
      const bulkFinding = findings.find(f => 
        f.description.includes('Bulk PHI access')
      );
      
      expect(bulkFinding).toBeDefined();
      expect(bulkFinding?.severity).toBe('medium');
      expect(bulkFinding?.type).toBe('warning');
    });

    it('should detect unauthorized PHI access', async () => {
      const events: AuditEvent[] = [
        {
          id: 'phi-violation',
          timestamp: new Date(),
          userId: 'user1',
          action: 'data_read',
          resource: 'medical_records',
          outcome: 'failure',
          category: 'data_access',
          severity: 'critical',
          compliance: ['HIPAA'],
          details: {
            containsPHI: true
          }
        }
      ];

      const findings = await complianceEngine.validateCompliance('HIPAA', events);
      
      const phiFinding = findings.find(f => 
        f.description.includes('Unauthorized PHI access')
      );
      
      expect(phiFinding).toBeDefined();
      expect(phiFinding?.severity).toBe('critical');
      expect(phiFinding?.type).toBe('violation');
    });
  });

  describe('getAuditEvents', () => {
    beforeEach(() => {
      // Add test events
      const events: AuditEvent[] = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 60000), // 1 minute ago
          userId: 'user1',
          action: 'auth_login',
          resource: 'authentication',
          outcome: 'success',
          category: 'authentication',
          severity: 'low',
          compliance: ['SOC2']
        },
        {
          id: '2',
          timestamp: new Date(),
          userId: 'user2',
          action: 'data_read',
          resource: 'user_data',
          outcome: 'success',
          category: 'data_access',
          severity: 'medium',
          compliance: ['GDPR']
        }
      ];

      events.forEach(event => complianceEngine.addAuditEvent(event));
    });

    it('should filter events by user ID', () => {
      const events = complianceEngine.getAuditEvents({ userId: 'user1' });
      
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('user1');
    });

    it('should filter events by category', () => {
      const events = complianceEngine.getAuditEvents({ category: 'authentication' });
      
      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('authentication');
    });

    it('should filter events by compliance standard', () => {
      const events = complianceEngine.getAuditEvents({ compliance: 'GDPR' });
      
      expect(events).toHaveLength(1);
      expect(events[0].compliance).toContain('GDPR');
    });

    it('should apply pagination', () => {
      const events = complianceEngine.getAuditEvents({ limit: 1, offset: 0 });
      
      expect(events).toHaveLength(1);
    });
  });
});