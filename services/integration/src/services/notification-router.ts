import { Logger } from '@devflow/shared-utils';
import { 
  Integration, 
  IntegrationProvider, 
  UUID 
} from '@devflow/shared-types';
import { SlackAdapter } from '../adapters/slack-adapter';
import { TeamsAdapter } from '../adapters/teams-adapter';
import { DiscordAdapter } from '../adapters/discord-adapter';

export interface NotificationRule {
  id: UUID;
  name: string;
  description: string;
  conditions: NotificationCondition[];
  actions: NotificationAction[];
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationCondition {
  type: 'event_type' | 'severity' | 'project' | 'team' | 'time_of_day' | 'user_preference';
  operator: 'equals' | 'contains' | 'in' | 'not_in' | 'greater_than' | 'less_than';
  value: any;
}

export interface NotificationAction {
  type: 'send_message' | 'send_dm' | 'create_thread' | 'add_reaction' | 'escalate';
  provider: IntegrationProvider;
  target: string; // channel ID, user ID, etc.
  template: string;
  delay?: number; // in seconds
}

export interface NotificationEvent {
  id: UUID;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  data: Record<string, any>;
  projectId?: UUID;
  teamId?: UUID;
  userId?: UUID;
  timestamp: Date;
}

export interface NotificationDelivery {
  id: UUID;
  eventId: UUID;
  ruleId: UUID;
  provider: IntegrationProvider;
  target: string;
  status: 'pending' | 'sent' | 'failed' | 'retrying';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
  deliveredAt?: Date;
}

export class NotificationRouterService {
  private readonly logger = new Logger('NotificationRouterService');
  private readonly rules = new Map<UUID, NotificationRule>();
  private readonly deliveries = new Map<UUID, NotificationDelivery>();
  private readonly adapters = new Map<IntegrationProvider, any>();
  private readonly integrations = new Map<UUID, Integration>();

  constructor() {
    this.adapters.set(IntegrationProvider.SLACK, new SlackAdapter());
    this.adapters.set(IntegrationProvider.TEAMS, new TeamsAdapter());
    this.adapters.set(IntegrationProvider.DISCORD, new DiscordAdapter());
  }

  async addNotificationRule(rule: NotificationRule): Promise<void> {
    this.logger.info('Adding notification rule', { ruleId: rule.id, name: rule.name });
    this.rules.set(rule.id, rule);
  }

  async updateNotificationRule(ruleId: UUID, updates: Partial<NotificationRule>): Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Notification rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates, updatedAt: new Date() };
    this.rules.set(ruleId, updatedRule);
    
