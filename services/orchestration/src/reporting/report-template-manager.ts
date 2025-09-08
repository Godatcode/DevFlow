import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

const logger = new Logger('report-template-manager');
import { v4 as uuidv4 } from 'uuid';
import {
  ReportTemplateManager,
  ReportTemplate,
  ReportType,
  ReportSection,
  ReportFilters,
  ReportFormatting
} from './interfaces';

export class InMemoryReportTemplateManager implements ReportTemplateManager {
  private templates = new Map<UUID, ReportTemplate>();

  constructor() {
    this.initializeDefaultTemplates();
  }

  async createTemplate(
    templateData: Omit<ReportTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ReportTemplate> {
    const template: ReportTemplate = {
      ...templateData,
      id: uuidv4() as UUID,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.templates.set(template.id, template);

    logger.info('Report template created', { 
      templateId: template.id, 
      name: template.name, 
      type: template.type 
    });

    return template;
  }

  async updateTemplate(
    templateId: UUID, 
    updates: Partial<ReportTemplate>
  ): Promise<ReportTemplate> {
    const existingTemplate = this.templates.get(templateId);
    if (!existingTemplate) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const updatedTemplate: ReportTemplate = {
      ...existingTemplate,
      ...updates,
      updatedAt: new Date()
    };

    this.templates.set(templateId, updatedTemplate);

    logger.info('Report template updated', { templateId, updates });

    return updatedTemplate;
  }

  async deleteTemplate(templateId: UUID): Promise<void> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    this.templates.delete(templateId);

    logger.info('Report template deleted', { templateId });
  }

  async getTemplate(templateId: UUID): Promise<ReportTemplate | null> {
    return this.templates.get(templateId) || null;
  }

  async getTemplates(filters?: { 
    type?: ReportType; 
    teamId?: UUID; 
  }): Promise<ReportTemplate[]> {
    let templates = Array.from(this.templates.values());

    if (filters?.type) {
      templates = templates.filter(template => template.type === filters.type);
    }

    // Note: teamId filtering would require additional metadata in templates
    // For now, we'll return all templates

    return templates;
  }

  async cloneTemplate(templateId: UUID, name: string): Promise<ReportTemplate> {
    const originalTemplate = this.templates.get(templateId);
    if (!originalTemplate) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const clonedTemplate: ReportTemplate = {
      ...originalTemplate,
      id: uuidv4() as UUID,
      name,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.templates.set(clonedTemplate.id, clonedTemplate);

    logger.info('Report template cloned', { 
      originalId: templateId, 
      clonedId: clonedTemplate.id, 
      name 
    });

    return clonedTemplate;
  }

  private initializeDefaultTemplates(): void {
    // Workflow Summary Template
    const workflowSummaryTemplate: ReportTemplate = {
      id: 'default-workflow-summary' as UUID,
      name: 'Workflow Summary Report',
      type: ReportType.WORKFLOW_SUMMARY,
      description: 'Comprehensive overview of workflow performance and status',
      sections: [
        {
          id: 'workflow-metrics',
          title: 'Workflow Metrics',
          type: 'metric',
          dataSource: 'workflows',
          config: {
            metrics: [
              { field: 'total', aggregation: 'count', label: 'Total Workflows' },
              { field: 'completed', aggregation: 'count', label: 'Completed' },
              { field: 'failed', aggregation: 'count', label: 'Failed' },
              { field: 'duration', aggregation: 'avg', label: 'Avg Duration' }
            ]
          },
          order: 1
        },
        {
          id: 'status-chart',
          title: 'Workflow Status Distribution',
          type: 'chart',
          dataSource: 'workflows',
          config: {
            chartType: 'pie',
            xField: 'status',
            yField: 'count',
            title: 'Workflow Status Distribution'
          },
          order: 2
        },
        {
          id: 'recent-workflows',
          title: 'Recent Workflows',
          type: 'table',
          dataSource: 'workflows',
          config: {
            columns: ['name', 'status', 'startedAt', 'duration'],
            sortBy: { field: 'startedAt', order: 'desc' },
            limit: 10
          },
          order: 3
        }
      ],
      filters: {
        dateRange: {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          end: new Date()
        }
      },
      formatting: {
        theme: 'light',
        colorScheme: ['#3498db', '#2ecc71', '#e74c3c', '#f39c12'],
        fontSize: 'medium',
        includeCharts: true,
        includeTables: true,
        includeMetrics: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Team Performance Template
    const teamPerformanceTemplate: ReportTemplate = {
      id: 'default-team-performance' as UUID,
      name: 'Team Performance Report',
      type: ReportType.TEAM_PERFORMANCE,
      description: 'Team productivity and performance insights',
      sections: [
        {
          id: 'team-metrics',
          title: 'Team Performance Metrics',
          type: 'metric',
          dataSource: 'team-performance',
          config: {
            metrics: [
              { field: 'velocity', aggregation: 'avg', label: 'Average Velocity' },
              { field: 'throughput', aggregation: 'sum', label: 'Total Throughput' },
              { field: 'satisfaction', aggregation: 'avg', label: 'Team Satisfaction' }
            ]
          },
          order: 1
        },
        {
          id: 'velocity-trend',
          title: 'Velocity Trend',
          type: 'chart',
          dataSource: 'team-performance',
          config: {
            chartType: 'line',
            xField: 'date',
            yField: 'velocity',
            title: 'Team Velocity Over Time'
          },
          order: 2
        }
      ],
      filters: {
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          end: new Date()
        }
      },
      formatting: {
        theme: 'light',
        colorScheme: ['#9b59b6', '#3498db', '#2ecc71'],
        fontSize: 'medium',
        includeCharts: true,
        includeTables: true,
        includeMetrics: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Project Status Template
    const projectStatusTemplate: ReportTemplate = {
      id: 'default-project-status' as UUID,
      name: 'Project Status Report',
      type: ReportType.PROJECT_STATUS,
      description: 'Current status and progress of all projects',
      sections: [
        {
          id: 'project-overview',
          title: 'Project Overview',
          type: 'table',
          dataSource: 'projects',
          config: {
            columns: ['name', 'status', 'progress', 'dueDate', 'teamSize'],
            sortBy: { field: 'dueDate', order: 'asc' }
          },
          order: 1
        },
        {
          id: 'progress-chart',
          title: 'Project Progress',
          type: 'chart',
          dataSource: 'projects',
          config: {
            chartType: 'bar',
            xField: 'name',
            yField: 'progress',
            title: 'Project Progress Overview'
          },
          order: 2
        }
      ],
      filters: {},
      formatting: {
        theme: 'light',
        colorScheme: ['#e67e22', '#3498db', '#2ecc71'],
        fontSize: 'medium',
        includeCharts: true,
        includeTables: true,
        includeMetrics: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.templates.set(workflowSummaryTemplate.id, workflowSummaryTemplate);
    this.templates.set(teamPerformanceTemplate.id, teamPerformanceTemplate);
    this.templates.set(projectStatusTemplate.id, projectStatusTemplate);

    logger.info('Default report templates initialized', { 
      templateCount: this.templates.size 
    });
  }
}