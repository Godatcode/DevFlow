import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketRealtimeServer } from '../realtime-server';
import { InMemorySubscriptionManager } from '../subscription-manager';
import { UUID, WorkflowStatus } from '@devflow/shared-types';

// Mock WebSocket and logger
vi.mock('ws', () => ({
  WebSocketServer: vi.fn(),
  WebSocket: {
    OPEN: 1,
    CLOSED: 3
  }
}));

vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('WebSocketRealtimeServer', () => {
  let server: WebSocketRealtimeServer;
  let subscriptionManager: InMemorySubscriptionManager;
  let mockSocket: any;

  const userId = 'user-1' as UUID;
  const teamId = 'team-1' as UUID;
  const workflowId = 'workflow-1' as UUID;

  beforeEach(() => {
    subscriptionManager = new InMemorySubscriptionManager();
    server = new WebSocketRealtimeServer(subscriptionManager);
    
    mockSocket = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn()
    };
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('broadcastStatusUpdate', () => {
    it('should broadcast status update to subscribed clients', async () => {
      // Setup: Add client and subscription
      const clientId = 'client-1' as UUID;
      await subscriptionManager.subscribe(clientId, workflowId);
      
      // Mock the clients map
      (server as any).clients.set(clientId, {
        id: clientId,
        userId,
        teamId,
        socket: mockSocket,
        subscriptions: new Set([workflowId]),
        lastActivity: new Date()
      });

      const statusUpdate = {
        type: 'workflow_status_update' as const,
        workflowId,
        status: WorkflowStatus.ACTIVE,
        timestamp: new Date()
      };

      await server.broadcastStatusUpdate(statusUpdate);

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(statusUpdate));
    });

    it('should not broadcast to clients not subscribed to workflow', async () => {
      const clientId = 'client-1' as UUID;
      const otherWorkflowId = 'other-workflow' as UUID;
      
      await subscriptionManager.subscribe(clientId, otherWorkflowId);
      
      (server as any).clients.set(clientId, {
        id: clientId,
        userId,
        teamId,
        socket: mockSocket,
        subscriptions: new Set([otherWorkflowId]),
        lastActivity: new Date()
      });

      const statusUpdate = {
        type: 'workflow_status_update' as const,
        workflowId,
        status: WorkflowStatus.ACTIVE,
        timestamp: new Date()
      };

      await server.broadcastStatusUpdate(statusUpdate);

      expect(mockSocket.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastProgressUpdate', () => {
    it('should broadcast progress update to subscribed clients', async () => {
      const clientId = 'client-1' as UUID;
      const stepId = 'step-1' as UUID;
      
      await subscriptionManager.subscribe(clientId, workflowId);
      
      (server as any).clients.set(clientId, {
        id: clientId,
        userId,
        teamId,
        socket: mockSocket,
        subscriptions: new Set([workflowId]),
        lastActivity: new Date()
      });

      const progressUpdate = {
        type: 'workflow_progress_update' as const,
        workflowId,
        stepId,
        progress: 50,
        message: 'Processing step',
        timestamp: new Date()
      };

      await server.broadcastProgressUpdate(progressUpdate);

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(progressUpdate));
    });
  });

  describe('broadcastError', () => {
    it('should broadcast error to subscribed clients', async () => {
      const clientId = 'client-1' as UUID;
      
      await subscriptionManager.subscribe(clientId, workflowId);
      
      (server as any).clients.set(clientId, {
        id: clientId,
        userId,
        teamId,
        socket: mockSocket,
        subscriptions: new Set([workflowId]),
        lastActivity: new Date()
      });

      const errorMessage = {
        type: 'workflow_error' as const,
        workflowId,
        error: 'Test error',
        timestamp: new Date()
      };

      await server.broadcastError(errorMessage);

      expect(mockSocket.send).toHaveBeenCalledWith(JSON.stringify(errorMessage));
    });
  });

  describe('getConnectedClients', () => {
    it('should return all connected clients', () => {
      const clientId1 = 'client-1' as UUID;
      const clientId2 = 'client-2' as UUID;
      
      const client1 = {
        id: clientId1,
        userId: 'user-1' as UUID,
        teamId: 'team-1' as UUID,
        socket: mockSocket,
        subscriptions: new Set(),
        lastActivity: new Date()
      };
      
      const client2 = {
        id: clientId2,
        userId: 'user-2' as UUID,
        teamId: 'team-1' as UUID,
        socket: mockSocket,
        subscriptions: new Set(),
        lastActivity: new Date()
      };

      (server as any).clients.set(clientId1, client1);
      (server as any).clients.set(clientId2, client2);

      const clients = server.getConnectedClients();
      expect(clients).toHaveLength(2);
      expect(clients).toContain(client1);
      expect(clients).toContain(client2);
    });
  });

  describe('getClientsByWorkflow', () => {
    it('should return clients subscribed to specific workflow', () => {
      const clientId1 = 'client-1' as UUID;
      const clientId2 = 'client-2' as UUID;
      const otherWorkflowId = 'other-workflow' as UUID;
      
      const client1 = {
        id: clientId1,
        userId: 'user-1' as UUID,
        teamId: 'team-1' as UUID,
        socket: mockSocket,
        subscriptions: new Set([workflowId]),
        lastActivity: new Date()
      };
      
      const client2 = {
        id: clientId2,
        userId: 'user-2' as UUID,
        teamId: 'team-1' as UUID,
        socket: mockSocket,
        subscriptions: new Set([otherWorkflowId]),
        lastActivity: new Date()
      };

      (server as any).clients.set(clientId1, client1);
      (server as any).clients.set(clientId2, client2);

      const clients = server.getClientsByWorkflow(workflowId);
      expect(clients).toHaveLength(1);
      expect(clients[0]).toBe(client1);
    });
  });
});