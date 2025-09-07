import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowEventPublisherImpl } from '../event-bus/workflow-event-publisher';
import { EventBus, WorkflowEvent } from '../interfaces';
import { EventRouter, EventRoutingResult } from '../event-bus/event-router';
import { 
  Workflow, 
  WorkflowContext, 
  WorkflowStep, 
  WorkflowStepResult, 
  WorkflowStatus,
  WorkflowStepType,
  Status,
  UUID 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

describe('WorkflowEventPublisher', () => {
  let publisher: WorkflowEventPublisherImpl;
  let mockEventBus: vi.Mocked<EventBus>;
  let mockEventRouter: vi.Mocked<EventRouter>;
  let mockLogger: vi.Mocked<Logger>;

  const mockWorkflow: Workflow = {
    id: 'workflow-123' as UUID,
    definitionId: 'def-123' as UUID,
    status: WorkflowStatus.ACTIVE,
    context: {
      projectId: 'project-123' as UUID,
      userId: 'user-123' as UUID,
      teamId: 'team-123' as UUID,
      variables: {},
      metadata: {}
    },
    executionId: 'exec-123' as UUID,
    startedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockContext: WorkflowContext = {
    projectId: 'project-123' as UUID,
    userId: 'user-123' as UUID,
    teamId: 'team-123' as UUID,
    variables: {},
    metadata: {}
  };

  const mockStep: WorkflowStep = {
    id: 'step-123' as UUID,
    name: 'Test Step',
    type: WorkflowStepType.AGENT_EXECUTION,
    config: { agent: 'test-agent' },
    dependencies: []
  };

  const mockStepResult: WorkflowStepResult = {
    stepId: 'step-123' as UUID,
    status: Status.COMPLETED,
    output: { result: 'success' },
    duration: 1000
  };

  beforeEach(() => {
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    mockEventRouter = {
      routeEvent: vi.fn(),
      addRule: vi.fn(),
      removeRule: vi.fn(),
      updateRule: vi.fn(),
      getRule: vi.fn(),
      getAllRules: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    } as any;

    publisher = new WorkflowEventPublisherImpl(mockEventBus, mockEventRouter, mockLogger);

    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'event-uuid-123')
    });
  });

  describe('publishWorkflowStarted', () => {
    it('should publish workflow started event successfully', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['workflow-lifecycle'],
        matched: true,
        appliedRules: ['workflow-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishWorkflowStarted(mockWorkflow, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'event-uuid-123',
          type: 'workflow.started',
          workflowId: mockWorkflow.id,
          source: 'orchestration-service'
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'workflow-lifecycle',
        expect.objectContaining({
          type: 'workflow.started',
          workflowId: mockWorkflow.id
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith('Event published successfully', {
        eventId: 'event-uuid-123',
        eventType: 'workflow.started',
        workflowId: mockWorkflow.id,
        topics: ['workflow-lifecycle'],
        appliedRules: ['workflow-rule']
      });
    });
  });

  describe('publishWorkflowCompleted', () => {
    it('should publish workflow completed event successfully', async () => {
      const completedWorkflow = {
        ...mockWorkflow,
        status: WorkflowStatus.COMPLETED,
        completedAt: new Date()
      };

      const routingResult: EventRoutingResult = {
        topics: ['workflow-lifecycle'],
        matched: true,
        appliedRules: ['workflow-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishWorkflowCompleted(completedWorkflow, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow.completed',
          data: expect.objectContaining({
            status: WorkflowStatus.COMPLETED,
            completedAt: completedWorkflow.completedAt
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith('workflow-lifecycle', expect.any(Object));
    });
  });

  describe('publishWorkflowFailed', () => {
    it('should publish workflow failed event successfully', async () => {
      const error = 'Workflow execution failed';
      const routingResult: EventRoutingResult = {
        topics: ['workflow-lifecycle', 'error-events'],
        matched: true,
        appliedRules: ['workflow-rule', 'error-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishWorkflowFailed(mockWorkflow, mockContext, error);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow.failed',
          data: expect.objectContaining({
            error,
            failedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
      expect(mockEventBus.publish).toHaveBeenCalledWith('workflow-lifecycle', expect.any(Object));
      expect(mockEventBus.publish).toHaveBeenCalledWith('error-events', expect.any(Object));
    });
  });

  describe('publishWorkflowPaused', () => {
    it('should publish workflow paused event successfully', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['workflow-lifecycle'],
        matched: true,
        appliedRules: ['workflow-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishWorkflowPaused(mockWorkflow, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow.paused',
          data: expect.objectContaining({
            pausedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith('workflow-lifecycle', expect.any(Object));
    });
  });

  describe('publishWorkflowResumed', () => {
    it('should publish workflow resumed event successfully', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['workflow-lifecycle'],
        matched: true,
        appliedRules: ['workflow-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishWorkflowResumed(mockWorkflow, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow.resumed',
          data: expect.objectContaining({
            resumedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith('workflow-lifecycle', expect.any(Object));
    });
  });

  describe('publishStepStarted', () => {
    it('should publish step started event successfully', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['step-execution'],
        matched: true,
        appliedRules: ['step-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishStepStarted(mockWorkflow.id, mockStep, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'step.started',
          workflowId: mockWorkflow.id,
          data: expect.objectContaining({
            stepId: mockStep.id,
            stepName: mockStep.name,
            stepType: mockStep.type,
            startedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith('step-execution', expect.any(Object));
    });
  });

  describe('publishStepCompleted', () => {
    it('should publish step completed event successfully', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['step-execution'],
        matched: true,
        appliedRules: ['step-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishStepCompleted(mockWorkflow.id, mockStep, mockStepResult, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'step.completed',
          workflowId: mockWorkflow.id,
          data: expect.objectContaining({
            stepId: mockStep.id,
            result: {
              status: mockStepResult.status,
              output: mockStepResult.output,
              duration: mockStepResult.duration
            },
            completedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith('step-execution', expect.any(Object));
    });
  });

  describe('publishStepFailed', () => {
    it('should publish step failed event successfully', async () => {
      const error = 'Step execution failed';
      const routingResult: EventRoutingResult = {
        topics: ['step-execution', 'error-events'],
        matched: true,
        appliedRules: ['step-rule', 'error-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishStepFailed(mockWorkflow.id, mockStep, error, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'step.failed',
          workflowId: mockWorkflow.id,
          data: expect.objectContaining({
            stepId: mockStep.id,
            error,
            failedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
    });
  });

  describe('publishAgentAssigned', () => {
    it('should publish agent assigned event successfully', async () => {
      const agentId = 'agent-123';
      const taskId = 'task-123';
      const routingResult: EventRoutingResult = {
        topics: ['agent-execution'],
        matched: true,
        appliedRules: ['agent-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishAgentAssigned(mockWorkflow.id, agentId, taskId, mockContext);

      expect(mockEventRouter.routeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent.assigned',
          workflowId: mockWorkflow.id,
          data: expect.objectContaining({
            agentId,
            taskId,
            assignedAt: expect.any(Date)
          })
        }),
        mockContext
      );

      expect(mockEventBus.publish).toHaveBeenCalledWith('agent-execution', expect.any(Object));
    });
  });

  describe('error handling', () => {
    it('should handle routing failure gracefully', async () => {
      const routingResult: EventRoutingResult = {
        topics: [],
        matched: false,
        appliedRules: []
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);

      await publisher.publishWorkflowStarted(mockWorkflow, mockContext);

      expect(mockEventBus.publish).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('No routing rules matched for event', {
        eventId: 'event-uuid-123',
        eventType: 'workflow.started',
        workflowId: mockWorkflow.id
      });
    });

    it('should handle event bus publish failure', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['workflow-lifecycle'],
        matched: true,
        appliedRules: ['workflow-rule']
      };

      const error = new Error('Publish failed');
      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockRejectedValue(error);

      await expect(publisher.publishWorkflowStarted(mockWorkflow, mockContext))
        .rejects.toThrow('Publish failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to publish event', {
        eventId: 'event-uuid-123',
        eventType: 'workflow.started',
        workflowId: mockWorkflow.id,
        error
      });
    });

    it('should handle partial publish failure', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['topic-1', 'topic-2'],
        matched: true,
        appliedRules: ['rule-1', 'rule-2']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish
        .mockResolvedValueOnce() // First topic succeeds
        .mockRejectedValueOnce(new Error('Second topic failed')); // Second topic fails

      await expect(publisher.publishWorkflowStarted(mockWorkflow, mockContext))
        .rejects.toThrow('Second topic failed');

      expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
    });
  });

  describe('event structure', () => {
    it('should create events with correct structure', async () => {
      const routingResult: EventRoutingResult = {
        topics: ['test-topic'],
        matched: true,
        appliedRules: ['test-rule']
      };

      mockEventRouter.routeEvent.mockReturnValue(routingResult);
      mockEventBus.publish.mockResolvedValue();

      await publisher.publishWorkflowStarted(mockWorkflow, mockContext);

      const publishCall = mockEventBus.publish.mock.calls[0];
      const event = publishCall[1] as WorkflowEvent;

      expect(event).toMatchObject({
        id: 'event-uuid-123',
        type: 'workflow.started',
        workflowId: mockWorkflow.id,
        source: 'orchestration-service',
        timestamp: expect.any(Date),
        data: expect.objectContaining({
          workflowId: mockWorkflow.id,
          definitionId: mockWorkflow.definitionId,
          executionId: mockWorkflow.executionId
        })
      });
    });
  });
});