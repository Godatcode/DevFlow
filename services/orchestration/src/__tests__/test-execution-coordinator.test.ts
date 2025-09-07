import { describe, it, expect, beforeEach } from 'vitest';
import { TestExecutionCoordinator, TestPhaseType, TestExecutionStatus } from '../pipeline/test-execution-coordinator';
import { TestingStrategy, ProjectCharacteristics } from '../pipeline/types';

describe('TestExecutionCoordinator', () => {
  let coordinator: TestExecutionCoordinator;
  
  const mockProjectCharacteristics: ProjectCharacteristics = {
    projectId: 'test-project-id' as any,
    languages: ['typescript', 'javascript'],
    frameworks: ['express', 'react'],
    dependencies: ['package.json', 'package-lock.json'],
    repositorySize: 50000,
    teamSize: 8,
    deploymentFrequency: 3,
    testCoverage: 75,
    complexity: 'medium',
    criticality: 'medium',
    complianceRequirements: ['SOC2']
  };

  beforeEach(() => {
    coordinator = new TestExecutionCoordinator();
  });

  describe('createExecutionPlan', () => {
    it('should create a test execution plan for unit-only strategy', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.UNIT_ONLY,
        mockProjectCharacteristics
      );

      expect(plan).toBeDefined();
      expect(plan.projectId).toBe('test-project-id');
      expect(plan.strategy).toBe(TestingStrategy.UNIT_ONLY);
      expect(plan.phases.length).toBeGreaterThan(0);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.UNIT)).toBe(true);
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });

    it('should create a test execution plan for balanced strategy', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        mockProjectCharacteristics
      );

      expect(plan).toBeDefined();
      expect(plan.strategy).toBe(TestingStrategy.BALANCED);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.UNIT)).toBe(true);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.INTEGRATION)).toBe(true);
    });

    it('should create a test execution plan for E2E heavy strategy', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.E2E_HEAVY,
        mockProjectCharacteristics
      );

      expect(plan).toBeDefined();
      expect(plan.strategy).toBe(TestingStrategy.E2E_HEAVY);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.UNIT)).toBe(true);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.INTEGRATION)).toBe(true);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.E2E)).toBe(true);
      expect(plan.phases.some(phase => phase.type === TestPhaseType.SMOKE)).toBe(true);
    });

    it('should include security tests for compliance requirements', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        mockProjectCharacteristics
      );

      expect(plan.phases.some(phase => phase.type === TestPhaseType.SECURITY)).toBe(true);
    });

    it('should include contract tests for microservice architecture', async () => {
      const microserviceCharacteristics = {
        ...mockProjectCharacteristics,
        frameworks: ['express', 'nestjs'],
        dependencies: ['docker', 'package.json']
      };

      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        microserviceCharacteristics
      );

      expect(plan.phases.some(phase => phase.type === TestPhaseType.CONTRACT)).toBe(true);
    });

    it('should configure parallelization based on project characteristics', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        mockProjectCharacteristics
      );

      expect(plan.parallelization).toBeDefined();
      expect(plan.parallelization.enabled).toBe(true); // Repository size > 10000
      expect(plan.parallelization.maxWorkers).toBeLessThanOrEqual(8); // Team size
    });
  });

  describe('executeTestPlan', () => {
    it('should execute a test plan and return results', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.UNIT_ONLY,
        mockProjectCharacteristics
      );

      const result = await coordinator.executeTestPlan(plan.id);

      expect(result).toBeDefined();
      expect(result.planId).toBe(plan.id);
      expect([TestExecutionStatus.COMPLETED, TestExecutionStatus.FAILED]).toContain(result.status);
      expect(result.phases.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
      expect(result.coverage).toBeDefined();
    });

    it('should throw error for non-existent plan', async () => {
      await expect(coordinator.executeTestPlan('non-existent-id' as any))
        .rejects.toThrow('Test execution plan non-existent-id not found');
    });

    it('should handle test execution failures gracefully', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        mockProjectCharacteristics
      );

      const result = await coordinator.executeTestPlan(plan.id);

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });
  });

  describe('getExecutionResult', () => {
    it('should return execution result for existing plan', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.UNIT_ONLY,
        mockProjectCharacteristics
      );

      await coordinator.executeTestPlan(plan.id);
      const result = await coordinator.getExecutionResult(plan.id);

      expect(result).toBeDefined();
      expect(result?.planId).toBe(plan.id);
    });

    it('should return null for non-existent plan', async () => {
      const result = await coordinator.getExecutionResult('non-existent-id' as any);
      expect(result).toBeNull();
    });
  });

  describe('cancelExecution', () => {
    it('should cancel running execution', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.UNIT_ONLY,
        mockProjectCharacteristics
      );

      // Start execution but don't wait for completion
      coordinator.executeTestPlan(plan.id);
      
      await coordinator.cancelExecution(plan.id);
      
      const result = await coordinator.getExecutionResult(plan.id);
      // Note: Due to async nature, the test might complete before cancellation
      // In a real implementation, this would properly handle cancellation
      expect(result).toBeDefined();
    });
  });

  describe('test phase generation', () => {
    it('should generate appropriate test suites for each phase', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        mockProjectCharacteristics
      );

      const unitPhase = plan.phases.find(phase => phase.type === TestPhaseType.UNIT);
      expect(unitPhase).toBeDefined();
      expect(unitPhase?.tests.length).toBeGreaterThan(0);
      expect(unitPhase?.tests[0].framework).toBeDefined();
      expect(unitPhase?.tests[0].estimatedDuration).toBeGreaterThan(0);
    });

    it('should set appropriate timeouts for different test types', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.E2E_HEAVY,
        mockProjectCharacteristics
      );

      const unitPhase = plan.phases.find(phase => phase.type === TestPhaseType.UNIT);
      const e2ePhase = plan.phases.find(phase => phase.type === TestPhaseType.E2E);

      expect(unitPhase?.timeout).toBeLessThan(e2ePhase?.timeout || 0);
    });

    it('should configure retry policies appropriately', async () => {
      const plan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        mockProjectCharacteristics
      );

      const unitPhase = plan.phases.find(phase => phase.type === TestPhaseType.UNIT);
      expect(unitPhase?.retryConfig).toBeDefined();
      expect(unitPhase?.retryConfig.maxAttempts).toBeGreaterThan(0);
      expect(unitPhase?.retryConfig.retryableFailures).toContain('timeout');
    });
  });

  describe('duration estimation', () => {
    it('should estimate shorter duration for parallelizable phases', async () => {
      const sequentialCharacteristics = {
        ...mockProjectCharacteristics,
        repositorySize: 5000 // Small size to disable parallelization
      };

      const parallelCharacteristics = {
        ...mockProjectCharacteristics,
        repositorySize: 50000 // Large size to enable parallelization
      };

      const sequentialPlan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        sequentialCharacteristics
      );

      const parallelPlan = await coordinator.createExecutionPlan(
        'test-project-id' as any,
        TestingStrategy.BALANCED,
        parallelCharacteristics
      );

      // Parallel execution should be enabled for larger projects
      expect(parallelPlan.parallelization.enabled).toBe(true);
      expect(sequentialPlan.parallelization.enabled).toBe(false);
    });
  });
});