import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardService } from '../services/dashboardService';

interface ChartData {
  date: string;
  deployments: number;
  leadTime: number;
  successRate: number;
}

export default function MetricsChart() {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    loadMetricsData();
  }, [timeRange]);

  const loadMetricsData = async () => {
    try {
      setLoading(true);
      const metrics = await dashboardService.getMetrics('dora', timeRange);
      
      // Transform metrics data for chart
      const chartData = metrics.reduce((acc: Record<string, any>, metric) => {
        const date = metric.timestamp.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { date, deployments: 0, leadTime: 0, successRate: 0 };
        }
        
        // Transform metric metadata for chart display
        if (metric.metadata?.deployment_frequency) {
          acc[date].deployments = metric.metadata.deployment_frequency;
        }
        if (metric.metadata?.lead_time) {
          acc[date].leadTime = metric.metadata.lead_time;
        }
        if (metric.metadata?.success_rate) {
          acc[date].successRate = metric.metadata.success_rate;
        }
        
        return acc;
      }, {});

      setData(Object.values(chartData));
    } catch (error) {
      console.error('Failed to load metrics data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="h-64">
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
            formatter={(value: number, name: string) => {
              switch (name) {
                case 'deployments':
                  return [value, 'Deployments'];
                case 'leadTime':
                  return [`${value}h`, 'Lead Time'];
                case 'successRate':
                  return [`${value}%`, 'Success Rate'];
                default:
                  return [value, name];
              }
            }}
          />
          <Line 
            type="monotone" 
            dataKey="deployments" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
          />
          <Line 
            type="monotone" 
            dataKey="successRate" 
            stroke="#10b981" 
            strokeWidth={2}
            dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}