import { Logger } from '@devflow/shared-utils';
import { AgentManager } from './agent-manager';
import { TaskDistributor, DistributionConfig, DistributionStrategy } from './task-distributor';
import { WorkflowAgentCoordinatorImpl, WorkflowAgentCoordinator } from './workflow-agent-coordinator';
import { AgentStepExecutor } from './agent-step-executor';

export interface AgentDistributionServiceConfig {
  distributionStrategy: DistributionStrategy;
  enableLoadBalancing: boolean;
  enableFailover: boolean;
  maxRetries: number;
  taskTimeout: number;
  agentHeartbeatTimeout: number;
  healthCheckInterval: number;
  cleanupInterval: number;
}

export const DEFAULT_AGENT_DISTRIBUTION_CONFIG: AgentDistributionServiceConfig = {
  distributionStrategy: DistributionStrategy.LEAST_LOADED,
  enableLoadBalancing: true,
  enableFailover: true,
  maxRetries: 3,
  taskTimeout: 300000, // 5 minutes
  agentHeartbeatTimeout: 30000, // 30 seconds
  healthCheckInterval: 60000, // 1 minute
  cleanupInterval: 300000 // 5 minutes
};

export class AgentDistributionService {
  private agentManager: AgentManager;
  private taskDistributor: TaskDistributor;
  private agentCoordinator: WorkflowAgentCoordinator;
  private agentStepExecutor: AgentStepExecutor;
  private logger: Logger;
  private config: AgentDistributionServiceConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(logger: Logger, config: Partial<AgentDistributionServiceConfig> = {}) {
    this.logger = logger;
    this.config = { ...DEFAULT_AGENT_DISTRIBUTION_CONFIG, ...config };

    // Initialize components
    this.agentManager = new AgentManager(logger, this.config.agentHeartbeatTimeout);
    
    const distributionConfig: DistributionConfig = {
      strategy: this.config.distributionStrategy,
      enableLoadBalancing: this.config.enableLoadBalancing,
      enableFailover: this.config.enableFailover,
      maxRetries: this.config.maxRetries,
      taskTimeout: this.config.taskTimeout
    };
    
    this.taskDistributor = new TaskDistributor(this.agentManager, logger, distributionConfig);
    this.agentCoordinator = new WorkflowAgentCoordinatorImpl(
      this.agentManager,
      this.taskDistributor,
      logger
    );
    this.agentStepExecutor = new AgentStepExecutor(this.agentCoordinator, logger);

    this.logger.info('Agent distribution service initialized', {
      config: this.config
    });
  }

  /**
   * Start the agent distribution service
   */
  async start(): Promise<void> {
    this.logger.info('Starting agent distribution service');

    // Start health check timer
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);

    this.logger.info('Agent distribution service started successfully');
  }

  /**
   * Stop the agent distribution service
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping agent distribution service');

    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    this.logger.info('Agent distribution service stopped');
  }

  /**
   * Get the agent manager instance
   */
  getAgentManager(): AgentManager {
    return this.agentManager;
  }

  /**
   * Get the task distributor instance
   */
  getTaskDistributor(): TaskDistributor {
    return this.taskDistributor;
  }

  /**
   * Get the workflow agent coordinator instance
   */
  getAgentCoordinator(): WorkflowAgentCoordinator {
    return this.agentCoordinator;
  }

  /**
   * Get the agent step executor instance
   */
  getAgentStepExecutor(): AgentStepExecutor {
    return this.agentStepExecutor;
  }

  /**
   * Get service configuration
   */
  getConfig(): AgentDistributionServiceConfig {
    return { ...this.config };
  }

  /**
   * Update service configuration
   */
  updateConfig(newConfig: Partial<AgentDistributionServiceConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    this.logger.info('Agent distribution service configuration updated', {
      oldConfig,
      newConfig: this.config
    });

    // Restart timers if intervals changed
    if (oldConfig.healthCheckInterval !== this.config.healthCheckInterval) {
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = setInterval(() => {
          this.performHealthCheck();
        }, this.config.healthCheckInterval);
      }
    }

    if (oldConfig.cleanupInterval !== this.config.cleanupInterval) {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = setInterval(() => {
          this.performCleanup();
        }, this.config.cleanupInterval);
      }
    }
  }

  /**
   * Get comprehensive service statistics
   */
  getServiceStatistics(): {
    agents: ReturnType<AgentManager['getAgentStatistics']>;
    tasks: ReturnType<TaskDistributor['getDistributionStatistics']>;
    config: AgentDistributionServiceConfig;
    uptime: number;
  } {
    return {
      agents: this.agentManager.getAgentStatistics(),
      tasks: this.taskDistributor.getDistributionStatistics(),
      config: this.config,
      uptime: process.uptime()
    };
  }

  /**
   * Perform health check on all agents
   */
  private performHealthCheck(): void {
    try {
      this.agentManager.performHealthCheck();
      
      const stats = this.agentManager.getAgentStatistics();
      if (stats.offline > 0) {
        this.logger.warn('Health check detected offline agents', {
          totalAgents: stats.total,
          offlineAgents: stats.offline
        });
      }
    } catch (error) {
      this.logger.error('Health check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Perform cleanup of completed workflows and tasks
   */
  private performCleanup(): void {
    try {
      // Clean up completed workflow tasks
      (this.agentCoordinator as WorkflowAgentCoordinatorImpl).cleanupCompletedWorkflows();
      
      this.logger.debug('Cleanup completed successfully');
    } catch (error) {
      this.logger.error('Cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get health status of the service
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: {
      total: number;
      available: number;
      offline: number;
    };
    tasks: {
      pending: number;
      running: number;
      failed: number;
    };
    lastHealthCheck: Date;
  } {
    const agentStats = this.agentManager.getAgentStatistics();
    const taskStats = this.taskDistributor.getDistributionStatistics();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Determine health status based on agent and task metrics
    if (agentStats.total === 0) {
      status = 'unhealthy'; // No agents available
    } else if (agentStats.offline > agentStats.total * 0.5) {
      status = 'unhealthy'; // More than 50% agents offline
    } else if (agentStats.offline > 0 || taskStats.failedTasks > taskStats.completedTasks * 0.1) {
      status = 'degraded'; // Some agents offline or high failure rate
    }

    return {
      status,
      agents: {
        total: agentStats.total,
        available: agentStats.available,
        offline: agentStats.offline
      },
      tasks: {
        pending: taskStats.pendingTasks,
        running: taskStats.runningTasks,
        failed: taskStats.failedTasks
      },
      lastHealthCheck: new Date()
    };
  }
}