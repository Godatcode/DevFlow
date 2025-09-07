import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { Agent, AgentCapability, AgentStatus, AgentManager } from './agent-manager';

export enum TaskPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface Task {
  id: UUID;
  workflowId: UUID;
  stepId: UUID;
  type: string;
  requiredCapabilities: AgentCapability[];
  priority: TaskPriority;
  status: TaskStatus;
  assignedAgentId?: UUID;
  payload: Record<string, any>;
  createdAt: Date;
  assignedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  timeout?: number;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, any>;
}

export interface TaskAssignment {
  taskId: UUID;
  agentId: UUID;
  assignedAt: Date;
  estimatedDuration?: number;
}

export interface TaskResult {
  taskId: UUID;
  agentId: UUID;
  success: boolean;
  output?: any;
  error?: string;
  executionTime: number;
  completedAt: Date;
}

export enum DistributionStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_LOADED = 'least_loaded',
  PRIORITY_BASED = 'priority_based',
  CAPABILITY_MATCH = 'capability_match'
}

export interface DistributionConfig {
  strategy: DistributionStrategy;
  enableLoadBalancing: boolean;
  enableFailover: boolean;
  maxRetries: number;
  taskTimeout: number;
}

export class TaskDistributor {
  private agentManager: AgentManager;
  private tasks: Map<UUID, Task>;
  private taskQueue: Task[];
  private assignments: Map<UUID, TaskAssignment>;
  private logger: Logger;
  private config: DistributionConfig;
  private roundRobinIndex: number = 0;

  constructor(
    agentManager: AgentManager,
    logger: Logger,
    config: DistributionConfig
  ) {
    this.agentManager = agentManager;
    this.tasks = new Map();
    this.taskQueue = [];
    this.assignments = new Map();
    this.logger = logger;
    this.config = config;
  }

