import { 
  AutomationEngine,
  AIAgent, 
  AgentExecution,
  AgentContext,
  AgentInput,
  AgentResult,
  HookContext, 
  HookResult, 
  AutomatedTask, 
  PerformanceMetrics,
  UUID 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { AgentManager } from './agent-manager';
import { AgentDiscoveryService, AgentDiscoveryConfig } from './agent-discovery';
import { 
  AgentExecutionEnvironment, 
  ExecutionEnvironmentConfig 
} from './agent-execution-environment';
import { HookManager, TaskScheduler } from './interfaces';
import { AutomationConfiguration } from './types';
import { EventEmitter } from 'events';

export interface AutomationServiceConfig {
  automation: AutomationConfiguration;
  discovery: AgentDiscoveryConfig;
  execution: ExecutionEnvironmentConfig;
}

export class AutomationService extends EventEmitter implements AutomationEngine {
  private agentManager: AgentManager;
  private discoveryService: AgentDiscoveryService;
  private executionEnvironment: AgentExecutionEnvironment;
  private hookManager: HookManager;
  private taskScheduler: TaskScheduler;
  private logger: Logger;
  private config: AutomationServiceConfig;

  constructor(
    config: AutomationServiceConfig,
    hookManager: HookManager,
    taskScheduler: TaskScheduler,
    logger: Logger
  ) {
    super();
    this.config = config;
    this.hookManager = hookManager;
    this.taskScheduler = taskScheduler;
    this.logger = logger;

    // Initialize core components
    this.agentManager = new AgentManager(config.automation, logger);
    this.discoveryService = new AgentDiscoveryService(config.discovery, logger);
    this.executionEnvironment = new AgentExecutionEnvironment(config.execution, logger);

    this.setupEventHandlers();
    
    this.logger.info('Automation service initialized');
  }

  async registerAgent(agent: AIAgent): Promise<void> {
    try {
      this.logger.info('Registering agent with automation service', { 
        agentId: agent.id, 
        type: agent.type 
      });

      // Register with agent manager
      await this.agentManager.register(agent);
      
      // Register with discovery service
      await this.discoveryService.registerAgent(agent);
      
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

  async unregisterAgent(agentId: UUID): Promise<void> {
    try {
      this.logger.info('Unregistering agent from automation service', { agentId });

      // Unregister from discovery service
      await this.discoveryService.unregisterAgent(agentId);
      
      // Unregister from agent manager
      await this.agentManager.unregister(agentId);
      
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

  async executeAgent(
    agentId: UUID, 
    context: AgentContext, 
    input: AgentInput
  ): Promise<AgentResult> {
    try {
      this.logger.info('Executing agent', { agentId, workflowId: context.workflowId });

      const agent = await this.agentManager.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Create execution environment
      const environmentId = await this.executionEnvironment.createEnvironment(agentId);
      
      try {
        // Execute in isolated environment
        const result = await this.executionEnvironment.executeInEnvironment(
          environmentId,
          agent,
          context,
          input
        );
        
        this.emit('agent:executed', { 
          agentId, 
          workflowId: context.workflowId,
          success: result.status === 'completed'
        });
        
        return result;
        
      } finally {
        // Clean up environment
        await this.executionEnvironment.destroyEnvironment(environmentId);
      }
      
    } catch (error) {
      this.logger.error('Agent execution failed', { 
        agentId, 
        workflowId: context.workflowId,
        error: error.message 
      });
      
      this.emit('agent:execution:failed', { 
        agentId, 
        workflowId: context.workflowId,
        error: error.message 
      });
      
      throw error;
    }
  }

  async executeHook(hookId: UUID, context: HookContext): Promise<HookResult> {
    try {
      this.logger.info('Executing hook', { hookId, event: context.event });

      const result = await this.hookManager.triggerHook(hookId, context);
      
      this.emit('hook:executed', { 
        hookId, 
        event: context.event,
        success: result.success 
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('Hook execution failed', { 
        hookId, 
        error: error.message 
      });
      
      this.emit('hook:execution:failed', { 
        hookId, 
        error: error.message 
      });
      
      throw error;
    }
  }

  async scheduleTask(task: AutomatedTask): Promise<void> {
    try {
      this.logger.info('Scheduling automated task', { 
        taskId: task.id, 
        agentId: task.agentId 
      });

      await this.taskScheduler.scheduleTask(task);
      
      this.emit('task:scheduled', { 
        taskId: task.id, 
        agentId: task.agentId 
      });
      
    } catch (error) {
      this.logger.error('Failed to schedule task', { 
        taskId: task.id, 
        error: error.message 
      });
      throw error;
    }
  }

  async monitorAgentPerformance(agentId: UUID): Promise<PerformanceMetrics> {
    try {
      const metrics = await this.agentManager.getPerformanceMetrics(agentId);
      if (!metrics) {
        throw new Error(`No performance metrics found for agent ${agentId}`);
      }
      
      return metrics;
      
    } catch (error) {
      this.logger.error('Failed to get agent performance metrics', { 
        agentId, 
        error: error.message 
      });
      throw error;
    }
  }

  async getAgentExecutions(agentId: UUID, limit?: number): Promise<AgentExecution[]> {
    // This would typically query a database
    // For now, return empty array as this is handled by the orchestration service
    this.logger.debug('Getting agent executions', { agentId, limit });
    return [];
  }

  async discoverAgentsForCapabilities(capabilities: string[]): Promise<UUID[]> {
    try {
      const agents = await this.discoveryService.matchAgents(capabilities);
      
      this.logger.info('Discovered agents for capabilities', { 
        capabilities, 
        agentCount: agents.length 
      });
      
      return agents;
      
    } catch (error) {
      this.logger.error('Failed to discover agents', { 
        capabilities, 
        error: error.message 
      });
      throw error;
    }
  }

  async getAgentHealth(agentId: UUID): Promise<any> {
    try {
      const health = await this.agentManager.getAgentHealth(agentId);
      return health;
      
    } catch (error) {
      this.logger.error('Failed to get agent health', { 
        agentId, 
        error: error.message 
      });
      throw error;
    }
  }

  async restartAgent(agentId: UUID): Promise<void> {
    try {
      this.logger.info('Restarting agent', { agentId });

      await this.agentManager.restartAgent(agentId);
      
      this.emit('agent:restarted', { agentId });
      
      this.logger.info('Agent restarted successfully', { agentId });
      
    } catch (error) {
      this.logger.error('Failed to restart agent', { 
        agentId, 
        error: error.message 
      });
      throw error;
    }
  }

  async getSystemMetrics(): Promise<any> {
    return {
      registeredAgents: this.discoveryService.getRegisteredAgentCount(),
      activeAgents: this.discoveryService.getActiveAgentCount(),
      capabilityIndex: this.discoveryService.getCapabilityIndexSize(),
      activeExecutions: (await this.executionEnvironment.listEnvironments()).length
    };
  }

  private setupEventHandlers(): void {
    // Agent manager events
    this.agentManager.on('agent:registered', (data) => {
      this.emit('agent:lifecycle:registered', data);
    });

    this.agentManager.on('agent:unregistered', (data) => {
      this.emit('agent:lifecycle:unregistered', data);
    });

    this.agentManager.on('agent:unhealthy', (data) => {
      this.emit('agent:health:degraded', data);
      // Auto-restart unhealthy agents
      this.restartAgent(data.agentId).catch(error => {
        this.logger.error('Failed to auto-restart unhealthy agent', { 
          agentId: data.agentId, 
          error: error.message 
        });
      });
    });

    this.agentManager.on('execution:completed', (data) => {
      this.emit('agent:execution:completed', data);
    });

    this.agentManager.on('execution:failed', (data) => {
      this.emit('agent:execution:failed', data);
    });

    // Execution environment events
    this.executionEnvironment.on('environment:created', (data) => {
      this.emit('execution:environment:created', data);
    });

    this.executionEnvironment.on('environment:destroyed', (data) => {
      this.emit('execution:environment:destroyed', data);
    });

    this.executionEnvironment.on('resource:limit:exceeded', (data) => {
      this.emit('execution:resource:limit:exceeded', data);
      this.logger.warn('Resource limit exceeded in execution environment', data);
    });

    this.executionEnvironment.on('system:resource:status', (data) => {
      this.emit('system:resource:status', data);
    });
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down automation service');

    try {
      // Shutdown components in reverse order
      this.executionEnvironment.shutdown();
      this.agentManager.shutdown();
      
      this.logger.info('Automation service shutdown completed');
      
    } catch (error) {
      this.logger.error('Error during automation service shutdown', { 
        error: error.message 
      });
      throw error;
    }
  }
}