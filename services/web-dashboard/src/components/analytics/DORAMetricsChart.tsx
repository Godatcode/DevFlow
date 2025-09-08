import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DORAMetrics } from '../../types';

interface DORAMetricsChartProps {
  data: Array<DORAMetrics & { date: string }>;
  timeRange: string;
}

export default function DORAMetricsChart({ data, timeRange }: DORAMetricsChartProps) {
  const formatTooltip = (value: number, name: string) => {
    switch (name) {
      case 'deploymentFrequency':
        return [`${value} per day`, 'Deployment Frequency'];
      case 'leadTimeForChanges':
        return [`${value} hours`, 'Lead Time for Changes'];
      case 'changeFailureRate':
        return [`${value}%`, 'Change Failure Rate'];
      case 'timeToRestoreService':
        return [`${value} hours`, 'Time to Restore Service'];
      default:
        return [value, name];
    }
  };

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip 
            labelFormatter={(value) => new Date(value).toLocaleDateString()}
            formatter={formatTooltip}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="deploymentFrequency" 
            stroke="#3b82f6" 
            strokeWidth={2}
            name="Deployment Frequency"
          />
          <Line 
            type="monotone" 
            dataKey="leadTimeForChanges" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Lead Time"
          />
          <Line 
            type="monotone" 
            dataKey="changeFailureRate" 
            stroke="#f59e0b" 
            strokeWidth={2}
            name="Failure Rate"
          />
          <Line 
            type="monotone" 
            dataKey="timeToRestoreService" 
            stroke="#ef4444" 
            strokeWidth={2}
            name="Recovery Time"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}