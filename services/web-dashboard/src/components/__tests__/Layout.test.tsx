import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Layout from '../Layout';

// Mock contexts
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
      role: 'developer',
    },
    isLoading: false,
    logout: vi.fn(),
    isAuthenticated: true,
  }),
}));

vi.mock('../../contexts/RealtimeContext', () => ({
  useRealtime: () => ({
    isConnected: true,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    emit: vi.fn(),
  }),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Layout', () => {
  it('renders navigation items', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    // Use getAllByText to handle multiple instances (mobile and desktop nav)
    const dashboardLinks = screen.getAllByText('Dashboard');
    expect(dashboardLinks.length).toBeGreaterThan(0);
    
    const workflowLinks = screen.getAllByText('Workflows');
    expect(workflowLinks.length).toBeGreaterThan(0);
    
    const analyticsLinks = screen.getAllByText('Analytics');
    expect(analyticsLinks.length).toBeGreaterThan(0);
    
    const teamLinks = screen.getAllByText('Teams');
    expect(teamLinks.length).toBeGreaterThan(0);
    
    const settingsLinks = screen.getAllByText('Settings');
    expect(settingsLinks.length).toBeGreaterThan(0);
  });

  it('displays user name', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('shows live connection status', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders children content', () => {
    renderWithRouter(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});