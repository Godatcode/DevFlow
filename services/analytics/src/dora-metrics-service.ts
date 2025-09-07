import { 
  DORAMetrics, 
  MetricData, 
  MetricType, 
  UUID 
} from '@devflow/shared-types';
import { DateRange } from './interfaces';
import { 
  DORAMetricsCollector, 
  DeploymentEvent, 
  ChangeEvent, 
  IncidentEvent 
} from './dora-metrics-collector';

export interface DORAMetricsRepository {
  saveMetricData(metrics: MetricData[]): Promise<void>;
  getMetricData(
    projectId: UUID, 
    metricTypes: MetricType[], 
    dateRange: DateRange
  ): Promise<MetricData[]>;
  getDeploymentEvents(projectId: UUID, dateRange: DateRange): Promise<DeploymentEvent[]>;
  getChangeEvents(projectId: UUID, dateRange: DateRange): Promise<ChangeEvent[]>;
  getIncidentEvents(projectId: UUID, dateRange: DateRange): Promise<IncidentEvent[]>;
}

export interface DORAMetricsConfig {
  calculationInterval: number; // minutes
  retentionPeriod: number; // days
  alertThresholds: {
    deploymentFrequency: { min: number; max: number };
    leadTime: { max: number }; // hours
    changeFailureRate: { max: number }; // percentage
    recoveryTime: { max: number }; // hours
  };
}

export class DORAMetricsService {
  private collector: DORAMetricsCollector;
  private repository: DORAMetricsRepository;
  private config: DORAMetricsConfig;

  constructor(
    repository: DORAMetricsRepository,
    config: DORAMetricsConfig
  ) {
    this.collector = new DORAMetricsCollector();
    this.repository = repository;
    this.config = config;
  }

  /**
   * Processes a deployment event and updates DORA metrics
   */
  async processDeploymentEvent(event: DeploymentEvent): Promise<void> {
    await this.collector.recordDeploymentEvent(event);
    
    // Trigger metrics calculation if needed
    await this.calculateAndStoreMetrics(event.projectId);
  }

  /**
   * Processes a code change event and updates lead time metrics
   */
  async processChangeEvent(event: ChangeEvent): Promise<void> {
    await this.collector.recordChangeEvent(event);
    
    // Update lead time if deployment timestamp is available
    if (event.deployedAt) {
      await this.calculateAndStoreMetrics(event.projectId);
    }
  }

  /**
   * Processes an incident event and updates recovery time metrics
   */
  async processIncidentEvent(event: IncidentEvent): Promise<void> {
    await this.collector.recordIncidentEvent(event);
    
    // Update recovery time if incident is resolved
    if (event.resolvedAt) {
      await this.calculateAndStoreMetrics(event.projectId);
    }
  }

  /**
   * Gets current DORA metrics for a project
   */
  async getDORAMetrics(projectId: UUID, dateRange: DateRange): Promise<DORAMetrics> {
    // Try to get from cache/database first
    const cachedMetrics = await this.getCachedMetrics(projectId, dateRange);
    if (cachedMetrics) {
      return cachedMetrics;
    }

    // Calculate fresh metrics
    return await this.collector.calculateDORAMetrics(projectId, dateRange);
  }

  /**
   * Gets DORA metrics trends over time
   */
  async getDORAMetricsTrends(
    projectId: UUID, 
    dateRange: DateRange, 
    interval: 'daily' | 'weekly' | 'monthly'
  ): Promise<DORAMetricsTrend[]> {
    const trends: DORAMetricsTrend[] = [];
    const intervals = this.generateIntervals(dateRange, interval);

    for (const intervalRange of intervals) {
      const metrics = await this.getDORAMetrics(projectId, intervalRange);
      trends.push({
        period: intervalRange,
        metrics,
        timestamp: intervalRange.end
      });
    }

    return trends;
  }

