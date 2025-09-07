import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  AgentDistributionService, 
  AgentDistributionServiceConfig,
  DEFAULT_AGENT_DISTRIBUTION_CONFIG 
} from '../agent-distribution/agent-distribution-service';
import { DistributionStrategy } from '../agent-distribution/task-distributor';
import { Logger } from '@devflow/shared-utils';

// Mock timers
vi.useFakeTimers();

describe('AgentDistributionService', () => {
  let service: AgentDistributionService;
  let mockLogger: vi.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    service = new AgentDistributionService(mockLogger);
  });

  afterEach(async () => {
    await service.stop();
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const config = service.getConfig();
      expect(config).toEqual(DEFAULT_AGENT_DISTRIBUTION_CONFIG);
    });

    it('should initialize with custom configuration', () => {
      const customConfig: Partial<AgentDistributionServiceConfig> = {
        distributionStrategy: DistributionStrategy.ROUND_ROBIN,
        maxRetries: 5,
        taskTimeout: 60000
      };

      const customService = new AgentDistributionService(mockLogger, customConfig);
      const config = customService.getConfig();

      expect(config).toMatchObject(customConfig);
      expect(config.enableLoadBalancing).toBe(DEFAULT_AGENT_DISTRIBUTION_CONFIG.enableLoadBalancing);
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith('Agent distribution service initialized', {
        config: DEFAULT_AGENT_DISTRIBUTION_CONFIG
      });
    });
  });

  describe('component access', () => {
    it('should provide access to agent manager', () => {
      const agentManager = service.getAgentManager();
      expect(agentManager).toBeDefined();
      expect(typeof agentManager.registerAgent).toBe('function');
    });

    it('should provide access to task distributor', () => {
      const taskDistributor = service.getTaskDistributor();
      expect(taskDistributor).toBeDefined();
      expect(typeof taskDistributor.submitTask).toBe('function');
    });

    it('should provide access to agent coordinator', () => {
      const agentCoordinator = service.getAgentCoordinator();
      expect(agentCoordinator).toBeDefined();
      expect(typeof agentCoordinator.coordinateWorkflowExecution).toBe('function');
    });

    it('should provide access to agent step executor', () => {
      const agentStepExecutor = service.getAgentStepExecutor();
      expect(agentStepExecutor).toBeDefined();
      expect(typeof agentStepExecutor.execute).toBe('function');
    });
  });

  describe('service lifecycle', () => {
    it('should start service successfully', async () => {
      await service.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting agent distribution service');
      expect(mockLogger.info).toHaveBeenCalledWith('Agent distribution service started successfully');
    });

    it('should stop service successfully', async () => {
      await service.start();
      await service.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping agent distribution service');
      expect(mockLogger.info).toHaveBeenCalledWith('Agent distribution service stopped');
    });

    it('should handle multiple start/stop cycles', async () => {
      await service.start();
      await service.stop();
      await service.start();
      await service.stop();

      expect(mockLogger.info).toHaveBeenCalledTimes(9); // Multiple service operations
    });
  });

  describe('health checks', () => {
    it('should perform health checks at configured intervals', async () => {
      const agentManager = service.getAgentManager();
      const performHealthCheckSpy = vi.spyOn(agentManager, 'performHealthCheck');

      await service.start();

      // Fast-forward time to trigger health check
      vi.advanceTimersByTime(DEFAULT_AGENT_DISTRIBUTION_CONFIG.healthCheckInterval);

      expect(performHealthCheckSpy).toHaveBeenCalledTimes(1);

      // Fast-forward again
      vi.advanceTimersByTime(DEFAULT_AGENT_DISTRIBUTION_CONFIG.healthCheckInterval);

      expect(performHealthCheckSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle health check errors gracefully', async () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'performHealthCheck').mockImplementation(() => {
        throw new Error('Health check failed');
      });

      await service.start();

      // Fast-forward time to trigger health check
      vi.advanceTimersByTime(DEFAULT_AGENT_DISTRIBUTION_CONFIG.healthCheckInterval);

      expect(mockLogger.error).toHaveBeenCalledWith('Health check failed', {
        error: 'Health check failed'
      });
    });

    it('should warn about offline agents', async () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'getAgentStatistics').mockReturnValue({
        total: 5,
        available: 3,
        busy: 0,
        offline: 2,
        maintenance: 0
      });

      await service.start();

      // Fast-forward time to trigger health check
      vi.advanceTimersByTime(DEFAULT_AGENT_DISTRIBUTION_CONFIG.healthCheckInterval);

      expect(mockLogger.warn).toHaveBeenCalledWith('Health check detected offline agents', {
        totalAgents: 5,
        offlineAgents: 2
      });
    });
  });

  describe('cleanup', () => {
    it('should perform cleanup at configured intervals', async () => {
      const agentCoordinator = service.getAgentCoordinator() as any;
      const cleanupSpy = vi.spyOn(agentCoordinator, 'cleanupCompletedWorkflows');

      await service.start();

      // Fast-forward time to trigger cleanup
      vi.advanceTimersByTime(DEFAULT_AGENT_DISTRIBUTION_CONFIG.cleanupInterval);

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup errors gracefully', async () => {
      const agentCoordinator = service.getAgentCoordinator() as any;
      vi.spyOn(agentCoordinator, 'cleanupCompletedWorkflows').mockImplementation(() => {
        throw new Error('Cleanup failed');
      });

      await service.start();

      // Fast-forward time to trigger cleanup
      vi.advanceTimersByTime(DEFAULT_AGENT_DISTRIBUTION_CONFIG.cleanupInterval);

      expect(mockLogger.error).toHaveBeenCalledWith('Cleanup failed', {
        error: 'Cleanup failed'
      });
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      const newConfig: Partial<AgentDistributionServiceConfig> = {
        distributionStrategy: DistributionStrategy.PRIORITY_BASED,
        maxRetries: 5
      };

      service.updateConfig(newConfig);

      const config = service.getConfig();
      expect(config.distributionStrategy).toBe(DistributionStrategy.PRIORITY_BASED);
      expect(config.maxRetries).toBe(5);
      expect(config.enableLoadBalancing).toBe(DEFAULT_AGENT_DISTRIBUTION_CONFIG.enableLoadBalancing);
    });

    it('should log configuration updates', () => {
      const newConfig: Partial<AgentDistributionServiceConfig> = {
        taskTimeout: 120000
      };

      service.updateConfig(newConfig);

      expect(mockLogger.info).toHaveBeenCalledWith('Agent distribution service configuration updated', {
        oldConfig: DEFAULT_AGENT_DISTRIBUTION_CONFIG,
        newConfig: { ...DEFAULT_AGENT_DISTRIBUTION_CONFIG, ...newConfig }
      });
    });

    it('should restart health check timer when interval changes', async () => {
      await service.start();

      const newConfig: Partial<AgentDistributionServiceConfig> = {
        healthCheckInterval: 30000
      };

      service.updateConfig(newConfig);

      // Verify new interval is used
      const agentManager = service.getAgentManager();
      const performHealthCheckSpy = vi.spyOn(agentManager, 'performHealthCheck');

      vi.advanceTimersByTime(30000);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(1);
    });

    it('should restart cleanup timer when interval changes', async () => {
      await service.start();

      const newConfig: Partial<AgentDistributionServiceConfig> = {
        cleanupInterval: 60000
      };

      service.updateConfig(newConfig);

      // Verify new interval is used
      const agentCoordinator = service.getAgentCoordinator() as any;
      const cleanupSpy = vi.spyOn(agentCoordinator, 'cleanupCompletedWorkflows');

      vi.advanceTimersByTime(60000);
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statistics', () => {
    it('should return comprehensive service statistics', () => {
      const stats = service.getServiceStatistics();

      expect(stats).toHaveProperty('agents');
      expect(stats).toHaveProperty('tasks');
      expect(stats).toHaveProperty('config');
      expect(stats).toHaveProperty('uptime');

      expect(stats.config).toEqual(DEFAULT_AGENT_DISTRIBUTION_CONFIG);
      expect(typeof stats.uptime).toBe('number');
    });
  });

  describe('health status', () => {
    it('should return healthy status with no agents', () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'getAgentStatistics').mockReturnValue({
        total: 0,
        available: 0,
        busy: 0,
        offline: 0,
        maintenance: 0
      });

      const taskDistributor = service.getTaskDistributor();
      vi.spyOn(taskDistributor, 'getDistributionStatistics').mockReturnValue({
        totalTasks: 0,
        pendingTasks: 0,
        assignedTasks: 0,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        queueLength: 0,
        activeAssignments: 0
      });

      const health = service.getHealthStatus();

      expect(health.status).toBe('unhealthy'); // No agents available
      expect(health.agents.total).toBe(0);
      expect(health.lastHealthCheck).toBeInstanceOf(Date);
    });

    it('should return healthy status with all agents online', () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'getAgentStatistics').mockReturnValue({
        total: 5,
        available: 4,
        busy: 1,
        offline: 0,
        maintenance: 0
      });

      const taskDistributor = service.getTaskDistributor();
      vi.spyOn(taskDistributor, 'getDistributionStatistics').mockReturnValue({
        totalTasks: 100,
        pendingTasks: 5,
        assignedTasks: 10,
        runningTasks: 15,
        completedTasks: 65,
        failedTasks: 5,
        queueLength: 5,
        activeAssignments: 25
      });

      const health = service.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.agents.total).toBe(5);
      expect(health.agents.offline).toBe(0);
    });

    it('should return degraded status with some agents offline', () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'getAgentStatistics').mockReturnValue({
        total: 5,
        available: 3,
        busy: 1,
        offline: 1,
        maintenance: 0
      });

      const taskDistributor = service.getTaskDistributor();
      vi.spyOn(taskDistributor, 'getDistributionStatistics').mockReturnValue({
        totalTasks: 100,
        pendingTasks: 5,
        assignedTasks: 10,
        runningTasks: 15,
        completedTasks: 65,
        failedTasks: 5,
        queueLength: 5,
        activeAssignments: 25
      });

      const health = service.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.agents.offline).toBe(1);
    });

    it('should return unhealthy status with majority agents offline', () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'getAgentStatistics').mockReturnValue({
        total: 5,
        available: 1,
        busy: 1,
        offline: 3,
        maintenance: 0
      });

      const taskDistributor = service.getTaskDistributor();
      vi.spyOn(taskDistributor, 'getDistributionStatistics').mockReturnValue({
        totalTasks: 100,
        pendingTasks: 5,
        assignedTasks: 10,
        runningTasks: 15,
        completedTasks: 65,
        failedTasks: 5,
        queueLength: 5,
        activeAssignments: 25
      });

      const health = service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.agents.offline).toBe(3);
    });

    it('should return degraded status with high failure rate', () => {
      const agentManager = service.getAgentManager();
      vi.spyOn(agentManager, 'getAgentStatistics').mockReturnValue({
        total: 5,
        available: 4,
        busy: 1,
        offline: 0,
        maintenance: 0
      });

      const taskDistributor = service.getTaskDistributor();
      vi.spyOn(taskDistributor, 'getDistributionStatistics').mockReturnValue({
        totalTasks: 100,
        pendingTasks: 5,
        assignedTasks: 10,
        runningTasks: 15,
        completedTasks: 50,
        failedTasks: 20, // High failure rate (40%)
        queueLength: 5,
        activeAssignments: 25
      });

      const health = service.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.tasks.failed).toBe(20);
    });
  });
});