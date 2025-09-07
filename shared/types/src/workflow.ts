import { BaseEntity, UUID, Status } from './common';

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum EventTriggerType {
  CODE_COMMIT = 'code_commit',
  PULL_REQUEST = 'pull_request',
  DEPLOYMENT = 'deployment',
  SCHEDULE = 'schedule',
  MANUAL = 'manual',
  WEBHOOK = 'webhook'
}

export enum WorkflowStepType {
  AGENT_EXECUTION = 'agent_execution',
  INTEGRATION_CALL = 'integration_call',
  CONDITION = 'condition',
  PARALLEL = 'parallel',
  SEQUENTIAL = 'sequential'
}

export interface EventTrigger {
  id: UUID;
  type: EventTriggerType;
  conditions: Record<string, any>;
  enabled: boolean;
}

export interface WorkflowStep {
  id: UUID;
  name: string;
  type: WorkflowStepType;
  config: Record<string, any>;
  dependencies: UUID[];
  timeout?: number;
  retryConfig?: RetryConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential';
  initialDelay: number;
  maxDelay: number;
}

export interface WorkflowDefinition extends BaseEntity {
  name: string;
  description: string;
  version: string;
  triggers: EventTrigger[];
  steps: WorkflowStep[];
  variables: Record<string, any>;
  settings: WorkflowSettings;
}

export interface WorkflowSettings {
  timeout: number;
  maxConcurrentExecutions: number;
  retryPolicy: RetryConfig;
  notifications: NotificationConfig[];
}

export interface NotificationConfig {
  channel: string;
  events: string[];
  recipients: string[];
}

export interface Workflow extends BaseEntity {
  definitionId: UUID;
  status: WorkflowStatus;
  context: WorkflowContext;
  executionId: UUID;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface WorkflowContext {
  projectId: UUID;
  userId: UUID;
  teamId: UUID;
  variables: Record<string, any>;
  metadata: Record<string, any>;
}

export interface WorkflowResult {
  workflowId: UUID;
  status: WorkflowStatus;
  steps: WorkflowStepResult[];
  duration: number;
  error?: string;
}

export interface WorkflowStepResult {
  stepId: UUID;
  status: Status;
  output: any;
  duration: number;
  error?: string;
}

// Orchestration Service Interfaces
export interface WorkflowOrchestrator {
  createWorkflow(definition: WorkflowDefinition): Promise<Workflow>;
  executeWorkflow(workflowId: UUID, context: WorkflowContext): Promise<WorkflowResult>;
  pauseWorkflow(workflowId: UUID): Promise<void>;
  resumeWorkflow(workflowId: UUID): Promise<void>;
  cancelWorkflow(workflowId: UUID): Promise<void>;
  getWorkflowStatus(workflowId: UUID): Promise<WorkflowStatus>;
}