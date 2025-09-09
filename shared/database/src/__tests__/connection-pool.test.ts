import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgresConnectionPool } from '../connection-pool';
import { DatabaseConfig, ConnectionPoolConfig } from '../interfaces';

// Mock pg module
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ health: 1 }] }),
      release: vi.fn()
    }),
    end: vi.fn().mockResolvedValue(undefined),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
    on: vi.fn()
  }))
}));

describe('PostgresConnectionPool', () => {
  let pool: PostgresConnectionPool;
  let dbConfig: DatabaseConfig;
  let poolConfig: ConnectionPoolConfig;

  beforeEach(() => {
    dbConfig = {
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
    };

    poolConfig = {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false
    };

    pool = new PostgresConnectionPool(dbConfig, poolConfig);
  });

  afterEach(async () => {
    await pool.destroy();
  });

  describe('connection management', () => {
    it('should acquire and release connections', async () => {
      const client = await pool.acquire();
      expect(client).toBeDefined();
      
      await pool.release(client);
      expect(client.release).toHaveBeenCalled();
    });

    it('should execute queries', async () => {
      const result = await pool.query('SELECT 1 as test');
      expect(result).toBeDefined();
    });

    it('should execute transactions', async () => {
      const result = await pool.transaction(async (client) => {
        const queryResult = await client.query('SELECT 1 as health');
        return queryResult.rows[0];
      });
      
      expect(result).toEqual({ health: 1 });
    });
  });

  describe('metrics', () => {
    it('should provide pool metrics', async () => {
      const metrics = await pool.getMetrics();
      
      expect(metrics).toHaveProperty('size');
      expect(metrics).toHaveProperty('available');
      expect(metrics).toHaveProperty('borrowed');
      expect(metrics).toHaveProperty('pending');
    });

    it('should provide pool statistics', () => {
      const stats = pool.getPoolStats();
      
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('waitingClients');
    });
  });

  describe('health check', () => {
    it('should perform health check', async () => {
      const isHealthy = await pool.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should handle health check failures', async () => {
      // Mock query to throw error
      const mockQuery = vi.fn().mockRejectedValue(new Error('Connection failed'));
      pool.query = mockQuery;
      
      const isHealthy = await pool.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle connection acquisition errors', async () => {
      // Mock pool.connect to throw error
      const mockPool = pool['pool'];
      mockPool.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
      
      await expect(pool.acquire()).rejects.toThrow('Connection failed');
    });

    it('should handle transaction rollback on error', async () => {
      await expect(
        pool.transaction(async (client) => {
          throw new Error('Transaction error');
        })
      ).rejects.toThrow('Transaction error');
    });
  });
});