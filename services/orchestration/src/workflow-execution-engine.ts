import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowStepType,
  WorkflowResult,
  WorkflowStepResult,
  WorkflowStatus,
  Status,
  UUID,
  RetryConfig
} from '@devflow/shared-types';
import { WorkflowExecutionContext, StepExecutionResult } from './types';
import { WorkflowStateManager } from './workflow-state-manager';
import { Logger } from '@devflow/shared-utils';

export interface StepExecutor {
  canExecute(stepType: WorkflowStepType): boolean;
  execute(step: WorkflowStep, context: WorkflowExecutionContext): Promise<StepExecutionResult>;
}

export class WorkflowExecutionEngine {
  private stateManager: WorkflowStateManager;
  private stepExecutors: Map<WorkflowStepType, StepExecutor>;
  private pausedExecutions: Set<UUID>;
  private logger: Logger;

  constructor(stateManager: WorkflowStateManager, logger: Logger) {
    this.stateManager = stateManager;
    this.stepExecutors = new Map();
    this.pausedExecutions = new Set();
    this.logger = logger;
  }

  registerStepExecutor(executor: StepExecutor): void {
    for (const stepType of Object.values(WorkflowStepType)) {
      if (executor.canExecute(stepType)) {
        this.stepExecutors.set(stepType, executor);
        this.logger.debug('Step executor registered', { stepType });
      }
    }
  }

