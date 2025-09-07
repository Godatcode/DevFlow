import { 
  AIAgent, 
  AgentContext, 
  AgentInput, 
  AgentResult, 
  ExecutionStatus,
  UUID 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { EventEmitter } from 'events';

export interface ExecutionEnvironmentConfig {
  maxMemoryMB: number;
  maxExecutionTimeMs: number;
  maxConcurrentExecutions: number;
  isolationLevel: 'none' | 'process' | 'container';
  resourceLimits: {
    cpu: number; // CPU percentage limit
    memory: number; // Memory limit in MB
    disk: number; // Disk I/O limit in MB/s
  };
}

export interface ExecutionEnvironment {
  id: UUID;
  agentId: UUID;
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  resourceUsage: ResourceUsage;
  isolationContext?: IsolationContext;
}

export interface ResourceUsage {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkUsage: number;
}

export interface IsolationContext {
  processId?: number;
  containerId?: string;
  sandboxPath?: string;
  environmentVariables: Record<string, string>;
}

export class AgentExecutionEnvironment extends EventEmitter {
  private environments: Map<UUID, ExecutionEnvironment> = new Map();
  private activeExecutions: Map<UUID, Promise<AgentResult>> = new Map();
  private logger: Logger;
  private config: ExecutionEnvironmentConfig;
  private resourceMonitor: NodeJS.Timeout | null = null;

  constructor(config: ExecutionEnvironmentConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.startResourceMonitoring();
  }

  async createEnvironment(agentId: UUID): Promise<UUID> {
    const environmentId = this.generateEnvironmentId();
    
    this.logger.info('Creating execution environment', { 
      environmentId, 
      agentId,
      isolationLevel: this.config.isolationLevel 
    });

    const environment: ExecutionEnvironment = {
      id: environmentId,
      agentId,
      status: ExecutionStatus.PENDING,
      startTime: new Date(),
      resourceUsage: {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        networkUsage: 0
      }
    };

    // Set up isolation context based on configuration
    if (this.config.isolationLevel !== 'none') {
      environment.isolationContext = await this.createIsolationContext(environmentId);
    }

    this.environments.set(environmentId, environment);
    
    this.emit('environment:created', { environmentId, agentId });
    
    this.logger.info('Execution environment created', { environmentId, agentId });
    
    return environmentId;
  }

  async executeInEnvironment(
    environmentId: UUID,
    agent: AIAgent,
    context: AgentContext,
    input: AgentInput
  ): Promise<AgentResult> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new Error(`Environment ${environmentId} not found`);
    }

    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }

    this.logger.info('Starting agent execution in environment', { 
      environmentId, 
      agentId: agent.id 
    });

    // Update environment status
    environment.status = ExecutionStatus.RUNNING;
    environment.startTime = new Date();

    try {
      // Create execution promise with resource monitoring
      const executionPromise = this.executeWithResourceLimits(
        environment,
        agent,
        context,
        input
      );

      this.activeExecutions.set(environmentId, executionPromise);
      
      const result = await executionPromise;
      
      // Update environment status
      environment.status = ExecutionStatus.COMPLETED;
      environment.endTime = new Date();
      
      this.emit('execution:completed', { 
        environmentId, 
        agentId: agent.id, 
        duration: environment.endTime.getTime() - environment.startTime.getTime() 
      });
      
      this.logger.info('Agent execution completed in environment', { 
        environmentId, 
        agentId: agent.id 
      });
      
      return result;
      
    } catch (error) {
      environment.status = ExecutionStatus.FAILED;
      environment.endTime = new Date();
      
      this.emit('execution:failed', { 
        environmentId, 
        agentId: agent.id, 
        error: error.message 
      });
      
      this.logger.error('Agent execution failed in environment', { 
        environmentId, 
        agentId: agent.id, 
        error: error.message 
      });
      
      throw error;
      
    } finally {
      this.activeExecutions.delete(environmentId);
    }
  }

  async destroyEnvironment(environmentId: UUID): Promise<void> {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      this.logger.warn('Attempted to destroy non-existent environment', { environmentId });
      return;
    }

    this.logger.info('Destroying execution environment', { environmentId });

    // Cancel active execution if running
    const activeExecution = this.activeExecutions.get(environmentId);
    if (activeExecution) {
      // Note: In a real implementation, you'd need to properly cancel the execution
      this.activeExecutions.delete(environmentId);
    }

    // Clean up isolation context
    if (environment.isolationContext) {
      await this.cleanupIsolationContext(environment.isolationContext);
    }

    this.environments.delete(environmentId);
    
    this.emit('environment:destroyed', { environmentId });
    
    this.logger.info('Execution environment destroyed', { environmentId });
  }

  async getEnvironmentStatus(environmentId: UUID): Promise<ExecutionEnvironment | null> {
    return this.environments.get(environmentId) || null;
  }

  async listEnvironments(agentId?: UUID): Promise<ExecutionEnvironment[]> {
    const environments = Array.from(this.environments.values());
    
    if (agentId) {
      return environments.filter(env => env.agentId === agentId);
    }
    
    return environments;
  }

  async getResourceUsage(environmentId: UUID): Promise<ResourceUsage | null> {
    const environment = this.environments.get(environmentId);
    return environment?.resourceUsage || null;
  }

  private async executeWithResourceLimits(
    environment: ExecutionEnvironment,
    agent: AIAgent,
    context: AgentContext,
    input: AgentInput
  ): Promise<AgentResult> {
    // Set up resource monitoring for this execution
    const resourceMonitor = this.createResourceMonitor(environment);
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Execution timed out after ${this.config.maxExecutionTimeMs}ms`));
        }, this.config.maxExecutionTimeMs);
      });

      // Execute agent with timeout
      const result = await Promise.race([
        this.executeAgentSafely(agent, context, input, environment),
        timeoutPromise
      ]);

      return result;
      
    } finally {
      // Clean up resource monitor
      if (resourceMonitor) {
        clearInterval(resourceMonitor);
      }
    }
  }

  private async executeAgentSafely(
    agent: AIAgent,
    context: AgentContext,
    input: AgentInput,
    environment: ExecutionEnvironment
  ): Promise<AgentResult> {
    try {
      // In a real implementation, this would execute in the isolated environment
      // For now, we'll execute directly but with monitoring
      const result = await agent.execute(context, input);
      
      return result;
      
    } catch (error) {
      // Enhance error with environment context
      const enhancedError = new Error(
        `Agent execution failed in environment ${environment.id}: ${error.message}`
      );
      enhancedError.stack = error.stack;
      throw enhancedError;
    }
  }

  private createResourceMonitor(environment: ExecutionEnvironment): NodeJS.Timeout {
    return setInterval(() => {
      // In a real implementation, this would monitor actual resource usage
      // For now, we'll simulate resource usage
      const usage = this.simulateResourceUsage();
      
      environment.resourceUsage = usage;
      
      // Check resource limits
      if (usage.memoryUsage > this.config.resourceLimits.memory) {
        this.emit('resource:limit:exceeded', { 
          environmentId: environment.id, 
          resource: 'memory',
          usage: usage.memoryUsage,
          limit: this.config.resourceLimits.memory
        });
      }
      
      if (usage.cpuUsage > this.config.resourceLimits.cpu) {
        this.emit('resource:limit:exceeded', { 
          environmentId: environment.id, 
          resource: 'cpu',
          usage: usage.cpuUsage,
          limit: this.config.resourceLimits.cpu
        });
      }
      
    }, 1000); // Monitor every second
  }

  private simulateResourceUsage(): ResourceUsage {
    // In a real implementation, this would get actual resource usage
    return {
      cpuUsage: Math.random() * 50, // 0-50% CPU
      memoryUsage: Math.random() * 100, // 0-100 MB memory
      diskUsage: Math.random() * 10, // 0-10 MB/s disk
      networkUsage: Math.random() * 5 // 0-5 MB/s network
    };
  }

  private async createIsolationContext(environmentId: UUID): Promise<IsolationContext> {
    const context: IsolationContext = {
      environmentVariables: {
        AGENT_ENVIRONMENT_ID: environmentId,
        AGENT_ISOLATION_LEVEL: this.config.isolationLevel,
        NODE_ENV: 'agent_execution'
      }
    };

    switch (this.config.isolationLevel) {
      case 'process':
        // In a real implementation, this would create a separate process
        context.processId = process.pid; // Placeholder
        break;
        
      case 'container':
        // In a real implementation, this would create a Docker container
        context.containerId = `agent_${environmentId}`;
        break;
    }

    return context;
  }

  private async cleanupIsolationContext(context: IsolationContext): Promise<void> {
    // In a real implementation, this would clean up processes/containers
    this.logger.debug('Cleaning up isolation context', { context });
  }

  private startResourceMonitoring(): void {
    this.resourceMonitor = setInterval(() => {
      // Monitor overall system resources
      const activeCount = this.activeExecutions.size;
      const totalEnvironments = this.environments.size;
      
      this.emit('system:resource:status', {
        activeExecutions: activeCount,
        totalEnvironments,
        maxConcurrent: this.config.maxConcurrentExecutions
      });
      
    }, 5000); // Monitor every 5 seconds
  }

  private generateEnvironmentId(): UUID {
    return `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public shutdown(): void {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
      this.resourceMonitor = null;
    }
    
    // Destroy all environments
    const environmentIds = Array.from(this.environments.keys());
    for (const environmentId of environmentIds) {
      this.destroyEnvironment(environmentId).catch(error => {
        this.logger.error('Error destroying environment during shutdown', { 
          environmentId, 
          error: error.message 
        });
      });
    }
    
    this.logger.info('Agent execution environment shutdown completed');
  }
}