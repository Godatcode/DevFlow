import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventRouter, EventRoutingRule, EventCondition } from '../event-bus/event-router';
import { WorkflowEvent } from '../interfaces';
import { WorkflowContext, UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

describe('EventRouter', () => {
  let router: EventRouter;
  let mockLogger: vi.Mocked<Logger>;

  const mockEvent: WorkflowEvent = {
    id: 'event-123' as UUID,
    type: 'workflow.started',
    workflowId: 'workflow-123' as UUID,
    data: { test: 'data' },
    timestamp: new Date(),
    source: 'orchestration-service'
  };

  const mockContext: WorkflowContext = {
    projectId: 'project-123' as UUID,
    userId: 'user-123' as UUID,
    teamId: 'team-123' as UUID,
    variables: {},
    metadata: {}
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    router = new EventRouter(mockLogger);
  });

  describe('rule management', () => {
    const testRule: EventRoutingRule = {
      id: 'test-rule',
      name: 'Test Rule',
      condition: { eventType: 'workflow.started' },
      targetTopic: 'workflow-events',
      priority: 100,
      enabled: true
    };

    it('should add rule successfully', () => {
      router.addRule(testRule);

      const retrievedRule = router.getRule('test-rule');
      expect(retrievedRule).toEqual(testRule);
      expect(mockLogger.debug).toHaveBeenCalledWith('Event routing rule added', {
        ruleId: 'test-rule',
        ruleName: 'Test Rule'
      });
    });

    it('should remove rule successfully', () => {
      router.addRule(testRule);
      router.removeRule('test-rule');

      const retrievedRule = router.getRule('test-rule');
      expect(retrievedRule).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith('Event routing rule removed', {
        ruleId: 'test-rule'
      });
    });

    it('should update rule successfully', () => {
      router.addRule(testRule);
      router.updateRule('test-rule', { priority: 200, enabled: false });

      const updatedRule = router.getRule('test-rule');
      expect(updatedRule?.priority).toBe(200);
      expect(updatedRule?.enabled).toBe(false);
      expect(updatedRule?.name).toBe('Test Rule'); // Should preserve other fields
    });

    it('should throw error when updating non-existent rule', () => {
      expect(() => router.updateRule('non-existent', { priority: 200 }))
        .toThrow('Routing rule not found: non-existent');
    });

    it('should get all rules', () => {
      const rule1: EventRoutingRule = { ...testRule, id: 'rule-1' };
      const rule2: EventRoutingRule = { ...testRule, id: 'rule-2' };

      router.addRule(rule1);
      router.addRule(rule2);

      const allRules = router.getAllRules();
      expect(allRules).toHaveLength(2);
      expect(allRules).toContainEqual(rule1);
      expect(allRules).toContainEqual(rule2);
    });
  });

  describe('event routing', () => {
    it('should route event to matching rule', () => {
      const rule: EventRoutingRule = {
        id: 'workflow-rule',
        name: 'Workflow Events',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'workflow-events',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);

      expect(result.matched).toBe(true);
      expect(result.topics).toEqual(['workflow-events']);
      expect(result.appliedRules).toEqual(['workflow-rule']);
    });

    it('should not route event when no rules match', () => {
      const rule: EventRoutingRule = {
        id: 'different-rule',
        name: 'Different Events',
        condition: { eventType: 'workflow.completed' },
        targetTopic: 'completed-events',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);

      expect(result.matched).toBe(false);
      expect(result.topics).toEqual([]);
      expect(result.appliedRules).toEqual([]);
    });

    it('should not route event when rule is disabled', () => {
      const rule: EventRoutingRule = {
        id: 'disabled-rule',
        name: 'Disabled Rule',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'workflow-events',
        priority: 100,
        enabled: false
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);

      expect(result.matched).toBe(false);
      expect(result.topics).toEqual([]);
      expect(result.appliedRules).toEqual([]);
    });

    it('should route to multiple topics when multiple rules match', () => {
      const rule1: EventRoutingRule = {
        id: 'rule-1',
        name: 'Rule 1',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'topic-1',
        priority: 100,
        enabled: true
      };

      const rule2: EventRoutingRule = {
        id: 'rule-2',
        name: 'Rule 2',
        condition: { source: 'orchestration-service' },
        targetTopic: 'topic-2',
        priority: 90,
        enabled: true
      };

      router.addRule(rule1);
      router.addRule(rule2);

      const result = router.routeEvent(mockEvent, mockContext);

      expect(result.matched).toBe(true);
      expect(result.topics).toEqual(['topic-1', 'topic-2']);
      expect(result.appliedRules).toEqual(['rule-1', 'rule-2']);
    });

    it('should not duplicate topics when multiple rules target same topic', () => {
      const rule1: EventRoutingRule = {
        id: 'rule-1',
        name: 'Rule 1',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'same-topic',
        priority: 100,
        enabled: true
      };

      const rule2: EventRoutingRule = {
        id: 'rule-2',
        name: 'Rule 2',
        condition: { source: 'orchestration-service' },
        targetTopic: 'same-topic',
        priority: 90,
        enabled: true
      };

      router.addRule(rule1);
      router.addRule(rule2);

      const result = router.routeEvent(mockEvent, mockContext);

      expect(result.matched).toBe(true);
      expect(result.topics).toEqual(['same-topic']);
      expect(result.appliedRules).toEqual(['rule-1', 'rule-2']);
    });

    it('should respect rule priority order', () => {
      const lowPriorityRule: EventRoutingRule = {
        id: 'low-priority',
        name: 'Low Priority',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'low-topic',
        priority: 50,
        enabled: true
      };

      const highPriorityRule: EventRoutingRule = {
        id: 'high-priority',
        name: 'High Priority',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'high-topic',
        priority: 150,
        enabled: true
      };

      router.addRule(lowPriorityRule);
      router.addRule(highPriorityRule);

      const result = router.routeEvent(mockEvent, mockContext);

      expect(result.appliedRules).toEqual(['high-priority', 'low-priority']);
    });
  });

  describe('condition evaluation', () => {
    it('should match single event type', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: { eventType: 'workflow.started' },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should match array of event types', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: { eventType: ['workflow.started', 'workflow.completed'] },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should match workflow ID', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: { workflowId: 'workflow-123' as UUID },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should match project ID from context', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: { projectId: 'project-123' as UUID },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should match team ID from context', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: { teamId: 'team-123' as UUID },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should match source', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: { source: 'orchestration-service' },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should use custom filter', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: {
          customFilter: (event) => event.data.test === 'data'
        },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(true);
    });

    it('should handle custom filter failure', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: {
          customFilter: () => { throw new Error('Filter error'); }
        },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Custom filter evaluation failed', {
        eventId: mockEvent.id,
        error: expect.any(Error)
      });
    });

    it('should require all conditions to match', () => {
      const rule: EventRoutingRule = {
        id: 'test-rule',
        name: 'Test Rule',
        condition: {
          eventType: 'workflow.started',
          source: 'different-service' // This won't match
        },
        targetTopic: 'test-topic',
        priority: 100,
        enabled: true
      };

      router.addRule(rule);

      const result = router.routeEvent(mockEvent, mockContext);
      expect(result.matched).toBe(false);
    });
  });

  describe('default rules', () => {
    it('should create default rules', () => {
      const defaultRules = EventRouter.createDefaultRules();

      expect(defaultRules).toHaveLength(5);
      expect(defaultRules.map(r => r.id)).toEqual([
        'workflow-lifecycle',
        'step-execution',
        'agent-events',
        'integration-events',
        'error-events'
      ]);

      // All rules should be enabled
      expect(defaultRules.every(r => r.enabled)).toBe(true);

      // Rules should have different priorities
      const priorities = defaultRules.map(r => r.priority);
      expect(new Set(priorities).size).toBe(priorities.length);
    });

    it('should match workflow lifecycle events', () => {
      const rules = EventRouter.createDefaultRules();
      const workflowRule = rules.find(r => r.id === 'workflow-lifecycle')!;

      router.addRule(workflowRule);

      const startedEvent = { ...mockEvent, type: 'workflow.started' };
      const completedEvent = { ...mockEvent, type: 'workflow.completed' };
      const failedEvent = { ...mockEvent, type: 'workflow.failed' };

      expect(router.routeEvent(startedEvent).matched).toBe(true);
      expect(router.routeEvent(completedEvent).matched).toBe(true);
      expect(router.routeEvent(failedEvent).matched).toBe(true);
    });

    it('should match error events with custom filter', () => {
      const rules = EventRouter.createDefaultRules();
      const errorRule = rules.find(r => r.id === 'error-events')!;

      router.addRule(errorRule);

      const failedEvent = { ...mockEvent, type: 'step.failed' };
      const errorEvent = { ...mockEvent, type: 'integration.error' };
      const successEvent = { ...mockEvent, type: 'workflow.completed' };

      expect(router.routeEvent(failedEvent).matched).toBe(true);
      expect(router.routeEvent(errorEvent).matched).toBe(true);
      expect(router.routeEvent(successEvent).matched).toBe(false);
    });
  });
});