  async execute(workflowId: UUID, context: WorkflowExecutionContext): Promise<WorkflowResult> {
    this.logger.info('Starting workflow execution', { workflowId, executionId: context.executionId });

    const startTime = Date.now();
    const stepResults: WorkflowStepResult[] = [];

    try {
      // Get workflow definition (this would come from a repository in real implementation)
      const definition = await this.getWorkflowDefinition(workflowId);
      if (!definition) {
        throw new Error(`Workflow definition not found: ${workflowId}`);
      }

      // Execute steps sequentially (simplified - real implementation would handle parallel steps)
      for (let i = context.currentStep; i < definition.steps.length; i++) {
        // Check if execution is paused
        if (this.pausedExecutions.has(workflowId)) {
          this.logger.info('Workflow execution paused', { workflowId, currentStep: i });
          break;
        }

        const step = definition.steps[i];
        context.currentStep = i;
        
        // Update execution context
        await this.stateManager.updateExecutionContext(context);

        this.logger.debug('Executing workflow step', { 
          workflowId, 
          stepId: step.id, 
          stepName: step.name,
          stepType: step.type 
        });

        const stepResult = await this.executeStep(step, context);
        
        let finalStepResult = stepResult;

        // Handle step failure with retry
        if (!stepResult.success && step.retryConfig) {
          const retryResult = await this.retryStep(step, context, stepResult.retryCount);
          if (!retryResult.success) {
            this.logger.error('Workflow step failed after retries', { 
              workflowId, 
              stepId: step.id, 
              retryCount: retryResult.retryCount 
            });
            
            const workflowStepResult: WorkflowStepResult = {
              stepId: step.id,
              status: Status.FAILED,
              output: retryResult.output,
              duration: retryResult.duration,
              error: retryResult.error
            };

            stepResults.push(workflowStepResult);
            
            return {
              workflowId,
              status: WorkflowStatus.FAILED,
              steps: stepResults,
              duration: Date.now() - startTime,
              error: retryResult.error
            };
          }
          
          // Use retry result as final result
          finalStepResult = retryResult;
        }

        // If step failed and no retry config, fail the workflow
        if (!finalStepResult.success && !step.retryConfig) {
          this.logger.error('Workflow step failed without retry', { 
            workflowId, 
            stepId: step.id, 
            error: finalStepResult.error 
          });
          
          const workflowStepResult: WorkflowStepResult = {
            stepId: step.id,
            status: Status.FAILED,
            output: finalStepResult.output,
            duration: finalStepResult.duration,
            error: finalStepResult.error
          };

          stepResults.push(workflowStepResult);
          
          return {
            workflowId,
            status: WorkflowStatus.FAILED,
            steps: stepResults,
            duration: Date.now() - startTime,
            error: finalStepResult.error
          };
        }

        // Add successful step result
        const workflowStepResult: WorkflowStepResult = {
          stepId: step.id,
          status: finalStepResult.success ? Status.COMPLETED : Status.FAILED,
          output: finalStepResult.output,
          duration: finalStepResult.duration,
          error: finalStepResult.error
        };

        stepResults.push(workflowStepResult);
      }

      // Check if workflow was paused
      if (this.pausedExecutions.has(workflowId)) {
        return {
          workflowId,
          status: WorkflowStatus.PAUSED, // Use PAUSED for paused state
          steps: stepResults,
          duration: Date.now() - startTime
        };
      }

      this.logger.info('Workflow execution completed successfully', { 
        workflowId, 
        duration: Date.now() - startTime 
      });

      return {
        workflowId,
        status: WorkflowStatus.COMPLETED,
        steps: stepResults,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error('Workflow execution failed', { workflowId, error });
      
      return {
        workflowId,
        status: WorkflowStatus.FAILED,
        steps: stepResults,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async pauseExecution(workflowId: UUID): Promise<void> {
    this.pausedExecutions.add(workflowId);
    this.logger.info('Workflow execution paused', { workflowId });
  }

  async resumeExecution(workflowId: UUID): Promise<void> {
    this.pausedExecutions.delete(workflowId);
    
    // Get execution context and continue from current step
    const context = await this.stateManager.getExecutionContext(workflowId);
    if (context) {
      this.logger.info('Resuming workflow execution', { workflowId, currentStep: context.currentStep });
      // In a real implementation, this would trigger async execution
      // For now, we just remove from paused set
    }
  }

  async cancelExecution(workflowId: UUID): Promise<void> {
    this.pausedExecutions.delete(workflowId);
    await this.stateManager.deleteExecutionContext(workflowId);
    this.logger.info('Workflow execution cancelled', { workflowId });
  }

  private async executeStep(step: WorkflowStep, context: WorkflowExecutionContext): Promise<StepExecutionResult> {
    const executor = this.stepExecutors.get(step.type);
    if (!executor) {
      throw new Error(`No executor found for step type: ${step.type}`);
    }

    const startTime = Date.now();
    
    try {
      const result = await executor.execute(step, context);
      const duration = Date.now() - startTime;
      
      this.logger.debug('Step executed successfully', { 
        stepId: step.id, 
        duration,
        success: result.success 
      });
      
      return {
        ...result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Step execution failed', { 
        stepId: step.id, 
        duration,
        error: errorMessage 
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

  private async retryStep(
    step: WorkflowStep, 
    context: WorkflowExecutionContext, 
    currentRetryCount: number
  ): Promise<StepExecutionResult> {
    const retryConfig = step.retryConfig!;
    let retryCount = currentRetryCount;

    while (retryCount < retryConfig.maxAttempts) {
      retryCount++;
      
      // Calculate delay
      const delay = this.calculateRetryDelay(retryConfig, retryCount);
      await this.sleep(delay);

      this.logger.debug('Retrying step execution', { 
        stepId: step.id, 
        retryCount, 
        maxAttempts: retryConfig.maxAttempts 
      });

      const result = await this.executeStep(step, context);
      result.retryCount = retryCount;

      if (result.success) {
        this.logger.info('Step retry succeeded', { stepId: step.id, retryCount });
        return result;
      }
    }

    this.logger.error('Step failed after all retries', { 
      stepId: step.id, 
      retryCount,
      maxAttempts: retryConfig.maxAttempts 
    });

    return {
      stepId: step.id,
      success: false,
      output: null,
      duration: 0,
      error: 'Max retry attempts exceeded',
      retryCount
    };
  }

  private calculateRetryDelay(retryConfig: RetryConfig, retryCount: number): number {
    let delay: number;
    
    if (retryConfig.backoffStrategy === 'exponential') {
      delay = retryConfig.initialDelay * Math.pow(2, retryCount - 1);
    } else {
      delay = retryConfig.initialDelay * retryCount;
    }
    
    return Math.min(delay, retryConfig.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getWorkflowDefinition(workflowId: UUID): Promise<WorkflowDefinition | null> {
    // In a real implementation, this would fetch from a repository
    // For now, return a mock definition
    return null;
  }
}