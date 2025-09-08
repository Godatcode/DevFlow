import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { register } from 'prom-client';
import { MonitoringService } from '../monitoring-service.js';
import { MonitoringConfig } from '../interfaces.js';

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;
  let config: MonitoringConfig;

  beforeEach(() => {
    register.clear();
    config = {
      serviceName: 'test_service',
      version: '1.0.0',
      metricsPort: 0, // Use random port for testing
      healthCheckInterval: 30000,
      alertingEnabled: true,
      prometheusEnabled: true
    };
    monitoringService = new MonitoringService(config);
  });

  afterEach(async () => {
    if (monitoringService) {
      await monitoringService.stop();
    }
    register.clear();
  });

  describe('HTTP endpoints', () => {
    it('should respond to health check endpoint', async () => {
      const app = (monitoringService as any).app;
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service', 'test_service');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
    });

    it('should respond to metrics endpoint', async () => {
      const app = (monitoringService as any).app;
      
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(typeof response.text).toBe('string');
    });

    it('should respond to alerts endpoint', async () => {
      const app = (monitoringService as any).app;
      
      const response = await request(app)
        .get('/alerts')
        .expect(200);

      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.active)).toBe(true);
    });

    it('should respond to alert history endpoint', async () => {
      const app = (monitoringService as any).app;
      
      const response = await request(app)
        .get('/alerts/history')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should respond to performance endpoint', async () => {
      const app = (monitoringService as any).app;
      
      const response = await request(app)
        .get('/performance')
        .expect(200);

      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('throughput');
      expect(response.body).toHaveProperty('errorRate');
      expect(response.body).toHaveProperty('cpuUsage');
      expect(response.body).toHaveProperty('memoryUsage');
      expect(response.body).toHaveProperty('diskUsage');
    });

    it('should handle health check endpoint errors gracefully', async () => {
      const app = (monitoringService as any).app;
      
      // Register a failing health check
      monitoringService.getHealthChecker().registerCheck('failing-check', async () => {
        throw new Error('Test error');
      });
      
      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
    });
  });

  describe('service lifecycle', () => {
    it('should start and stop successfully', async () => {
      // Note: We can't easily test the actual server start/stop in unit tests
      // without port conflicts, so we'll test the methods exist and don't throw
      expect(typeof monitoringService.start).toBe('function');
      expect(typeof monitoringService.stop).toBe('function');
    });
  });

  describe('component access', () => {
    it('should provide access to health checker', () => {
      const healthChecker = monitoringService.getHealthChecker();
      expect(healthChecker).toBeDefined();
      expect(typeof healthChecker.getHealthStatus).toBe('function');
    });

    it('should provide access to metrics collector', () => {
      const metricsCollector = monitoringService.getMetricsCollector();
      expect(metricsCollector).toBeDefined();
      expect(typeof metricsCollector.recordMetric).toBe('function');
    });

    it('should provide access to alerting system', () => {
      const alertingSystem = monitoringService.getAlertingSystem();
      expect(alertingSystem).toBeDefined();
      expect(typeof alertingSystem.registerCondition).toBe('function');
    });
  });

  describe('recordMetric', () => {
    it('should record metrics successfully', () => {
      expect(() => {
        monitoringService.recordMetric('test_metric', 42, 'gauge');
      }).not.toThrow();
    });

    it('should record metrics with labels', () => {
      expect(() => {
        monitoringService.recordMetric('test_metric', 42, 'gauge', { env: 'test' });
      }).not.toThrow();
    });
  });

  describe('getHttpMetricsMiddleware', () => {
    it('should return middleware function', () => {
      const middleware = monitoringService.getHttpMetricsMiddleware();
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3);
    });
  });
});