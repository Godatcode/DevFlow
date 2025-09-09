#!/bin/bash

# Simple Demo Commands for DevFlow.ai

echo "🎬 DevFlow.ai Demo Commands"
echo "=========================="
echo ""

echo "🔍 Health Check:"
echo "curl http://localhost:3000/health"
echo ""

echo "📊 Analytics Endpoints:"
echo "curl http://localhost:3000/api/analytics/dora-metrics"
echo "curl http://localhost:3000/api/analytics/team-performance"
echo ""

echo "🤖 AI Agent Endpoints:"
echo "curl http://localhost:3000/api/agents"
echo "curl -X POST http://localhost:3000/api/agents/execute -H 'Content-Type: application/json' -d '{\"agentId\": \"code-reviewer\", \"task\": \"review-pr\"}'"
echo ""

echo "🎼 Workflow Endpoints:"
echo "curl http://localhost:3000/api/workflows"
echo ""

echo "🔗 Integration Endpoints:"
echo "curl http://localhost:3000/api/integrations/github/repos"
echo ""

echo "🔒 Security & Compliance:"
echo "curl http://localhost:3000/api/compliance/validate/soc2"
echo ""

echo "📈 Monitoring:"
echo "curl http://localhost:3000/api/monitoring/metrics"
echo ""

echo "🌐 Web Interfaces:"
echo "  📊 API Gateway: http://localhost:3000"
echo "  📚 API Docs: http://localhost:3000/docs"
echo "  🖥️  Dashboard: http://localhost:5173"
echo ""

echo "🧪 Test All Endpoints:"
echo "echo 'Testing all endpoints:'"
echo "curl -s http://localhost:3000/health | jq ."
echo "curl -s http://localhost:3000/api/analytics/dora-metrics | jq ."
echo "curl -s http://localhost:3000/api/agents | jq ."