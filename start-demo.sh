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
