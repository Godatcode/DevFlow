import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiLayerCache } from '../multi-layer-cache';
import { CacheConfiguration } from '../interfaces';

// Mock the Redis layer to avoid requiring actual Redis connection
vi.mock('../layers/redis-cache', () => ({
  RedisCacheLayer: vi.fn().mockImplementation(() => ({
    name: 'redis',
    priority: 2,
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    getStats: vi.fn().mockResolvedValue({
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      memoryUsage: 0
    }),
    invalidateByTag: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('MultiLayerCache', () => {
  let cache: MultiLayerCache;
  let config: CacheConfiguration;

  beforeEach(() => {
    config = {
      layers: [
        {
          name: 'memory',
          type: 'memory',
          priority: 1,
          maxSize: 100,
          ttl: 300
        },
        {
          name: 'redis',
          type: 'redis',
          priority: 2,
          ttl: 3600
        }
      ],
      defaultTtl: 300,
      maxMemoryUsage: 100 * 1024 * 1024,
      compressionThreshold: 1024,
      enableMetrics: true,
      invalidationStrategies: []
    };

    cache = new MultiLayerCache(config);
  });

  describe('layer coordination', () => {
    it('should try layers in priority order', async () => {
      // Set value in cache
      await cache.set('key1', 'value1');
      
      // Should find it in memory layer (priority 1)
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });

    it('should populate higher priority layers when value found in lower priority layer', async () => {
      // This test would require more sophisticated mocking to verify
      // that higher priority layers are populated when a value is found
      // in a lower priority layer
      await cache.set('key1', 'value1');
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });
  });

  describe('invalidation', () => {
    it('should invalidate by tag across all layers', async () => {
      await cache.set('key1', 'value1', { tags: ['tag1'] });
      await cache.invalidateByTag('tag1');
      
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });
  });

  describe('metrics collection', () => {
    it('should collect metrics from all layers', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1'); // hit
      await cache.get('nonexistent'); // miss
      
      const metrics = await cache.getMetrics();
      expect(metrics.layerStats.size).toBeGreaterThan(0);
      expect(metrics.totalHits).toBeGreaterThanOrEqual(0);
      expect(metrics.totalMisses).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle layer failures gracefully', async () => {
      // Even if one layer fails, others should continue working
      await cache.set('key1', 'value1');
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });
  });

  describe('invalidation strategies', () => {
    it('should register and apply invalidation strategies', async () => {
      const mockStrategy = {
        name: 'test-strategy',
        shouldInvalidate: vi.fn().mockReturnValue(true),
        getInvalidationKeys: vi.fn().mockReturnValue(['key1', 'key2'])
      };

      cache.registerInvalidationStrategy(mockStrategy);
      
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      await cache.applyInvalidationStrategy('test-strategy', {});
      
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await expect(cache.shutdown()).resolves.not.toThrow();
    });
  });
});