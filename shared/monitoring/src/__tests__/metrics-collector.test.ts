import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetricsCollector } from '../metrics-collector.js';
import { register } from 'prom-client';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    register.clear();
    metricsCollector = new MetricsCollector('test_service');
  });

  afterEach(() => {
    if (metricsCollector) {
      metricsCollector.clear();
    }
  });

  describe('getCounter', () => {
    it('should create and return a counter', () => {
      const counter = metricsCollector.getCounter('test_counter', 'Test counter');
      
      expect(counter).toBeDefined();
      expect(counter.name).toBe('test_counter');
    });

    it('should return existing counter', () => {
      const counter1 = metricsCollector.getCounter('test_counter', 'Test counter');
      const counter2 = metricsCollector.getCounter('test_counter', 'Test counter');
      
      expect(counter1).toBe(counter2);
    });
  });

  describe('getGauge', () => {
    it('should create and return a gauge', () => {
      const gauge = metricsCollector.getGauge('test_gauge', 'Test gauge');
      
      expect(gauge).toBeDefined();
      expect(gauge.name).toBe('test_gauge');
    });
  });

  describe('getHistogram', () => {
    it('should create and return a histogram', () => {
      const histogram = metricsCollector.getHistogram('test_histogram', 'Test histogram');
      
      expect(histogram).toBeDefined();
      expect(histogram.name).toBe('test_histogram');
    });

    it('should create histogram with custom buckets', () => {
      const customBuckets = [0.1, 0.5, 1.0];
      const histogram = metricsCollector.getHistogram(
        'test_histogram_custom',
        'Test histogram with custom buckets',
        customBuckets
      );
      
      expect(histogram).toBeDefined();
    });
  });

  describe('getSummary', () => {
    it('should create and return a summary', () => {
      const summary = metricsCollector.getSummary('test_summary', 'Test summary');
      
      expect(summary).toBeDefined();
      expect(summary.name).toBe('test_summary');
    });
  });

  describe('recordMetric', () => {
    it('should record counter metric', () => {
      const metric = {
        name: 'test_counter_metric',
        value: 1,
        timestamp: new Date(),
        type: 'counter' as const
      };

      expect(() => metricsCollector.recordMetric(metric)).not.toThrow();
    });

    it('should record gauge metric', () => {
      const metric = {
        name: 'test_gauge_metric',
        value: 42,
        timestamp: new Date(),
        type: 'gauge' as const
      };

      expect(() => metricsCollector.recordMetric(metric)).not.toThrow();
    });

    it('should record histogram metric', () => {
      const metric = {
        name: 'test_histogram_metric',
        value: 1.5,
        timestamp: new Date(),
        type: 'histogram' as const
      };

      expect(() => metricsCollector.recordMetric(metric)).not.toThrow();
    });

    it('should record summary metric', () => {
      const metric = {
        name: 'test_summary_metric',
        value: 2.5,
        timestamp: new Date(),
        type: 'summary' as const
      };

      expect(() => metricsCollector.recordMetric(metric)).not.toThrow();
    });

    it('should record metric with labels', () => {
      const metric = {
        name: 'test_labeled_metric',
        value: 1,
        timestamp: new Date(),
        type: 'counter' as const,
        labels: { environment: 'test', service: 'api' }
      };

      expect(() => metricsCollector.recordMetric(metric)).not.toThrow();
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return performance metrics', () => {
      const metrics = metricsCollector.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('throughput');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('cpuUsage');
      expect(metrics).toHaveProperty('memoryUsage');
      expect(metrics).toHaveProperty('diskUsage');
      
      expect(typeof metrics.cpuUsage).toBe('number');
      expect(typeof metrics.memoryUsage).toBe('number');
    });
  });

  describe('createHttpMetricsMiddleware', () => {
    it('should create middleware function', () => {
      const middleware = metricsCollector.createHttpMetricsMiddleware();
      
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // req, res, next
    });
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      // Record some metrics first
      metricsCollector.recordMetric({
        name: 'test_metric',
        value: 1,
        timestamp: new Date(),
        type: 'counter'
      });

      const metrics = await metricsCollector.getMetrics();
      
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });
});