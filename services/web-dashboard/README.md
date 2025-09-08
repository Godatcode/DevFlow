# DevFlow.ai Web Dashboard

React-based web dashboard for the DevFlow.ai platform with real-time updates and responsive design.

## Features

- **Responsive Design**: Mobile-first design that works on all devices
- **Real-time Updates**: Live workflow status updates via WebSocket
- **Interactive Dashboard**: Stats cards, workflow lists, and metrics charts
- **Authentication**: JWT-based authentication with role-based access
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open http://localhost:3000 in your browser

### Demo Credentials

In development mode, the app auto-logs in with demo credentials:
- Email: demo@devflow.ai
- Password: password

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run tests
- `npm run lint` - Run ESLint

## Architecture

### Components

- **Layout**: Main application layout with navigation
- **Dashboard**: Main dashboard with stats and metrics
- **StatsCard**: Reusable statistics display component
- **WorkflowList**: Display list of workflows with status
- **ProjectList**: Display list of active projects
- **MetricsChart**: Interactive charts for analytics data

### Services

- **authService**: Authentication and user management
- **dashboardService**: Dashboard data fetching
- **mockApi**: Mock API for development

### Contexts

- **AuthContext**: User authentication state
- **RealtimeContext**: WebSocket connection management

## Testing

The dashboard includes comprehensive tests for:
- Component rendering and functionality
- User interactions and responsiveness
- Real-time update handling
- Authentication flows

Run tests with:
```bash
npm test
```

## Production Build

Build for production:
```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.