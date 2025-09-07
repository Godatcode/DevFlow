import { 
  AutomationEngine,
  AIAgent,
  AgentExecution,
  HookContext,
  HookResult,
  AutomatedTask,
  PerformanceMetrics,
  UUID 
} from '@devflow/shared-types';

export interface AgentRegistry {
  register(agent: AIAgent): Promise<void>;
  unregister(agentId: UUID): Promise<void>;
  getAgent(agentId: UUID): Promise<AIAgent | null>;
  listAgents(filter?: AgentFilter): Promise<AIAgent[]>;
}

export interface AgentFilter {
  type?: string;
  capabilities?: string[];
  isActive?: boolean;
}

export interface HookManager {
  registerHook(hook: Hook): Promise<void>;
  unregisterHook(hookId: UUID): Promise<void>;
  triggerHook(hookId: UUID, context: HookContext): Promise<HookResult>;
  listHooks(projectId?: UUID): Promise<Hook[]>;
}

export interface Hook {
  id: UUID;
  name: string;
  description: string;
  trigger: HookTrigger;
  actions: HookAction[];
  conditions?: HookCondition[];
  isActive: boolean;
  projectId: UUID;
}

export interface HookTrigger {
  type: 'event' | 'schedule' | 'manual';
  config: Record<string, any>;
}

export interface HookAction {
  type: 'agent_execution' | 'notification' | 'integration_call';
  agentId?: UUID;
  config: Record<string, any>;
}

export interface HookCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'matches';
  value: any;
}

export interface TaskScheduler {
  scheduleTask(task: AutomatedTask): Promise<void>;
  cancelTask(taskId: UUID): Promise<void>;
  getScheduledTasks(agentId?: UUID): Promise<AutomatedTask[]>;
  executeTask(taskId: UUID): Promise<void>;
}