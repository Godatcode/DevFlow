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
