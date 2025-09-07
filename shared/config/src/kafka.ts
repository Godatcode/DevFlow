import { ValidationUtils } from '@devflow/shared-utils';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  ssl: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  connectionTimeout: number;
  requestTimeout: number;
  retry: {
    initialRetryTime: number;
    retries: number;
  };
}

export interface KafkaTopicConfig {
  workflows: string;
  analytics: string;
  integrations: string;
  notifications: string;
  audit: string;
}

export class KafkaConfigManager {
  private static instance: KafkaConfigManager;
  private config: KafkaConfig;
  private topics: KafkaTopicConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.topics = this.loadTopics();
    this.validateConfig();
  }

  static getInstance(): KafkaConfigManager {
    if (!KafkaConfigManager.instance) {
      KafkaConfigManager.instance = new KafkaConfigManager();
    }
    return KafkaConfigManager.instance;
  }

  private loadConfig(): KafkaConfig {
    const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
    
    const config: KafkaConfig = {
      brokers,
      clientId: process.env.KAFKA_CLIENT_ID || 'devflow-client',
      groupId: process.env.KAFKA_GROUP_ID || 'devflow-group',
      ssl: process.env.KAFKA_SSL === 'true',
      connectionTimeout: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '3000', 10),
      requestTimeout: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || '30000', 10),
      retry: {
        initialRetryTime: parseInt(process.env.KAFKA_INITIAL_RETRY_TIME || '100', 10),
        retries: parseInt(process.env.KAFKA_RETRIES || '8', 10)
      }
    };

    // Add SASL configuration if credentials are provided
    if (process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD) {
      config.sasl = {
        mechanism: (process.env.KAFKA_SASL_MECHANISM as any) || 'plain',
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD
      };
    }

    return config;
  }

  private loadTopics(): KafkaTopicConfig {
    return {
      workflows: process.env.KAFKA_TOPIC_WORKFLOWS || 'devflow.workflows',
      analytics: process.env.KAFKA_TOPIC_ANALYTICS || 'devflow.analytics',
      integrations: process.env.KAFKA_TOPIC_INTEGRATIONS || 'devflow.integrations',
      notifications: process.env.KAFKA_TOPIC_NOTIFICATIONS || 'devflow.notifications',
      audit: process.env.KAFKA_TOPIC_AUDIT || 'devflow.audit'
    };
  }

  private validateConfig(): void {
    ValidationUtils.validateRequired(this.config.brokers, 'KAFKA_BROKERS');
    ValidationUtils.validateArrayLength(this.config.brokers, 'KAFKA_BROKERS', 1);
    ValidationUtils.validateRequired(this.config.clientId, 'KAFKA_CLIENT_ID');
    ValidationUtils.validateRequired(this.config.groupId, 'KAFKA_GROUP_ID');

    // Validate broker URLs
    this.config.brokers.forEach((broker, index) => {
      if (!broker.includes(':')) {
        throw new Error(`Invalid broker format at index ${index}: ${broker}`);
      }
    });

    // Validate SASL configuration if present
    if (this.config.sasl) {
      ValidationUtils.validateRequired(this.config.sasl.username, 'KAFKA_SASL_USERNAME');
      ValidationUtils.validateRequired(this.config.sasl.password, 'KAFKA_SASL_PASSWORD');
    }
  }

  getConfig(): KafkaConfig {
    return { ...this.config };
  }

  getTopics(): KafkaTopicConfig {
    return { ...this.topics };
  }

  getProducerConfig(): object {
    return {
      ...this.config,
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000
    };
  }

  getConsumerConfig(): object {
    return {
      ...this.config,
      sessionTimeout: 30000,
      rebalanceTimeout: 60000,
      heartbeatInterval: 3000
    };
  }
}