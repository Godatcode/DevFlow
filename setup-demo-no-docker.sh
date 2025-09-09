#!/bin/bash

# DevFlow.ai Demo Setup Script (No Docker Version)
# This script prepares the environment for a live demonstration without Docker

set -e

echo "🚀 Setting up DevFlow.ai Demo Environment (No Docker)"
echo "===================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
echo -e "\n${BLUE}📋 Checking Prerequisites${NC}"
echo "------------------------"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Node.js found: $NODE_VERSION"
else
    print_error "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_status "npm found: $NPM_VERSION"
else
    print_error "npm not found. Please install npm first."
    exit 1
fi

print_warning "Docker not available - running in local mode"

# Install dependencies
echo -e "\n${BLUE}📦 Installing Dependencies${NC}"
echo "-------------------------"

print_info "Installing root dependencies..."
npm install

# Build all services and shared libraries
echo -e "\n${BLUE}🔨 Building All Components${NC}"
echo "-------------------------"

print_info "Building shared libraries..."
for lib in audit cache config database monitoring types utils; do
    if [ -d "shared/$lib" ]; then
        print_info "Building shared/$lib..."
        cd "shared/$lib"
        npm install --silent
        npm run build --silent
        cd ../..
        print_status "Built shared/$lib"
    fi
done

print_info "Building services..."
for service in analytics api-gateway automation integration orchestration web-dashboard; do
    if [ -d "services/$service" ]; then
        print_info "Building services/$service..."
        cd "services/$service"
        npm install --silent
        npm run build --silent
        cd ../..
        print_status "Built services/$service"
    fi
done

# Create demo data
echo -e "\n${BLUE}📊 Setting Up Demo Data${NC}"
echo "----------------------"

# Create demo data files
mkdir -p demo-data

# Create sample workflow data
cat > demo-data/sample-workflows.json << 'EOF'
{
  "workflows": [
    {
      "id": "ci-cd-pipeline",
      "name": "CI/CD Pipeline",
      "description": "Automated build, test, and deployment workflow",
      "status": "active",
      "steps": [
        {"name": "Code Review", "agent": "code-reviewer", "duration": 300},
        {"name": "Unit Tests", "agent": "test-runner", "duration": 180},
        {"name": "Security Scan", "agent": "security-scanner", "duration": 120},
        {"name": "Deploy to Staging", "agent": "deployer", "duration": 240},
        {"name": "Integration Tests", "agent": "test-runner", "duration": 360},
        {"name": "Deploy to Production", "agent": "deployer", "duration": 180}
      ]
    },
    {
      "id": "feature-development",
      "name": "Feature Development",
      "description": "End-to-end feature development workflow",
      "status": "active",
      "steps": [
        {"name": "Requirements Analysis", "agent": "analyst", "duration": 600},
        {"name": "Design Review", "agent": "architect", "duration": 480},
        {"name": "Code Generation", "agent": "code-generator", "duration": 720},
        {"name": "Code Review", "agent": "code-reviewer", "duration": 300},
        {"name": "Testing", "agent": "test-runner", "duration": 420}
      ]
    }
  ]
}
EOF

# Create sample metrics data
cat > demo-data/sample-metrics.json << 'EOF'
{
  "dora_metrics": {
    "deployment_frequency": {
      "value": 12.5,
      "unit": "per_week",
      "trend": "increasing",
      "target": 15
    },
    "lead_time": {
      "value": 2.3,
      "unit": "days",
      "trend": "decreasing",
      "target": 2.0
    },
    "change_failure_rate": {
      "value": 8.2,
      "unit": "percentage",
      "trend": "decreasing",
      "target": 5.0
    },
    "recovery_time": {
      "value": 1.8,
      "unit": "hours",
      "trend": "decreasing",
      "target": 1.0
    }
  },
  "team_performance": {
    "velocity": 42,
    "quality_score": 87,
    "collaboration_index": 92,
    "innovation_rate": 15
  }
}
EOF

