import { UUID } from '@devflow/shared-types';

export interface DisasterRecoverySystem {
  createRollbackPlan(deploymentId: UUID, config: RollbackConfig): Promise<RollbackPlan>;
  executeRollback(planId: UUID): Promise<RollbackExecution>;
  monitorDeployment(deploymentId: UUID, triggers: RollbackTrigger[]): Promise<void>;
  getRecoveryStatus(deploymentId: UUID): Promise<RecoveryStatus>;
}

export interface RollbackConfig {
  strategy: RollbackStrategy;
  timeout: number; // in seconds
  healthChecks: HealthCheck[];
  rollbackTriggers: RollbackTrigger[];
  notifications: NotificationConfig[];
  dataBackup: DataBackupConfig;
}

export enum RollbackStrategy {
  BLUE_GREEN = 'blue_green',
  ROLLING = 'rolling',
  CANARY = 'canary',
  IMMEDIATE = 'immediate'
}

export interface HealthCheck {
  id: UUID;
  name: string;
  type: HealthCheckType;
  endpoint?: string;
  command?: string;
  expectedResponse?: any;
  timeout: number;
  interval: number;
  retries: number;
  criticalityLevel: 'low' | 'medium' | 'high' | 'critical';
}

export enum HealthCheckType {
  HTTP = 'http',
  TCP = 'tcp',
  COMMAND = 'command',
  DATABASE = 'database',
  CUSTOM = 'custom'
}

export interface RollbackTrigger {
  id: UUID;
  name: string;
  type: TriggerType;
  condition: TriggerCondition;
  threshold: number;
  timeWindow: number; // in seconds
  enabled: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export enum TriggerType {
  ERROR_RATE = 'error_rate',
  RESPONSE_TIME = 'response_time',
  HEALTH_CHECK_FAILURE = 'health_check_failure',
  RESOURCE_USAGE = 'resource_usage',
  CUSTOM_METRIC = 'custom_metric',
  MANUAL = 'manual'
}

export interface TriggerCondition {
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  metric: string;
}

export interface NotificationConfig {
  channel: 'slack' | 'email' | 'webhook' | 'sms';
  recipients: string[];
  events: NotificationEvent[];
  template?: string;
}

export enum NotificationEvent {
  ROLLBACK_TRIGGERED = 'rollback_triggered',
  ROLLBACK_STARTED = 'rollback_started',
  ROLLBACK_COMPLETED = 'rollback_completed',
  ROLLBACK_FAILED = 'rollback_failed',
  HEALTH_CHECK_FAILED = 'health_check_failed'
}

export interface DataBackupConfig {
  enabled: boolean;
  strategy: 'snapshot' | 'incremental' | 'full';
  retentionPeriod: number; // in days
  encryptionEnabled: boolean;
  verificationEnabled: boolean;
}

export interface RollbackPlan {
  id: UUID;
  deploymentId: UUID;
  strategy: RollbackStrategy;
  steps: RollbackStep[];
  estimatedDuration: number;
  healthChecks: HealthCheck[];
  triggers: RollbackTrigger[];
  createdAt: Date;
  status: RollbackPlanStatus;
}

export enum RollbackPlanStatus {
  CREATED = 'created',
  ACTIVE = 'active',
  TRIGGERED = 'triggered',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface RollbackStep {
  id: UUID;
  name: string;
  type: RollbackStepType;
  commands: string[];
  timeout: number;
  retryConfig: RetryConfig;
  dependencies: UUID[];
  rollbackCommands: string[];
  validationChecks: ValidationCheck[];
}

export enum RollbackStepType {
  TRAFFIC_SWITCH = 'traffic_switch',
  SERVICE_STOP = 'service_stop',
  SERVICE_START = 'service_start',
  DATABASE_RESTORE = 'database_restore',
  FILE_RESTORE = 'file_restore',
  CONFIGURATION_RESTORE = 'configuration_restore',
  CACHE_CLEAR = 'cache_clear',
  NOTIFICATION = 'notification',
  VALIDATION = 'validation'
}

export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential';
  initialDelay: number;
  maxDelay: number;
}

export interface ValidationCheck {
  id: UUID;
  name: string;
  type: 'health_check' | 'smoke_test' | 'integration_test';
  command: string;
  expectedResult: any;
  timeout: number;
  required: boolean;
}

export interface RollbackExecution {
  id: UUID;
  planId: UUID;
  status: RollbackExecutionStatus;
  steps: RollbackStepResult[];
  startedAt: Date;
  completedAt?: Date;
  duration: number;
  triggeredBy: string;
  reason: string;
  metrics: RollbackMetrics;
}

export enum RollbackExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PARTIALLY_COMPLETED = 'partially_completed'
}

