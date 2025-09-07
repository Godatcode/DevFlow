import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookProcessorService } from '../services/webhook-processor';
import { WebhookPayload, IntegrationProvider } from '@devflow/shared-types';
import crypto from 'crypto';

describe('WebhookProcessorService', () => {
  let webhookProcessor: WebhookProcessorService;

  beforeEach(() => {
    webhookProcessor = new WebhookProcessorService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerWebhook', () => {
    it('should register a webhook and return secret', async () => {
      const integrationId = 'test-integration-id' as any;
      const webhookUrl = 'https://example.com/webhook';

      const secret = await webhookProcessor.registerWebhook(integrationId, webhookUrl);

      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(64); // 32 bytes as hex string

      const registration = await webhookProcessor.getWebhookRegistration(integrationId);
      expect(registration).toBeDefined();
      expect(registration?.integrationId).toBe(integrationId);
      expect(registration?.webhookUrl).toBe(webhookUrl);
      expect(registration?.secret).toBe(secret);
      expect(registration?.isActive).toBe(true);
    });
  });

  describe('unregisterWebhook', () => {
    it('should unregister an existing webhook', async () => {
      const integrationId = 'test-integration-id' as any;
      const webhookUrl = 'https://example.com/webhook';

      // First register
      await webhookProcessor.registerWebhook(integrationId, webhookUrl);

      // Then unregister
      await webhookProcessor.unregisterWebhook(integrationId);

      const registration = await webhookProcessor.getWebhookRegistration(integrationId);
      expect(registration).toBeUndefined();
    });

    it('should throw error when unregistering non-existent webhook', async () => {
      const integrationId = 'non-existent-id' as any;

      await expect(webhookProcessor.unregisterWebhook(integrationId)).rejects.toThrow(
        'Webhook registration not found for integration: non-existent-id'
      );
    });
  });

  describe('processIncomingWebhook', () => {
    it('should process webhook with valid registration', async () => {
      const integrationId = 'test-integration-id' as any;
      const webhookUrl = 'https://example.com/webhook';

      // Register webhook first
      const secret = await webhookProcessor.registerWebhook(integrationId, webhookUrl);

      const payload: WebhookPayload = {
        integrationId,
        event: 'push',
        data: { repository: { name: 'test-repo' } },
        timestamp: new Date(),
      };

      // Should not throw
      await expect(webhookProcessor.processIncomingWebhook(payload)).resolves.toBeUndefined();
    });

    it('should throw error for unregistered integration', async () => {
      const payload: WebhookPayload = {
        integrationId: 'unregistered-id' as any,
        event: 'push',
        data: {},
        timestamp: new Date(),
      };

      await expect(webhookProcessor.processIncomingWebhook(payload)).rejects.toThrow(
        'No webhook registration found for integration: unregistered-id'
      );
    });

    it('should skip processing for inactive webhook', async () => {
      const integrationId = 'test-integration-id' as any;
      const webhookUrl = 'https://example.com/webhook';

      // Register and then deactivate
      await webhookProcessor.registerWebhook(integrationId, webhookUrl);
      await webhookProcessor.updateWebhookRegistration(integrationId, { isActive: false });

      const payload: WebhookPayload = {
        integrationId,
        event: 'push',
        data: {},
        timestamp: new Date(),
      };

      // Should not throw, but should skip processing
      await expect(webhookProcessor.processIncomingWebhook(payload)).resolves.toBeUndefined();
    });

    it('should validate webhook signature when provided', async () => {
      const integrationId = 'test-integration-id' as any;
      const webhookUrl = 'https://example.com/webhook';

      const secret = await webhookProcessor.registerWebhook(integrationId, webhookUrl);

      const payloadData = { repository: { name: 'test-repo' } };
      const payloadString = JSON.stringify(payloadData);
      const validSignature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

      const payload: WebhookPayload = {
        integrationId,
        event: 'push',
        data: payloadData,
        timestamp: new Date(),
        signature: validSignature,
      };

      // Should not throw with valid signature
      await expect(webhookProcessor.processIncomingWebhook(payload)).resolves.toBeUndefined();
    });

    it('should throw error for invalid webhook signature', async () => {
      const integrationId = 'test-integration-id' as any;
      const webhookUrl = 'https://example.com/webhook';

      await webhookProcessor.registerWebhook(integrationId, webhookUrl);

      const payload: WebhookPayload = {
        integrationId,
        event: 'push',
        data: { repository: { name: 'test-repo' } },
        timestamp: new Date(),
        signature: 'invalid-signature',
      };

      await expect(webhookProcessor.processIncomingWebhook(payload)).rejects.toThrow(
        'Invalid webhook signature'
      );
    });
  });

  describe('validateWebhookSignature', () => {
    it('should return true for valid signature', () => {
      const secret = 'test-secret';
      const payloadData = { test: 'data' };
      const payloadString = JSON.stringify(payloadData);
      const validSignature = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

      const payload: WebhookPayload = {
        integrationId: 'test-id' as any,
        event: 'test',
        data: payloadData,
        timestamp: new Date(),
        signature: validSignature,
      };

      const result = webhookProcessor.validateWebhookSignature(payload, secret);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const secret = 'test-secret';
      const payload: WebhookPayload = {
        integrationId: 'test-id' as any,
        event: 'test',
        data: { test: 'data' },
        timestamp: new Date(),
        signature: 'invalid-signature',
      };

      const result = webhookProcessor.validateWebhookSignature(payload, secret);
      expect(result).toBe(false);
    });

    it('should return false when no signature provided', () => {
      const payload: WebhookPayload = {
        integrationId: 'test-id' as any,
        event: 'test',
        data: { test: 'data' },
        timestamp: new Date(),
      };

      const result = webhookProcessor.validateWebhookSignature(payload, 'secret');
      expect(result).toBe(false);
    });
  });

  describe('webhook management', () => {
    it('should list all webhook registrations', async () => {
      const integrationId1 = 'test-integration-1' as any;
      const integrationId2 = 'test-integration-2' as any;

      await webhookProcessor.registerWebhook(integrationId1, 'https://example.com/webhook1');
      await webhookProcessor.registerWebhook(integrationId2, 'https://example.com/webhook2');

      const registrations = await webhookProcessor.listWebhookRegistrations();
      expect(registrations).toHaveLength(2);
      expect(registrations.map(r => r.integrationId)).toContain(integrationId1);
      expect(registrations.map(r => r.integrationId)).toContain(integrationId2);
    });

    it('should update webhook registration', async () => {
      const integrationId = 'test-integration-id' as any;
      await webhookProcessor.registerWebhook(integrationId, 'https://example.com/webhook');

      await webhookProcessor.updateWebhookRegistration(integrationId, {
        isActive: false,
        events: ['push', 'pull_request'],
      });

      const registration = await webhookProcessor.getWebhookRegistration(integrationId);
      expect(registration?.isActive).toBe(false);
      expect(registration?.events).toEqual(['push', 'pull_request']);
    });

    it('should get webhook stats', async () => {
      const integrationId = 'test-integration-id' as any;
      
      const stats = await webhookProcessor.getWebhookStats(integrationId);
      
      expect(stats.integrationId).toBe(integrationId);
      expect(stats.totalWebhooks).toBe(0);
      expect(stats.successfulWebhooks).toBe(0);
      expect(stats.failedWebhooks).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
    });
  });
});