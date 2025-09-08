export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'error';
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: AuditCategory;
  compliance?: ComplianceTag[];
}

export type AuditCategory = 
  | 'authentication'
  | 'authorization' 
  | 'data_access'
  | 'data_modification'
  | 'system_configuration'
  | 'user_management'
  | 'integration'
  | 'workflow_execution'
  | 'security_event'
  | 'compliance_check';

export type ComplianceTag = 
  | 'SOC2'
  | 'GDPR'
  | 'HIPAA'
  | 'PCI_DSS'
  | 'ISO_27001';

export interface AuditFilter {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: string;
  resource?: string;
  outcome?: 'success' | 'failure' | 'error';
  category?: AuditCategory;
  compliance?: ComplianceTag;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  limit?: number;
  offset?: number;
}

export interface ComplianceReport {
  id: string;
  reportType: ComplianceTag;
  generatedAt: Date;
  period: {
    startDate: Date;
    endDate: Date;
  };
  summary: ComplianceSummary;
  findings: ComplianceFinding[];
  recommendations: string[];
}

export interface ComplianceSummary {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  criticalEvents: number;
  complianceScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplianceFinding {
  id: string;
  type: 'violation' | 'warning' | 'recommendation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedEvents: string[];
  remediation?: string;
  dueDate?: Date;
}

export interface AuditConfig {
  retentionPeriodDays: number;
  encryptionEnabled: boolean;
  compressionEnabled: boolean;
  realTimeAlerting: boolean;
  complianceStandards: ComplianceTag[];
  sensitiveFields: string[];
}

export interface DataAccessEvent {
  dataType: string;
  operation: 'read' | 'write' | 'delete' | 'export';
  recordCount?: number;
  containsPII: boolean;
  containsPHI: boolean;
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface SecurityEvent {
  eventType: 'login_attempt' | 'permission_denied' | 'suspicious_activity' | 'data_breach' | 'system_intrusion';
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  sourceIP?: string;
  geolocation?: string;
  blocked: boolean;
}