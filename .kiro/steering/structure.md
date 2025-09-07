---
inclusion: always
---

# Project Structure Guidelines for DevFlow.ai

## Directory Organization
```
devflow-ai/
├── services/           # Microservices (one per domain)
├── shared/            # Shared libraries and utilities
├── scripts/           # Development and deployment scripts
├── docs/              # Documentation and specifications
└── .kiro/             # Kiro IDE configuration
```

## Service Structure
Each service follows this pattern:
```
services/service-name/
├── src/
│   ├── interfaces/    # TypeScript interfaces
│   ├── types/         # Type definitions
│   ├── handlers/      # Request handlers
│   ├── services/      # Business logic
│   └── utils/         # Service-specific utilities
├── tests/             # Test files
├── package.json       # Service dependencies
└── tsconfig.json      # TypeScript configuration
```

## Shared Libraries
- **types**: Core domain types and interfaces
- **utils**: Common utilities (validation, logging, etc.)
- **config**: Environment and service configuration

## Naming Conventions
- **Files**: kebab-case (user-service.ts)
- **Directories**: kebab-case (api-gateway/)
- **Classes**: PascalCase (UserService)
- **Functions**: camelCase (getUserById)
- **Constants**: UPPER_SNAKE_CASE (MAX_RETRY_COUNT)

## Import Organization
1. Node.js built-in modules
2. Third-party packages
3. Shared libraries (@devflow/*)
4. Local imports (relative paths)

## File Organization
- Keep files focused and under 300 lines
- Group related functionality in directories
- Use index.ts files for clean exports
- Separate interfaces from implementations