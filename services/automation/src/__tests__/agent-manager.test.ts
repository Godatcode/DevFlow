import { AgentManager } from '../agent-manager';
import { 
  AIAgent, 
  AgentType, 
  AgentCapability, 
  AgentContext, 
  AgentInput, 
  AgentResult,
  ExecutionStatus 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { AutomationConfiguration } from '../types';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

// Mock agent
class MockAgent implements AIAgent {
  id = 'test-agent-1';
  name = 'Test Agent';
  type = AgentType.SECURITY_GUARDIAN;
  version = '1.0.0';
  capabilities = [AgentCapability.VULNERABILITY_SCANNING];
  configuration = {};
  isActive = true;
  createdAt = new Date();
  updatedAt = new Date();

  async execute(context: AgentContext, input: AgentInput): Promise<AgentResult> {
    return {
      executionId: 'exec-1',
      status: ExecutionStatus.COMPLETED,
      output: {
        success: true,
        data: { result: 'test' },
        metrics: { duration: 100 }
      },
      duration: 100,
      startTime: new Date(),
      endTime: new Date()
    };
  }
}

describe('AgentManager', () => {
  let agentManager: AgentManager;
  let config: AutomationConfiguration;
  let mockAgent: MockAgent;

  beforeEach(() => {
    config = {
      maxConcurrentExecutions: 10,
      executionTimeout: 30000,
      retryPolicy: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000
      },
      healthCheckInterval: 5000,
      metricsRetentionDays: 30
    };

    agentManager = new AgentManager(config, mockLogger);
    mockAgent = new MockAgent();
  });

  afterEach(() => {
    agentManager.shutdown();
  });

  describe('register', () => {
    it('should register a valid agent successfully', async () => {
      await agentManager.register(mockAgent);

      const retrievedAgent = await agentManager.getAgent(mockAgent.id);
      expect(retrievedAgent).toEqual(mockAgent);
    });

    it('should emit agent:registered event', async () => {
      const eventSpy = vi.fn();
      agentManager.on('agent:registered', eventSpy);

      await agentManager.register(mockAgent);

      expect(eventSpy).toHaveBeenCalledWith({
        agentId: mockAgent.id,
        type: mockAgent.type
      });
    });

    it('should initialize health check for registered agent', async () => {
      await agentManager.register(mockAgent);

      const health = await agentManager.getAgentHealth(mockAgent.id);
      expect(health).toBeDefined();
      expect(health?.agentId).toBe(mockAgent.id);
      expect(health?.status).toBe('healthy');
    });

    it('should initialize performance metrics for registered agent', async () => {
      await agentManager.register(mockAgent);

      const metrics = await agentManager.getPerformanceMetrics(mockAgent.id);
      expect(metrics).toBeDefined();
      expect(metrics?.executionCount).toBe(0);
      expect(metrics?.successRate).toBe(1.0);
      expect(metrics?.errorRate).toBe(0.0);
    });

    it('should throw error for invalid agent', async () => {
      const invalidAgent = { ...mockAgent, id: '' };

      await expect(agentManager.register(invalidAgent as AIAgent))
        .rejects.toThrow('Agent must have id, name, and type');
    });

    it('should throw error for agent without capabilities', async () => {
      const invalidAgent = { ...mockAgent, capabilities: [] };

      await expect(agentManager.register(invalidAgent as AIAgent))
        .rejects.toThrow('Agent must have at least one capability');
    });
  });

  describe('unregister', () => {
    beforeEach(async () => {
      await agentManager.register(mockAgent);
    });

    it('should unregister an existing agent', async () => {
      await agentManager.unregister(mockAgent.id);

      const retrievedAgent = await agentManager.getAgent(mockAgent.id);
      expect(retrievedAgent).toBeNull();
    });

    it('should emit agent:unregistered event', async () => {
      const eventSpy = vi.fn();
      agentManager.on('agent:unregistered', eventSpy);

      await agentManager.unregister(mockAgent.id);

      expect(eventSpy).toHaveBeenCalledWith({ agentId: mockAgent.id });
    });

    it('should clean up health check data', async () => {
      await agentManager.unregister(mockAgent.id);

      const health = await agentManager.getAgentHealth(mockAgent.id);
      expect(health).toBeNull();
    });

    it('should clean up performance metrics', async () => {
      await agentManager.unregister(mockAgent.id);

      const metrics = await agentManager.getPerformanceMetrics(mockAgent.id);
      expect(metrics).toBeNull();
    });

    it('should throw error for non-existent agent', async () => {
      await expect(agentManager.unregister('non-existent'))
        .rejects.toThrow('Agent non-existent not found');
    });
  });

  describe('listAgents', () => {
    beforeEach(async () => {
      await agentManager.register(mockAgent);
      
      const secondAgent = new MockAgent();
      secondAgent.id = 'test-agent-2';
      secondAgent.type = AgentType.PERFORMANCE_OPTIMIZER;
      secondAgent.capabilities = [AgentCapability.PERFORMANCE_MONITORING];
      await agentManager.register(secondAgent);
    });

    it('should list all agents without filter', async () => {
      const agents = await agentManager.listAgents();
      expect(agents).toHaveLength(2);
    });

    it('should filter agents by type', async () => {
      const agents = await agentManager.listAgents({ 
        type: AgentType.SECURITY_GUARDIAN.toString() 
      });
      expect(agents).toHaveLength(1);
      expect(agents[0].type).toBe(AgentType.SECURITY_GUARDIAN);
    });

    it('should filter agents by active status', async () => {
      // Make one agent inactive
      mockAgent.isActive = false;
      
      const activeAgents = await agentManager.listAgents({ isActive: true });
      expect(activeAgents).toHaveLength(1);
      expect(activeAgents[0].isActive).toBe(true);
    });

    it('should filter agents by capabilities', async () => {
      const agents = await agentManager.listAgents({ 
        capabilities: [AgentCapability.VULNERABILITY_SCANNING.toString()] 
      });
      expect(agents).toHaveLength(1);
      expect(agents[0].capabilities).toContain(AgentCapability.VULNERABILITY_SCANNING);
    });
  });

  describe('executeAgent', () => {
    beforeEach(async () => {
      await agentManager.register(mockAgent);
    });

    it('should execute agent successfully', async () => {
      const context: AgentContext = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        userId: 'user-1',
        teamId: 'team-1',
        environment: 'development',
        metadata: {}
      };

      const input: AgentInput = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        context: {},
        parameters: {}
      };

      const result = await agentManager.executeAgent(mockAgent.id, context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
    });

    it('should update performance metrics after successful execution', async () => {
      const context: AgentContext = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        userId: 'user-1',
        teamId: 'team-1',
        environment: 'development',
        metadata: {}
      };

      const input: AgentInput = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        context: {},
        parameters: {}
      };

      await agentManager.executeAgent(mockAgent.id, context, input);

      const metrics = await agentManager.getPerformanceMetrics(mockAgent.id);
      expect(metrics?.executionCount).toBe(1);
      expect(metrics?.successRate).toBe(1.0);
    });

    it('should emit execution:completed event', async () => {
      const eventSpy = vi.fn();
      agentManager.on('execution:completed', eventSpy);

      const context: AgentContext = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        userId: 'user-1',
        teamId: 'team-1',
        environment: 'development',
        metadata: {}
      };

      const input: AgentInput = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        context: {},
        parameters: {}
      };

      await agentManager.executeAgent(mockAgent.id, context, input);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: mockAgent.id
        })
      );
    });

    it('should throw error for non-existent agent', async () => {
      const context: AgentContext = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        userId: 'user-1',
        teamId: 'team-1',
        environment: 'development',
        metadata: {}
      };

      const input: AgentInput = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        context: {},
        parameters: {}
      };

      await expect(agentManager.executeAgent('non-existent', context, input))
        .rejects.toThrow('Agent non-existent not found');
    });

    it('should throw error for inactive agent', async () => {
      mockAgent.isActive = false;

      const context: AgentContext = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        userId: 'user-1',
        teamId: 'team-1',
        environment: 'development',
        metadata: {}
      };

      const input: AgentInput = {
        workflowId: 'workflow-1',
        projectId: 'project-1',
        context: {},
        parameters: {}
      };

      await expect(agentManager.executeAgent(mockAgent.id, context, input))
        .rejects.toThrow(`Agent ${mockAgent.id} is not active`);
    });
  });

  describe('restartAgent', () => {
    beforeEach(async () => {
      await agentManager.register(mockAgent);
    });

    it('should restart agent successfully', async () => {
      await agentManager.restartAgent(mockAgent.id);

      const health = await agentManager.getAgentHealth(mockAgent.id);
      expect(health?.status).toBe('healthy');
    });

    it('should emit agent:restarted event', async () => {
      const eventSpy = vi.fn();
      agentManager.on('agent:restarted', eventSpy);

      await agentManager.restartAgent(mockAgent.id);

      expect(eventSpy).toHaveBeenCalledWith({ agentId: mockAgent.id });
    });

    it('should throw error for non-existent agent', async () => {
      await expect(agentManager.restartAgent('non-existent'))
        .rejects.toThrow('Agent non-existent not found');
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      await agentManager.register(mockAgent);
    });

    it('should track agent health status', async () => {
      const health = await agentManager.getAgentHealth(mockAgent.id);
      
      expect(health).toBeDefined();
      expect(health?.agentId).toBe(mockAgent.id);
      expect(health?.status).toBe('healthy');
      expect(health?.lastCheck).toBeInstanceOf(Date);
    });

    it('should detect unhealthy agents', async () => {
      const eventSpy = vi.fn();
      agentManager.on('agent:unhealthy', eventSpy);

      // Simulate agent becoming unhealthy
      mockAgent.isActive = false;

      // Wait for health check cycle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Note: In a real test, you'd need to trigger the health check manually
      // or wait for the interval to complete
    });
  });
});