export interface RollbackStepResult {
  stepId: UUID;
  status: RollbackExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  duration: number;
  output: string;
  error?: string;
  retryCount: number;
  validationResults: ValidationResult[];
}

export interface ValidationResult {
  checkId: UUID;
  status: 'passed' | 'failed' | 'skipped';
  result: any;
  error?: string;
  duration: number;
}

export interface RollbackMetrics {
  totalDuration: number;
  stepsExecuted: number;
  stepsSuccessful: number;
  stepsFailed: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
  dataIntegrityVerified: boolean;
  serviceAvailability: number; // percentage
}

export interface RecoveryStatus {
  deploymentId: UUID;
  status: RecoveryStatusType;
  healthScore: number; // 0-100
  activeIssues: Issue[];
  lastRollback?: RollbackExecution;
  uptime: number; // in seconds
  metrics: DeploymentMetrics;
}

export enum RecoveryStatusType {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  CRITICAL = 'critical',
  RECOVERING = 'recovering',
  FAILED = 'failed'
}

export interface Issue {
  id: UUID;
  type: IssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  resolvedAt?: Date;
  affectedComponents: string[];
}

export enum IssueType {
  SERVICE_DOWN = 'service_down',
  HIGH_ERROR_RATE = 'high_error_rate',
  SLOW_RESPONSE = 'slow_response',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  DATA_CORRUPTION = 'data_corruption',
  CONFIGURATION_ERROR = 'configuration_error'
}

export interface DeploymentMetrics {
  errorRate: number;
  responseTime: number;
  throughput: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency: number;
}

export class IntelligentDisasterRecoverySystem implements DisasterRecoverySystem {
  private rollbackPlans: Map<UUID, RollbackPlan> = new Map();
  private rollbackExecutions: Map<UUID, RollbackExecution> = new Map();
  private deploymentMonitors: Map<UUID, DeploymentMonitor> = new Map();

  async createRollbackPlan(deploymentId: UUID, config: RollbackConfig): Promise<RollbackPlan> {
    const steps = await this.generateRollbackSteps(config.strategy, deploymentId);
    const estimatedDuration = this.calculateEstimatedDuration(steps);

    const plan: RollbackPlan = {
      id: this.generateId(),
      deploymentId,
      strategy: config.strategy,
      steps,
      estimatedDuration,
      healthChecks: config.healthChecks,
      triggers: config.rollbackTriggers,
      createdAt: new Date(),
      status: RollbackPlanStatus.CREATED
    };

    this.rollbackPlans.set(plan.id, plan);
    return plan;
  }

  async executeRollback(planId: UUID): Promise<RollbackExecution> {
    const plan = this.rollbackPlans.get(planId);
    if (!plan) {
      throw new Error(`Rollback plan ${planId} not found`);
    }

    const execution: RollbackExecution = {
      id: this.generateId(),
      planId,
      status: RollbackExecutionStatus.RUNNING,
      steps: [],
      startedAt: new Date(),
      duration: 0,
      triggeredBy: 'system',
      reason: 'Automated rollback triggered',
      metrics: {
        totalDuration: 0,
        stepsExecuted: 0,
        stepsSuccessful: 0,
        stepsFailed: 0,
        healthChecksPassed: 0,
        healthChecksFailed: 0,
        dataIntegrityVerified: false,
        serviceAvailability: 0
      }
    };

    this.rollbackExecutions.set(execution.id, execution);

    try {
      // Update plan status
      plan.status = RollbackPlanStatus.EXECUTING;

      // Execute rollback steps
      const stepResults = await this.executeRollbackSteps(plan.steps, plan.healthChecks);
      
      execution.steps = stepResults;
      execution.status = this.determineExecutionStatus(stepResults);
      execution.completedAt = new Date();
      execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
      execution.metrics = this.calculateRollbackMetrics(stepResults);

      // Update plan status
      plan.status = execution.status === RollbackExecutionStatus.COMPLETED 
        ? RollbackPlanStatus.COMPLETED 
        : RollbackPlanStatus.FAILED;

      // Send notifications
      await this.sendRollbackNotifications(execution, plan);

    } catch (error) {
      execution.status = RollbackExecutionStatus.FAILED;
      execution.completedAt = new Date();
      execution.duration = execution.completedAt.getTime() - execution.startedAt.getTime();
      plan.status = RollbackPlanStatus.FAILED;
    }

    return execution;
  }

