import { describe, it, expect, beforeEach } from 'vitest';
import { HealthChecker } from '../health-checker.js';
import { MonitoringConfig } from '../interfaces.js';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let config: MonitoringConfig;

  beforeEach(() => {
    config = {
      serviceName: 'test-service',
      version: '1.0.0',
      metricsPort: 3001,
      healthCheckInterval: 30000,
      alertingEnabled: true,
      prometheusEnabled: true
    };
    healthChecker = new HealthChecker(config);
  });

  describe('getHealthStatus', () => {
    it('should return healthy status with no checks', async () => {
      const status = await healthChecker.getHealthStatus();
      
      expect(status.status).toBe('healthy');
      expect(status.service).toBe('test-service');
      expect(status.version).toBe('1.0.0');
      expect(status.checks).toHaveLength(0);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return healthy status with passing checks', async () => {
      healthChecker.registerCheck('test-check', async () => ({
        name: 'test-check',
        status: 'pass',
        message: 'Test passed'
      }));

      const status = await healthChecker.getHealthStatus();
      
      expect(status.status).toBe('healthy');
      expect(status.checks).toHaveLength(1);
      expect(status.checks[0].status).toBe('pass');
      expect(status.checks[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded status with warning checks', async () => {
      healthChecker.registerCheck('warning-check', async () => ({
        name: 'warning-check',
        status: 'warn',
        message: 'Warning condition'
      }));

      const status = await healthChecker.getHealthStatus();
      
      expect(status.status).toBe('degraded');
      expect(status.checks[0].status).toBe('warn');
    });

    it('should return unhealthy status with failing checks', async () => {
      healthChecker.registerCheck('failing-check', async () => ({
        name: 'failing-check',
        status: 'fail',
        message: 'Check failed'
      }));

      const status = await healthChecker.getHealthStatus();
      
      expect(status.status).toBe('unhealthy');
      expect(status.checks[0].status).toBe('fail');
    });

    it('should handle check exceptions', async () => {
      healthChecker.registerCheck('error-check', async () => {
        throw new Error('Check error');
      });

      const status = await healthChecker.getHealthStatus();
      
      expect(status.status).toBe('unhealthy');
      expect(status.checks[0].status).toBe('fail');
      expect(status.checks[0].message).toContain('Check error');
    });
  });

  describe('createDatabaseCheck', () => {
    it('should create passing database check', async () => {
      const dbCheck = healthChecker.createDatabaseCheck('postgres', async () => true);
      const result = await dbCheck();
      
      expect(result.status).toBe('pass');
      expect(result.message).toContain('successful');
    });

    it('should create failing database check', async () => {
      const dbCheck = healthChecker.createDatabaseCheck('postgres', async () => false);
      const result = await dbCheck();
      
      expect(result.status).toBe('fail');
      expect(result.message).toContain('failed');
    });

    it('should handle database check exceptions', async () => {
      const dbCheck = healthChecker.createDatabaseCheck('postgres', async () => {
        throw new Error('Connection error');
      });
      const result = await dbCheck();
      
      expect(result.status).toBe('fail');
      expect(result.message).toContain('Connection error');
    });
  });

  describe('createMemoryCheck', () => {
    it('should create memory check with current usage', async () => {
      const memoryCheck = healthChecker.createMemoryCheck(0.8, 0.9);
      const result = await memoryCheck();
      
      expect(result.name).toBe('memory');
      expect(result.status).toMatch(/pass|warn|fail/);
      expect(result.metadata).toHaveProperty('heapUsed');
      expect(result.metadata).toHaveProperty('heapTotal');
      expect(result.metadata).toHaveProperty('ratio');
    });
  });

  describe('createExternalServiceCheck', () => {
    it('should handle external service check timeout', async () => {
      const serviceCheck = healthChecker.createExternalServiceCheck(
        'test-service',
        'http://nonexistent-service.local',
        100
      );
      
      const result = await serviceCheck();
      
      expect(result.status).toBe('fail');
      expect(result.message).toContain('failed');
    });
  });
});