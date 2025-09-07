import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentStepExecutor } from '../agent-distribution/agent-step-executor';
import { WorkflowAgentCoordinator, AgentStepResult } from '../agent-distribution/workflow-agent-coordinator';
import { WorkflowExecutionContext } from '../types';
import { UUID, WorkflowStep, WorkflowStepType } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

describe('AgentStepExecutor', () => {
  let executor: AgentStepExecutor;
  let mockAgentCoordinator: vi.Mocked<WorkflowAgentCoordinator>;
  let mockLogger: vi.Mocked<Logger>;

  const mockWorkflowId = 'workflow-123' as UUID;
  const mockExecutionContext: WorkflowExecutionContext = {
    workflowId: mockWorkflowId,
    executionId: 'execution-123' as UUID,
    currentStep: 0,
    variables: { env: 'test' },
    metadata: { source: 'test' },
    startTime: new Date(),
    lastUpdateTime: new Date()
  };

  const mockAgentStep: WorkflowStep = {
    id: 'step-123' as UUID,
    name: 'Security Scan',
    type: WorkflowStepType.AGENT_EXECUTION,
    config: {
      agentType: 'security-guardian',
      includeCodeReview: true
    },
    dependencies: []
  };

  const mockNonAgentStep: WorkflowStep = {
    id: 'step-456' as UUID,
    name: 'Integration Call',
    type: WorkflowStepType.INTEGRATION_CALL,
    config: {
      endpoint: '/api/test'
    },
    dependencies: []
  };

  beforeEach(() => {
    mockAgentCoordinator = {
      coordinateWorkflowExecution: vi.fn(),
      executeAgentStep: vi.fn(),
      cancelWorkflowTasks: vi.fn(),
      getWorkflowTaskStatus: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    executor = new AgentStepExecutor(mockAgentCoordinator, mockLogger);
  });

  describe('canExecute', () => {
    it('should return true for agent execution steps', () => {
      expect(executor.canExecute(WorkflowStepType.AGENT_EXECUTION)).toBe(true);
    });

    it('should return false for non-agent execution steps', () => {
      expect(executor.canExecute(WorkflowStepType.INTEGRATION_CALL)).toBe(false);
      expect(executor.canExecute(WorkflowStepType.CONDITION)).toBe(false);
      expect(executor.canExecute(WorkflowStepType.PARALLEL)).toBe(false);
      expect(executor.canExecute(WorkflowStepType.SEQUENTIAL)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute agent step successfully', async () => {
      const mockAgentResult: AgentStepResult = {
        stepId: mockAgentStep.id,
        taskId: 'task-123' as UUID,
        success: true,
        output: { vulnerabilities: 0, codeQuality: 'A' },
        executionTime: 5000,
        agentId: 'agent-123' as UUID
      };

      mockAgentCoordinator.executeAgentStep.mockResolvedValue(mockAgentResult);

      const result = await executor.execute(mockAgentStep, mockExecutionContext);

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        success: true,
        output: mockAgentResult.output,
        error: undefined,
        retryCount: 0
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);

      expect(mockAgentCoordinator.executeAgentStep).toHaveBeenCalledWith(
        mockWorkflowId,
        mockAgentStep,
        mockExecutionContext
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Executing agent step', {
        workflowId: mockWorkflowId,
        stepId: mockAgentStep.id,
        stepName: mockAgentStep.name,
        agentType: mockAgentStep.config.agentType
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Agent step execution completed', {
        workflowId: mockWorkflowId,
        stepId: mockAgentStep.id,
        taskId: mockAgentResult.taskId,
        success: true,
        duration: expect.any(Number),
        agentId: mockAgentResult.agentId
      });
    });

    it('should handle failed agent step execution', async () => {
      const mockAgentResult: AgentStepResult = {
        stepId: mockAgentStep.id,
        taskId: 'task-123' as UUID,
        success: false,
        output: null,
        executionTime: 3000,
        agentId: 'agent-123' as UUID,
        error: 'Security scan failed'
      };

      mockAgentCoordinator.executeAgentStep.mockResolvedValue(mockAgentResult);

      const result = await executor.execute(mockAgentStep, mockExecutionContext);

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        success: false,
        output: null,
        error: 'Security scan failed',
        retryCount: 0
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);

      expect(mockLogger.info).toHaveBeenCalledWith('Agent step execution completed', {
        workflowId: mockWorkflowId,
        stepId: mockAgentStep.id,
        taskId: mockAgentResult.taskId,
        success: false,
        duration: expect.any(Number),
        agentId: mockAgentResult.agentId
      });
    });

    it('should handle agent coordinator exceptions', async () => {
      const error = new Error('Agent coordinator failed');
      mockAgentCoordinator.executeAgentStep.mockRejectedValue(error);

      const result = await executor.execute(mockAgentStep, mockExecutionContext);

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        success: false,
        output: null,
        error: 'Agent coordinator failed',
        retryCount: 0
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);

      expect(mockLogger.error).toHaveBeenCalledWith('Agent step execution failed', {
        workflowId: mockWorkflowId,
        stepId: mockAgentStep.id,
        error: 'Agent coordinator failed',
        duration: expect.any(Number)
      });
    });

    it('should handle non-Error exceptions', async () => {
      const error = 'String error';
      mockAgentCoordinator.executeAgentStep.mockRejectedValue(error);

      const result = await executor.execute(mockAgentStep, mockExecutionContext);

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        success: false,
        output: null,
        error: 'String error',
        retryCount: 0
      });
    });

    it('should log agent type from step config', async () => {
      const stepWithoutAgentType: WorkflowStep = {
        ...mockAgentStep,
        config: {
          someOtherConfig: 'value'
        }
      };

      const mockAgentResult: AgentStepResult = {
        stepId: stepWithoutAgentType.id,
        taskId: 'task-123' as UUID,
        success: true,
        output: {},
        executionTime: 1000
      };

      mockAgentCoordinator.executeAgentStep.mockResolvedValue(mockAgentResult);

      await executor.execute(stepWithoutAgentType, mockExecutionContext);

      expect(mockLogger.info).toHaveBeenCalledWith('Executing agent step', {
        workflowId: mockWorkflowId,
        stepId: stepWithoutAgentType.id,
        stepName: stepWithoutAgentType.name,
        agentType: undefined
      });
    });

    it('should measure execution time accurately', async () => {
      const mockAgentResult: AgentStepResult = {
        stepId: mockAgentStep.id,
        taskId: 'task-123' as UUID,
        success: true,
        output: {},
        executionTime: 2000
      };

      // Add a small delay to the mock to test timing
      mockAgentCoordinator.executeAgentStep.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockAgentResult;
      });

      const result = await executor.execute(mockAgentStep, mockExecutionContext);

      expect(result.duration).toBeGreaterThanOrEqual(10);
    });
  });
});