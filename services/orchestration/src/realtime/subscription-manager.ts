import { UUID } from '@devflow/shared-types';
import { SubscriptionManager } from './interfaces';

export class InMemorySubscriptionManager implements SubscriptionManager {
  private subscriptions = new Map<UUID, Set<UUID>>(); // clientId -> Set<workflowId>
  private subscribers = new Map<UUID, Set<UUID>>(); // workflowId -> Set<clientId>

  async subscribe(clientId: UUID, workflowId: UUID): Promise<void> {
    // Add workflow to client's subscriptions
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    this.subscriptions.get(clientId)!.add(workflowId);

    // Add client to workflow's subscribers
    if (!this.subscribers.has(workflowId)) {
      this.subscribers.set(workflowId, new Set());
    }
    this.subscribers.get(workflowId)!.add(clientId);
  }

  async unsubscribe(clientId: UUID, workflowId: UUID): Promise<void> {
    // Remove workflow from client's subscriptions
    const clientSubscriptions = this.subscriptions.get(clientId);
    if (clientSubscriptions) {
      clientSubscriptions.delete(workflowId);
      if (clientSubscriptions.size === 0) {
        this.subscriptions.delete(clientId);
      }
    }

    // Remove client from workflow's subscribers
    const workflowSubscribers = this.subscribers.get(workflowId);
    if (workflowSubscribers) {
      workflowSubscribers.delete(clientId);
      if (workflowSubscribers.size === 0) {
        this.subscribers.delete(workflowId);
      }
    }
  }

  async getSubscribers(workflowId: UUID): Promise<UUID[]> {
    const subscribers = this.subscribers.get(workflowId);
    return subscribers ? Array.from(subscribers) : [];
  }

  async getSubscriptions(clientId: UUID): Promise<UUID[]> {
    const subscriptions = this.subscriptions.get(clientId);
    return subscriptions ? Array.from(subscriptions) : [];
  }

  async cleanup(clientId: UUID): Promise<void> {
    const subscriptions = await this.getSubscriptions(clientId);
    
    // Remove client from all workflow subscribers
    for (const workflowId of subscriptions) {
      await this.unsubscribe(clientId, workflowId);
    }
  }
}