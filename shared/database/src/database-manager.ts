import { PostgresConnectionPool } from './connection-pool';
import { InMemoryQueryCache } from './query-cache';
import { PostgresDatabaseOptimizer } from './database-optimizer';
import { PostgresDatabaseMonitor } from './database-monitor';
import { DatabaseConfig, ConnectionPoolConfig, QueryOptimizationConfig } from './interfaces';
import { Logger } from './mocks/shared-utils';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private connectionPool?: PostgresConnectionPool;
  private queryCache?: InMemoryQueryCache;
  private optimizer?: PostgresDatabaseOptimizer;
  private monitor?: PostgresDatabaseMonitor;
  private logger: Logger;
  private isInitialized = false;

  private constructor() {
    this.logger = new Logger('DatabaseManager');
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  initialize(config: {
    database: DatabaseConfig;
    connectionPool: ConnectionPoolConfig;
    queryOptimization: QueryOptimizationConfig;
  }): void {
    if (this.isInitialized) {
      this.logger.warn('Database manager already initialized');
      return;
    }

    // Initialize connection pool
    this.connectionPool = new PostgresConnectionPool(
      config.database,
      config.connectionPool
    );

    // Initialize query cache if enabled
    if (config.queryOptimization.enableQueryCache) {
      this.queryCache = new InMemoryQueryCache({
        maxSize: config.queryOptimization.maxQueryCacheSize,
        defaultTtl: 300000 // 5 minutes
      });
    }

    // Initialize optimizer
    this.optimizer = new PostgresDatabaseOptimizer(this.connectionPool);

    // Initialize monitor
    this.monitor = new PostgresDatabaseMonitor(
      this.connectionPool,
      this.optimizer,
      {
        slowQueryThreshold: config.queryOptimization.slowQueryThreshold
      }
    );

    // Start monitoring
    this.monitor.startMonitoring();

    // Set up slow query alerts
    this.monitor.onSlowQuery((slowQuery) => {
      this.logger.warn('Slow query detected', {
        executionTime: slowQuery.executionTime,
        query: slowQuery.query.substring(0, 200) + '...'
      });
    });

    this.isInitialized = true;
    this.logger.info('Database manager initialized', {
      host: config.database.host,
      database: config.database.database,
      maxConnections: config.connectionPool.max,
      queryCacheEnabled: config.queryOptimization.enableQueryCache
    });
  }

  // Execute a query with optimization and monitoring
  async query(text: string, params?: any[]): Promise<any> {
    this.ensureInitialized();

    // Check cache first if enabled
    if (this.queryCache && this.queryCache.shouldCache(text)) {
      const cacheKey = this.queryCache.generateKey(text, params);
      const cachedResult = await this.queryCache.get(cacheKey);
      
      if (cachedResult) {
        this.logger.debug('Query result served from cache', {
          query: text.substring(0, 100) + '...'
        });
        return cachedResult;
      }
    }

    // Execute query with monitoring
    const result = await this.monitor!.monitorQuery(
      text,
      params,
      () => this.connectionPool!.query(text, params)
    );

    // Cache result if applicable
    if (this.queryCache && this.queryCache.shouldCache(text)) {
      const cacheKey = this.queryCache.generateKey(text, params);
      await this.queryCache.set(cacheKey, result);
    }

    return result;
  }

  // Execute a transaction
  async transaction<T>(callback: (query: (text: string, params?: any[]) => Promise<any>) => Promise<T>): Promise<T> {
    this.ensureInitialized();

    return await this.connectionPool!.transaction(async (client) => {
      const transactionQuery = async (text: string, params?: any[]) => {
        return await this.monitor!.monitorQuery(
          text,
          params,
          () => client.query(text, params)
        );
      };

      return await callback(transactionQuery);
    });
  }

  // Get database metrics
  async getMetrics() {
    this.ensureInitialized();
    return await this.monitor!.getMetrics();
  }

  // Get query cache statistics
  async getCacheStats() {
    if (!this.queryCache) {
      return null;
    }
    return await this.queryCache.getStats();
  }

  // Optimize a query
  async optimizeQuery(query: string): Promise<string> {
    this.ensureInitialized();
    return await this.optimizer!.optimizeQuery(query);
  }

  // Analyze a query
  async analyzeQuery(query: string, parameters?: any[]) {
    this.ensureInitialized();
    return await this.optimizer!.analyzeQuery(query, parameters);
  }

  // Get index suggestions for a table
  async suggestIndexes(tableName: string): Promise<string[]> {
    this.ensureInitialized();
    return await this.optimizer!.suggestIndexes(tableName);
  }

  // Get slow queries
  async getSlowQueries(limit?: number) {
    this.ensureInitialized();
    return await this.optimizer!.getSlowQueries(limit);
  }

  // Invalidate cache by pattern
  async invalidateCache(pattern: string): Promise<void> {
    if (this.queryCache) {
      await this.queryCache.invalidate(pattern);
    }
  }

  // Clear all cache
  async clearCache(): Promise<void> {
    if (this.queryCache) {
      await this.queryCache.clear();
    }
  }

  // Health check
  async healthCheck(): Promise<{
    database: boolean;
    connectionPool: boolean;
    cache: boolean;
  }> {
    this.ensureInitialized();

    const dbHealth = await this.connectionPool!.healthCheck();
    const poolMetrics = await this.connectionPool!.getMetrics();
    const cacheStats = this.queryCache ? await this.queryCache.getStats() : null;

    return {
      database: dbHealth,
      connectionPool: poolMetrics.size > 0,
      cache: cacheStats !== null
    };
  }

  // Get database statistics
  async getDatabaseStats() {
    this.ensureInitialized();
    return await this.monitor!.getDatabaseStats();
  }

  // Get performance summary
  async getPerformanceSummary() {
    this.ensureInitialized();
    
    const metrics = await this.getMetrics();
    const cacheStats = await this.getCacheStats();
    const slowQueries = await this.getSlowQueries(5);
    const dbStats = await this.getDatabaseStats();

    return {
      database: dbStats,
      connections: {
        active: metrics.activeConnections,
        idle: metrics.idleConnections,
        total: metrics.totalConnections,
        utilization: metrics.connectionPoolUtilization
      },
      queries: {
        executed: metrics.queriesExecuted,
        slow: metrics.slowQueries,
        averageTime: metrics.averageQueryTime
      },
      cache: cacheStats,
      topSlowQueries: slowQueries
    };
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Database manager not initialized. Call initialize() first.');
    }
  }

  async shutdown(): Promise<void> {
    if (this.monitor) {
      this.monitor.stopMonitoring();
    }

    if (this.queryCache) {
      this.queryCache.destroy();
    }

    if (this.connectionPool) {
      await this.connectionPool.destroy();
    }

    this.isInitialized = false;
    this.logger.info('Database manager shutdown complete');
  }
}