import { DashboardStats, Workflow, Project, Team, User, MetricData } from '../types';

// Mock data for development
const mockUser: User = {
  id: '1',
  email: 'demo@devflow.ai',
  name: 'Demo User',
  role: 'developer',
  avatar: undefined,
};

const mockTeam: Team = {
  id: '1',
  name: 'Development Team',
  members: [mockUser],
  projectCount: 3,
};

const mockProjects: Project[] = [
  {
    id: '1',
    name: 'DevFlow.ai Platform',
    description: 'Main platform development',
    team: mockTeam,
    status: 'active',
    workflowCount: 5,
  },
  {
    id: '2',
    name: 'Analytics Service',
    description: 'Analytics and reporting service',
    team: mockTeam,
    status: 'active',
    workflowCount: 3,
  },
];

const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Deploy Analytics Service',
    status: 'running',
    project: mockProjects[1],
    progress: 75,
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    estimatedCompletion: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
  },
  {
    id: '2',
    name: 'Security Scan',
    status: 'completed',
    project: mockProjects[0],
    progress: 100,
    startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
  },
];

const mockStats: DashboardStats = {
  activeWorkflows: 3,
  totalProjects: 2,
  teamMembers: 8,
  successRate: 94,
};

const mockMetrics: MetricData[] = [
  {
    id: '1',
    type: 'dora',
    value: 12,
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    projectId: '1',
    metadata: { deployment_frequency: 12, lead_time: 2.5, success_rate: 94 },
  },
  {
    id: '2',
    type: 'dora',
    value: 15,
    timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
    projectId: '1',
    metadata: { deployment_frequency: 15, lead_time: 3.2, success_rate: 91 },
  },
];

// Mock API service
export const mockApiService = {
  // Auth
  login: async (email: string, password: string) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
    return { user: mockUser, token: 'mock-jwt-token' };
  },

  validateToken: async (token: string) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return mockUser;
  },

  // Dashboard
  getStats: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockStats;
  },

  getRecentWorkflows: async (limit = 10) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return mockWorkflows.slice(0, limit);
  },

  getActiveProjects: async (limit = 5) => {
    await new Promise(resolve => setTimeout(resolve, 350));
    return mockProjects.slice(0, limit);
  },

  getTeams: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [mockTeam];
  },

  getMetrics: async (type: string, timeRange: string) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockMetrics;
  },

  // Analytics specific endpoints
  getDORAMetrics: async (timeRange: string) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return [
      {
        date: '2024-01-01',
        deploymentFrequency: 12,
        leadTimeForChanges: 2.5,
        changeFailureRate: 8,
        timeToRestoreService: 1.2,
      },
      {
        date: '2024-01-02',
        deploymentFrequency: 15,
        leadTimeForChanges: 3.2,
        changeFailureRate: 6,
        timeToRestoreService: 0.8,
      },
    ];
  },

  getTeamPerformance: async () => {
    await new Promise(resolve => setTimeout(resolve, 350));
    return [
      {
        teamName: 'Frontend',
        satisfaction: 85,
        performance: 92,
        activity: 88,
        communication: 90,
        efficiency: 87,
      },
      {
        teamName: 'Backend',
        satisfaction: 78,
        performance: 95,
        activity: 85,
        communication: 82,
        efficiency: 91,
      },
    ];
  },

  getTechnicalDebt: async () => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [
      { category: 'Code Smells', value: 45, color: '#ef4444' },
      { category: 'Security Issues', value: 12, color: '#f59e0b' },
      { category: 'Performance', value: 23, color: '#10b981' },
      { category: 'Maintainability', value: 18, color: '#3b82f6' },
      { category: 'Documentation', value: 8, color: '#8b5cf6' },
    ];
  },
};