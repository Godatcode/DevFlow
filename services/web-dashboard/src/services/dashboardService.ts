import { apiClient } from './api';
import { mockApiService } from './mockApi';
import { DashboardStats, Workflow, Project, Team, MetricData } from '../types';

const isDevelopment = import.meta.env.DEV;

class DashboardService {
  async getStats(): Promise<DashboardStats> {
    if (isDevelopment) {
      return mockApiService.getStats();
    }
    return apiClient.get<DashboardStats>('/dashboard/stats');
  }

  async getRecentWorkflows(limit = 10): Promise<Workflow[]> {
    if (isDevelopment) {
      return mockApiService.getRecentWorkflows(limit);
    }
    return apiClient.get<Workflow[]>(`/workflows/recent?limit=${limit}`);
  }

  async getActiveProjects(limit = 5): Promise<Project[]> {
    if (isDevelopment) {
      return mockApiService.getActiveProjects(limit);
    }
    return apiClient.get<Project[]>(`/projects/active?limit=${limit}`);
  }

  async getTeams(): Promise<Team[]> {
    if (isDevelopment) {
      return mockApiService.getTeams();
    }
    return apiClient.get<Team[]>('/teams');
  }

  async getMetrics(type: string, timeRange: string): Promise<MetricData[]> {
    if (isDevelopment) {
      return mockApiService.getMetrics(type, timeRange);
    }
    return apiClient.get<MetricData[]>(`/metrics/${type}?range=${timeRange}`);
  }
}

export const dashboardService = new DashboardService();