  async monitorDeployment(deploymentId: UUID, triggers: RollbackTrigger[]): Promise<void> {
    const monitor = new DeploymentMonitor(deploymentId, triggers, this);
    this.deploymentMonitors.set(deploymentId, monitor);
    await monitor.start();
  }

  async getRecoveryStatus(deploymentId: UUID): Promise<RecoveryStatus> {
    const monitor = this.deploymentMonitors.get(deploymentId);
    const metrics = await this.collectDeploymentMetrics(deploymentId);
    const healthScore = this.calculateHealthScore(metrics);
    const activeIssues = await this.detectActiveIssues(deploymentId, metrics);

    return {
      deploymentId,
      status: this.determineRecoveryStatus(healthScore, activeIssues),
      healthScore,
      activeIssues,
      lastRollback: this.getLastRollbackExecution(deploymentId),
      uptime: monitor?.getUptime() || 0,
      metrics
    };
  }

  private async generateRollbackSteps(strategy: RollbackStrategy, deploymentId: UUID): Promise<RollbackStep[]> {
    const steps: RollbackStep[] = [];

    switch (strategy) {
      case RollbackStrategy.BLUE_GREEN:
        steps.push(...this.generateBlueGreenRollbackSteps(deploymentId));
        break;
      case RollbackStrategy.ROLLING:
        steps.push(...this.generateRollingRollbackSteps(deploymentId));
        break;
      case RollbackStrategy.CANARY:
        steps.push(...this.generateCanaryRollbackSteps(deploymentId));
        break;
      case RollbackStrategy.IMMEDIATE:
        steps.push(...this.generateImmediateRollbackSteps(deploymentId));
        break;
    }

    return steps;
  }

  private generateBlueGreenRollbackSteps(deploymentId: UUID): RollbackStep[] {
    return [
      {
        id: this.generateId(),
        name: 'Switch Traffic to Previous Version',
        type: RollbackStepType.TRAFFIC_SWITCH,
        commands: [
          'kubectl patch service app-service -p \'{"spec":{"selector":{"version":"previous"}}}\'',
          'nginx -s reload'
        ],
        timeout: 30,
        retryConfig: { maxAttempts: 3, backoffStrategy: 'exponential', initialDelay: 1000, maxDelay: 5000 },
        dependencies: [],
        rollbackCommands: [
          'kubectl patch service app-service -p \'{"spec":{"selector":{"version":"current"}}}\''
        ],
        validationChecks: [
          {
            id: this.generateId(),
            name: 'Verify Traffic Switch',
            type: 'health_check',
            command: 'curl -f http://app-service/health',
            expectedResult: { status: 'healthy' },
            timeout: 10,
            required: true
          }
        ]
      },
      {
        id: this.generateId(),
        name: 'Stop Current Version Services',
        type: RollbackStepType.SERVICE_STOP,
        commands: [
          'kubectl scale deployment app-current --replicas=0',
          'docker-compose -f docker-compose.current.yml down'
        ],
        timeout: 60,
        retryConfig: { maxAttempts: 2, backoffStrategy: 'linear', initialDelay: 2000, maxDelay: 10000 },
        dependencies: [],
        rollbackCommands: [
          'kubectl scale deployment app-current --replicas=3'
        ],
        validationChecks: []
      },
      {
        id: this.generateId(),
        name: 'Verify System Health',
        type: RollbackStepType.VALIDATION,
        commands: [
          'health-check-script.sh',
          'smoke-test-suite.sh'
        ],
        timeout: 120,
        retryConfig: { maxAttempts: 1, backoffStrategy: 'linear', initialDelay: 0, maxDelay: 0 },
        dependencies: [],
        rollbackCommands: [],
        validationChecks: [
          {
            id: this.generateId(),
            name: 'System Health Check',
            type: 'health_check',
            command: 'comprehensive-health-check.sh',
            expectedResult: { overall: 'healthy' },
            timeout: 60,
            required: true
          }
        ]
      }
    ];
  }

