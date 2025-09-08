import { AuditEvent, AuditFilter, ComplianceReport, ComplianceTag, ComplianceSummary, ComplianceFinding } from './interfaces.js';
import { randomUUID } from 'crypto';

export class ComplianceEngine {
  private auditEvents: AuditEvent[] = []; // In production, this would be a database

  /**
   * Add audit event to the compliance engine
   */
  addAuditEvent(event: AuditEvent): void {
    this.auditEvents.push(event);
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    reportType: ComplianceTag,
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const relevantEvents = this.getRelevantEvents(reportType, startDate, endDate);
    const summary = this.generateSummary(relevantEvents);
    const findings = await this.analyzeCompliance(reportType, relevantEvents);
    const recommendations = this.generateRecommendations(reportType, findings);

    return {
      id: randomUUID(),
      reportType,
      generatedAt: new Date(),
      period: { startDate, endDate },
      summary,
      findings,
      recommendations
    };
  }

  /**
   * Validate compliance for specific standard
   */
  async validateCompliance(standard: ComplianceTag, events: AuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    switch (standard) {
      case 'SOC2':
        findings.push(...await this.validateSOC2Compliance(events));
        break;
      case 'GDPR':
        findings.push(...await this.validateGDPRCompliance(events));
        break;
      case 'HIPAA':
        findings.push(...await this.validateHIPAACompliance(events));
        break;
      case 'PCI_DSS':
        findings.push(...await this.validatePCIDSSCompliance(events));
        break;
      case 'ISO_27001':
        findings.push(...await this.validateISO27001Compliance(events));
        break;
    }

    return findings;
  }

  /**
   * Get audit events with filters
   */
  getAuditEvents(filter: AuditFilter): AuditEvent[] {
    let filteredEvents = [...this.auditEvents];

    if (filter.startDate) {
      filteredEvents = filteredEvents.filter(event => event.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      filteredEvents = filteredEvents.filter(event => event.timestamp <= filter.endDate!);
    }

    if (filter.userId) {
      filteredEvents = filteredEvents.filter(event => event.userId === filter.userId);
    }

    if (filter.action) {
      filteredEvents = filteredEvents.filter(event => event.action.includes(filter.action!));
    }

    if (filter.resource) {
      filteredEvents = filteredEvents.filter(event => event.resource === filter.resource);
    }

    if (filter.outcome) {
      filteredEvents = filteredEvents.filter(event => event.outcome === filter.outcome);
    }

    if (filter.category) {
      filteredEvents = filteredEvents.filter(event => event.category === filter.category);
    }

    if (filter.compliance) {
      filteredEvents = filteredEvents.filter(event => 
        event.compliance?.includes(filter.compliance!)
      );
    }

    if (filter.severity) {
      filteredEvents = filteredEvents.filter(event => event.severity === filter.severity);
    }

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return filteredEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);
  }

  /**
   * Get relevant events for compliance report
   */
  private getRelevantEvents(reportType: ComplianceTag, startDate: Date, endDate: Date): AuditEvent[] {
    return this.auditEvents.filter(event => 
      event.timestamp >= startDate &&
      event.timestamp <= endDate &&
      event.compliance?.includes(reportType)
    );
  }

  /**
   * Generate compliance summary
   */
  private generateSummary(events: AuditEvent[]): ComplianceSummary {
    const totalEvents = events.length;
    const successfulEvents = events.filter(e => e.outcome === 'success').length;
    const failedEvents = events.filter(e => e.outcome === 'failure').length;
    const criticalEvents = events.filter(e => e.severity === 'critical').length;

    // Calculate compliance score (simplified algorithm)
    const successRate = totalEvents > 0 ? successfulEvents / totalEvents : 1;
    const criticalRate = totalEvents > 0 ? criticalEvents / totalEvents : 0;
    const complianceScore = Math.max(0, Math.min(100, (successRate * 100) - (criticalRate * 50)));

    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (complianceScore < 50) riskLevel = 'critical';
    else if (complianceScore < 70) riskLevel = 'high';
    else if (complianceScore < 90) riskLevel = 'medium';

    return {
      totalEvents,
      successfulEvents,
      failedEvents,
      criticalEvents,
      complianceScore,
      riskLevel
    };
  }

