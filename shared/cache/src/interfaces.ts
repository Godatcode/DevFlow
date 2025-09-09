export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  compress?: boolean;
  serialize?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  memoryUsage?: number;
}

export interface CacheLayer {
  name: string;
  priority: number;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  getStats(): Promise<CacheStats>;
  invalidateByTag(tag: string): Promise<void>;
}

export interface CacheInvalidationStrategy {
  name: string;
  shouldInvalidate(key: string, tags: string[], context: any): boolean;
  getInvalidationKeys(context: any): string[];
}

export interface CacheMetrics {
  layerStats: Map<string, CacheStats>;
  totalHits: number;
  totalMisses: number;
  overallHitRate: number;
  averageResponseTime: number;
  memoryUsage: number;
}

export interface CacheConfiguration {
  layers: CacheLayerConfig[];
  defaultTtl: number;
  maxMemoryUsage: number;
  compressionThreshold: number;
  enableMetrics: boolean;
  invalidationStrategies: string[];
}

export interface CacheLayerConfig {
  name: string;
  type: 'memory' | 'redis' | 'custom';
  priority: number;
  maxSize?: number;
  ttl?: number;
  options?: Record<string, any>;
}

export enum CacheEventType {
  HIT = 'hit',
  MISS = 'miss',
  SET = 'set',
  DELETE = 'delete',
  INVALIDATE = 'invalidate',
  ERROR = 'error'
}

export interface CacheEvent {
  type: CacheEventType;
  key: string;
  layer: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}