  private generateRollingRollbackSteps(deploymentId: UUID): RollbackStep[] {
    return [
      {
        id: this.generateId(),
        name: 'Rolling Rollback to Previous Version',
        type: RollbackStepType.SERVICE_START,
        commands: [
          'kubectl rollout undo deployment/app-deployment',
          'kubectl rollout status deployment/app-deployment --timeout=300s'
        ],
        timeout: 300,
        retryConfig: { maxAttempts: 2, backoffStrategy: 'exponential', initialDelay: 5000, maxDelay: 15000 },
        dependencies: [],
        rollbackCommands: [
          'kubectl rollout undo deployment/app-deployment'
        ],
        validationChecks: [
          {
            id: this.generateId(),
            name: 'Verify Rolling Update',
            type: 'health_check',
            command: 'kubectl get pods -l app=app-deployment',
            expectedResult: { ready: true },
            timeout: 30,
            required: true
          }
        ]
      }
    ];
  }

  private generateCanaryRollbackSteps(deploymentId: UUID): RollbackStep[] {
    return [
      {
        id: this.generateId(),
        name: 'Remove Canary Traffic',
        type: RollbackStepType.TRAFFIC_SWITCH,
        commands: [
          'kubectl patch virtualservice app-vs -p \'{"spec":{"http":[{"route":[{"destination":{"host":"app-service","subset":"stable"},"weight":100}]}]}}\'',
          'istio-proxy-reload.sh'
        ],
        timeout: 30,
        retryConfig: { maxAttempts: 3, backoffStrategy: 'linear', initialDelay: 2000, maxDelay: 5000 },
        dependencies: [],
        rollbackCommands: [],
        validationChecks: [
          {
            id: this.generateId(),
            name: 'Verify Traffic Routing',
            type: 'smoke_test',
            command: 'canary-traffic-test.sh',
            expectedResult: { canary_traffic: 0 },
            timeout: 15,
            required: true
          }
        ]
      },
      {
        id: this.generateId(),
        name: 'Scale Down Canary Deployment',
        type: RollbackStepType.SERVICE_STOP,
        commands: [
          'kubectl scale deployment app-canary --replicas=0'
        ],
        timeout: 60,
        retryConfig: { maxAttempts: 2, backoffStrategy: 'linear', initialDelay: 3000, maxDelay: 8000 },
        dependencies: [],
        rollbackCommands: [],
        validationChecks: []
      }
    ];
  }

  private generateImmediateRollbackSteps(deploymentId: UUID): RollbackStep[] {
    return [
      {
        id: this.generateId(),
        name: 'Immediate Service Restart',
        type: RollbackStepType.SERVICE_START,
        commands: [
          'systemctl stop app-service',
          'restore-previous-version.sh',
          'systemctl start app-service'
        ],
        timeout: 60,
        retryConfig: { maxAttempts: 1, backoffStrategy: 'linear', initialDelay: 0, maxDelay: 0 },
        dependencies: [],
        rollbackCommands: [],
        validationChecks: [
          {
            id: this.generateId(),
            name: 'Service Health Check',
            type: 'health_check',
            command: 'systemctl is-active app-service',
            expectedResult: 'active',
            timeout: 10,
            required: true
          }
        ]
      }
    ];
  }

  private calculateEstimatedDuration(steps: RollbackStep[]): number {
    return steps.reduce((total, step) => total + step.timeout, 0);
  }

  private async executeRollbackSteps(steps: RollbackStep[], healthChecks: HealthCheck[]): Promise<RollbackStepResult[]> {
    const results: RollbackStepResult[] = [];

    for (const step of steps) {
      const result = await this.executeRollbackStep(step);
      results.push(result);

      // If a critical step fails, stop execution
      if (result.status === RollbackExecutionStatus.FAILED && step.validationChecks.some(check => check.required)) {
        break;
      }

      // Run health checks after each step
      await this.runHealthChecks(healthChecks);
    }

    return results;
  }