  /**
   * Analyze compliance and generate findings
   */
  private async analyzeCompliance(reportType: ComplianceTag, events: AuditEvent[]): Promise<ComplianceFinding[]> {
    return await this.validateCompliance(reportType, events);
  }

  /**
   * Validate SOC2 compliance
   */
  private async validateSOC2Compliance(events: AuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Check for failed authentication attempts
    const failedAuthEvents = events.filter(e => 
      e.category === 'authentication' && e.outcome === 'failure'
    );

    if (failedAuthEvents.length > 10) {
      findings.push({
        id: randomUUID(),
        type: 'warning',
        severity: 'medium',
        description: `High number of failed authentication attempts detected (${failedAuthEvents.length})`,
        affectedEvents: failedAuthEvents.map(e => e.id),
        remediation: 'Review authentication logs and consider implementing additional security measures'
      });
    }

    // Check for unauthorized access attempts
    const unauthorizedEvents = events.filter(e => 
      e.category === 'authorization' && e.outcome === 'failure'
    );

    if (unauthorizedEvents.length > 5) {
      findings.push({
        id: randomUUID(),
        type: 'violation',
        severity: 'high',
        description: `Unauthorized access attempts detected (${unauthorizedEvents.length})`,
        affectedEvents: unauthorizedEvents.map(e => e.id),
        remediation: 'Investigate unauthorized access attempts and review access controls'
      });
    }

    // Check for missing audit logs
    const currentTime = new Date();
    const oneHourAgo = new Date(currentTime.getTime() - 60 * 60 * 1000);
    const recentEvents = events.filter(e => e.timestamp >= oneHourAgo);

    if (recentEvents.length === 0) {
      findings.push({
        id: randomUUID(),
        type: 'warning',
        severity: 'medium',
        description: 'No audit events recorded in the last hour',
        affectedEvents: [],
        remediation: 'Verify audit logging system is functioning correctly'
      });
    }

    return findings;
  }

  /**
   * Validate GDPR compliance
   */
  private async validateGDPRCompliance(events: AuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Check for PII access without proper authorization
    const piiAccessEvents = events.filter(e => 
      e.category === 'data_access' && 
      e.details?.containsPII === true
    );

    const unauthorizedPIIAccess = piiAccessEvents.filter(e => e.outcome === 'failure');
    
    if (unauthorizedPIIAccess.length > 0) {
      findings.push({
        id: randomUUID(),
        type: 'violation',
        severity: 'critical',
        description: `Unauthorized PII access attempts detected (${unauthorizedPIIAccess.length})`,
        affectedEvents: unauthorizedPIIAccess.map(e => e.id),
        remediation: 'Investigate unauthorized PII access and strengthen data protection controls'
      });
    }

    // Check for data exports without proper logging
    const dataExportEvents = events.filter(e => 
      e.action.includes('export') && 
      e.details?.containsPII === true
    );

    dataExportEvents.forEach(event => {
      if (!event.details?.exportReason || !event.details?.dataSubject) {
        findings.push({
          id: randomUUID(),
          type: 'violation',
          severity: 'high',
          description: 'PII export without proper documentation',
          affectedEvents: [event.id],
          remediation: 'Ensure all PII exports include reason and data subject information'
        });
      }
    });

    return findings;
  }

