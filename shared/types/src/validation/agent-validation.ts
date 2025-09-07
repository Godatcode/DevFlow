import {
  AIAgent,
  AgentExecution,
  AgentInput,
  AgentOutput,
  AgentResult,
  AgentContext,
  PerformanceMetrics,
  AgentAssignment,
  HookContext,
  HookResult,
  AutomatedTask,
  AgentType,
  AgentCapability,
  ExecutionStatus
} from '../agent';
import { BaseValidator, ValidationError } from './base-validation';

export class AgentValidator extends BaseValidator {
  static validateAIAgent(agent: AIAgent): void {
    this.validateBaseEntity(agent);
    this.validateString(agent.name, 'name', 1, 100);
    this.validateEnum(agent.type, AgentType, 'type');
    this.validateString(agent.version, 'version', 1, 20);
    
    this.validateArray(agent.capabilities, 'capabilities', 1, 10);
    agent.capabilities.forEach((capability, index) => {
      this.validateEnum(capability, AgentCapability, `capabilities[${index}]`);
    });

    this.validateObject(agent.configuration, 'configuration');
    
    if (typeof agent.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean', 'INVALID_TYPE');
    }

    // Validate version format (semantic versioning)
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(agent.version)) {
      throw new ValidationError(
        'version must follow semantic versioning format (e.g., 1.0.0)',
        'INVALID_VERSION_FORMAT'
      );
    }

