#!/bin/bash

# Full Demo Commands for DevFlow.ai (All Services)

echo "🎬 DevFlow.ai Full Demo Commands"
echo "==============================="
echo ""

echo "🔍 Health Checks:"
echo "curl http://localhost:3000/health  # API Gateway"
echo "curl http://localhost:3001/health  # Analytics"
echo "curl http://localhost:3002/health  # Automation"
echo "curl http://localhost:3003/health  # Orchestration"
echo "curl http://localhost:3004/health  # Integration"
echo ""

echo "📊 Analytics Service (Port 3001):"
echo "curl http://localhost:3001/api/dora-metrics"
echo "curl http://localhost:3001/api/team-performance"
echo ""

echo "🤖 Automation Service (Port 3002):"
echo "curl http://localhost:3002/api/agents"
echo "curl -X POST http://localhost:3002/api/agents/execute -H 'Content-Type: application/json' -d '{\"agentId\": \"code-reviewer\", \"task\": \"review-pr\", \"context\": {\"prId\": \"123\"}}'"
echo ""

echo "🎼 Orchestration Service (Port 3003):"
echo "curl http://localhost:3003/api/workflows"
echo "curl -X POST http://localhost:3003/api/workflows/execute -H 'Content-Type: application/json' -d '{\"workflowId\": \"ci-cd-pipeline\", \"context\": {\"branch\": \"main\"}}'"
echo ""

echo "🔗 Integration Service (Port 3004):"
echo "curl http://localhost:3004/api/github/repos"
echo "curl http://localhost:3004/api/jira/issues"
echo ""

echo "🚪 API Gateway (Port 3000) - Routes to other services:"
echo "curl http://localhost:3000/api/analytics/dora-metrics"
echo "curl http://localhost:3000/api/agents"
echo "curl http://localhost:3000/api/workflows"
echo ""

echo "🌐 Web Interfaces:"
echo "  🖥️  Dashboard: http://localhost:5173"
echo "  🚪 API Gateway: http://localhost:3000"
echo ""

echo "🧪 Test All Services:"
echo "for port in 3000 3001 3002 3003 3004; do echo \"Testing port \$port:\"; curl -s http://localhost:\$port/health | jq .; done"