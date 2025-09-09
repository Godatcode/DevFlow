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
