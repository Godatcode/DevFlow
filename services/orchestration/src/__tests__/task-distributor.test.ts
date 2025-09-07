import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  TaskDistributor, 
  Task, 
  TaskStatus, 
  TaskPriority, 
  DistributionStrategy,
  DistributionConfig
} from '../agent-distribution/task-distributor';
import { 
  AgentManager, 
  Agent, 
  AgentCapability, 
  AgentStatus 
} from '../agent-distribution/agent-manager';
import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

describe('TaskDistributor', () => {
  let taskDistributor: TaskDistributor;
  let mockAgentManager: vi.Mocked<AgentManager>;
  let mockLogger: vi.Mocked<Logger>;

  const defaultConfig: DistributionConfig = {
    strategy: DistributionStrategy.LEAST_LOADED,
    enableLoadBalancing: true,
    enableFailover: true,
    maxRetries: 3,
    taskTimeout: 30000
  };

  const mockAgent1: Agent = {
    id: 'agent-1' as UUID,
    name: 'Security Agent',
    type: 'security-scanner',
    capabilities: [AgentCapability.SECURITY_SCANNING, AgentCapability.CODE_REVIEW],
    status: AgentStatus.AVAILABLE,
    currentLoad: 0,
    maxConcurrentTasks: 3,
    priority: 100,
    lastHeartbeat: new Date(),
    metadata: {}
  };

  const mockAgent2: Agent = {
    id: 'agent-2' as UUID,
    name: 'Performance Agent',
    type: 'performance-optimizer',
    capabilities: [AgentCapability.PERFORMANCE_OPTIMIZATION],
    status: AgentStatus.AVAILABLE,
    currentLoad: 1,
    maxConcurrentTasks: 2,
    priority: 90,
    lastHeartbeat: new Date(),
    metadata: {}
  };

  const mockTaskData = {
    workflowId: 'workflow-123' as UUID,
    stepId: 'step-123' as UUID,
    type: 'security-scan',
    requiredCapabilities: [AgentCapability.SECURITY_SCANNING],
    priority: TaskPriority.NORMAL,
    payload: { target: 'src/' },
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

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    taskDistributor = new TaskDistributor(mockAgentManager, mockLogger, defaultConfig);

    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'task-uuid-123')
    });
  });

  describe('submitTask', () => {
    it('should submit task successfully', async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();

      const task = await taskDistributor.submitTask(mockTaskData);

      expect(task).toMatchObject({
        id: 'task-uuid-123',
        workflowId: mockTaskData.workflowId,
        stepId: mockTaskData.stepId,
        type: mockTaskData.type,
        status: TaskStatus.ASSIGNED, // Should be assigned immediately
        retryCount: 0,
        maxRetries: defaultConfig.maxRetries
      });

      expect(task.createdAt).toBeInstanceOf(Date);
      expect(mockLogger.info).toHaveBeenCalledWith('Task submitted to queue', expect.objectContaining({
        taskId: task.id,
        workflowId: mockTaskData.workflowId
      }));
    });

    it('should queue task when no suitable agents available', async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([]);

      const task = await taskDistributor.submitTask(mockTaskData);

      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.assignedAgentId).toBeUndefined();
      expect(taskDistributor.getQueueLength()).toBe(1);
    });

    it('should sort tasks by priority in queue', async () => {
      // Ensure no agents are available so tasks stay in queue
      mockAgentManager.getAvailableAgents.mockReturnValue([]);

      const task1 = await taskDistributor.submitTask({
        ...mockTaskData,
        priority: TaskPriority.LOW
      });

      const task2 = await taskDistributor.submitTask({
        ...mockTaskData,
        priority: TaskPriority.HIGH
      });

      const task3 = await taskDistributor.submitTask({
        ...mockTaskData,
        priority: TaskPriority.NORMAL
      });

      // Check that all tasks are in the queue (since no agents available)
      expect(taskDistributor.getQueueLength()).toBe(3);
      
      const pendingTasks = taskDistributor.getTasksByStatus(TaskStatus.PENDING);
      expect(pendingTasks).toHaveLength(3);
      expect(pendingTasks[0].priority).toBe(TaskPriority.HIGH);
      expect(pendingTasks[1].priority).toBe(TaskPriority.NORMAL);
      expect(pendingTasks[2].priority).toBe(TaskPriority.LOW);
    });
  });

  describe('assignTask', () => {
    let task: Task;

    beforeEach(async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([]);
      task = await taskDistributor.submitTask(mockTaskData);
    });

    it('should assign task to suitable agent', async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();

      const assignment = await taskDistributor.assignTask(task);

      expect(assignment).toMatchObject({
        taskId: task.id,
        agentId: mockAgent1.id
      });
      expect(assignment?.assignedAt).toBeInstanceOf(Date);

      expect(task.status).toBe(TaskStatus.ASSIGNED);
      expect(task.assignedAgentId).toBe(mockAgent1.id);
      expect(mockAgentManager.updateAgentLoad).toHaveBeenCalledWith(mockAgent1.id, 1);
    });

    it('should return null when no suitable agents available', async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([]);

      const assignment = await taskDistributor.assignTask(task);

      expect(assignment).toBeNull();
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(mockLogger.debug).toHaveBeenCalledWith('No suitable agents available for task', {
        taskId: task.id,
        requiredCapabilities: task.requiredCapabilities
      });
    });

    it('should filter agents by capabilities', async () => {
      const agentWithoutCapability: Agent = {
        ...mockAgent1,
        id: 'agent-no-cap' as UUID,
        capabilities: [AgentCapability.PERFORMANCE_OPTIMIZATION] // Different capability
      };

      mockAgentManager.getAvailableAgents.mockReturnValue([agentWithoutCapability, mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();

      const assignment = await taskDistributor.assignTask(task);

      expect(assignment?.agentId).toBe(mockAgent1.id); // Should pick the one with correct capability
    });

    it('should filter agents by capacity', async () => {
      const busyAgent: Agent = {
        ...mockAgent1,
        currentLoad: 3, // At max capacity
        maxConcurrentTasks: 3
      };

      mockAgentManager.getAvailableAgents.mockReturnValue([busyAgent]);

      const assignment = await taskDistributor.assignTask(task);

      expect(assignment).toBeNull(); // Should not assign to busy agent
    });
  });

  describe('distribution strategies', () => {
    let task: Task;

    beforeEach(async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([]);
      task = await taskDistributor.submitTask(mockTaskData);
    });

    it('should use least loaded strategy', async () => {
      const config = { ...defaultConfig, strategy: DistributionStrategy.LEAST_LOADED };
      const distributor = new TaskDistributor(mockAgentManager, mockLogger, config);

      const agent1 = { ...mockAgent1, currentLoad: 2, maxConcurrentTasks: 3 }; // 66% loaded
      const agent2 = { ...mockAgent1, id: 'agent-2' as UUID, currentLoad: 0, maxConcurrentTasks: 2 }; // 0% loaded

      mockAgentManager.getAvailableAgents.mockReturnValue([agent1, agent2]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();

      const newTask = await distributor.submitTask(mockTaskData);

      expect(newTask.assignedAgentId).toBe(agent2.id); // Should pick less loaded agent
    });

    it('should use priority based strategy', async () => {
      const config = { ...defaultConfig, strategy: DistributionStrategy.PRIORITY_BASED };
      const distributor = new TaskDistributor(mockAgentManager, mockLogger, config);

      const lowPriorityAgent = { ...mockAgent1, priority: 50 };
      const highPriorityAgent = { ...mockAgent1, id: 'agent-2' as UUID, priority: 150 };

      mockAgentManager.getAvailableAgents.mockReturnValue([lowPriorityAgent, highPriorityAgent]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();

      const newTask = await distributor.submitTask(mockTaskData);

      expect(newTask.assignedAgentId).toBe(highPriorityAgent.id); // Should pick higher priority agent
    });

    it('should use round robin strategy', async () => {
      const config = { ...defaultConfig, strategy: DistributionStrategy.ROUND_ROBIN };
      const distributor = new TaskDistributor(mockAgentManager, mockLogger, config);

      const agent1 = { ...mockAgent1 };
      const agent2 = { ...mockAgent1, id: 'agent-2' as UUID };

      mockAgentManager.getAvailableAgents.mockReturnValue([agent1, agent2]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();

      const task1 = await distributor.submitTask(mockTaskData);
      const task2 = await distributor.submitTask(mockTaskData);

      expect(task1.assignedAgentId).toBe(agent1.id);
      expect(task2.assignedAgentId).toBe(agent2.id);
    });
  });

  describe('task lifecycle', () => {
    let task: Task;

    beforeEach(async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
      task = await taskDistributor.submitTask(mockTaskData);
    });

    it('should start task successfully', async () => {
      await taskDistributor.startTask(task.id);

      const updatedTask = taskDistributor.getTask(task.id);
      expect(updatedTask?.status).toBe(TaskStatus.RUNNING);
      expect(updatedTask?.startedAt).toBeInstanceOf(Date);
    });

    it('should throw error when starting non-assigned task', async () => {
      // Create a pending task
      mockAgentManager.getAvailableAgents.mockReturnValue([]);
      const pendingTask = await taskDistributor.submitTask(mockTaskData);

      await expect(taskDistributor.startTask(pendingTask.id))
        .rejects.toThrow(`Task is not in assigned status: ${TaskStatus.PENDING}`);
    });

    it('should complete task successfully', async () => {
      await taskDistributor.startTask(task.id);
      mockAgentManager.getAgent.mockReturnValue(mockAgent1);

      await taskDistributor.completeTask(task.id, {
        agentId: mockAgent1.id,
        success: true,
        output: { result: 'success' },
        executionTime: 1000
      });

      const updatedTask = taskDistributor.getTask(task.id);
      expect(updatedTask?.status).toBe(TaskStatus.COMPLETED);
      expect(updatedTask?.completedAt).toBeInstanceOf(Date);

      expect(mockAgentManager.updateAgentLoad).toHaveBeenCalledWith(mockAgent1.id, 0);
      expect(mockAgentManager.updateAgentMetrics).toHaveBeenCalledWith(
        mockAgent1.id,
        true,
        1000
      );
    });

    it('should handle task failure with retry', async () => {
      const config = { ...defaultConfig, enableFailover: true, maxRetries: 2 };
      const distributor = new TaskDistributor(mockAgentManager, mockLogger, config);

      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
      mockAgentManager.getAgent.mockReturnValue(mockAgent1);

      const failingTask = await distributor.submitTask(mockTaskData);
      await distributor.startTask(failingTask.id);

      // Make agents unavailable for retry to keep task in pending state
      mockAgentManager.getAvailableAgents.mockReturnValue([]);

      await distributor.completeTask(failingTask.id, {
        agentId: mockAgent1.id,
        success: false,
        error: 'Task failed',
        executionTime: 500
      });

      const updatedTask = distributor.getTask(failingTask.id);
      expect(updatedTask?.status).toBe(TaskStatus.PENDING); // Should be queued for retry
      expect(updatedTask?.retryCount).toBe(1);
      expect(distributor.getQueueLength()).toBe(1);
    });

    it('should fail task after max retries', async () => {
      const config = { ...defaultConfig, enableFailover: true, maxRetries: 1 };
      const distributor = new TaskDistributor(mockAgentManager, mockLogger, config);

      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
      mockAgentManager.getAgent.mockReturnValue(mockAgent1);

      const failingTask = await distributor.submitTask({ ...mockTaskData, maxRetries: 1 });
      await distributor.startTask(failingTask.id);

      // First failure - should retry
      await distributor.completeTask(failingTask.id, {
        agentId: mockAgent1.id,
        success: false,
        error: 'First failure',
        executionTime: 500
      });

      expect(distributor.getTask(failingTask.id)?.retryCount).toBe(1);

      // Assign and start retry
      await distributor.processTaskQueue();
      await distributor.startTask(failingTask.id);

      // Second failure - should not retry
      await distributor.completeTask(failingTask.id, {
        agentId: mockAgent1.id,
        success: false,
        error: 'Second failure',
        executionTime: 500
      });

      const finalTask = distributor.getTask(failingTask.id);
      expect(finalTask?.status).toBe(TaskStatus.FAILED);
      expect(finalTask?.retryCount).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Task failed after maximum retries', {
        taskId: failingTask.id,
        retryCount: 1,
        maxRetries: 1,
        error: 'Second failure'
      });
    });

    it('should cancel task successfully', async () => {
      // Clear previous calls from task assignment
      mockAgentManager.updateAgentLoad.mockClear();
      mockAgentManager.getAgent.mockReturnValue(mockAgent1);
      
      await taskDistributor.cancelTask(task.id);

      const updatedTask = taskDistributor.getTask(task.id);
      expect(updatedTask?.status).toBe(TaskStatus.CANCELLED);

      expect(mockAgentManager.updateAgentLoad).toHaveBeenCalledWith(mockAgent1.id, 0);
    });
  });

  describe('queries and statistics', () => {
    beforeEach(async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
    });

    it('should get tasks by status', async () => {
      // Setup: ensure agent manager returns available agents with correct capabilities
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
      
      const task1 = await taskDistributor.submitTask(mockTaskData);
      
      // Make agents unavailable for second task
      mockAgentManager.getAvailableAgents.mockReturnValue([]);
      const task2 = await taskDistributor.submitTask(mockTaskData);

      const assignedTasks = taskDistributor.getTasksByStatus(TaskStatus.ASSIGNED);
      const pendingTasks = taskDistributor.getTasksByStatus(TaskStatus.PENDING);

      expect(assignedTasks).toHaveLength(1);
      expect(assignedTasks[0].id).toBe(task1.id);
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0].id).toBe(task2.id);
    });

    it('should get tasks by workflow', async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
      const workflow1Task = await taskDistributor.submitTask(mockTaskData);
      const workflow2Task = await taskDistributor.submitTask({
        ...mockTaskData,
        workflowId: 'workflow-456' as UUID
      });

      const workflow1Tasks = taskDistributor.getTasksByWorkflow('workflow-123' as UUID);
      const workflow2Tasks = taskDistributor.getTasksByWorkflow('workflow-456' as UUID);

      expect(workflow1Tasks).toHaveLength(1);
      expect(workflow1Tasks[0].id).toBe(workflow1Task.id);
      expect(workflow2Tasks).toHaveLength(1);
      expect(workflow2Tasks[0].id).toBe(workflow2Task.id);
    });

    it('should return distribution statistics', async () => {
      mockAgentManager.getAvailableAgents.mockReturnValue([mockAgent1]);
      mockAgentManager.updateAgentLoad.mockResolvedValue();
      const task1 = await taskDistributor.submitTask(mockTaskData);
      
      mockAgentManager.getAvailableAgents.mockReturnValue([]);
      const task2 = await taskDistributor.submitTask(mockTaskData);

      await taskDistributor.startTask(task1.id);

      const stats = taskDistributor.getDistributionStatistics();

      expect(stats).toMatchObject({
        totalTasks: 2,
        pendingTasks: 1,
        assignedTasks: 0,
        runningTasks: 1,
        completedTasks: 0,
        failedTasks: 0,
        queueLength: 1,
        activeAssignments: 1
      });
    });
  });
});