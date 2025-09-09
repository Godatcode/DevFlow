#!/bin/bash

# DevFlow.ai Robust Demo Startup Script
# This script ensures all services start properly with proper error handling

set -e

echo "🚀 Starting DevFlow.ai Demo Environment (Robust)"
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Store PIDs for cleanup
PIDS=()

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            echo "Stopped process $pid"
        fi
    done
    exit 0
}

# Set up trap for cleanup
trap cleanup INT TERM

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null 2>&1; then
        return 1  # Port is in use
    else
        return 0  # Port is available
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    print_info "Waiting for $service_name to be ready on port $port..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s --max-time 2 "http://localhost:$port/health" > /dev/null 2>&1; then
            print_status "$service_name is ready!"
            return 0
        fi
        
        echo -n "."
        sleep 1
        ((attempt++))
    done
    
    print_error "$service_name failed to start on port $port"
    return 1
}

# Kill any existing processes on our ports
print_info "Cleaning up existing processes..."
for port in 3000 3001 3002 3003 3004 5173; do
    if lsof -i :$port > /dev/null 2>&1; then
        print_warning "Port $port is in use, attempting to free it..."
        lsof -ti :$port | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
done

# Start API Gateway (port 3000)
print_info "Starting API Gateway on port 3000..."
cd services/api-gateway

# Create a more robust server
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mock API endpoints for demo
app.get('/api/analytics/dora-metrics', (req, res) => {
  res.json({
    deployment_frequency: { value: 12.5, unit: 'per_week', trend: 'increasing' },
    lead_time: { value: 2.3, unit: 'days', trend: 'decreasing' },
    change_failure_rate: { value: 8.2, unit: 'percentage', trend: 'decreasing' },
    recovery_time: { value: 1.8, unit: 'hours', trend: 'decreasing' }
  });
});

app.get('/api/analytics/team-performance', (req, res) => {
  res.json({
    velocity: 42,
    quality_score: 87,
    collaboration_index: 92,
    innovation_rate: 15
  });
});

app.get('/api/agents', (req, res) => {
  res.json({
    agents: [
      { id: 'code-reviewer', name: 'AI Code Reviewer', status: 'active', performance: { success_rate: 94 } },
      { id: 'test-runner', name: 'Test Runner', status: 'active', performance: { success_rate: 98 } },
      { id: 'deployer', name: 'Deployment Agent', status: 'active', performance: { success_rate: 96 } }
    ]
  });
});

app.post('/api/agents/execute', (req, res) => {
  const { agentId, task } = req.body;
  res.json({
    execution_id: `exec_${Date.now()}`,
    agent_id: agentId,
    task: task,
    status: 'completed',
    duration: Math.floor(Math.random() * 120) + 30,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/workflows', (req, res) => {
  res.json({
    workflows: [
      { id: 'ci-cd-pipeline', name: 'CI/CD Pipeline', status: 'active', executions: 156 },
      { id: 'feature-development', name: 'Feature Development', status: 'active', executions: 89 }
    ]
  });
});

app.get('/api/integrations/github/repos', (req, res) => {
  res.json({
    repositories: [
      { name: 'devflow-core', stars: 1250, last_commit: '2 hours ago' },
      { name: 'devflow-ui', stars: 890, last_commit: '4 hours ago' }
    ]
  });
});

app.get('/api/compliance/validate/soc2', (req, res) => {
  res.json({
    compliance_status: 'compliant',
    score: 98.5,
    last_audit: '2024-01-01T00:00:00Z',
    issues: []
  });
});

app.get('/api/monitoring/metrics', (req, res) => {
  res.json({
    cpu_usage: Math.random() * 30 + 20,
    memory_usage: Math.random() * 40 + 30,
    response_time: Math.random() * 100 + 50,
    throughput: Math.random() * 1000 + 500
  });
});

// API documentation
app.get('/docs', (req, res) => {
  res.send(`
    <html>
      <head><title>DevFlow.ai API Documentation</title></head>
      <body style="font-family: Arial, sans-serif; margin: 40px;">
        <h1>🚀 DevFlow.ai API Documentation</h1>
        <h2>Available Endpoints:</h2>
        <ul>
          <li><strong>GET /health</strong> - Health check</li>
          <li><strong>GET /api/analytics/dora-metrics</strong> - DORA metrics</li>
          <li><strong>GET /api/analytics/team-performance</strong> - Team performance</li>
          <li><strong>GET /api/agents</strong> - List AI agents</li>
          <li><strong>POST /api/agents/execute</strong> - Execute agent task</li>
          <li><strong>GET /api/workflows</strong> - List workflows</li>
          <li><strong>GET /api/integrations/github/repos</strong> - GitHub repositories</li>
          <li><strong>GET /api/compliance/validate/soc2</strong> - SOC2 compliance</li>
          <li><strong>GET /api/monitoring/metrics</strong> - System metrics</li>
        </ul>
        <h2>Example Usage:</h2>
        <pre>curl http://localhost:3000/api/analytics/dora-metrics</pre>
        <pre>curl -X POST http://localhost:3000/api/agents/execute -H "Content-Type: application/json" -d '{"agentId": "code-reviewer", "task": "review-pr"}'</pre>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚪 API Gateway running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
});

process.on('SIGTERM', () => {
  console.log('API Gateway shutting down...');
  process.exit(0);
});
EOF

node server.js > /dev/null 2>&1 &
GATEWAY_PID=$!
PIDS+=($GATEWAY_PID)
cd ../..

if wait_for_service 3000 "API Gateway"; then
    print_status "API Gateway started successfully (PID: $GATEWAY_PID)"
else
    print_error "Failed to start API Gateway"
fi

# Start Web Dashboard (port 5173)
print_info "Starting Web Dashboard on port 5173..."
cd services/web-dashboard

# Update vite config to use specific port
cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
EOF

npm run dev > /dev/null 2>&1 &
DASHBOARD_PID=$!
PIDS+=($DASHBOARD_PID)
cd ../..

# Wait a bit longer for Vite to start
sleep 5

if curl -s --max-time 5 "http://localhost:5173" > /dev/null 2>&1; then
    print_status "Web Dashboard started successfully (PID: $DASHBOARD_PID)"
else
    print_warning "Web Dashboard may still be starting..."
fi

# Display final status
echo -e "\n${GREEN}🎉 Demo Environment Started!${NC}"
echo "============================"
echo ""
echo "🌐 Available Services:"
echo "  🚪 API Gateway:      http://localhost:3000"
echo "  📚 API Docs:         http://localhost:3000/docs"
echo "  🖥️  Web Dashboard:    http://localhost:5173"
echo ""
echo "🧪 Quick Tests:"
echo "  curl http://localhost:3000/health"
echo "  curl http://localhost:3000/api/analytics/dora-metrics"
echo "  curl http://localhost:3000/api/agents"
echo ""
echo "🎬 Demo Commands:"
echo "  ./demo-commands-simple.sh"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
wait