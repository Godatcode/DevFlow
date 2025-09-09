import NodeCache from 'node-cache';
import { CacheLayer, CacheOptions, CacheStats, CacheEvent, CacheEventType } from '../interfaces';
import { Logger } from '../mocks/shared-utils';

export class MemoryCacheLayer implements CacheLayer {
  public readonly name = 'memory';
  public readonly priority = 1;
  
  private cache: NodeCache;
  private stats: CacheStats;
  private logger: Logger;
  private tagIndex: Map<string, Set<string>>;

  constructor(options: { maxSize?: number; ttl?: number; checkPeriod?: number } = {}) {
    this.cache = new NodeCache({
      stdTTL: options.ttl || 300, // 5 minutes default
      checkperiod: options.checkPeriod || 60, // Check for expired keys every minute
      maxKeys: options.maxSize || 10000,
      useClones: false // Better performance, but be careful with object mutations
    });

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0
    };

    this.tagIndex = new Map();
    this.logger = new Logger('MemoryCacheLayer');

    // Set up event listeners for stats tracking
    this.setupEventListeners();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = this.cache.get<T>(key);
      
      if (value !== undefined) {
        this.stats.hits++;
        this.updateHitRate();
        this.emitEvent(CacheEventType.HIT, key);
        return value;
      }

      this.stats.misses++;
      this.updateHitRate();
      this.emitEvent(CacheEventType.MISS, key);
      return null;
    } catch (error) {
      this.logger.error('Error getting from memory cache', { key, error });
      this.emitEvent(CacheEventType.ERROR, key, { error: (error as Error).message });
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const ttl = options.ttl || this.cache.options.stdTTL || 300;
      
      // Store the value
      this.cache.set(key, value, ttl);
      
      // Update tag index
      if (options.tags) {
        this.updateTagIndex(key, options.tags);
      }

      this.stats.sets++;
      this.emitEvent(CacheEventType.SET, key, { ttl, tags: options.tags });
    } catch (error) {
      this.logger.error('Error setting memory cache', { key, error });
      this.emitEvent(CacheEventType.ERROR, key, { error: (error as Error).message });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const deleted = this.cache.del(key);
      
      if (deleted > 0) {
        this.removeFromTagIndex(key);
        this.stats.deletes++;
        this.emitEvent(CacheEventType.DELETE, key);
      }
    } catch (error) {
      this.logger.error('Error deleting from memory cache', { key, error });
      this.emitEvent(CacheEventType.ERROR, key, { error: (error as Error).message });
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      this.cache.flushAll();
      this.tagIndex.clear();
      this.resetStats();
    } catch (error) {
      this.logger.error('Error clearing memory cache', { error });
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async getStats(): Promise<CacheStats> {
    const keys = this.cache.keys();
    const memoryUsage = this.estimateMemoryUsage();

    return {
      ...this.stats,
      memoryUsage
    };
  }

  async invalidateByTag(tag: string): Promise<void> {
    try {
      const keys = this.tagIndex.get(tag);
      
      if (keys) {
        for (const key of keys) {
          await this.delete(key);
        }
        this.tagIndex.delete(tag);
        this.emitEvent(CacheEventType.INVALIDATE, `tag:${tag}`, { keysInvalidated: keys.size });
      }
    } catch (error) {
      this.logger.error('Error invalidating by tag', { tag, error });
      throw error;
    }
  }

  private setupEventListeners(): void {
    this.cache.on('expired', (key: string) => {
      this.removeFromTagIndex(key);
      this.emitEvent(CacheEventType.DELETE, key, { reason: 'expired' });
    });

    this.cache.on('del', (key: string) => {
      this.removeFromTagIndex(key);
    });
  }

  private updateTagIndex(key: string, tags: string[]): void {
    // Remove key from old tags
    this.removeFromTagIndex(key);

    // Add key to new tags
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  private removeFromTagIndex(key: string): void {
    for (const [tag, keys] of this.tagIndex.entries()) {
      keys.delete(key);
      if (keys.size === 0) {
        this.tagIndex.delete(tag);
      }
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage
    const keys = this.cache.keys();
    let totalSize = 0;

    for (const key of keys) {
      const value = this.cache.get(key);
      if (value !== undefined) {
        totalSize += JSON.stringify(value).length * 2; // Rough estimate
      }
    }

    return totalSize;
  }

  private emitEvent(type: CacheEventType, key: string, metadata?: Record<string, any>): void {
    const event: CacheEvent = {
      type,
      key,
      layer: this.name,
      timestamp: new Date(),
      metadata
    };

    // In a real implementation, you might emit this to an event bus
    this.logger.debug('Cache event', event);
  }
}