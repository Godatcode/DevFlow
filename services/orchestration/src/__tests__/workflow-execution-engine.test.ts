import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
  Status,
  UUID,
  EventTriggerType
} from '@devflow/shared-types';
import { WorkflowExecutionEngine, StepExecutor } from '../workflow-execution-engine';
import { WorkflowExecutionContext, StepExecutionResult } from '../types';
import { WorkflowStateManager } from '../workflow-state-manager';
import { Logger } from '@devflow/shared-utils';

// Mock dependencies
vi.mock('../workflow-state-manager');
vi.mock('@devflow/shared-utils');

describe('WorkflowExecutionEngine', () => {
  let engine: WorkflowExecutionEngine;
  let mockStateManager: vi.Mocked<WorkflowStateManager>;
  let mockLogger: vi.Mocked<Logger>;
  let mockStepExecutor: vi.Mocked<StepExecutor>;

  const workflowId = 'workflow-123' as UUID;
  const mockExecutionContext: WorkflowExecutionContext = {
    workflowId,
    executionId: 'exec-123' as UUID,
    currentStep: 0,
    variables: { env: 'test' },
    metadata: { source: 'api' },
    startTime: new Date(),
    lastUpdateTime: new Date()
  };

  const mockWorkflowDefinition: WorkflowDefinition = {
    id: 'def-123' as UUID,
    name: 'Test Workflow',
    description: 'Test workflow',
    version: '1.0.0',
    triggers: [{
      id: 'trigger-1' as UUID,
      type: EventTriggerType.CODE_COMMIT,
      conditions: {},
      enabled: true
    }],
    steps: [
      {
        id: 'step-1' as UUID,
        name: 'Test Step 1',
        type: WorkflowStepType.AGENT_EXECUTION,
        config: { agent: 'test-agent' },
        dependencies: []
      },
      {
        id: 'step-2' as UUID,
        name: 'Test Step 2',
        type: WorkflowStepType.INTEGRATION_CALL,
        config: { service: 'test-service' },
        dependencies: ['step-1' as UUID]
      }
    ],
    variables: {},
    settings: {
      timeout: 3600,
      maxConcurrentExecutions: 5,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000
      },
      notifications: []
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    mockStateManager = {
      updateExecutionContext: vi.fn(),
      deleteExecutionContext: vi.fn()
    } as any;

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    mockStepExecutor = {
      canExecute: vi.fn(),
      execute: vi.fn()
    };

    engine = new WorkflowExecutionEngine(mockStateManager, mockLogger);
    
    // Register mock step executor
    mockStepExecutor.canExecute.mockReturnValue(true);
    engine.registerStepExecutor(mockStepExecutor);
  });

  describe('execute', () => {
    beforeEach(() => {
      // Mock getWorkflowDefinition to return our test definition
      vi.spyOn(engine as any, 'getWorkflowDefinition').mockResolvedValue(mockWorkflowDefinition);
    });

    it('should execute workflow successfully', async () => {
      const mockStepResult: StepExecutionResult = {
        stepId: 'step-1' as UUID,
        success: true,
        output: { result: 'success' },
        duration: 100,
        retryCount: 0
      };

      mockStepExecutor.execute.mockResolvedValue(mockStepResult);
      mockStateManager.updateExecutionContext.mockResolvedValue();

      const result = await engine.execute(workflowId, mockExecutionContext);

      expect(result.status).toBe(Status.COMPLETED);
      expect(result.workflowId).toBe(workflowId);
      expect(result.steps).toHaveLength(2);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(2);
      expect(mockStateManager.updateExecutionContext).toHaveBeenCalled();
    });

    it('should handle step execution failure without retry', async () => {
      const mockStepResult: StepExecutionResult = {
        stepId: 'step-1' as UUID,
        success: false,
        output: null,
        duration: 100,
        error: 'Step failed',
        retryCount: 0
      };

      mockStepExecutor.execute.mockResolvedValue(mockStepResult);
      mockStateManager.updateExecutionContext.mockResolvedValue();

      const result = await engine.execute(workflowId, mockExecutionContext);

      expect(result.status).toBe(Status.FAILED);
      expect(result.error).toBe('Step failed');
      expect(result.steps).toHaveLength(1);
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle step execution failure with successful retry', async () => {
      // Add retry config to first step
      const definitionWithRetry = {
        ...mockWorkflowDefinition,
        steps: [
          {
            ...mockWorkflowDefinition.steps[0],
            retryConfig: {
              maxAttempts: 2,
              backoffStrategy: 'linear' as const,
              initialDelay: 100,
              maxDelay: 1000
            }
          },
          mockWorkflowDefinition.steps[1]
        ]
      };

      // Set up fresh mock without clearing step executor
      vi.spyOn(engine as any, 'getWorkflowDefinition').mockResolvedValue(definitionWithRetry);
      mockStateManager.updateExecutionContext.mockResolvedValue();
      
      // Re-register step executor since we cleared mocks
      mockStepExecutor.canExecute.mockReturnValue(true);
      engine.registerStepExecutor(mockStepExecutor);

      let step1CallCount = 0;
      mockStepExecutor.execute.mockImplementation(async (step) => {
        if (step.id === 'step-1') {
          step1CallCount++;
          if (step1CallCount === 1) {
            // First call to step-1 fails
            return {
              stepId: 'step-1' as UUID,
              success: false,
              output: null,
              duration: 100,
              error: 'Step failed',
              retryCount: 0
            };
          } else {
            // Retry of step-1 succeeds
            return {
              stepId: 'step-1' as UUID,
              success: true,
              output: { result: 'success on retry' },
              duration: 100,
              retryCount: 1
            };
          }
        } else {
          // Step-2 succeeds
          return {
            stepId: step.id,
            success: true,
            output: { result: 'success' },
            duration: 100,
            retryCount: 0
          };
        }
      });

      mockStateManager.updateExecutionContext.mockResolvedValue();

      // Create fresh execution context for this test
      const freshContext: WorkflowExecutionContext = {
        workflowId,
        executionId: 'exec-retry-123' as UUID,
        currentStep: 0,
        variables: { env: 'test' },
        metadata: { source: 'api' },
        startTime: new Date(),
        lastUpdateTime: new Date()
      };

      const result = await engine.execute(workflowId, freshContext);


      
      expect(result.status).toBe(Status.COMPLETED);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].status).toBe(Status.COMPLETED);
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(3); // 2 for first step (fail + retry) + 1 for second step
    });

    it('should handle workflow definition not found', async () => {
      vi.spyOn(engine as any, 'getWorkflowDefinition').mockResolvedValue(null);

      const result = await engine.execute(workflowId, mockExecutionContext);

      expect(result.status).toBe(Status.FAILED);
      expect(result.error).toBe(`Workflow definition not found: ${workflowId}`);
    });

    it('should handle paused execution', async () => {
      // Pause the execution before starting
      await engine.pauseExecution(workflowId);

      const result = await engine.execute(workflowId, mockExecutionContext);

      expect(result.status).toBe(Status.PENDING);
      expect(result.steps).toHaveLength(0);
    });

    it('should resume from current step', async () => {
      const contextWithProgress = {
        ...mockExecutionContext,
        currentStep: 1 // Start from second step
      };

      const mockStepResult: StepExecutionResult = {
        stepId: 'step-2' as UUID,
        success: true,
        output: { result: 'success' },
        duration: 100,
        retryCount: 0
      };

      mockStepExecutor.execute.mockResolvedValue(mockStepResult);
      mockStateManager.updateExecutionContext.mockResolvedValue();

      const result = await engine.execute(workflowId, contextWithProgress);

      expect(result.status).toBe(Status.COMPLETED);
      expect(result.steps).toHaveLength(1); // Only executed the second step
      expect(mockStepExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('pauseExecution', () => {
    it('should pause execution successfully', async () => {
      await engine.pauseExecution(workflowId);

      expect(mockLogger.info).toHaveBeenCalledWith('Workflow execution paused', { workflowId });
    });
  });

  describe('resumeExecution', () => {
    it('should resume execution successfully', async () => {
      mockStateManager.getExecutionContext = vi.fn().mockResolvedValue(mockExecutionContext);

      await engine.resumeExecution(workflowId);

      expect(mockStateManager.getExecutionContext).toHaveBeenCalledWith(workflowId);
      expect(mockLogger.info).toHaveBeenCalledWith('Resuming workflow execution', {
        workflowId,
        currentStep: mockExecutionContext.currentStep
      });
    });
  });

  describe('cancelExecution', () => {
    it('should cancel execution successfully', async () => {
      mockStateManager.deleteExecutionContext.mockResolvedValue();

      await engine.cancelExecution(workflowId);

      expect(mockStateManager.deleteExecutionContext).toHaveBeenCalledWith(workflowId);
      expect(mockLogger.info).toHaveBeenCalledWith('Workflow execution cancelled', { workflowId });
    });
  });

  describe('registerStepExecutor', () => {
    it('should register step executor for supported types', () => {
      const newExecutor: StepExecutor = {
        canExecute: vi.fn().mockImplementation((type) => type === WorkflowStepType.CONDITION),
        execute: vi.fn()
      };

      engine.registerStepExecutor(newExecutor);

      expect(newExecutor.canExecute).toHaveBeenCalledWith(WorkflowStepType.AGENT_EXECUTION);
      expect(newExecutor.canExecute).toHaveBeenCalledWith(WorkflowStepType.INTEGRATION_CALL);
      expect(newExecutor.canExecute).toHaveBeenCalledWith(WorkflowStepType.CONDITION);
      expect(mockLogger.debug).toHaveBeenCalledWith('Step executor registered', {
        stepType: WorkflowStepType.CONDITION
      });
    });
  });

  describe('retry logic', () => {
    it('should calculate linear backoff delay correctly', () => {
      const retryConfig = {
        maxAttempts: 3,
        backoffStrategy: 'linear' as const,
        initialDelay: 1000,
        maxDelay: 5000
      };

      const calculateRetryDelay = (engine as any).calculateRetryDelay.bind(engine);
      
      expect(calculateRetryDelay(retryConfig, 1)).toBe(1000);
      expect(calculateRetryDelay(retryConfig, 2)).toBe(2000);
      expect(calculateRetryDelay(retryConfig, 3)).toBe(3000);
    });

    it('should calculate exponential backoff delay correctly', () => {
      const retryConfig = {
        maxAttempts: 3,
        backoffStrategy: 'exponential' as const,
        initialDelay: 1000,
        maxDelay: 10000
      };

      const calculateRetryDelay = (engine as any).calculateRetryDelay.bind(engine);
      
      expect(calculateRetryDelay(retryConfig, 1)).toBe(1000);
      expect(calculateRetryDelay(retryConfig, 2)).toBe(2000);
      expect(calculateRetryDelay(retryConfig, 3)).toBe(4000);
    });

    it('should respect max delay limit', () => {
      const retryConfig = {
        maxAttempts: 5,
        backoffStrategy: 'exponential' as const,
        initialDelay: 1000,
        maxDelay: 3000
      };

      const calculateRetryDelay = (engine as any).calculateRetryDelay.bind(engine);
      
      expect(calculateRetryDelay(retryConfig, 4)).toBe(3000); // Would be 8000 but capped at 3000
    });
  });
});