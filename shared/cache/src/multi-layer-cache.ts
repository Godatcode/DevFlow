import { 
  CacheLayer, 
  CacheOptions, 
  CacheStats, 
  CacheMetrics, 
  CacheConfiguration,
  CacheInvalidationStrategy,
  CacheEvent,
  CacheEventType
} from './interfaces';
import { MemoryCacheLayer } from './layers/memory-cache';
import { RedisCacheLayer } from './layers/redis-cache';
import { Logger } from './mocks/shared-utils';

export class MultiLayerCache {
  private layers: Map<string, CacheLayer>;
  private orderedLayers: CacheLayer[];
  private invalidationStrategies: Map<string, CacheInvalidationStrategy>;
  private logger: Logger;
  private config: CacheConfiguration;
  private metricsCollectionInterval?: NodeJS.Timeout;

  constructor(config: CacheConfiguration) {
    this.layers = new Map();
    this.orderedLayers = [];
    this.invalidationStrategies = new Map();
    this.logger = new Logger('MultiLayerCache');
    this.config = config;

    this.initializeLayers();
    
    if (config.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      // Try each layer in priority order
      for (const layer of this.orderedLayers) {
        const value = await layer.get<T>(key);
        
        if (value !== null) {
          // Populate higher priority layers with the found value
          await this.populateHigherLayers(key, value, layer);
          
          this.logPerformance('get', key, Date.now() - startTime, true);
          return value;
        }
      }

      this.logPerformance('get', key, Date.now() - startTime, false);
      return null;
    } catch (error) {
      this.logger.error('Error getting from multi-layer cache', { key, error });
      throw error;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Set in all layers
      const promises = this.orderedLayers.map(layer => 
        layer.set(key, value, options).catch(error => {
          this.logger.error(`Error setting in layer ${layer.name}`, { key, error });
        })
      );

      await Promise.allSettled(promises);
      this.logPerformance('set', key, Date.now() - startTime, true);
    } catch (error) {
      this.logger.error('Error setting in multi-layer cache', { key, error });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Delete from all layers
      const promises = this.orderedLayers.map(layer => 
        layer.delete(key).catch(error => {
          this.logger.error(`Error deleting from layer ${layer.name}`, { key, error });
        })
      );

      await Promise.allSettled(promises);
      this.logPerformance('delete', key, Date.now() - startTime, true);
    } catch (error) {
      this.logger.error('Error deleting from multi-layer cache', { key, error });
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const promises = this.orderedLayers.map(layer => 
        layer.clear().catch(error => {
          this.logger.error(`Error clearing layer ${layer.name}`, { error });
        })
      );

      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error('Error clearing multi-layer cache', { error });
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      // Check each layer in priority order
      for (const layer of this.orderedLayers) {
        if (await layer.has(key)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error('Error checking key existence', { key, error });
      return false;
    }
  }

  async invalidateByTag(tag: string): Promise<void> {
    try {
      const promises = this.orderedLayers.map(layer => 
        layer.invalidateByTag(tag).catch(error => {
          this.logger.error(`Error invalidating tag in layer ${layer.name}`, { tag, error });
        })
      );

      await Promise.allSettled(promises);
      this.logger.info('Invalidated cache by tag', { tag });
    } catch (error) {
      this.logger.error('Error invalidating by tag', { tag, error });
      throw error;
    }
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    // This would require implementing pattern matching in each layer
    // For now, we'll log that this feature needs implementation
    this.logger.warn('Pattern-based invalidation not yet implemented', { pattern });
  }

  async getMetrics(): Promise<CacheMetrics> {
    try {
      const layerStats = new Map<string, CacheStats>();
      let totalHits = 0;
      let totalMisses = 0;
      let totalMemoryUsage = 0;

      for (const layer of this.orderedLayers) {
        const stats = await layer.getStats();
        layerStats.set(layer.name, stats);
        totalHits += stats.hits;
        totalMisses += stats.misses;
        totalMemoryUsage += stats.memoryUsage || 0;
      }

      const overallHitRate = totalHits + totalMisses > 0 
        ? totalHits / (totalHits + totalMisses) 
        : 0;

      return {
        layerStats,
        totalHits,
        totalMisses,
        overallHitRate,
        averageResponseTime: 0, // Would need to track this separately
        memoryUsage: totalMemoryUsage
      };
    } catch (error) {
      this.logger.error('Error getting cache metrics', { error });
      throw error;
    }
  }

  registerInvalidationStrategy(strategy: CacheInvalidationStrategy): void {
    this.invalidationStrategies.set(strategy.name, strategy);
    this.logger.info('Registered invalidation strategy', { name: strategy.name });
  }

  async applyInvalidationStrategy(strategyName: string, context: any): Promise<void> {
    const strategy = this.invalidationStrategies.get(strategyName);
    
    if (!strategy) {
      this.logger.warn('Unknown invalidation strategy', { strategyName });
      return;
    }

    try {
      const keysToInvalidate = strategy.getInvalidationKeys(context);
      
      for (const key of keysToInvalidate) {
        await this.delete(key);
      }

      this.logger.info('Applied invalidation strategy', { 
        strategyName, 
        keysInvalidated: keysToInvalidate.length 
      });
    } catch (error) {
      this.logger.error('Error applying invalidation strategy', { strategyName, error });
      throw error;
    }
  }

  private initializeLayers(): void {
    // Initialize layers based on configuration
    for (const layerConfig of this.config.layers) {
      let layer: CacheLayer;

      switch (layerConfig.type) {
        case 'memory':
          layer = new MemoryCacheLayer({
            maxSize: layerConfig.maxSize,
            ttl: layerConfig.ttl || this.config.defaultTtl
          });
          break;
        
        case 'redis':
          layer = new RedisCacheLayer({
            compressionThreshold: this.config.compressionThreshold
          });
          break;
        
        default:
          this.logger.warn('Unknown cache layer type', { type: layerConfig.type });
          continue;
      }

      this.layers.set(layer.name, layer);
      this.logger.info('Initialized cache layer', { name: layer.name, priority: layer.priority });
    }

    // Sort layers by priority (lower number = higher priority)
    this.orderedLayers = Array.from(this.layers.values())
      .sort((a, b) => a.priority - b.priority);
  }

  private async populateHigherLayers<T>(
    key: string, 
    value: T, 
    sourceLayer: CacheLayer
  ): Promise<void> {
    try {
      // Find layers with higher priority than the source layer
      const higherPriorityLayers = this.orderedLayers.filter(
        layer => layer.priority < sourceLayer.priority
      );

      // Populate higher priority layers
      const promises = higherPriorityLayers.map(layer =>
        layer.set(key, value, { ttl: this.config.defaultTtl }).catch(error => {
          this.logger.error(`Error populating layer ${layer.name}`, { key, error });
        })
      );

      await Promise.allSettled(promises);
    } catch (error) {
      this.logger.error('Error populating higher layers', { key, error });
    }
  }

  private logPerformance(
    operation: string, 
    key: string, 
    duration: number, 
    success: boolean
  ): void {
    this.logger.debug('Cache operation performance', {
      operation,
      key,
      duration,
      success
    });
  }

  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(async () => {
      try {
        const metrics = await this.getMetrics();
        this.logger.info('Cache metrics', metrics);
      } catch (error) {
        this.logger.error('Error collecting cache metrics', { error });
      }
    }, 60000); // Collect metrics every minute
  }

  async shutdown(): Promise<void> {
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
    }

    // Shutdown Redis connections
    for (const layer of this.orderedLayers) {
      if (layer instanceof RedisCacheLayer) {
        await layer.disconnect();
      }
    }

    this.logger.info('Multi-layer cache shutdown complete');
  }
}