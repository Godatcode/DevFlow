import { UUID, WorkflowStatus } from '@devflow/shared-types';
import { logger } from '@devflow/shared-utils';
import { 
  RealtimeEventPublisher, 
  RealtimeServer, 
  StatusUpdateMessage, 
  ProgressUpdateMessage, 
  ErrorMessage 
} from './interfaces';

export class WorkflowRealtimeEventPublisher implements RealtimeEventPublisher {
  constructor(private realtimeServer: RealtimeServer) {}

  async publishStatusUpdate(
    workflowId: UUID, 
    status: WorkflowStatus, 
    metadata?: Record<string, any>
  ): Promise<void> {
    const message: StatusUpdateMessage = {
      type: 'workflow_status_update',
      workflowId,
      status,
      timestamp: new Date(),
      metadata
    };

    try {
      await this.realtimeServer.broadcastStatusUpdate(message);
      logger.info('Published workflow status update', { workflowId, status });
    } catch (error) {
      logger.error('Failed to publish status update', { 
        workflowId, 
        status, 
        error: (error as Error).message 
      });
    }
  }

  async publishProgressUpdate(
    workflowId: UUID, 
    stepId: UUID, 
    progress: number, 
    message?: string
  ): Promise<void> {
    const updateMessage: ProgressUpdateMessage = {
      type: 'workflow_progress_update',
      workflowId,
      stepId,
      progress,
      message,
      timestamp: new Date()
    };

    try {
      await this.realtimeServer.broadcastProgressUpdate(updateMessage);
      logger.info('Published workflow progress update', { 
        workflowId, 
        stepId, 
        progress 
      });
    } catch (error) {
      logger.error('Failed to publish progress update', { 
        workflowId, 
        stepId, 
        progress, 
        error: (error as Error).message 
      });
    }
  }

  async publishError(workflowId: UUID, error: string): Promise<void> {
    const errorMessage: ErrorMessage = {
      type: 'workflow_error',
      workflowId,
      error,
      timestamp: new Date()
    };

    try {
      await this.realtimeServer.broadcastError(errorMessage);
      logger.info('Published workflow error', { workflowId, error });
    } catch (error) {
      logger.error('Failed to publish error', { 
        workflowId, 
        error: (error as Error).message 
      });
    }
  }
}