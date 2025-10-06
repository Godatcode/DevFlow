# DevFlow.ai - AI-Powered Development WorkFlow Orchestrator

DevFlow.ai is an enterprise-grade AI-powered development workflow orchestrator designed to transform how development teams plan, build, and deploy software. The platform leverages intelligent automation, predictive analytics, and seamless integrations to eliminate repetitive tasks and accelerate development cycles while maintaining code quality and security standards.

## 🏗️ Architecture

DevFlow.ai follows a microservices architecture with the following core services:

- **API Gateway**: Entry point for all client requests with authentication, rate limiting, and routing
- **Orchestration Service**: Central workflow coordination and event management
- **Analytics Service**: Metrics collection, processing, and predictive modeling
- **Automation Service**: AI agent execution and hook management
- **Integration Service**: External API connections and data synchronization

## 📁 Project Structure

```
devflow-ai/
├── services/                 # Microservices
│   ├── api-gateway/         # API Gateway service
│   ├── orchestration/       # Workflow orchestration
│   ├── analytics/           # Analytics and metrics
│   ├── automation/          # AI agent automation
│   └── integration/         # External integrations
├── shared/                  # Shared libraries
│   ├── types/              # TypeScript types and interfaces
│   ├── utils/              # Utility functions
│   └── config/             # Configuration management
├── scripts/                # Development and deployment scripts
├── .kiro/                  # Kiro IDE specifications
└── docker-compose.dev.yml  # Development infrastructure
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd devflow-ai
   ```

2. **Run the setup script**
   ```bash
   ./scripts/dev-setup.sh
   ```

3. **Start development**
   ```bash
   npm run dev
   ```

The setup script will:
- Install all dependencies
- Start infrastructure services (PostgreSQL, Redis, InfluxDB, Kafka)
- Initialize the database
- Build the project

### Manual Setup

If you prefer manual setup:

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Copy environment configuration**
   ```bash
   cp .env.example .env
   ```

3. **Start infrastructure services**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

## 🛠️ Development

### Available Scripts

- `npm run build` - Build all services and shared libraries
- `npm run dev` - Start development mode with watch
- `npm run test` - Run all tests
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Service Development

Each service is a separate npm workspace with its own:
- `package.json` with service-specific dependencies
- `tsconfig.json` for TypeScript configuration
- `src/` directory with source code
- Test files alongside source code

### Shared Libraries

The `shared/` directory contains reusable code:

- **types**: Core domain types and interfaces
- **utils**: Utility functions (validation, errors, logging, crypto)
- **config**: Environment and service configuration

## 🧪 Testing

Run the test suite:

```bash
npm test
# or
./scripts/test.sh
```

The test script runs:
- Unit tests for all shared libraries
- Unit tests for all services
- Integration tests (if present)
- End-to-end tests (if present)

## 🐳 Infrastructure Services

The development environment includes:

- **PostgreSQL** (port 5432): Primary database
- **InfluxDB** (port 8086): Time-series metrics storage
- **Redis** (port 6379): Caching and session storage
- **Apache Kafka** (port 9092): Event streaming
- **Zookeeper** (port 2181): Kafka coordination

### Service Health Checks

All infrastructure services include health checks. Monitor status with:

```bash
docker-compose -f docker-compose.dev.yml ps
```

## 📊 Monitoring and Observability

Each service exposes:
- Health check endpoint: `/health`
- Metrics endpoint: `/metrics`
- Structured logging with correlation IDs

## 🔒 Security

Security features include:
- JWT-based authentication
- Role-based access control (RBAC)
- Rate limiting
- Input validation and sanitization
- Audit logging
- Encryption at rest and in transit

## 🌍 Environment Configuration

Key environment variables:

```bash
# Core
NODE_ENV=development
LOG_LEVEL=info
JWT_SECRET=your-secret-key

# Services
API_GATEWAY_PORT=3000
ORCHESTRATION_PORT=3001
ANALYTICS_PORT=3002

# Database
POSTGRES_HOST=localhost
POSTGRES_DB=devflow
POSTGRES_USER=devflow
POSTGRES_PASSWORD=password

# Cache
REDIS_HOST=localhost
REDIS_PORT=6379

# Messaging
KAFKA_BROKERS=localhost:9092
```

See `.env.example` for complete configuration options.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Write tests for new functionality

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the documentation in the `.kiro/specs/` directory
- Review the requirements and design documents
- Open an issue for bugs or feature requests

## 🗺️ Roadmap

See the implementation tasks in `.kiro/specs/ai-workflow-orchestrator/tasks.md` for the complete development roadmap.

---

Built with ❤️ for developers who want to focus on building great software.
