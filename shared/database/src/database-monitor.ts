import { DatabaseMonitor, DatabaseMetrics, SlowQuery } from './interfaces';
import { PostgresConnectionPool } from './connection-pool';
import { PostgresDatabaseOptimizer } from './database-optimizer';
import { Logger } from './mocks/shared-utils';

export class PostgresDatabaseMonitor implements DatabaseMonitor {
  private logger: Logger;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private slowQueryCallbacks: ((query: SlowQuery) => void)[] = [];
  private connectionIssueCallbacks: ((error: Error) => void)[] = [];
  private slowQueryThreshold: number;

  constructor(
    private connectionPool: PostgresConnectionPool,
    private optimizer: PostgresDatabaseOptimizer,
    options: {
      slowQueryThreshold?: number;
      monitoringInterval?: number;
    } = {}
  ) {
    this.logger = new Logger('PostgresDatabaseMonitor');
    this.slowQueryThreshold = options.slowQueryThreshold || 1000; // 1 second
  }

  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Database monitoring already started');
      return;
    }

    this.isMonitoring = true;
    
    // Start periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, 30000); // Every 30 seconds

    // Monitor connection pool events
    this.setupConnectionMonitoring();

    this.logger.info('Database monitoring started', {
      slowQueryThreshold: this.slowQueryThreshold
    });
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.logger.info('Database monitoring stopped');
  }

  async getMetrics(): Promise<DatabaseMetrics> {
    return await this.optimizer.getMetrics();
  }

  onSlowQuery(callback: (query: SlowQuery) => void): void {
    this.slowQueryCallbacks.push(callback);
  }

  onConnectionIssue(callback: (error: Error) => void): void {
    this.connectionIssueCallbacks.push(callback);
  }

  // Monitor a query execution
  async monitorQuery<T>(
    query: string, 
    parameters: any[] | undefined,
    executor: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await executor();
      const executionTime = Date.now() - startTime;
      
      // Check if query is slow
      if (executionTime > this.slowQueryThreshold) {
        const slowQuery: SlowQuery = {
          query,
          executionTime,
          timestamp: new Date(),
          parameters
        };
        
        this.optimizer.recordSlowQuery(query, executionTime, parameters);
        this.notifySlowQuery(slowQuery);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.logger.error('Query execution failed', {
        query: query.substring(0, 200) + '...',
        executionTime,
        error: (error as Error).message
      });
      
      throw error;
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.getMetrics();
      
      // Log metrics
      this.logger.info('Database metrics collected', {
        activeConnections: metrics.activeConnections,
        totalConnections: metrics.totalConnections,
        queriesExecuted: metrics.queriesExecuted,
        slowQueries: metrics.slowQueries,
        averageQueryTime: metrics.averageQueryTime,
        connectionPoolUtilization: metrics.connectionPoolUtilization
      });

      // Check for potential issues
      this.checkForIssues(metrics);
      
    } catch (error) {
      this.logger.error('Failed to collect database metrics', { error });
    }
  }

  private checkForIssues(metrics: DatabaseMetrics): void {
    // Check connection pool utilization
    if (metrics.connectionPoolUtilization > 0.9) {
      this.logger.warn('High connection pool utilization', {
        utilization: metrics.connectionPoolUtilization
      });
    }

    // Check for too many slow queries
    if (metrics.slowQueries > 10) {
      this.logger.warn('High number of slow queries detected', {
        slowQueries: metrics.slowQueries
      });
    }

    // Check average query time
    if (metrics.averageQueryTime > 500) {
      this.logger.warn('High average query time', {
        averageQueryTime: metrics.averageQueryTime
      });
    }
  }

  private setupConnectionMonitoring(): void {
    // This would typically involve setting up event listeners
    // on the connection pool for various events
    this.logger.debug('Connection monitoring setup complete');
  }

  private notifySlowQuery(slowQuery: SlowQuery): void {
    for (const callback of this.slowQueryCallbacks) {
      try {
        callback(slowQuery);
      } catch (error) {
        this.logger.error('Error in slow query callback', { error });
      }
    }
  }

  private notifyConnectionIssue(error: Error): void {
    for (const callback of this.connectionIssueCallbacks) {
      try {
        callback(error);
      } catch (callbackError) {
        this.logger.error('Error in connection issue callback', { error: callbackError });
      }
    }
  }

  // Get database statistics
  async getDatabaseStats(): Promise<{
    databaseSize: string;
    tableCount: number;
    indexCount: number;
    connectionCount: number;
  }> {
    try {
      const client = await this.connectionPool.acquire();
      
      try {
        // Get database size
        const sizeResult = await client.query(`
          SELECT pg_size_pretty(pg_database_size(current_database())) as size
        `);
        
        // Get table count
        const tableResult = await client.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        
        // Get index count
        const indexResult = await client.query(`
          SELECT COUNT(*) as count 
          FROM pg_indexes 
          WHERE schemaname = 'public'
        `);
        
        // Get connection count
        const connectionResult = await client.query(`
          SELECT COUNT(*) as count 
          FROM pg_stat_activity 
          WHERE state = 'active'
        `);
        
        return {
          databaseSize: sizeResult.rows[0].size,
          tableCount: parseInt(tableResult.rows[0].count),
          indexCount: parseInt(indexResult.rows[0].count),
          connectionCount: parseInt(connectionResult.rows[0].count)
        };
      } finally {
        await this.connectionPool.release(client);
      }
    } catch (error) {
      this.logger.error('Failed to get database stats', { error });
      throw error;
    }
  }

  // Get top slow queries
  async getTopSlowQueries(limit: number = 5): Promise<SlowQuery[]> {
    return await this.optimizer.getSlowQueries(limit);
  }

  // Get query performance statistics
  getQueryPerformanceStats(): Array<{
    query: string;
    count: number;
    totalTime: number;
    averageTime: number;
  }> {
    return this.optimizer.getQueryStatistics();
  }
}