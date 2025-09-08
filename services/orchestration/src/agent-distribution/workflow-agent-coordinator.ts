import { UUID, WorkflowStep, WorkflowStepType, AgentAssignment, AgentCapability } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { AgentManager } from './agent-manager';
import { TaskDistributor, Task, TaskPriority, TaskStatus } from './task-distributor';
import { WorkflowExecutionContext } from '../types';

export interface WorkflowAgentCoordinator {
  coordinateWorkflowExecution(
    workflowId: UUID,
    context: WorkflowExecutionContext,
    steps: WorkflowStep[]
  ): Promise<WorkflowCoordinationResult>;
  
  executeAgentStep(
    workflowId: UUID,
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<AgentStepResult>;
  
  cancelWorkflowTasks(workflowId: UUID): Promise<void>;
  getWorkflowTaskStatus(workflowId: UUID): Promise<WorkflowTaskStatus>;
}

export interface WorkflowCoordinationResult {
  workflowId: UUID;
  totalSteps: number;
  agentSteps: number;
  tasksCreated: number;
  coordinationTime: number;
}

export interface AgentStepResult {
  stepId: UUID;
  taskId: UUID;
  success: boolean;
  output: any;
  executionTime: number;
  agentId?: UUID;
  error?: string;
}

export interface WorkflowTaskStatus {
  workflowId: UUID;
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
}

export class WorkflowAgentCoordinatorImpl implements WorkflowAgentCoordinator {
  private agentManager: AgentManager;
  private taskDistributor: TaskDistributor;
  private logger: Logger;
  private activeWorkflowTasks: Map<UUID, Set<UUID>>; // workflowId -> taskIds

  constructor(
    agentManager: AgentManager,
    taskDistributor: TaskDistributor,
    logger: Logger
  ) {
    this.agentManager = agentManager;
    this.taskDistributor = taskDistributor;
    this.logger = logger;
    this.activeWorkflowTasks = new Map();
  }