    // Validate agent type and capabilities alignment
    this.validateAgentTypeCapabilities(agent.type, agent.capabilities);
  }

  static validateAgentExecution(execution: AgentExecution): void {
    this.validateBaseEntity(execution);
    this.validateUUID(execution.agentId, 'agentId');
    this.validateUUID(execution.workflowId, 'workflowId');
    this.validateEnum(execution.status, ExecutionStatus, 'status');
    this.validateAgentInput(execution.input);
    
    if (execution.output) {
      this.validateAgentOutput(execution.output);
    }

    this.validateDate(execution.startTime, 'startTime');
    
    if (execution.endTime) {
      this.validateDate(execution.endTime, 'endTime');
      if (execution.endTime < execution.startTime) {
        throw new ValidationError(
          'endTime cannot be before startTime',
          'INVALID_DATE_RANGE'
        );
      }
    }

    if (execution.duration !== undefined) {
      this.validateNumber(execution.duration, 'duration', 0);
      
      // If both startTime and endTime exist, validate duration matches
      if (execution.endTime) {
        const calculatedDuration = execution.endTime.getTime() - execution.startTime.getTime();
        const toleranceMs = 1000; // 1 second tolerance
        if (Math.abs(execution.duration - calculatedDuration) > toleranceMs) {
          throw new ValidationError(
            'duration does not match the time difference between startTime and endTime',
            'DURATION_MISMATCH'
          );
        }
      }
    }

    if (execution.error) {
      this.validateString(execution.error, 'error', 1, 1000);
    }

    // Validate status consistency
    this.validateExecutionStatusConsistency(execution);
  }

  static validateAgentInput(input: AgentInput): void {
    this.validateUUID(input.workflowId, 'input.workflowId');
    this.validateUUID(input.projectId, 'input.projectId');
    this.validateObject(input.context, 'input.context');
    this.validateObject(input.parameters, 'input.parameters');
  }

  static validateAgentOutput(output: AgentOutput): void {
    if (typeof output.success !== 'boolean') {
      throw new ValidationError('output.success must be a boolean', 'INVALID_TYPE');
    }

    this.validateRequired(output.data, 'output.data');
    this.validateObject(output.metrics, 'output.metrics');
    
    // Validate metrics values are numbers
    Object.entries(output.metrics).forEach(([key, value]) => {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new ValidationError(
          `output.metrics.${key} must be a valid number`,
          'INVALID_METRIC_VALUE'
        );
      }
    });

    if (output.recommendations) {
      this.validateArray(output.recommendations, 'output.recommendations', 0, 20);
      output.recommendations.forEach((rec, index) => {
        this.validateString(rec, `output.recommendations[${index}]`, 1, 500);
      });
    }

    if (output.error) {
      this.validateString(output.error, 'output.error', 1, 1000);
    }

    // Validate success/error consistency
    if (!output.success && !output.error) {
      throw new ValidationError(
        'output.error is required when output.success is false',
        'MISSING_ERROR_MESSAGE'
      );
    }
  }

  static validateAgentResult(result: AgentResult): void {
    this.validateUUID(result.executionId, 'executionId');
    this.validateEnum(result.status, ExecutionStatus, 'status');
    this.validateAgentOutput(result.output);
    this.validateNumber(result.duration, 'duration', 0);
    this.validateDate(result.startTime, 'startTime');
    
    if (result.endTime) {
      this.validateDate(result.endTime, 'endTime');
      if (result.endTime < result.startTime) {
        throw new ValidationError(
          'endTime cannot be before startTime',
          'INVALID_DATE_RANGE'
        );
      }
    }
  }

  static validateAgentContext(context: AgentContext): void {
    this.validateUUID(context.workflowId, 'workflowId');
    this.validateUUID(context.projectId, 'projectId');
    this.validateUUID(context.userId, 'userId');
    this.validateUUID(context.teamId, 'teamId');
    this.validateEnum(
      context.environment,
      { development: 'development', staging: 'staging', production: 'production' },
      'environment'
    );
    this.validateObject(context.metadata, 'metadata');
  }

  static validatePerformanceMetrics(metrics: PerformanceMetrics): void {
    this.validateNumber(metrics.executionCount, 'executionCount', 0);
    this.validateNumber(metrics.averageDuration, 'averageDuration', 0);
    this.validateNumber(metrics.successRate, 'successRate', 0, 100);
    this.validateNumber(metrics.errorRate, 'errorRate', 0, 100);
    this.validateDate(metrics.lastExecutionTime, 'lastExecutionTime');

    // Validate success rate + error rate <= 100
    if (metrics.successRate + metrics.errorRate > 100) {
      throw new ValidationError(
        'successRate + errorRate cannot exceed 100%',
        'INVALID_RATE_SUM'
      );
    }
  }

  static validateAgentAssignment(assignment: AgentAssignment): void {
    this.validateUUID(assignment.agentId, 'agentId');
    this.validateUUID(assignment.stepId, 'stepId');
    this.validateNumber(assignment.priority, 'priority', 1, 10);
    this.validateObject(assignment.conditions, 'conditions');
  }

  static validateHookContext(context: HookContext): void {
    this.validateString(context.event, 'event', 1, 100);
    this.validateUUID(context.projectId, 'projectId');
    this.validateUUID(context.userId, 'userId');
    this.validateObject(context.data, 'data');
  }

  static validateHookResult(result: HookResult): void {
    if (typeof result.success !== 'boolean') {
      throw new ValidationError('success must be a boolean', 'INVALID_TYPE');
    }

    this.validateRequired(result.data, 'data');
    this.validateNumber(result.duration, 'duration', 0);

    if (result.error) {
      this.validateString(result.error, 'error', 1, 1000);
    }

    // Validate success/error consistency
    if (!result.success && !result.error) {
      throw new ValidationError(
        'error is required when success is false',
        'MISSING_ERROR_MESSAGE'
      );
    }
  }

  static validateAutomatedTask(task: AutomatedTask): void {
    this.validateUUID(task.id, 'id');
    this.validateString(task.name, 'name', 1, 100);
    this.validateUUID(task.agentId, 'agentId');
    this.validateString(task.schedule, 'schedule', 1, 100);
    this.validateAgentContext(task.context);
    this.validateAgentInput(task.input);
    
    if (typeof task.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean', 'INVALID_TYPE');
    }

    // Validate cron expression format (basic validation)
    this.validateCronExpression(task.schedule);
  }

  private static validateAgentTypeCapabilities(
    type: AgentType,
    capabilities: AgentCapability[]
  ): void {
    const expectedCapabilities: Record<AgentType, AgentCapability[]> = {
      [AgentType.SECURITY_GUARDIAN]: [
        AgentCapability.VULNERABILITY_SCANNING,
        AgentCapability.CODE_ANALYSIS
      ],
      [AgentType.PERFORMANCE_OPTIMIZER]: [
        AgentCapability.PERFORMANCE_MONITORING,
        AgentCapability.CODE_ANALYSIS
      ],
      [AgentType.STYLE_ENFORCER]: [
        AgentCapability.CODE_FORMATTING,
        AgentCapability.CODE_ANALYSIS
      ],
      [AgentType.TEST_GENERATOR]: [
        AgentCapability.TEST_GENERATION,
        AgentCapability.CODE_ANALYSIS
      ],
      [AgentType.DOCUMENTATION_UPDATER]: [
        AgentCapability.DOCUMENTATION_GENERATION,
        AgentCapability.CODE_ANALYSIS
      ]
    };

    const expected = expectedCapabilities[type];
    const hasRequiredCapabilities = expected.every(cap => capabilities.includes(cap));
    
    if (!hasRequiredCapabilities) {
      throw new ValidationError(
        `Agent of type ${type} must have capabilities: ${expected.join(', ')}`,
        'MISSING_REQUIRED_CAPABILITIES'
      );
    }
  }

  private static validateExecutionStatusConsistency(execution: AgentExecution): void {
    const { status, endTime, output, error } = execution;

    switch (status) {
      case ExecutionStatus.PENDING:
      case ExecutionStatus.RUNNING:
        if (endTime) {
          throw new ValidationError(
            `Execution with status ${status} cannot have endTime`,
            'INVALID_STATUS_CONSISTENCY'
          );
        }
        if (output) {
          throw new ValidationError(
            `Execution with status ${status} cannot have output`,
            'INVALID_STATUS_CONSISTENCY'
          );
        }
        break;

      case ExecutionStatus.COMPLETED:
        if (!endTime) {
          throw new ValidationError(
            'Completed execution must have endTime',
            'MISSING_END_TIME'
          );
        }
        if (!output) {
          throw new ValidationError(
            'Completed execution must have output',
            'MISSING_OUTPUT'
          );
        }
        if (output && !output.success) {
          throw new ValidationError(
            'Completed execution output must have success=true',
            'INVALID_OUTPUT_SUCCESS'
          );
        }
        break;

      case ExecutionStatus.FAILED:
        if (!endTime) {
          throw new ValidationError(
            'Failed execution must have endTime',
            'MISSING_END_TIME'
          );
        }
        if (!error && (!output || output.success)) {
          throw new ValidationError(
            'Failed execution must have error or output with success=false',
            'MISSING_FAILURE_INFO'
          );
        }
        break;

      case ExecutionStatus.CANCELLED:
      case ExecutionStatus.TIMEOUT:
        if (!endTime) {
          throw new ValidationError(
            `${status} execution must have endTime`,
            'MISSING_END_TIME'
          );
        }
        break;
    }
  }

  private static validateCronExpression(cron: string): void {
    // Basic cron validation - should have 5 or 6 parts
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      throw new ValidationError(
        'schedule must be a valid cron expression with 5 or 6 parts',
        'INVALID_CRON_FORMAT'
      );
    }

    // Validate each part contains valid characters
    const cronRegex = /^[0-9*,/-]+$/;
    for (let i = 0; i < parts.length; i++) {
      if (!cronRegex.test(parts[i])) {
        throw new ValidationError(
          `Invalid cron expression part: ${parts[i]}`,
          'INVALID_CRON_PART'
        );
      }
    }
  }
}