import { BaseEntity, UUID } from './common';

export enum MetricType {
  DORA_DEPLOYMENT_FREQUENCY = 'dora_deployment_frequency',
  DORA_LEAD_TIME = 'dora_lead_time',
  DORA_CHANGE_FAILURE_RATE = 'dora_change_failure_rate',
  DORA_RECOVERY_TIME = 'dora_recovery_time',
  CODE_QUALITY = 'code_quality',
  TECHNICAL_DEBT = 'technical_debt',
  TEAM_VELOCITY = 'team_velocity',
  DEVELOPER_SATISFACTION = 'developer_satisfaction'
}

export enum ReportType {
  DORA_METRICS = 'dora_metrics',
  TEAM_PERFORMANCE = 'team_performance',
  PROJECT_HEALTH = 'project_health',
  TECHNICAL_DEBT = 'technical_debt',
  TIMELINE_PREDICTION = 'timeline_prediction'
}

export interface MetricData extends BaseEntity {
  type: MetricType;
  value: number;
  unit: string;
  projectId: UUID;
  teamId: UUID;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface DORAMetrics {
  deploymentFrequency: number;
  leadTimeForChanges: number; // in hours
  changeFailureRate: number; // percentage
  timeToRestoreService: number; // in hours
  period: {
    start: Date;
    end: Date;
  };
}

export interface SPACEMetrics {
  satisfaction: number; // 1-10 scale
  performance: number; // tasks completed per sprint
  activity: number; // commits, PRs, reviews per week
  communication: number; // collaboration score
  efficiency: number; // time to complete tasks
}

export interface TechnicalDebtAnalysis {
  totalDebtHours: number;
  debtRatio: number; // percentage of codebase
  criticalIssues: number;
  recommendations: TechnicalDebtRecommendation[];
  trends: {
    lastMonth: number;
    lastQuarter: number;
  };
}

export interface TechnicalDebtRecommendation {
  type: string;
  description: string;
  estimatedEffort: number; // hours
  priority: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
}

export interface TimelinePrediction {
  projectId: UUID;
  estimatedCompletionDate: Date;
  confidenceLevel: number; // percentage
  factors: PredictionFactor[];
  scenarios: {
    optimistic: Date;
    realistic: Date;
    pessimistic: Date;
  };
}

export interface PredictionFactor {
  name: string;
  impact: number; // -1 to 1
  description: string;
}

export interface ReportFilters {
  projectIds?: UUID[];
  teamIds?: UUID[];
  dateRange: {
    start: Date;
    end: Date;
  };
  metricTypes?: MetricType[];
}

export interface Report {
  id: UUID;
  type: ReportType;
  title: string;
  data: any;
  generatedAt: Date;
  filters: ReportFilters;
}

// Analytics Service Interfaces
export interface AnalyticsEngine {
  trackMetric(metric: MetricData): Promise<void>;
  generateReport(reportType: ReportType, filters: ReportFilters): Promise<Report>;
  predictTimeline(projectData: ProjectData): Promise<TimelinePrediction>;
  analyzeTechnicalDebt(codebase: CodebaseData): Promise<TechnicalDebtAnalysis>;
  getDORAMetrics(projectId: UUID, dateRange: { start: Date; end: Date }): Promise<DORAMetrics>;
  getSPACEMetrics(teamId: UUID, dateRange: { start: Date; end: Date }): Promise<SPACEMetrics>;
}

export interface ProjectData {
  projectId: UUID;
  codebase: CodebaseData;
  team: TeamData;
  historicalMetrics: MetricData[];
}

export interface CodebaseData {
  linesOfCode: number;
  complexity: number;
  testCoverage: number;
  dependencies: string[];
  languages: string[];
}

export interface TeamData {
  size: number;
  experience: number; // average years
  velocity: number; // story points per sprint
  skills: string[];
}