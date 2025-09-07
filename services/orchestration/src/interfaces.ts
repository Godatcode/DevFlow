import { 
  WorkflowOrchestrator, 
  WorkflowDefinition, 
  Workflow, 
  WorkflowContext, 
  WorkflowResult,
  WorkflowStatus,
  UUID 
} from '@devflow/shared-types';

export interface EventBus {
  publish(topic: string, event: WorkflowEvent): Promise<void>;
  subscribe(topic: string, handler: EventHandler): Promise<void>;
  unsubscribe(topic: string, handler: EventHandler): Promise<void>;
}

export interface EventHandler {
  (event: WorkflowEvent): Promise<void>;
}

export interface WorkflowEvent {
  id: UUID;
  type: string;
  workflowId: UUID;
  data: Record<string, any>;
  timestamp: Date;
  source: string;
}

export interface WorkflowEngine extends WorkflowOrchestrator {
  validateWorkflow(definition: WorkflowDefinition): Promise<ValidationResult>;
  getWorkflowHistory(workflowId: UUID): Promise<WorkflowEvent[]>;
  getActiveWorkflows(): Promise<Workflow[]>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}