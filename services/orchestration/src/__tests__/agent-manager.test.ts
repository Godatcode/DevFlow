import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  AgentManager, 
  Agent, 
  AgentStatus, 
  AgentCapability, 
  AgentRegistration 
} from '../agent-distribution/agent-manager';
import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let mockLogger: vi.Mocked<Logger>;

  const mockRegistration: AgentRegistration = {
    name: 'Test Agent',
    type: 'security-scanner',
    capabilities: [AgentCapability.SECURITY_SCANNING, AgentCapability.CODE_REVIEW],
    maxConcurrentTasks: 3,
    priority: 100,
    metadata: { version: '1.0.0' }
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    agentManager = new AgentManager(mockLogger, 30000);

    // Mock crypto.randomUUID with counter for unique IDs
    let idCounter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `agent-uuid-${++idCounter}`)
    });
  });

  describe('registerAgent', () => {
    it('should register agent successfully', async () => {
      const agent = await agentManager.registerAgent(mockRegistration);

      expect(agent).toMatchObject({
        id: expect.any(String),
        name: mockRegistration.name,
        type: mockRegistration.type,
        capabilities: mockRegistration.capabilities,
        status: AgentStatus.AVAILABLE,
        currentLoad: 0,
        maxConcurrentTasks: mockRegistration.maxConcurrentTasks,
        priority: mockRegistration.priority,
        metadata: mockRegistration.metadata
      });

      expect(agent.lastHeartbeat).toBeInstanceOf(Date);
      expect(mockLogger.info).toHaveBeenCalledWith('Agent registered successfully', {
        agentId: agent.id,
        name: agent.name,
        type: agent.type,
        capabilities: agent.capabilities
      });
    });

    it('should initialize agent metrics', async () => {
      const agent = await agentManager.registerAgent(mockRegistration);
      const metrics = agentManager.getAgentMetrics(agent.id);

      expect(metrics).toMatchObject({
        agentId: agent.id,
        totalTasksCompleted: 0,
        totalTasksFailed: 0,
        averageExecutionTime: 0,
        successRate: 0
      });
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister agent successfully', async () => {
      const agent = await agentManager.registerAgent(mockRegistration);
      
      await agentManager.unregisterAgent(agent.id);

      expect(agentManager.getAgent(agent.id)).toBeUndefined();
      expect(agentManager.getAgentMetrics(agent.id)).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Agent unregistered successfully', {
        agentId: agent.id,
        name: agent.name
      });
    });

    it('should throw error when unregistering non-existent agent', async () => {
      const nonExistentId = 'non-existent' as UUID;
      
      await expect(agentManager.unregisterAgent(nonExistentId))
        .rejects.toThrow(`Agent not found: ${nonExistentId}`);
    });
  });

  describe('updateAgentStatus', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = await agentManager.registerAgent(mockRegistration);
    });

    it('should update agent status successfully', async () => {
      await agentManager.updateAgentStatus(agent.id, AgentStatus.MAINTENANCE);

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.status).toBe(AgentStatus.MAINTENANCE);
      expect(mockLogger.debug).toHaveBeenCalledWith('Agent status updated', {
        agentId: agent.id,
        previousStatus: AgentStatus.AVAILABLE,
        newStatus: AgentStatus.MAINTENANCE
      });
    });

    it('should update last heartbeat', async () => {
      const originalHeartbeat = agent.lastHeartbeat;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await agentManager.updateAgentStatus(agent.id, AgentStatus.BUSY);

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.lastHeartbeat.getTime()).toBeGreaterThan(originalHeartbeat.getTime());
    });

    it('should throw error for non-existent agent', async () => {
      const nonExistentId = 'non-existent' as UUID;
      
      await expect(agentManager.updateAgentStatus(nonExistentId, AgentStatus.BUSY))
        .rejects.toThrow(`Agent not found: ${nonExistentId}`);
    });
  });

  describe('updateAgentLoad', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = await agentManager.registerAgent(mockRegistration);
    });

    it('should update agent load successfully', async () => {
      await agentManager.updateAgentLoad(agent.id, 2);

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.currentLoad).toBe(2);
      expect(mockLogger.debug).toHaveBeenCalledWith('Agent load updated', {
        agentId: agent.id,
        currentLoad: 2,
        maxConcurrentTasks: agent.maxConcurrentTasks,
        status: AgentStatus.AVAILABLE
      });
    });

    it('should mark agent as busy when at max capacity', async () => {
      await agentManager.updateAgentLoad(agent.id, 3); // Max concurrent tasks

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.status).toBe(AgentStatus.BUSY);
      expect(updatedAgent?.currentLoad).toBe(3);
    });

    it('should mark agent as available when load decreases from max', async () => {
      // First set to max load
      await agentManager.updateAgentLoad(agent.id, 3);
      expect(agentManager.getAgent(agent.id)?.status).toBe(AgentStatus.BUSY);

      // Then decrease load
      await agentManager.updateAgentLoad(agent.id, 2);
      
      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.status).toBe(AgentStatus.AVAILABLE);
      expect(updatedAgent?.currentLoad).toBe(2);
    });

    it('should clamp load to valid range', async () => {
      // Test negative load
      await agentManager.updateAgentLoad(agent.id, -1);
      expect(agentManager.getAgent(agent.id)?.currentLoad).toBe(0);

      // Test load above max
      await agentManager.updateAgentLoad(agent.id, 10);
      expect(agentManager.getAgent(agent.id)?.currentLoad).toBe(3);
    });
  });

  describe('heartbeat', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = await agentManager.registerAgent(mockRegistration);
    });

    it('should update last heartbeat', async () => {
      const originalHeartbeat = agent.lastHeartbeat;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await agentManager.heartbeat(agent.id);

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.lastHeartbeat.getTime()).toBeGreaterThan(originalHeartbeat.getTime());
    });

    it('should bring offline agent back online', async () => {
      // Mark agent as offline
      await agentManager.updateAgentStatus(agent.id, AgentStatus.OFFLINE);
      
      // Send heartbeat
      await agentManager.heartbeat(agent.id);

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.status).toBe(AgentStatus.AVAILABLE);
      expect(mockLogger.info).toHaveBeenCalledWith('Agent came back online', { agentId: agent.id });
    });

    it('should not change status if agent is at max load', async () => {
      // Set agent to max load and offline
      await agentManager.updateAgentLoad(agent.id, 3);
      await agentManager.updateAgentStatus(agent.id, AgentStatus.OFFLINE);
      
      await agentManager.heartbeat(agent.id);

      const updatedAgent = agentManager.getAgent(agent.id);
      expect(updatedAgent?.status).toBe(AgentStatus.OFFLINE); // Should remain offline due to max load
    });
  });

  describe('agent queries', () => {
    let agent1: Agent;
    let agent2: Agent;

    beforeEach(async () => {
      agent1 = await agentManager.registerAgent({
        ...mockRegistration,
        name: 'Agent 1',
        capabilities: [AgentCapability.SECURITY_SCANNING]
      });

      agent2 = await agentManager.registerAgent({
        ...mockRegistration,
        name: 'Agent 2',
        capabilities: [AgentCapability.PERFORMANCE_OPTIMIZATION, AgentCapability.CODE_REVIEW]
      });

      // Set agent2 as busy
      await agentManager.updateAgentStatus(agent2.id, AgentStatus.BUSY);
    });

    it('should get all agents', () => {
      const allAgents = agentManager.getAllAgents();
      expect(allAgents).toHaveLength(2);
      expect(allAgents.map(a => a.id)).toContain(agent1.id);
      expect(allAgents.map(a => a.id)).toContain(agent2.id);
    });

    it('should get available agents only', () => {
      const availableAgents = agentManager.getAvailableAgents();
      expect(availableAgents).toHaveLength(1);
      expect(availableAgents[0].id).toBe(agent1.id);
    });

    it('should get agents by capability', () => {
      const securityAgents = agentManager.getAgentsByCapability(AgentCapability.SECURITY_SCANNING);
      expect(securityAgents).toHaveLength(1);
      expect(securityAgents[0].id).toBe(agent1.id);

      const reviewAgents = agentManager.getAgentsByCapability(AgentCapability.CODE_REVIEW);
      expect(reviewAgents).toHaveLength(1);
      expect(reviewAgents[0].id).toBe(agent2.id);
    });

    it('should get available agents by capability', () => {
      const availableSecurityAgents = agentManager.getAvailableAgentsByCapability(AgentCapability.SECURITY_SCANNING);
      expect(availableSecurityAgents).toHaveLength(1);
      expect(availableSecurityAgents[0].id).toBe(agent1.id);

      const availableReviewAgents = agentManager.getAvailableAgentsByCapability(AgentCapability.CODE_REVIEW);
      expect(availableReviewAgents).toHaveLength(0); // agent2 is busy
    });
  });

  describe('metrics', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = await agentManager.registerAgent(mockRegistration);
    });

    it('should update metrics for completed task', () => {
      agentManager.updateAgentMetrics(agent.id, true, 1000);

      const metrics = agentManager.getAgentMetrics(agent.id);
      expect(metrics).toMatchObject({
        totalTasksCompleted: 1,
        totalTasksFailed: 0,
        averageExecutionTime: 1000,
        successRate: 1
      });
      expect(metrics?.lastTaskCompletedAt).toBeInstanceOf(Date);
    });

    it('should update metrics for failed task', () => {
      agentManager.updateAgentMetrics(agent.id, false, 500);

      const metrics = agentManager.getAgentMetrics(agent.id);
      expect(metrics).toMatchObject({
        totalTasksCompleted: 0,
        totalTasksFailed: 1,
        averageExecutionTime: 500,
        successRate: 0
      });
      expect(metrics?.lastTaskCompletedAt).toBeUndefined();
    });

    it('should calculate average execution time correctly', () => {
      agentManager.updateAgentMetrics(agent.id, true, 1000);
      agentManager.updateAgentMetrics(agent.id, true, 2000);
      agentManager.updateAgentMetrics(agent.id, false, 500);

      const metrics = agentManager.getAgentMetrics(agent.id);
      expect(metrics?.averageExecutionTime).toBe(1166.6666666666667); // (1000 + 2000 + 500) / 3
      expect(metrics?.successRate).toBe(2/3);
    });

    it('should get all agent metrics', async () => {
      const agent2 = await agentManager.registerAgent({
        ...mockRegistration,
        name: 'Agent 2'
      });

      agentManager.updateAgentMetrics(agent.id, true, 1000);
      agentManager.updateAgentMetrics(agent2.id, false, 500);

      const allMetrics = agentManager.getAllAgentMetrics();
      expect(allMetrics).toHaveLength(2);
    });
  });

  describe('health check', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = await agentManager.registerAgent(mockRegistration);
    });

    it('should mark agents as offline when heartbeat timeout exceeded', () => {
      // Create agent manager with short timeout for testing
      const shortTimeoutManager = new AgentManager(mockLogger, 100);
      
      // Register agent and wait for timeout
      return new Promise<void>((resolve) => {
        shortTimeoutManager.registerAgent(mockRegistration).then((testAgent) => {
          setTimeout(() => {
            shortTimeoutManager.performHealthCheck();
            
            const updatedAgent = shortTimeoutManager.getAgent(testAgent.id);
            expect(updatedAgent?.status).toBe(AgentStatus.OFFLINE);
            expect(mockLogger.warn).toHaveBeenCalledWith('Agent marked as offline due to missed heartbeat', {
              agentId: testAgent.id,
              name: testAgent.name,
              timeSinceHeartbeat: expect.any(Number)
            });
            resolve();
          }, 150);
        });
      });
    });

    it('should not mark agents as offline if already offline', () => {
      agentManager.updateAgentStatus(agent.id, AgentStatus.OFFLINE);
      
      agentManager.performHealthCheck();
      
      // Should not log warning again
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Agent marked as offline'),
        expect.any(Object)
      );
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await agentManager.registerAgent({ ...mockRegistration, name: 'Agent 1' });
      await agentManager.registerAgent({ ...mockRegistration, name: 'Agent 2' });
      await agentManager.registerAgent({ ...mockRegistration, name: 'Agent 3' });
      
      const agents = agentManager.getAllAgents();
      await agentManager.updateAgentStatus(agents[1].id, AgentStatus.BUSY);
      await agentManager.updateAgentStatus(agents[2].id, AgentStatus.OFFLINE);
    });

    it('should return correct agent statistics', () => {
      const stats = agentManager.getAgentStatistics();
      
      expect(stats).toEqual({
        total: 3,
        available: 1,
        busy: 1,
        offline: 1,
        maintenance: 0
      });
    });
  });
});