  async submitTask(task: Omit<Task, 'id' | 'status' | 'createdAt' | 'retryCount'>): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: this.generateTaskId(),
      status: TaskStatus.PENDING,
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: task.maxRetries || this.config.maxRetries,
      timeout: task.timeout || this.config.taskTimeout
    };

    this.tasks.set(newTask.id, newTask);
    this.taskQueue.push(newTask);

    // Sort queue by priority (higher priority first)
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    this.logger.info('Task submitted to queue', {
      taskId: newTask.id,
      workflowId: newTask.workflowId,
      type: newTask.type,
      priority: newTask.priority,
      requiredCapabilities: newTask.requiredCapabilities
    });

    // Try to assign immediately
    await this.processTaskQueue();

    return newTask;
  }

  async processTaskQueue(): Promise<void> {
    const pendingTasks = this.taskQueue.filter(task => task.status === TaskStatus.PENDING);
    
    for (const task of pendingTasks) {
      const assignment = await this.assignTask(task);
      if (assignment) {
        // Remove from queue since it's been assigned
        const index = this.taskQueue.indexOf(task);
        if (index > -1) {
          this.taskQueue.splice(index, 1);
        }
      }
    }
  }

  async assignTask(task: Task): Promise<TaskAssignment | null> {
    const suitableAgents = this.findSuitableAgents(task);
    
    if (suitableAgents.length === 0) {
      this.logger.debug('No suitable agents available for task', {
        taskId: task.id,
        requiredCapabilities: task.requiredCapabilities
      });
      return null;
    }

    const selectedAgent = this.selectAgent(suitableAgents, task);
    if (!selectedAgent) {
      return null;
    }

    // Create assignment
    const assignment: TaskAssignment = {
      taskId: task.id,
      agentId: selectedAgent.id,
      assignedAt: new Date()
    };

    // Update task status
    task.status = TaskStatus.ASSIGNED;
    task.assignedAgentId = selectedAgent.id;
    task.assignedAt = assignment.assignedAt;

    // Update agent load
    await this.agentManager.updateAgentLoad(
      selectedAgent.id, 
      selectedAgent.currentLoad + 1
    );

    // Store assignment
    this.assignments.set(task.id, assignment);

    this.logger.info('Task assigned to agent', {
      taskId: task.id,
      agentId: selectedAgent.id,
      agentName: selectedAgent.name,
      agentLoad: selectedAgent.currentLoad + 1
    });

    return assignment;
  }

  async startTask(taskId: UUID): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== TaskStatus.ASSIGNED) {
      throw new Error(`Task is not in assigned status: ${task.status}`);
    }

    task.status = TaskStatus.RUNNING;
    task.startedAt = new Date();

    this.logger.info('Task started', {
      taskId,
      agentId: task.assignedAgentId,
      startedAt: task.startedAt
    });
  }

  async completeTask(taskId: UUID, result: Omit<TaskResult, 'taskId' | 'completedAt'>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const assignment = this.assignments.get(taskId);
    if (!assignment) {
      throw new Error(`Assignment not found for task: ${taskId}`);
    }

    // Update task status
    task.status = result.success ? TaskStatus.COMPLETED : TaskStatus.FAILED;
    task.completedAt = new Date();

    // Update agent load
    const agent = this.agentManager.getAgent(assignment.agentId);
    if (agent) {
      await this.agentManager.updateAgentLoad(
        assignment.agentId,
        Math.max(0, agent.currentLoad - 1)
      );

      // Update agent metrics
      this.agentManager.updateAgentMetrics(
        assignment.agentId,
        result.success,
        result.executionTime
      );
    }

    // Clean up assignment
    this.assignments.delete(taskId);

    this.logger.info('Task completed', {
      taskId,
      agentId: assignment.agentId,
      success: result.success,
      executionTime: result.executionTime,
      error: result.error
    });

    // Handle failure and retry logic
    if (!result.success && this.config.enableFailover) {
      await this.handleTaskFailure(task, result.error);
    }
  }

  async cancelTask(taskId: UUID): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const assignment = this.assignments.get(taskId);
    
    // Update task status
    task.status = TaskStatus.CANCELLED;

    // If task was assigned, update agent load
    if (assignment) {
      const agent = this.agentManager.getAgent(assignment.agentId);
      if (agent) {
        await this.agentManager.updateAgentLoad(
          assignment.agentId,
          Math.max(0, agent.currentLoad - 1)
        );
      }
      this.assignments.delete(taskId);
    }

    // Remove from queue if still pending
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex > -1) {
      this.taskQueue.splice(queueIndex, 1);
    }

    this.logger.info('Task cancelled', { taskId });
  }

  private findSuitableAgents(task: Task): Agent[] {
    const availableAgents = this.agentManager.getAvailableAgents();
    
    return availableAgents.filter(agent => {
      // Check if agent has all required capabilities
      const hasCapabilities = task.requiredCapabilities.every(capability =>
        agent.capabilities.includes(capability)
      );
      
      // Check if agent has capacity
      const hasCapacity = agent.currentLoad < agent.maxConcurrentTasks;
      
      return hasCapabilities && hasCapacity;
    });
  }

  private selectAgent(suitableAgents: Agent[], task: Task): Agent | null {
    if (suitableAgents.length === 0) {
      return null;
    }

    switch (this.config.strategy) {
      case DistributionStrategy.ROUND_ROBIN:
        return this.selectAgentRoundRobin(suitableAgents);
      
      case DistributionStrategy.LEAST_LOADED:
        return this.selectAgentLeastLoaded(suitableAgents);
      
      case DistributionStrategy.PRIORITY_BASED:
        return this.selectAgentPriorityBased(suitableAgents, task);
      
      case DistributionStrategy.CAPABILITY_MATCH:
        return this.selectAgentCapabilityMatch(suitableAgents, task);
      
      default:
        return suitableAgents[0];
    }
  }

  private selectAgentRoundRobin(agents: Agent[]): Agent {
    const agent = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex++;
    return agent;
  }

  private selectAgentLeastLoaded(agents: Agent[]): Agent {
    return agents.reduce((leastLoaded, current) => {
      const leastLoadedRatio = leastLoaded.currentLoad / leastLoaded.maxConcurrentTasks;
      const currentRatio = current.currentLoad / current.maxConcurrentTasks;
      return currentRatio < leastLoadedRatio ? current : leastLoaded;
    });
  }

  private selectAgentPriorityBased(agents: Agent[], task: Task): Agent {
    // Sort by agent priority (higher priority first), then by load
    return agents.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.currentLoad - b.currentLoad;
    })[0];
  }

  private selectAgentCapabilityMatch(agents: Agent[], task: Task): Agent {
    // Prefer agents that have exactly the required capabilities (no extra)
    const exactMatches = agents.filter(agent => 
      agent.capabilities.length === task.requiredCapabilities.length &&
      task.requiredCapabilities.every(cap => agent.capabilities.includes(cap))
    );

    if (exactMatches.length > 0) {
      return this.selectAgentLeastLoaded(exactMatches);
    }

    return this.selectAgentLeastLoaded(agents);
  }

  private async handleTaskFailure(task: Task, error?: string): Promise<void> {
    if (task.retryCount < task.maxRetries) {
      // Retry the task
      task.retryCount++;
      task.status = TaskStatus.PENDING;
      task.assignedAgentId = undefined;
      task.assignedAt = undefined;
      task.startedAt = undefined;

      // Add back to queue
      this.taskQueue.push(task);
      this.taskQueue.sort((a, b) => b.priority - a.priority);

      this.logger.info('Task queued for retry', {
        taskId: task.id,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries,
        error
      });

      // Try to reassign
      await this.processTaskQueue();
    } else {
      this.logger.error('Task failed after maximum retries', {
        taskId: task.id,
        retryCount: task.retryCount,
        maxRetries: task.maxRetries,
        error
      });
    }
  }

  // Getters
  getTask(taskId: UUID): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  getTasksByWorkflow(workflowId: UUID): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.workflowId === workflowId);
  }

  getQueueLength(): number {
    return this.taskQueue.length;
  }

  getAssignment(taskId: UUID): TaskAssignment | undefined {
    return this.assignments.get(taskId);
  }

  getAllAssignments(): TaskAssignment[] {
    return Array.from(this.assignments.values());
  }

  // Statistics
  getDistributionStatistics(): {
    totalTasks: number;
    pendingTasks: number;
    assignedTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    queueLength: number;
    activeAssignments: number;
  } {
    const tasks = this.getAllTasks();
    
    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      assignedTasks: tasks.filter(t => t.status === TaskStatus.ASSIGNED).length,
      runningTasks: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      completedTasks: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      failedTasks: tasks.filter(t => t.status === TaskStatus.FAILED).length,
      queueLength: this.taskQueue.length,
      activeAssignments: this.assignments.size
    };
  }

  private generateTaskId(): UUID {
    return crypto.randomUUID() as UUID;
  }
}