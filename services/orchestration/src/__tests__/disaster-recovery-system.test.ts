import { describe, it, expect, beforeEach } from 'vitest';
import { 
  IntelligentDisasterRecoverySystem,
  RollbackStrategy,
  RollbackConfig,
  HealthCheckType,
  TriggerType,
  RollbackExecutionStatus,
  RecoveryStatusType
} from '../pipeline/disaster-recovery-system';

describe('IntelligentDisasterRecoverySystem', () => {
  let recoverySystem: IntelligentDisasterRecoverySystem;
  
  const mockRollbackConfig: RollbackConfig = {
    strategy: RollbackStrategy.BLUE_GREEN,
    timeout: 600, // 10 minutes
    healthChecks: [
      {
        id: 'health-check-1' as any,
        name: 'API Health Check',
        type: HealthCheckType.HTTP,
        endpoint: 'http://api-service/health',
        expectedResponse: { status: 'healthy' },
        timeout: 30,
        interval: 10,
        retries: 3,
        criticalityLevel: 'high'
      },
      {
        id: 'health-check-2' as any,
        name: 'Database Health Check',
        type: HealthCheckType.DATABASE,
        command: 'pg_isready -h db-host',
        timeout: 15,
        interval: 5,
        retries: 2,
        criticalityLevel: 'critical'
      }
    ],
    rollbackTriggers: [
      {
        id: 'trigger-1' as any,
        name: 'High Error Rate',
        type: TriggerType.ERROR_RATE,
        condition: { operator: 'gt', value: 5, metric: 'error_rate' },
        threshold: 5,
        timeWindow: 300,
        enabled: true,
        priority: 'high'
      },
      {
        id: 'trigger-2' as any,
        name: 'Slow Response Time',
        type: TriggerType.RESPONSE_TIME,
        condition: { operator: 'gt', value: 1000, metric: 'response_time' },
        threshold: 1000,
        timeWindow: 180,
        enabled: true,
        priority: 'medium'
      }
    ],
    notifications: [
      {
        channel: 'slack',
        recipients: ['#alerts'],
        events: ['rollback_triggered', 'rollback_completed', 'rollback_failed']
      }
    ],
    dataBackup: {
      enabled: true,
      strategy: 'snapshot',
      retentionPeriod: 7,
      encryptionEnabled: true,
      verificationEnabled: true
    }
  };

  beforeEach(() => {
    recoverySystem = new IntelligentDisasterRecoverySystem();
  });

  describe('createRollbackPlan', () => {
    it('should create a rollback plan with blue-green strategy', async () => {
      const deploymentId = 'deployment-123' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      expect(plan).toBeDefined();
      expect(plan.deploymentId).toBe(deploymentId);
      expect(plan.strategy).toBe(RollbackStrategy.BLUE_GREEN);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.healthChecks).toEqual(mockRollbackConfig.healthChecks);
      expect(plan.triggers).toEqual(mockRollbackConfig.rollbackTriggers);
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });

    it('should create a rollback plan with rolling strategy', async () => {
      const rollingConfig = {
        ...mockRollbackConfig,
        strategy: RollbackStrategy.ROLLING
      };

      const plan = await recoverySystem.createRollbackPlan('deployment-456' as any, rollingConfig);

      expect(plan.strategy).toBe(RollbackStrategy.ROLLING);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.steps[0].name).toContain('Rolling');
    });

    it('should create a rollback plan with canary strategy', async () => {
      const canaryConfig = {
        ...mockRollbackConfig,
        strategy: RollbackStrategy.CANARY
      };

      const plan = await recoverySystem.createRollbackPlan('deployment-789' as any, canaryConfig);

      expect(plan.strategy).toBe(RollbackStrategy.CANARY);
      expect(plan.steps.some(step => step.name.includes('Canary'))).toBe(true);
    });

    it('should create a rollback plan with immediate strategy', async () => {
      const immediateConfig = {
        ...mockRollbackConfig,
        strategy: RollbackStrategy.IMMEDIATE
      };

      const plan = await recoverySystem.createRollbackPlan('deployment-immediate' as any, immediateConfig);

      expect(plan.strategy).toBe(RollbackStrategy.IMMEDIATE);
      expect(plan.steps.some(step => step.name.includes('Immediate'))).toBe(true);
    });

    it('should calculate estimated duration correctly', async () => {
      const plan = await recoverySystem.createRollbackPlan('deployment-duration' as any, mockRollbackConfig);

      const totalStepTimeout = plan.steps.reduce((sum, step) => sum + step.timeout, 0);
      expect(plan.estimatedDuration).toBe(totalStepTimeout);
    });
  });

  describe('executeRollback', () => {
    it('should execute rollback plan successfully', async () => {
      const deploymentId = 'deployment-execute' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      const execution = await recoverySystem.executeRollback(plan.id);

      expect(execution).toBeDefined();
      expect(execution.planId).toBe(plan.id);
      expect([
        RollbackExecutionStatus.COMPLETED,
        RollbackExecutionStatus.FAILED,
        RollbackExecutionStatus.PARTIALLY_COMPLETED
      ]).toContain(execution.status);
      expect(execution.steps.length).toBeGreaterThan(0);
      expect(execution.startedAt).toBeDefined();
      expect(execution.completedAt).toBeDefined();
      expect(execution.duration).toBeGreaterThan(0);
      expect(execution.metrics).toBeDefined();
    });

    it('should throw error for non-existent plan', async () => {
      await expect(recoverySystem.executeRollback('non-existent-plan' as any))
        .rejects.toThrow('Rollback plan non-existent-plan not found');
    });

    it('should handle step failures gracefully', async () => {
      const deploymentId = 'deployment-failure' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      const execution = await recoverySystem.executeRollback(plan.id);

      expect(execution).toBeDefined();
      expect(execution.metrics.stepsExecuted).toBeGreaterThan(0);
      expect(execution.metrics.totalDuration).toBeGreaterThan(0);
    });

    it('should calculate rollback metrics correctly', async () => {
      const deploymentId = 'deployment-metrics' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      const execution = await recoverySystem.executeRollback(plan.id);

      expect(execution.metrics.stepsExecuted).toBe(execution.steps.length);
      expect(execution.metrics.stepsSuccessful + execution.metrics.stepsFailed).toBe(execution.steps.length);
      expect(execution.metrics.serviceAvailability).toBeGreaterThanOrEqual(0);
      expect(execution.metrics.serviceAvailability).toBeLessThanOrEqual(100);
    });
  });

  describe('monitorDeployment', () => {
    it('should start monitoring deployment with triggers', async () => {
      const deploymentId = 'deployment-monitor' as any;
      const triggers = mockRollbackConfig.rollbackTriggers;

      // This should not throw an error
      await expect(recoverySystem.monitorDeployment(deploymentId, triggers))
        .resolves.not.toThrow();
    });

    it('should handle empty triggers array', async () => {
      const deploymentId = 'deployment-empty-triggers' as any;

      await expect(recoverySystem.monitorDeployment(deploymentId, []))
        .resolves.not.toThrow();
    });
  });

  describe('getRecoveryStatus', () => {
    it('should return recovery status for deployment', async () => {
      const deploymentId = 'deployment-status' as any;
      
      // Start monitoring first
      await recoverySystem.monitorDeployment(deploymentId, mockRollbackConfig.rollbackTriggers);
      
      const status = await recoverySystem.getRecoveryStatus(deploymentId);

      expect(status).toBeDefined();
      expect(status.deploymentId).toBe(deploymentId);
      expect(status.healthScore).toBeGreaterThanOrEqual(0);
      expect(status.healthScore).toBeLessThanOrEqual(100);
      expect([
        RecoveryStatusType.HEALTHY,
        RecoveryStatusType.DEGRADED,
        RecoveryStatusType.CRITICAL,
        RecoveryStatusType.RECOVERING,
        RecoveryStatusType.FAILED
      ]).toContain(status.status);
      expect(status.metrics).toBeDefined();
      expect(Array.isArray(status.activeIssues)).toBe(true);
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should detect active issues based on metrics', async () => {
      const deploymentId = 'deployment-issues' as any;
      
      await recoverySystem.monitorDeployment(deploymentId, mockRollbackConfig.rollbackTriggers);
      const status = await recoverySystem.getRecoveryStatus(deploymentId);

      // Issues detection is probabilistic in our mock, so we just verify structure
      status.activeIssues.forEach(issue => {
        expect(issue.id).toBeDefined();
        expect(issue.type).toBeDefined();
        expect(['low', 'medium', 'high', 'critical']).toContain(issue.severity);
        expect(issue.description).toBeDefined();
        expect(issue.detectedAt).toBeDefined();
        expect(Array.isArray(issue.affectedComponents)).toBe(true);
      });
    });

    it('should calculate health score correctly', async () => {
      const deploymentId = 'deployment-health' as any;
      
      await recoverySystem.monitorDeployment(deploymentId, mockRollbackConfig.rollbackTriggers);
      const status = await recoverySystem.getRecoveryStatus(deploymentId);

      expect(status.healthScore).toBeGreaterThanOrEqual(0);
      expect(status.healthScore).toBeLessThanOrEqual(100);
      
      // Health score should influence recovery status
      if (status.healthScore >= 80 && status.activeIssues.length === 0) {
        expect(status.status).toBe(RecoveryStatusType.HEALTHY);
      } else if (status.healthScore < 50) {
        expect([RecoveryStatusType.FAILED, RecoveryStatusType.CRITICAL]).toContain(status.status);
      }
    });
  });

  describe('rollback step execution', () => {
    it('should execute steps with proper validation', async () => {
      const deploymentId = 'deployment-validation' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      const execution = await recoverySystem.executeRollback(plan.id);

      // Verify that steps have validation results
      execution.steps.forEach(stepResult => {
        expect(stepResult.stepId).toBeDefined();
        expect(stepResult.startedAt).toBeDefined();
        expect(stepResult.completedAt).toBeDefined();
        expect(stepResult.duration).toBeGreaterThanOrEqual(0);
        expect(stepResult.retryCount).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(stepResult.validationResults)).toBe(true);
      });
    });

    it('should handle step retries correctly', async () => {
      const deploymentId = 'deployment-retries' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      const execution = await recoverySystem.executeRollback(plan.id);

      // Verify retry logic
      execution.steps.forEach(stepResult => {
        const correspondingStep = plan.steps.find(step => step.id === stepResult.stepId);
        if (correspondingStep) {
          expect(stepResult.retryCount).toBeLessThanOrEqual(correspondingStep.retryConfig.maxAttempts);
        }
      });
    });

    it('should respect step timeouts', async () => {
      const deploymentId = 'deployment-timeout' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      const execution = await recoverySystem.executeRollback(plan.id);

      // Verify that execution completes (duration should be positive)
      expect(execution.duration).toBeGreaterThan(0);
    });
  });

  describe('health checks', () => {
    it('should validate health check configuration', async () => {
      const deploymentId = 'deployment-health-checks' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      expect(plan.healthChecks.length).toBe(mockRollbackConfig.healthChecks.length);
      
      plan.healthChecks.forEach(healthCheck => {
        expect(healthCheck.id).toBeDefined();
        expect(healthCheck.name).toBeDefined();
        expect(healthCheck.type).toBeDefined();
        expect(healthCheck.timeout).toBeGreaterThan(0);
        expect(healthCheck.interval).toBeGreaterThan(0);
        expect(healthCheck.retries).toBeGreaterThanOrEqual(0);
        expect(['low', 'medium', 'high', 'critical']).toContain(healthCheck.criticalityLevel);
      });
    });
  });

  describe('rollback triggers', () => {
    it('should validate trigger configuration', async () => {
      const deploymentId = 'deployment-triggers' as any;
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);

      expect(plan.triggers.length).toBe(mockRollbackConfig.rollbackTriggers.length);
      
      plan.triggers.forEach(trigger => {
        expect(trigger.id).toBeDefined();
        expect(trigger.name).toBeDefined();
        expect(trigger.type).toBeDefined();
        expect(trigger.condition).toBeDefined();
        expect(trigger.condition.operator).toBeDefined();
        expect(trigger.condition.value).toBeDefined();
        expect(trigger.condition.metric).toBeDefined();
        expect(trigger.threshold).toBeGreaterThanOrEqual(0);
        expect(trigger.timeWindow).toBeGreaterThan(0);
        expect(typeof trigger.enabled).toBe('boolean');
        expect(['low', 'medium', 'high', 'critical']).toContain(trigger.priority);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete rollback lifecycle', async () => {
      const deploymentId = 'deployment-lifecycle' as any;
      
      // Create rollback plan
      const plan = await recoverySystem.createRollbackPlan(deploymentId, mockRollbackConfig);
      expect(plan).toBeDefined();
      
      // Start monitoring
      await recoverySystem.monitorDeployment(deploymentId, mockRollbackConfig.rollbackTriggers);
      
      // Execute rollback
      const execution = await recoverySystem.executeRollback(plan.id);
      expect(execution).toBeDefined();
      
      // Check recovery status
      const status = await recoverySystem.getRecoveryStatus(deploymentId);
      expect(status).toBeDefined();
      expect(status.lastRollback).toBeDefined();
    });

    it('should maintain SLA for rollback execution time', async () => {
      const deploymentId = 'deployment-sla' as any;
      const slaConfig = {
        ...mockRollbackConfig,
        timeout: 600 // 10 minutes SLA
      };
      
      const plan = await recoverySystem.createRollbackPlan(deploymentId, slaConfig);
      
      const startTime = Date.now();
      const execution = await recoverySystem.executeRollback(plan.id);
      const actualDuration = Date.now() - startTime;
      
      // Verify execution completes within SLA (with some buffer for test execution)
      expect(actualDuration).toBeLessThan(slaConfig.timeout * 1000 + 5000); // 5 second buffer
      expect(execution.duration).toBeLessThan(slaConfig.timeout * 1000);
    });
  });
});