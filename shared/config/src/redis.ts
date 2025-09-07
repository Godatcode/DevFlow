import { ValidationUtils } from '@devflow/shared-utils';

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
    this.config = this.loadConfig();
    this.validateConfig();
  }

  static getInstance(): RedisConfigManager {
    if (!RedisConfigManager.instance) {
      RedisConfigManager.instance = new RedisConfigManager();
    }
    return RedisConfigManager.instance;
  }

  private loadConfig(): RedisConfig {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
      enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false',
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
      commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'devflow:'
    };
  }

  private validateConfig(): void {
    ValidationUtils.validateRequired(this.config.host, 'REDIS_HOST');
    ValidationUtils.validateRange(this.config.port, 'REDIS_PORT', 1, 65535);
    ValidationUtils.validateRange(this.config.database, 'REDIS_DB', 0, 15);
    ValidationUtils.validateRange(this.config.maxRetries, 'REDIS_MAX_RETRIES', 0, 10);
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