    this.logger.info('Notification rule updated', { ruleId, name: updatedRule.name });
  }

  async removeNotificationRule(ruleId: UUID): Promise<void> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Notification rule not found: ${ruleId}`);
    }

    this.rules.delete(ruleId);
    this.logger.info('Notification rule removed', { ruleId, name: rule.name });
  }

  async registerIntegration(integration: Integration): Promise<void> {
    this.integrations.set(integration.id, integration);
    this.logger.info('Integration registered for notifications', { 
      integrationId: integration.id,
      provider: integration.provider 
    });
  }

  async processNotificationEvent(event: NotificationEvent): Promise<void> {
    this.logger.info('Processing notification event', { 
      eventId: event.id,
      type: event.type,
      severity: event.severity 
    });

    // Find matching rules
    const matchingRules = this.findMatchingRules(event);
    
    if (matchingRules.length === 0) {
      this.logger.info('No matching notification rules found', { eventId: event.id });
      return;
    }

    // Sort rules by priority (higher priority first)
    matchingRules.sort((a, b) => b.priority - a.priority);

    // Execute actions for each matching rule
    for (const rule of matchingRules) {
      await this.executeRuleActions(event, rule);
    }
  }

  private findMatchingRules(event: NotificationEvent): NotificationRule[] {
    const matchingRules: NotificationRule[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.isActive) {
        continue;
      }

      if (this.evaluateConditions(event, rule.conditions)) {
        matchingRules.push(rule);
      }
    }

    return matchingRules;
  }

  private evaluateConditions(event: NotificationEvent, conditions: NotificationCondition[]): boolean {
    // All conditions must be true (AND logic)
    return conditions.every(condition => this.evaluateCondition(event, condition));
  }

  private evaluateCondition(event: NotificationEvent, condition: NotificationCondition): boolean {
    let eventValue: any;

    switch (condition.type) {
      case 'event_type':
        eventValue = event.type;
        break;
      case 'severity':
        eventValue = event.severity;
        break;
      case 'project':
        eventValue = event.projectId;
        break;
      case 'team':
        eventValue = event.teamId;
        break;
      case 'time_of_day':
        eventValue = event.timestamp.getHours();
        break;
      case 'user_preference':
        // This would typically query user preferences from a database
        eventValue = event.userId;
        break;
      default:
        return false;
    }

    return this.evaluateOperator(eventValue, condition.operator, condition.value);
  }

  private evaluateOperator(eventValue: any, operator: string, conditionValue: any): boolean {
    switch (operator) {
      case 'equals':
        return eventValue === conditionValue;
      case 'contains':
        return typeof eventValue === 'string' && eventValue.includes(conditionValue);
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(eventValue);
      case 'not_in':
        return Array.isArray(conditionValue) && !conditionValue.includes(eventValue);
      case 'greater_than':
        return eventValue > conditionValue;
      case 'less_than':
        return eventValue < conditionValue;
      default:
        return false;
    }
  }

  private async executeRuleActions(event: NotificationEvent, rule: NotificationRule): Promise<void> {
    this.logger.info('Executing rule actions', { 
      eventId: event.id,
      ruleId: rule.id,
      actionsCount: rule.actions.length 
    });

    for (const action of rule.actions) {
      try {
        if (action.delay && action.delay > 0) {
          // Schedule delayed execution
          setTimeout(() => {
            this.executeAction(event, rule, action);
          }, action.delay * 1000);
        } else {
          await this.executeAction(event, rule, action);
        }
      } catch (error) {
        this.logger.error('Failed to execute notification action', { 
          error,
          eventId: event.id,
          ruleId: rule.id,
          actionType: action.type 
        });
      }
    }
  }

  private async executeAction(event: NotificationEvent, rule: NotificationRule, action: NotificationAction): Promise<void> {
    const deliveryId = crypto.randomUUID() as UUID;
    const delivery: NotificationDelivery = {
      id: deliveryId,
      eventId: event.id,
      ruleId: rule.id,
      provider: action.provider,
      target: action.target,
      status: 'pending',
      attempts: 0,
      lastAttempt: new Date(),
    };

    this.deliveries.set(deliveryId, delivery);

    try {
      const integration = this.findIntegrationByProvider(action.provider);
      if (!integration) {
        throw new Error(`No integration found for provider: ${action.provider}`);
      }

      const adapter = this.adapters.get(action.provider);
      if (!adapter) {
        throw new Error(`No adapter found for provider: ${action.provider}`);
      }

      const message = this.renderTemplate(action.template, event);

      switch (action.type) {
        case 'send_message':
          await this.sendMessage(adapter, integration, action.target, message);
          break;
        case 'send_dm':
          await this.sendDirectMessage(adapter, integration, action.target, message);
          break;
        case 'create_thread':
          await this.createThread(adapter, integration, action.target, message);
          break;
        case 'add_reaction':
          await this.addReaction(adapter, integration, action.target, message);
          break;
        case 'escalate':
          await this.escalateNotification(event, action.target);
          break;
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      delivery.status = 'sent';
      delivery.deliveredAt = new Date();
      
      this.logger.info('Notification action executed successfully', { 
        deliveryId,
        eventId: event.id,
        actionType: action.type,
        provider: action.provider 
      });

    } catch (error) {
      delivery.status = 'failed';
      delivery.error = error instanceof Error ? error.message : 'Unknown error';
      delivery.attempts++;

      this.logger.error('Notification action failed', { 
        error,
        deliveryId,
        eventId: event.id,
        actionType: action.type 
      });

      // Retry logic could be implemented here
      if (delivery.attempts < 3) {
        delivery.status = 'retrying';
        setTimeout(() => {
          this.executeAction(event, rule, action);
        }, Math.pow(2, delivery.attempts) * 1000); // Exponential backoff
      }
    }

    this.deliveries.set(deliveryId, delivery);
  }

  private findIntegrationByProvider(provider: IntegrationProvider): Integration | undefined {
    for (const integration of this.integrations.values()) {
      if (integration.provider === provider && integration.isActive) {
        return integration;
      }
    }
    return undefined;
  }

  private renderTemplate(template: string, event: NotificationEvent): string {
    let rendered = template;
    
    // Replace placeholders with event data
    rendered = rendered.replace(/\{\{title\}\}/g, event.title);
    rendered = rendered.replace(/\{\{message\}\}/g, event.message);
    rendered = rendered.replace(/\{\{severity\}\}/g, event.severity);
    rendered = rendered.replace(/\{\{type\}\}/g, event.type);
    rendered = rendered.replace(/\{\{timestamp\}\}/g, event.timestamp.toISOString());
    
    // Replace custom data placeholders
    for (const [key, value] of Object.entries(event.data)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(placeholder, String(value));
    }
    
    return rendered;
  }

  private async sendMessage(adapter: any, integration: Integration, target: string, message: string): Promise<void> {
    if (adapter.sendNotification) {
      await adapter.sendNotification(integration, { channel: target, text: message });
    } else if (adapter.sendMessage) {
      await adapter.sendMessage(integration, target, { content: message });
    } else if (adapter.sendChannelMessage) {
      // For Teams, we need to parse the target to get teamId and channelId
      const [teamId, channelId] = target.split('/');
      await adapter.sendChannelMessage(integration, teamId, channelId, {
        body: { contentType: 'text', content: message }
      });
    } else {
      throw new Error('Adapter does not support sending messages');
    }
  }

  private async sendDirectMessage(adapter: any, integration: Integration, userId: string, message: string): Promise<void> {
    if (adapter.sendDirectMessage) {
      await adapter.sendDirectMessage(integration, userId, message);
    } else {
      throw new Error('Adapter does not support sending direct messages');
    }
  }

  private async createThread(adapter: any, integration: Integration, target: string, message: string): Promise<void> {
    // Implementation would depend on the specific adapter capabilities
    // For now, fall back to sending a regular message
    await this.sendMessage(adapter, integration, target, message);
  }

  private async addReaction(adapter: any, integration: Integration, target: string, emoji: string): Promise<void> {
    if (adapter.addReaction) {
      // Parse target to get channel and message ID
      const [channelId, messageId] = target.split('/');
      await adapter.addReaction(integration, channelId, messageId, emoji);
    } else {
      throw new Error('Adapter does not support adding reactions');
    }
  }

  private async escalateNotification(event: NotificationEvent, escalationTarget: string): Promise<void> {
    // Create a new high-priority notification event for escalation
    const escalatedEvent: NotificationEvent = {
      ...event,
      id: crypto.randomUUID() as UUID,
      severity: 'critical',
      title: `ESCALATED: ${event.title}`,
      message: `This notification has been escalated. Original: ${event.message}`,
      timestamp: new Date(),
    };

    await this.processNotificationEvent(escalatedEvent);
  }

  // Management methods

  async getNotificationRules(): Promise<NotificationRule[]> {
    return Array.from(this.rules.values());
  }

  async getNotificationRule(ruleId: UUID): Promise<NotificationRule | undefined> {
    return this.rules.get(ruleId);
  }

  async getDeliveryHistory(eventId?: UUID, ruleId?: UUID): Promise<NotificationDelivery[]> {
    let deliveries = Array.from(this.deliveries.values());

    if (eventId) {
      deliveries = deliveries.filter(d => d.eventId === eventId);
    }

    if (ruleId) {
      deliveries = deliveries.filter(d => d.ruleId === ruleId);
    }

    return deliveries.sort((a, b) => (b.lastAttempt?.getTime() || 0) - (a.lastAttempt?.getTime() || 0));
  }

  async getDeliveryStats(): Promise<NotificationStats> {
    const deliveries = Array.from(this.deliveries.values());
    
    return {
      total: deliveries.length,
      sent: deliveries.filter(d => d.status === 'sent').length,
      failed: deliveries.filter(d => d.status === 'failed').length,
      pending: deliveries.filter(d => d.status === 'pending').length,
      retrying: deliveries.filter(d => d.status === 'retrying').length,
    };
  }
}

export interface NotificationStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  retrying: number;
}