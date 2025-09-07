import { 
  AnalyticsEngine,
  MetricData,
  DORAMetrics,
  SPACEMetrics,
  TechnicalDebtAnalysis,
  TimelinePrediction,
  UUID 
} from '@devflow/shared-types';

export interface MetricsCollector {
  collectDORAMetrics(projectId: UUID, dateRange: DateRange): Promise<DORAMetrics>;
  collectSPACEMetrics(teamId: UUID, dateRange: DateRange): Promise<SPACEMetrics>;
  collectCustomMetrics(query: MetricQuery): Promise<MetricData[]>;
}

export interface PredictionEngine {
  predictProjectTimeline(projectId: UUID): Promise<TimelinePrediction>;
  predictResourceNeeds(teamId: UUID): Promise<ResourcePrediction>;
  predictRiskFactors(projectId: UUID): Promise<RiskAssessment>;
}

export interface TechnicalDebtAnalyzer {
  analyzeCodebase(projectId: UUID): Promise<TechnicalDebtAnalysis>;
  trackDebtTrends(projectId: UUID, period: number): Promise<DebtTrend[]>;
  generateRecommendations(analysis: TechnicalDebtAnalysis): Promise<string[]>;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface MetricQuery {
  projectIds?: UUID[];
  teamIds?: UUID[];
  metricTypes: string[];
  dateRange: DateRange;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  groupBy?: string[];
}

export interface ResourcePrediction {
  teamId: UUID;
  predictedNeeds: {
    developers: number;
    timeframe: string;
    confidence: number;
  };
  recommendations: string[];
}

export interface RiskAssessment {
  projectId: UUID;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  mitigationStrategies: string[];
}

export interface RiskFactor {
  name: string;
  impact: number;
  probability: number;
  description: string;
}

export interface DebtTrend {
  date: Date;
  totalDebt: number;
  newDebt: number;
  resolvedDebt: number;
  debtRatio: number;
}