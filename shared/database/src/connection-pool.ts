import { Pool, PoolClient, PoolConfig } from 'pg';
import { ConnectionPool, ConnectionPoolConfig, DatabaseConfig } from './interfaces';
import { Logger } from './mocks/shared-utils';

export class PostgresConnectionPool implements ConnectionPool {
  private pool!: Pool;
  private logger: Logger;
  private metrics: {
    acquired: number;
    released: number;
    errors: number;
    totalConnections: number;
  };

  constructor(
    private config: DatabaseConfig,
    private poolConfig: ConnectionPoolConfig
  ) {
    this.logger = new Logger('PostgresConnectionPool');
    this.metrics = {
      acquired: 0,
      released: 0,
      errors: 0,
      totalConnections: 0
    };

    this.initializePool();
  }

  private initializePool(): void {
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      min: this.poolConfig.min,
      max: this.poolConfig.max,
      connectionTimeoutMillis: this.poolConfig.acquireTimeoutMillis,
      idleTimeoutMillis: this.poolConfig.idleTimeoutMillis,
      statement_timeout: this.config.statementTimeout,
      query_timeout: this.config.queryTimeout
    };

    this.pool = new Pool(poolConfig);

    // Set up event listeners
    this.setupEventListeners();

    this.logger.info('Connection pool initialized', {
      host: this.config.host,
      database: this.config.database,
      minConnections: this.poolConfig.min,
      maxConnections: this.poolConfig.max
    });
  }

  private setupEventListeners(): void {
    this.pool.on('connect', (client: PoolClient) => {
      this.metrics.totalConnections++;
      this.logger.debug('New client connected', {
        totalConnections: this.metrics.totalConnections
      });
    });

    this.pool.on('acquire', (client: PoolClient) => {
      this.metrics.acquired++;
      this.logger.debug('Client acquired from pool', {
        acquired: this.metrics.acquired
      });
    });

    this.pool.on('error', (error: Error, client: PoolClient) => {
      this.metrics.errors++;
      this.logger.error('Pool error', { error: error.message });
    });

    this.pool.on('remove', (client: PoolClient) => {
      this.metrics.totalConnections--;
      this.logger.debug('Client removed from pool', {
        totalConnections: this.metrics.totalConnections
      });
    });

    this.pool.on('error', (error: Error, client: PoolClient) => {
      this.metrics.errors++;
      this.logger.error('Pool error', { error: error.message });
    });
  }

  async acquire(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to acquire connection', { error });
      throw error;
    }
  }

  async release(client: PoolClient): Promise<void> {
    try {
      client.release();
    } catch (error) {
      this.logger.error('Failed to release connection', { error });
      throw error;
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.pool.end();
      this.logger.info('Connection pool destroyed');
    } catch (error) {
      this.logger.error('Error destroying connection pool', { error });
      throw error;
    }
  }

  async getMetrics(): Promise<{
    size: number;
    available: number;
    borrowed: number;
    pending: number;
  }> {
    return {
      size: this.pool.totalCount,
      available: this.pool.idleCount,
      borrowed: this.pool.totalCount - this.pool.idleCount,
      pending: this.pool.waitingCount
    };
  }

  // Execute a query with automatic connection management
  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.acquire();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      await this.release(client);
    }
  }

  // Execute a transaction with automatic connection management
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await this.release(client);
    }
  }

  // Get pool statistics
  getPoolStats(): {
    totalConnections: number;
    idleConnections: number;
    activeConnections: number;
    waitingClients: number;
    acquired: number;
    released: number;
    errors: number;
  } {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
      acquired: this.metrics.acquired,
      released: this.metrics.released,
      errors: this.metrics.errors
    };
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1 as health');
      return result.rows[0].health === 1;
    } catch (error) {
      this.logger.error('Health check failed', { error });
      return false;
    }
  }
}