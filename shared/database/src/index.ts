// Main exports
export { DatabaseManager } from './database-manager';
export { PostgresConnectionPool } from './connection-pool';
export { InMemoryQueryCache } from './query-cache';
export { PostgresDatabaseOptimizer } from './database-optimizer';
export { PostgresDatabaseMonitor } from './database-monitor';

// Interfaces and types
export type {
  DatabaseConfig,
  ConnectionPoolConfig,
  QueryOptimizationConfig,
  DatabaseMetrics,
  QueryPlan,
  SlowQuery,
  DatabaseOptimizer,
  ConnectionPool,
  QueryCache,
  DatabaseMonitor
} from './interfaces';

// Convenience function to get the singleton database manager
import { DatabaseManager } from './database-manager';

export function getDatabase(): DatabaseManager {
  return DatabaseManager.getInstance();
}