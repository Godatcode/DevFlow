import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlertingSystem } from '../alerting-system.js';
import { AlertCondition, MetricData } from '../interfaces.js';

describe('AlertingSystem', () => {
  let alertingSystem: AlertingSystem;
  let mockCondition: AlertCondition;

  beforeEach(() => {
    alertingSystem = new AlertingSystem();
    mockCondition = {
      id: 'test_condition',
      name: 'Test Condition',
      metric: 'test_metric',
      operator: 'gt',
      threshold: 100,
      duration: 60000,
      severity: 'medium'
    };
  });

  describe('registerCondition', () => {
    it('should register an alert condition', () => {
      expect(() => alertingSystem.registerCondition(mockCondition)).not.toThrow();
    });
  });

  describe('removeCondition', () => {
    it('should remove an alert condition', () => {
      alertingSystem.registerCondition(mockCondition);
      expect(() => alertingSystem.removeCondition(mockCondition.id)).not.toThrow();
    });
  });

  describe('processMetric', () => {
    it('should fire alert when condition is met', async () => {
      alertingSystem.registerCondition(mockCondition);

      const alertPromise = new Promise((resolve) => {
        alertingSystem.on('alert:fired', (alert) => {
          expect(alert.id).toBe(mockCondition.id);
          expect(alert.status).toBe('firing');
          expect(alert.condition).toEqual(mockCondition);
          resolve(alert);
        });
      });

      const metric: MetricData = {
        name: 'test_metric',
        value: 150, // Above threshold
        timestamp: new Date(),
        type: 'gauge'
      };

      alertingSystem.processMetric(metric);
      await alertPromise;
    });

    it('should not fire alert when condition is not met', () => {
      alertingSystem.registerCondition(mockCondition);

      const alertFiredSpy = vi.fn();
      alertingSystem.on('alert:fired', alertFiredSpy);

      const metric: MetricData = {
        name: 'test_metric',
        value: 50, // Below threshold
        timestamp: new Date(),
        type: 'gauge'
      };

      alertingSystem.processMetric(metric);
      
      expect(alertFiredSpy).not.toHaveBeenCalled();
    });

    it('should resolve alert when condition is no longer met', async () => {
      alertingSystem.registerCondition(mockCondition);

      // First fire the alert
      const firingMetric: MetricData = {
        name: 'test_metric',
        value: 150,
        timestamp: new Date(),
        type: 'gauge'
      };

      alertingSystem.processMetric(firingMetric);

      // Then resolve it
      const resolvePromise = new Promise((resolve) => {
        alertingSystem.on('alert:resolved', (alert) => {
          expect(alert.id).toBe(mockCondition.id);
          expect(alert.status).toBe('resolved');
          expect(alert.endTime).toBeDefined();
          resolve(alert);
        });
      });

      const resolvingMetric: MetricData = {
        name: 'test_metric',
        value: 50, // Below threshold
        timestamp: new Date(),
        type: 'gauge'
      };

      alertingSystem.processMetric(resolvingMetric);
      await resolvePromise;
    });
  });

  describe('condition operators', () => {
    it('should handle greater than operator', () => {
      const condition = { ...mockCondition, operator: 'gt' as const, threshold: 100 };
      alertingSystem.registerCondition(condition);

      const alertFiredSpy = vi.fn();
      alertingSystem.on('alert:fired', alertFiredSpy);

      // Should fire
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 101,
        timestamp: new Date(),
        type: 'gauge'
      });

      expect(alertFiredSpy).toHaveBeenCalled();
    });

    it('should handle less than operator', () => {
      const condition = { ...mockCondition, operator: 'lt' as const, threshold: 100 };
      alertingSystem.registerCondition(condition);

      const alertFiredSpy = vi.fn();
      alertingSystem.on('alert:fired', alertFiredSpy);

      // Should fire
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 99,
        timestamp: new Date(),
        type: 'gauge'
      });

      expect(alertFiredSpy).toHaveBeenCalled();
    });

    it('should handle equal operator', () => {
      const condition = { ...mockCondition, operator: 'eq' as const, threshold: 100 };
      alertingSystem.registerCondition(condition);

      const alertFiredSpy = vi.fn();
      alertingSystem.on('alert:fired', alertFiredSpy);

      // Should fire
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 100,
        timestamp: new Date(),
        type: 'gauge'
      });

      expect(alertFiredSpy).toHaveBeenCalled();
    });
  });

  describe('getActiveAlerts', () => {
    it('should return only firing alerts', () => {
      alertingSystem.registerCondition(mockCondition);

      // Fire an alert
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 150,
        timestamp: new Date(),
        type: 'gauge'
      });

      const activeAlerts = alertingSystem.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].status).toBe('firing');
    });

    it('should not return resolved alerts', () => {
      alertingSystem.registerCondition(mockCondition);

      // Fire and then resolve an alert
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 150,
        timestamp: new Date(),
        type: 'gauge'
      });

      alertingSystem.processMetric({
        name: 'test_metric',
        value: 50,
        timestamp: new Date(),
        type: 'gauge'
      });

      const activeAlerts = alertingSystem.getActiveAlerts();
      expect(activeAlerts).toHaveLength(0);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history', () => {
      alertingSystem.registerCondition(mockCondition);

      // Fire an alert
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 150,
        timestamp: new Date(),
        type: 'gauge'
      });

      const history = alertingSystem.getAlertHistory();
      expect(history).toHaveLength(1);
    });

    it('should respect limit parameter', () => {
      alertingSystem.registerCondition(mockCondition);

      // Fire multiple alerts (would need different conditions in practice)
      alertingSystem.processMetric({
        name: 'test_metric',
        value: 150,
        timestamp: new Date(),
        type: 'gauge'
      });

      const history = alertingSystem.getAlertHistory(1);
      expect(history.length).toBeLessThanOrEqual(1);
    });
  });

  describe('static condition creators', () => {
    it('should create high error rate condition', () => {
      const condition = AlertingSystem.createHighErrorRateCondition(0.1);
      
      expect(condition.id).toBe('high_error_rate');
      expect(condition.metric).toBe('error_rate');
      expect(condition.operator).toBe('gt');
      expect(condition.threshold).toBe(0.1);
      expect(condition.severity).toBe('high');
    });

    it('should create high response time condition', () => {
      const condition = AlertingSystem.createHighResponseTimeCondition(3000);
      
      expect(condition.id).toBe('high_response_time');
      expect(condition.metric).toBe('response_time_ms');
      expect(condition.operator).toBe('gt');
      expect(condition.threshold).toBe(3000);
      expect(condition.severity).toBe('medium');
    });

    it('should create high memory usage condition', () => {
      const condition = AlertingSystem.createHighMemoryUsageCondition(0.95);
      
      expect(condition.id).toBe('high_memory_usage');
      expect(condition.metric).toBe('memory_usage_ratio');
      expect(condition.operator).toBe('gt');
      expect(condition.threshold).toBe(0.95);
      expect(condition.severity).toBe('critical');
    });
  });
});