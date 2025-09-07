import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  WorkflowDefinition,
  Workflow,
  WorkflowContext,
  WorkflowStatus,
  UUID,
  EventTriggerType,
  WorkflowStepType,
  Status
} from '@devflow/shared-types';
import { WorkflowOrchestratorImpl } from '../workflow-orchestrator';
import { WorkflowStateManager } from '../workflow-state-manager';
import { WorkflowExecutionEngine } from '../workflow-execution-engine';
import { Logger } from '@devflow/shared-utils';

// Mock dependencies
vi.mock('../workflow-state-manager');
vi.mock('../workflow-execution-engine');
vi.mock('@devflow/shared-utils');

describe('WorkflowOrchestratorImpl', () => {
  let orchestrator: WorkflowOrchestratorImpl;
  let mockStateManager: vi.Mocked<WorkflowStateManager>;
  let mockExecutionEngine: vi.Mocked<WorkflowExecutionEngine>;
  let mockLogger: vi.Mocked<Logger>;

  const mockWorkflowDefinition: WorkflowDefinition = {
    id: 'def-123' as UUID,
    name: 'Test Workflow',
    description: 'Test workflow description',
    version: '1.0.0',
    triggers: [{
      id: 'trigger-1' as UUID,
      type: EventTriggerType.CODE_COMMIT,
      conditions: {},
      enabled: true
    }],
    steps: [{
      id: 'step-1' as UUID,
      name: 'Test Step',
      type: WorkflowStepType.AGENT_EXECUTION,
      config: {},
      dependencies: []
    }],
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

  const mockWorkflowContext: WorkflowContext = {
    projectId: 'project-123' as UUID,
    userId: 'user-123' as UUID,
    teamId: 'team-123' as UUID,
    variables: { env: 'test' },
    metadata: { source: 'api' }
  };

  beforeEach(() => {
    mockStateManager = {
      saveWorkflow: vi.fn(),
      getWorkflow: vi.fn(),
      updateWorkflowStatus: vi.fn(),
      getWorkflowsByStatus: vi.fn(),
      saveExecutionContext: vi.fn(),
      getExecutionContext: vi.fn(),
      updateExecutionContext: vi.fn(),
      deleteExecutionContext: vi.fn(),
      getActiveWorkflowsCount: vi.fn(),
      getQueuedWorkflowsCount: vi.fn(),
      getInMemoryState: vi.fn(),
      initializeFromRepository: vi.fn()
    } as any;

    mockExecutionEngine = {
      execute: vi.fn(),
      pauseExecution: vi.fn(),
      resumeExecution: vi.fn(),
      cancelExecution: vi.fn(),
      registerStepExecutor: vi.fn()
    } as any;

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    orchestrator = new WorkflowOrchestratorImpl(
      mockStateManager,
      mockExecutionEngine,
      mockLogger
    );

    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'mock-uuid-123')
    });
  });

  describe('createWorkflow', () => {
    it('should create a new workflow successfully', async () => {
      mockStateManager.saveWorkflow.mockResolvedValue();

      const result = await orchestrator.createWorkflow(mockWorkflowDefinition);

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        definitionId: mockWorkflowDefinition.id,
        status: WorkflowStatus.DRAFT,
        executionId: 'mock-uuid-123'
      });
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(mockStateManager.saveWorkflow).toHaveBeenCalledWith(result);
      expect(mockLogger.info).toHaveBeenCalledWith('Creating workflow', { 
        definitionId: mockWorkflowDefinition.id 
      });
    });

    it('should handle save workflow failure', async () => {
      const error = new Error('Database error');
      mockStateManager.saveWorkflow.mockRejectedValue(error);

      await expect(orchestrator.createWorkflow(mockWorkflowDefinition))
        .rejects.toThrow('Database error');
    });
  });

  describe('executeWorkflow', () => {
    const workflowId = 'workflow-123' as UUID;

    it('should execute workflow successfully', async () => {
      const mockResult = {
        workflowId,
        status: Status.COMPLETED,
        steps: [],
        duration: 1000
      };

      mockStateManager.updateWorkflowStatus.mockResolvedValue();
      mockStateManager.saveExecutionContext.mockResolvedValue();
      mockExecutionEngine.execute.mockResolvedValue(mockResult);

      const result = await orchestrator.executeWorkflow(workflowId, mockWorkflowContext);

      expect(result).toEqual(mockResult);
      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.ACTIVE
      );
      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.COMPLETED
      );
      expect(mockStateManager.saveExecutionContext).toHaveBeenCalled();
      expect(mockExecutionEngine.execute).toHaveBeenCalled();
    });

    it('should handle workflow execution failure', async () => {
      const error = new Error('Execution failed');
      mockStateManager.updateWorkflowStatus.mockResolvedValue();
      mockStateManager.saveExecutionContext.mockResolvedValue();
      mockExecutionEngine.execute.mockRejectedValue(error);

      await expect(orchestrator.executeWorkflow(workflowId, mockWorkflowContext))
        .rejects.toThrow('Execution failed');

      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.FAILED
      );
    });

    it('should mark workflow as failed when execution returns failed status', async () => {
      const mockResult = {
        workflowId,
        status: Status.FAILED,
        steps: [],
        duration: 1000,
        error: 'Step failed'
      };

      mockStateManager.updateWorkflowStatus.mockResolvedValue();
      mockStateManager.saveExecutionContext.mockResolvedValue();
      mockExecutionEngine.execute.mockResolvedValue(mockResult);

      const result = await orchestrator.executeWorkflow(workflowId, mockWorkflowContext);

      expect(result).toEqual(mockResult);
      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.FAILED
      );
    });
  });

  describe('pauseWorkflow', () => {
    const workflowId = 'workflow-123' as UUID;

    it('should pause active workflow successfully', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.ACTIVE,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);
      mockStateManager.updateWorkflowStatus.mockResolvedValue();
      mockExecutionEngine.pauseExecution.mockResolvedValue();

      await orchestrator.pauseWorkflow(workflowId);

      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.PAUSED
      );
      expect(mockExecutionEngine.pauseExecution).toHaveBeenCalledWith(workflowId);
    });

    it('should throw error when workflow not found', async () => {
      mockStateManager.getWorkflow.mockResolvedValue(null);

      await expect(orchestrator.pauseWorkflow(workflowId))
        .rejects.toThrow(`Workflow not found: ${workflowId}`);
    });

    it('should throw error when workflow is not active', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.COMPLETED,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(orchestrator.pauseWorkflow(workflowId))
        .rejects.toThrow(`Cannot pause workflow in status: ${WorkflowStatus.COMPLETED}`);
    });
  });

  describe('resumeWorkflow', () => {
    const workflowId = 'workflow-123' as UUID;

    it('should resume paused workflow successfully', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.PAUSED,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);
      mockStateManager.updateWorkflowStatus.mockResolvedValue();
      mockExecutionEngine.resumeExecution.mockResolvedValue();

      await orchestrator.resumeWorkflow(workflowId);

      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.ACTIVE
      );
      expect(mockExecutionEngine.resumeExecution).toHaveBeenCalledWith(workflowId);
    });

    it('should throw error when workflow is not paused', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.ACTIVE,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(orchestrator.resumeWorkflow(workflowId))
        .rejects.toThrow(`Cannot resume workflow in status: ${WorkflowStatus.ACTIVE}`);
    });
  });

  describe('cancelWorkflow', () => {
    const workflowId = 'workflow-123' as UUID;

    it('should cancel active workflow successfully', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.ACTIVE,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);
      mockStateManager.updateWorkflowStatus.mockResolvedValue();
      mockExecutionEngine.cancelExecution.mockResolvedValue();

      await orchestrator.cancelWorkflow(workflowId);

      expect(mockStateManager.updateWorkflowStatus).toHaveBeenCalledWith(
        workflowId, 
        WorkflowStatus.CANCELLED
      );
      expect(mockExecutionEngine.cancelExecution).toHaveBeenCalledWith(workflowId);
    });

    it('should throw error when workflow is already completed', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.COMPLETED,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(orchestrator.cancelWorkflow(workflowId))
        .rejects.toThrow(`Cannot cancel workflow in status: ${WorkflowStatus.COMPLETED}`);
    });
  });

  describe('getWorkflowStatus', () => {
    const workflowId = 'workflow-123' as UUID;

    it('should return workflow status successfully', async () => {
      const mockWorkflow: Workflow = {
        id: workflowId,
        definitionId: 'def-123' as UUID,
        status: WorkflowStatus.ACTIVE,
        context: mockWorkflowContext,
        executionId: 'exec-123' as UUID,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockStateManager.getWorkflow.mockResolvedValue(mockWorkflow);

      const status = await orchestrator.getWorkflowStatus(workflowId);

      expect(status).toBe(WorkflowStatus.ACTIVE);
    });

    it('should throw error when workflow not found', async () => {
      mockStateManager.getWorkflow.mockResolvedValue(null);

      await expect(orchestrator.getWorkflowStatus(workflowId))
        .rejects.toThrow(`Workflow not found: ${workflowId}`);
    });
  });
});