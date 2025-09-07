import { Pool, PoolClient, PoolConfig } from 'pg';
import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { DatabaseConfigManager, DatabaseConfig, InfluxDBConfig } from './database';
import { CustomError, ErrorType } from '@devflow/shared-types';

export class DatabaseConnectionError extends Error implements CustomError {
  type: ErrorType = ErrorType.EXTERNAL_SERVICE;
  code: string;
  statusCode: number = 503;

  constructor(message: string, code: string = 'DATABASE_CONNECTION_ERROR') {
    super(message);
    this.name = 'DatabaseConnectionError';
    this.code = code;
  }
}

export class PostgreSQLConnection {
  private static instance: PostgreSQLConnection;
  private pool: Pool;
  private config: DatabaseConfig;

  private constructor() {
    this.config = DatabaseConfigManager.getInstance().getPostgresConfig();
    this.pool = this.createPool();
    this.setupEventHandlers();
  }

  static getInstance(): PostgreSQLConnection {
    if (!PostgreSQLConnection.instance) {
      PostgreSQLConnection.instance = new PostgreSQLConnection();
    }
    return PostgreSQLConnection.instance;
  }

  private createPool(): Pool {
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.maxConnections,
      connectionTimeoutMillis: this.config.connectionTimeout,
      idleTimeoutMillis: this.config.idleTimeout,
      allowExitOnIdle: false
    };

    return new Pool(poolConfig);
  }

  private setupEventHandlers(): void {
    this.pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });

    this.pool.on('connect', (client) => {
      console.log('PostgreSQL client connected');
    });

    this.pool.on('remove', (client) => {
      console.log('PostgreSQL client removed');
    });
  }

  async getClient(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (error) {
      throw new DatabaseConnectionError(
        `Failed to get PostgreSQL client: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'POSTGRES_CLIENT_ERROR'
      );
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } catch (error) {
      throw new DatabaseConnectionError(
        `PostgreSQL query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'POSTGRES_QUERY_ERROR'
      );
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new DatabaseConnectionError(
        `PostgreSQL transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'POSTGRES_TRANSACTION_ERROR'
      );
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('PostgreSQL health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
    } catch (error) {
      console.error('Error closing PostgreSQL pool:', error);
    }
  }

  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}

export class InfluxDBConnection {
  private static instance: InfluxDBConnection;
  private client: InfluxDB;
  private config: InfluxDBConfig;
  private writeApi: WriteApi;
  private queryApi: QueryApi;

  private constructor() {
    this.config = DatabaseConfigManager.getInstance().getInfluxConfig();
    this.client = this.createClient();
    this.writeApi = this.client.getWriteApi(this.config.org, this.config.bucket);
    this.queryApi = this.client.getQueryApi(this.config.org);
    this.setupWriteApi();
  }

  static getInstance(): InfluxDBConnection {
    if (!InfluxDBConnection.instance) {
      InfluxDBConnection.instance = new InfluxDBConnection();
    }
    return InfluxDBConnection.instance;
  }

  private createClient(): InfluxDB {
    return new InfluxDB({
      url: this.config.url,
      token: this.config.token,
      timeout: this.config.timeout
    });
  }

  private setupWriteApi(): void {
    this.writeApi.useDefaultTags({
      environment: process.env.NODE_ENV || 'development',
      service: 'devflow-ai'
    });
  }

  async writePoint(measurement: string, fields: Record<string, any>, tags?: Record<string, string>): Promise<void> {
    try {
      const point = new Point(measurement);
      
      if (tags) {
        Object.entries(tags).forEach(([key, value]) => {
          point.tag(key, value);
        });
      }

      Object.entries(fields).forEach(([key, value]) => {
        if (typeof value === 'number') {
          point.floatField(key, value);
        } else if (typeof value === 'boolean') {
          point.booleanField(key, value);
        } else if (typeof value === 'string') {
          point.stringField(key, value);
        } else {
          point.stringField(key, JSON.stringify(value));
        }
      });

      this.writeApi.writePoint(point);
    } catch (error) {
      throw new DatabaseConnectionError(
        `InfluxDB write failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INFLUXDB_WRITE_ERROR'
      );
    }
  }

  async writePoints(points: Array<{ measurement: string; fields: Record<string, any>; tags?: Record<string, string> }>): Promise<void> {
    try {
      const influxPoints = points.map(({ measurement, fields, tags }) => {
        const point = new Point(measurement);
        
        if (tags) {
          Object.entries(tags).forEach(([key, value]) => {
            point.tag(key, value);
          });
        }

        Object.entries(fields).forEach(([key, value]) => {
          if (typeof value === 'number') {
            point.floatField(key, value);
          } else if (typeof value === 'boolean') {
            point.booleanField(key, value);
          } else if (typeof value === 'string') {
            point.stringField(key, value);
          } else {
            point.stringField(key, JSON.stringify(value));
          }
        });

        return point;
      });

      this.writeApi.writePoints(influxPoints);
    } catch (error) {
      throw new DatabaseConnectionError(
        `InfluxDB batch write failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INFLUXDB_BATCH_WRITE_ERROR'
      );
    }
  }

  async query<T = any>(fluxQuery: string): Promise<T[]> {
    try {
      const results: T[] = [];
      
      return new Promise((resolve, reject) => {
        this.queryApi.queryRows(fluxQuery, {
          next: (row, tableMeta) => {
            const record = tableMeta.toObject(row) as T;
            results.push(record);
          },
          error: (error) => {
            reject(new DatabaseConnectionError(
              `InfluxDB query failed: ${error.message}`,
              'INFLUXDB_QUERY_ERROR'
            ));
          },
          complete: () => {
            resolve(results);
          }
        });
      });
    } catch (error) {
      throw new DatabaseConnectionError(
        `InfluxDB query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INFLUXDB_QUERY_ERROR'
      );
    }
  }

  async flush(): Promise<void> {
    try {
      await this.writeApi.flush();
    } catch (error) {
      throw new DatabaseConnectionError(
        `InfluxDB flush failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INFLUXDB_FLUSH_ERROR'
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('buckets() |> limit(n: 1)');
      return true;
    } catch (error) {
      console.error('InfluxDB health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      await this.writeApi.close();
    } catch (error) {
      console.error('Error closing InfluxDB connection:', error);
    }
  }
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private postgres: PostgreSQLConnection;
  private influx: InfluxDBConnection;

  private constructor() {
    this.postgres = PostgreSQLConnection.getInstance();
    this.influx = InfluxDBConnection.getInstance();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  getPostgreSQL(): PostgreSQLConnection {
    return this.postgres;
  }

  getInfluxDB(): InfluxDBConnection {
    return this.influx;
  }

  async healthCheck(): Promise<{ postgres: boolean; influx: boolean }> {
    const [postgresHealth, influxHealth] = await Promise.all([
      this.postgres.healthCheck(),
      this.influx.healthCheck()
    ]);

    return {
      postgres: postgresHealth,
      influx: influxHealth
    };
  }

  async close(): Promise<void> {
    await Promise.all([
      this.postgres.close(),
      this.influx.close()
    ]);
  }
}