  private async executeRollbackStep(step: RollbackStep): Promise<RollbackStepResult> {
    const startTime = new Date();
    let attempt = 0;
    let lastError: string | undefined;

    while (attempt < step.retryConfig.maxAttempts) {
      try {
        // Execute step commands
        const output = await this.executeCommands(step.commands, step.timeout);
        
        // Run validation checks
        const validationResults = await this.runValidationChecks(step.validationChecks);
        
        const allValidationsPassed = validationResults.every(result => 
          result.status === 'passed' || !step.validationChecks.find(check => check.id === result.checkId)?.required
        );

        if (allValidationsPassed) {
          return {
            stepId: step.id,
            status: RollbackExecutionStatus.COMPLETED,
            startedAt: startTime,
            completedAt: new Date(),
            duration: Date.now() - startTime.getTime(),
            output,
            retryCount: attempt,
            validationResults
          };
        } else {
          lastError = 'Validation checks failed';
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      attempt++;
      
      if (attempt < step.retryConfig.maxAttempts) {
        const delay = this.calculateRetryDelay(attempt, step.retryConfig);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      stepId: step.id,
      status: RollbackExecutionStatus.FAILED,
      startedAt: startTime,
      completedAt: new Date(),
      duration: Date.now() - startTime.getTime(),
      output: '',
      error: lastError,
      retryCount: attempt - 1,
      validationResults: []
    };
  }

  private async executeCommands(commands: string[], timeout: number): Promise<string> {
    // Mock command execution - in real implementation, would execute actual commands
    await new Promise(resolve => setTimeout(resolve, Math.min(timeout * 100, 1000))); // Simulate execution
    return `Executed commands: ${commands.join(', ')}`;
  }

  private async runValidationChecks(checks: ValidationCheck[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const check of checks) {
      const startTime = Date.now();
      try {
        // Mock validation - in real implementation, would run actual checks
        const success = Math.random() > 0.1; // 90% success rate
        
        results.push({
          checkId: check.id,
          status: success ? 'passed' : 'failed',
          result: success ? check.expectedResult : null,
          error: success ? undefined : 'Validation failed',
          duration: Date.now() - startTime
        });
      } catch (error) {
        results.push({
          checkId: check.id,
          status: 'failed',
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime
        });
      }
    }

    return results;
  }

  private async runHealthChecks(healthChecks: HealthCheck[]): Promise<void> {
    // Mock health check execution
    for (const check of healthChecks) {
      // Simulate health check
      await new Promise(resolve => setTimeout(resolve, check.interval));
    }
  }

  private calculateRetryDelay(attempt: number, retryConfig: RetryConfig): number {
    if (retryConfig.backoffStrategy === 'exponential') {
      return Math.min(retryConfig.initialDelay * Math.pow(2, attempt), retryConfig.maxDelay);
    } else {
      return Math.min(retryConfig.initialDelay * attempt, retryConfig.maxDelay);
    }
  }

  private determineExecutionStatus(stepResults: RollbackStepResult[]): RollbackExecutionStatus {
    if (stepResults.length === 0) return RollbackExecutionStatus.PENDING;
    
    const failedSteps = stepResults.filter(result => result.status === RollbackExecutionStatus.FAILED);
    const completedSteps = stepResults.filter(result => result.status === RollbackExecutionStatus.COMPLETED);
    
    if (failedSteps.length > 0 && completedSteps.length > 0) {
      return RollbackExecutionStatus.PARTIALLY_COMPLETED;
    } else if (failedSteps.length > 0) {
      return RollbackExecutionStatus.FAILED;
    } else if (completedSteps.length === stepResults.length) {
      return RollbackExecutionStatus.COMPLETED;
    } else {
      return RollbackExecutionStatus.RUNNING;
    }
  }

  private calculateRollbackMetrics(stepResults: RollbackStepResult[]): RollbackMetrics {
    const totalDuration = stepResults.reduce((sum, result) => sum + result.duration, 0);
    const stepsExecuted = stepResults.length;
    const stepsSuccessful = stepResults.filter(result => result.status === RollbackExecutionStatus.COMPLETED).length;
    const stepsFailed = stepResults.filter(result => result.status === RollbackExecutionStatus.FAILED).length;
    
    const allValidationResults = stepResults.flatMap(result => result.validationResults);
    const healthChecksPassed = allValidationResults.filter(result => result.status === 'passed').length;
    const healthChecksFailed = allValidationResults.filter(result => result.status === 'failed').length;
    
    return {
      totalDuration,
      stepsExecuted,
      stepsSuccessful,
      stepsFailed,
      healthChecksPassed,
      healthChecksFailed,
      dataIntegrityVerified: true, // Mock value
      serviceAvailability: stepsSuccessful > 0 ? (stepsSuccessful / stepsExecuted) * 100 : 0
    };
  }

  private async sendRollbackNotifications(execution: RollbackExecution, plan: RollbackPlan): Promise<void> {
    // Mock notification sending
    console.log(`Rollback notification: Execution ${execution.id} ${execution.status}`);
  }

  private async collectDeploymentMetrics(deploymentId: UUID): Promise<DeploymentMetrics> {
    // Mock metrics collection
    return {
      errorRate: Math.random() * 5, // 0-5%
      responseTime: 100 + Math.random() * 200, // 100-300ms
      throughput: 1000 + Math.random() * 500, // 1000-1500 req/s
      cpuUsage: 20 + Math.random() * 60, // 20-80%
      memoryUsage: 30 + Math.random() * 50, // 30-80%
      diskUsage: 40 + Math.random() * 40, // 40-80%
      networkLatency: 10 + Math.random() * 20 // 10-30ms
    };
  }

  private calculateHealthScore(metrics: DeploymentMetrics): number {
    let score = 100;
    
    // Penalize high error rate
    if (metrics.errorRate > 1) score -= metrics.errorRate * 10;
    
    // Penalize slow response time
    if (metrics.responseTime > 200) score -= (metrics.responseTime - 200) / 10;
    
    // Penalize high resource usage
    if (metrics.cpuUsage > 80) score -= (metrics.cpuUsage - 80) * 2;
    if (metrics.memoryUsage > 80) score -= (metrics.memoryUsage - 80) * 2;
    
    return Math.max(0, Math.min(100, score));
  }

  private async detectActiveIssues(deploymentId: UUID, metrics: DeploymentMetrics): Promise<Issue[]> {
    const issues: Issue[] = [];
    
    if (metrics.errorRate > 5) {
      issues.push({
        id: this.generateId(),
        type: IssueType.HIGH_ERROR_RATE,
        severity: 'high',
        description: `Error rate is ${metrics.errorRate.toFixed(2)}%, exceeding threshold of 5%`,
        detectedAt: new Date(),
        affectedComponents: ['api-service']
      });
    }
    
    if (metrics.responseTime > 500) {
      issues.push({
        id: this.generateId(),
        type: IssueType.SLOW_RESPONSE,
        severity: 'medium',
        description: `Response time is ${metrics.responseTime.toFixed(0)}ms, exceeding threshold of 500ms`,
        detectedAt: new Date(),
        affectedComponents: ['api-service']
      });
    }
    
    return issues;
  }

  private determineRecoveryStatus(healthScore: number, activeIssues: Issue[]): RecoveryStatusType {
    if (activeIssues.some(issue => issue.severity === 'critical')) {
      return RecoveryStatusType.CRITICAL;
    } else if (healthScore < 50) {
      return RecoveryStatusType.FAILED;
    } else if (healthScore < 80 || activeIssues.length > 0) {
      return RecoveryStatusType.DEGRADED;
    } else {
      return RecoveryStatusType.HEALTHY;
    }
  }

  private getLastRollbackExecution(deploymentId: UUID): RollbackExecution | undefined {
    // Find the most recent rollback execution for this deployment
    const executions = Array.from(this.rollbackExecutions.values())
      .filter(execution => {
        const plan = this.rollbackPlans.get(execution.planId);
        return plan?.deploymentId === deploymentId;
      })
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    
    return executions[0];
  }

  private generateId(): UUID {
    return crypto.randomUUID() as UUID;
  }
}

class DeploymentMonitor {
  private isRunning = false;
  private startTime = Date.now();

  constructor(
    private deploymentId: UUID,
    private triggers: RollbackTrigger[],
    private recoverySystem: IntelligentDisasterRecoverySystem
  ) {}

  async start(): Promise<void> {
    this.isRunning = true;
    this.startTime = Date.now();
    
    // Start monitoring loop
    this.monitorLoop();
  }

  stop(): void {
    this.isRunning = false;
  }

  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  private async monitorLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.checkTriggers();
        await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
      } catch (error) {
        console.error('Error in monitoring loop:', error);
      }
    }
  }

  private async checkTriggers(): Promise<void> {
    for (const trigger of this.triggers) {
      if (!trigger.enabled) continue;
      
      const shouldTrigger = await this.evaluateTrigger(trigger);
      if (shouldTrigger) {
        await this.triggerRollback(trigger);
        break; // Only trigger one rollback at a time
      }
    }
  }

  private async evaluateTrigger(trigger: RollbackTrigger): Promise<boolean> {
    // Mock trigger evaluation - in real implementation, would check actual metrics
    const currentValue = Math.random() * 100;
    
    switch (trigger.condition.operator) {
      case 'gt': return currentValue > trigger.condition.value;
      case 'gte': return currentValue >= trigger.condition.value;
      case 'lt': return currentValue < trigger.condition.value;
      case 'lte': return currentValue <= trigger.condition.value;
      case 'eq': return currentValue === trigger.condition.value;
      default: return false;
    }
  }

  private async triggerRollback(trigger: RollbackTrigger): Promise<void> {
    console.log(`Rollback triggered by: ${trigger.name} for deployment ${this.deploymentId}`);
    // In real implementation, would trigger actual rollback
  }
}