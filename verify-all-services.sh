#!/bin/bash

# DevFlow.ai Service Verification Script

echo "🔍 Verifying All DevFlow.ai Services"
echo "===================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_service() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-"/health"}
    
    echo -n "Checking $service_name (port $port)... "
    
    if curl -s --max-time 5 "http://localhost:$port$endpoint" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Running${NC}"
        return 0
    else
        echo -e "${RED}❌ Not responding${NC}"
        return 1
    fi
}

echo ""
echo "🌐 Service Status:"
echo "=================="

# Check all services
services_running=0
total_services=6

check_service "API Gateway" 3000 && ((services_running++))
check_service "Analytics" 3001 && ((services_running++))
check_service "Automation" 3002 && ((services_running++))
check_service "Orchestration" 3003 && ((services_running++))
check_service "Integration" 3004 && ((services_running++))
check_service "Web Dashboard" 5173 "" && ((services_running++))

echo ""
echo "📊 Summary:"
echo "==========="
echo "Services running: $services_running/$total_services"

if [ $services_running -eq $total_services ]; then
    echo -e "${GREEN}🎉 All services are running!${NC}"
    echo ""
    echo "🎬 Ready for demo! Try these commands:"
    echo "  ./demo-commands-full.sh"
    echo ""
    echo "🌐 Access points:"
    echo "  Dashboard: http://localhost:5173"
    echo "  API Gateway: http://localhost:3000"
elif [ $services_running -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some services are not running${NC}"
    echo "To start all services: ./start-full-demo.sh"
else
    echo -e "${RED}❌ No services are running${NC}"
    echo "To start all services: ./start-full-demo.sh"
fi

echo ""
echo "🔧 Troubleshooting:"
echo "==================="
echo "If services aren't starting:"
echo "1. Check if ports are already in use: lsof -i :3000-3004,5173"
echo "2. Kill existing processes: pkill -f 'node.*server.js'"
echo "3. Restart with: ./start-full-demo.sh"