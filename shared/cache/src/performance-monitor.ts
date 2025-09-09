import { CacheMetrics, CacheEvent, CacheEventType } from './interfaces';
import { Logger } from './mocks/shared-utils';

export interface PerformanceThresholds {
  maxResponseTime: number;
  minHitRate: number;
  maxMemoryUsage: number;
  maxErrorRate: number;
}

export interface PerformanceAlert {
  type: 'response_time' | 'hit_rate' | 'memory_usage' | 'error_rate';
  severity: 'warning' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
}

export class CachePerformanceMonitor {
  private logger: Logger;
  private thresholds: PerformanceThresholds;
  private responseTimeHistory: number[] = [];
  private errorCount = 0;
  private totalOperations = 0;
  private alertCallbacks: ((alert: PerformanceAlert) => void)[] = [];

  constructor(thresholds: PerformanceThresholds) {
    this.logger = new Logger('CachePerformanceMonitor');
    this.thresholds = thresholds;
  }

  recordEvent(event: CacheEvent, responseTime?: number): void {
    this.totalOperations++;

    if (responseTime !== undefined) {
      this.recordResponseTime(responseTime);
    }

    if (event.type === CacheEventType.ERROR) {
      this.errorCount++;
      this.checkErrorRate();
    }
  }

  recordResponseTime(responseTime: number): void {
    this.responseTimeHistory.push(responseTime);
    
    // Keep only the last 1000 response times
    if (this.responseTimeHistory.length > 1000) {
      this.responseTimeHistory.shift();
    }

    this.checkResponseTime(responseTime);
  }

  analyzeMetrics(metrics: CacheMetrics): void {
    this.checkHitRate(metrics.overallHitRate);
    this.checkMemoryUsage(metrics.memoryUsage);
    
    // Log performance summary
    this.logger.info('Cache performance analysis', {
      hitRate: metrics.overallHitRate,
      memoryUsage: metrics.memoryUsage,
      averageResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate()
    });
  }

  getPerformanceSummary(): {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    totalOperations: number;
  } {
    const sortedTimes = [...this.responseTimeHistory].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);

    return {
      averageResponseTime: this.getAverageResponseTime(),
      p95ResponseTime: sortedTimes[p95Index] || 0,
      p99ResponseTime: sortedTimes[p99Index] || 0,
      errorRate: this.getErrorRate(),
      totalOperations: this.totalOperations
    };
  }

  onAlert(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  private checkResponseTime(responseTime: number): void {
    if (responseTime > this.thresholds.maxResponseTime) {
      const severity = responseTime > this.thresholds.maxResponseTime * 2 ? 'critical' : 'warning';
      
      this.emitAlert({
        type: 'response_time',
        severity,
        message: `Cache response time exceeded threshold: ${responseTime}ms`,
        currentValue: responseTime,
        threshold: this.thresholds.maxResponseTime,
        timestamp: new Date()
      });
    }
  }

  private checkHitRate(hitRate: number): void {
    if (hitRate < this.thresholds.minHitRate) {
      const severity = hitRate < this.thresholds.minHitRate * 0.5 ? 'critical' : 'warning';
      
      this.emitAlert({
        type: 'hit_rate',
        severity,
        message: `Cache hit rate below threshold: ${(hitRate * 100).toFixed(2)}%`,
        currentValue: hitRate,
        threshold: this.thresholds.minHitRate,
        timestamp: new Date()
      });
    }
  }

  private checkMemoryUsage(memoryUsage: number): void {
    if (memoryUsage > this.thresholds.maxMemoryUsage) {
      const severity = memoryUsage > this.thresholds.maxMemoryUsage * 1.5 ? 'critical' : 'warning';
      
      this.emitAlert({
        type: 'memory_usage',
        severity,
        message: `Cache memory usage exceeded threshold: ${(memoryUsage / 1024 / 1024).toFixed(2)}MB`,
        currentValue: memoryUsage,
        threshold: this.thresholds.maxMemoryUsage,
        timestamp: new Date()
      });
    }
  }

  private checkErrorRate(): void {
    const errorRate = this.getErrorRate();
    
    if (errorRate > this.thresholds.maxErrorRate) {
      const severity = errorRate > this.thresholds.maxErrorRate * 2 ? 'critical' : 'warning';
      
      this.emitAlert({
        type: 'error_rate',
        severity,
        message: `Cache error rate exceeded threshold: ${(errorRate * 100).toFixed(2)}%`,
        currentValue: errorRate,
        threshold: this.thresholds.maxErrorRate,
        timestamp: new Date()
      });
    }
  }

  private getAverageResponseTime(): number {
    if (this.responseTimeHistory.length === 0) return 0;
    
    const sum = this.responseTimeHistory.reduce((acc, time) => acc + time, 0);
    return sum / this.responseTimeHistory.length;
  }

  private getErrorRate(): number {
    if (this.totalOperations === 0) return 0;
    return this.errorCount / this.totalOperations;
  }

  private emitAlert(alert: PerformanceAlert): void {
    this.logger.warn('Cache performance alert', alert);
    
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        this.logger.error('Error in alert callback', { error });
      }
    }
  }

  reset(): void {
    this.responseTimeHistory = [];
    this.errorCount = 0;
    this.totalOperations = 0;
  }
}