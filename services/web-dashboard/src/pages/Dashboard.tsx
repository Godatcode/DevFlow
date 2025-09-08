import React, { useEffect, useState } from 'react';
import { 
  ChartBarIcon, 
  UsersIcon, 
  ClockIcon, 
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline';
import { DashboardStats, Workflow, Project } from '../types';
import { dashboardService } from '../services/dashboardService';
import { useRealtime } from '../contexts/RealtimeContext';
import StatsCard from '../components/StatsCard';
import WorkflowList from '../components/WorkflowList';
import ProjectList from '../components/ProjectList';
import MetricsChart from '../components/MetricsChart';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentWorkflows, setRecentWorkflows] = useState<Workflow[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const { subscribe, unsubscribe } = useRealtime();

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const handleWorkflowUpdate = (data: any) => {
      // Update workflow status in real-time
      setRecentWorkflows(prev =>
        prev.map(workflow =>
          workflow.id === data.workflowId
            ? { ...workflow, status: data.status, progress: data.progress }
            : workflow
        )
      );
    };

    const handleStatsUpdate = (data: any) => {
      setStats(prev => prev ? { ...prev, ...data } : null);
    };

    subscribe('workflow_status', handleWorkflowUpdate);
    subscribe('stats_update', handleStatsUpdate);

    return () => {
      unsubscribe('workflow_status');
      unsubscribe('stats_update');
    };
  }, [subscribe, unsubscribe]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, workflowsData, projectsData] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getRecentWorkflows(10),
        dashboardService.getActiveProjects(5),
      ]);

      setStats(statsData);
      setRecentWorkflows(workflowsData);
      setActiveProjects(projectsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back! Here's what's happening with your workflows.
        </p>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Workflows"
            value={stats.activeWorkflows}
            icon={ChartBarIcon}
            trend={{ value: 12, isPositive: true }}
            color="blue"
          />
          <StatsCard
            title="Total Projects"
            value={stats.totalProjects}
            icon={ClockIcon}
            trend={{ value: 5, isPositive: true }}
            color="green"
          />
          <StatsCard
            title="Team Members"
            value={stats.teamMembers}
            icon={UsersIcon}
            trend={{ value: 2, isPositive: true }}
            color="purple"
          />
          <StatsCard
            title="Success Rate"
            value={`${stats.successRate}%`}
            icon={CheckCircleIcon}
            trend={{ value: 3, isPositive: true }}
            color="emerald"
          />
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent workflows */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Recent Workflows</h2>
              <a href="/workflows" className="text-sm text-indigo-600 hover:text-indigo-500">
                View all
              </a>
            </div>
            <WorkflowList workflows={recentWorkflows} />
          </div>
        </div>

        {/* Active projects */}
        <div>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Active Projects</h2>
              <a href="/projects" className="text-sm text-indigo-600 hover:text-indigo-500">
                View all
              </a>
            </div>
            <ProjectList projects={activeProjects} />
          </div>
        </div>
      </div>

      {/* Metrics chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Performance Metrics</h2>
          <div className="flex space-x-2">
            <button className="text-sm text-gray-500 hover:text-gray-700">7d</button>
            <button className="text-sm text-indigo-600 font-medium">30d</button>
            <button className="text-sm text-gray-500 hover:text-gray-700">90d</button>
          </div>
        </div>
        <MetricsChart />
      </div>
    </div>
  );
}