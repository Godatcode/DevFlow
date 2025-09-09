import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

const logger = new Logger('realtime-server');
import { 
  RealtimeServer, 
  RealtimeClient, 
  StatusUpdateMessage, 
  ProgressUpdateMessage, 
  ErrorMessage,
  RealtimeMessage,
  SubscriptionMessage,
  SubscriptionManager
} from './interfaces.js';
import { InMemorySubscriptionManager } from './subscription-manager.js';

export class WebSocketRealtimeServer implements RealtimeServer {
  private io: SocketIOServer | null = null;
  private httpServer: HTTPServer | null = null;
  private clients = new Map<UUID, RealtimeClient>();
  private subscriptionManager: SubscriptionManager;

  constructor(subscriptionManager?: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager || new InMemorySubscriptionManager();
  }

  async start(port: number): Promise<void> {
    this.httpServer = createServer();
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: ["http://localhost:3000", "http://localhost:5173"], // Add your frontend URLs
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    logger.info(`Socket.IO server started on port ${port}`);
  }

  async stop(): Promise<void> {
    if (this.io) {
      // Close all client connections
      for (const client of this.clients.values()) {
        (client.socket as any).disconnect();
      }
      
      // Close the server
      this.io.close();
      this.io = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          resolve();
        });
      });
      this.httpServer = null;
    }
      
    logger.info('Socket.IO server stopped');
  }

  private handleConnection(socket: Socket): void {
    const clientId = uuidv4() as UUID;
    
    // Extract user and team info from auth token or handshake
    const auth = socket.handshake.auth;
    const userId = auth.userId as UUID || socket.handshake.query.userId as UUID;
    const teamId = auth.teamId as UUID || socket.handshake.query.teamId as UUID;

    if (!userId || !teamId) {
      socket.disconnect();
      logger.warn('Client connection rejected: Missing userId or teamId', { socketId: socket.id });
      return;
    }

    const client: RealtimeClient = {
      id: clientId,
      userId,
      teamId,
      socket: socket as any, // Type compatibility
      subscriptions: new Set(),
      lastActivity: new Date()
    };

    this.clients.set(clientId, client);

    // Join user-specific room
    socket.join(`user:${userId}`);
    socket.join(`team:${teamId}`);

    socket.on('subscribe', (data: any) => {
      this.handleSubscription(clientId, data);
    });

    socket.on('unsubscribe', (data: any) => {
      this.handleUnsubscription(clientId, data);
    });

    socket.on('disconnect', () => {
      this.handleDisconnection(clientId);
    });

    socket.on('error', (error: any) => {
      logger.error('Socket.IO error', { clientId, error: error.message });
      this.handleDisconnection(clientId);
    });

    // Send connection confirmation
    socket.emit('connection_established', {
      clientId,
      timestamp: new Date()
    });

    logger.info('Client connected', { clientId, userId, teamId, socketId: socket.id });
  }



  private async handleSubscription(clientId: UUID, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const workflowId = data.workflowId as UUID;
    if (!workflowId) return;

    await this.subscriptionManager.subscribe(clientId, workflowId);
    client.subscriptions.add(workflowId);

    // Join workflow-specific room
    (client.socket as any).join(`workflow:${workflowId}`);

    (client.socket as any).emit('subscription_confirmed', {
      workflowId,
      timestamp: new Date()
    });

    logger.info('Client subscribed to workflow', { 
      clientId, 
      workflowId 
    });
  }

  private async handleUnsubscription(clientId: UUID, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const workflowId = data.workflowId as UUID;
    if (!workflowId) return;

    await this.subscriptionManager.unsubscribe(clientId, workflowId);
    client.subscriptions.delete(workflowId);

    // Leave workflow-specific room
    (client.socket as any).leave(`workflow:${workflowId}`);

    (client.socket as any).emit('unsubscription_confirmed', {
      workflowId,
      timestamp: new Date()
    });

    logger.info('Client unsubscribed from workflow', { 
      clientId, 
      workflowId 
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
    if (!this.io) return;

    // Broadcast to workflow room
    this.io.to(`workflow:${update.workflowId}`).emit('status_update', update);

    const subscribers = await this.subscriptionManager.getSubscribers(update.workflowId);
    logger.info('Broadcasted status update', { 
      workflowId: update.workflowId, 
      status: update.status,
      subscriberCount: subscribers.length 
    });
  }

  async broadcastProgressUpdate(update: ProgressUpdateMessage): Promise<void> {
    if (!this.io) return;

    // Broadcast to workflow room
    this.io.to(`workflow:${update.workflowId}`).emit('progress_update', update);

    const subscribers = await this.subscriptionManager.getSubscribers(update.workflowId);
    logger.info('Broadcasted progress update', { 
      workflowId: update.workflowId, 
      progress: update.progress,
      subscriberCount: subscribers.length 
    });
  }

  async broadcastError(error: ErrorMessage): Promise<void> {
    if (!this.io) return;

    // Broadcast to workflow room
    this.io.to(`workflow:${error.workflowId}`).emit('error', error);

    const subscribers = await this.subscriptionManager.getSubscribers(error.workflowId);
    logger.info('Broadcasted error', { 
      workflowId: error.workflowId, 
      error: error.error,
      subscriberCount: subscribers.length 
    });
  }

  private sendToClient(clientId: UUID, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      (client.socket as any).emit('message', message);
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