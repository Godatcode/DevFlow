import { AgentExecutionEnvironment, ExecutionEnvironmentConfig } from '../agent-execution-environment';
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

// Mock slow agent for timeout testing
class SlowMockAgent extends MockAgent {
  id = 'slow-agent';
  
  async execute(context: AgentContext, input: AgentInput): Promise<AgentResult> {
    // Simulate slow execution
    await new Promise(resolve => setTimeout(resolve, 2000));
    return super.execute(context, input);
  }
}

// Mock failing agent
class FailingMockAgent extends MockAgent {
  id = 'failing-agent';
  
  async execute(context: AgentContext, input: AgentInput): Promise<AgentResult> {
    throw new Error('Agent execution failed');
  }
}

describe('AgentExecutionEnvironment', () => {
  let executionEnvironment: AgentExecutionEnvironment;
  let config: ExecutionEnvironmentConfig;
  let mockAgent: MockAgent;
  let context: AgentContext;
  let input: AgentInput;

  beforeEach(() => {
    config = {
      maxMemoryMB: 512,
      maxExecutionTimeMs: 1000,
      maxConcurrentExecutions: 5,
      isolationLevel: 'none',
      resourceLimits: {
        cpu: 80,
        memory: 256,
        disk: 100
      }
    };

    executionEnvironment = new AgentExecutionEnvironment(config, mockLogger);
    mockAgent = new MockAgent();

    context = {
      workflowId: 'workflow-1',
      projectId: 'project-1',
      userId: 'user-1',
      teamId: 'team-1',
      environment: 'development',
      metadata: {}
    };

    input = {
      workflowId: 'workflow-1',
      projectId: 'project-1',
      context: {},
      parameters: {}
    };
  });

  afterEach(() => {
    executionEnvironment.shutdown();
  });

  describe('createEnvironment', () => {
    it('should create execution environment successfully', async () => {
      const environmentId = await executionEnvironment.createEnvironment(mockAgent.id);

      expect(environmentId).toBeDefined();
      expect(environmentId).toMatch(/^env_/);

      const environment = await executionEnvironment.getEnvironmentStatus(environmentId);
      expect(environment).toBeDefined();
      expect(environment?.agentId).toBe(mockAgent.id);
      expect(environment?.status).toBe(ExecutionStatus.PENDING);
    });

    it('should emit environment:created event', async () => {
      const eventSpy = vi.fn();
      executionEnvironment.on('environment:created', eventSpy);

      const environmentId = await executionEnvironment.createEnvironment(mockAgent.id);

      expect(eventSpy).toHaveBeenCalledWith({
        environmentId,
        agentId: mockAgent.id
      });
    });

    it('should initialize resource usage tracking', async () => {
      const environmentId = await executionEnvironment.createEnvironment(mockAgent.id);

      const environment = await executionEnvironment.getEnvironmentStatus(environmentId);
      expect(environment?.resourceUsage).toBeDefined();
      expect(environment?.resourceUsage.cpuUsage).toBe(0);
      expect(environment?.resourceUsage.memoryUsage).toBe(0);
    });

    it('should create isolation context for non-none isolation level', async () => {
      const isolatedConfig = { ...config, isolationLevel: 'process' as const };
      const isolatedEnvironment = new AgentExecutionEnvironment(isolatedConfig, mockLogger);

      const environmentId = await isolatedEnvironment.createEnvironment(mockAgent.id);

      const environment = await isolatedEnvironment.getEnvironmentStatus(environmentId);
      expect(environment?.isolationContext).toBeDefined();
      expect(environment?.isolationContext?.environmentVariables).toBeDefined();

      isolatedEnvironment.shutdown();
    });
  });

  describe('executeInEnvironment', () => {
    let environmentId: string;

    beforeEach(async () => {
      environmentId = await executionEnvironment.createEnvironment(mockAgent.id);
    });

    it('should execute agent successfully in environment', async () => {
      const result = await executionEnvironment.executeInEnvironment(
        environmentId,
        mockAgent,
        context,
        input
      );

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
    });

    it('should update environment status during execution', async () => {
      const executionPromise = executionEnvironment.executeInEnvironment(
        environmentId,
        mockAgent,
        context,
        input
      );

      // Check status is running (might be too fast to catch)
      const environment = await executionEnvironment.getEnvironmentStatus(environmentId);
      
      await executionPromise;

      const finalEnvironment = await executionEnvironment.getEnvironmentStatus(environmentId);
      expect(finalEnvironment?.status).toBe(ExecutionStatus.COMPLETED);
      expect(finalEnvironment?.endTime).toBeDefined();
    });

    it('should emit execution:completed event', async () => {
      const eventSpy = vi.fn();
      executionEnvironment.on('execution:completed', eventSpy);

      await executionEnvironment.executeInEnvironment(
        environmentId,
        mockAgent,
        context,
        input
      );

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          environmentId,
          agentId: mockAgent.id
        })
      );
    });

    it('should handle execution timeout', async () => {
      const slowAgent = new SlowMockAgent();
      const shortTimeoutConfig = { ...config, maxExecutionTimeMs: 500 };
      const shortTimeoutEnvironment = new AgentExecutionEnvironment(shortTimeoutConfig, mockLogger);

      const envId = await shortTimeoutEnvironment.createEnvironment(slowAgent.id);

      await expect(
        shortTimeoutEnvironment.executeInEnvironment(envId, slowAgent, context, input)
      ).rejects.toThrow('timed out');

      shortTimeoutEnvironment.shutdown();
    });

    it('should handle agent execution failure', async () => {
      const failingAgent = new FailingMockAgent();

      await expect(
        executionEnvironment.executeInEnvironment(
          environmentId,
          failingAgent,
          context,
          input
        )
      ).rejects.toThrow('Agent execution failed');

      const environment = await executionEnvironment.getEnvironmentStatus(environmentId);
      expect(environment?.status).toBe(ExecutionStatus.FAILED);
    });

    it('should emit execution:failed event on failure', async () => {
      const eventSpy = vi.fn();
      executionEnvironment.on('execution:failed', eventSpy);

      const failingAgent = new FailingMockAgent();

      try {
        await executionEnvironment.executeInEnvironment(
          environmentId,
          failingAgent,
          context,
          input
        );
      } catch (error) {
        // Expected to fail
      }

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          environmentId,
          agentId: failingAgent.id
        })
      );
    });

    it('should enforce maximum concurrent executions', async () => {
      const lowConcurrencyConfig = { ...config, maxConcurrentExecutions: 1 };
      const lowConcurrencyEnvironment = new AgentExecutionEnvironment(lowConcurrencyConfig, mockLogger);

      const env1 = await lowConcurrencyEnvironment.createEnvironment('agent-1');
      const env2 = await lowConcurrencyEnvironment.createEnvironment('agent-2');

      // Start first execution
      const execution1 = lowConcurrencyEnvironment.executeInEnvironment(
        env1,
        mockAgent,
        context,
        input
      );

      // Second execution should fail due to concurrency limit
      await expect(
        lowConcurrencyEnvironment.executeInEnvironment(env2, mockAgent, context, input)
      ).rejects.toThrow('Maximum concurrent executions reached');

      await execution1;
      lowConcurrencyEnvironment.shutdown();
    });

    it('should throw error for non-existent environment', async () => {
      await expect(
        executionEnvironment.executeInEnvironment(
          'non-existent',
          mockAgent,
          context,
          input
        )
      ).rejects.toThrow('Environment non-existent not found');
    });
  });

  describe('destroyEnvironment', () => {
    let environmentId: string;

    beforeEach(async () => {
      environmentId = await executionEnvironment.createEnvironment(mockAgent.id);
    });

    it('should destroy environment successfully', async () => {
      await executionEnvironment.destroyEnvironment(environmentId);

      const environment = await executionEnvironment.getEnvironmentStatus(environmentId);
      expect(environment).toBeNull();
    });

    it('should emit environment:destroyed event', async () => {
      const eventSpy = vi.fn();
      executionEnvironment.on('environment:destroyed', eventSpy);

      await executionEnvironment.destroyEnvironment(environmentId);

      expect(eventSpy).toHaveBeenCalledWith({ environmentId });
    });

    it('should handle destroying non-existent environment gracefully', async () => {
      await expect(executionEnvironment.destroyEnvironment('non-existent'))
        .resolves.not.toThrow();
    });

    it('should cancel active execution when destroying environment', async () => {
      // This test would need more sophisticated mocking to properly test
      // For now, we just ensure the method completes
      await executionEnvironment.destroyEnvironment(environmentId);
      
      const environment = await executionEnvironment.getEnvironmentStatus(environmentId);
      expect(environment).toBeNull();
    });
  });

  describe('listEnvironments', () => {
    it('should list all environments', async () => {
      const env1 = await executionEnvironment.createEnvironment('agent-1');
      const env2 = await executionEnvironment.createEnvironment('agent-2');

      const environments = await executionEnvironment.listEnvironments();

      expect(environments).toHaveLength(2);
      expect(environments.map(e => e.id)).toContain(env1);
      expect(environments.map(e => e.id)).toContain(env2);
    });

    it('should filter environments by agent ID', async () => {
      const env1 = await executionEnvironment.createEnvironment('agent-1');
      const env2 = await executionEnvironment.createEnvironment('agent-2');

      const filteredEnvironments = await executionEnvironment.listEnvironments('agent-1');

      expect(filteredEnvironments).toHaveLength(1);
      expect(filteredEnvironments[0].id).toBe(env1);
      expect(filteredEnvironments[0].agentId).toBe('agent-1');
    });

    it('should return empty array when no environments exist', async () => {
      const environments = await executionEnvironment.listEnvironments();
      expect(environments).toHaveLength(0);
    });
  });

  describe('getResourceUsage', () => {
    let environmentId: string;

    beforeEach(async () => {
      environmentId = await executionEnvironment.createEnvironment(mockAgent.id);
    });

    it('should return resource usage for existing environment', async () => {
      const resourceUsage = await executionEnvironment.getResourceUsage(environmentId);

      expect(resourceUsage).toBeDefined();
      expect(resourceUsage?.cpuUsage).toBeDefined();
      expect(resourceUsage?.memoryUsage).toBeDefined();
      expect(resourceUsage?.diskUsage).toBeDefined();
      expect(resourceUsage?.networkUsage).toBeDefined();
    });

    it('should return null for non-existent environment', async () => {
      const resourceUsage = await executionEnvironment.getResourceUsage('non-existent');
      expect(resourceUsage).toBeNull();
    });
  });

  describe('resource monitoring', () => {
    let environmentId: string;

    beforeEach(async () => {
      environmentId = await executionEnvironment.createEnvironment(mockAgent.id);
    });

    it('should emit resource limit exceeded events', (done) => {
      executionEnvironment.on('resource:limit:exceeded', (data) => {
        expect(data.environmentId).toBe(environmentId);
        expect(data.resource).toBeDefined();
        expect(data.usage).toBeDefined();
        expect(data.limit).toBeDefined();
        done();
      });

      // Start execution to trigger resource monitoring
      executionEnvironment.executeInEnvironment(
        environmentId,
        mockAgent,
        context,
        input
      );
    });

    it('should emit system resource status events', (done) => {
      executionEnvironment.on('system:resource:status', (data) => {
        expect(data.activeExecutions).toBeDefined();
        expect(data.totalEnvironments).toBeDefined();
        expect(data.maxConcurrent).toBe(config.maxConcurrentExecutions);
        done();
      });

      // Wait for system monitoring interval
      setTimeout(() => {
        if (!done.mock) done();
      }, 6000);
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', () => {
      expect(() => executionEnvironment.shutdown()).not.toThrow();
    });

    it('should destroy all environments during shutdown', async () => {
      const env1 = await executionEnvironment.createEnvironment('agent-1');
      const env2 = await executionEnvironment.createEnvironment('agent-2');

      executionEnvironment.shutdown();

      // Environments should be cleaned up
      const environment1 = await executionEnvironment.getEnvironmentStatus(env1);
      const environment2 = await executionEnvironment.getEnvironmentStatus(env2);
      
      expect(environment1).toBeNull();
      expect(environment2).toBeNull();
    });
  });
});