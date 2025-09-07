import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Workflow,
  WorkflowStatus,
  WorkflowContext,
  UUID
} from '@devflow/shared-types';
import { WorkflowStateManager, WorkflowStateRepository } from '../workflow-state-manager';
import { WorkflowExecutionContext } from '../types';
import { Logger } from '@devflow/shared-utils';

// Mock dependencies
vi.mock('@devflow/shared-utils');

describe('WorkflowStateManager', () => {
  let stateManager: WorkflowStateManager;
  let mockRepository: vi.Mocked<WorkflowStateRepository>;
  let mockLogger: vi.Mocked<Logger>;

  const mockWorkflow: Workflow = {
    id: 'workflow-123' as UUID,
    definitionId: 'def-123' as UUID,
    status: WorkflowStatus.ACTIVE,
    context: {
      projectId: 'project-123' as UUID,
      userId: 'user-123' as UUID,
      teamId: 'team-123' as UUID,
      variables: {},
      metadata: {}
    },
    executionId: 'exec-123' as UUID,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockExecutionContext: WorkflowExecutionContext = {
    workflowId: 'workflow-123' as UUID,
    executionId: 'exec-123' as UUID,
    currentStep: 0,
    variables: { env: 'test' },
    metadata: { source: 'api' },
    startTime: new Date(),
    lastUpdateTime: new Date()
  };

  beforeEach(() => {
    mockRepository = {
      saveWorkflow: vi.fn(),
      getWorkflow: vi.fn(),
      updateWorkflowStatus: vi.fn(),
      getWorkflowsByStatus: vi.fn(),
      saveExecutionContext: vi.fn(),
      getExecutionContext: vi.fn(),
      updateExecutionContext: vi.fn(),
      deleteExecutionContext: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    stateManager = new WorkflowStateManager(mockRepository, mockLogger);
  });

  describe('saveWorkflow', () => {
    it('should save workflow successfully', async () => {
      mockRepository.saveWorkflow.mockResolvedValue();

      await stateManager.saveWorkflow(mockWorkflow);

      expect(mockRepository.saveWorkflow).toHaveBeenCalledWith(mockWorkflow);
      expect(mockLogger.debug).toHaveBeenCalledWith('Workflow saved to repository', {
        workflowId: mockWorkflow.id
      });
    });

    it('should handle repository error', async () => {
      const error = new Error('Database error');
      mockRepository.saveWorkflow.mockRejectedValue(error);

      await expect(stateManager.saveWorkflow(mockWorkflow))
        .rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save workflow', {
        workflowId: mockWorkflow.id,
        error
      });
    });
  });

  describe('getWorkflow', () => {
    it('should get workflow successfully', async () => {
      mockRepository.getWorkflow.mockResolvedValue(mockWorkflow);

      const result = await stateManager.getWorkflow(mockWorkflow.id);

      expect(result).toEqual(mockWorkflow);
      expect(mockRepository.getWorkflow).toHaveBeenCalledWith(mockWorkflow.id);
      expect(mockLogger.debug).toHaveBeenCalledWith('Retrieved workflow from repository', {
        workflowId: mockWorkflow.id,
        found: true
      });
    });

    it('should return null when workflow not found', async () => {
      mockRepository.getWorkflow.mockResolvedValue(null);

      const result = await stateManager.getWorkflow(mockWorkflow.id);

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith('Retrieved workflow from repository', {
        workflowId: mockWorkflow.id,
        found: false
      });
    });
  });

  describe('updateWorkflowStatus', () => {
    it('should update workflow status successfully', async () => {
      mockRepository.updateWorkflowStatus.mockResolvedValue();

      await stateManager.updateWorkflowStatus(mockWorkflow.id, WorkflowStatus.COMPLETED);

      expect(mockRepository.updateWorkflowStatus).toHaveBeenCalledWith(
        mockWorkflow.id,
        WorkflowStatus.COMPLETED
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Workflow status updated', {
        workflowId: mockWorkflow.id,
        status: WorkflowStatus.COMPLETED
      });
    });

    it('should handle repository error', async () => {
      const error = new Error('Update failed');
      mockRepository.updateWorkflowStatus.mockRejectedValue(error);

      await expect(stateManager.updateWorkflowStatus(mockWorkflow.id, WorkflowStatus.COMPLETED))
        .rejects.toThrow('Update failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update workflow status', {
        workflowId: mockWorkflow.id,
        status: WorkflowStatus.COMPLETED,
        error
      });
    });
  });

  describe('saveExecutionContext', () => {
    it('should save execution context successfully', async () => {
      mockRepository.saveExecutionContext.mockResolvedValue();

      await stateManager.saveExecutionContext(mockExecutionContext);

      expect(mockRepository.saveExecutionContext).toHaveBeenCalledWith(mockExecutionContext);
      expect(mockLogger.debug).toHaveBeenCalledWith('Execution context saved', {
        workflowId: mockExecutionContext.workflowId
      });
    });

    it('should update in-memory state', async () => {
      mockRepository.saveExecutionContext.mockResolvedValue();

      await stateManager.saveExecutionContext(mockExecutionContext);

      const inMemoryState = stateManager.getInMemoryState();
      expect(inMemoryState.activeWorkflows.has(mockExecutionContext.workflowId)).toBe(true);
      expect(inMemoryState.activeWorkflows.get(mockExecutionContext.workflowId))
        .toEqual(mockExecutionContext);
    });
  });

  describe('getExecutionContext', () => {
    it('should return context from in-memory cache first', async () => {
      // First save to populate in-memory cache
      mockRepository.saveExecutionContext.mockResolvedValue();
      await stateManager.saveExecutionContext(mockExecutionContext);

      // Now get should return from cache without calling repository
      mockRepository.getExecutionContext.mockClear();
      
      const result = await stateManager.getExecutionContext(mockExecutionContext.workflowId);

      expect(result).toEqual(mockExecutionContext);
      expect(mockRepository.getExecutionContext).not.toHaveBeenCalled();
    });

    it('should fallback to repository when not in cache', async () => {
      mockRepository.getExecutionContext.mockResolvedValue(mockExecutionContext);

      const result = await stateManager.getExecutionContext(mockExecutionContext.workflowId);

      expect(result).toEqual(mockExecutionContext);
      expect(mockRepository.getExecutionContext).toHaveBeenCalledWith(mockExecutionContext.workflowId);
      
      // Should now be in cache
      const inMemoryState = stateManager.getInMemoryState();
      expect(inMemoryState.activeWorkflows.has(mockExecutionContext.workflowId)).toBe(true);
    });

    it('should return null when context not found', async () => {
      mockRepository.getExecutionContext.mockResolvedValue(null);

      const result = await stateManager.getExecutionContext(mockExecutionContext.workflowId);

      expect(result).toBeNull();
    });
  });

  describe('updateExecutionContext', () => {
    it('should update execution context successfully', async () => {
      mockRepository.updateExecutionContext.mockResolvedValue();
      const originalTime = mockExecutionContext.lastUpdateTime;

      await stateManager.updateExecutionContext(mockExecutionContext);

      expect(mockExecutionContext.lastUpdateTime).not.toEqual(originalTime);
      expect(mockRepository.updateExecutionContext).toHaveBeenCalledWith(mockExecutionContext);
      
      // Should update in-memory state
      const inMemoryState = stateManager.getInMemoryState();
      expect(inMemoryState.activeWorkflows.get(mockExecutionContext.workflowId))
        .toEqual(mockExecutionContext);
    });
  });

  describe('deleteExecutionContext', () => {
    it('should delete execution context successfully', async () => {
      // First add to in-memory state
      mockRepository.saveExecutionContext.mockResolvedValue();
      await stateManager.saveExecutionContext(mockExecutionContext);

      // Now delete
      mockRepository.deleteExecutionContext.mockResolvedValue();
      await stateManager.deleteExecutionContext(mockExecutionContext.workflowId);

      expect(mockRepository.deleteExecutionContext).toHaveBeenCalledWith(mockExecutionContext.workflowId);
      
      // Should remove from in-memory state
      const inMemoryState = stateManager.getInMemoryState();
      expect(inMemoryState.activeWorkflows.has(mockExecutionContext.workflowId)).toBe(false);
    });
  });

  describe('initializeFromRepository', () => {
    it('should initialize from repository successfully', async () => {
      const activeWorkflows = [
        { ...mockWorkflow, status: WorkflowStatus.ACTIVE },
        { ...mockWorkflow, id: 'workflow-456' as UUID, status: WorkflowStatus.ACTIVE }
      ];
      const pausedWorkflows = [
        { ...mockWorkflow, id: 'workflow-789' as UUID, status: WorkflowStatus.PAUSED }
      ];

      mockRepository.getWorkflowsByStatus
        .mockResolvedValueOnce(activeWorkflows)
        .mockResolvedValueOnce(pausedWorkflows);

      mockRepository.getExecutionContext
        .mockResolvedValueOnce(mockExecutionContext)
        .mockResolvedValueOnce({ ...mockExecutionContext, workflowId: 'workflow-456' as UUID })
        .mockResolvedValueOnce({ ...mockExecutionContext, workflowId: 'workflow-789' as UUID });

      await stateManager.initializeFromRepository();

      expect(mockRepository.getWorkflowsByStatus).toHaveBeenCalledWith(WorkflowStatus.ACTIVE);
      expect(mockRepository.getWorkflowsByStatus).toHaveBeenCalledWith(WorkflowStatus.PAUSED);
      expect(mockRepository.getExecutionContext).toHaveBeenCalledTimes(3);

      const inMemoryState = stateManager.getInMemoryState();
      expect(inMemoryState.activeWorkflows.size).toBe(3);
      expect(mockLogger.info).toHaveBeenCalledWith('State manager initialized from repository', {
        activeWorkflows: 3
      });
    });

    it('should handle initialization error', async () => {
      const error = new Error('Repository error');
      mockRepository.getWorkflowsByStatus.mockRejectedValue(error);

      await expect(stateManager.initializeFromRepository())
        .rejects.toThrow('Repository error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize state manager from repository',
        { error }
      );
    });
  });

  describe('utility methods', () => {
    it('should return correct active workflows count', async () => {
      mockRepository.saveExecutionContext.mockResolvedValue();
      await stateManager.saveExecutionContext(mockExecutionContext);

      expect(stateManager.getActiveWorkflowsCount()).toBe(1);
    });

    it('should return correct queued workflows count', () => {
      expect(stateManager.getQueuedWorkflowsCount()).toBe(0);
    });

    it('should return in-memory state snapshot', async () => {
      mockRepository.saveExecutionContext.mockResolvedValue();
      await stateManager.saveExecutionContext(mockExecutionContext);

      const state = stateManager.getInMemoryState();
      
      expect(state.activeWorkflows.size).toBe(1);
      expect(state.queuedWorkflows.length).toBe(0);
      expect(state.completedWorkflows.size).toBe(0);
      expect(state.metrics.size).toBe(0);
    });
  });
});