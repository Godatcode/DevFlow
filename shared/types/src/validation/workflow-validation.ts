import {
  Workflow,
  WorkflowDefinition,
  WorkflowContext,
  WorkflowStatus,
  EventTrigger,
  EventTriggerType,
  WorkflowStep,
  WorkflowStepType,
  RetryConfig,
  WorkflowSettings,
  NotificationConfig,
  WorkflowResult,
  WorkflowStepResult
} from '../workflow';
import { BaseValidator, ValidationError } from './base-validation';
import { Status } from '../common';

export class WorkflowValidator extends BaseValidator {
  static validateWorkflow(workflow: Workflow): void {
    this.validateBaseEntity(workflow);
    this.validateUUID(workflow.definitionId, 'definitionId');
    this.validateEnum(workflow.status, WorkflowStatus, 'status');
    this.validateWorkflowContext(workflow.context);
    this.validateUUID(workflow.executionId, 'executionId');

    if (workflow.startedAt) {
      this.validateDate(workflow.startedAt, 'startedAt');
    }

    if (workflow.completedAt) {
      this.validateDate(workflow.completedAt, 'completedAt');
      if (workflow.startedAt && workflow.completedAt < workflow.startedAt) {
        throw new ValidationError(
          'completedAt cannot be before startedAt',
          'INVALID_DATE_RANGE'
        );
      }
    }

    if (workflow.error) {
      this.validateString(workflow.error, 'error', 1, 1000);
    }
  }

  static validateWorkflowDefinition(definition: WorkflowDefinition): void {
    this.validateBaseEntity(definition);
    this.validateString(definition.name, 'name', 1, 100);
    this.validateString(definition.description, 'description', 0, 500);
    this.validateString(definition.version, 'version', 1, 20);
    
    this.validateArray(definition.triggers, 'triggers', 1, 10);
    definition.triggers.forEach((trigger, index) => {
      this.validateEventTrigger(trigger, `triggers[${index}]`);
    });

    this.validateArray(definition.steps, 'steps', 1, 50);
    definition.steps.forEach((step, index) => {
      this.validateWorkflowStep(step, `steps[${index}]`);
    });

    this.validateObject(definition.variables, 'variables');
    this.validateWorkflowSettings(definition.settings);

    // Validate step dependencies
    this.validateStepDependencies(definition.steps);
  }

  static validateWorkflowContext(context: WorkflowContext): void {
    this.validateUUID(context.projectId, 'context.projectId');
    this.validateUUID(context.userId, 'context.userId');
    this.validateUUID(context.teamId, 'context.teamId');
    this.validateObject(context.variables, 'context.variables');
    this.validateObject(context.metadata, 'context.metadata');
  }

  static validateEventTrigger(trigger: EventTrigger, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateUUID(trigger.id, `${prefix}id`);
    this.validateEnum(trigger.type, EventTriggerType, `${prefix}type`);
    this.validateObject(trigger.conditions, `${prefix}conditions`);
    
    if (typeof trigger.enabled !== 'boolean') {
      throw new ValidationError(`${prefix}enabled must be a boolean`, 'INVALID_TYPE');
    }
  }

  static validateWorkflowStep(step: WorkflowStep, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateUUID(step.id, `${prefix}id`);
    this.validateString(step.name, `${prefix}name`, 1, 100);
    this.validateEnum(step.type, WorkflowStepType, `${prefix}type`);
    this.validateObject(step.config, `${prefix}config`);
    this.validateArray(step.dependencies, `${prefix}dependencies`, 0, 10);
    
    step.dependencies.forEach((depId, index) => {
      this.validateUUID(depId, `${prefix}dependencies[${index}]`);
    });

    if (step.timeout !== undefined) {
      this.validateNumber(step.timeout, `${prefix}timeout`, 1, 86400); // Max 24 hours
    }

    if (step.retryConfig) {
      this.validateRetryConfig(step.retryConfig, `${prefix}retryConfig`);
    }
  }

  static validateRetryConfig(config: RetryConfig, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateNumber(config.maxAttempts, `${prefix}maxAttempts`, 1, 10);
    this.validateEnum(config.backoffStrategy, { linear: 'linear', exponential: 'exponential' }, `${prefix}backoffStrategy`);
    this.validateNumber(config.initialDelay, `${prefix}initialDelay`, 100, 60000); // 100ms to 1 minute
    this.validateNumber(config.maxDelay, `${prefix}maxDelay`, config.initialDelay, 300000); // Up to 5 minutes
  }

  static validateWorkflowSettings(settings: WorkflowSettings): void {
    this.validateNumber(settings.timeout, 'settings.timeout', 60, 86400); // 1 minute to 24 hours
    this.validateNumber(settings.maxConcurrentExecutions, 'settings.maxConcurrentExecutions', 1, 100);
    this.validateRetryConfig(settings.retryPolicy, 'settings.retryPolicy');
    
    this.validateArray(settings.notifications, 'settings.notifications', 0, 10);
    settings.notifications.forEach((notification, index) => {
      this.validateNotificationConfig(notification, `settings.notifications[${index}]`);
    });
  }

  static validateNotificationConfig(config: NotificationConfig, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateString(config.channel, `${prefix}channel`, 1, 50);
    this.validateArray(config.events, `${prefix}events`, 1, 20);
    this.validateArray(config.recipients, `${prefix}recipients`, 1, 50);
    
    config.events.forEach((event, index) => {
      this.validateString(event, `${prefix}events[${index}]`, 1, 50);
    });
    
    config.recipients.forEach((recipient, index) => {
      this.validateString(recipient, `${prefix}recipients[${index}]`, 1, 100);
    });
  }

  static validateWorkflowResult(result: WorkflowResult): void {
    this.validateUUID(result.workflowId, 'workflowId');
    this.validateEnum(result.status, WorkflowStatus, 'status');
    this.validateArray(result.steps, 'steps', 0, 50);
    this.validateNumber(result.duration, 'duration', 0);
    
    result.steps.forEach((stepResult, index) => {
      this.validateWorkflowStepResult(stepResult, `steps[${index}]`);
    });

    if (result.error) {
      this.validateString(result.error, 'error', 1, 1000);
    }
  }

  static validateWorkflowStepResult(result: WorkflowStepResult, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateUUID(result.stepId, `${prefix}stepId`);
    this.validateEnum(result.status, Status, `${prefix}status`);
    this.validateNumber(result.duration, `${prefix}duration`, 0);
    
    if (result.error) {
      this.validateString(result.error, `${prefix}error`, 1, 1000);
    }
  }

  private static validateStepDependencies(steps: WorkflowStep[]): void {
    const stepIds = new Set(steps.map(step => step.id));
    
    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          throw new ValidationError(
            `Step ${step.id} has invalid dependency ${depId}`,
            'INVALID_DEPENDENCY'
          );
        }
      }
    }

    // Check for circular dependencies
    this.checkCircularDependencies(steps);
  }

  private static checkCircularDependencies(steps: WorkflowStep[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const stepMap = new Map(steps.map(step => [step.id, step]));

    const hasCycle = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        return true;
      }
      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const depId of step.dependencies) {
          if (hasCycle(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (hasCycle(step.id)) {
        throw new ValidationError(
          'Circular dependency detected in workflow steps',
          'CIRCULAR_DEPENDENCY'
        );
      }
    }
  }
}