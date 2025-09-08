import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { MonitoringService } from '@devflow/monitoring';
import { GatewayService } from './gateway-service.js';
import { AuthMiddleware } from './auth/auth-middleware.js';
import { SecurityMiddleware } from './security/security-middleware.js';
import { RateLimiter } from './security/rate-limiter.js';
import { LoadBalancer } from './load-balancing/load-balancer.js';

export interface MonitoringGatewayConfig {
  port: number;
  serviceName: string;
  version: string;
  metricsPort: number;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  jwtSecret: string;
  redisUrl: string;
}

export class MonitoringGatewayService {
  private app: express.Application;
  private monitoringService: MonitoringService;
  private gatewayService: GatewayService;
  private authMiddleware: AuthMiddleware;
  private securityMiddleware: SecurityMiddleware;
  private rateLimiter: RateLimiter;
  private loadBalancer: LoadBalancer;
  private config: MonitoringGatewayConfig;
  private server?: any;

  constructor(config: MonitoringGatewayConfig) {
    this.config = config;
    this.app = express();
    
    // Initialize monitoring
    this.monitoringService = new MonitoringService({
      serviceName: config.serviceName,
      version: config.version,
      metricsPort: config.metricsPort,
      healthCheckInterval: 30000,
      alertingEnabled: true,
      prometheusEnabled: true
    });

    // Initialize other services
    this.gatewayService = new GatewayService();
    this.authMiddleware = new AuthMiddleware(config.jwtSecret);
    this.securityMiddleware = new SecurityMiddleware();
    this.rateLimiter = new RateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      redisUrl: config.redisUrl
    });
    this.loadBalancer = new LoadBalancer();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupHealthChecks();
    this.setupAlerts();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Monitoring middleware (should be early in the chain)
    this.app.use(this.monitoringService.getHttpMetricsMiddleware());

    // Rate limiting
    this.app.use(this.rateLimiter.getMiddleware());

    // Security middleware
    this.app.use(this.securityMiddleware.getMiddleware());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check routes (no auth required)
    this.app.get('/health', async (req, res) => {
      try {
        const healthStatus = await this.monitoringService.getHealthChecker().getHealthStatus();
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

    // Metrics endpoint (no auth required for monitoring systems)
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.monitoringService.getMetricsCollector().getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API routes with authentication
    this.app.use('/api/v1', this.authMiddleware.getMiddleware());
    
    // Orchestration service routes
    this.app.use('/api/v1/workflows', this.createProxyRoute('orchestration'));
    this.app.use('/api/v1/agents', this.createProxyRoute('orchestration'));
    
    // Analytics service routes
    this.app.use('/api/v1/analytics', this.createProxyRoute('analytics'));
    this.app.use('/api/v1/metrics', this.createProxyRoute('analytics'));
    
    // Integration service routes
    this.app.use('/api/v1/integrations', this.createProxyRoute('integration'));
    
    // Automation service routes
    this.app.use('/api/v1/automation', this.createProxyRoute('automation'));

    // 404 handler
    this.app.use('*', (req, res) => {
      this.monitoringService.recordMetric('http_404_total', 1, 'counter', {
        path: req.originalUrl,
        method: req.method
      });
      res.status(404).json({ error: 'Route not found' });
    });

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.monitoringService.recordMetric('http_errors_total', 1, 'counter', {
        error_type: error.name || 'UnknownError',
        status_code: error.status?.toString() || '500'
      });

      console.error('Gateway error:', error);
      res.status(error.status || 500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    });
  }

  /**
   * Create proxy route for downstream services
   */
  private createProxyRoute(serviceName: string) {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const startTime = Date.now();
        
        // Get service instance from load balancer
        const serviceInstance = await this.loadBalancer.getHealthyInstance(serviceName);
        
        if (!serviceInstance) {
          this.monitoringService.recordMetric('service_unavailable_total', 1, 'counter', {
            service: serviceName
          });
          return res.status(503).json({ error: `Service ${serviceName} unavailable` });
        }

        // Proxy the request (simplified - in production you'd use a proper HTTP proxy)
        const response = await this.proxyRequest(serviceInstance, req);
        
        // Record metrics
        const duration = Date.now() - startTime;
        this.monitoringService.recordMetric('proxy_request_duration_ms', duration, 'histogram', {
          service: serviceName,
          method: req.method,
          status_code: response.status.toString()
        });

        res.status(response.status).json(response.data);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Proxy HTTP request to downstream service
   */
  private async proxyRequest(serviceInstance: any, req: express.Request): Promise<{ status: number; data: any }> {
    // This is a simplified proxy implementation
    // In production, you'd use a proper HTTP client like axios or node-fetch
    const url = `${serviceInstance.url}${req.path}`;
    
    try {
      const response = await fetch(url, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization || '',
          'X-User-ID': req.headers['x-user-id'] as string || '',
          'X-Request-ID': req.headers['x-request-id'] as string || ''
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
      });

      const data = await response.json();
      return { status: response.status, data };
    } catch (error) {
      throw new Error(`Proxy request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Setup health checks for dependencies
   */
  private setupHealthChecks(): void {
    const healthChecker = this.monitoringService.getHealthChecker();

    // Database health check
    healthChecker.registerCheck('database', async () => {
      try {
        // This would check your actual database connection
        return {
          name: 'database',
          status: 'pass',
          message: 'Database connection healthy'
        };
      } catch (error) {
        return {
          name: 'database',
          status: 'fail',
          message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    });

    // Redis health check
    healthChecker.registerCheck('redis', async () => {
      try {
        // This would check your actual Redis connection
        return {
          name: 'redis',
          status: 'pass',
          message: 'Redis connection healthy'
        };
      } catch (error) {
        return {
          name: 'redis',
          status: 'fail',
          message: `Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    });

    // Downstream services health checks
    const services = ['orchestration', 'analytics', 'integration', 'automation'];
    services.forEach(service => {
      healthChecker.registerCheck(
        `service_${service}`,
        healthChecker.createExternalServiceCheck(
          service,
          `http://${service}-service:3000/health`,
          5000
        )
      );
    });
  }

  /**
   * Setup custom alerts
   */
  private setupAlerts(): void {
    const alertingSystem = this.monitoringService.getAlertingSystem();

    // High gateway response time alert
    alertingSystem.registerCondition({
      id: 'gateway_high_response_time',
      name: 'Gateway High Response Time',
      metric: 'proxy_request_duration_ms',
      operator: 'gt',
      threshold: 5000, // 5 seconds
      duration: 120000, // 2 minutes
      severity: 'high'
    });

    // Service unavailable alert
    alertingSystem.registerCondition({
      id: 'service_unavailable',
      name: 'Downstream Service Unavailable',
      metric: 'service_unavailable_total',
      operator: 'gt',
      threshold: 5, // More than 5 unavailable responses
      duration: 60000, // 1 minute
      severity: 'critical'
    });

    // High error rate alert
    alertingSystem.registerCondition({
      id: 'gateway_high_error_rate',
      name: 'Gateway High Error Rate',
      metric: 'http_errors_total',
      operator: 'gt',
      threshold: 10, // More than 10 errors
      duration: 300000, // 5 minutes
      severity: 'high'
    });
  }

  /**
   * Start the gateway service
   */
  async start(): Promise<void> {
    try {
      // Start monitoring service first
      await this.monitoringService.start();
      
      // Start main gateway server
      await new Promise<void>((resolve, reject) => {
        this.server = this.app.listen(this.config.port, () => {
          console.log(`🚀 API Gateway started on port ${this.config.port}`);
          console.log(`📊 Monitoring available on port ${this.config.metricsPort}`);
          resolve();
        });
        
        this.server.on('error', reject);
      });

      // Record startup metric
      this.monitoringService.recordMetric('service_starts_total', 1, 'counter');
      
    } catch (error) {
      console.error('Failed to start gateway service:', error);
      throw error;
    }
  }

  /**
   * Stop the gateway service
   */
  async stop(): Promise<void> {
    try {
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server.close(() => {
            console.log('🛑 API Gateway stopped');
            resolve();
          });
        });
      }

      await this.monitoringService.stop();
    } catch (error) {
      console.error('Error stopping gateway service:', error);
      throw error;
    }
  }

  /**
   * Get monitoring service instance
   */
  getMonitoringService(): MonitoringService {
    return this.monitoringService;
  }
}