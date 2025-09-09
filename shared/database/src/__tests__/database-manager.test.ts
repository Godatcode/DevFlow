import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '../database-manager';
import { DatabaseConfig, ConnectionPoolConfig, QueryOptimizationConfig } from '../interfaces';

// Mock all dependencies
vi.mock('../connection-pool', () => ({
  PostgresConnectionPool: vi.fn().mockImplementation(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
    transaction: vi.fn().mockImplementation((callback) => 
      callback({ query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) })
    ),
    getMetrics: vi.fn().mockResolvedValue({ size: 5, available: 3, borrowed: 2, pending: 0 }),
    healthCheck: vi.fn().mockResolvedValue(true),
    destroy: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../query-cache', () => ({
  InMemoryQueryCache: vi.fn().mockImplementation(() => ({
    shouldCache: vi.fn().mockReturnValue(true),
    generateKey: vi.fn().mockReturnValue('cache-key'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({ hits: 10, misses: 2, size: 5, hitRate: 0.8 }),
    destroy: vi.fn()
  }))
}));

vi.mock('../database-optimizer', () => ({
  PostgresDatabaseOptimizer: vi.fn().mockImplementation(() => ({
    optimizeQuery: vi.fn().mockResolvedValue('OPTIMIZED QUERY'),
    analyzeQuery: vi.fn().mockResolvedValue({
      query: 'SELECT * FROM users',
      executionTime: 100,
      planningTime: 10,
      totalCost: 1.5,
      actualRows: 5,
      plan: {}
    }),
    suggestIndexes: vi.fn().mockResolvedValue(['CREATE INDEX idx_users_email ON users (email);']),
    getSlowQueries: vi.fn().mockResolvedValue([]),
    getMetrics: vi.fn().mockResolvedValue({
      activeConnections: 5,
      idleConnections: 3,
      totalConnections: 8,
      queriesExecuted: 100,
      slowQueries: 2,
      averageQueryTime: 150,
      connectionPoolUtilization: 0.6,
      cacheHitRate: 0.8
    })
  }))
}));

vi.mock('../database-monitor', () => ({
  PostgresDatabaseMonitor: vi.fn().mockImplementation(() => ({
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    onSlowQuery: vi.fn(),
    monitorQuery: vi.fn().mockImplementation((query, params, executor) => executor()),
    getMetrics: vi.fn().mockResolvedValue({
      activeConnections: 5,
      idleConnections: 3,
      totalConnections: 8,
      queriesExecuted: 100,
      slowQueries: 2,
      averageQueryTime: 150,
      connectionPoolUtilization: 0.6,
      cacheHitRate: 0.8
    }),
    getDatabaseStats: vi.fn().mockResolvedValue({
      databaseSize: '100MB',
      tableCount: 10,
      indexCount: 15,
      connectionCount: 5
    })
  }))
}));

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;
  let config: {
    database: DatabaseConfig;
    connectionPool: ConnectionPoolConfig;
    queryOptimization: QueryOptimizationConfig;
  };

  beforeEach(() => {
    config = {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'test',
        username: 'test',
        password: 'test',
        ssl: false,
        maxConnections: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000,
        queryTimeout: 5000,
        statementTimeout: 30000
      },
      connectionPool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
        propagateCreateError: false
      },
      queryOptimization: {
        enableQueryPlan: true,
        slowQueryThreshold: 1000,
        enableIndexHints: true,
        enableQueryCache: true,
        maxQueryCacheSize: 1000
      }
    };

    dbManager = DatabaseManager.getInstance();
    dbManager.initialize(config);
  });

  afterEach(async () => {
    await dbManager.shutdown();
    // Reset singleton instance
    (DatabaseManager as any).instance = undefined;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DatabaseManager.getInstance();
      const instance2 = DatabaseManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialization', () => {
    it('should initialize with configuration', () => {
      const manager = DatabaseManager.getInstance();
      expect(() => manager.initialize(config)).not.toThrow();
    });

    it('should not reinitialize if already initialized', () => {
      const manager = DatabaseManager.getInstance();
      manager.initialize(config);
      // Should not throw, but should warn
      expect(() => manager.initialize(config)).not.toThrow();
    });
  });

  describe('query execution', () => {
    it('should execute queries', async () => {
      await expect(dbManager.query('SELECT * FROM users')).resolves.toEqual({ rows: [{ id: 1 }] });
    });

    it('should execute transactions', async () => {
      const result = await dbManager.transaction(async (query) => {
        return await query('SELECT * FROM users');
      });

      expect(result).toEqual({ rows: [{ id: 1 }] });
    });
  });

  describe('caching', () => {
    it('should use cache when enabled', async () => {
      await expect(dbManager.invalidateCache('user:*')).resolves.not.toThrow();
    });

    it('should invalidate cache by pattern', async () => {
      await expect(dbManager.invalidateCache('user:*')).resolves.not.toThrow();
    });

    it('should clear all cache', async () => {
      await expect(dbManager.clearCache()).resolves.not.toThrow();
    });
  });

  describe('optimization', () => {
    it('should optimize queries', async () => {
      const result = await dbManager.optimizeQuery('SELECT * FROM users');
      expect(result).toBe('OPTIMIZED QUERY');
    });

    it('should analyze queries', async () => {
      const result = await dbManager.analyzeQuery('SELECT * FROM users');
      expect(result).toHaveProperty('executionTime');
      expect(result).toHaveProperty('planningTime');
    });

    it('should suggest indexes', async () => {
      const suggestions = await dbManager.suggestIndexes('users');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toContain('CREATE INDEX');
    });
  });

  describe('monitoring', () => {
    it('should get metrics', async () => {
      const metrics = await dbManager.getMetrics();
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('queriesExecuted');
    });

    it('should get slow queries', async () => {
      const slowQueries = await dbManager.getSlowQueries(5);
      expect(Array.isArray(slowQueries)).toBe(true);
    });
  });

  describe('health check', () => {
    it('should perform health check', async () => {
      const health = await dbManager.healthCheck();
      expect(health).toHaveProperty('database');
      expect(health).toHaveProperty('connectionPool');
      expect(health).toHaveProperty('cache');
    });
  });

  describe('performance summary', () => {
    it('should get comprehensive performance summary', async () => {
      const summary = await dbManager.getPerformanceSummary();
      
      expect(summary).toHaveProperty('database');
      expect(summary).toHaveProperty('connections');
      expect(summary).toHaveProperty('queries');
      expect(summary).toHaveProperty('cache');
      expect(summary).toHaveProperty('topSlowQueries');
    });
  });

  describe('error handling', () => {
    it('should throw error if not initialized', async () => {
      const uninitializedManager = DatabaseManager.getInstance();
      (uninitializedManager as any).isInitialized = false;
      
      await expect(uninitializedManager.query('SELECT 1')).rejects.toThrow('Database manager not initialized');
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await expect(dbManager.shutdown()).resolves.not.toThrow();
    });
  });
});