import { register, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';
import { MetricData, PerformanceMetrics } from './interfaces.js';

export class MetricsCollector {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private summaries: Map<string, Summary> = new Map();

  constructor(serviceName: string) {
    // Collect default Node.js metrics with valid prefix
    const validServiceName = serviceName.replace(/[^a-zA-Z0-9_]/g, '_');
    collectDefaultMetrics({
      prefix: `${validServiceName}_`,
      register
    });
  }

  /**
   * Create or get a counter metric
   */
  getCounter(name: string, help: string, labelNames?: string[]): Counter {
    if (!this.counters.has(name)) {
      const counter = new Counter({
        name,
        help,
        labelNames: labelNames || []
      });
      this.counters.set(name, counter);
    }
    return this.counters.get(name)!;
  }

  /**
   * Create or get a gauge metric
   */
  getGauge(name: string, help: string, labelNames?: string[]): Gauge {
    if (!this.gauges.has(name)) {
      const gauge = new Gauge({
        name,
        help,
        labelNames: labelNames || []
      });
      this.gauges.set(name, gauge);
    }
    return this.gauges.get(name)!;
  }

  /**
   * Create or get a histogram metric
   */
  getHistogram(name: string, help: string, buckets?: number[], labelNames?: string[]): Histogram {
    if (!this.histograms.has(name)) {
      const histogram = new Histogram({
        name,
        help,
        buckets: buckets || [0.1, 0.5, 1, 2, 5, 10],
        labelNames: labelNames || []
      });
      this.histograms.set(name, histogram);
    }
    return this.histograms.get(name)!;
  }

  /**
   * Create or get a summary metric
   */
  getSummary(name: string, help: string, percentiles?: number[], labelNames?: string[]): Summary {
    if (!this.summaries.has(name)) {
      const summary = new Summary({
        name,
        help,
        percentiles: percentiles || [0.5, 0.9, 0.95, 0.99],
        labelNames: labelNames || []
      });
      this.summaries.set(name, summary);
    }
    return this.summaries.get(name)!;
  }

  /**
   * Record a metric value
   */
  recordMetric(metric: MetricData): void {
    const labels = metric.labels || {};

    switch (metric.type) {
      case 'counter':
        this.getCounter(metric.name, `Counter metric: ${metric.name}`, Object.keys(labels))
          .inc(labels, metric.value);
        break;
      case 'gauge':
        this.getGauge(metric.name, `Gauge metric: ${metric.name}`, Object.keys(labels))
          .set(labels, metric.value);
        break;
      case 'histogram':
        this.getHistogram(metric.name, `Histogram metric: ${metric.name}`, undefined, Object.keys(labels))
          .observe(labels, metric.value);
        break;
      case 'summary':
        this.getSummary(metric.name, `Summary metric: ${metric.name}`, undefined, Object.keys(labels))
          .observe(labels, metric.value);
        break;
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      responseTime: 0, // This should be calculated from request metrics
      throughput: 0, // This should be calculated from request counters
      errorRate: 0, // This should be calculated from error counters
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memUsage.heapUsed / memUsage.heapTotal,
      diskUsage: 0 // This would require additional system calls
    };
  }

  /**
   * Create middleware for Express.js to track HTTP metrics
   */
  createHttpMetricsMiddleware() {
    const httpRequestDuration = this.getHistogram(
      'http_request_duration_seconds',
      'Duration of HTTP requests in seconds',
      [0.1, 0.5, 1, 2, 5],
      ['method', 'route', 'status_code']
    );

    const httpRequestsTotal = this.getCounter(
      'http_requests_total',
      'Total number of HTTP requests',
      ['method', 'route', 'status_code']
    );

    return (req: any, res: any, next: any) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = (Date.now() - startTime) / 1000;
        const labels = {
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode.toString()
        };

        httpRequestDuration.observe(labels, duration);
        httpRequestsTotal.inc(labels);
      });

      next();
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    register.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
  }
}