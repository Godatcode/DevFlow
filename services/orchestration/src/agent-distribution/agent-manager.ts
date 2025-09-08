import { UUID, AgentCapability } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export { AgentCapability };

export enum AgentStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance'
}

export interface Agent {
  id: UUID;
  name: string;
  type: string;
  capabilities: AgentCapability[];
  status: AgentStatus;
  currentLoad: number;
  maxConcurrentTasks: number;
  priority: number;
  lastHeartbeat: Date;
  metadata: Record<string, any>;
}

export interface AgentMetrics {
  agentId: UUID;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageExecutionTime: number;
  successRate: number;
  lastTaskCompletedAt?: Date;
}

export interface AgentRegistration {
  name: string;
  type: string;
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  priority: number;
  metadata?: Record<string, any>;
}

export class AgentManager {
  private agents: Map<UUID, Agent>;
  private agentMetrics: Map<UUID, AgentMetrics>;
  private logger: Logger;
  private heartbeatTimeout: number;

  constructor(logger: Logger, heartbeatTimeout: number = 30000) {
    this.agents = new Map();
    this.agentMetrics = new Map();
    this.logger = logger;
    this.heartbeatTimeout = heartbeatTimeout;
  }

  async registerAgent(registration: AgentRegistration): Promise<Agent> {
    const agent: Agent = {
      id: this.generateAgentId(),
      name: registration.name,
      type: registration.type,
      capabilities: registration.capabilities,
      status: AgentStatus.AVAILABLE,
      currentLoad: 0,
      maxConcurrentTasks: registration.maxConcurrentTasks,
      priority: registration.priority,
      lastHeartbeat: new Date(),
      metadata: registration.metadata || {}
    };

    this.agents.set(agent.id, agent);
    
    // Initialize metrics
    this.agentMetrics.set(agent.id, {
      agentId: agent.id,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      averageExecutionTime: 0,
      successRate: 0
    });

    this.logger.info('Agent registered successfully', {
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      capabilities: agent.capabilities
    });

    return agent;
  }

  async unregisterAgent(agentId: UUID): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.agents.delete(agentId);
    this.agentMetrics.delete(agentId);

    this.logger.info('Agent unregistered successfully', {
      agentId,
      name: agent.name
    });
  }

  async updateAgentStatus(agentId: UUID, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const previousStatus = agent.status;
    agent.status = status;
    agent.lastHeartbeat = new Date();

    this.logger.debug('Agent status updated', {
      agentId,
      previousStatus,
      newStatus: status
    });
  }

  async updateAgentLoad(agentId: UUID, currentLoad: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.currentLoad = Math.max(0, Math.min(currentLoad, agent.maxConcurrentTasks));
    agent.lastHeartbeat = new Date();

    // Update status based on load
    if (agent.currentLoad >= agent.maxConcurrentTasks) {
      agent.status = AgentStatus.BUSY;
    } else if (agent.status === AgentStatus.BUSY && agent.currentLoad < agent.maxConcurrentTasks) {
      agent.status = AgentStatus.AVAILABLE;
    }

    this.logger.debug('Agent load updated', {
      agentId,
      currentLoad: agent.currentLoad,
      maxConcurrentTasks: agent.maxConcurrentTasks,
      status: agent.status
    });
  }

  async heartbeat(agentId: UUID): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.lastHeartbeat = new Date();
    
    // If agent was offline, mark as available (if not at max load)
    if (agent.status === AgentStatus.OFFLINE && agent.currentLoad < agent.maxConcurrentTasks) {
      agent.status = AgentStatus.AVAILABLE;
      this.logger.info('Agent came back online', { agentId });
    }
  }

  getAgent(agentId: UUID): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAvailableAgents(): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === AgentStatus.AVAILABLE);
  }

  getAgentsByCapability(capability: AgentCapability): Agent[] {
    return Array.from(this.agents.values())
      .filter(agent => agent.capabilities.includes(capability));
  }

  getAvailableAgentsByCapability(capability: AgentCapability): Agent[] {
    return this.getAvailableAgents()
      .filter(agent => agent.capabilities.includes(capability));
  }

  updateAgentMetrics(agentId: UUID, taskCompleted: boolean, executionTime: number): void {
    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) {
      this.logger.warn('Metrics not found for agent', { agentId });
      return;
    }

    if (taskCompleted) {
      metrics.totalTasksCompleted++;
      metrics.lastTaskCompletedAt = new Date();
    } else {
      metrics.totalTasksFailed++;
    }

    // Update average execution time
    const totalTasks = metrics.totalTasksCompleted + metrics.totalTasksFailed;
    metrics.averageExecutionTime = 
      ((metrics.averageExecutionTime * (totalTasks - 1)) + executionTime) / totalTasks;

    // Update success rate
    metrics.successRate = metrics.totalTasksCompleted / totalTasks;

    this.logger.debug('Agent metrics updated', {
      agentId,
      taskCompleted,
      executionTime,
      successRate: metrics.successRate
    });
  }

  getAgentMetrics(agentId: UUID): AgentMetrics | undefined {
    return this.agentMetrics.get(agentId);
  }

  getAllAgentMetrics(): AgentMetrics[] {
    return Array.from(this.agentMetrics.values());
  }

  // Health check - mark agents as offline if they haven't sent heartbeat
  performHealthCheck(): void {
    const now = new Date();
    let offlineCount = 0;

    for (const agent of this.agents.values()) {
      const timeSinceHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > this.heartbeatTimeout && agent.status !== AgentStatus.OFFLINE) {
        agent.status = AgentStatus.OFFLINE;
        offlineCount++;
        
        this.logger.warn('Agent marked as offline due to missed heartbeat', {
          agentId: agent.id,
          name: agent.name,
          timeSinceHeartbeat
        });
      }
    }

    if (offlineCount > 0) {
      this.logger.info('Health check completed', {
        totalAgents: this.agents.size,
        offlineAgents: offlineCount
      });
    }
  }

  // Get agent statistics
  getAgentStatistics(): {
    total: number;
    available: number;
    busy: number;
    offline: number;
    maintenance: number;
  } {
    const stats = {
      total: this.agents.size,
      available: 0,
      busy: 0,
      offline: 0,
      maintenance: 0
    };

    for (const agent of this.agents.values()) {
      switch (agent.status) {
        case AgentStatus.AVAILABLE:
          stats.available++;
          break;
        case AgentStatus.BUSY:
          stats.busy++;
          break;
        case AgentStatus.OFFLINE:
          stats.offline++;
          break;
        case AgentStatus.MAINTENANCE:
          stats.maintenance++;
          break;
      }
    }

    return stats;
  }

  private generateAgentId(): UUID {
    return crypto.randomUUID() as UUID;
  }
}