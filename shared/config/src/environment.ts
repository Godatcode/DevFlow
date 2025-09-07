import { ValidationUtils } from '@devflow/shared-utils';

export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

export interface EnvironmentConfig {
  NODE_ENV: Environment;
  PORT: number;
  LOG_LEVEL: string;
  API_VERSION: string;
  CORS_ORIGINS: string[];
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ENCRYPTION_KEY: string;
}

export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private config: EnvironmentConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  private loadConfig(): EnvironmentConfig {
    return {
      NODE_ENV: (process.env.NODE_ENV as Environment) || Environment.DEVELOPMENT,
      PORT: parseInt(process.env.PORT || '3000', 10),
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      API_VERSION: process.env.API_VERSION || 'v1',
      CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key',
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-chars-long'
    };
  }

  private validateConfig(): void {
    ValidationUtils.validateRequired(this.config.JWT_SECRET, 'JWT_SECRET');
    ValidationUtils.validateRequired(this.config.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
    
    if (this.config.NODE_ENV === Environment.PRODUCTION) {
      if (this.config.JWT_SECRET === 'dev-secret-key') {
        throw new Error('JWT_SECRET must be set in production');
      }
      if (this.config.ENCRYPTION_KEY === 'dev-encryption-key-32-chars-long') {
        throw new Error('ENCRYPTION_KEY must be set in production');
      }
    }

    ValidationUtils.validateRange(this.config.PORT, 'PORT', 1, 65535);
    ValidationUtils.validateStringLength(this.config.ENCRYPTION_KEY, 'ENCRYPTION_KEY', 32, 32);
  }

  get<K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] {
    return this.config[key];
  }

  getAll(): EnvironmentConfig {
    return { ...this.config };
  }

  isDevelopment(): boolean {
    return this.config.NODE_ENV === Environment.DEVELOPMENT;
  }

  isProduction(): boolean {
    return this.config.NODE_ENV === Environment.PRODUCTION;
  }

  isTest(): boolean {
    return this.config.NODE_ENV === Environment.TEST;
  }
}