  /**
   * Analyzes DORA metrics performance against industry benchmarks
   */
  async analyzeDORAPerformance(projectId: UUID, dateRange: DateRange): Promise<DORAPerformanceAnalysis> {
    const metrics = await this.getDORAMetrics(projectId, dateRange);
    
    return {
      projectId,
      period: dateRange,
      metrics,
      performance: {
        deploymentFrequency: this.categorizeDeploymentFrequency(metrics.deploymentFrequency),
        leadTime: this.categorizeLeadTime(metrics.leadTimeForChanges),
        changeFailureRate: this.categorizeChangeFailureRate(metrics.changeFailureRate),
        recoveryTime: this.categorizeRecoveryTime(metrics.timeToRestoreService)
      },
      recommendations: this.generateRecommendations(metrics),
      alerts: this.checkAlerts(metrics)
    };
  }

  /**
   * Calculates and stores metrics for a project
   */
  private async calculateAndStoreMetrics(projectId: UUID): Promise<void> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const dateRange: DateRange = {
      start: thirtyDaysAgo,
      end: now
    };

    const metrics = await this.collector.calculateDORAMetrics(projectId, dateRange);
    
    // Generate metric data for storage
    const metricData = await this.collector.generateMetricData(
      projectId, 
      projectId, // Using projectId as teamId for now
      metrics
    );

