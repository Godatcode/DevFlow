import { UUID, WorkflowStatus, WorkflowResult } from '@devflow/shared-types';

export interface WorkflowExecutionContext {
  workflowId: UUID;
  executionId: UUID;
  currentStep: number;
  variables: Record<string, any>;
  metadata: Record<string, any>;
  startTime: Date;
  lastUpdateTime: Date;
}

export interface StepExecutionResult {
  stepId: UUID;
  success: boolean;
  output: any;
  duration: number;
  error?: string;
  retryCount: number;
}

export interface WorkflowMetrics {
  workflowId: UUID;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime: Date;
}

export interface OrchestrationState {
  activeWorkflows: Map<UUID, WorkflowExecutionContext>;
  queuedWorkflows: UUID[];
  completedWorkflows: Map<UUID, WorkflowResult>;
  metrics: Map<UUID, WorkflowMetrics>;
}