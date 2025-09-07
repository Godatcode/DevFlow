import {
  WorkflowStep,
  WorkflowStepType,
  UUID
} from '@devflow/shared-types';
import { WorkflowExecutionContext, StepExecutionResult } from '../types';
import { StepExecutor } from '../workflow-execution-engine';
import { WorkflowAgentCoordinator } from './workflow-agent-coordinator';
import { Logger } from '@devflow/shared-utils';

export class AgentStepExecutor implements StepExecutor {
  private agentCoordinator: WorkflowAgentCoordinator;
  private logger: Logger;

  constructor(agentCoordinator: WorkflowAgentCoordinator, logger: Logger) {
    this.agentCoordinator = agentCoordinator;
    this.logger = logger;
  }

  canExecute(stepType: WorkflowStepType): boolean {
    return stepType === WorkflowStepType.AGENT_EXECUTION;
  }

  async execute(step: WorkflowStep, context: WorkflowExecutionContext): Promise<StepExecutionResult> {
    this.logger.info('Executing agent step', {
      workflowId: context.workflowId,
      stepId: step.id,
      stepName: step.name,
      agentType: step.config.agentType
    });

    const startTime = Date.now();

    try {
      const result = await this.agentCoordinator.executeAgentStep(
        context.workflowId,
        step,
        context
      );

      const duration = Date.now() - startTime;

      this.logger.info('Agent step execution completed', {
        workflowId: context.workflowId,
        stepId: step.id,
        taskId: result.taskId,
        success: result.success,
        duration,
        agentId: result.agentId
      });

      return {
        stepId: step.id,
        success: result.success,
        output: result.output,
        duration,
        error: result.error,
        retryCount: 0
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Agent step execution failed', {
        workflowId: context.workflowId,
        stepId: step.id,
        error: errorMessage,
        duration
      });

      return {
        stepId: step.id,
        success: false,
        output: null,
        duration,
        error: errorMessage,
        retryCount: 0
      };
    }
  }
}