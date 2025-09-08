import { UUID, WorkflowStatus } from '@devflow/shared-types';

export enum ReportType {
  WORKFLOW_SUMMARY = 'workflow_summary',
  TEAM_PERFORMANCE = 'team_performance',
  PROJECT_STATUS = 'project_status',
  CUSTOM = 'custom'
}

export enum ReportFrequency {
  REAL_TIME = 'real_time',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

export enum DeliveryMethod {
  EMAIL = 'email',
  SLACK = 'slack',
  TEAMS = 'teams',
  WEBHOOK = 'webhook',
  DASHBOARD = 'dashboard'
}

export interface ReportTemplate {
  id: UUID;
  name: string;
  type: ReportType;
  description: string;
  sections: ReportSection[];
  filters: ReportFilters;
  formatting: ReportFormatting;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'chart' | 'table' | 'metric' | 'text';
  dataSource: string;
  config: Record<string, any>;
  order: number;
}

export interface ReportFilters {
  teamIds?: UUID[];
  projectIds?: UUID[];
  workflowIds?: UUID[];
  dateRange?: DateRange;
  statuses?: WorkflowStatus[];
  customFilters?: Record<string, any>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ReportFormatting {
  theme: 'light' | 'dark';
  colorScheme: string[];
  fontSize: 'small' | 'medium' | 'large';
  includeCharts: boolean;
  includeTables: boolean;
  includeMetrics: boolean;
}

export interface ReportSchedule {
  id: UUID;
  templateId: UUID;
  name: string;
  frequency: ReportFrequency;
  deliveryMethods: DeliveryConfig[];
  recipients: string[];
  isActive: boolean;
  nextRunAt: Date;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryConfig {
  method: DeliveryMethod;
  config: Record<string, any>;
}

export interface GeneratedReport {
  id: UUID;
  templateId: UUID;
  scheduleId?: UUID;
  title: string;
  content: ReportContent;
  metadata: ReportMetadata;
  generatedAt: Date;
  expiresAt?: Date;
}

export interface ReportContent {
  sections: GeneratedReportSection[];
  summary: ReportSummary;
  rawData?: Record<string, any>;
}

export interface GeneratedReportSection {
  id: string;
  title: string;
  type: string;
  data: any;
  visualization?: any;
}

export interface ReportSummary {
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  averageExecutionTime: number;
  successRate: number;
  keyInsights: string[];
}

export interface ReportMetadata {
  generationTime: number;
  dataPoints: number;
  filters: ReportFilters;
  version: string;
}

export interface ReportGenerator {
  generateReport(templateId: UUID, filters?: ReportFilters): Promise<GeneratedReport>;
  generateFromTemplate(template: ReportTemplate, filters?: ReportFilters): Promise<GeneratedReport>;
  getReportData(dataSource: string, filters: ReportFilters): Promise<any>;
}

export interface ReportScheduler {
  createSchedule(schedule: Omit<ReportSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ReportSchedule>;
  updateSchedule(scheduleId: UUID, updates: Partial<ReportSchedule>): Promise<ReportSchedule>;
  deleteSchedule(scheduleId: UUID): Promise<void>;
  getSchedule(scheduleId: UUID): Promise<ReportSchedule | null>;
  getActiveSchedules(): Promise<ReportSchedule[]>;
  executeSchedule(scheduleId: UUID): Promise<GeneratedReport>;
}

export interface ReportDeliveryService {
  deliverReport(report: GeneratedReport, deliveryConfig: DeliveryConfig, recipients: string[]): Promise<void>;
  sendEmail(report: GeneratedReport, recipients: string[]): Promise<void>;
  sendSlackMessage(report: GeneratedReport, config: any, recipients: string[]): Promise<void>;
  sendTeamsMessage(report: GeneratedReport, config: any, recipients: string[]): Promise<void>;
  sendWebhook(report: GeneratedReport, config: any): Promise<void>;
}

export interface ReportTemplateManager {
  createTemplate(template: Omit<ReportTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ReportTemplate>;
  updateTemplate(templateId: UUID, updates: Partial<ReportTemplate>): Promise<ReportTemplate>;
  deleteTemplate(templateId: UUID): Promise<void>;
  getTemplate(templateId: UUID): Promise<ReportTemplate | null>;
  getTemplates(filters?: { type?: ReportType; teamId?: UUID }): Promise<ReportTemplate[]>;
  cloneTemplate(templateId: UUID, name: string): Promise<ReportTemplate>;
}