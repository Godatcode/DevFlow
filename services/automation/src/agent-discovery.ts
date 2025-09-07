import { 
  AIAgent, 
  AgentCapability, 
  AgentType, 
  UUID 
} from '@devflow/shared-types';
import { AgentCapabilityMatcher } from './types';
import { Logger } from '@devflow/shared-utils';

export interface AgentDiscoveryConfig {
  enableAutoDiscovery: boolean;
  discoveryInterval: number;
  capabilityWeights: Record<string, number>;
}

export class AgentDiscoveryService implements AgentCapabilityMatcher {
  private agents: Map<UUID, AIAgent> = new Map();
  private capabilityIndex: Map<AgentCapability, Set<UUID>> = new Map();
  private logger: Logger;
  private config: AgentDiscoveryConfig;

  constructor(config: AgentDiscoveryConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.initializeCapabilityIndex();
  }

  async registerAgent(agent: AIAgent): Promise<void> {
    this.logger.info('Registering agent for discovery', { 
      agentId: agent.id, 
      type: agent.type,
      capabilities: agent.capabilities 
    });

    this.agents.set(agent.id, agent);
    
    // Update capability index
    for (const capability of agent.capabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, new Set());
      }
      this.capabilityIndex.get(capability)!.add(agent.id);
    }

    this.logger.info('Agent registered for discovery', { agentId: agent.id });
  }

  async unregisterAgent(agentId: UUID): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.logger.warn('Attempted to unregister unknown agent', { agentId });
      return;
    }

    this.logger.info('Unregistering agent from discovery', { agentId });

    // Remove from capability index
    for (const capability of agent.capabilities) {
      const agentSet = this.capabilityIndex.get(capability);
      if (agentSet) {
        agentSet.delete(agentId);
        if (agentSet.size === 0) {
          this.capabilityIndex.delete(capability);
        }
      }
    }

    this.agents.delete(agentId);
    
    this.logger.info('Agent unregistered from discovery', { agentId });
  }

  async matchAgents(requiredCapabilities: string[]): Promise<UUID[]> {
    this.logger.debug('Matching agents for capabilities', { requiredCapabilities });

    const capabilityEnums = requiredCapabilities
      .map(cap => cap as AgentCapability)
      .filter(cap => Object.values(AgentCapability).includes(cap));

    if (capabilityEnums.length === 0) {
      this.logger.warn('No valid capabilities provided for matching');
      return [];
    }

    // Find agents that have all required capabilities
    const candidateAgents = new Map<UUID, number>();

    for (const capability of capabilityEnums) {
      const agentsWithCapability = this.capabilityIndex.get(capability);
      if (!agentsWithCapability || agentsWithCapability.size === 0) {
        // If any required capability has no agents, return empty result
        this.logger.debug('No agents found with required capability', { capability });
        return [];
      }

      for (const agentId of agentsWithCapability) {
        const agent = this.agents.get(agentId);
        if (agent && agent.isActive) {
          const currentScore = candidateAgents.get(agentId) || 0;
          const capabilityWeight = this.config.capabilityWeights[capability] || 1;
          candidateAgents.set(agentId, currentScore + capabilityWeight);
        }
      }
    }

    // Filter agents that have ALL required capabilities
    const matchingAgents: Array<{ agentId: UUID; score: number }> = [];
    
    for (const [agentId, score] of candidateAgents) {
      const agent = this.agents.get(agentId)!;
      const hasAllCapabilities = capabilityEnums.every(cap => 
        agent.capabilities.includes(cap)
      );
      
      if (hasAllCapabilities) {
        matchingAgents.push({ agentId, score });
      }
    }

    // Sort by score (higher is better)
    matchingAgents.sort((a, b) => b.score - a.score);

    const result = matchingAgents.map(item => item.agentId);
    
    this.logger.info('Agent matching completed', { 
      requiredCapabilities,
      matchCount: result.length,
      matchedAgents: result
    });

    return result;
  }

  async getAgentCapabilities(agentId: UUID): Promise<string[]> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    return agent.capabilities.map(cap => cap.toString());
  }

  async updateAgentCapabilities(agentId: UUID, capabilities: string[]): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.info('Updating agent capabilities', { 
      agentId, 
      oldCapabilities: agent.capabilities,
      newCapabilities: capabilities 
    });

    // Remove from old capability indexes
    for (const capability of agent.capabilities) {
      const agentSet = this.capabilityIndex.get(capability);
      if (agentSet) {
        agentSet.delete(agentId);
        if (agentSet.size === 0) {
          this.capabilityIndex.delete(capability);
        }
      }
    }

    // Update agent capabilities
    const validCapabilities = capabilities
      .map(cap => cap as AgentCapability)
      .filter(cap => Object.values(AgentCapability).includes(cap));

    agent.capabilities = validCapabilities;

    // Add to new capability indexes
    for (const capability of validCapabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, new Set());
      }
      this.capabilityIndex.get(capability)!.add(agentId);
    }

    this.logger.info('Agent capabilities updated', { agentId, capabilities: validCapabilities });
  }

  async discoverAgentsByType(type: AgentType): Promise<AIAgent[]> {
    const agents = Array.from(this.agents.values())
      .filter(agent => agent.type === type && agent.isActive);
    
    this.logger.debug('Discovered agents by type', { type, count: agents.length });
    
    return agents;
  }

  async discoverBestAgentForTask(
    requiredCapabilities: string[],
    preferredType?: AgentType
  ): Promise<UUID | null> {
    const matchingAgents = await this.matchAgents(requiredCapabilities);
    
    if (matchingAgents.length === 0) {
      return null;
    }

    // If preferred type is specified, prioritize agents of that type
    if (preferredType) {
      for (const agentId of matchingAgents) {
        const agent = this.agents.get(agentId);
        if (agent && agent.type === preferredType) {
          this.logger.info('Selected preferred type agent', { 
            agentId, 
            type: preferredType 
          });
          return agentId;
        }
      }
    }

    // Return the best matching agent (first in sorted list)
    const selectedAgent = matchingAgents[0];
    
    this.logger.info('Selected best matching agent', { 
      agentId: selectedAgent,
      requiredCapabilities 
    });
    
    return selectedAgent;
  }

  async getCapabilityStatistics(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    
    for (const [capability, agentSet] of this.capabilityIndex) {
      stats[capability] = agentSet.size;
    }
    
    return stats;
  }

  async getAgentLoadDistribution(): Promise<Record<UUID, number>> {
    // This would typically integrate with performance metrics
    // For now, return equal distribution
    const distribution: Record<UUID, number> = {};
    
    for (const agentId of this.agents.keys()) {
      distribution[agentId] = 0; // Would be actual load metrics
    }
    
    return distribution;
  }

  private initializeCapabilityIndex(): void {
    // Initialize with all known capabilities
    for (const capability of Object.values(AgentCapability)) {
      this.capabilityIndex.set(capability, new Set());
    }
  }

  public getRegisteredAgentCount(): number {
    return this.agents.size;
  }

  public getActiveAgentCount(): number {
    return Array.from(this.agents.values())
      .filter(agent => agent.isActive).length;
  }

  public getCapabilityIndexSize(): number {
    return this.capabilityIndex.size;
  }
}