    await this.repository.saveMetricData(metricData);
  }

  /**
   * Gets cached metrics from repository
   */
  private async getCachedMetrics(
    projectId: UUID, 
    dateRange: DateRange
  ): Promise<DORAMetrics | null> {
    const metricTypes = [
      MetricType.DORA_DEPLOYMENT_FREQUENCY,
      MetricType.DORA_LEAD_TIME,
      MetricType.DORA_CHANGE_FAILURE_RATE,
      MetricType.DORA_RECOVERY_TIME
    ];

    const cachedData = await this.repository.getMetricData(
      projectId, 
      metricTypes, 
      dateRange
    );

    if (cachedData.length < 4) return null;

    // Convert cached data back to DORAMetrics
    const deploymentFreq = cachedData.find(m => m.type === MetricType.DORA_DEPLOYMENT_FREQUENCY);
    const leadTime = cachedData.find(m => m.type === MetricType.DORA_LEAD_TIME);
    const changeFailure = cachedData.find(m => m.type === MetricType.DORA_CHANGE_FAILURE_RATE);
    const recoveryTime = cachedData.find(m => m.type === MetricType.DORA_RECOVERY_TIME);

    if (!deploymentFreq || !leadTime || !changeFailure || !recoveryTime) {
      return null;
    }

    return {
      deploymentFrequency: deploymentFreq.value,
      leadTimeForChanges: leadTime.value,
      changeFailureRate: changeFailure.value,
      timeToRestoreService: recoveryTime.value,
      period: dateRange
    };
  }

  /**
   * Generates time intervals for trend analysis
   */
  private generateIntervals(dateRange: DateRange, interval: 'daily' | 'weekly' | 'monthly'): DateRange[] {
    const intervals: DateRange[] = [];
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);

    let current = new Date(start);
    
    while (current < end) {
      const intervalEnd = new Date(current);
      
      switch (interval) {
        case 'daily':
          intervalEnd.setDate(intervalEnd.getDate() + 1);
          break;
        case 'weekly':
          intervalEnd.setDate(intervalEnd.getDate() + 7);
          break;
        case 'monthly':
          intervalEnd.setMonth(intervalEnd.getMonth() + 1);
          break;
      }

      if (intervalEnd > end) {
        intervalEnd.setTime(end.getTime());
      }

      intervals.push({
        start: new Date(current),
        end: new Date(intervalEnd)
      });

      current = new Date(intervalEnd);
    }

    return intervals;
  }

  /**
   * Categorizes deployment frequency performance
   */
  private categorizeDeploymentFrequency(frequency: number): PerformanceCategory {
    if (frequency >= 1) return 'elite';
    if (frequency >= 0.14) return 'high'; // Weekly
    if (frequency >= 0.03) return 'medium'; // Monthly
    return 'low';
  }

  /**
   * Categorizes lead time performance
   */
  private categorizeLeadTime(leadTime: number): PerformanceCategory {
    if (leadTime <= 24) return 'elite'; // Less than 1 day
    if (leadTime <= 168) return 'high'; // Less than 1 week
    if (leadTime <= 720) return 'medium'; // Less than 1 month
    return 'low';
  }

  /**
   * Categorizes change failure rate performance
   */
  private categorizeChangeFailureRate(failureRate: number): PerformanceCategory {
    if (failureRate <= 15) return 'elite';
    if (failureRate <= 20) return 'high';
    if (failureRate <= 30) return 'medium';
    return 'low';
  }

  /**
   * Categorizes recovery time performance
   */
  private categorizeRecoveryTime(recoveryTime: number): PerformanceCategory {
    if (recoveryTime <= 1) return 'elite'; // Less than 1 hour
    if (recoveryTime <= 24) return 'high'; // Less than 1 day
    if (recoveryTime <= 168) return 'medium'; // Less than 1 week
    return 'low';
  }

  /**
   * Generates improvement recommendations based on metrics
   */
  private generateRecommendations(metrics: DORAMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.deploymentFrequency < 0.14) {
      recommendations.push('Implement automated deployment pipelines to increase deployment frequency');
      recommendations.push('Consider feature flags to enable smaller, more frequent releases');
    }

    if (metrics.leadTimeForChanges > 168) {
      recommendations.push('Optimize CI/CD pipeline to reduce build and test times');
      recommendations.push('Implement trunk-based development to reduce merge conflicts');
    }

    if (metrics.changeFailureRate > 15) {
      recommendations.push('Improve automated testing coverage and quality');
      recommendations.push('Implement better code review processes');
    }

    if (metrics.timeToRestoreService > 24) {
      recommendations.push('Improve monitoring and alerting systems');
      recommendations.push('Implement automated rollback procedures');
    }

    return recommendations;
  }

  /**
   * Checks for alert conditions based on thresholds
   */
  private checkAlerts(metrics: DORAMetrics): DORAAlert[] {
    const alerts: DORAAlert[] = [];

    if (metrics.deploymentFrequency < this.config.alertThresholds.deploymentFrequency.min) {
      alerts.push({
        type: 'deployment_frequency_low',
        severity: 'warning',
        message: `Deployment frequency (${metrics.deploymentFrequency.toFixed(2)}) is below threshold`,
        threshold: this.config.alertThresholds.deploymentFrequency.min
      });
    }

    if (metrics.leadTimeForChanges > this.config.alertThresholds.leadTime.max) {
      alerts.push({
        type: 'lead_time_high',
        severity: 'warning',
        message: `Lead time (${metrics.leadTimeForChanges.toFixed(2)} hours) exceeds threshold`,
        threshold: this.config.alertThresholds.leadTime.max
      });
    }

    if (metrics.changeFailureRate > this.config.alertThresholds.changeFailureRate.max) {
      alerts.push({
        type: 'change_failure_rate_high',
        severity: 'error',
        message: `Change failure rate (${metrics.changeFailureRate.toFixed(2)}%) exceeds threshold`,
        threshold: this.config.alertThresholds.changeFailureRate.max
      });
    }

    if (metrics.timeToRestoreService > this.config.alertThresholds.recoveryTime.max) {
      alerts.push({
        type: 'recovery_time_high',
        severity: 'error',
        message: `Recovery time (${metrics.timeToRestoreService.toFixed(2)} hours) exceeds threshold`,
        threshold: this.config.alertThresholds.recoveryTime.max
      });
    }

    return alerts;
  }
}

// Supporting types
export interface DORAMetricsTrend {
  period: DateRange;
  metrics: DORAMetrics;
  timestamp: Date;
}

export interface DORAPerformanceAnalysis {
  projectId: UUID;
  period: DateRange;
  metrics: DORAMetrics;
  performance: {
    deploymentFrequency: PerformanceCategory;
    leadTime: PerformanceCategory;
    changeFailureRate: PerformanceCategory;
    recoveryTime: PerformanceCategory;
  };
  recommendations: string[];
  alerts: DORAAlert[];
}

export type PerformanceCategory = 'elite' | 'high' | 'medium' | 'low';

export interface DORAAlert {
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  threshold: number;
}