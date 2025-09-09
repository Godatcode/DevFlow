import { QueryCache } from './interfaces';
import { Logger } from './mocks/shared-utils';

interface CacheEntry {
  value: any;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export class InMemoryQueryCache implements QueryCache {
  private cache: Map<string, CacheEntry>;
  private logger: Logger;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    evictions: number;
  };
  private maxSize: number;
  private defaultTtl: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: {
    maxSize?: number;
    defaultTtl?: number;
    cleanupInterval?: number;
  } = {}) {
    this.cache = new Map();
    this.logger = new Logger('InMemoryQueryCache');
    this.maxSize = options.maxSize || 1000;
    this.defaultTtl = options.defaultTtl || 300000; // 5 minutes
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };

    // Start cleanup interval
    if (options.cleanupInterval !== 0) {
      this.startCleanup(options.cleanupInterval || 60000); // 1 minute
    }
  }

  async get(key: string): Promise<any> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    return entry.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    // Ensure we don't exceed max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      await this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.stats.sets++;

    this.logger.debug('Cache entry set', {
      key: this.hashKey(key),
      ttl: entry.ttl,
      cacheSize: this.cache.size
    });
  }

  async invalidate(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.logger.info('Cache invalidated by pattern', {
      pattern,
      keysInvalidated: keysToDelete.length
    });
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.resetStats();
    this.logger.info('Cache cleared');
  }

  async getStats(): Promise<{
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  }> {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate
    };
  }

  // Generate cache key for query and parameters
  generateKey(query: string, parameters?: any[]): string {
    const normalizedQuery = this.normalizeQuery(query);
    const paramString = parameters ? JSON.stringify(parameters) : '';
    return `${normalizedQuery}:${paramString}`;
  }

  // Check if query should be cached
  shouldCache(query: string): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Don't cache write operations
    if (normalizedQuery.startsWith('insert') ||
        normalizedQuery.startsWith('update') ||
        normalizedQuery.startsWith('delete') ||
        normalizedQuery.startsWith('create') ||
        normalizedQuery.startsWith('drop') ||
        normalizedQuery.startsWith('alter')) {
      return false;
    }

    // Don't cache queries with functions that return different results
    if (normalizedQuery.includes('now()') ||
        normalizedQuery.includes('current_timestamp') ||
        normalizedQuery.includes('random()') ||
        normalizedQuery.includes('uuid_generate')) {
      return false;
    }

    return true;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async evictLeastRecentlyUsed(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      
      this.logger.debug('Evicted LRU cache entry', {
        key: this.hashKey(oldestKey),
        lastAccessed: new Date(oldestTime).toISOString()
      });
    }
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private hashKey(key: string): string {
    // Simple hash for logging (don't log full queries for security)
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private startCleanup(interval: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, interval);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    if (keysToDelete.length > 0) {
      this.logger.debug('Cleaned up expired cache entries', {
        entriesRemoved: keysToDelete.length,
        cacheSize: this.cache.size
      });
    }
  }

  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}