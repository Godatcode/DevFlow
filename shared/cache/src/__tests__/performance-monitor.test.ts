import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CachePerformanceMonitor, PerformanceThresholds } from '../performance-monitor';
import { CacheEventType } from '../interfaces';

describe('CachePerformanceMonitor', () => {
  let monitor: CachePerformanceMonitor;
  let thresholds: PerformanceThresholds;

  beforeEach(() => {
    thresholds = {
      maxResponseTime: 1000,
      minHitRate: 0.8,
      maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      maxErrorRate: 0.05 // 5%
    };
    
    monitor = new CachePerformanceMonitor(thresholds);
  });

  describe('response time monitoring', () => {
    it('should record response times', () => {
      monitor.recordResponseTime(500);
      monitor.recordResponseTime(750);
      monitor.recordResponseTime(300);
      
      const summary = monitor.getPerformanceSummary();
      expect(summary.averageResponseTime).toBeCloseTo(516.67, 2); // (500 + 750 + 300) / 3
    });

    it('should calculate percentiles correctly', () => {
      // Add 100 response times
      for (let i = 1; i <= 100; i++) {
        monitor.recordResponseTime(i * 10); // 10ms, 20ms, ..., 1000ms
      }
      
      const summary = monitor.getPerformanceSummary();
      expect(summary.p95ResponseTime).toBe(960); // 95th percentile (corrected)
      expect(summary.p99ResponseTime).toBe(1000); // 99th percentile (corrected)
    });

    it('should trigger alert for slow response times', () => {
      const alertCallback = vi.fn();
      monitor.onAlert(alertCallback);
      
      monitor.recordResponseTime(1500); // Exceeds threshold of 1000ms
      
      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'response_time',
          severity: 'warning',
          currentValue: 1500,
          threshold: 1000
        })
      );
    });

    it('should trigger critical alert for very slow response times', () => {
      const alertCallback = vi.fn();
      monitor.onAlert(alertCallback);
      
      monitor.recordResponseTime(2500); // Exceeds 2x threshold
      
      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'response_time',
          severity: 'critical'
        })
      );
    });
  });

  describe('error rate monitoring', () => {
    it('should track error rate', () => {
      // Record some operations
      monitor.recordEvent({
        type: CacheEventType.HIT,
        key: 'key1',
        layer: 'memory',
        timestamp: new Date()
      });
      
      monitor.recordEvent({
        type: CacheEventType.ERROR,
        key: 'key2',
        layer: 'memory',
        timestamp: new Date()
      });
      
      monitor.recordEvent({
        type: CacheEventType.HIT,
        key: 'key3',
        layer: 'memory',
        timestamp: new Date()
      });
      
      const summary = monitor.getPerformanceSummary();
      expect(summary.errorRate).toBe(1/3); // 1 error out of 3 operations
      expect(summary.totalOperations).toBe(3);
    });

    it('should trigger alert for high error rate', () => {
      const alertCallback = vi.fn();
      monitor.onAlert(alertCallback);
      
      // Generate high error rate (10 errors out of 10 operations = 100%)
      for (let i = 0; i < 10; i++) {
        monitor.recordEvent({
          type: CacheEventType.ERROR,
          key: `key${i}`,
          layer: 'memory',
          timestamp: new Date()
        });
      }
      
      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error_rate',
          severity: 'critical' // 100% > 2 * 5% threshold
        })
      );
    });
  });

  describe('metrics analysis', () => {
    it('should analyze hit rate', () => {
      const alertCallback = vi.fn();
      monitor.onAlert(alertCallback);
      
      const metrics = {
        layerStats: new Map(),
        totalHits: 10,
        totalMisses: 90,
        overallHitRate: 0.1, // 10% hit rate (below 80% threshold)
        averageResponseTime: 500,
        memoryUsage: 50 * 1024 * 1024 // 50MB
      };
      
      monitor.analyzeMetrics(metrics);
      
      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'hit_rate',
          severity: 'critical', // 10% < 50% of 80% threshold
          currentValue: 0.1,
          threshold: 0.8
        })
      );
    });

    it('should analyze memory usage', () => {
      const alertCallback = vi.fn();
      monitor.onAlert(alertCallback);
      
      const metrics = {
        layerStats: new Map(),
        totalHits: 100,
        totalMisses: 20,
        overallHitRate: 0.83,
        averageResponseTime: 500,
        memoryUsage: 120 * 1024 * 1024 // 120MB (exceeds 100MB threshold)
      };
      
      monitor.analyzeMetrics(metrics);
      
      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory_usage',
          severity: 'warning',
          currentValue: 120 * 1024 * 1024,
          threshold: 100 * 1024 * 1024
        })
      );
    });
  });

  describe('performance summary', () => {
    it('should provide comprehensive performance summary', () => {
      // Record some data
      monitor.recordResponseTime(100);
      monitor.recordResponseTime(200);
      monitor.recordResponseTime(300);
      
      monitor.recordEvent({
        type: CacheEventType.HIT,
        key: 'key1',
        layer: 'memory',
        timestamp: new Date()
      });
      
      monitor.recordEvent({
        type: CacheEventType.ERROR,
        key: 'key2',
        layer: 'memory',
        timestamp: new Date()
      });
      
      const summary = monitor.getPerformanceSummary();
      
      expect(summary).toHaveProperty('averageResponseTime');
      expect(summary).toHaveProperty('p95ResponseTime');
      expect(summary).toHaveProperty('p99ResponseTime');
      expect(summary).toHaveProperty('errorRate');
      expect(summary).toHaveProperty('totalOperations');
      
      expect(summary.averageResponseTime).toBe(200);
      expect(summary.totalOperations).toBe(2);
      expect(summary.errorRate).toBe(0.5);
    });
  });

  describe('alert system', () => {
    it('should handle multiple alert callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      monitor.onAlert(callback1);
      monitor.onAlert(callback2);
      
      monitor.recordResponseTime(2000); // Trigger alert
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const goodCallback = vi.fn();
      
      monitor.onAlert(errorCallback);
      monitor.onAlert(goodCallback);
      
      // Should not throw despite callback error
      expect(() => monitor.recordResponseTime(2000)).not.toThrow();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('reset functionality', () => {
    it('should reset all metrics', () => {
      // Record some data
      monitor.recordResponseTime(500);
      monitor.recordEvent({
        type: CacheEventType.ERROR,
        key: 'key1',
        layer: 'memory',
        timestamp: new Date()
      });
      
      monitor.reset();
      
      const summary = monitor.getPerformanceSummary();
      expect(summary.averageResponseTime).toBe(0);
      expect(summary.totalOperations).toBe(0);
      expect(summary.errorRate).toBe(0);
    });
  });
});