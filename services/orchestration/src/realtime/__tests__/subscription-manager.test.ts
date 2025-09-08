import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySubscriptionManager } from '../subscription-manager';
import { UUID } from '@devflow/shared-types';

describe('InMemorySubscriptionManager', () => {
  let subscriptionManager: InMemorySubscriptionManager;
  const clientId1 = 'client-1' as UUID;
  const clientId2 = 'client-2' as UUID;
  const workflowId1 = 'workflow-1' as UUID;
  const workflowId2 = 'workflow-2' as UUID;

  beforeEach(() => {
    subscriptionManager = new InMemorySubscriptionManager();
  });

  describe('subscribe', () => {
    it('should add client to workflow subscribers', async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      
      const subscribers = await subscriptionManager.getSubscribers(workflowId1);
      expect(subscribers).toContain(clientId1);
    });

    it('should add workflow to client subscriptions', async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).toContain(workflowId1);
    });

    it('should handle multiple subscriptions for same client', async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      await subscriptionManager.subscribe(clientId1, workflowId2);
      
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).toContain(workflowId1);
      expect(subscriptions).toContain(workflowId2);
      expect(subscriptions).toHaveLength(2);
    });

    it('should handle multiple clients for same workflow', async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      await subscriptionManager.subscribe(clientId2, workflowId1);
      
      const subscribers = await subscriptionManager.getSubscribers(workflowId1);
      expect(subscribers).toContain(clientId1);
      expect(subscribers).toContain(clientId2);
      expect(subscribers).toHaveLength(2);
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      await subscriptionManager.subscribe(clientId1, workflowId2);
      await subscriptionManager.subscribe(clientId2, workflowId1);
    });

    it('should remove client from workflow subscribers', async () => {
      await subscriptionManager.unsubscribe(clientId1, workflowId1);
      
      const subscribers = await subscriptionManager.getSubscribers(workflowId1);
      expect(subscribers).not.toContain(clientId1);
      expect(subscribers).toContain(clientId2);
    });

    it('should remove workflow from client subscriptions', async () => {
      await subscriptionManager.unsubscribe(clientId1, workflowId1);
      
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).not.toContain(workflowId1);
      expect(subscriptions).toContain(workflowId2);
    });

    it('should handle unsubscribing non-existent subscription', async () => {
      await subscriptionManager.unsubscribe(clientId1, 'non-existent' as UUID);
      
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).toHaveLength(2);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      await subscriptionManager.subscribe(clientId1, workflowId2);
      await subscriptionManager.subscribe(clientId2, workflowId1);
    });

    it('should remove all subscriptions for a client', async () => {
      await subscriptionManager.cleanup(clientId1);
      
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).toHaveLength(0);
    });

    it('should remove client from all workflow subscribers', async () => {
      await subscriptionManager.cleanup(clientId1);
      
      const workflow1Subscribers = await subscriptionManager.getSubscribers(workflowId1);
      const workflow2Subscribers = await subscriptionManager.getSubscribers(workflowId2);
      
      expect(workflow1Subscribers).not.toContain(clientId1);
      expect(workflow2Subscribers).not.toContain(clientId1);
      expect(workflow1Subscribers).toContain(clientId2);
    });
  });

  describe('getSubscribers', () => {
    it('should return empty array for workflow with no subscribers', async () => {
      const subscribers = await subscriptionManager.getSubscribers(workflowId1);
      expect(subscribers).toEqual([]);
    });

    it('should return all subscribers for a workflow', async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      await subscriptionManager.subscribe(clientId2, workflowId1);
      
      const subscribers = await subscriptionManager.getSubscribers(workflowId1);
      expect(subscribers).toHaveLength(2);
      expect(subscribers).toContain(clientId1);
      expect(subscribers).toContain(clientId2);
    });
  });

  describe('getSubscriptions', () => {
    it('should return empty array for client with no subscriptions', async () => {
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).toEqual([]);
    });

    it('should return all subscriptions for a client', async () => {
      await subscriptionManager.subscribe(clientId1, workflowId1);
      await subscriptionManager.subscribe(clientId1, workflowId2);
      
      const subscriptions = await subscriptionManager.getSubscriptions(clientId1);
      expect(subscriptions).toHaveLength(2);
      expect(subscriptions).toContain(workflowId1);
      expect(subscriptions).toContain(workflowId2);
    });
  });
});