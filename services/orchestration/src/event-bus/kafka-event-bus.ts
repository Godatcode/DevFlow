import { Kafka, Producer, Consumer, KafkaMessage, EachMessagePayload } from 'kafkajs';
import { EventBus, EventHandler, WorkflowEvent } from '../interfaces';
import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export interface KafkaEventBusConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
  connectionTimeout?: number;
  requestTimeout?: number;
}

export class KafkaEventBus implements EventBus {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private handlers: Map<string, Set<EventHandler>>;
  private logger: Logger;
  private isConnected: boolean = false;

  constructor(config: KafkaEventBusConfig, logger: Logger) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      connectionTimeout: config.connectionTimeout || 3000,
      requestTimeout: config.requestTimeout || 30000,
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });

    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    this.handlers = new Map();
    this.logger = logger;
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.producer.connect(),
        this.consumer.connect()
      ]);

      // Set up message handler
      await this.consumer.run({
        eachMessage: this.handleMessage.bind(this)
      });

      this.isConnected = true;
      this.logger.info('Kafka event bus connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Kafka event bus', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.producer.disconnect(),
        this.consumer.disconnect()
      ]);

      this.isConnected = false;
      this.logger.info('Kafka event bus disconnected successfully');
    } catch (error) {
      this.logger.error('Failed to disconnect from Kafka event bus', { error });
      throw error;
    }
  }

  async publish(topic: string, event: WorkflowEvent): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Event bus is not connected');
    }

    try {
      const message = {
        key: event.workflowId,
        value: JSON.stringify(event),
        timestamp: event.timestamp.getTime().toString(),
        headers: {
          eventType: event.type,
          source: event.source,
          eventId: event.id
        }
      };

      await this.producer.send({
        topic,
        messages: [message]
      });

      this.logger.debug('Event published successfully', {
        topic,
        eventId: event.id,
        eventType: event.type,
        workflowId: event.workflowId
      });
    } catch (error) {
      this.logger.error('Failed to publish event', {
        topic,
        eventId: event.id,
        error
      });
      throw error;
    }
  }

  async subscribe(topic: string, handler: EventHandler): Promise<void> {
    try {
      // Add handler to our registry
      if (!this.handlers.has(topic)) {
        this.handlers.set(topic, new Set());
      }
      this.handlers.get(topic)!.add(handler);

      // Subscribe to topic if this is the first handler
      if (this.handlers.get(topic)!.size === 1) {
        await this.consumer.subscribe({ topic, fromBeginning: false });
        this.logger.info('Subscribed to topic', { topic });
      }

      this.logger.debug('Event handler registered', { topic });
    } catch (error) {
      this.logger.error('Failed to subscribe to topic', { topic, error });
      throw error;
    }
  }

  async unsubscribe(topic: string, handler: EventHandler): Promise<void> {
    try {
      const topicHandlers = this.handlers.get(topic);
      if (!topicHandlers) {
        return;
      }

      topicHandlers.delete(handler);

      // If no more handlers, unsubscribe from topic
      if (topicHandlers.size === 0) {
        this.handlers.delete(topic);
        // Note: KafkaJS doesn't have direct unsubscribe, would need to recreate consumer
        this.logger.info('All handlers removed for topic', { topic });
      }

      this.logger.debug('Event handler unregistered', { topic });
    } catch (error) {
      this.logger.error('Failed to unsubscribe from topic', { topic, error });
      throw error;
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;

    try {
      if (!message.value) {
        this.logger.warn('Received message with no value', { topic });
        return;
      }

      const event: WorkflowEvent = JSON.parse(message.value.toString());
      
      // Convert timestamp back to Date object if it's a string
      if (typeof event.timestamp === 'string') {
        event.timestamp = new Date(event.timestamp);
      }
      
      // Validate event structure
      if (!this.isValidWorkflowEvent(event)) {
        this.logger.warn('Received invalid workflow event', { topic, event });
        return;
      }

      const handlers = this.handlers.get(topic);
      if (!handlers || handlers.size === 0) {
        this.logger.debug('No handlers registered for topic', { topic });
        return;
      }

      // Execute all handlers for this topic
      const handlerPromises = Array.from(handlers).map(async (handler) => {
        try {
          await handler(event);
          this.logger.debug('Event handler executed successfully', {
            topic,
            eventId: event.id,
            eventType: event.type
          });
        } catch (error) {
          this.logger.error('Event handler failed', {
            topic,
            eventId: event.id,
            eventType: event.type,
            error
          });
          // Don't rethrow - we want other handlers to continue
        }
      });

      await Promise.all(handlerPromises);
    } catch (error) {
      this.logger.error('Failed to handle message', { topic, error });
      // Don't rethrow - this would cause the consumer to stop
    }
  }

  private isValidWorkflowEvent(event: any): event is WorkflowEvent {
    return (
      event &&
      typeof event.id === 'string' &&
      typeof event.type === 'string' &&
      typeof event.workflowId === 'string' &&
      typeof event.data === 'object' &&
      event.timestamp &&
      (event.timestamp instanceof Date || typeof event.timestamp === 'string') &&
      typeof event.source === 'string'
    );
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async getTopicMetadata(topic: string): Promise<any> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      
      await admin.disconnect();
      return metadata;
    } catch (error) {
      this.logger.error('Failed to get topic metadata', { topic, error });
      throw error;
    }
  }

  async createTopic(topic: string, numPartitions: number = 3, replicationFactor: number = 1): Promise<void> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      await admin.createTopics({
        topics: [{
          topic,
          numPartitions,
          replicationFactor
        }]
      });

      await admin.disconnect();
      this.logger.info('Topic created successfully', { topic, numPartitions, replicationFactor });
    } catch (error) {
      this.logger.error('Failed to create topic', { topic, error });
      throw error;
    }
  }
}