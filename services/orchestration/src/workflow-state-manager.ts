import {
  Workflow,
  WorkflowStatus,
  WorkflowDefinition,
  UUID
} from '@devflow/shared-types';
import { WorkflowExecutionContext, OrchestrationState } from './types';
import { Logger } from '@devflow/shared-utils';

export interface WorkflowStateRepository {
  saveWorkflow(workflow: Workflow): Promise<void>;
  getWorkflow(workflowId: UUID): Promise<Workflow | null>;
  updateWorkflowStatus(workflowId: UUID, status: WorkflowStatus): Promise<void>;
  getWorkflowsByStatus(status: WorkflowStatus): Promise<Workflow[]>;
  saveExecutionContext(context: WorkflowExecutionContext): Promise<void>;
  getExecutionContext(workflowId: UUID): Promise<WorkflowExecutionContext | null>;
  updateExecutionContext(context: WorkflowExecutionContext): Promise<void>;
  deleteExecutionContext(workflowId: UUID): Promise<void>;
}

export class WorkflowStateManager {
  private repository: WorkflowStateRepository;
  private inMemoryState: OrchestrationState;
  private logger: Logger;

  constructor(repository: WorkflowStateRepository, logger: Logger) {
    this.repository = repository;
    this.logger = logger;
    this.inMemoryState = {
      activeWorkflows: new Map(),
      queuedWorkflows: [],
      completedWorkflows: new Map(),
      metrics: new Map()
    };
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    try {
      await this.repository.saveWorkflow(workflow);
      this.logger.debug('Workflow saved to repository', { workflowId: workflow.id });
    } catch (error) {
      this.logger.error('Failed to save workflow', { workflowId: workflow.id, error });
      throw error;
    }
  }

  async getWorkflow(workflowId: UUID): Promise<Workflow | null> {
    try {
      const workflow = await this.repository.getWorkflow(workflowId);
      this.logger.debug('Retrieved workflow from repository', { workflowId, found: !!workflow });
      return workflow;
    } catch (error) {
      this.logger.error('Failed to get workflow', { workflowId, error });
      throw error;
    }
  }

  async updateWorkflowStatus(workflowId: UUID, status: WorkflowStatus): Promise<void> {
    try {
      await this.repository.updateWorkflowStatus(workflowId, status);
      
      // Update in-memory state
      this.updateInMemoryWorkflowStatus(workflowId, status);
      
      this.logger.info('Workflow status updated', { workflowId, status });
    } catch (error) {
      this.logger.error('Failed to update workflow status', { workflowId, status, error });
      throw error;
    }
  }

  async getWorkflowsByStatus(status: WorkflowStatus): Promise<Workflow[]> {
    try {
      const workflows = await this.repository.getWorkflowsByStatus(status);
      this.logger.debug('Retrieved workflows by status', { status, count: workflows.length });
      return workflows;
    } catch (error) {
      this.logger.error('Failed to get workflows by status', { status, error });
      throw error;
    }
  }

  async saveExecutionContext(context: WorkflowExecutionContext): Promise<void> {
    try {
      await this.repository.saveExecutionContext(context);
      
      // Update in-memory state
      this.inMemoryState.activeWorkflows.set(context.workflowId, context);
      
      this.logger.debug('Execution context saved', { workflowId: context.workflowId });
    } catch (error) {
      this.logger.error('Failed to save execution context', { workflowId: context.workflowId, error });
      throw error;
    }
  }

  async getExecutionContext(workflowId: UUID): Promise<WorkflowExecutionContext | null> {
    try {
      // Check in-memory first
      const inMemoryContext = this.inMemoryState.activeWorkflows.get(workflowId);
      if (inMemoryContext) {
        return inMemoryContext;
      }

      // Fallback to repository
      const context = await this.repository.getExecutionContext(workflowId);
      if (context) {
        this.inMemoryState.activeWorkflows.set(workflowId, context);
      }
      
      this.logger.debug('Retrieved execution context', { workflowId, found: !!context });
      return context;
    } catch (error) {
      this.logger.error('Failed to get execution context', { workflowId, error });
      throw error;
    }
  }

  async updateExecutionContext(context: WorkflowExecutionContext): Promise<void> {
    try {
      context.lastUpdateTime = new Date();
      
      await this.repository.updateExecutionContext(context);
      
      // Update in-memory state
      this.inMemoryState.activeWorkflows.set(context.workflowId, context);
      
      this.logger.debug('Execution context updated', { workflowId: context.workflowId });
    } catch (error) {
      this.logger.error('Failed to update execution context', { workflowId: context.workflowId, error });
      throw error;
    }
  }

  async deleteExecutionContext(workflowId: UUID): Promise<void> {
    try {
      await this.repository.deleteExecutionContext(workflowId);
      
      // Remove from in-memory state
      this.inMemoryState.activeWorkflows.delete(workflowId);
      
      this.logger.debug('Execution context deleted', { workflowId });
    } catch (error) {
      this.logger.error('Failed to delete execution context', { workflowId, error });
      throw error;
    }
  }

  getActiveWorkflowsCount(): number {
    return this.inMemoryState.activeWorkflows.size;
  }

  getQueuedWorkflowsCount(): number {
    return this.inMemoryState.queuedWorkflows.length;
  }

  getInMemoryState(): OrchestrationState {
    return { ...this.inMemoryState };
  }

  private updateInMemoryWorkflowStatus(workflowId: UUID, status: WorkflowStatus): void {
    const context = this.inMemoryState.activeWorkflows.get(workflowId);
    
    if (status === WorkflowStatus.COMPLETED || status === WorkflowStatus.FAILED || status === WorkflowStatus.CANCELLED) {
      // Move to completed workflows
      if (context) {
        this.inMemoryState.activeWorkflows.delete(workflowId);
      }
      
      // Remove from queued workflows if present
      const queueIndex = this.inMemoryState.queuedWorkflows.indexOf(workflowId);
      if (queueIndex > -1) {
        this.inMemoryState.queuedWorkflows.splice(queueIndex, 1);
      }
    }
  }

  async initializeFromRepository(): Promise<void> {
    try {
      // Load active workflows
      const activeWorkflows = await this.repository.getWorkflowsByStatus(WorkflowStatus.ACTIVE);
      for (const workflow of activeWorkflows) {
        const context = await this.repository.getExecutionContext(workflow.id);
        if (context) {
          this.inMemoryState.activeWorkflows.set(workflow.id, context);
        }
      }

      // Load paused workflows
      const pausedWorkflows = await this.repository.getWorkflowsByStatus(WorkflowStatus.PAUSED);
      for (const workflow of pausedWorkflows) {
        const context = await this.repository.getExecutionContext(workflow.id);
        if (context) {
          this.inMemoryState.activeWorkflows.set(workflow.id, context);
        }
      }

      this.logger.info('State manager initialized from repository', {
        activeWorkflows: this.inMemoryState.activeWorkflows.size
      });
    } catch (error) {
      this.logger.error('Failed to initialize state manager from repository', { error });
      throw error;
    }
  }
}