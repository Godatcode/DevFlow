import { 
  AIAgent, 
  AgentExecution, 
  AgentContext, 
  AgentInput, 
  AgentResult, 
  ExecutionStatus,
  PerformanceMetrics,
  UUID 
} from '@devflow/shared-types';
import { AgentRegistry, AgentFilter } from './interfaces';
import { 
  AgentExecutionQueue, 
  AgentQueueItem, 
  AgentHealthCheck, 
  AutomationConfiguration 
} from './types';
import { Logger } from '@devflow/shared-utils';
import { EventEmitter } from 'events';

export class AgentManager extends EventEmitter implements AgentRegistry {
  private agents: Map<UUID, AIAgent> = new Map();
  private executionQueue: AgentExecutionQueue = {
    pending: [],
    running: new Map(),
    completed: [],
    failed: []
  };
  private healthChecks: Map<UUID, AgentHealthCheck> = new Map();
  private performanceMetrics: Map<UUID, PerformanceMetrics> = new Map();
  private logger: Logger;
  private config: AutomationConfiguration;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: AutomationConfiguration, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.startHealthChecking();
  }

  async register(agent: AIAgent): Promise<void> {
    try {
      this.logger.info('Registering agent', { agentId: agent.id, type: agent.type });
      
      // Validate agent
      this.validateAgent(agent);
      
      // Store agent
      this.agents.set(agent.id, agent);
      
      // Initialize health check
      await this.initializeAgentHealth(agent.id);
      
      // Initialize performance metrics
      this.performanceMetrics.set(agent.id, {
        executionCount: 0,
        averageDuration: 0,
        successRate: 1.0,
        errorRate: 0.0,
        lastExecutionTime: new Date()
      });

      this.emit('agent:registered', { agentId: agent.id, type: agent.type });
      
      this.logger.info('Agent registered successfully', { agentId: agent.id });
    } catch (error) {
      this.logger.error('Failed to register agent', { 
        agentId: agent.id, 
        error: error.message 
      });
      throw error;
    }
  }

  async unregister(agentId: UUID): Promise<void> {
    try {
      this.logger.info('Unregistering agent', { agentId });
      
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Cancel any running executions
      await this.cancelRunningExecutions(agentId);
      
      // Remove from collections
      this.agents.delete(agentId);
      this.healthChecks.delete(agentId);
      this.performanceMetrics.delete(agentId);
      
      this.emit('agent:unregistered', { agentId });
      
      this.logger.info('Agent unregistered successfully', { agentId });
    } catch (error) {
      this.logger.error('Failed to unregister agent', { 
        agentId, 
        error: error.message 
      });
      throw error;
    }
  }

  async getAgent(agentId: UUID): Promise<AIAgent | null> {
    return this.agents.get(agentId) || null;
  }

  async listAgents(filter?: AgentFilter): Promise<AIAgent[]> {
    let agents = Array.from(this.agents.values());
    
    if (filter) {
      agents = agents.filter(agent => {
        if (filter.type && agent.type !== filter.type) return false;
        if (filter.isActive !== undefined && agent.isActive !== filter.isActive) return false;
        if (filter.capabilities && !filter.capabilities.every(cap => 
          agent.capabilities.includes(cap as any))) return false;
        return true;
      });
    }
    
    return agents;
  }

  async executeAgent(
    agentId: UUID, 
    context: AgentContext, 
    input: AgentInput
  ): Promise<AgentResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (!agent.isActive) {
      throw new Error(`Agent ${agentId} is not active`);
    }

    const executionId = this.generateExecutionId();
    const queueItem: AgentQueueItem = {
      id: executionId,
      agentId,
      priority: 1,
      scheduledAt: new Date(),
      context,
      input
    };

    // Add to queue
    this.executionQueue.pending.push(queueItem);
    this.executionQueue.pending.sort((a, b) => b.priority - a.priority);

    // Process queue
    return this.processExecution(queueItem);
  }

  async getAgentHealth(agentId: UUID): Promise<AgentHealthCheck | null> {
    return this.healthChecks.get(agentId) || null;
  }

  async getPerformanceMetrics(agentId: UUID): Promise<PerformanceMetrics | null> {
    return this.performanceMetrics.get(agentId) || null;
  }

  async restartAgent(agentId: UUID): Promise<void> {
    this.logger.info('Restarting agent', { agentId });
    
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Cancel running executions
    await this.cancelRunningExecutions(agentId);
    
    // Reset health status
    await this.initializeAgentHealth(agentId);
    
    // Reset performance metrics
    const currentMetrics = this.performanceMetrics.get(agentId);
    if (currentMetrics) {
      this.performanceMetrics.set(agentId, {
        ...currentMetrics,
        errorRate: 0,
        lastExecutionTime: new Date()
      });
    }

    this.emit('agent:restarted', { agentId });
    
    this.logger.info('Agent restarted successfully', { agentId });
  }

  private validateAgent(agent: AIAgent): void {
    if (!agent.id || !agent.name || !agent.type) {
      throw new Error('Agent must have id, name, and type');
    }
    
    if (!agent.capabilities || agent.capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }
    
    if (typeof agent.execute !== 'function') {
      throw new Error('Agent must implement execute method');
    }
  }

  private async initializeAgentHealth(agentId: UUID): Promise<void> {
    this.healthChecks.set(agentId, {
      agentId,
      status: 'healthy',
      lastCheck: new Date(),
      responseTime: 0,
      errorRate: 0,
      memoryUsage: 0,
      cpuUsage: 0
    });
  }

  private async processExecution(queueItem: AgentQueueItem): Promise<AgentResult> {
    const { id: executionId, agentId, context, input } = queueItem;
    
    try {
      // Move to running
      this.executionQueue.running.set(executionId, {
        ...queueItem,
        startedAt: new Date()
      });
      
      // Remove from pending
      this.executionQueue.pending = this.executionQueue.pending.filter(
        item => item.id !== executionId
      );

      const agent = this.agents.get(agentId)!;
      const startTime = Date.now();
      
      this.logger.info('Starting agent execution', { executionId, agentId });
      
      // Execute with timeout
      const result = await Promise.race([
        agent.execute(context, input),
        this.createTimeoutPromise(executionId)
      ]);

      const duration = Date.now() - startTime;
      
      // Update performance metrics
      await this.updatePerformanceMetrics(agentId, duration, true);
      
      // Move to completed
      this.executionQueue.running.delete(executionId);
      this.executionQueue.completed.push({
        ...queueItem,
        completedAt: new Date()
      });

      this.emit('execution:completed', { executionId, agentId, duration });
      
      this.logger.info('Agent execution completed', { 
        executionId, 
        agentId, 
        duration 
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - Date.now();
      
      // Update performance metrics
      await this.updatePerformanceMetrics(agentId, duration, false);
      
      // Move to failed
      this.executionQueue.running.delete(executionId);
      this.executionQueue.failed.push({
        ...queueItem,
        completedAt: new Date()
      });

      this.emit('execution:failed', { executionId, agentId, error: error.message });
      
      this.logger.error('Agent execution failed', { 
        executionId, 
        agentId, 
        error: error.message 
      });
      
      throw error;
    }
  }

  private createTimeoutPromise(executionId: UUID): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution ${executionId} timed out after ${this.config.executionTimeout}ms`));
      }, this.config.executionTimeout);
    });
  }

  private async updatePerformanceMetrics(
    agentId: UUID, 
    duration: number, 
    success: boolean
  ): Promise<void> {
    const metrics = this.performanceMetrics.get(agentId);
    if (!metrics) return;

    const newCount = metrics.executionCount + 1;
    const newAvgDuration = (metrics.averageDuration * metrics.executionCount + duration) / newCount;
    
    let newSuccessRate = metrics.successRate;
    let newErrorRate = metrics.errorRate;
    
    if (success) {
      newSuccessRate = (metrics.successRate * metrics.executionCount + 1) / newCount;
      newErrorRate = (metrics.errorRate * metrics.executionCount) / newCount;
    } else {
      newSuccessRate = (metrics.successRate * metrics.executionCount) / newCount;
      newErrorRate = (metrics.errorRate * metrics.executionCount + 1) / newCount;
    }

    this.performanceMetrics.set(agentId, {
      executionCount: newCount,
      averageDuration: newAvgDuration,
      successRate: newSuccessRate,
      errorRate: newErrorRate,
      lastExecutionTime: new Date()
    });
  }

  private async cancelRunningExecutions(agentId: UUID): Promise<void> {
    const runningExecutions = Array.from(this.executionQueue.running.values())
      .filter(item => item.agentId === agentId);
    
    for (const execution of runningExecutions) {
      this.executionQueue.running.delete(execution.id);
      this.executionQueue.failed.push({
        ...execution,
        completedAt: new Date()
      });
    }
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    for (const [agentId, agent] of this.agents) {
      try {
        const startTime = Date.now();
        
        // Simple health check - could be enhanced with actual agent ping
        const isHealthy = agent.isActive;
        const responseTime = Date.now() - startTime;
        
        const currentHealth = this.healthChecks.get(agentId);
        if (currentHealth) {
          this.healthChecks.set(agentId, {
            ...currentHealth,
            status: isHealthy ? 'healthy' : 'unhealthy',
            lastCheck: new Date(),
            responseTime
          });
        }
        
        // Auto-restart unhealthy agents if configured
        if (!isHealthy && currentHealth?.status === 'healthy') {
          this.emit('agent:unhealthy', { agentId });
          this.logger.warn('Agent became unhealthy', { agentId });
        }
        
      } catch (error) {
        this.logger.error('Health check failed for agent', { 
          agentId, 
          error: error.message 
        });
      }
    }
  }

  private generateExecutionId(): UUID {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.logger.info('Agent manager shutdown completed');
  }
}