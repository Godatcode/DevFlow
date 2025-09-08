import { UUID } from '@devflow/shared-types';
import { GatewayRequest } from '../types';
import { RateLimitConfig } from '../interfaces';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export interface RateLimitKey {
  identifier: string;
  window: string;
}

export interface RateLimitStore {
  get(key: string): Promise<number | string | null>;
  set(key: string, value: number | string, ttl: number): Promise<void>;
  increment(key: string, ttl: number): Promise<number>;
  delete(key: string): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, { value: number | string; expires: number }> = new Map();

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return typeof entry.value === 'number' ? entry.value : parseInt(entry.value, 10);
  }

  async set(key: string, value: number | string, ttl: number): Promise<void> {
    this.store.set(key, {
      value,
      expires: Date.now() + ttl * 1000
    });
  }

  async increment(key: string, ttl: number): Promise<number> {
    const current = await this.get(key);
    const newValue = (current || 0) + 1;
    await this.set(key, newValue, ttl);
    return newValue;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expires < now) {
        this.store.delete(key);
      }
    }
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  private redis: any; // Redis client interface

  constructor(redisClient: any) {
    this.redis = redisClient;
  }

  async get(key: string): Promise<number | string | null> {
    const value = await this.redis.get(key);
    return value;
  }

  async set(key: string, value: number | string, ttl: number): Promise<void> {
    await this.redis.setex(key, ttl, value);
  }

  async increment(key: string, ttl: number): Promise<number> {
    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, ttl);
    const results = await multi.exec();
    return results[0][1]; // Return the incremented value
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export interface RateLimiterConfig {
  store: RateLimitStore;
  keyGenerator?: (request: GatewayRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (request: GatewayRequest, limit: RateLimitConfig) => void;
}

export class RateLimiter {
  protected store: RateLimitStore;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.store = config.store;
  }

  /**
   * Check if request is within rate limit
   */
  async checkLimit(request: GatewayRequest, limitConfig: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.generateKey(request, limitConfig);
    const windowStart = this.getWindowStart(limitConfig.windowMs);
    const windowKey = `${key}:${windowStart}`;

    const current = await this.store.get(windowKey);
    const count = current ? parseInt(current.toString(), 10) : 0;

    if (count >= limitConfig.maxRequests) {
      const resetTime = new Date(windowStart + limitConfig.windowMs);
      const retryAfter = Math.ceil((resetTime.getTime() - Date.now()) / 1000);

      if (this.config.onLimitReached) {
        this.config.onLimitReached(request, limitConfig);
      }

      return {
        allowed: false,
        limit: limitConfig.maxRequests,
        remaining: 0,
        resetTime,
        retryAfter
      };
    }

    // Increment counter
    const newCount = await this.store.increment(windowKey, Math.ceil(limitConfig.windowMs / 1000));

    return {
      allowed: true,
      limit: limitConfig.maxRequests,
      remaining: Math.max(0, limitConfig.maxRequests - newCount),
      resetTime: new Date(windowStart + limitConfig.windowMs)
    };
  }

  /**
   * Apply multiple rate limits
   */
  async checkMultipleLimits(request: GatewayRequest, limits: RateLimitConfig[]): Promise<RateLimitResult> {
    for (const limit of limits) {
      const result = await this.checkLimit(request, limit);
      if (!result.allowed) {
        return result;
      }
    }

    // Return the most restrictive limit info
    const mostRestrictive = limits.reduce((prev, current) => 
      prev.maxRequests < current.maxRequests ? prev : current
    );

    return await this.checkLimit(request, mostRestrictive);
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetLimit(request: GatewayRequest, limitConfig: RateLimitConfig): Promise<void> {
    const key = this.generateKey(request, limitConfig);
    const windowStart = this.getWindowStart(limitConfig.windowMs);
    const windowKey = `${key}:${windowStart}`;

    await this.store.delete(windowKey);
  }

  /**
   * Get current rate limit status
   */
  async getStatus(request: GatewayRequest, limitConfig: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.generateKey(request, limitConfig);
    const windowStart = this.getWindowStart(limitConfig.windowMs);
    const windowKey = `${key}:${windowStart}`;

    const current = await this.store.get(windowKey);
    const count = current ? parseInt(current.toString(), 10) : 0;

    return {
      allowed: count < limitConfig.maxRequests,
      limit: limitConfig.maxRequests,
      remaining: Math.max(0, limitConfig.maxRequests - count),
      resetTime: new Date(windowStart + limitConfig.windowMs)
    };
  }

  /**
   * Generate rate limit key
   */
  protected generateKey(request: GatewayRequest, limitConfig: RateLimitConfig): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Default key generation strategy
    const parts = ['rate_limit'];

    // Add user ID if authenticated
    if (request.context.userId) {
      parts.push(`user:${request.context.userId}`);
    } else {
      // Fall back to IP address
      parts.push(`ip:${request.context.ipAddress}`);
    }

    // Add route pattern
    parts.push(`route:${request.context.route}`);

    // Add method
    parts.push(`method:${request.context.method}`);

    return parts.join(':');
  }

  /**
   * Get window start time
   */
  private getWindowStart(windowMs: number): number {
    return Math.floor(Date.now() / windowMs) * windowMs;
  }
}

