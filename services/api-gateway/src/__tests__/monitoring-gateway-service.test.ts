import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { MonitoringGatewayService, MonitoringGatewayConfig } from '../monitoring-gateway-service.js';

describe('MonitoringGatewayService', () => {
  let gatewayService: MonitoringGatewayService;
  let config: MonitoringGatewayConfig;

  beforeEach(() => {
    config = {
      port: 0, // Use random port for testing
      serviceName: 'api_gateway',
      version: '1.0.0',
      metricsPort: 0,
      corsOrigins: ['http://localhost:3000'],
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 100,
      jwtSecret: 'test-secret',
      redisUrl: 'redis://localhost:6379'
    };
    
    gatewayService = new MonitoringGatewayService(config);
  });

  afterEach(async () => {
    if (gatewayService) {
      await gatewayService.stop();
    }
  });

  describe('health endpoints', () => {
    it('should respond to health check endpoint', async () => {
      const app = (gatewayService as any).app;
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service', 'api_gateway');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('checks');
    });

    it('should respond to metrics endpoint', async () => {
      const app = (gatewayService as any).app;
      
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(typeof response.text).toBe('string');
    });
  });

  describe('API routes', () => {
    it('should return 404 for unknown routes', async () => {
      const app = (gatewayService as any).app;
      
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should require authentication for API routes', async () => {
      const app = (gatewayService as any).app;
      
      const response = await request(app)
        .get('/api/v1/workflows')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('monitoring integration', () => {
    it('should provide access to monitoring service', () => {
      const monitoringService = gatewayService.getMonitoringService();
      expect(monitoringService).toBeDefined();
      expect(typeof monitoringService.recordMetric).toBe('function');
    });

    it('should record metrics for requests', async () => {
      const app = (gatewayService as any).app;
      const monitoringService = gatewayService.getMonitoringService();
      const recordMetricSpy = vi.spyOn(monitoringService, 'recordMetric');
      
      await request(app).get('/unknown-route');
      
      expect(recordMetricSpy).toHaveBeenCalledWith(
        'http_404_total',
        1,
        'counter',
        expect.objectContaining({
          path: '/unknown-route',
          method: 'GET'
        })
      );
    });
  });

  describe('service lifecycle', () => {
    it('should have start and stop methods', () => {
      expect(typeof gatewayService.start).toBe('function');
      expect(typeof gatewayService.stop).toBe('function');
    });
  });
});