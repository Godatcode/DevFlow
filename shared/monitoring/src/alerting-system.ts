import { EventEmitter } from 'events';
import { Alert, AlertCondition, MetricData } from './interfaces.js';

export class AlertingSystem extends EventEmitter {
  private conditions: Map<string, AlertCondition> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private metricHistory: Map<string, MetricData[]> = new Map();
  private readonly maxHistorySize = 1000;

  /**
   * Register an alert condition
   */
  registerCondition(condition: AlertCondition): void {
    this.conditions.set(condition.id, condition);
  }

  /**
   * Remove an alert condition
   */
  removeCondition(conditionId: string): void {
    this.conditions.delete(conditionId);
    
    // Resolve any active alerts for this condition
    const activeAlert = this.activeAlerts.get(conditionId);
    if (activeAlert && activeAlert.status === 'firing') {
      this.resolveAlert(conditionId);
    }
  }

  /**
   * Process a metric and check for alert conditions
   */
  processMetric(metric: MetricData): void {
    // Store metric in history
    this.storeMetricHistory(metric);

    // Check all conditions for this metric
    for (const condition of this.conditions.values()) {
      if (condition.metric === metric.name) {
        this.evaluateCondition(condition, metric);
      }
    }
  }

  /**
   * Store metric in history for trend analysis
   */
  private storeMetricHistory(metric: MetricData): void {
    if (!this.metricHistory.has(metric.name)) {
      this.metricHistory.set(metric.name, []);
    }

    const history = this.metricHistory.get(metric.name)!;
    history.push(metric);

    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Evaluate a condition against a metric
   */
  private evaluateCondition(condition: AlertCondition, metric: MetricData): void {
    const isTriggered = this.checkCondition(condition, metric.value);
    const existingAlert = this.activeAlerts.get(condition.id);

    if (isTriggered && !existingAlert) {
      // New alert
      this.fireAlert(condition, metric);
    } else if (isTriggered && existingAlert && existingAlert.status === 'resolved') {
      // Re-fire resolved alert
      this.fireAlert(condition, metric);
    } else if (!isTriggered && existingAlert && existingAlert.status === 'firing') {
      // Resolve alert
      this.resolveAlert(condition.id);
    }
  }

  /**
   * Check if a condition is met
   */
  private checkCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.threshold;
      case 'gte':
        return value >= condition.threshold;
      case 'lt':
        return value < condition.threshold;
      case 'lte':
        return value <= condition.threshold;
      case 'eq':
        return value === condition.threshold;
      default:
        return false;
    }
  }

  /**
   * Fire an alert
   */
  private fireAlert(condition: AlertCondition, metric: MetricData): void {
    const alert: Alert = {
      id: condition.id,
      condition,
      status: 'firing',
      startTime: new Date(),
      message: this.generateAlertMessage(condition, metric.value),
      metadata: {
        metricValue: metric.value,
        threshold: condition.threshold,
        timestamp: metric.timestamp
      }
    };

    this.activeAlerts.set(condition.id, alert);
    this.emit('alert:fired', alert);
  }

  /**
   * Resolve an alert
   */
  private resolveAlert(conditionId: string): void {
    const alert = this.activeAlerts.get(conditionId);
    if (alert && alert.status === 'firing') {
      alert.status = 'resolved';
      alert.endTime = new Date();
      this.emit('alert:resolved', alert);
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(condition: AlertCondition, value: number): string {
    const operatorText = {
      'gt': 'greater than',
      'gte': 'greater than or equal to',
      'lt': 'less than',
      'lte': 'less than or equal to',
      'eq': 'equal to'
    };

    return `Alert: ${condition.name} - Metric '${condition.metric}' is ${value} (${operatorText[condition.operator]} ${condition.threshold})`;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.status === 'firing');
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return Array.from(this.activeAlerts.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  /**
   * Get metric trends for analysis
   */
  getMetricTrend(metricName: string, timeWindow: number = 300000): MetricData[] {
    const history = this.metricHistory.get(metricName) || [];
    const cutoffTime = Date.now() - timeWindow;
    
    return history.filter(metric => metric.timestamp.getTime() > cutoffTime);
  }

  /**
   * Create common alert conditions
   */
  static createHighErrorRateCondition(threshold: number = 0.05): AlertCondition {
    return {
      id: 'high_error_rate',
      name: 'High Error Rate',
      metric: 'error_rate',
      operator: 'gt',
      threshold,
      duration: 60000, // 1 minute
      severity: 'high'
    };
  }

  static createHighResponseTimeCondition(threshold: number = 2000): AlertCondition {
    return {
      id: 'high_response_time',
      name: 'High Response Time',
      metric: 'response_time_ms',
      operator: 'gt',
      threshold,
      duration: 120000, // 2 minutes
      severity: 'medium'
    };
  }

  static createHighMemoryUsageCondition(threshold: number = 0.9): AlertCondition {
    return {
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      metric: 'memory_usage_ratio',
      operator: 'gt',
      threshold,
      duration: 300000, // 5 minutes
      severity: 'critical'
    };
  }
}