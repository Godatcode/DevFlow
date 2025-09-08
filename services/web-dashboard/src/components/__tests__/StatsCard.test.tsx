import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import StatsCard from '../StatsCard';

describe('StatsCard', () => {
  it('renders title and value', () => {
    render(
      <StatsCard
        title="Active Workflows"
        value={42}
        icon={ChartBarIcon}
        color="blue"
      />
    );

    expect(screen.getByText('Active Workflows')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('displays positive trend', () => {
    render(
      <StatsCard
        title="Test Metric"
        value={100}
        icon={ChartBarIcon}
        color="green"
        trend={{ value: 12, isPositive: true }}
      />
    );

    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('displays negative trend', () => {
    render(
      <StatsCard
        title="Test Metric"
        value={100}
        icon={ChartBarIcon}
        color="red"
        trend={{ value: 5, isPositive: false }}
      />
    );

    expect(screen.getByText('5%')).toBeInTheDocument();
  });
});