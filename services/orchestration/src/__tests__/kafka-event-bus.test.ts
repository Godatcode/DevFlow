import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { KafkaEventBus, KafkaEventBusConfig } from '../event-bus/kafka-event-bus';
import { WorkflowEvent } from '../interfaces';
import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

// Mock kafkajs
vi.mock('kafkajs');

describe('KafkaEventBus', () => {
  let eventBus: KafkaEventBus;
  let mockKafka: vi.Mocked<Kafka>;
  let mockProducer: vi.Mocked<Producer>;
  let mockConsumer: vi.Mocked<Consumer>;
  let mockLogger: vi.Mocked<Logger>;

  const config: KafkaEventBusConfig = {
    brokers: ['localhost:9092'],
    clientId: 'test-client',
    groupId: 'test-group'
  };

  const mockEvent: WorkflowEvent = {
    id: 'event-123' as UUID,
    type: 'workflow.started',
    workflowId: 'workflow-123' as UUID,
    data: { test: 'data' },
    timestamp: new Date(),
    source: 'test-service'
  };

  beforeEach(() => {
    mockProducer = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      send: vi.fn()
    } as any;

    mockConsumer = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn()
    } as any;

    mockKafka = {
      producer: vi.fn().mockReturnValue(mockProducer),
      consumer: vi.fn().mockReturnValue(mockConsumer),
      admin: vi.fn()
    } as any;

    (Kafka as any).mockImplementation(() => mockKafka);

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    eventBus = new KafkaEventBus(config, mockLogger);
  });

  describe('connect', () => {
    it('should connect producer and consumer successfully', async () => {
      mockProducer.connect.mockResolvedValue();
      mockConsumer.connect.mockResolvedValue();
      mockConsumer.run.mockResolvedValue();

      await eventBus.connect();

      expect(mockProducer.connect).toHaveBeenCalled();
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(mockConsumer.run).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Kafka event bus connected successfully');
      expect(eventBus.getConnectionStatus()).toBe(true);
    });

    it('should handle connection failure', async () => {
      const error = new Error('Connection failed');
      mockProducer.connect.mockRejectedValue(error);

      await expect(eventBus.connect()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to connect to Kafka event bus', { error });
      expect(eventBus.getConnectionStatus()).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('should disconnect producer and consumer successfully', async () => {
      mockProducer.disconnect.mockResolvedValue();
      mockConsumer.disconnect.mockResolvedValue();

      await eventBus.disconnect();

      expect(mockProducer.disconnect).toHaveBeenCalled();
      expect(mockConsumer.disconnect).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Kafka event bus disconnected successfully');
      expect(eventBus.getConnectionStatus()).toBe(false);
    });

    it('should handle disconnection failure', async () => {
      const error = new Error('Disconnection failed');
      mockProducer.disconnect.mockRejectedValue(error);

      await expect(eventBus.disconnect()).rejects.toThrow('Disconnection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to disconnect from Kafka event bus', { error });
    });
  });

  describe('publish', () => {
    beforeEach(async () => {
      mockProducer.connect.mockResolvedValue();
      mockConsumer.connect.mockResolvedValue();
      mockConsumer.run.mockResolvedValue();
      await eventBus.connect();
    });

    it('should publish event successfully', async () => {
      mockProducer.send.mockResolvedValue([]);

      await eventBus.publish('test-topic', mockEvent);

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [{
          key: mockEvent.workflowId,
          value: JSON.stringify(mockEvent),
          timestamp: mockEvent.timestamp.getTime().toString(),
          headers: {
            eventType: mockEvent.type,
            source: mockEvent.source,
            eventId: mockEvent.id
          }
        }]
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('Event published successfully', {
        topic: 'test-topic',
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        workflowId: mockEvent.workflowId
      });
    });

    it('should throw error when not connected', async () => {
      await eventBus.disconnect();

      await expect(eventBus.publish('test-topic', mockEvent))
        .rejects.toThrow('Event bus is not connected');
    });

    it('should handle publish failure', async () => {
      const error = new Error('Publish failed');
      mockProducer.send.mockRejectedValue(error);

      await expect(eventBus.publish('test-topic', mockEvent))
        .rejects.toThrow('Publish failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to publish event', {
        topic: 'test-topic',
        eventId: mockEvent.id,
        error
      });
    });
  });

  describe('subscribe', () => {
    const mockHandler = vi.fn();

    beforeEach(() => {
      mockConsumer.subscribe.mockResolvedValue();
    });

    it('should subscribe to topic successfully', async () => {
      await eventBus.subscribe('test-topic', mockHandler);

      expect(mockConsumer.subscribe).toHaveBeenCalledWith({
        topic: 'test-topic',
        fromBeginning: false
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Subscribed to topic', { topic: 'test-topic' });
      expect(mockLogger.debug).toHaveBeenCalledWith('Event handler registered', { topic: 'test-topic' });
    });

    it('should not subscribe again for additional handlers on same topic', async () => {
      const anotherHandler = vi.fn();

      await eventBus.subscribe('test-topic', mockHandler);
      await eventBus.subscribe('test-topic', anotherHandler);

      expect(mockConsumer.subscribe).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });

    it('should handle subscription failure', async () => {
      const error = new Error('Subscription failed');
      mockConsumer.subscribe.mockRejectedValue(error);

      await expect(eventBus.subscribe('test-topic', mockHandler))
        .rejects.toThrow('Subscription failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to subscribe to topic', {
        topic: 'test-topic',
        error
      });
    });
  });

  describe('unsubscribe', () => {
    const mockHandler = vi.fn();

    it('should unsubscribe handler successfully', async () => {
      await eventBus.subscribe('test-topic', mockHandler);
      await eventBus.unsubscribe('test-topic', mockHandler);

      expect(mockLogger.debug).toHaveBeenCalledWith('Event handler unregistered', { topic: 'test-topic' });
      expect(mockLogger.info).toHaveBeenCalledWith('All handlers removed for topic', { topic: 'test-topic' });
    });

    it('should handle unsubscribe from non-existent topic', async () => {
      await eventBus.unsubscribe('non-existent-topic', mockHandler);
      // Should not throw error
    });
  });

  describe('message handling', () => {
    let mockHandler: vi.Mock;

    beforeEach(async () => {
      mockHandler = vi.fn();
      mockProducer.connect.mockResolvedValue();
      mockConsumer.connect.mockResolvedValue();
      mockConsumer.run.mockResolvedValue();
      await eventBus.connect();
      await eventBus.subscribe('test-topic', mockHandler);
    });

    it('should handle valid message successfully', async () => {
      const payload = {
        topic: 'test-topic',
        partition: 0,
        message: {
          key: Buffer.from(mockEvent.workflowId),
          value: Buffer.from(JSON.stringify(mockEvent)),
          timestamp: mockEvent.timestamp.getTime().toString()
        }
      };

      // Get the message handler that was registered
      const messageHandler = mockConsumer.run.mock.calls[0][0].eachMessage;
      await messageHandler(payload);

      expect(mockHandler).toHaveBeenCalledWith(mockEvent);
      expect(mockLogger.debug).toHaveBeenCalledWith('Event handler executed successfully', {
        topic: 'test-topic',
        eventId: mockEvent.id,
        eventType: mockEvent.type
      });
    });

    it('should handle message with no value', async () => {
      // Reset the handler mock for this specific test
      mockHandler.mockClear();
      
      const payload = {
        topic: 'test-topic',
        partition: 0,
        message: {
          key: Buffer.from('test-key'),
          value: null,
          timestamp: Date.now().toString()
        }
      };

      const messageHandler = mockConsumer.run.mock.calls[0][0].eachMessage;
      await messageHandler(payload);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Received message with no value', { topic: 'test-topic' });
    });

    it('should handle invalid JSON message', async () => {
      // Reset the handler mock for this specific test
      mockHandler.mockClear();
      
      const payload = {
        topic: 'test-topic',
        partition: 0,
        message: {
          key: Buffer.from('test-key'),
          value: Buffer.from('invalid json'),
          timestamp: Date.now().toString()
        }
      };

      const messageHandler = mockConsumer.run.mock.calls[0][0].eachMessage;
      await messageHandler(payload);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to handle message', expect.objectContaining({
        topic: 'test-topic'
      }));
    });

    it('should handle handler execution failure', async () => {
      const error = new Error('Handler failed');
      mockHandler.mockRejectedValue(error);

      const payload = {
        topic: 'test-topic',
        partition: 0,
        message: {
          key: Buffer.from(mockEvent.workflowId),
          value: Buffer.from(JSON.stringify(mockEvent)),
          timestamp: mockEvent.timestamp.getTime().toString()
        }
      };

      const messageHandler = mockConsumer.run.mock.calls[0][0].eachMessage;
      await messageHandler(payload);

      expect(mockLogger.error).toHaveBeenCalledWith('Event handler failed', {
        topic: 'test-topic',
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        error
      });
    });
  });

  describe('admin operations', () => {
    let mockAdmin: any;

    beforeEach(() => {
      mockAdmin = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        fetchTopicMetadata: vi.fn(),
        createTopics: vi.fn()
      };
      mockKafka.admin.mockReturnValue(mockAdmin);
    });

    describe('getTopicMetadata', () => {
      it('should get topic metadata successfully', async () => {
        const mockMetadata = { topics: [{ name: 'test-topic' }] };
        mockAdmin.connect.mockResolvedValue();
        mockAdmin.disconnect.mockResolvedValue();
        mockAdmin.fetchTopicMetadata.mockResolvedValue(mockMetadata);

        const result = await eventBus.getTopicMetadata('test-topic');

        expect(result).toEqual(mockMetadata);
        expect(mockAdmin.connect).toHaveBeenCalled();
        expect(mockAdmin.fetchTopicMetadata).toHaveBeenCalledWith({ topics: ['test-topic'] });
        expect(mockAdmin.disconnect).toHaveBeenCalled();
      });

      it('should handle metadata fetch failure', async () => {
        const error = new Error('Metadata fetch failed');
        mockAdmin.connect.mockResolvedValue();
        mockAdmin.fetchTopicMetadata.mockRejectedValue(error);

        await expect(eventBus.getTopicMetadata('test-topic'))
          .rejects.toThrow('Metadata fetch failed');

        expect(mockLogger.error).toHaveBeenCalledWith('Failed to get topic metadata', {
          topic: 'test-topic',
          error
        });
      });
    });

    describe('createTopic', () => {
      it('should create topic successfully', async () => {
        mockAdmin.connect.mockResolvedValue();
        mockAdmin.disconnect.mockResolvedValue();
        mockAdmin.createTopics.mockResolvedValue();

        await eventBus.createTopic('test-topic', 5, 2);

        expect(mockAdmin.createTopics).toHaveBeenCalledWith({
          topics: [{
            topic: 'test-topic',
            numPartitions: 5,
            replicationFactor: 2
          }]
        });
        expect(mockLogger.info).toHaveBeenCalledWith('Topic created successfully', {
          topic: 'test-topic',
          numPartitions: 5,
          replicationFactor: 2
        });
      });

      it('should use default values for partitions and replication', async () => {
        mockAdmin.connect.mockResolvedValue();
        mockAdmin.disconnect.mockResolvedValue();
        mockAdmin.createTopics.mockResolvedValue();

        await eventBus.createTopic('test-topic');

        expect(mockAdmin.createTopics).toHaveBeenCalledWith({
          topics: [{
            topic: 'test-topic',
            numPartitions: 3,
            replicationFactor: 1
          }]
        });
      });
    });
  });
});