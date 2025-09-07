import { WorkflowEvent, EventHandler } from '../interfaces';
import { WorkflowContext, UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export interface EventRoutingRule {
  id: string;
  name: string;
  condition: EventCondition;
  targetTopic: string;
  priority: number;
  enabled: boolean;
}

export interface EventCondition {
  eventType?: string | string[];
  workflowId?: UUID | UUID[];
  projectId?: UUID | UUID[];
  teamId?: UUID | UUID[];
  source?: string | string[];
  customFilter?: (event: WorkflowEvent) => boolean;
}

export interface EventRoutingResult {
  topics: string[];
  matched: boolean;
  appliedRules: string[];
}

export class EventRouter {
  private rules: Map<string, EventRoutingRule>;
  private logger: Logger;

  constructor(logger: Logger) {
    this.rules = new Map();
    this.logger = logger;
  }

  addRule(rule: EventRoutingRule): void {
    this.rules.set(rule.id, rule);
    this.logger.debug('Event routing rule added', { ruleId: rule.id, ruleName: rule.name });
  }

  removeRule(ruleId: string): void {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.logger.debug('Event routing rule removed', { ruleId });
    }
  }

  updateRule(ruleId: string, updates: Partial<EventRoutingRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Routing rule not found: ${ruleId}`);
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    this.logger.debug('Event routing rule updated', { ruleId });
  }

  getRule(ruleId: string): EventRoutingRule | undefined {
    return this.rules.get(ruleId);
  }

  getAllRules(): EventRoutingRule[] {
    return Array.from(this.rules.values());
  }

  routeEvent(event: WorkflowEvent, context?: WorkflowContext): EventRoutingResult {
    const matchedRules: EventRoutingRule[] = [];
    const topics: string[] = [];

    // Get all enabled rules sorted by priority (higher priority first)
    const enabledRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of enabledRules) {
      if (this.evaluateCondition(rule.condition, event, context)) {
        matchedRules.push(rule);
        if (!topics.includes(rule.targetTopic)) {
          topics.push(rule.targetTopic);
        }
      }
    }

    const result: EventRoutingResult = {
      topics,
      matched: matchedRules.length > 0,
      appliedRules: matchedRules.map(rule => rule.id)
    };

    this.logger.debug('Event routing completed', {
      eventId: event.id,
      eventType: event.type,
      matchedRules: result.appliedRules.length,
      targetTopics: topics.length
    });

    return result;
  }

  private evaluateCondition(
    condition: EventCondition, 
    event: WorkflowEvent, 
    context?: WorkflowContext
  ): boolean {
    // Check event type
    if (condition.eventType) {
      if (!this.matchesStringOrArray(event.type, condition.eventType)) {
        return false;
      }
    }

    // Check workflow ID
    if (condition.workflowId) {
      if (!this.matchesStringOrArray(event.workflowId, condition.workflowId)) {
        return false;
      }
    }

    // Check project ID (from context)
    if (condition.projectId && context) {
      if (!this.matchesStringOrArray(context.projectId, condition.projectId)) {
        return false;
      }
    }

    // Check team ID (from context)
    if (condition.teamId && context) {
      if (!this.matchesStringOrArray(context.teamId, condition.teamId)) {
        return false;
      }
    }

    // Check source
    if (condition.source) {
      if (!this.matchesStringOrArray(event.source, condition.source)) {
        return false;
      }
    }

    // Check custom filter
    if (condition.customFilter) {
      try {
        if (!condition.customFilter(event)) {
          return false;
        }
      } catch (error) {
        this.logger.warn('Custom filter evaluation failed', { 
          eventId: event.id, 
          error 
        });
        return false;
      }
    }

    return true;
  }

  private matchesStringOrArray(value: string, condition: string | string[]): boolean {
    if (Array.isArray(condition)) {
      return condition.includes(value);
    }
    return value === condition;
  }

  // Predefined routing rules for common scenarios
  static createDefaultRules(): EventRoutingRule[] {
    return [
      {
        id: 'workflow-lifecycle',
        name: 'Workflow Lifecycle Events',
        condition: {
          eventType: ['workflow.started', 'workflow.completed', 'workflow.failed', 'workflow.paused', 'workflow.resumed']
        },
        targetTopic: 'workflow-lifecycle',
        priority: 100,
        enabled: true
      },
      {
        id: 'step-execution',
        name: 'Step Execution Events',
        condition: {
          eventType: ['step.started', 'step.completed', 'step.failed', 'step.retried']
        },
        targetTopic: 'step-execution',
        priority: 90,
        enabled: true
      },
      {
        id: 'agent-events',
        name: 'Agent Execution Events',
        condition: {
          eventType: ['agent.assigned', 'agent.started', 'agent.completed', 'agent.failed']
        },
        targetTopic: 'agent-execution',
        priority: 80,
        enabled: true
      },
      {
        id: 'integration-events',
        name: 'Integration Events',
        condition: {
          eventType: ['integration.called', 'integration.success', 'integration.failed']
        },
        targetTopic: 'integration-events',
        priority: 70,
        enabled: true
      },
      {
        id: 'error-events',
        name: 'Error Events',
        condition: {
          customFilter: (event) => event.type.includes('failed') || event.type.includes('error')
        },
        targetTopic: 'error-events',
        priority: 110,
        enabled: true
      }
    ];
  }
}