  async coordinateWorkflowExecution(
    workflowId: UUID,
    context: WorkflowExecutionContext,
    steps: WorkflowStep[]
  ): Promise<WorkflowCoordinationResult> {
    const startTime = Date.now();
    
    this.logger.info('Starting workflow agent coordination', {
      workflowId,
      totalSteps: steps.length,
      executionId: context.executionId
    });

    // Initialize workflow task tracking
    this.activeWorkflowTasks.set(workflowId, new Set());

    let agentSteps = 0;
    let tasksCreated = 0;

    // Process each step and create tasks for agent execution steps
    for (const step of steps) {
      if (step.type === WorkflowStepType.AGENT_EXECUTION) {
        agentSteps++;
        
        try {
          const task = await this.createAgentTask(workflowId, step, context);
          tasksCreated++;
          
          // Track task for this workflow
          this.activeWorkflowTasks.get(workflowId)?.add(task.id);
          
          this.logger.debug('Agent task created for workflow step', {
            workflowId,
            stepId: step.id,
            taskId: task.id,
            requiredCapabilities: this.extractRequiredCapabilities(step)
          });
        } catch (error) {
          this.logger.error('Failed to create agent task for workflow step', {
            workflowId,
            stepId: step.id,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }
    }

    const coordinationTime = Date.now() - startTime;

    this.logger.info('Workflow agent coordination completed', {
      workflowId,
      totalSteps: steps.length,
      agentSteps,
      tasksCreated,
      coordinationTime
    });

    return {
      workflowId,
      totalSteps: steps.length,
      agentSteps,
      tasksCreated,
      coordinationTime
    };
  }

  async executeAgentStep(
    workflowId: UUID,
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<AgentStepResult> {
    this.logger.info('Executing agent step', {
      workflowId,
      stepId: step.id,
      stepType: step.type
    });

    if (step.type !== WorkflowStepType.AGENT_EXECUTION) {
      throw new Error(`Step ${step.id} is not an agent execution step`);
    }

    const startTime = Date.now();

    try {
      // Create and submit task
      const task = await this.createAgentTask(workflowId, step, context);
      
      // Track task for this workflow
      if (!this.activeWorkflowTasks.has(workflowId)) {
        this.activeWorkflowTasks.set(workflowId, new Set());
      }
      this.activeWorkflowTasks.get(workflowId)?.add(task.id);

      // Wait for task completion
      const result = await this.waitForTaskCompletion(task.id, step.timeout);

      const executionTime = Date.now() - startTime;

      this.logger.info('Agent step execution completed', {
        workflowId,
        stepId: step.id,
        taskId: task.id,
        success: result.success,
        executionTime,
        agentId: result.agentId
      });

      return {
        stepId: step.id,
        taskId: task.id,
        success: result.success,
        output: result.output,
        executionTime,
        agentId: result.agentId,
        error: result.error
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Agent step execution failed', {
        workflowId,
        stepId: step.id,
        error: errorMessage,
        executionTime
      });

      return {
        stepId: step.id,
        taskId: '' as UUID, // No task created
        success: false,
        output: null,
        executionTime,
        error: errorMessage
      };
    }
  }

  async cancelWorkflowTasks(workflowId: UUID): Promise<void> {
    this.logger.info('Cancelling all tasks for workflow', { workflowId });

    const taskIds = this.activeWorkflowTasks.get(workflowId);
    if (!taskIds || taskIds.size === 0) {
      this.logger.debug('No active tasks found for workflow', { workflowId });
      return;
    }

    const cancellationPromises = Array.from(taskIds).map(async (taskId) => {
      try {
        await this.taskDistributor.cancelTask(taskId);
        this.logger.debug('Task cancelled', { workflowId, taskId });
      } catch (error) {
        this.logger.warn('Failed to cancel task', {
          workflowId,
          taskId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    await Promise.allSettled(cancellationPromises);

    // Clear tracking
    this.activeWorkflowTasks.delete(workflowId);

    this.logger.info('Workflow task cancellation completed', {
      workflowId,
      tasksProcessed: taskIds.size
    });
  }

  async getWorkflowTaskStatus(workflowId: UUID): Promise<WorkflowTaskStatus> {
    const taskIds = this.activeWorkflowTasks.get(workflowId);
    
    if (!taskIds || taskIds.size === 0) {
      return {
        workflowId,
        totalTasks: 0,
        pendingTasks: 0,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0
      };
    }

    const tasks = Array.from(taskIds)
      .map(taskId => this.taskDistributor.getTask(taskId))
      .filter((task): task is Task => task !== undefined);

    const statusCounts = tasks.reduce((counts, task) => {
      switch (task.status) {
        case TaskStatus.PENDING:
          counts.pendingTasks++;
          break;
        case TaskStatus.ASSIGNED:
        case TaskStatus.RUNNING:
          counts.runningTasks++;
          break;
        case TaskStatus.COMPLETED:
          counts.completedTasks++;
          break;
        case TaskStatus.FAILED:
          counts.failedTasks++;
          break;
        case TaskStatus.CANCELLED:
          counts.cancelledTasks++;
          break;
      }
      return counts;
    }, {
      pendingTasks: 0,
      runningTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      cancelledTasks: 0
    });

    return {
      workflowId,
      totalTasks: tasks.length,
      ...statusCounts
    };
  }

  private async createAgentTask(
    workflowId: UUID,
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<Task> {
    const requiredCapabilities = this.extractRequiredCapabilities(step);
    const priority = this.determinePriority(step);

    const taskData = {
      workflowId,
      stepId: step.id,
      type: step.config.agentType || 'generic-agent-task',
      requiredCapabilities,
      priority,
      payload: {
        stepConfig: step.config,
        workflowContext: context,
        stepName: step.name
      },
      timeout: step.timeout,
      maxRetries: step.retryConfig?.maxAttempts || 3,
      metadata: {
        workflowExecutionId: context.executionId,
        stepName: step.name,
        stepType: step.type
      }
    };

    return await this.taskDistributor.submitTask(taskData);
  }

  private extractRequiredCapabilities(step: WorkflowStep): AgentCapability[] {
    // Extract capabilities from step configuration
    const stepConfig = step.config;
    const capabilities: AgentCapability[] = [];

    // Map step configuration to agent capabilities
    if (stepConfig.agentType) {
      switch (stepConfig.agentType) {
        case 'security-guardian':
          capabilities.push(AgentCapability.SECURITY_SCANNING);
          if (stepConfig.includeCodeReview) {
            capabilities.push(AgentCapability.CODE_REVIEW);
          }
          break;
        case 'performance-optimizer':
          capabilities.push(AgentCapability.PERFORMANCE_OPTIMIZATION);
          if (stepConfig.includeMonitoring) {
            capabilities.push(AgentCapability.MONITORING);
          }
          break;
        case 'style-enforcer':
          capabilities.push(AgentCapability.CODE_FORMATTING);
          break;
        case 'test-generator':
          capabilities.push(AgentCapability.TEST_GENERATION);
          break;
        case 'documentation-updater':
          capabilities.push(AgentCapability.DOCUMENTATION);
          break;
        default:
          // Generic agent - try to infer from step config
          if (stepConfig.capabilities) {
            capabilities.push(...stepConfig.capabilities);
          }
      }
    }

    // Fallback to generic capabilities if none specified
    if (capabilities.length === 0) {
      capabilities.push(AgentCapability.CODE_ANALYSIS);
    }

    return capabilities;
  }

  private determinePriority(step: WorkflowStep): TaskPriority {
    // Determine task priority based on step configuration
    if (step.config.priority) {
      switch (step.config.priority.toLowerCase()) {
        case 'critical':
          return TaskPriority.CRITICAL;
        case 'high':
          return TaskPriority.HIGH;
        case 'low':
          return TaskPriority.LOW;
        default:
          return TaskPriority.NORMAL;
      }
    }

    // Default priority based on agent type
    switch (step.config.agentType) {
      case 'security-guardian':
        return TaskPriority.HIGH; // Security is high priority
      case 'test-generator':
        return TaskPriority.HIGH; // Testing is important
      case 'performance-optimizer':
        return TaskPriority.NORMAL;
      case 'style-enforcer':
        return TaskPriority.LOW; // Style can wait
      case 'documentation-updater':
        return TaskPriority.LOW; // Documentation can wait
      default:
        return TaskPriority.NORMAL;
    }
  }

  private async waitForTaskCompletion(
    taskId: UUID,
    timeout?: number
  ): Promise<{ success: boolean; output: any; agentId?: UUID; error?: string }> {
    const maxWaitTime = timeout || 300000; // 5 minutes default
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const task = this.taskDistributor.getTask(taskId);
      
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      switch (task.status) {
        case TaskStatus.COMPLETED:
          return {
            success: true,
            output: task.metadata.output,
            agentId: task.assignedAgentId
          };
        
        case TaskStatus.FAILED:
          return {
            success: false,
            output: null,
            agentId: task.assignedAgentId,
            error: task.metadata.error || 'Task failed without specific error'
          };
        
        case TaskStatus.CANCELLED:
          return {
            success: false,
            output: null,
            agentId: task.assignedAgentId,
            error: 'Task was cancelled'
          };
        
        default:
          // Task is still pending, assigned, or running - continue waiting
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          break;
      }
    }

    // Timeout reached
    throw new Error(`Task execution timeout after ${maxWaitTime}ms`);
  }

  // Cleanup method to remove completed workflow tasks from tracking
  cleanupCompletedWorkflows(): void {
    const workflowsToCleanup: UUID[] = [];

    for (const [workflowId, taskIds] of this.activeWorkflowTasks.entries()) {
      const activeTasks = Array.from(taskIds)
        .map(taskId => this.taskDistributor.getTask(taskId))
        .filter((task): task is Task => task !== undefined)
        .filter(task => ![TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status));

      if (activeTasks.length === 0) {
        workflowsToCleanup.push(workflowId);
      }
    }

    workflowsToCleanup.forEach(workflowId => {
      this.activeWorkflowTasks.delete(workflowId);
      this.logger.debug('Cleaned up completed workflow tasks', { workflowId });
    });

    if (workflowsToCleanup.length > 0) {
      this.logger.info('Workflow cleanup completed', {
        cleanedWorkflows: workflowsToCleanup.length
      });
    }
  }
}