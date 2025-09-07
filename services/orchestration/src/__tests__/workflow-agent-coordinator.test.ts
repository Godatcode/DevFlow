import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  WorkflowAgentCoordinatorImpl,
  WorkflowAgentCoordinator,
  AgentStepResult 
} from '../agent-distribution/workflow-agent-coordinator';
import { 
  AgentManager, 
  AgentCapability 
} from '../agent-distribution/agent-manager';
import { 
  TaskDistributor, 
  Task, 
  TaskStatus, 
  TaskPriority 
} from '../agent-distribution/task-distributor';
import { WorkflowExecutionContext } from '../types';
import { UUID, WorkflowStep, WorkflowStepType } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

describe('WorkflowAgentCoordinator', () => {
  let coordinator: WorkflowAgentCoordinator;
  let mockAgentManager: vi.Mocked<AgentManager>;
  let mockTaskDistributor: vi.Mocked<TaskDistributor>;
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
      includeCodeReview: true,
      priority: 'high'
    },
    dependencies: [],
    timeout: 30000
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

  const mockTask: Task = {
    id: 'task-123' as UUID,
    workflowId: mockWorkflowId,
    stepId: mockAgentStep.id,
    type: 'security-guardian',
    requiredCapabilities: [AgentCapability.SECURITY_SCANNING, AgentCapability.CODE_REVIEW],
    priority: TaskPriority.HIGH,
    status: TaskStatus.PENDING,
    payload: {},
    createdAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    metadata: {}
  };

  beforeEach(() => {
    mockAgentManager = {
      registerAgent: vi.fn(),
      unregisterAgent: vi.fn(),
      updateAgentStatus: vi.fn(),
      updateAgentLoad: vi.fn(),
      heartbeat: vi.fn(),
      getAgent: vi.fn(),
      getAllAgents: vi.fn(),
      getAvailableAgents: vi.fn(),
      getAgentsByCapability: vi.fn(),
      getAvailableAgentsByCapability: vi.fn(),
      updateAgentMetrics: vi.fn(),
      getAgentMetrics: vi.fn(),
      getAllAgentMetrics: vi.fn(),
      performHealthCheck: vi.fn(),
      getAgentStatistics: vi.fn()
    };

    mockTaskDistributor = {
      submitTask: vi.fn(),
      processTaskQueue: vi.fn(),
      assignTask: vi.fn(),
      startTask: vi.fn(),
      completeTask: vi.fn(),
      cancelTask: vi.fn(),
      getTask: vi.fn(),
      getAllTasks: vi.fn(),
      getTasksByStatus: vi.fn(),
      getTasksByWorkflow: vi.fn(),
      getQueueLength: vi.fn(),
      getAssignment: vi.fn(),
      getAllAssignments: vi.fn(),
      getDistributionStatistics: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    coordinator = new WorkflowAgentCoordinatorImpl(
      mockAgentManager,
      mockTaskDistributor,
      mockLogger
    );
  });

  describe('coordinateWorkflowExecution', () => {
    it('should coordinate workflow with agent steps successfully', async () => {
      const steps = [mockAgentStep, mockNonAgentStep, mockAgentStep];
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);

      const result = await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      expect(result).toMatchObject({
        workflowId: mockWorkflowId,
        totalSteps: 3,
        agentSteps: 2,
        tasksCreated: 2
      });
      expect(result.coordinationTime).toBeGreaterThanOrEqual(0);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting workflow agent coordination', {
        workflowId: mockWorkflowId,
        totalSteps: 3,
        executionId: mockExecutionContext.executionId
      });
    });

    it('should handle workflow with no agent steps', async () => {
      const steps = [mockNonAgentStep];

      const result = await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      expect(result).toMatchObject({
        workflowId: mockWorkflowId,
        totalSteps: 1,
        agentSteps: 0,
        tasksCreated: 0
      });

      expect(mockTaskDistributor.submitTask).not.toHaveBeenCalled();
    });

    it('should handle task creation failure', async () => {
      const steps = [mockAgentStep];
      mockTaskDistributor.submitTask.mockRejectedValue(new Error('Task creation failed'));

      await expect(coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      )).rejects.toThrow('Task creation failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create agent task for workflow step', {
        workflowId: mockWorkflowId,
        stepId: mockAgentStep.id,
        error: 'Task creation failed'
      });
    });
  });

  describe('executeAgentStep', () => {
    it('should execute agent step successfully', async () => {
      const completedTask = { ...mockTask, status: TaskStatus.COMPLETED };
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      mockTaskDistributor.getTask.mockReturnValue(completedTask);

      const result = await coordinator.executeAgentStep(
        mockWorkflowId,
        mockAgentStep,
        mockExecutionContext
      );

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        taskId: mockTask.id,
        success: true
      });
      expect(result.executionTime).toBeGreaterThanOrEqual(0);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledWith({
        workflowId: mockWorkflowId,
        stepId: mockAgentStep.id,
        type: 'security-guardian',
        requiredCapabilities: [AgentCapability.SECURITY_SCANNING, AgentCapability.CODE_REVIEW],
        priority: TaskPriority.HIGH,
        payload: {
          stepConfig: mockAgentStep.config,
          workflowContext: mockExecutionContext,
          stepName: mockAgentStep.name
        },
        timeout: mockAgentStep.timeout,
        maxRetries: 3,
        metadata: {
          workflowExecutionId: mockExecutionContext.executionId,
          stepName: mockAgentStep.name,
          stepType: mockAgentStep.type
        }
      });
    });

    it('should handle failed agent step', async () => {
      const failedTask = { 
        ...mockTask, 
        status: TaskStatus.FAILED,
        metadata: { error: 'Agent execution failed' }
      };
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      mockTaskDistributor.getTask.mockReturnValue(failedTask);

      const result = await coordinator.executeAgentStep(
        mockWorkflowId,
        mockAgentStep,
        mockExecutionContext
      );

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        taskId: mockTask.id,
        success: false,
        error: 'Agent execution failed'
      });
    });

    it('should reject non-agent execution steps', async () => {
      await expect(coordinator.executeAgentStep(
        mockWorkflowId,
        mockNonAgentStep,
        mockExecutionContext
      )).rejects.toThrow(`Step ${mockNonAgentStep.id} is not an agent execution step`);
    });

    it('should handle task creation failure', async () => {
      mockTaskDistributor.submitTask.mockRejectedValue(new Error('Task creation failed'));

      const result = await coordinator.executeAgentStep(
        mockWorkflowId,
        mockAgentStep,
        mockExecutionContext
      );

      expect(result).toMatchObject({
        stepId: mockAgentStep.id,
        taskId: '',
        success: false,
        error: 'Task creation failed'
      });
    });

    it('should handle task timeout', async () => {
      const shortTimeoutStep = { ...mockAgentStep, timeout: 100 };
      const runningTask = { ...mockTask, status: TaskStatus.RUNNING };
      
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      mockTaskDistributor.getTask.mockReturnValue(runningTask);

      const result = await coordinator.executeAgentStep(
        mockWorkflowId,
        shortTimeoutStep,
        mockExecutionContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('cancelWorkflowTasks', () => {
    it('should cancel all workflow tasks', async () => {
      // First coordinate a workflow to create tasks
      const steps = [mockAgentStep];
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      
      await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      // Then cancel the workflow tasks
      mockTaskDistributor.cancelTask.mockResolvedValue();

      await coordinator.cancelWorkflowTasks(mockWorkflowId);

      expect(mockTaskDistributor.cancelTask).toHaveBeenCalledWith(mockTask.id);
      expect(mockLogger.info).toHaveBeenCalledWith('Cancelling all tasks for workflow', {
        workflowId: mockWorkflowId
      });
    });

    it('should handle workflow with no active tasks', async () => {
      await coordinator.cancelWorkflowTasks(mockWorkflowId);

      expect(mockTaskDistributor.cancelTask).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('No active tasks found for workflow', {
        workflowId: mockWorkflowId
      });
    });

    it('should handle task cancellation failures gracefully', async () => {
      // First coordinate a workflow to create tasks
      const steps = [mockAgentStep];
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      
      await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      // Mock cancellation failure
      mockTaskDistributor.cancelTask.mockRejectedValue(new Error('Cancellation failed'));

      await coordinator.cancelWorkflowTasks(mockWorkflowId);

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to cancel task', {
        workflowId: mockWorkflowId,
        taskId: mockTask.id,
        error: 'Cancellation failed'
      });
    });
  });

  describe('getWorkflowTaskStatus', () => {
    it('should return status for workflow with tasks', async () => {
      // First coordinate a workflow to create tasks
      const steps = [mockAgentStep, mockAgentStep];
      const task1 = { ...mockTask, id: 'task-1' as UUID, status: TaskStatus.COMPLETED };
      const task2 = { ...mockTask, id: 'task-2' as UUID, status: TaskStatus.RUNNING };
      
      mockTaskDistributor.submitTask
        .mockResolvedValueOnce(task1)
        .mockResolvedValueOnce(task2);
      
      await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      // Mock task retrieval
      mockTaskDistributor.getTask
        .mockImplementation((taskId) => {
          if (taskId === task1.id) return task1;
          if (taskId === task2.id) return task2;
          return undefined;
        });

      const status = await coordinator.getWorkflowTaskStatus(mockWorkflowId);

      expect(status).toEqual({
        workflowId: mockWorkflowId,
        totalTasks: 2,
        pendingTasks: 0,
        runningTasks: 1,
        completedTasks: 1,
        failedTasks: 0,
        cancelledTasks: 0
      });
    });

    it('should return empty status for workflow with no tasks', async () => {
      const status = await coordinator.getWorkflowTaskStatus(mockWorkflowId);

      expect(status).toEqual({
        workflowId: mockWorkflowId,
        totalTasks: 0,
        pendingTasks: 0,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0
      });
    });
  });

  describe('capability extraction', () => {
    it('should extract capabilities for security-guardian', async () => {
      const securityStep: WorkflowStep = {
        id: 'step-security' as UUID,
        name: 'Security Scan',
        type: WorkflowStepType.AGENT_EXECUTION,
        config: {
          agentType: 'security-guardian',
          includeCodeReview: true
        },
        dependencies: []
      };

      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);

      await coordinator.executeAgentStep(mockWorkflowId, securityStep, mockExecutionContext);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredCapabilities: [AgentCapability.SECURITY_SCANNING, AgentCapability.CODE_REVIEW]
        })
      );
    });

    it('should extract capabilities for performance-optimizer', async () => {
      const perfStep: WorkflowStep = {
        id: 'step-perf' as UUID,
        name: 'Performance Optimization',
        type: WorkflowStepType.AGENT_EXECUTION,
        config: {
          agentType: 'performance-optimizer',
          includeMonitoring: true
        },
        dependencies: []
      };

      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);

      await coordinator.executeAgentStep(mockWorkflowId, perfStep, mockExecutionContext);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredCapabilities: [AgentCapability.PERFORMANCE_OPTIMIZATION, AgentCapability.MONITORING]
        })
      );
    });

    it('should use fallback capabilities for unknown agent types', async () => {
      const unknownStep: WorkflowStep = {
        id: 'step-unknown' as UUID,
        name: 'Unknown Agent',
        type: WorkflowStepType.AGENT_EXECUTION,
        config: {
          agentType: 'unknown-agent'
        },
        dependencies: []
      };

      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);

      await coordinator.executeAgentStep(mockWorkflowId, unknownStep, mockExecutionContext);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredCapabilities: [AgentCapability.CODE_ANALYSIS]
        })
      );
    });
  });

  describe('priority determination', () => {
    it('should use explicit priority from step config', async () => {
      const criticalStep: WorkflowStep = {
        id: 'step-critical' as UUID,
        name: 'Critical Task',
        type: WorkflowStepType.AGENT_EXECUTION,
        config: {
          agentType: 'security-guardian',
          priority: 'critical'
        },
        dependencies: []
      };

      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);

      await coordinator.executeAgentStep(mockWorkflowId, criticalStep, mockExecutionContext);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: TaskPriority.CRITICAL
        })
      );
    });

    it('should use default priority based on agent type', async () => {
      const styleStep: WorkflowStep = {
        id: 'step-style' as UUID,
        name: 'Style Enforcement',
        type: WorkflowStepType.AGENT_EXECUTION,
        config: {
          agentType: 'style-enforcer'
        },
        dependencies: []
      };

      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);

      await coordinator.executeAgentStep(mockWorkflowId, styleStep, mockExecutionContext);

      expect(mockTaskDistributor.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: TaskPriority.LOW
        })
      );
    });
  });

  describe('cleanupCompletedWorkflows', () => {
    it('should cleanup workflows with all completed tasks', async () => {
      // Create a workflow with tasks
      const steps = [mockAgentStep];
      const completedTask = { ...mockTask, status: TaskStatus.COMPLETED };
      
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      
      await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      // Mock task as completed
      mockTaskDistributor.getTask.mockReturnValue(completedTask);

      // Perform cleanup
      (coordinator as any).cleanupCompletedWorkflows();

      // Verify workflow was cleaned up
      const status = await coordinator.getWorkflowTaskStatus(mockWorkflowId);
      expect(status.totalTasks).toBe(0);

      expect(mockLogger.debug).toHaveBeenCalledWith('Cleaned up completed workflow tasks', {
        workflowId: mockWorkflowId
      });
    });

    it('should not cleanup workflows with active tasks', async () => {
      // Create a workflow with tasks
      const steps = [mockAgentStep];
      const runningTask = { ...mockTask, status: TaskStatus.RUNNING };
      
      mockTaskDistributor.submitTask.mockResolvedValue(mockTask);
      
      await coordinator.coordinateWorkflowExecution(
        mockWorkflowId,
        mockExecutionContext,
        steps
      );

      // Mock task as still running
      mockTaskDistributor.getTask.mockReturnValue(runningTask);

      // Perform cleanup
      (coordinator as any).cleanupCompletedWorkflows();

      // Verify workflow was not cleaned up
      const status = await coordinator.getWorkflowTaskStatus(mockWorkflowId);
      expect(status.totalTasks).toBe(1);
    });
  });
});