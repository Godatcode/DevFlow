import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TeamPerformanceData {
  teamName: string;
  satisfaction: number;
  performance: number;
  activity: number;
  communication: number;
  efficiency: number;
}

interface TeamPerformanceChartProps {
  data: TeamPerformanceData[];
}

export default function TeamPerformanceChart({ data }: TeamPerformanceChartProps) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="teamName" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
          <Tooltip 
            formatter={(value: number, name: string) => [`${value}%`, name]}
          />
          <Legend />
          <Bar dataKey="satisfaction" fill="#3b82f6" name="Satisfaction" />
          <Bar dataKey="performance" fill="#10b981" name="Performance" />
          <Bar dataKey="activity" fill="#f59e0b" name="Activity" />
          <Bar dataKey="communication" fill="#8b5cf6" name="Communication" />
          <Bar dataKey="efficiency" fill="#06b6d4" name="Efficiency" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}