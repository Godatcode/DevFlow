export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  queryTimeout: number;
  statementTimeout: number;
}

export interface ConnectionPoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
  createRetryIntervalMillis: number;
  propagateCreateError: boolean;
}

export interface QueryOptimizationConfig {
  enableQueryPlan: boolean;
  slowQueryThreshold: number;
  enableIndexHints: boolean;
  enableQueryCache: boolean;
  maxQueryCacheSize: number;
}

export interface DatabaseMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  queriesExecuted: number;
  slowQueries: number;
  averageQueryTime: number;
  connectionPoolUtilization: number;
  cacheHitRate: number;
}

export interface QueryPlan {
  query: string;
  executionTime: number;
  planningTime: number;
  totalCost: number;
  actualRows: number;
  plan: any;
}

export interface SlowQuery {
  query: string;
  executionTime: number;
  timestamp: Date;
  parameters?: any[];
  stackTrace?: string;
}

export interface DatabaseOptimizer {
  analyzeQuery(query: string, parameters?: any[]): Promise<QueryPlan>;
  suggestIndexes(tableName: string): Promise<string[]>;
  optimizeQuery(query: string): Promise<string>;
  getSlowQueries(limit?: number): Promise<SlowQuery[]>;
  getMetrics(): Promise<DatabaseMetrics>;
}

export interface ConnectionPool {
  acquire(): Promise<any>;
  release(connection: any): Promise<void>;
  destroy(): Promise<void>;
  getMetrics(): Promise<{
    size: number;
    available: number;
    borrowed: number;
    pending: number;
  }>;
}

export interface QueryCache {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<{
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  }>;
}

export interface DatabaseMonitor {
  startMonitoring(): void;
  stopMonitoring(): void;
  getMetrics(): Promise<DatabaseMetrics>;
  onSlowQuery(callback: (query: SlowQuery) => void): void;
  onConnectionIssue(callback: (error: Error) => void): void;
}