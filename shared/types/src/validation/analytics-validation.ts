import {
  MetricData,
  DORAMetrics,
  SPACEMetrics,
  TechnicalDebtAnalysis,
  TechnicalDebtRecommendation,
  TimelinePrediction,
  PredictionFactor,
  Report,
  ReportFilters,
  MetricType,
  ReportType,
  ProjectData,
  CodebaseData,
  TeamData
} from '../analytics';
import { BaseValidator, ValidationError } from './base-validation';

export class AnalyticsValidator extends BaseValidator {
  static validateMetricData(metric: MetricData): void {
    this.validateBaseEntity(metric);
    this.validateEnum(metric.type, MetricType, 'type');
    this.validateNumber(metric.value, 'value');
    this.validateString(metric.unit, 'unit', 1, 20);
    this.validateUUID(metric.projectId, 'projectId');
    this.validateUUID(metric.teamId, 'teamId');
    this.validateDate(metric.timestamp, 'timestamp');
    this.validateObject(metric.metadata, 'metadata');

    // Validate metric value ranges based on type
    this.validateMetricValueRange(metric.type, metric.value);

    // Validate timestamp is not in the future
    if (metric.timestamp > new Date()) {
      throw new ValidationError(
        'timestamp cannot be in the future',
        'FUTURE_TIMESTAMP'
      );
    }
  }

  static validateDORAMetrics(metrics: DORAMetrics): void {
    this.validateNumber(metrics.deploymentFrequency, 'deploymentFrequency', 0);
    this.validateNumber(metrics.leadTimeForChanges, 'leadTimeForChanges', 0);
    this.validateNumber(metrics.changeFailureRate, 'changeFailureRate', 0, 100);
    this.validateNumber(metrics.timeToRestoreService, 'timeToRestoreService', 0);
    
    this.validateDateRange(metrics.period, 'period');
  }

  static validateSPACEMetrics(metrics: SPACEMetrics): void {
    this.validateNumber(metrics.satisfaction, 'satisfaction', 1, 10);
    this.validateNumber(metrics.performance, 'performance', 0);
    this.validateNumber(metrics.activity, 'activity', 0);
    this.validateNumber(metrics.communication, 'communication', 0, 10);
    this.validateNumber(metrics.efficiency, 'efficiency', 0, 10);
  }

  static validateTechnicalDebtAnalysis(analysis: TechnicalDebtAnalysis): void {
    this.validateNumber(analysis.totalDebtHours, 'totalDebtHours', 0);
    this.validateNumber(analysis.debtRatio, 'debtRatio', 0, 100);
    this.validateNumber(analysis.criticalIssues, 'criticalIssues', 0);
    
    this.validateArray(analysis.recommendations, 'recommendations', 0, 100);
    analysis.recommendations.forEach((rec, index) => {
      this.validateTechnicalDebtRecommendation(rec, `recommendations[${index}]`);
    });

    this.validateTrendData(analysis.trends, 'trends');
  }

