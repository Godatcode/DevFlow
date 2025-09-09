import { MultiLayerCache } from './multi-layer-cache';
import { CachePerformanceMonitor, PerformanceThresholds } from './performance-monitor';
import { createDefaultInvalidationStrategies } from './invalidation-strategies';
import { CacheConfiguration, CacheOptions, CacheMetrics } from './interfaces';
import { Logger } from './mocks/shared-utils';

export class CacheManager {
  private static instance: CacheManager;
  private cache!: MultiLayerCache;
  private performanceMonitor!: CachePerformanceMonitor;
  private logger: Logger;
  private isInitialized = false;

  private constructor() {
    this.logger = new Logger('CacheManager');
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  initialize(config?: Partial<CacheConfiguration>): void {
    if (this.isInitialized) {
      this.logger.warn('Cache manager already initialized');
      return;
    }

    const defaultConfig: CacheConfiguration = {
      layers: [
        {
          name: 'memory',
          type: 'memory',
          priority: 1,
          maxSize: 10000,
          ttl: 300 // 5 minutes
        },
        {
          name: 'redis',
          type: 'redis',
          priority: 2,
          ttl: 3600 // 1 hour
        }
      ],
      defaultTtl: 300,
      maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      compressionThreshold: 1024, // 1KB
      enableMetrics: true,
      invalidationStrategies: ['time-based', 'workflow-based', 'user-based', 'project-based', 'metrics-based']
    };

    const finalConfig = { ...defaultConfig, ...config };

    // Initialize multi-layer cache
    this.cache = new MultiLayerCache(finalConfig);

    // Initialize performance monitor
    const performanceThresholds: PerformanceThresholds = {
      maxResponseTime: 2000, // 2 seconds
      minHitRate: 0.8, // 80%
      maxMemoryUsage: finalConfig.maxMemoryUsage,
      maxErrorRate: 0.05 // 5%
    };

    this.performanceMonitor = new CachePerformanceMonitor(performanceThresholds);

    // Register default invalidation strategies
    const strategies = createDefaultInvalidationStrategies();
    for (const strategy of strategies) {
      this.cache.registerInvalidationStrategy(strategy);
    }

    // Set up performance monitoring alerts
    this.performanceMonitor.onAlert((alert) => {
      this.logger.warn('Cache performance alert', alert);
      // In production, you might want to send this to a monitoring system
    });

    this.isInitialized = true;
    this.logger.info('Cache manager initialized', { config: finalConfig });
  }

  async get<T>(key: string): Promise<T | null> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    try {
      const result = await this.cache.get<T>(key);
      const responseTime = Date.now() - startTime;
      
      this.performanceMonitor.recordResponseTime(responseTime);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.performanceMonitor.recordEvent({
        type: 'error' as any,
        key,
        layer: 'manager',
        timestamp: new Date(),
        metadata: { error: (error as Error).message }
      }, responseTime);
      throw error;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    try {
      await this.cache.set(key, value, options);
      const responseTime = Date.now() - startTime;
      
      this.performanceMonitor.recordResponseTime(responseTime);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.performanceMonitor.recordEvent({
        type: 'error' as any,
        key,
        layer: 'manager',
        timestamp: new Date(),
        metadata: { error: (error as Error).message }
      }, responseTime);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    this.ensureInitialized();
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    return this.cache.clear();
  }

  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    return this.cache.has(key);
  }

  async invalidateByTag(tag: string): Promise<void> {
    this.ensureInitialized();
    return this.cache.invalidateByTag(tag);
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    this.ensureInitialized();
    return this.cache.invalidateByPattern(pattern);
  }

  async applyInvalidationStrategy(strategyName: string, context: any): Promise<void> {
    this.ensureInitialized();
    return this.cache.applyInvalidationStrategy(strategyName, context);
  }

  async getMetrics(): Promise<CacheMetrics> {
    this.ensureInitialized();
    
    const metrics = await this.cache.getMetrics();
    this.performanceMonitor.analyzeMetrics(metrics);
    
    return metrics;
  }

  getPerformanceSummary() {
    this.ensureInitialized();
    return this.performanceMonitor.getPerformanceSummary();
  }

  // Convenience methods for common caching patterns
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options);
    
    return value;
  }

  async mget<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    // For now, we'll get each key individually
    // In production, you might want to optimize this with batch operations
    for (const key of keys) {
      const value = await this.get<T>(key);
      results.set(key, value);
    }
    
    return results;
  }

  async mset<T>(entries: Map<string, T>, options?: CacheOptions): Promise<void> {
    // Set each entry individually
    // In production, you might want to optimize this with batch operations
    const promises = Array.from(entries.entries()).map(([key, value]) =>
      this.set(key, value, options)
    );
    
    await Promise.all(promises);
  }

  // Cache warming methods
  async warmCache(keys: string[], factory: (key: string) => Promise<any>): Promise<void> {
    this.logger.info('Starting cache warming', { keyCount: keys.length });
    
    const promises = keys.map(async (key) => {
      try {
        const exists = await this.has(key);
        if (!exists) {
          const value = await factory(key);
          await this.set(key, value);
        }
      } catch (error) {
        this.logger.error('Error warming cache key', { key, error });
      }
    });

    await Promise.allSettled(promises);
    this.logger.info('Cache warming completed');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Cache manager not initialized. Call initialize() first.');
    }
  }

  async shutdown(): Promise<void> {
    if (this.cache) {
      await this.cache.shutdown();
    }
    this.isInitialized = false;
    this.logger.info('Cache manager shutdown complete');
  }
}