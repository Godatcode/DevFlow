// Main exports
export { CacheManager } from './cache-manager';
export { MultiLayerCache } from './multi-layer-cache';
export { CachePerformanceMonitor } from './performance-monitor';

// Layer implementations
export { MemoryCacheLayer } from './layers/memory-cache';
export { RedisCacheLayer } from './layers/redis-cache';

// Invalidation strategies
export {
  TimeBasedInvalidationStrategy,
  WorkflowInvalidationStrategy,
  UserInvalidationStrategy,
  ProjectInvalidationStrategy,
  MetricsInvalidationStrategy,
  createDefaultInvalidationStrategies
} from './invalidation-strategies';

// Interfaces and types
export type {
  CacheEntry,
  CacheOptions,
  CacheStats,
  CacheLayer,
  CacheInvalidationStrategy,
  CacheMetrics,
  CacheConfiguration,
  CacheLayerConfig,
  CacheEvent
} from './interfaces';

export { CacheEventType } from './interfaces';

export type {
  PerformanceThresholds,
  PerformanceAlert
} from './performance-monitor';

// Convenience function to get the singleton cache manager
import { CacheManager } from './cache-manager';

export function getCache(): CacheManager {
  return CacheManager.getInstance();
}