  static validateTechnicalDebtRecommendation(
    recommendation: TechnicalDebtRecommendation,
    fieldPrefix: string = ''
  ): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateString(recommendation.type, `${prefix}type`, 1, 50);
    this.validateString(recommendation.description, `${prefix}description`, 1, 500);
    this.validateNumber(recommendation.estimatedEffort, `${prefix}estimatedEffort`, 0);
    this.validateEnum(
      recommendation.priority,
      { low: 'low', medium: 'medium', high: 'high', critical: 'critical' },
      `${prefix}priority`
    );
    this.validateString(recommendation.impact, `${prefix}impact`, 1, 200);
  }

  static validateTimelinePrediction(prediction: TimelinePrediction): void {
    this.validateUUID(prediction.projectId, 'projectId');
    this.validateDate(prediction.estimatedCompletionDate, 'estimatedCompletionDate');
    this.validateNumber(prediction.confidenceLevel, 'confidenceLevel', 0, 100);
    
    this.validateArray(prediction.factors, 'factors', 0, 20);
    prediction.factors.forEach((factor, index) => {
      this.validatePredictionFactor(factor, `factors[${index}]`);
    });

    this.validatePredictionScenarios(prediction.scenarios, 'scenarios');

    // Validate estimated completion date is in the future
    if (prediction.estimatedCompletionDate <= new Date()) {
      throw new ValidationError(
        'estimatedCompletionDate must be in the future',
        'PAST_COMPLETION_DATE'
      );
    }
  }

  static validatePredictionFactor(factor: PredictionFactor, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateString(factor.name, `${prefix}name`, 1, 100);
    this.validateNumber(factor.impact, `${prefix}impact`, -1, 1);
    this.validateString(factor.description, `${prefix}description`, 1, 200);
  }

  static validateReport(report: Report): void {
    this.validateUUID(report.id, 'id');
    this.validateEnum(report.type, ReportType, 'type');
    this.validateString(report.title, 'title', 1, 200);
    this.validateRequired(report.data, 'data');
    this.validateDate(report.generatedAt, 'generatedAt');
    this.validateReportFilters(report.filters);

    // Validate generatedAt is not in the future
    if (report.generatedAt > new Date()) {
      throw new ValidationError(
        'generatedAt cannot be in the future',
        'FUTURE_GENERATION_DATE'
      );
    }
  }

  static validateReportFilters(filters: ReportFilters): void {
    if (filters.projectIds) {
      this.validateArray(filters.projectIds, 'filters.projectIds', 0, 50);
      filters.projectIds.forEach((projectId, index) => {
        this.validateUUID(projectId, `filters.projectIds[${index}]`);
      });
    }

    if (filters.teamIds) {
      this.validateArray(filters.teamIds, 'filters.teamIds', 0, 20);
      filters.teamIds.forEach((teamId, index) => {
        this.validateUUID(teamId, `filters.teamIds[${index}]`);
      });
    }

    this.validateDateRange(filters.dateRange, 'filters.dateRange');

    if (filters.metricTypes) {
      this.validateArray(filters.metricTypes, 'filters.metricTypes', 0, 20);
      filters.metricTypes.forEach((metricType, index) => {
        this.validateEnum(metricType, MetricType, `filters.metricTypes[${index}]`);
      });
    }
  }

  static validateProjectData(data: ProjectData): void {
    this.validateUUID(data.projectId, 'projectId');
    this.validateCodebaseData(data.codebase);
    this.validateTeamData(data.team);
    
    this.validateArray(data.historicalMetrics, 'historicalMetrics', 0, 1000);
    data.historicalMetrics.forEach((metric, index) => {
      this.validateMetricData(metric);
    });
  }

  static validateCodebaseData(data: CodebaseData): void {
    this.validateNumber(data.linesOfCode, 'codebase.linesOfCode', 0);
    this.validateNumber(data.complexity, 'codebase.complexity', 0);
    this.validateNumber(data.testCoverage, 'codebase.testCoverage', 0, 100);
    
    this.validateArray(data.dependencies, 'codebase.dependencies', 0, 500);
    data.dependencies.forEach((dep, index) => {
      this.validateString(dep, `codebase.dependencies[${index}]`, 1, 100);
    });

    this.validateArray(data.languages, 'codebase.languages', 1, 20);
    data.languages.forEach((lang, index) => {
      this.validateString(lang, `codebase.languages[${index}]`, 1, 30);
    });
  }

  static validateTeamData(data: TeamData): void {
    this.validateNumber(data.size, 'team.size', 1, 100);
    this.validateNumber(data.experience, 'team.experience', 0, 50);
    this.validateNumber(data.velocity, 'team.velocity', 0);
    
    this.validateArray(data.skills, 'team.skills', 0, 50);
    data.skills.forEach((skill, index) => {
      this.validateString(skill, `team.skills[${index}]`, 1, 50);
    });
  }

  private static validateMetricValueRange(type: MetricType, value: number): void {
    switch (type) {
      case MetricType.DORA_CHANGE_FAILURE_RATE:
        if (value < 0 || value > 100) {
          throw new ValidationError(
            'Change failure rate must be between 0 and 100',
            'INVALID_METRIC_RANGE'
          );
        }
        break;
      case MetricType.CODE_QUALITY:
        if (value < 0 || value > 10) {
          throw new ValidationError(
            'Code quality score must be between 0 and 10',
            'INVALID_METRIC_RANGE'
          );
        }
        break;
      case MetricType.DEVELOPER_SATISFACTION:
        if (value < 1 || value > 10) {
          throw new ValidationError(
            'Developer satisfaction must be between 1 and 10',
            'INVALID_METRIC_RANGE'
          );
        }
        break;
      case MetricType.DORA_DEPLOYMENT_FREQUENCY:
      case MetricType.DORA_LEAD_TIME:
      case MetricType.DORA_RECOVERY_TIME:
      case MetricType.TECHNICAL_DEBT:
      case MetricType.TEAM_VELOCITY:
        if (value < 0) {
          throw new ValidationError(
            `${type} cannot be negative`,
            'NEGATIVE_METRIC_VALUE'
          );
        }
        break;
    }
  }

  private static validateDateRange(
    dateRange: { start: Date; end: Date },
    fieldPrefix: string
  ): void {
    this.validateDate(dateRange.start, `${fieldPrefix}.start`);
    this.validateDate(dateRange.end, `${fieldPrefix}.end`);
    
    if (dateRange.start >= dateRange.end) {
      throw new ValidationError(
        `${fieldPrefix}.end must be after ${fieldPrefix}.start`,
        'INVALID_DATE_RANGE'
      );
    }

    // Validate date range is not too large (max 2 years)
    const maxRangeMs = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years in milliseconds
    if (dateRange.end.getTime() - dateRange.start.getTime() > maxRangeMs) {
      throw new ValidationError(
        `${fieldPrefix} cannot span more than 2 years`,
        'DATE_RANGE_TOO_LARGE'
      );
    }
  }

  private static validateTrendData(
    trends: { lastMonth: number; lastQuarter: number },
    fieldPrefix: string
  ): void {
    this.validateNumber(trends.lastMonth, `${fieldPrefix}.lastMonth`, 0);
    this.validateNumber(trends.lastQuarter, `${fieldPrefix}.lastQuarter`, 0);
  }

  private static validatePredictionScenarios(
    scenarios: { optimistic: Date; realistic: Date; pessimistic: Date },
    fieldPrefix: string
  ): void {
    this.validateDate(scenarios.optimistic, `${fieldPrefix}.optimistic`);
    this.validateDate(scenarios.realistic, `${fieldPrefix}.realistic`);
    this.validateDate(scenarios.pessimistic, `${fieldPrefix}.pessimistic`);

    // Validate scenario order: optimistic <= realistic <= pessimistic
    if (scenarios.optimistic > scenarios.realistic) {
      throw new ValidationError(
        `${fieldPrefix}.optimistic must be before or equal to realistic`,
        'INVALID_SCENARIO_ORDER'
      );
    }
    if (scenarios.realistic > scenarios.pessimistic) {
      throw new ValidationError(
        `${fieldPrefix}.realistic must be before or equal to pessimistic`,
        'INVALID_SCENARIO_ORDER'
      );
    }

    // Validate all scenarios are in the future
    const now = new Date();
    if (scenarios.optimistic <= now) {
      throw new ValidationError(
        `${fieldPrefix}.optimistic must be in the future`,
        'PAST_SCENARIO_DATE'
      );
    }
  }
}