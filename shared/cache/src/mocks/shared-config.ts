// Mock implementations for shared config

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  maxRetries: number;
  retryDelayOnFailover: number;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  commandTimeout: number;
  keyPrefix: string;
}

export class RedisConfigManager {
  private static instance: RedisConfigManager;
  private config: RedisConfig;

  private constructor() {
    this.config = {
      host: 'localhost',
      port: 6379,
      password: undefined,
      database: 0,
      maxRetries: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      keyPrefix: 'devflow:'
    };
  }

  static getInstance(): RedisConfigManager {
    if (!RedisConfigManager.instance) {
      RedisConfigManager.instance = new RedisConfigManager();
    }
    return RedisConfigManager.instance;
  }

  getConfig(): RedisConfig {
    return { ...this.config };
  }

  getConnectionOptions(): object {
    return {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.database,
      maxRetriesPerRequest: this.config.maxRetries,
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      enableOfflineQueue: this.config.enableOfflineQueue,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
      keyPrefix: this.config.keyPrefix
    };
  }
}