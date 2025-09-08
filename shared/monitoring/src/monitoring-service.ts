import express from 'express';
import { HealthChecker } from './health-checker.js';
import { MetricsCollector } from './metrics-collector.js';
import { AlertingSystem } from './alerting-system.js';
import { MonitoringConfig, HealthStatus, Alert } from './interfaces.js';

export class MonitoringService {
  private healthChecker: HealthChecker;
  private metricsCollector: MetricsCollector;
  private alertingSystem: AlertingSystem;
  private config: MonitoringConfig;
  private app: express.Application;
  private server?: any;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.healthChecker = new HealthChecker(config);
    this.metricsCollector = new MetricsCollector(config.serviceName);
    this.alertingSystem = new AlertingSystem();
    this.app = express();

    this.setupRoutes();
    this.setupAlertHandlers();
    this.setupDefaultHealthChecks();
    this.setupDefaultAlerts();
  }

  /**
   * Setup monitoring HTTP routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const healthStatus = await this.healthChecker.getHealthStatus();
        const statusCode = healthStatus.status === 'healthy' ? 200 : 
                          healthStatus.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json(healthStatus);
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Metrics endpoint (Prometheus format)
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.metricsCollector.getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Alerts endpoint
    this.app.get('/alerts', (req, res) => {
      const activeAlerts = this.alertingSystem.getActiveAlerts();
      res.json({
        active: activeAlerts,
        count: activeAlerts.length
      });
    });

    // Alert history endpoint
    this.app.get('/alerts/history', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      const history = this.alertingSystem.getAlertHistory(limit);
      res.json(history);
    });

    // Performance metrics endpoint
    this.app.get('/performance', (req, res) => {
      const metrics = this.metricsCollector.getPerformanceMetrics();
      res.json(metrics);
    });
  }

  /**
   * Setup alert event handlers
   */
  private setupAlertHandlers(): void {
    this.alertingSystem.on('alert:fired', (alert: Alert) => {
      console.warn(`🚨 Alert fired: ${alert.message}`);
      // Here you could integrate with external alerting systems
      // like PagerDuty, Slack, email, etc.
    });

    this.alertingSystem.on('alert:resolved', (alert: Alert) => {
      console.info(`✅ Alert resolved: ${alert.condition.name}`);
    });
  }

  /**
   * Setup default health checks
   */
  private setupDefaultHealthChecks(): void {
    // Memory usage check
    this.healthChecker.registerCheck(
      'memory',
      this.healthChecker.createMemoryCheck(0.8, 0.9)
    );

    // Basic system check
    this.healthChecker.registerCheck('system', async () => ({
      name: 'system',
      status: 'pass',
      message: 'System is operational'
    }));
  }

  /**
   * Setup default alert conditions
   */
  private setupDefaultAlerts(): void {
    if (this.config.alertingEnabled) {
      // High error rate alert
      this.alertingSystem.registerCondition(
        AlertingSystem.createHighErrorRateCondition()
      );

      // High response time alert
      this.alertingSystem.registerCondition(
        AlertingSystem.createHighResponseTimeCondition()
      );

      // High memory usage alert
      this.alertingSystem.registerCondition(
        AlertingSystem.createHighMemoryUsageCondition()
      );
    }
  }

  /**
   * Start the monitoring server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.metricsPort, () => {
          console.log(`📊 Monitoring server started on port ${this.config.metricsPort}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the monitoring server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('📊 Monitoring server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get health checker instance
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }

  /**
   * Get metrics collector instance
   */
  getMetricsCollector(): MetricsCollector {
    return this.metricsCollector;
  }

  /**
   * Get alerting system instance
   */
  getAlertingSystem(): AlertingSystem {
    return this.alertingSystem;
  }

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, type: 'counter' | 'gauge' | 'histogram' | 'summary', labels?: Record<string, string>): void {
    this.metricsCollector.recordMetric({
      name,
      value,
      timestamp: new Date(),
      labels,
      type
    });

    // Also send to alerting system for evaluation
    this.alertingSystem.processMetric({
      name,
      value,
      timestamp: new Date(),
      labels,
      type
    });
  }

  /**
   * Get HTTP metrics middleware
   */
  getHttpMetricsMiddleware() {
    return this.metricsCollector.createHttpMetricsMiddleware();
  }
}