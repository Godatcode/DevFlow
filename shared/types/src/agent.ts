import { BaseEntity, UUID, Status } from './common';

export enum AgentType {
  SECURITY_GUARDIAN = 'security_guardian',
  PERFORMANCE_OPTIMIZER = 'performance_optimizer',
  STYLE_ENFORCER = 'style_enforcer',
  TEST_GENERATOR = 'test_generator',
  DOCUMENTATION_UPDATER = 'documentation_updater'
}

export enum AgentCapability {
  VULNERABILITY_SCANNING = 'vulnerability_scanning',
  CODE_ANALYSIS = 'code_analysis',
  PERFORMANCE_MONITORING = 'performance_monitoring',
  CODE_FORMATTING = 'code_formatting',
  TEST_GENERATION = 'test_generation',
  DOCUMENTATION_GENERATION = 'documentation_generation'
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

export interface AgentInput {
  workflowId: UUID;
  projectId: UUID;
  context: Record<string, any>;
  parameters: Record<string, any>;
}

export interface AgentOutput {
  success: boolean;
  data: any;
  metrics: Record<string, number>;
  recommendations?: string[];
  error?: string;
}

export interface AgentResult {
  executionId: UUID;
  status: ExecutionStatus;
  output: AgentOutput;
  duration: number;
  startTime: Date;
  endTime?: Date;
}

export interface AgentContext {
  workflowId: UUID;
  projectId: UUID;
  userId: UUID;
  teamId: UUID;
  environment: 'development' | 'staging' | 'production';
  metadata: Record<string, any>;
}

export interface AIAgent extends BaseEntity {
  name: string;
  type: AgentType;
  version: string;
  capabilities: AgentCapability[];
  configuration: Record<string, any>;
  isActive: boolean;
  execute(context: AgentContext, input: AgentInput): Promise<AgentResult>;
}

export interface AgentExecution extends BaseEntity {
  agentId: UUID;
  workflowId: UUID;
  status: ExecutionStatus;
  input: AgentInput;
  output?: AgentOutput;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
}

export interface PerformanceMetrics {
  executionCount: number;
  averageDuration: number;
  successRate: number;
  errorRate: number;
  lastExecutionTime: Date;
}

export interface AgentAssignment {
  agentId: UUID;
  stepId: UUID;
  priority: number;
  conditions: Record<string, any>;
}

export interface HookContext {
  event: string;
  projectId: UUID;
  userId: UUID;
  data: Record<string, any>;
}

export interface HookResult {
  success: boolean;
  data: any;
  duration: number;
  error?: string;
}

export interface AutomatedTask {
  id: UUID;
  name: string;
  agentId: UUID;
  schedule: string; // cron expression
  context: AgentContext;
  input: AgentInput;
  isActive: boolean;
}

// Automation Service Interfaces
export interface AutomationEngine {
  registerAgent(agent: AIAgent): Promise<void>;
  executeHook(hookId: UUID, context: HookContext): Promise<HookResult>;
  scheduleTask(task: AutomatedTask): Promise<void>;
  monitorAgentPerformance(agentId: UUID): Promise<PerformanceMetrics>;
  getAgentExecutions(agentId: UUID, limit?: number): Promise<AgentExecution[]>;
}