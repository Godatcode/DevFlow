const { io } = require('socket.io-client');

console.log('Testing Socket.IO connection...');

const socket = io('http://localhost:8080', {
  auth: {
    token: 'test-token'
  }
});

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO server:', socket.id);
  
  // Test subscribing to a workflow
  socket.emit('subscribe', { workflowId: 'test-workflow-123' });
});

socket.on('connection_established', (data) => {
  console.log('✅ Connection established:', data);
});

socket.on('subscription_confirmed', (data) => {
  console.log('✅ Subscription confirmed:', data);
  
  // Test broadcasting a status update
  setTimeout(() => {
    console.log('📡 Testing status update broadcast...');
    fetch('http://localhost:8081/broadcast/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflowId: 'test-workflow-123',
        status: 'running',
        metadata: { step: 'initialization' }
      })
    }).then(() => {
      console.log('📡 Status update sent');
    });
  }, 1000);
});

socket.on('status_update', (data) => {
  console.log('📨 Received status update:', data);
});

socket.on('progress_update', (data) => {
  console.log('📨 Received progress update:', data);
});

socket.on('error', (data) => {
  console.log('📨 Received error:', data);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from Socket.IO server');
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test client...');
  socket.disconnect();
  process.exit(0);
});