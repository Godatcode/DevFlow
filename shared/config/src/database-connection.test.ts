import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PostgreSQLConnection, InfluxDBConnection, DatabaseManager, DatabaseConnectionError } from './database-connection';

// Mock the pg module
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ test: 'data' }] }),
      release: vi.fn()
    }),
    query: vi.fn().mockResolvedValue({ rows: [{ test: 'data' }] }),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 0
  }))
}));

// Mock the InfluxDB module
vi.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: vi.fn().mockImplementation(() => ({
    getWriteApi: vi.fn().mockReturnValue({
      writePoint: vi.fn(),
      writePoints: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      useDefaultTags: vi.fn()
    }),
    getQueryApi: vi.fn().mockReturnValue({
      queryRows: vi.fn().mockImplementation((query, callbacks) => {
        // Simulate successful query
        setTimeout(() => {
          callbacks.next({ test: 'data' }, { toObject: (row: any) => row });
          callbacks.complete();
        }, 10);
      })
    })
  })),
  Point: vi.fn().mockImplementation((measurement) => ({
    tag: vi.fn().mockReturnThis(),
    floatField: vi.fn().mockReturnThis(),
    booleanField: vi.fn().mockReturnThis(),
    stringField: vi.fn().mockReturnThis()
  }))
}));

// Mock the database config
vi.mock('./database', () => ({
  DatabaseConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getPostgresConfig: vi.fn().mockReturnValue({
        host: 'localhost',
        port: 5432,
        database: 'test',
        username: 'test',
        password: 'test',
        ssl: false,
        maxConnections: 10,
        connectionTimeout: 30000,
        idleTimeout: 10000
      }),
      getInfluxConfig: vi.fn().mockReturnValue({
        url: 'http://localhost:8086',
        token: 'test-token',
        org: 'test-org',
        bucket: 'test-bucket',
        timeout: 10000
      })
    })
  }
}));

describe('PostgreSQLConnection', () => {
  let postgres: PostgreSQLConnection;

  beforeEach(() => {
    // Reset singleton instance
    (PostgreSQLConnection as any).instance = undefined;
    postgres = PostgreSQLConnection.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create singleton instance', () => {
    const instance1 = PostgreSQLConnection.getInstance();
    const instance2 = PostgreSQLConnection.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should execute query successfully', async () => {
    const result = await postgres.query('SELECT 1');
    expect(result).toEqual([{ test: 'data' }]);
  });

  it('should execute transaction successfully', async () => {
    const result = await postgres.transaction(async (client) => {
      await client.query('INSERT INTO test VALUES (1)');
      return 'success';
    });
    expect(result).toBe('success');
  });

  it('should handle query errors', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockRejectedValue(new Error('Query failed')),
        release: vi.fn()
      })
    };
    
    (postgres as any).pool = mockPool;

    await expect(postgres.query('SELECT 1')).rejects.toThrow(DatabaseConnectionError);
  });

  it('should perform health check', async () => {
    const isHealthy = await postgres.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should get pool stats', () => {
    const stats = postgres.getPoolStats();
    expect(stats).toEqual({
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0
    });
  });
});

describe('InfluxDBConnection', () => {
  let influx: InfluxDBConnection;

  beforeEach(() => {
    // Reset singleton instance
    (InfluxDBConnection as any).instance = undefined;
    influx = InfluxDBConnection.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create singleton instance', () => {
    const instance1 = InfluxDBConnection.getInstance();
    const instance2 = InfluxDBConnection.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should write single point successfully', async () => {
    await expect(influx.writePoint('test_measurement', { value: 1 }, { tag1: 'value1' })).resolves.not.toThrow();
  });

  it('should write multiple points successfully', async () => {
    const points = [
      { measurement: 'test1', fields: { value: 1 }, tags: { tag1: 'value1' } },
      { measurement: 'test2', fields: { value: 2 }, tags: { tag2: 'value2' } }
    ];
    
    await expect(influx.writePoints(points)).resolves.not.toThrow();
  });

  it('should execute query successfully', async () => {
    const result = await influx.query('from(bucket: "test") |> range(start: -1h)');
    expect(result).toEqual([{ test: 'data' }]);
  });

  it('should handle query errors', async () => {
    const mockQueryApi = {
      queryRows: vi.fn().mockImplementation((query, callbacks) => {
        setTimeout(() => {
          callbacks.error(new Error('Query failed'));
        }, 10);
      })
    };
    
    (influx as any).queryApi = mockQueryApi;

    await expect(influx.query('invalid query')).rejects.toThrow(DatabaseConnectionError);
  });

  it('should perform health check', async () => {
    const isHealthy = await influx.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should flush writes', async () => {
    await expect(influx.flush()).resolves.not.toThrow();
  });
});

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  beforeEach(() => {
    // Reset singleton instance
    (DatabaseManager as any).instance = undefined;
    (PostgreSQLConnection as any).instance = undefined;
    (InfluxDBConnection as any).instance = undefined;
    manager = DatabaseManager.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create singleton instance', () => {
    const instance1 = DatabaseManager.getInstance();
    const instance2 = DatabaseManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should provide PostgreSQL connection', () => {
    const postgres = manager.getPostgreSQL();
    expect(postgres).toBeInstanceOf(PostgreSQLConnection);
  });

  it('should provide InfluxDB connection', () => {
    const influx = manager.getInfluxDB();
    expect(influx).toBeInstanceOf(InfluxDBConnection);
  });

  it('should perform health check on both databases', async () => {
    const health = await manager.healthCheck();
    expect(health).toEqual({
      postgres: true,
      influx: true
    });
  });

  it('should close both connections', async () => {
    await expect(manager.close()).resolves.not.toThrow();
  });
});

describe('DatabaseConnectionError', () => {
  it('should create error with correct properties', () => {
    const error = new DatabaseConnectionError('Test error', 'TEST_CODE');
    
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.type).toBe('external_service');
    expect(error.statusCode).toBe(503);
    expect(error.name).toBe('DatabaseConnectionError');
  });

  it('should create error with default code', () => {
    const error = new DatabaseConnectionError('Test error');
    expect(error.code).toBe('DATABASE_CONNECTION_ERROR');
  });
});