export class SlidingWindowRateLimiter extends RateLimiter {
  /**
   * Check rate limit using sliding window algorithm
   */
  async checkLimit(request: GatewayRequest, limitConfig: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.generateKey(request, limitConfig);
    const now = Date.now();
    const windowStart = now - limitConfig.windowMs;

    // For sliding window, we need to track individual request timestamps
    // This is a simplified implementation - in production, use Redis sorted sets
    const requestKey = `${key}:requests`;
    const current = await this.store.get(requestKey);
    
    // Parse stored timestamps (simplified)
    let timestamps: number[] = [];
    if (current) {
      try {
        const data = typeof current === 'string' ? current : current.toString();
        timestamps = JSON.parse(data);
        if (!Array.isArray(timestamps)) {
          timestamps = [];
        }
      } catch {
        timestamps = [];
      }
    }
    
    // Remove old timestamps outside the window
    const validTimestamps = timestamps.filter(ts => ts > windowStart);
    
    if (validTimestamps.length >= limitConfig.maxRequests) {
      const oldestValidTimestamp = Math.min(...validTimestamps);
      const resetTime = new Date(oldestValidTimestamp + limitConfig.windowMs);
      const retryAfter = Math.ceil((resetTime.getTime() - now) / 1000);

      return {
        allowed: false,
        limit: limitConfig.maxRequests,
        remaining: 0,
        resetTime,
        retryAfter
      };
    }

    // Add current timestamp
    validTimestamps.push(now);
    
    // Store updated timestamps
    await this.store.set(requestKey, JSON.stringify(validTimestamps), Math.ceil(limitConfig.windowMs / 1000));

    return {
      allowed: true,
      limit: limitConfig.maxRequests,
      remaining: limitConfig.maxRequests - validTimestamps.length,
      resetTime: new Date(now + limitConfig.windowMs)
    };
  }

  protected generateKey(request: GatewayRequest, limitConfig: RateLimitConfig): string {
    // Use parent's key generation but add sliding window prefix
    const baseKey = super.generateKey(request, limitConfig);
    return `sliding:${baseKey}`;
  }
}

export class TokenBucketRateLimiter extends RateLimiter {
  /**
   * Check rate limit using token bucket algorithm
   */
  async checkLimit(request: GatewayRequest, limitConfig: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.generateKey(request, limitConfig);
    const bucketKey = `${key}:bucket`;
    
    const now = Date.now();
    const refillRate = limitConfig.maxRequests / (limitConfig.windowMs / 1000); // tokens per second
    
    // Get current bucket state
    const bucketData = await this.store.get(bucketKey);
    let bucket: { tokens: number; lastRefill: number };
    
    if (bucketData) {
      try {
        const data = typeof bucketData === 'string' ? bucketData : bucketData.toString();
        bucket = JSON.parse(data);
      } catch {
        bucket = {
          tokens: limitConfig.maxRequests,
          lastRefill: now
        };
      }
    } else {
      bucket = {
        tokens: limitConfig.maxRequests,
        lastRefill: now
      };
    }

    // Refill tokens based on time elapsed
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timePassed * refillRate);
    bucket.tokens = Math.min(limitConfig.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const timeToNextToken = (1 / refillRate) * 1000;
      const retryAfter = Math.ceil(timeToNextToken / 1000);

      return {
        allowed: false,
        limit: limitConfig.maxRequests,
        remaining: 0,
        resetTime: new Date(now + timeToNextToken),
        retryAfter
      };
    }

    // Consume a token
    bucket.tokens -= 1;

    // Store updated bucket state
    await this.store.set(bucketKey, JSON.stringify(bucket), Math.ceil(limitConfig.windowMs / 1000));

    return {
      allowed: true,
      limit: limitConfig.maxRequests,
      remaining: Math.floor(bucket.tokens),
      resetTime: new Date(now + (limitConfig.maxRequests - bucket.tokens) / refillRate * 1000)
    };
  }

  protected generateKey(request: GatewayRequest, limitConfig: RateLimitConfig): string {
    // Use parent's key generation but add token bucket prefix
    const baseKey = super.generateKey(request, limitConfig);
    return `bucket:${baseKey}`;
  }
}