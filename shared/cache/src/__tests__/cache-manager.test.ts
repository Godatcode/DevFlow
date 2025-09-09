import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheManager } from '../cache-manager';

// Mock the MultiLayerCache to avoid Redis dependency
vi.mock('../multi-layer-cache', () => ({
  MultiLayerCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
    invalidateByTag: vi.fn().mockResolvedValue(undefined),
    invalidateByPattern: vi.fn().mockResolvedValue(undefined),
    applyInvalidationStrategy: vi.fn().mockResolvedValue(undefined),
    getMetrics: vi.fn().mockResolvedValue({
      layerStats: new Map(),
      totalHits: 0,
      totalMisses: 0,
      overallHitRate: 0,
      averageResponseTime: 0,
      memoryUsage: 0
    }),
    registerInvalidationStrategy: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Get a fresh instance for each test
    cacheManager = CacheManager.getInstance();
    cacheManager.initialize();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
    // Reset the singleton instance
    (CacheManager as any).instance = undefined;
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CacheManager.getInstance();
      const instance2 = CacheManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const manager = CacheManager.getInstance();
      expect(() => manager.initialize()).not.toThrow();
    });

    it('should initialize with custom configuration', () => {
      const manager = CacheManager.getInstance();
      const customConfig = {
        defaultTtl: 600,
        maxMemoryUsage: 200 * 1024 * 1024
      };
      expect(() => manager.initialize(customConfig)).not.toThrow();
    });

    it('should not reinitialize if already initialized', () => {
      const manager = CacheManager.getInstance();
      manager.initialize();
      // Should not throw, but should warn
      expect(() => manager.initialize()).not.toThrow();
    });
  });

  describe('basic operations', () => {
    it('should get and set values', async () => {
      await expect(cacheManager.set('key1', 'value1')).resolves.not.toThrow();
      await expect(cacheManager.get('key1')).resolves.not.toThrow();
    });

    it('should delete values', async () => {
      await expect(cacheManager.delete('key1')).resolves.not.toThrow();
    });

    it('should check if key exists', async () => {
      await expect(cacheManager.has('key1')).resolves.not.toThrow();
    });

    it('should clear cache', async () => {
      await expect(cacheManager.clear()).resolves.not.toThrow();
    });
  });

  describe('advanced operations', () => {
    it('should invalidate by tag', async () => {
      await expect(cacheManager.invalidateByTag('tag1')).resolves.not.toThrow();
    });

    it('should invalidate by pattern', async () => {
      await expect(cacheManager.invalidateByPattern('pattern*')).resolves.not.toThrow();
    });

    it('should apply invalidation strategy', async () => {
      await expect(
        cacheManager.applyInvalidationStrategy('test-strategy', {})
      ).resolves.not.toThrow();
    });
  });

  describe('convenience methods', () => {
    it('should implement getOrSet pattern', async () => {
      const factory = vi.fn().mockResolvedValue('computed-value');
      
      // Mock the cache to return null first (cache miss)
      const mockCache = cacheManager['cache'];
      mockCache.get = vi.fn().mockResolvedValueOnce(null);
      mockCache.set = vi.fn().mockResolvedValue(undefined);
      
      const result = await cacheManager.getOrSet('key1', factory);
      
      expect(factory).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith('key1', 'computed-value', undefined);
    });

    it('should implement mget for multiple keys', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const results = await cacheManager.mget(keys);
      
      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(keys.length);
    });

    it('should implement mset for multiple entries', async () => {
      const entries = new Map([
        ['key1', 'value1'],
        ['key2', 'value2']
      ]);
      
      await expect(cacheManager.mset(entries)).resolves.not.toThrow();
    });

    it('should warm cache', async () => {
      const keys = ['key1', 'key2'];
      const factory = vi.fn().mockImplementation((key) => Promise.resolve(`value-${key}`));
      
      await expect(cacheManager.warmCache(keys, factory)).resolves.not.toThrow();
    });
  });

  describe('metrics and monitoring', () => {
    it('should get metrics', async () => {
      const metrics = await cacheManager.getMetrics();
      expect(metrics).toHaveProperty('layerStats');
      expect(metrics).toHaveProperty('totalHits');
      expect(metrics).toHaveProperty('totalMisses');
    });

    it('should get performance summary', () => {
      const summary = cacheManager.getPerformanceSummary();
      expect(summary).toHaveProperty('averageResponseTime');
      expect(summary).toHaveProperty('errorRate');
      expect(summary).toHaveProperty('totalOperations');
    });
  });

  describe('error handling', () => {
    it('should throw error if not initialized', () => {
      const uninitializedManager = CacheManager.getInstance();
      (uninitializedManager as any).isInitialized = false;
      
      expect(() => uninitializedManager.get('key1')).rejects.toThrow('Cache manager not initialized');
    });

    it('should handle cache operation errors', async () => {
      const mockCache = cacheManager['cache'];
      mockCache.get = vi.fn().mockRejectedValue(new Error('Cache error'));
      
      await expect(cacheManager.get('key1')).rejects.toThrow('Cache error');
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await expect(cacheManager.shutdown()).resolves.not.toThrow();
    });
  });
});