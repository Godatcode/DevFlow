import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import Dashboard from '../Dashboard';

// Mock services
vi.mock('../../services/dashboardService', () => ({
  dashboardService: {
    getStats: vi.fn().mockResolvedValue({
      activeWorkflows: 5,
      totalProjects: 3,
      teamMembers: 8,
      successRate: 95,
    }),
    getRecentWorkflows: vi.fn().mockResolvedValue([]),
    getActiveProjects: vi.fn().mockResolvedValue([]),
    getMetrics: vi.fn().mockResolvedValue([]),
  },
}));

// Mock contexts
vi.mock('../../contexts/RealtimeContext', () => ({
  useRealtime: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

describe('Dashboard', () => {
  it('renders dashboard title', async () => {
    render(<Dashboard />);
    
    // Wait for the component to load and show content
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
    
    expect(screen.getByText("Welcome back! Here's what's happening with your workflows.")).toBeInTheDocument();
  });

  it('displays stats cards after loading', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Active Workflows')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Total Projects')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});