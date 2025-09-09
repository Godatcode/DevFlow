import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryCacheLayer } from '../layers/memory-cache';

describe('MemoryCacheLayer', () => {
  let cache: MemoryCacheLayer;

  beforeEach(() => {
    cache = new MemoryCacheLayer({ maxSize: 100, ttl: 60 });
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.has('key1')).toBe(true);
      expect(await cache.has('nonexistent')).toBe(false);
    });

    it('should clear all values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();
      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(false);
    });
  });

  describe('TTL functionality', () => {
    it('should respect TTL when setting values', async () => {
      await cache.set('key1', 'value1', { ttl: 1 }); // 1 second TTL
      
      // Should exist immediately
      expect(await cache.get('key1')).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(await cache.get('key1')).toBeNull();
    });
  });

  describe('tag-based invalidation', () => {
    it('should invalidate by tag', async () => {
      await cache.set('key1', 'value1', { tags: ['tag1', 'tag2'] });
      await cache.set('key2', 'value2', { tags: ['tag2', 'tag3'] });
      await cache.set('key3', 'value3', { tags: ['tag3'] });

      await cache.invalidateByTag('tag2');

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBe('value3');
    });
  });

  describe('statistics', () => {
    it('should track hit and miss statistics', async () => {
      await cache.set('key1', 'value1');
      
      // Hit
      await cache.get('key1');
      
      // Miss
      await cache.get('nonexistent');
      
      const stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track memory usage', async () => {
      await cache.set('key1', 'a'.repeat(1000));
      const stats = await cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      // Mock an error in the underlying cache
      const originalGet = cache['cache'].get;
      cache['cache'].get = vi.fn().mockImplementation(() => {
        throw new Error('Cache error');
      });

      const result = await cache.get('key1');
      expect(result).toBeNull();

      // Restore original method
      cache['cache'].get = originalGet;
    });
  });

  describe('complex data types', () => {
    it('should handle objects and arrays', async () => {
      const obj = { name: 'test', values: [1, 2, 3] };
      await cache.set('object', obj);
      const result = await cache.get('object');
      expect(result).toEqual(obj);
    });
  });
});