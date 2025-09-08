export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'manager' | 'developer';
}

export interface Team {
  id: string;
  name: string;
  members: User[];
  projectCount: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  team: Team;
  status: 'active' | 'paused' | 'completed';
  workflowCount: number;
}

export interface Workflow {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  project: Project;
  progress: number;
  startedAt: Date;
  estimatedCompletion?: Date;
}

export interface MetricData {
  id: string;
  type: 'dora' | 'space' | 'technical_debt' | 'performance';
  value: number;
  timestamp: Date;
  projectId: string;
  metadata: Record<string, any>;
}

export interface DORAMetrics {
  deploymentFrequency: number;
  leadTimeForChanges: number;
  changeFailureRate: number;
  timeToRestoreService: number;
}

export interface DashboardStats {
  activeWorkflows: number;
  totalProjects: number;
  teamMembers: number;
  successRate: number;
}

export interface RealtimeEvent {
  type: 'workflow_status' | 'metric_update' | 'notification';
  data: any;
  timestamp: Date;
}