---
inclusion: always
---

# Technical Guidelines for DevFlow.ai

## Architecture Standards
- **Microservices**: Each service should have a single responsibility
- **Event-Driven**: Use Apache Kafka for inter-service communication
- **Database per Service**: Each service owns its data
- **API-First**: All services expose REST APIs with OpenAPI specs

## Code Standards
- **TypeScript**: Strict mode enabled, no `any` types
- **Error Handling**: Use custom error classes with proper context
- **Logging**: Structured logging with correlation IDs
- **Testing**: Unit tests for all business logic, integration tests for APIs

## Security Requirements
- **Authentication**: JWT with refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Encryption**: AES-256 for data at rest, TLS 1.3 for transit
- **Audit**: Log all user actions and system events

## Performance Requirements
- **Response Time**: <2 seconds for all API calls
- **Throughput**: Support 10,000 concurrent workflows
- **Scalability**: Horizontal scaling for all services
- **Caching**: Multi-layer caching with Redis

## Development Workflow
- **Git Flow**: Feature branches with pull request reviews
- **CI/CD**: Automated testing and deployment
- **Code Review**: Required for all changes
- **Documentation**: Keep README and API docs updated