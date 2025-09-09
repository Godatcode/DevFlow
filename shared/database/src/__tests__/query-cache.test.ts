import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryQueryCache } from '../query-cache';

describe('InMemoryQueryCache', () => {
  let cache: InMemoryQueryCache;

  beforeEach(() => {
    cache = new InMemoryQueryCache({
      maxSize: 100,
      defaultTtl: 1000, // 1 second for testing
      cleanupInterval: 0 // Disable automatic cleanup for tests
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      await cache.set('key1', { data: 'test' });
      const result = await cache.get('key1');
      expect(result).toEqual({ data: 'test' });
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle TTL expiration', async () => {
      await cache.set('key1', 'value1', 100); // 100ms TTL
      
      // Should exist immediately
      expect(await cache.get('key1')).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      expect(await cache.get('key1')).toBeNull();
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      await cache.clear();
      
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate by pattern', async () => {
      await cache.set('user:1:profile', { name: 'John' });
      await cache.set('user:2:profile', { name: 'Jane' });
      await cache.set('post:1:content', { title: 'Test' });
      
      await cache.invalidate('user:*');
      
      expect(await cache.get('user:1:profile')).toBeNull();
      expect(await cache.get('user:2:profile')).toBeNull();
      expect(await cache.get('post:1:content')).toEqual({ title: 'Test' });
    });
  });

  describe('cache statistics', () => {
    it('should track hit and miss statistics', async () => {
      await cache.set('key1', 'value1');
      
      // Hit
      await cache.get('key1');
      
      // Miss
      await cache.get('nonexistent');
      
      const stats = await cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track cache size', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      const stats = await cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe('query key generation', () => {
    it('should generate consistent keys for same query and parameters', () => {
      const key1 = cache.generateKey('SELECT * FROM users WHERE id = $1', [123]);
      const key2 = cache.generateKey('SELECT * FROM users WHERE id = $1', [123]);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different parameters', () => {
      const key1 = cache.generateKey('SELECT * FROM users WHERE id = $1', [123]);
      const key2 = cache.generateKey('SELECT * FROM users WHERE id = $1', [456]);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('cache policy', () => {
    it('should not cache write operations', () => {
      expect(cache.shouldCache('INSERT INTO users VALUES ($1, $2)')).toBe(false);
      expect(cache.shouldCache('UPDATE users SET name = $1')).toBe(false);
      expect(cache.shouldCache('DELETE FROM users WHERE id = $1')).toBe(false);
    });

    it('should cache read operations', () => {
      expect(cache.shouldCache('SELECT * FROM users')).toBe(true);
      expect(cache.shouldCache('SELECT COUNT(*) FROM posts')).toBe(true);
    });

    it('should not cache queries with time-sensitive functions', () => {
      expect(cache.shouldCache('SELECT NOW()')).toBe(false);
      expect(cache.shouldCache('SELECT CURRENT_TIMESTAMP')).toBe(false);
      expect(cache.shouldCache('SELECT RANDOM()')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when max size is reached', async () => {
      const smallCache = new InMemoryQueryCache({ maxSize: 2, cleanupInterval: 0 });
      
      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      
      // Access key2 to make it more recently used than key1
      await smallCache.get('key2');
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Add key3, should evict key1 (least recently used)
      await smallCache.set('key3', 'value3');
      
      expect(await smallCache.get('key1')).toBeNull();
      expect(await smallCache.get('key2')).toBe('value2');
      expect(await smallCache.get('key3')).toBe('value3');
      
      smallCache.destroy();
    });
  });
});