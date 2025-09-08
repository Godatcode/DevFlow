import {
  WorkflowOrchestrator,
  WorkflowDefinition,
  Workflow,
  WorkflowContext,
  WorkflowResult,
  WorkflowStatus,
  UUID,
  WorkflowStep,
  WorkflowStepResult,
  Status
} from '@devflow/shared-types';
import { WorkflowExecutionContext, StepExecutionResult, OrchestrationState } from './types';
import { WorkflowStateManager } from './workflow-state-manager';
import { WorkflowExecutionEngine } from './workflow-execution-engine';
import { Logger } from '@devflow/shared-utils';
import { RealtimeEventPublisher } from './realtime';

export class WorkflowOrchestratorImpl implements WorkflowOrchestrator {
  private stateManager: WorkflowStateManager;
  private executionEngine: WorkflowExecutionEngine;
  private logger: Logger;
  private realtimePublisher?: RealtimeEventPublisher;

  constructor(
    stateManager: WorkflowStateManager,
    executionEngine: WorkflowExecutionEngine,
    logger: Logger,
    realtimePublisher?: RealtimeEventPublisher
  ) {
    this.stateManager = stateManager;
    this.executionEngine = executionEngine;
    this.logger = logger;
    this.realtimePublisher = realtimePublisher;
  }

  async createWorkflow(definition: WorkflowDefinition): Promise<Workflow> {
    this.logger.info('Creating workflow', { definitionId: definition.id });

    const workflow: Workflow = {
      id: this.generateUUID(),
      definitionId: definition.id,
      status: WorkflowStatus.DRAFT,
      context: {} as WorkflowContext,
      executionId: this.generateUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.stateManager.saveWorkflow(workflow);
    this.logger.info('Workflow created successfully', { workflowId: workflow.id });

    return workflow;
  }

  async executeWorkflow(workflowId: UUID, context: WorkflowContext): Promise<WorkflowResult> {
    this.logger.info('Starting workflow execution', { workflowId, context });

    try {
      // Update workflow status to active
      await this.updateWorkflowStatusWithRealtime(workflowId, WorkflowStatus.ACTIVE);

      // Create execution context
      const executionContext: WorkflowExecutionContext = {
        workflowId,
        executionId: this.generateUUID(),
        currentStep: 0,
        variables: context.variables || {},
        metadata: context.metadata || {},
        startTime: new Date(),
        lastUpdateTime: new Date()
      };

      // Save execution context
      await this.stateManager.saveExecutionContext(executionContext);

      // Execute workflow steps
      const result = await this.executionEngine.execute(workflowId, executionContext);

      // Update final status
      const finalStatus = result.status === WorkflowStatus.COMPLETED 
        ? WorkflowStatus.COMPLETED 
        : WorkflowStatus.FAILED;
      
      await this.updateWorkflowStatusWithRealtime(workflowId, finalStatus, {
        duration: result.duration,
        stepCount: result.steps.length
      });

      this.logger.info('Workflow execution completed', { 
        workflowId, 
        status: finalStatus,
        duration: result.duration 
      });

      return result;
    } catch (error) {
      this.logger.error('Workflow execution failed', { workflowId, error });
      await this.updateWorkflowStatusWithRealtime(workflowId, WorkflowStatus.FAILED);
      
      // Publish error to real-time subscribers
      if (this.realtimePublisher) {
        await this.realtimePublisher.publishError(workflowId, (error as Error).message);
      }
      
      throw error;
    }
  }

  async pauseWorkflow(workflowId: UUID): Promise<void> {
    this.logger.info('Pausing workflow', { workflowId });

    const workflow = await this.stateManager.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status !== WorkflowStatus.ACTIVE) {
      throw new Error(`Cannot pause workflow in status: ${workflow.status}`);
    }

    await this.updateWorkflowStatusWithRealtime(workflowId, WorkflowStatus.PAUSED);
    await this.executionEngine.pauseExecution(workflowId);

    this.logger.info('Workflow paused successfully', { workflowId });
  }

  async resumeWorkflow(workflowId: UUID): Promise<void> {
    this.logger.info('Resuming workflow', { workflowId });

    const workflow = await this.stateManager.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status !== WorkflowStatus.PAUSED) {
      throw new Error(`Cannot resume workflow in status: ${workflow.status}`);
    }

    await this.updateWorkflowStatusWithRealtime(workflowId, WorkflowStatus.ACTIVE);
    await this.executionEngine.resumeExecution(workflowId);

    this.logger.info('Workflow resumed successfully', { workflowId });
  }

  async cancelWorkflow(workflowId: UUID): Promise<void> {
    this.logger.info('Cancelling workflow', { workflowId });

    const workflow = await this.stateManager.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if ([WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED].includes(workflow.status)) {
      throw new Error(`Cannot cancel workflow in status: ${workflow.status}`);
    }

    await this.updateWorkflowStatusWithRealtime(workflowId, WorkflowStatus.CANCELLED);
    await this.executionEngine.cancelExecution(workflowId);

    this.logger.info('Workflow cancelled successfully', { workflowId });
  }

  async getWorkflowStatus(workflowId: UUID): Promise<WorkflowStatus> {
    const workflow = await this.stateManager.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    return workflow.status;
  }

  private async updateWorkflowStatusWithRealtime(
    workflowId: UUID, 
    status: WorkflowStatus, 
    metadata?: Record<string, any>
  ): Promise<void> {
    // Update status in state manager
    await this.stateManager.updateWorkflowStatus(workflowId, status);
    
    // Publish real-time update
    if (this.realtimePublisher) {
      await this.realtimePublisher.publishStatusUpdate(workflowId, status, metadata);
    }
  }

  private generateUUID(): UUID {
    return crypto.randomUUID() as UUID;
  }
}