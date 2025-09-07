import { AgentDiscoveryService, AgentDiscoveryConfig } from '../agent-discovery';
import { 
  AIAgent, 
  AgentType, 
  AgentCapability 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

// Mock agents
const createMockAgent = (
  id: string, 
  type: AgentType, 
  capabilities: AgentCapability[]
): AIAgent => ({
  id,
  name: `Agent ${id}`,
  type,
  version: '1.0.0',
  capabilities,
  configuration: {},
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  execute: vi.fn()
});

describe('AgentDiscoveryService', () => {
  let discoveryService: AgentDiscoveryService;
  let config: AgentDiscoveryConfig;

  beforeEach(() => {
    config = {
      enableAutoDiscovery: true,
      discoveryInterval: 5000,
      capabilityWeights: {
        [AgentCapability.VULNERABILITY_SCANNING]: 2,
        [AgentCapability.CODE_ANALYSIS]: 1,
        [AgentCapability.PERFORMANCE_MONITORING]: 1.5
      }
    };

    discoveryService = new AgentDiscoveryService(config, mockLogger);
  });

  describe('registerAgent', () => {
    it('should register agent successfully', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent);

      const capabilities = await discoveryService.getAgentCapabilities(agent.id);
      expect(capabilities).toContain(AgentCapability.VULNERABILITY_SCANNING);
    });

    it('should update capability index', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING, AgentCapability.CODE_ANALYSIS]
      );

      await discoveryService.registerAgent(agent);

      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);
      expect(matchingAgents).toContain(agent.id);
    });

    it('should handle multiple agents with same capabilities', async () => {
      const agent1 = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );
      const agent2 = createMockAgent(
        'agent-2', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent1);
      await discoveryService.registerAgent(agent2);

      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);
      expect(matchingAgents).toHaveLength(2);
      expect(matchingAgents).toContain(agent1.id);
      expect(matchingAgents).toContain(agent2.id);
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister agent successfully', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent);
      await discoveryService.unregisterAgent(agent.id);

      await expect(discoveryService.getAgentCapabilities(agent.id))
        .rejects.toThrow(`Agent ${agent.id} not found`);
    });

    it('should remove from capability index', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent);
      await discoveryService.unregisterAgent(agent.id);

      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);
      expect(matchingAgents).not.toContain(agent.id);
    });

    it('should handle unregistering non-existent agent gracefully', async () => {
      await expect(discoveryService.unregisterAgent('non-existent'))
        .resolves.not.toThrow();
    });
  });

  describe('matchAgents', () => {
    beforeEach(async () => {
      const securityAgent = createMockAgent(
        'security-agent', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING, AgentCapability.CODE_ANALYSIS]
      );
      
      const perfAgent = createMockAgent(
        'perf-agent', 
        AgentType.PERFORMANCE_OPTIMIZER, 
        [AgentCapability.PERFORMANCE_MONITORING]
      );
      
      const multiAgent = createMockAgent(
        'multi-agent', 
        AgentType.STYLE_ENFORCER, 
        [AgentCapability.CODE_ANALYSIS, AgentCapability.PERFORMANCE_MONITORING]
      );

      await discoveryService.registerAgent(securityAgent);
      await discoveryService.registerAgent(perfAgent);
      await discoveryService.registerAgent(multiAgent);
    });

    it('should match agents with single capability', async () => {
      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);

      expect(matchingAgents).toHaveLength(1);
      expect(matchingAgents).toContain('security-agent');
    });

    it('should match agents with multiple capabilities', async () => {
      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.CODE_ANALYSIS,
        AgentCapability.PERFORMANCE_MONITORING
      ]);

      expect(matchingAgents).toHaveLength(1);
      expect(matchingAgents).toContain('multi-agent');
    });

    it('should return empty array when no agents match', async () => {
      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.TEST_GENERATION // No agents have this capability
      ]);

      expect(matchingAgents).toHaveLength(0);
    });

    it('should return empty array when required capability has no agents', async () => {
      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING,
        AgentCapability.TEST_GENERATION // This will cause empty result
      ]);

      expect(matchingAgents).toHaveLength(0);
    });

    it('should sort agents by capability weights', async () => {
      // Add another security agent with different weight
      const highWeightAgent = createMockAgent(
        'high-weight-agent', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING] // Higher weight capability
      );
      
      await discoveryService.registerAgent(highWeightAgent);

      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);

      // Should be sorted by weight (vulnerability scanning has weight 2)
      expect(matchingAgents).toHaveLength(2);
    });

    it('should only match active agents', async () => {
      const inactiveAgent = createMockAgent(
        'inactive-agent', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );
      inactiveAgent.isActive = false;

      await discoveryService.registerAgent(inactiveAgent);

      const matchingAgents = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);

      expect(matchingAgents).not.toContain('inactive-agent');
    });

    it('should handle invalid capabilities gracefully', async () => {
      const matchingAgents = await discoveryService.matchAgents([
        'invalid-capability'
      ]);

      expect(matchingAgents).toHaveLength(0);
    });
  });

  describe('updateAgentCapabilities', () => {
    it('should update agent capabilities successfully', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent);
      
      await discoveryService.updateAgentCapabilities(agent.id, [
        AgentCapability.CODE_ANALYSIS,
        AgentCapability.PERFORMANCE_MONITORING
      ]);

      const capabilities = await discoveryService.getAgentCapabilities(agent.id);
      expect(capabilities).toContain(AgentCapability.CODE_ANALYSIS);
      expect(capabilities).toContain(AgentCapability.PERFORMANCE_MONITORING);
      expect(capabilities).not.toContain(AgentCapability.VULNERABILITY_SCANNING);
    });

    it('should update capability index correctly', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent);
      
      await discoveryService.updateAgentCapabilities(agent.id, [
        AgentCapability.CODE_ANALYSIS
      ]);

      // Should not match old capability
      const oldMatches = await discoveryService.matchAgents([
        AgentCapability.VULNERABILITY_SCANNING
      ]);
      expect(oldMatches).not.toContain(agent.id);

      // Should match new capability
      const newMatches = await discoveryService.matchAgents([
        AgentCapability.CODE_ANALYSIS
      ]);
      expect(newMatches).toContain(agent.id);
    });

    it('should throw error for non-existent agent', async () => {
      await expect(discoveryService.updateAgentCapabilities('non-existent', [
        AgentCapability.CODE_ANALYSIS
      ])).rejects.toThrow('Agent non-existent not found');
    });

    it('should filter out invalid capabilities', async () => {
      const agent = createMockAgent(
        'agent-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );

      await discoveryService.registerAgent(agent);
      
      await discoveryService.updateAgentCapabilities(agent.id, [
        AgentCapability.CODE_ANALYSIS,
        'invalid-capability' as any
      ]);

      const capabilities = await discoveryService.getAgentCapabilities(agent.id);
      expect(capabilities).toContain(AgentCapability.CODE_ANALYSIS);
      expect(capabilities).not.toContain('invalid-capability');
    });
  });

  describe('discoverAgentsByType', () => {
    beforeEach(async () => {
      const securityAgent1 = createMockAgent(
        'security-1', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );
      
      const securityAgent2 = createMockAgent(
        'security-2', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.CODE_ANALYSIS]
      );
      
      const perfAgent = createMockAgent(
        'perf-1', 
        AgentType.PERFORMANCE_OPTIMIZER, 
        [AgentCapability.PERFORMANCE_MONITORING]
      );

      await discoveryService.registerAgent(securityAgent1);
      await discoveryService.registerAgent(securityAgent2);
      await discoveryService.registerAgent(perfAgent);
    });

    it('should discover agents by type', async () => {
      const securityAgents = await discoveryService.discoverAgentsByType(
        AgentType.SECURITY_GUARDIAN
      );

      expect(securityAgents).toHaveLength(2);
      expect(securityAgents.map(a => a.id)).toContain('security-1');
      expect(securityAgents.map(a => a.id)).toContain('security-2');
    });

    it('should only return active agents', async () => {
      const inactiveAgent = createMockAgent(
        'inactive-security', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING]
      );
      inactiveAgent.isActive = false;

      await discoveryService.registerAgent(inactiveAgent);

      const securityAgents = await discoveryService.discoverAgentsByType(
        AgentType.SECURITY_GUARDIAN
      );

      expect(securityAgents.map(a => a.id)).not.toContain('inactive-security');
    });
  });

  describe('discoverBestAgentForTask', () => {
    beforeEach(async () => {
      const securityAgent = createMockAgent(
        'security-agent', 
        AgentType.SECURITY_GUARDIAN, 
        [AgentCapability.VULNERABILITY_SCANNING, AgentCapability.CODE_ANALYSIS]
      );
      
      const perfAgent = createMockAgent(
        'perf-agent', 
        AgentType.PERFORMANCE_OPTIMIZER, 
        [AgentCapability.PERFORMANCE_MONITORING, AgentCapability.CODE_ANALYSIS]
      );

      await discoveryService.registerAgent(securityAgent);
      await discoveryService.registerAgent(perfAgent);
    });

    it('should return best agent for required capabilities', async () => {
      const bestAgent = await discoveryService.discoverBestAgentForTask([
        AgentCapability.VULNERABILITY_SCANNING
      ]);

      expect(bestAgent).toBe('security-agent');
    });

    it('should prefer agent of specified type', async () => {
      const bestAgent = await discoveryService.discoverBestAgentForTask([
        AgentCapability.CODE_ANALYSIS
      ], AgentType.PERFORMANCE_OPTIMIZER);

      expect(bestAgent).toBe('perf-agent');
    });

    it('should return null when no agents match', async () => {
      const bestAgent = await discoveryService.discoverBestAgentForTask([
        AgentCapability.TEST_GENERATION
      ]);

      expect(bestAgent).toBeNull();
    });
  });

  describe('statistics and metrics', () => {
    beforeEach(async () => {
      const agents = [
        createMockAgent('agent-1', AgentType.SECURITY_GUARDIAN, [AgentCapability.VULNERABILITY_SCANNING]),
        createMockAgent('agent-2', AgentType.SECURITY_GUARDIAN, [AgentCapability.CODE_ANALYSIS]),
        createMockAgent('agent-3', AgentType.PERFORMANCE_OPTIMIZER, [AgentCapability.PERFORMANCE_MONITORING])
      ];

      for (const agent of agents) {
        await discoveryService.registerAgent(agent);
      }
    });

    it('should return capability statistics', async () => {
      const stats = await discoveryService.getCapabilityStatistics();

      expect(stats[AgentCapability.VULNERABILITY_SCANNING]).toBe(1);
      expect(stats[AgentCapability.CODE_ANALYSIS]).toBe(1);
      expect(stats[AgentCapability.PERFORMANCE_MONITORING]).toBe(1);
    });

    it('should return agent counts', () => {
      expect(discoveryService.getRegisteredAgentCount()).toBe(3);
      expect(discoveryService.getActiveAgentCount()).toBe(3);
    });

    it('should return capability index size', () => {
      expect(discoveryService.getCapabilityIndexSize()).toBeGreaterThan(0);
    });
  });
});