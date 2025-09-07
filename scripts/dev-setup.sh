#!/bin/bash

# DevFlow.ai Development Environment Setup Script

set -e

echo "🚀 Setting up DevFlow.ai development environment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please review and update the .env file with your configuration"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start infrastructure services
echo "🐳 Starting infrastructure services..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check PostgreSQL
until docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U devflow; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL is ready"

# Check Redis
until docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping; do
    echo "Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"

# Check InfluxDB
until docker-compose -f docker-compose.dev.yml exec -T influxdb influx ping; do
    echo "Waiting for InfluxDB..."
    sleep 2
done
echo "✅ InfluxDB is ready"

# Check Kafka
until docker-compose -f docker-compose.dev.yml exec -T kafka kafka-broker-api-versions --bootstrap-server localhost:9092; do
    echo "Waiting for Kafka..."
    sleep 2
done
echo "✅ Kafka is ready"

# Build the project
echo "🔨 Building the project..."
npm run build

echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Review and update the .env file with your configuration"
echo "2. Run 'npm run dev' to start development servers"
echo "3. Access the services:"
echo "   - PostgreSQL: localhost:5432"
echo "   - Redis: localhost:6379"
echo "   - InfluxDB: http://localhost:8086"
echo "   - Kafka: localhost:9092"
echo ""
echo "To stop the infrastructure services, run:"
echo "docker-compose -f docker-compose.dev.yml down"