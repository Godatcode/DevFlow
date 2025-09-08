import { HealthStatus, HealthCheck, MonitoringConfig } from './interfaces.js';

export class HealthChecker {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private config: MonitoringConfig;
  private startTime: Date;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.startTime = new Date();
  }

  /**
   * Register a health check function
   */
  registerCheck(name: string, checkFn: () => Promise<HealthCheck>): void {
    this.checks.set(name, checkFn);
  }

  /**
   * Execute all health checks and return overall status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Execute all registered checks
    for (const [name, checkFn] of this.checks) {
      try {
        const startTime = Date.now();
        const check = await checkFn();
        const duration = Date.now() - startTime;
        
        checks.push({
          ...check,
          name,
          duration
        });

        // Determine overall status
        if (check.status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (check.status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        checks.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 0
        });
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date(),
      service: this.config.serviceName,
      version: this.config.version,
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  /**
   * Create a database connectivity check
   */
  createDatabaseCheck(name: string, testConnection: () => Promise<boolean>): () => Promise<HealthCheck> {
    return async (): Promise<HealthCheck> => {
      try {
        const isConnected = await testConnection();
        return {
          name,
          status: isConnected ? 'pass' : 'fail',
          message: isConnected ? 'Database connection successful' : 'Database connection failed'
        };
      } catch (error) {
        return {
          name,
          status: 'fail',
          message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    };
  }

  /**
   * Create a memory usage check
   */
  createMemoryCheck(warningThreshold: number = 0.8, criticalThreshold: number = 0.9): () => Promise<HealthCheck> {
    return async (): Promise<HealthCheck> => {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const memoryRatio = usedMemory / totalMemory;

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `Memory usage: ${Math.round(memoryRatio * 100)}%`;

      if (memoryRatio >= criticalThreshold) {
        status = 'fail';
        message += ' (Critical)';
      } else if (memoryRatio >= warningThreshold) {
        status = 'warn';
        message += ' (Warning)';
      }

      return {
        name: 'memory',
        status,
        message,
        metadata: {
          heapUsed: usedMemory,
          heapTotal: totalMemory,
          ratio: memoryRatio
        }
      };
    };
  }

  /**
   * Create an external service dependency check
   */
  createExternalServiceCheck(
    name: string, 
    url: string, 
    timeout: number = 5000
  ): () => Promise<HealthCheck> {
    return async (): Promise<HealthCheck> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          signal: controller.signal,
          method: 'GET'
        });

        clearTimeout(timeoutId);

        const isHealthy = response.ok;
        return {
          name,
          status: isHealthy ? 'pass' : 'fail',
          message: `External service ${name}: ${response.status} ${response.statusText}`,
          metadata: {
            url,
            statusCode: response.status,
            responseTime: Date.now()
          }
        };
      } catch (error) {
        return {
          name,
          status: 'fail',
          message: `External service ${name} check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          metadata: { url }
        };
      }
    };
  }
}