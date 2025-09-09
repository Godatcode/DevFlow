import { UUID, WorkflowStatus } from '@devflow/shared-types';

export interface RealtimeClient {
  id: UUID;
  userId: UUID;
  teamId: UUID;
  socket: any; // Generic socket type to support both WebSocket and Socket.IO
  subscriptions: Set<string>;
  lastActivity: Date;
}

export interface StatusUpdateMessage {
  type: 'workflow_status_update';
  workflowId: UUID;
  status: WorkflowStatus;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ProgressUpdateMessage {
  type: 'workflow_progress_update';
  workflowId: UUID;
  stepId: UUID;
  progress: number;
  message?: string;
  timestamp: Date;
}

export interface ErrorMessage {
  type: 'workflow_error';
  workflowId: UUID;
  error: string;
  timestamp: Date;
}

export interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  workflowId: UUID;
}

export type RealtimeMessage = 
  | StatusUpdateMessage 
  | ProgressUpdateMessage 
  | ErrorMessage 
  | SubscriptionMessage;

export interface RealtimeServer {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  broadcastStatusUpdate(update: StatusUpdateMessage): Promise<void>;
  broadcastProgressUpdate(update: ProgressUpdateMessage): Promise<void>;
  broadcastError(error: ErrorMessage): Promise<void>;
  getConnectedClients(): RealtimeClient[];
  getClientsByWorkflow(workflowId: UUID): RealtimeClient[];
}

export interface SubscriptionManager {
  subscribe(clientId: UUID, workflowId: UUID): Promise<void>;
  unsubscribe(clientId: UUID, workflowId: UUID): Promise<void>;
  getSubscribers(workflowId: UUID): Promise<UUID[]>;
  getSubscriptions(clientId: UUID): Promise<UUID[]>;
  cleanup(clientId: UUID): Promise<void>;
}

export interface RealtimeEventPublisher {
  publishStatusUpdate(workflowId: UUID, status: WorkflowStatus, metadata?: Record<string, any>): Promise<void>;
  publishProgressUpdate(workflowId: UUID, stepId: UUID, progress: number, message?: string): Promise<void>;
  publishError(workflowId: UUID, error: string): Promise<void>;
}