  /**
   * Validate HIPAA compliance
   */
  private async validateHIPAACompliance(events: AuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Check for PHI access
    const phiAccessEvents = events.filter(e => 
      e.category === 'data_access' && 
      e.details?.containsPHI === true
    );

    // Check for minimum necessary principle
    const bulkPHIAccess = phiAccessEvents.filter(e => 
      e.details?.recordCount && e.details.recordCount > 100
    );

    if (bulkPHIAccess.length > 0) {
      findings.push({
        id: randomUUID(),
        type: 'warning',
        severity: 'medium',
        description: `Bulk PHI access detected (${bulkPHIAccess.length} events)`,
        affectedEvents: bulkPHIAccess.map(e => e.id),
        remediation: 'Review bulk PHI access for minimum necessary compliance'
      });
    }

    // Check for unauthorized PHI access
    const unauthorizedPHIAccess = phiAccessEvents.filter(e => e.outcome === 'failure');
    
    if (unauthorizedPHIAccess.length > 0) {
      findings.push({
        id: randomUUID(),
        type: 'violation',
        severity: 'critical',
        description: `Unauthorized PHI access attempts (${unauthorizedPHIAccess.length})`,
        affectedEvents: unauthorizedPHIAccess.map(e => e.id),
        remediation: 'Investigate unauthorized PHI access and strengthen access controls'
      });
    }

    return findings;
  }

  /**
   * Validate PCI DSS compliance
   */
  private async validatePCIDSSCompliance(events: AuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Check for payment data access
    const paymentDataEvents = events.filter(e => 
      e.resource.includes('payment') || 
      e.resource.includes('card') ||
      e.details?.dataType === 'payment'
    );

    // Check for unencrypted payment data access
    paymentDataEvents.forEach(event => {
      if (!event.details?.encrypted) {
        findings.push({
          id: randomUUID(),
          type: 'violation',
          severity: 'critical',
          description: 'Payment data accessed without encryption',
          affectedEvents: [event.id],
          remediation: 'Ensure all payment data access is encrypted'
        });
      }
    });

    return findings;
  }

  /**
   * Validate ISO 27001 compliance
   */
  private async validateISO27001Compliance(events: AuditEvent[]): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Check for security incidents
    const securityEvents = events.filter(e => e.category === 'security_event');
    const criticalSecurityEvents = securityEvents.filter(e => e.severity === 'critical');

    if (criticalSecurityEvents.length > 0) {
      findings.push({
        id: randomUUID(),
        type: 'violation',
        severity: 'critical',
        description: `Critical security incidents detected (${criticalSecurityEvents.length})`,
        affectedEvents: criticalSecurityEvents.map(e => e.id),
        remediation: 'Investigate critical security incidents and implement corrective measures'
      });
    }

    // Check for configuration changes without approval
    const configEvents = events.filter(e => 
      e.category === 'system_configuration' && 
      !e.details?.approvalId
    );

    if (configEvents.length > 0) {
      findings.push({
        id: randomUUID(),
        type: 'warning',
        severity: 'medium',
        description: `Configuration changes without approval (${configEvents.length})`,
        affectedEvents: configEvents.map(e => e.id),
        remediation: 'Ensure all configuration changes have proper approval'
      });
    }

    return findings;
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(reportType: ComplianceTag, findings: ComplianceFinding[]): string[] {
    const recommendations: string[] = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');

    if (criticalFindings.length > 0) {
      recommendations.push('Address all critical compliance violations immediately');
      recommendations.push('Conduct security incident response procedures');
      recommendations.push('Review and strengthen access controls');
    }

    if (highFindings.length > 0) {
      recommendations.push('Implement additional monitoring for high-risk activities');
      recommendations.push('Provide additional compliance training to staff');
    }

    // Standard-specific recommendations
    switch (reportType) {
      case 'SOC2':
        recommendations.push('Implement continuous monitoring for security controls');
        recommendations.push('Regular review of access permissions');
        break;
      case 'GDPR':
        recommendations.push('Implement data minimization practices');
        recommendations.push('Ensure proper consent management');
        break;
      case 'HIPAA':
        recommendations.push('Implement minimum necessary access controls');
        recommendations.push('Regular PHI access audits');
        break;
      case 'PCI_DSS':
        recommendations.push('Implement end-to-end encryption for payment data');
        recommendations.push('Regular vulnerability assessments');
        break;
      case 'ISO_27001':
        recommendations.push('Implement formal change management processes');
        recommendations.push('Regular security risk assessments');
        break;
    }

    return recommendations;
  }
}