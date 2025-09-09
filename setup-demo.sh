#!/bin/bash

# DevFlow.ai Demo Setup Script
# This script prepares the environment for a live demonstration

set -e

echo "🚀 Setting up DevFlow.ai Demo Environment"
echo "========================================"

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

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    print_status "Docker found: $DOCKER_VERSION"
else
    print_warning "Docker not found. Some features may not work."
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    print_status "Docker Compose found: $COMPOSE_VERSION"
else
    print_warning "Docker Compose not found. Using docker compose instead."
fi

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

# Start services with Docker Compose
echo -e "\n${BLUE}🐳 Starting Services${NC}"
echo "------------------"

if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    print_warning "Docker Compose not available. Skipping service startup."
    COMPOSE_CMD=""
fi

if [ ! -z "$COMPOSE_CMD" ]; then
    print_info "Starting services with $COMPOSE_CMD..."
    $COMPOSE_CMD -f docker-compose.dev.yml up -d
    
    # Wait for services to be ready
    print_info "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    print_info "Checking service health..."
    
    # Check API Gateway
    if curl -s http://localhost:3000/health > /dev/null; then
        print_status "API Gateway is running (http://localhost:3000)"
    else
        print_warning "API Gateway may not be ready yet"
    fi
    
    # Check Web Dashboard
    if curl -s http://localhost:5173 > /dev/null; then
        print_status "Web Dashboard is running (http://localhost:5173)"
    else
        print_info "Starting Web Dashboard..."
        cd services/web-dashboard
        npm run dev > /dev/null 2>&1 &
        cd ../..
        print_status "Web Dashboard starting (http://localhost:5173)"
    fi
fi

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
echo "Dashboard: http://localhost:5173"
echo "API Docs: http://localhost:3000/docs"
echo "Monitoring: http://localhost:3000/monitoring"
EOF

chmod +x demo-commands.sh
print_status "Created demo-commands.sh"

# Create verification script
cat > verify-demo.sh << 'EOF'
#!/bin/bash

echo "🔍 Verifying Demo Environment"
echo "============================"

# Check services
echo "Checking services..."
curl -s http://localhost:3000/health && echo "✅ API Gateway: OK" || echo "❌ API Gateway: Failed"
curl -s http://localhost:5173 > /dev/null && echo "✅ Web Dashboard: OK" || echo "❌ Web Dashboard: Failed"

# Check demo data
echo "Checking demo data..."
[ -f "demo-data/sample-workflows.json" ] && echo "✅ Workflow data: OK" || echo "❌ Workflow data: Missing"
[ -f "demo-data/sample-metrics.json" ] && echo "✅ Metrics data: OK" || echo "❌ Metrics data: Missing"
[ -f "demo-data/sample-agents.json" ] && echo "✅ Agent data: OK" || echo "❌ Agent data: Missing"

echo "Demo environment verification complete!"
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
echo "  ✅ Environment configured"
echo "  ✅ Services started"
echo ""
echo "🌐 Access Points:"
echo "  📊 Web Dashboard: http://localhost:5173"
echo "  🔌 API Gateway: http://localhost:3000"
echo "  📚 API Docs: http://localhost:3000/docs"
echo "  📈 Monitoring: http://localhost:3000/monitoring"
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