# Create sample agent data
cat > demo-data/sample-agents.json << 'EOF'
{
  "agents": [
    {
      "id": "code-reviewer",
      "name": "AI Code Reviewer",
      "type": "analysis",
      "status": "active",
      "capabilities": ["code-review", "security-analysis", "best-practices"],
      "performance": {"success_rate": 94, "avg_response_time": 45}
    },
    {
      "id": "test-runner",
      "name": "Automated Test Runner",
      "type": "testing",
      "status": "active",
      "capabilities": ["unit-tests", "integration-tests", "performance-tests"],
      "performance": {"success_rate": 98, "avg_response_time": 120}
    },
    {
      "id": "deployer",
      "name": "Deployment Agent",
      "type": "deployment",
      "status": "active",
      "capabilities": ["staging-deploy", "production-deploy", "rollback"],
      "performance": {"success_rate": 96, "avg_response_time": 180}
    },
    {
      "id": "security-scanner",
      "name": "Security Scanner",
      "type": "security",
      "status": "active",
      "capabilities": ["vulnerability-scan", "compliance-check", "threat-analysis"],
      "performance": {"success_rate": 92, "avg_response_time": 90}
    }
  ]
}
EOF

print_status "Created demo data files"

# Setup environment variables
echo -e "\n${BLUE}⚙️  Setting Up Environment${NC}"
echo "-------------------------"

if [ ! -f ".env" ]; then
    cp .env.example .env
    print_status "Created .env file from template"
else
    print_info ".env file already exists"
fi

# Create mock server for demo
echo -e "\n${BLUE}🖥️  Setting Up Mock Services${NC}"
echo "----------------------------"

