import { UUID, ExecutionStatus, AgentType } from '@devflow/shared-types';

export interface AgentExecutionQueue {
  pending: AgentQueueItem[];
  running: Map<UUID, AgentQueueItem>;
  completed: AgentQueueItem[];
  failed: AgentQueueItem[];
}

export interface AgentQueueItem {
  id: UUID;
  agentId: UUID;
  priority: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  context: Record<string, any>;
  input: Record<string, any>;
}

export interface AgentCapabilityMatcher {
  matchAgents(requiredCapabilities: string[]): Promise<UUID[]>;
  getAgentCapabilities(agentId: UUID): Promise<string[]>;
  updateAgentCapabilities(agentId: UUID, capabilities: string[]): Promise<void>;
}

export interface AutomationMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  agentUtilization: Map<UUID, number>;
  queueLength: number;
  lastExecutionTime: Date;
}

export interface AgentHealthCheck {
  agentId: UUID;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface AutomationConfiguration {
  maxConcurrentExecutions: number;
  executionTimeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffStrategy: 'linear' | 'exponential';
    initialDelay: number;
  };
  healthCheckInterval: number;
  metricsRetentionDays: number;
}