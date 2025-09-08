import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowRealtimeEventPublisher } from '../realtime-event-publisher';
import { RealtimeServer } from '../interfaces';
import { UUID, WorkflowStatus } from '@devflow/shared-types';

// Mock logger
vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('WorkflowRealtimeEventPublisher', () => {
  let publisher: WorkflowRealtimeEventPublisher;
  let mockRealtimeServer: RealtimeServer;

  const workflowId = 'workflow-1' as UUID;
  const stepId = 'step-1' as UUID;

  beforeEach(() => {
    mockRealtimeServer = {
      start: vi.fn(),
      stop: vi.fn(),
      broadcastStatusUpdate: vi.fn(),
      broadcastProgressUpdate: vi.fn(),
      broadcastError: vi.fn(),
      getConnectedClients: vi.fn(),
      getClientsByWorkflow: vi.fn()
    };

    publisher = new WorkflowRealtimeEventPublisher(mockRealtimeServer);
  });

  describe('publishStatusUpdate', () => {
    it('should publish status update with metadata', async () => {
      const metadata = { duration: 1000, stepCount: 5 };
      
      await publisher.publishStatusUpdate(workflowId, WorkflowStatus.COMPLETED, metadata);

      expect(mockRealtimeServer.broadcastStatusUpdate).toHaveBeenCalledWith({
        type: 'workflow_status_update',
        workflowId,
        status: WorkflowStatus.COMPLETED,
        timestamp: expect.any(Date),
        metadata
      });
    });

    it('should publish status update without metadata', async () => {
      await publisher.publishStatusUpdate(workflowId, WorkflowStatus.ACTIVE);

      expect(mockRealtimeServer.broadcastStatusUpdate).toHaveBeenCalledWith({
        type: 'workflow_status_update',
        workflowId,
        status: WorkflowStatus.ACTIVE,
        timestamp: expect.any(Date),
        metadata: undefined
      });
    });

    it('should handle broadcast errors gracefully', async () => {
      const error = new Error('Broadcast failed');
      vi.mocked(mockRealtimeServer.broadcastStatusUpdate).mockRejectedValue(error);

      // Should not throw
      await expect(publisher.publishStatusUpdate(workflowId, WorkflowStatus.ACTIVE))
        .resolves.toBeUndefined();
    });
  });

  describe('publishProgressUpdate', () => {
    it('should publish progress update with message', async () => {
      const progress = 75;
      const message = 'Processing data';
      
      await publisher.publishProgressUpdate(workflowId, stepId, progress, message);

      expect(mockRealtimeServer.broadcastProgressUpdate).toHaveBeenCalledWith({
        type: 'workflow_progress_update',
        workflowId,
        stepId,
        progress,
        message,
        timestamp: expect.any(Date)
      });
    });

    it('should publish progress update without message', async () => {
      const progress = 50;
      
      await publisher.publishProgressUpdate(workflowId, stepId, progress);

      expect(mockRealtimeServer.broadcastProgressUpdate).toHaveBeenCalledWith({
        type: 'workflow_progress_update',
        workflowId,
        stepId,
        progress,
        message: undefined,
        timestamp: expect.any(Date)
      });
    });

    it('should handle broadcast errors gracefully', async () => {
      const error = new Error('Broadcast failed');
      vi.mocked(mockRealtimeServer.broadcastProgressUpdate).mockRejectedValue(error);

      // Should not throw
      await expect(publisher.publishProgressUpdate(workflowId, stepId, 50))
        .resolves.toBeUndefined();
    });
  });

  describe('publishError', () => {
    it('should publish error message', async () => {
      const errorMessage = 'Workflow execution failed';
      
      await publisher.publishError(workflowId, errorMessage);

      expect(mockRealtimeServer.broadcastError).toHaveBeenCalledWith({
        type: 'workflow_error',
        workflowId,
        error: errorMessage,
        timestamp: expect.any(Date)
      });
    });

    it('should handle broadcast errors gracefully', async () => {
      const broadcastError = new Error('Broadcast failed');
      vi.mocked(mockRealtimeServer.broadcastError).mockRejectedValue(broadcastError);

      // Should not throw
      await expect(publisher.publishError(workflowId, 'Test error'))
        .resolves.toBeUndefined();
    });
  });
});