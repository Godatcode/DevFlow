#!/bin/bash

# DevFlow.ai Full Demo Startup Script
# This script starts all the actual services for a complete demo

set -e

echo "🚀 Starting DevFlow.ai Full Demo Environment"
echo "==========================================="

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

# Function to start a service
start_service() {
    local service_name=$1
    local service_path=$2
    local port=$3
    local start_command=$4
    
    print_info "Starting $service_name on port $port..."
    
    cd "$service_path"
    $start_command &
    local pid=$!
    PIDS+=($pid)
    cd - > /dev/null
    
    # Wait a moment for the service to start
    sleep 2
    
    # Check if service is running
    if kill -0 "$pid" 2>/dev/null; then
        print_status "$service_name started (PID: $pid)"
    else
        echo -e "${RED}❌ Failed to start $service_name${NC}"
    fi
}

# Start API Gateway (port 3000)
print_info "Starting API Gateway..."
cd services/api-gateway
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const { GatewayService } = require('./dist/gateway-service');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize gateway service
const gateway = new GatewayService();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'api-gateway',
    timestamp: new Date().toISOString() 
  });
});

// Gateway routes
app.use('/api', gateway.getRouter());

app.listen(PORT, () => {
  console.log(`🚪 API Gateway running on http://localhost:${PORT}`);
});
EOF

node server.js &
GATEWAY_PID=$!
PIDS+=($GATEWAY_PID)
cd ../..
sleep 2
print_status "API Gateway started (PID: $GATEWAY_PID)"

# Start Analytics Service (port 3001)
print_info "Starting Analytics Service..."
cd services/analytics
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const { DoraMetricsService } = require('./dist/dora-metrics-service');
const { TeamPerformanceService } = require('./dist/team-performance-service');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize services
const doraService = new DoraMetricsService();
const teamService = new TeamPerformanceService();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'analytics',
    timestamp: new Date().toISOString() 
  });
});

// DORA metrics endpoints
app.get('/api/dora-metrics', async (req, res) => {
  try {
    const metrics = await doraService.calculateMetrics('demo-project');
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Team performance endpoints
app.get('/api/team-performance', async (req, res) => {
  try {
    const performance = await teamService.analyzeTeamPerformance('demo-team');
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`📊 Analytics Service running on http://localhost:${PORT}`);
});
EOF

node server.js &
ANALYTICS_PID=$!
PIDS+=($ANALYTICS_PID)
cd ../..
sleep 2
print_status "Analytics Service started (PID: $ANALYTICS_PID)"

# Start Automation Service (port 3002)
print_info "Starting Automation Service..."
cd services/automation
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const { AgentManager } = require('./dist/agent-manager');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Initialize agent manager
const agentManager = new AgentManager();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'automation',
    timestamp: new Date().toISOString() 
  });
});

// Agent endpoints
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await agentManager.discoverAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/execute', async (req, res) => {
  try {
    const { agentId, task, context } = req.body;
    const result = await agentManager.executeAgent(agentId, task, context);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🤖 Automation Service running on http://localhost:${PORT}`);
});
EOF

node server.js &
AUTOMATION_PID=$!
PIDS+=($AUTOMATION_PID)
cd ../..
sleep 2
print_status "Automation Service started (PID: $AUTOMATION_PID)"

# Start Orchestration Service (port 3003)
print_info "Starting Orchestration Service..."
cd services/orchestration
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const { WorkflowOrchestrator } = require('./dist/workflow-orchestrator');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

// Initialize orchestrator
const orchestrator = new WorkflowOrchestrator();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'orchestration',
    timestamp: new Date().toISOString() 
  });
});

// Workflow endpoints
app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await orchestrator.getActiveWorkflows();
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workflows/execute', async (req, res) => {
  try {
    const { workflowId, context } = req.body;
    const result = await orchestrator.executeWorkflow(workflowId, context);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🎼 Orchestration Service running on http://localhost:${PORT}`);
});
EOF

node server.js &
ORCHESTRATION_PID=$!
PIDS+=($ORCHESTRATION_PID)
cd ../..
sleep 2
print_status "Orchestration Service started (PID: $ORCHESTRATION_PID)"

# Start Integration Service (port 3004)
print_info "Starting Integration Service..."
cd services/integration
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'integration',
    timestamp: new Date().toISOString() 
  });
});

// Mock integration endpoints
app.get('/api/github/repos', (req, res) => {
  res.json({
    repositories: [
      { name: 'devflow-core', stars: 1250, last_commit: '2 hours ago' },
      { name: 'devflow-ui', stars: 890, last_commit: '4 hours ago' },
      { name: 'devflow-agents', stars: 2100, last_commit: '1 hour ago' }
    ]
  });
});

app.get('/api/jira/issues', (req, res) => {
  res.json({
    issues: [
      { key: 'DEV-123', summary: 'Implement new analytics dashboard', status: 'In Progress' },
      { key: 'DEV-124', summary: 'Fix agent discovery bug', status: 'Done' },
      { key: 'DEV-125', summary: 'Add security compliance checks', status: 'To Do' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🔗 Integration Service running on http://localhost:${PORT}`);
});
EOF

node server.js &
INTEGRATION_PID=$!
PIDS+=($INTEGRATION_PID)
cd ../..
sleep 2
print_status "Integration Service started (PID: $INTEGRATION_PID)"

# Start Web Dashboard (port 5173)
print_info "Starting Web Dashboard..."
cd services/web-dashboard
npm run dev &
DASHBOARD_PID=$!
PIDS+=($DASHBOARD_PID)
cd ../..
sleep 3
print_status "Web Dashboard started (PID: $DASHBOARD_PID)"

# Display service status
echo -e "\n${GREEN}🎉 All Services Started Successfully!${NC}"
echo "=================================="
echo ""
echo "🌐 Service Endpoints:"
echo "  🚪 API Gateway:      http://localhost:3000"
echo "  📊 Analytics:        http://localhost:3001"
echo "  🤖 Automation:       http://localhost:3002"
echo "  🎼 Orchestration:    http://localhost:3003"
echo "  🔗 Integration:      http://localhost:3004"
echo "  🖥️  Web Dashboard:    http://localhost:5173"
echo ""
echo "🔍 Health Checks:"
echo "  curl http://localhost:3000/health"
echo "  curl http://localhost:3001/health"
echo "  curl http://localhost:3002/health"
echo "  curl http://localhost:3003/health"
echo "  curl http://localhost:3004/health"
echo ""
echo "🎬 Demo Commands:"
echo "  ./demo-commands-full.sh"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
wait