#!/bin/bash

# DevFlow.ai Test Runner Script

set -e

echo "🧪 Running DevFlow.ai test suite..."

# Function to run tests for a specific workspace
run_workspace_tests() {
    local workspace=$1
    echo "Testing $workspace..."
    
    if [ -d "$workspace" ]; then
        cd "$workspace"
        if [ -f "package.json" ]; then
            npm test
        fi
        cd - > /dev/null
    else
        echo "⚠️  Workspace $workspace not found, skipping..."
    fi
}

# Run tests for shared libraries
echo "📚 Testing shared libraries..."
run_workspace_tests "shared/types"
run_workspace_tests "shared/utils"
run_workspace_tests "shared/config"

# Run tests for services
echo "🔧 Testing services..."
run_workspace_tests "services/api-gateway"
run_workspace_tests "services/orchestration"
run_workspace_tests "services/analytics"
run_workspace_tests "services/automation"
run_workspace_tests "services/integration"

# Run integration tests if they exist
if [ -d "tests/integration" ]; then
    echo "🔗 Running integration tests..."
    cd tests/integration
    npm test
    cd - > /dev/null
fi

# Run end-to-end tests if they exist
if [ -d "tests/e2e" ]; then
    echo "🎭 Running end-to-end tests..."
    cd tests/e2e
    npm test
    cd - > /dev/null
fi

echo "✅ All tests completed!"