# Create a simple mock API server
cat > demo-mock-server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Load demo data
const loadDemoData = (filename) => {
  try {
    const data = fs.readFileSync(path.join('demo-data', filename), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return {};
  }
};

const workflows = loadDemoData('sample-workflows.json');
const metrics = loadDemoData('sample-metrics.json');
const agents = loadDemoData('sample-agents.json');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/health/detailed', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      'api-gateway': 'healthy',
      'analytics': 'healthy',
      'automation': 'healthy',
      'integration': 'healthy',
      'orchestration': 'healthy',
      'web-dashboard': 'healthy'
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Analytics endpoints
app.get('/api/analytics/dora-metrics', (req, res) => {
  res.json(metrics.dora_metrics);
});

app.get('/api/analytics/team-performance', (req, res) => {
  res.json(metrics.team_performance);
});

app.get('/api/analytics/predictions', (req, res) => {
  res.json({
    next_deployment: '2024-01-15T14:30:00Z',
    estimated_completion: '2024-01-20T16:00:00Z',
    risk_level: 'low',
    confidence: 0.87
  });
});

// Agent endpoints
app.get('/api/agents/discover', (req, res) => {
  res.json(agents);
});

app.get('/api/agents/status', (req, res) => {
  res.json({
    total_agents: agents.agents.length,
    active_agents: agents.agents.filter(a => a.status === 'active').length,
    average_performance: 94.5
  });
});

app.post('/api/agents/execute', (req, res) => {
  const { agentId, task } = req.body;
  res.json({
    execution_id: `exec_${Date.now()}`,
    agent_id: agentId,
    task: task,
    status: 'started',
    estimated_duration: 120,
    timestamp: new Date().toISOString()
  });
});

// Integration endpoints
app.get('/api/integrations/github/repos', (req, res) => {
  res.json({
    repositories: [
      { name: 'devflow-core', stars: 1250, last_commit: '2 hours ago' },
      { name: 'devflow-ui', stars: 890, last_commit: '4 hours ago' },
      { name: 'devflow-agents', stars: 2100, last_commit: '1 hour ago' }
    ]
  });
});

app.get('/api/integrations/jira/issues', (req, res) => {
  res.json({
    issues: [
      { key: 'DEV-123', summary: 'Implement new analytics dashboard', status: 'In Progress' },
      { key: 'DEV-124', summary: 'Fix agent discovery bug', status: 'Done' },
      { key: 'DEV-125', summary: 'Add security compliance checks', status: 'To Do' }
    ]
  });
});

// Compliance endpoints
app.get('/api/compliance/validate/soc2', (req, res) => {
  res.json({
    compliance_status: 'compliant',
    last_audit: '2024-01-01T00:00:00Z',
    score: 98.5,
    issues: []
  });
});

app.get('/api/audit/logs', (req, res) => {
  const limit = req.query.limit || 10;
  res.json({
    logs: Array.from({ length: limit }, (_, i) => ({
      id: `log_${Date.now()}_${i}`,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      user: 'system',
      action: 'workflow_executed',
      resource: 'ci-cd-pipeline',
      status: 'success'
    }))
  });
});

// Monitoring endpoints
app.get('/api/monitoring/metrics', (req, res) => {
  res.json({
    cpu_usage: Math.random() * 30 + 20,
    memory_usage: Math.random() * 40 + 30,
    response_time: Math.random() * 100 + 50,
    throughput: Math.random() * 1000 + 500,
    error_rate: Math.random() * 2
  });
});

// Workflow endpoints
app.get('/api/workflows', (req, res) => {
  res.json(workflows);
});

// API documentation
app.get('/docs', (req, res) => {
  res.send(`
    <html>
      <head><title>DevFlow.ai API Documentation</title></head>
      <body>
        <h1>DevFlow.ai API Documentation</h1>
        <h2>Available Endpoints:</h2>
        <ul>
          <li>GET /health - Health check</li>
          <li>GET /api/analytics/dora-metrics - DORA metrics</li>
          <li>GET /api/analytics/team-performance - Team performance</li>
          <li>GET /api/agents/discover - Discover agents</li>
          <li>POST /api/agents/execute - Execute agent task</li>
          <li>GET /api/integrations/github/repos - GitHub repositories</li>
          <li>GET /api/compliance/validate/soc2 - SOC2 compliance</li>
          <li>GET /api/monitoring/metrics - System metrics</li>
        </ul>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 DevFlow.ai Mock API Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
});
EOF

print_status "Created mock API server"

# Create demo script shortcuts
echo -e "\n${BLUE}📝 Creating Demo Scripts${NC}"
echo "----------------------"

# Create quick demo commands script
cat > demo-commands.sh << 'EOF'
#!/bin/bash

# Quick Demo Commands for DevFlow.ai

echo "🎬 DevFlow.ai Demo Commands"
echo "=========================="
echo ""

echo "📊 Analytics Commands:"
echo "curl -X GET http://localhost:3000/api/analytics/dora-metrics"
echo "curl -X GET http://localhost:3000/api/analytics/team-performance"
echo "curl -X GET http://localhost:3000/api/analytics/predictions"
echo ""

echo "🤖 Agent Commands:"
echo "curl -X GET http://localhost:3000/api/agents/discover"
echo "curl -X GET http://localhost:3000/api/agents/status"
echo "curl -X POST http://localhost:3000/api/agents/execute -H 'Content-Type: application/json' -d '{\"agentId\": \"code-reviewer\", \"task\": \"review-pr\"}'"
echo ""

echo "🔗 Integration Commands:"
echo "curl -X GET http://localhost:3000/api/integrations/github/repos"
echo "curl -X GET http://localhost:3000/api/integrations/jira/issues"
echo ""

echo "🔒 Security Commands:"
echo "curl -X GET http://localhost:3000/api/compliance/validate/soc2"
echo "curl -X GET http://localhost:3000/api/audit/logs?limit=10"
echo ""

echo "📈 Monitoring Commands:"
echo "curl -X GET http://localhost:3000/api/health/detailed"
echo "curl -X GET http://localhost:3000/api/monitoring/metrics"
echo ""

echo "🌐 Web Interfaces:"
echo "Mock API: http://localhost:3000"
echo "API Docs: http://localhost:3000/docs"
echo "Dashboard: http://localhost:5173 (run 'npm run start:dashboard')"
EOF

chmod +x demo-commands.sh
print_status "Created demo-commands.sh"

# Create start scripts
cat > start-demo.sh << 'EOF'
#!/bin/bash

echo "🚀 Starting DevFlow.ai Demo Environment"
echo "======================================"

# Start mock API server in background
echo "Starting mock API server..."
node demo-mock-server.js &
API_PID=$!

# Start web dashboard in background
echo "Starting web dashboard..."
cd services/web-dashboard
npm run dev &
DASHBOARD_PID=$!
cd ../..

echo ""
echo "✅ Demo environment started!"
echo ""
echo "🌐 Access Points:"
echo "  📊 Mock API: http://localhost:3000"
echo "  📚 API Docs: http://localhost:3000/docs"
echo "  🖥️  Dashboard: http://localhost:5173"
echo ""
echo "🎬 Demo Commands: ./demo-commands.sh"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "echo 'Stopping services...'; kill $API_PID $DASHBOARD_PID 2>/dev/null; exit" INT
wait
EOF

chmod +x start-demo.sh
print_status "Created start-demo.sh"

# Create verification script
cat > verify-demo.sh << 'EOF'
#!/bin/bash

echo "🔍 Verifying Demo Environment"
echo "============================"

# Check if mock server is running
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Mock API Server: Running"
else
    echo "❌ Mock API Server: Not running (start with 'node demo-mock-server.js')"
fi

# Check if dashboard is accessible
if curl -s http://localhost:5173 > /dev/null; then
    echo "✅ Web Dashboard: Running"
else
    echo "❌ Web Dashboard: Not running (start with './start-demo.sh')"
fi

# Check demo data
echo "Checking demo data..."
[ -f "demo-data/sample-workflows.json" ] && echo "✅ Workflow data: OK" || echo "❌ Workflow data: Missing"
[ -f "demo-data/sample-metrics.json" ] && echo "✅ Metrics data: OK" || echo "❌ Metrics data: Missing"
[ -f "demo-data/sample-agents.json" ] && echo "✅ Agent data: OK" || echo "❌ Agent data: Missing"

echo ""
echo "Demo environment verification complete!"
echo "To start the demo: ./start-demo.sh"
EOF

chmod +x verify-demo.sh
print_status "Created verify-demo.sh"

# Final setup summary
echo -e "\n${GREEN}🎉 Demo Setup Complete!${NC}"
echo "======================"
echo ""
echo "📋 What's Ready:"
echo "  ✅ All dependencies installed"
echo "  ✅ All services built"
echo "  ✅ Demo data created"
echo "  ✅ Mock API server configured"
echo "  ✅ Demo scripts created"
echo ""
echo "🚀 To Start Demo:"
echo "  ./start-demo.sh"
echo ""
echo "🌐 Access Points (after starting):"
echo "  📊 Mock API: http://localhost:3000"
echo "  📚 API Docs: http://localhost:3000/docs"
echo "  🖥️  Dashboard: http://localhost:5173"
echo ""
echo "🎬 Demo Resources:"
echo "  📖 Demo Guide: DEMO_PRESENTATION_GUIDE.md"
echo "  ⚡ Quick Commands: ./demo-commands.sh"
echo "  🔍 Verify Setup: ./verify-demo.sh"
echo "  📋 Function Inventory: node function-inventory.js"
echo "  ✅ Implementation Check: node verify-implementation.js"
echo ""
echo "🚀 You're ready to demo! Follow the DEMO_PRESENTATION_GUIDE.md for the presentation script."
echo ""
print_info "Tip: Run './verify-demo.sh' to check if everything is working correctly."
print_info "Tip: Run './start-demo.sh' to start all demo services."