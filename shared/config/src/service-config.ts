import { ValidationUtils } from '@devflow/shared-utils';

export interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  healthCheckPath: string;
  metricsPath: string;
  shutdownTimeout: number;
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
  cors: {
    origins: string[];
    credentials: boolean;
  };
}

export interface ExternalServiceConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  apiKey?: string;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export interface ServicesConfig {
  apiGateway: ServiceConfig;
  orchestration: ServiceConfig;
  analytics: ServiceConfig;
  automation: ServiceConfig;
  integration: ServiceConfig;
}

export class ServiceConfigManager {
  private static instance: ServiceConfigManager;
  private services: ServicesConfig;

  private constructor() {
    this.services = this.loadServicesConfig();
    this.validateConfigs();
  }

  static getInstance(): ServiceConfigManager {
    if (!ServiceConfigManager.instance) {
      ServiceConfigManager.instance = new ServiceConfigManager();
    }
    return ServiceConfigManager.instance;
  }

  private loadServicesConfig(): ServicesConfig {
    return {
      apiGateway: {
        name: 'api-gateway',
        version: process.env.API_GATEWAY_VERSION || '1.0.0',
        port: parseInt(process.env.API_GATEWAY_PORT || '3000', 10),
        healthCheckPath: '/health',
        metricsPath: '/metrics',
        shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10),
        rateLimiting: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
        },
        cors: {
          origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
          credentials: process.env.CORS_CREDENTIALS === 'true'
        }
      },
      orchestration: {
        name: 'orchestration',
        version: process.env.ORCHESTRATION_VERSION || '1.0.0',
        port: parseInt(process.env.ORCHESTRATION_PORT || '3001', 10),
        healthCheckPath: '/health',
        metricsPath: '/metrics',
        shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10),
        rateLimiting: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)
        },
        cors: {
          origins: ['http://localhost:3000'],
          credentials: false
        }
      },
      analytics: {
        name: 'analytics',
        version: process.env.ANALYTICS_VERSION || '1.0.0',
        port: parseInt(process.env.ANALYTICS_PORT || '3002', 10),
        healthCheckPath: '/health',
        metricsPath: '/metrics',
        shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10),
        rateLimiting: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '500', 10)
        },
        cors: {
          origins: ['http://localhost:3000'],
          credentials: false
        }
      },
      automation: {
        name: 'automation',
        version: process.env.AUTOMATION_VERSION || '1.0.0',
        port: parseInt(process.env.AUTOMATION_PORT || '3003', 10),
        healthCheckPath: '/health',
        metricsPath: '/metrics',
        shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10),
        rateLimiting: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '200', 10)
        },
        cors: {
          origins: ['http://localhost:3000'],
          credentials: false
        }
      },
      integration: {
        name: 'integration',
        version: process.env.INTEGRATION_VERSION || '1.0.0',
        port: parseInt(process.env.INTEGRATION_PORT || '3004', 10),
        healthCheckPath: '/health',
        metricsPath: '/metrics',
        shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '10000', 10),
        rateLimiting: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '300', 10)
        },
        cors: {
          origins: ['http://localhost:3000'],
          credentials: false
        }
      }
    };
  }

  private validateConfigs(): void {
    Object.values(this.services).forEach((config) => {
      ValidationUtils.validateRequired(config.name, 'service name');
      ValidationUtils.validateRequired(config.version, 'service version');
      ValidationUtils.validateRange(config.port, 'service port', 1, 65535);
      ValidationUtils.validateRange(config.shutdownTimeout, 'shutdown timeout', 1000, 60000);
      ValidationUtils.validateRange(config.rateLimiting.windowMs, 'rate limit window', 1000);
      ValidationUtils.validateRange(config.rateLimiting.maxRequests, 'rate limit max requests', 1);
    });
  }

  getServiceConfig(serviceName: keyof ServicesConfig): ServiceConfig {
    return { ...this.services[serviceName] };
  }

  getAllServicesConfig(): ServicesConfig {
    return { ...this.services };
  }

  getExternalServiceConfig(serviceName: string): ExternalServiceConfig {
    const baseUrl = process.env[`${serviceName.toUpperCase()}_BASE_URL`];
    const timeout = parseInt(process.env[`${serviceName.toUpperCase()}_TIMEOUT`] || '30000', 10);
    const retries = parseInt(process.env[`${serviceName.toUpperCase()}_RETRIES`] || '3', 10);
    const apiKey = process.env[`${serviceName.toUpperCase()}_API_KEY`];
    const requestsPerMinute = parseInt(process.env[`${serviceName.toUpperCase()}_RATE_LIMIT_MINUTE`] || '60', 10);
    const requestsPerHour = parseInt(process.env[`${serviceName.toUpperCase()}_RATE_LIMIT_HOUR`] || '1000', 10);

    if (!baseUrl) {
      throw new Error(`Base URL not configured for external service: ${serviceName}`);
    }

    return {
      baseUrl,
      timeout,
      retries,
      apiKey,
      rateLimits: {
        requestsPerMinute,
        requestsPerHour
      }
    };
  }
}