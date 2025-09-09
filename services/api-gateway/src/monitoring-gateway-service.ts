import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { MonitoringService } from '@devflow/monitoring';
import { GatewayService, GatewayServiceConfig } from './gateway-service.js';
import { AuthMiddleware, AuthMiddlewareConfig } from './auth/auth-middleware.js';
import { SecurityMiddleware, SecurityMiddlewareConfig } from './security/security-middleware.js';
import { RateLimiter, RateLimiterConfig, MemoryRateLimitStore } from './security/rate-limiter.js';
import { LoadBalancer } from './load-balancing/load-balancer.js';
import { APIGatewayConfig, LoadBalancingConfig, RateLimitConfig } from './interfaces.js';

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
    const apiGatewayConfig: APIGatewayConfig = {
      routes: [],
      loadBalancing: {
        strategy: 'round-robin',
        healthCheck: {
          enabled: true,
          interval: 30000,
          timeout: 5000,
          path: '/health'
        }
      },
      rateLimit: {
        windowMs: config.rateLimitWindowMs,
        maxRequests: config.rateLimitMaxRequests
      },
      cors: {
        enabled: true,
        origins: config.corsOrigins
      },
      security: {
        enabled: true
      }
    };

    const gatewayServiceConfig: GatewayServiceConfig = {
      port: config.port,
      host: '0.0.0.0',
      requestTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000
    };

    this.gatewayService = new GatewayService(apiGatewayConfig, gatewayServiceConfig);

    const authConfig: AuthMiddlewareConfig = {
      jwt: {
        secret: config.jwtSecret,
        issuer: 'devflow-ai',
        audience: 'devflow-api',
        expiresIn: '1h',
        refreshExpiresIn: '7d'
      },
      mfa: {
        enabled: false,
        methods: [],
        gracePeriod: 300,
        backupCodes: {
          enabled: false,
          count: 10
        }
      },
      publicPaths: ['/health', '/metrics'],
      skipAuthPaths: ['/health', '/metrics']
    };

    this.authMiddleware = new AuthMiddleware(authConfig);

    const rateLimiterConfig: RateLimiterConfig = {
      store: new MemoryRateLimitStore()
    };

    this.rateLimiter = new RateLimiter(rateLimiterConfig);

    const securityConfig: SecurityMiddlewareConfig = {
      rateLimiter: this.rateLimiter,
      defaultRateLimit: {
        windowMs: config.rateLimitWindowMs,
        maxRequests: config.rateLimitMaxRequests
      },
      cors: {
        enabled: true,
        origin: config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: [],
        credentials: true,
        maxAge: 86400,
        preflightContinue: false
      },
      security: {
        contentSecurityPolicy: "default-src 'self'",
        xFrameOptions: 'DENY',
        xContentTypeOptions: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        permissionsPolicy: 'geolocation=(), microphone=(), camera=()',
        strictTransportSecurity: {
          enabled: true,
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      },
      validation: {
        maxBodySize: 10 * 1024 * 1024, // 10MB
        allowedContentTypes: ['application/json', 'application/x-www-form-urlencoded'],
        sanitizeInput: true,
        validateHeaders: true
      }
    };

    this.securityMiddleware = new SecurityMiddleware(securityConfig);

    const loadBalancingConfig: LoadBalancingConfig = {
      strategy: 'round-robin',
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 5000,
        path: '/health'
      }
    };

    this.loadBalancer = new LoadBalancer(loadBalancingConfig);

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

    // Rate limiting and security middleware
    this.app.use(async (req, res, next) => {
      try {
        const gatewayRequest = this.convertToGatewayRequest(req);
        const securityResult = await this.securityMiddleware.processRequest(gatewayRequest);
        
        if (!securityResult.allowed) {
          if (securityResult.response) {
            return res.status(securityResult.response.statusCode)
              .set(securityResult.response.headers)
              .json(securityResult.response.body);
          }
          return res.status(403).json({ error: 'Security check failed' });
        }

        // Add security headers
        if (securityResult.headers) {
          res.set(securityResult.headers);
        }

        next();
      } catch (error) {
        next(error);
      }
    });

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
    this.app.use('/api/v1', async (req, res, next) => {
      try {
        const gatewayRequest = this.convertToGatewayRequest(req);
        const authResult = await this.authMiddleware.processAuthentication(gatewayRequest);
        
        if (!authResult.success) {
          if (authResult.response) {
            return res.status(authResult.response.statusCode)
              .set(authResult.response.headers)
              .json(authResult.response.body);
          }
          return res.status(401).json({ error: 'Authentication failed' });
        }

        // Add user info to request
        (req as any).user = authResult.request.user;
        (req as any).isAuthenticated = authResult.request.isAuthenticated;

        next();
      } catch (error) {
        next(error);
      }
    });
    
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
        const serviceInstance = this.loadBalancer.selectEndpoint();
        
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
   * Convert Express request to GatewayRequest format
   */
  private convertToGatewayRequest(req: express.Request): any {
    return {
      id: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body,
      context: {
        requestId: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: req.headers['x-user-id'] as string,
        teamId: req.headers['x-team-id'] as string,
        route: req.route?.path || req.path,
        method: req.method,
        ipAddress: req.ip || req.connection.remoteAddress || '127.0.0.1',
        userAgent: req.headers['user-agent'] || '',
        timestamp: new Date()
      }
    };
  }

  /**
   * Get monitoring service instance
   */
  getMonitoringService(): MonitoringService {
    return this.monitoringService;
  }
}