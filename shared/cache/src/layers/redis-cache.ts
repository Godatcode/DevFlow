import Redis from 'ioredis';
import { CacheLayer, CacheOptions, CacheStats, CacheEvent, CacheEventType } from '../interfaces';
import { Logger } from '../mocks/shared-utils';
import { RedisConfigManager } from '../mocks/shared-config';

export class RedisCacheLayer implements CacheLayer {
  public readonly name = 'redis';
  public readonly priority = 2;
  
  private redis: Redis;
  private stats: CacheStats;
  private logger: Logger;
  private compressionThreshold: number;

  constructor(options: { compressionThreshold?: number } = {}) {
    const redisConfig = RedisConfigManager.getInstance();
    this.redis = new Redis(redisConfig.getConnectionOptions());
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0
    };

    this.compressionThreshold = options.compressionThreshold || 1024; // 1KB
    this.logger = new Logger('RedisCacheLayer');

    this.setupEventListeners();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await this.redis.get(key);
      
      if (result !== null) {
        this.stats.hits++;
        this.updateHitRate();
        this.emitEvent(CacheEventType.HIT, key);
        
        return this.deserializeValue<T>(result);
      }

      this.stats.misses++;
      this.updateHitRate();
      this.emitEvent(CacheEventType.MISS, key);
      return null;
    } catch (error) {
      this.logger.error('Error getting from Redis cache', { key, error });
      this.emitEvent(CacheEventType.ERROR, key, { error: (error as Error).message });
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const serializedValue = this.serializeValue(value, options);
      const ttl = options.ttl;

      if (ttl) {
        await this.redis.setex(key, ttl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }

      // Store tags for invalidation
      if (options.tags) {
        await this.storeTags(key, options.tags);
      }

      this.stats.sets++;
      this.emitEvent(CacheEventType.SET, key, { ttl, tags: options.tags });
    } catch (error) {
      this.logger.error('Error setting Redis cache', { key, error });
      this.emitEvent(CacheEventType.ERROR, key, { error: (error as Error).message });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const deleted = await this.redis.del(key);
      
      if (deleted > 0) {
        await this.removeFromTags(key);
        this.stats.deletes++;
        this.emitEvent(CacheEventType.DELETE, key);
      }
    } catch (error) {
      this.logger.error('Error deleting from Redis cache', { key, error });
      this.emitEvent(CacheEventType.ERROR, key, { error: (error as Error).message });
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushdb();
      this.resetStats();
    } catch (error) {
      this.logger.error('Error clearing Redis cache', { error });
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error('Error checking key existence in Redis', { key, error });
      return false;
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1], 10) : 0;

      return {
        ...this.stats,
        memoryUsage
      };
    } catch (error) {
      this.logger.error('Error getting Redis stats', { error });
      return this.stats;
    }
  }

  async invalidateByTag(tag: string): Promise<void> {
    try {
      const tagKey = this.getTagKey(tag);
      const keys = await this.redis.smembers(tagKey);
      
      if (keys.length > 0) {
        // Delete all keys with this tag
        await this.redis.del(...keys);
        
        // Remove the tag set
        await this.redis.del(tagKey);
        
        this.emitEvent(CacheEventType.INVALIDATE, `tag:${tag}`, { keysInvalidated: keys.length });
      }
    } catch (error) {
      this.logger.error('Error invalidating by tag', { tag, error });
      throw error;
    }
  }

  private async storeTags(key: string, tags: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const tag of tags) {
      const tagKey = this.getTagKey(tag);
      pipeline.sadd(tagKey, key);
    }
    
    await pipeline.exec();
  }

  private async removeFromTags(key: string): Promise<void> {
    try {
      // This is a simplified approach - in production, you might want to maintain
      // a reverse index of key -> tags for more efficient cleanup
      const pattern = this.getTagKey('*');
      const tagKeys = await this.redis.keys(pattern);
      
      if (tagKeys.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const tagKey of tagKeys) {
          pipeline.srem(tagKey, key);
        }
        await pipeline.exec();
      }
    } catch (error) {
      this.logger.warn('Error removing key from tags', { key, error });
    }
  }

  private getTagKey(tag: string): string {
    return `tag:${tag}`;
  }

  private serializeValue<T>(value: T, options: CacheOptions): string {
    const serialized = JSON.stringify(value);
    
    // TODO: Add compression if value is large and compression is enabled
    if (options.compress && serialized.length > this.compressionThreshold) {
      // Implement compression here (e.g., using zlib)
      this.logger.debug('Value compressed', { originalSize: serialized.length });
    }
    
    return serialized;
  }

  private deserializeValue<T>(value: string): T {
    try {
      // TODO: Add decompression logic if needed
      return JSON.parse(value);
    } catch (error) {
      this.logger.error('Error deserializing value', { error });
      throw new Error('Failed to deserialize cached value');
    }
  }

  private setupEventListeners(): void {
    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', { error });
    });

    this.redis.on('connect', () => {
      this.logger.info('Connected to Redis');
    });

    this.redis.on('ready', () => {
      this.logger.info('Redis connection ready');
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
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

  private emitEvent(type: CacheEventType, key: string, metadata?: Record<string, any>): void {
    const event: CacheEvent = {
      type,
      key,
      layer: this.name,
      timestamp: new Date(),
      metadata
    };

    this.logger.debug('Cache event', event);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}