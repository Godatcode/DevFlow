import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { UUID } from '@devflow/shared-types';
import { logger } from '@devflow/shared-utils';
import { 
  RealtimeServer, 
  RealtimeClient, 
  StatusUpdateMessage, 
  ProgressUpdateMessage, 
  ErrorMessage,
  RealtimeMessage,
  SubscriptionMessage,
  SubscriptionManager
} from './interfaces';
import { InMemorySubscriptionManager } from './subscription-manager';

export class WebSocketRealtimeServer implements RealtimeServer {
  private wss: WebSocketServer | null = null;
  private clients = new Map<UUID, RealtimeClient>();
  private subscriptionManager: SubscriptionManager;

  constructor(subscriptionManager?: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager || new InMemorySubscriptionManager();
  }

  async start(port: number): Promise<void> {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (socket: WebSocket, request) => {
      this.handleConnection(socket, request);
    });

    logger.info(`WebSocket server started on port ${port}`);
  }

  async stop(): Promise<void> {
    if (this.wss) {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close();
      }
      
      // Close the server
      this.wss.close();
      this.wss = null;
      
      logger.info('WebSocket server stopped');
    }
  }

  private handleConnection(socket: WebSocket, request: any): void {
    const clientId = uuidv4() as UUID;
    
    // Extract user and team info from query parameters or headers
    const url = new URL(request.url || '', 'http://localhost');
    const userId = url.searchParams.get('userId') as UUID;
    const teamId = url.searchParams.get('teamId') as UUID;

    if (!userId || !teamId) {
      socket.close(1008, 'Missing userId or teamId');
      return;
    }

    const client: RealtimeClient = {
      id: clientId,
      userId,
      teamId,
      socket,
      subscriptions: new Set(),
      lastActivity: new Date()
    };

    this.clients.set(clientId, client);

    socket.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    socket.on('close', () => {
      this.handleDisconnection(clientId);
    });

    socket.on('error', (error) => {
      logger.error('WebSocket error', { clientId, error: error.message });
      this.handleDisconnection(clientId);
    });

    // Send connection confirmation
    this.sendToClient(clientId, {
      type: 'connection_established',
      clientId,
      timestamp: new Date()
    });

    logger.info('Client connected', { clientId, userId, teamId });
  }

  private async handleMessage(clientId: UUID, data: Buffer): Promise<void> {
    try {
      const message: RealtimeMessage = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) {
        return;
      }

      client.lastActivity = new Date();

      switch (message.type) {
        case 'subscribe':
          await this.handleSubscription(clientId, message);
          break;
        case 'unsubscribe':
          await this.handleUnsubscription(clientId, message);
          break;
        default:
          logger.warn('Unknown message type', { clientId, type: message.type });
      }
    } catch (error) {
      logger.error('Error handling message', { clientId, error: (error as Error).message });
    }
  }

  private async handleSubscription(clientId: UUID, message: SubscriptionMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    await this.subscriptionManager.subscribe(clientId, message.workflowId);
    client.subscriptions.add(message.workflowId);

    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      workflowId: message.workflowId,
      timestamp: new Date()
    });

    logger.info('Client subscribed to workflow', { 
      clientId, 
      workflowId: message.workflowId 
    });
  }

  private async handleUnsubscription(clientId: UUID, message: SubscriptionMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    await this.subscriptionManager.unsubscribe(clientId, message.workflowId);
    client.subscriptions.delete(message.workflowId);

    this.sendToClient(clientId, {
      type: 'unsubscription_confirmed',
      workflowId: message.workflowId,
      timestamp: new Date()
    });

    logger.info('Client unsubscribed from workflow', { 
      clientId, 
      workflowId: message.workflowId 
    });
  }

  private async handleDisconnection(clientId: UUID): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clean up subscriptions
    await this.subscriptionManager.cleanup(clientId);
    
    // Remove client
    this.clients.delete(clientId);

    logger.info('Client disconnected', { clientId });
  }

  async broadcastStatusUpdate(update: StatusUpdateMessage): Promise<void> {
    const subscribers = await this.subscriptionManager.getSubscribers(update.workflowId);
    
    for (const clientId of subscribers) {
      this.sendToClient(clientId, update);
    }

    logger.info('Broadcasted status update', { 
      workflowId: update.workflowId, 
      status: update.status,
      subscriberCount: subscribers.length 
    });
  }

  async broadcastProgressUpdate(update: ProgressUpdateMessage): Promise<void> {
    const subscribers = await this.subscriptionManager.getSubscribers(update.workflowId);
    
    for (const clientId of subscribers) {
      this.sendToClient(clientId, update);
    }

    logger.info('Broadcasted progress update', { 
      workflowId: update.workflowId, 
      progress: update.progress,
      subscriberCount: subscribers.length 
    });
  }

  async broadcastError(error: ErrorMessage): Promise<void> {
    const subscribers = await this.subscriptionManager.getSubscribers(error.workflowId);
    
    for (const clientId of subscribers) {
      this.sendToClient(clientId, error);
    }

    logger.info('Broadcasted error', { 
      workflowId: error.workflowId, 
      error: error.error,
      subscriberCount: subscribers.length 
    });
  }

  private sendToClient(clientId: UUID, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      client.socket.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Error sending message to client', { 
        clientId, 
        error: (error as Error).message 
      });
      this.handleDisconnection(clientId);
    }
  }

  getConnectedClients(): RealtimeClient[] {
    return Array.from(this.clients.values());
  }

  getClientsByWorkflow(workflowId: UUID): RealtimeClient[] {
    return Array.from(this.clients.values()).filter(client => 
      client.subscriptions.has(workflowId)
    );
  }
}