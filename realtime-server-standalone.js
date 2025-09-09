const { Server } = require('socket.io');
const { createServer } = require('http');

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const clients = new Map();
const subscriptions = new Map(); // workflowId -> Set of clientIds

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  const clientId = socket.id;
  clients.set(clientId, {
    id: clientId,
    socket: socket,
    subscriptions: new Set(),
    lastActivity: new Date()
  });

  // Handle subscription to workflows
  socket.on('subscribe', (data) => {
    const { workflowId } = data;
    if (!workflowId) return;

    // Add client to workflow subscribers
    if (!subscriptions.has(workflowId)) {
      subscriptions.set(workflowId, new Set());
    }
    subscriptions.get(workflowId).add(clientId);

    // Add to client's subscriptions
    const client = clients.get(clientId);
    if (client) {
      client.subscriptions.add(workflowId);
    }

    // Join workflow room
    socket.join(`workflow:${workflowId}`);

    socket.emit('subscription_confirmed', {
      workflowId,
      timestamp: new Date()
    });

    console.log(`Client ${clientId} subscribed to workflow ${workflowId}`);
  });

  // Handle unsubscription
  socket.on('unsubscribe', (data) => {
    const { workflowId } = data;
    if (!workflowId) return;

    // Remove client from workflow subscribers
    if (subscriptions.has(workflowId)) {
      subscriptions.get(workflowId).delete(clientId);
    }

    // Remove from client's subscriptions
    const client = clients.get(clientId);
    if (client) {
      client.subscriptions.delete(workflowId);
    }

    // Leave workflow room
    socket.leave(`workflow:${workflowId}`);

    socket.emit('unsubscription_confirmed', {
      workflowId,
      timestamp: new Date()
    });

    console.log(`Client ${clientId} unsubscribed from workflow ${workflowId}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', clientId);
    
    // Clean up subscriptions
    const client = clients.get(clientId);
    if (client) {
      for (const workflowId of client.subscriptions) {
        if (subscriptions.has(workflowId)) {
          subscriptions.get(workflowId).delete(clientId);
        }
      }
    }
    
    clients.delete(clientId);
  });

  // Send connection confirmation
  socket.emit('connection_established', {
    clientId,
    timestamp: new Date()
  });
});

// API endpoints for broadcasting updates (for testing)
const express = require('express');
const app = express();
app.use(express.json());

app.post('/broadcast/status', (req, res) => {
  const { workflowId, status, metadata } = req.body;
  
  io.to(`workflow:${workflowId}`).emit('status_update', {
    type: 'workflow_status_update',
    workflowId,
    status,
    metadata,
    timestamp: new Date()
  });

  res.json({ success: true, message: 'Status update broadcasted' });
});

app.post('/broadcast/progress', (req, res) => {
  const { workflowId, stepId, progress, message } = req.body;
  
  io.to(`workflow:${workflowId}`).emit('progress_update', {
    type: 'workflow_progress_update',
    workflowId,
    stepId,
    progress,
    message,
    timestamp: new Date()
  });

  res.json({ success: true, message: 'Progress update broadcasted' });
});

app.post('/broadcast/error', (req, res) => {
  const { workflowId, error } = req.body;
  
  io.to(`workflow:${workflowId}`).emit('error', {
    type: 'workflow_error',
    workflowId,
    error,
    timestamp: new Date()
  });

  res.json({ success: true, message: 'Error broadcasted' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    connectedClients: clients.size,
    activeSubscriptions: subscriptions.size,
    timestamp: new Date()
  });
});

const PORT = process.env.REALTIME_PORT || 8080;
const HTTP_PORT = process.env.HTTP_PORT || 8081;

// Start Socket.IO server
httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO Realtime Server started on port ${PORT}`);
});

// Start HTTP API server
app.listen(HTTP_PORT, () => {
  console.log(`📡 HTTP API Server started on port ${HTTP_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down servers...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down servers...');
  httpServer.close();
  process.exit(0);
});