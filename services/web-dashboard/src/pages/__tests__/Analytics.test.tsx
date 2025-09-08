import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import Analytics from '../Analytics';

// Mock recharts components
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  Pie: () => <div data-testid="pie" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Cell: () => <div data-testid="cell" />,
}));

describe('Analytics', () => {
  it('renders analytics page title', () => {
    render(<Analytics />);
    
    expect(screen.getByText('Analytics & Reporting')).toBeInTheDocument();
    expect(screen.getByText('Comprehensive insights into your development workflow performance')).toBeInTheDocument();
  });

  it('displays DORA metrics widget', () => {
    render(<Analytics />);
    
    expect(screen.getByText('DORA Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('displays team performance widget', () => {
    render(<Analytics />);
    
    expect(screen.getByText('Team Performance (SPACE Framework)')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('displays technical debt widget', () => {
    render(<Analytics />);
    
    expect(screen.getByText('Technical Debt Analysis')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('allows time range selection', () => {
    render(<Analytics />);
    
    const timeRangeSelect = screen.getByDisplayValue('Last 30 days');
    expect(timeRangeSelect).toBeInTheDocument();
    
    fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
    expect(screen.getByDisplayValue('Last 7 days')).toBeInTheDocument();
  });

  it('has export functionality', () => {
    render(<Analytics />);
    
    const exportButton = screen.getByText('Export');
    expect(exportButton).toBeInTheDocument();
    
    fireEvent.click(exportButton);
    // Export functionality would be tested with proper mocking
  });
});