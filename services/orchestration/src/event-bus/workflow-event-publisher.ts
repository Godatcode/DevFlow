import { EventBus, WorkflowEvent } from '../interfaces';
import { 
  Workflow, 
  WorkflowContext, 
  WorkflowStep, 
  WorkflowStepResult, 
  UUID,
  WorkflowStatus 
} from '@devflow/shared-types';
import { EventRouter, EventRoutingResult } from './event-router';
import { Logger } from '@devflow/shared-utils';

export interface WorkflowEventPublisher {
  publishWorkflowStarted(workflow: Workflow, context: WorkflowContext): Promise<void>;
  publishWorkflowCompleted(workflow: Workflow, context: WorkflowContext): Promise<void>;
  publishWorkflowFailed(workflow: Workflow, context: WorkflowContext, error: string): Promise<void>;
  publishWorkflowPaused(workflow: Workflow, context: WorkflowContext): Promise<void>;
  publishWorkflowResumed(workflow: Workflow, context: WorkflowContext): Promise<void>;
  publishStepStarted(workflowId: UUID, step: WorkflowStep, context: WorkflowContext): Promise<void>;
  publishStepCompleted(workflowId: UUID, step: WorkflowStep, result: WorkflowStepResult, context: WorkflowContext): Promise<void>;
  publishStepFailed(workflowId: UUID, step: WorkflowStep, error: string, context: WorkflowContext): Promise<void>;
  publishAgentAssigned(workflowId: UUID, agentId: string, taskId: string, context: WorkflowContext): Promise<void>;
}

export class WorkflowEventPublisherImpl implements WorkflowEventPublisher {
  private eventBus: EventBus;
  private eventRouter: EventRouter;
  private logger: Logger;

  constructor(eventBus: EventBus, eventRouter: EventRouter, logger: Logger) {
    this.eventBus = eventBus;
    this.eventRouter = eventRouter;
    this.logger = logger;
  }

  async publishWorkflowStarted(workflow: Workflow, context: WorkflowContext): Promise<void> {
    const event = this.createWorkflowEvent(
      'workflow.started',
      workflow.id,
      {
        workflowId: workflow.id,
        definitionId: workflow.definitionId,
        executionId: workflow.executionId,
        status: workflow.status,
        startedAt: workflow.startedAt
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishWorkflowCompleted(workflow: Workflow, context: WorkflowContext): Promise<void> {
    const event = this.createWorkflowEvent(
      'workflow.completed',
      workflow.id,
      {
        workflowId: workflow.id,
        definitionId: workflow.definitionId,
        executionId: workflow.executionId,
        status: workflow.status,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishWorkflowFailed(workflow: Workflow, context: WorkflowContext, error: string): Promise<void> {
    const event = this.createWorkflowEvent(
      'workflow.failed',
      workflow.id,
      {
        workflowId: workflow.id,
        definitionId: workflow.definitionId,
        executionId: workflow.executionId,
        status: workflow.status,
        error,
        startedAt: workflow.startedAt,
        failedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishWorkflowPaused(workflow: Workflow, context: WorkflowContext): Promise<void> {
    const event = this.createWorkflowEvent(
      'workflow.paused',
      workflow.id,
      {
        workflowId: workflow.id,
        definitionId: workflow.definitionId,
        executionId: workflow.executionId,
        status: workflow.status,
        pausedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishWorkflowResumed(workflow: Workflow, context: WorkflowContext): Promise<void> {
    const event = this.createWorkflowEvent(
      'workflow.resumed',
      workflow.id,
      {
        workflowId: workflow.id,
        definitionId: workflow.definitionId,
        executionId: workflow.executionId,
        status: workflow.status,
        resumedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishStepStarted(workflowId: UUID, step: WorkflowStep, context: WorkflowContext): Promise<void> {
    const event = this.createWorkflowEvent(
      'step.started',
      workflowId,
      {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        stepConfig: step.config,
        startedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishStepCompleted(
    workflowId: UUID, 
    step: WorkflowStep, 
    result: WorkflowStepResult, 
    context: WorkflowContext
  ): Promise<void> {
    const event = this.createWorkflowEvent(
      'step.completed',
      workflowId,
      {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        result: {
          status: result.status,
          output: result.output,
          duration: result.duration
        },
        completedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishStepFailed(
    workflowId: UUID, 
    step: WorkflowStep, 
    error: string, 
    context: WorkflowContext
  ): Promise<void> {
    const event = this.createWorkflowEvent(
      'step.failed',
      workflowId,
      {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        error,
        failedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  async publishAgentAssigned(
    workflowId: UUID, 
    agentId: string, 
    taskId: string, 
    context: WorkflowContext
  ): Promise<void> {
    const event = this.createWorkflowEvent(
      'agent.assigned',
      workflowId,
      {
        agentId,
        taskId,
        assignedAt: new Date()
      },
      'orchestration-service'
    );

    await this.publishEvent(event, context);
  }

  private createWorkflowEvent(
    type: string,
    workflowId: UUID,
    data: Record<string, any>,
    source: string
  ): WorkflowEvent {
    return {
      id: this.generateEventId(),
      type,
      workflowId,
      data,
      timestamp: new Date(),
      source
    };
  }

  private async publishEvent(event: WorkflowEvent, context: WorkflowContext): Promise<void> {
    try {
      // Route the event to determine target topics
      const routingResult = this.eventRouter.routeEvent(event, context);

      if (!routingResult.matched || routingResult.topics.length === 0) {
        this.logger.warn('No routing rules matched for event', {
          eventId: event.id,
          eventType: event.type,
          workflowId: event.workflowId
        });
        return;
      }

      // Publish to all target topics
      const publishPromises = routingResult.topics.map(topic =>
        this.eventBus.publish(topic, event)
      );

      await Promise.all(publishPromises);

      this.logger.debug('Event published successfully', {
        eventId: event.id,
        eventType: event.type,
        workflowId: event.workflowId,
        topics: routingResult.topics,
        appliedRules: routingResult.appliedRules
      });
    } catch (error) {
      this.logger.error('Failed to publish event', {
        eventId: event.id,
        eventType: event.type,
        workflowId: event.workflowId,
        error
      });
      throw error;
    }
  }

  private generateEventId(): UUID {
    return crypto.randomUUID() as UUID;
  }
}