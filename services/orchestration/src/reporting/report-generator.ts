import { UUID, WorkflowStatus } from '@devflow/shared-types';
import { logger } from '@devflow/shared-utils';
import { v4 as uuidv4 } from 'uuid';
import {
  ReportGenerator,
  ReportTemplate,
  ReportFilters,
  GeneratedReport,
  ReportContent,
  GeneratedReportSection,
  ReportSummary,
  ReportMetadata,
  ReportTemplateManager
} from './interfaces';

export class WorkflowReportGenerator implements ReportGenerator {
  constructor(
    private templateManager: ReportTemplateManager,
    private dataProviders: Map<string, DataProvider>
  ) {}

  async generateReport(templateId: UUID, filters?: ReportFilters): Promise<GeneratedReport> {
    const startTime = Date.now();
    
    try {
      const template = await this.templateManager.getTemplate(templateId);
      if (!template) {
        throw new Error(`Report template not found: ${templateId}`);
      }

      return await this.generateFromTemplate(template, filters);
    } catch (error) {
      logger.error('Failed to generate report', { templateId, error: (error as Error).message });
      throw error;
    }
  }

  async generateFromTemplate(template: ReportTemplate, filters?: ReportFilters): Promise<GeneratedReport> {
    const startTime = Date.now();
    const reportId = uuidv4() as UUID;
    
    try {
      logger.info('Generating report from template', { 
        templateId: template.id, 
        templateName: template.name 
      });

      // Merge template filters with provided filters
      const effectiveFilters = this.mergeFilters(template.filters, filters);

      // Generate sections
      const sections: GeneratedReportSection[] = [];
      let totalDataPoints = 0;

      for (const section of template.sections) {
        const sectionData = await this.generateSection(section, effectiveFilters);
        sections.push(sectionData.section);
        totalDataPoints += sectionData.dataPoints;
      }

      // Generate summary
      const summary = await this.generateSummary(effectiveFilters);

      const content: ReportContent = {
        sections,
        summary
      };

      const metadata: ReportMetadata = {
        generationTime: Date.now() - startTime,
        dataPoints: totalDataPoints,
        filters: effectiveFilters,
        version: '1.0.0'
      };

      const report: GeneratedReport = {
        id: reportId,
        templateId: template.id,
        title: template.name,
        content,
        metadata,
        generatedAt: new Date()
      };

      logger.info('Report generated successfully', { 
        reportId, 
        templateId: template.id,
        generationTime: metadata.generationTime,
        dataPoints: totalDataPoints
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate report from template', { 
        templateId: template.id, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  async getReportData(dataSource: string, filters: ReportFilters): Promise<any> {
    const provider = this.dataProviders.get(dataSource);
    if (!provider) {
      throw new Error(`Data provider not found: ${dataSource}`);
    }

    return await provider.getData(filters);
  }

  private async generateSection(
    section: any, 
    filters: ReportFilters
  ): Promise<{ section: GeneratedReportSection; dataPoints: number }> {
    const data = await this.getReportData(section.dataSource, filters);
    
    const generatedSection: GeneratedReportSection = {
      id: section.id,
      title: section.title,
      type: section.type,
      data: this.processData(data, section.type, section.config),
      visualization: section.type === 'chart' ? this.generateVisualization(data, section.config) : undefined
    };

    return {
      section: generatedSection,
      dataPoints: Array.isArray(data) ? data.length : 1
    };
  }

  private async generateSummary(filters: ReportFilters): Promise<ReportSummary> {
    try {
      // Get workflow data for summary
      const workflowData = await this.getReportData('workflows', filters);
      
      const totalWorkflows = workflowData.length;
      const activeWorkflows = workflowData.filter((w: any) => w.status === WorkflowStatus.ACTIVE).length;
      const completedWorkflows = workflowData.filter((w: any) => w.status === WorkflowStatus.COMPLETED).length;
      const failedWorkflows = workflowData.filter((w: any) => w.status === WorkflowStatus.FAILED).length;
      
      const completedWithDuration = workflowData.filter((w: any) => 
        w.status === WorkflowStatus.COMPLETED && w.duration
      );
      
      const averageExecutionTime = completedWithDuration.length > 0
        ? completedWithDuration.reduce((sum: number, w: any) => sum + w.duration, 0) / completedWithDuration.length
        : 0;
      
      const successRate = totalWorkflows > 0 ? (completedWorkflows / totalWorkflows) * 100 : 0;
      
      const keyInsights = this.generateKeyInsights({
        totalWorkflows,
        activeWorkflows,
        completedWorkflows,
        failedWorkflows,
        successRate,
        averageExecutionTime
      });

      return {
        totalWorkflows,
        activeWorkflows,
        completedWorkflows,
        failedWorkflows,
        averageExecutionTime,
        successRate,
        keyInsights
      };
    } catch (error) {
      logger.error('Failed to generate report summary', { error: (error as Error).message });
      
      // Return default summary on error
      return {
        totalWorkflows: 0,
        activeWorkflows: 0,
        completedWorkflows: 0,
        failedWorkflows: 0,
        averageExecutionTime: 0,
        successRate: 0,
        keyInsights: ['Unable to generate insights due to data error']
      };
    }
  }

  private mergeFilters(templateFilters: ReportFilters, providedFilters?: ReportFilters): ReportFilters {
    if (!providedFilters) {
      return templateFilters;
    }

    return {
      teamIds: providedFilters.teamIds || templateFilters.teamIds,
      projectIds: providedFilters.projectIds || templateFilters.projectIds,
      workflowIds: providedFilters.workflowIds || templateFilters.workflowIds,
      dateRange: providedFilters.dateRange || templateFilters.dateRange,
      statuses: providedFilters.statuses || templateFilters.statuses,
      customFilters: {
        ...templateFilters.customFilters,
        ...providedFilters.customFilters
      }
    };
  }

  private processData(data: any, type: string, config: any): any {
    switch (type) {
      case 'chart':
        return this.processChartData(data, config);
      case 'table':
        return this.processTableData(data, config);
      case 'metric':
        return this.processMetricData(data, config);
      case 'text':
        return this.processTextData(data, config);
      default:
        return data;
    }
  }

  private processChartData(data: any[], config: any): any {
    // Process data for chart visualization
    const { xField, yField, groupBy } = config;
    
    if (groupBy) {
      const grouped = data.reduce((acc, item) => {
        const key = item[groupBy];
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});
      
      return Object.entries(grouped).map(([key, values]: [string, any]) => ({
        name: key,
        data: values.map((v: any) => ({ x: v[xField], y: v[yField] }))
      }));
    }
    
    return data.map(item => ({ x: item[xField], y: item[yField] }));
  }

  private processTableData(data: any[], config: any): any {
    const { columns, sortBy, limit } = config;
    
    let processedData = data;
    
    // Sort if specified
    if (sortBy) {
      processedData = [...data].sort((a, b) => {
        const aVal = a[sortBy.field];
        const bVal = b[sortBy.field];
        return sortBy.order === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    // Limit if specified
    if (limit) {
      processedData = processedData.slice(0, limit);
    }
    
    // Select columns if specified
    if (columns) {
      processedData = processedData.map(item => 
        columns.reduce((acc: any, col: string) => {
          acc[col] = item[col];
          return acc;
        }, {})
      );
    }
    
    return processedData;
  }

  private processMetricData(data: any, config: any): any {
    const { aggregation, field } = config;
    
    if (!Array.isArray(data)) {
      return data;
    }
    
    switch (aggregation) {
      case 'sum':
        return data.reduce((sum, item) => sum + (item[field] || 0), 0);
      case 'avg':
        return data.length > 0 ? data.reduce((sum, item) => sum + (item[field] || 0), 0) / data.length : 0;
      case 'count':
        return data.length;
      case 'max':
        return Math.max(...data.map(item => item[field] || 0));
      case 'min':
        return Math.min(...data.map(item => item[field] || 0));
      default:
        return data.length;
    }
  }

  private processTextData(data: any, config: any): string {
    const { template } = config;
    
    if (template) {
      // Simple template replacement
      return template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
        return data[key] || match;
      });
    }
    
    return JSON.stringify(data);
  }

  private generateVisualization(data: any, config: any): any {
    // Generate visualization config for charts
    return {
      type: config.chartType || 'line',
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: config.title || 'Chart'
          }
        }
      },
      data: this.processChartData(data, config)
    };
  }

  private generateKeyInsights(summary: any): string[] {
    const insights: string[] = [];
    
    if (summary.successRate >= 95) {
      insights.push('Excellent workflow success rate - system is performing optimally');
    } else if (summary.successRate >= 80) {
      insights.push('Good workflow success rate with room for improvement');
    } else {
      insights.push('Workflow success rate needs attention - investigate failed workflows');
    }
    
    if (summary.activeWorkflows > summary.totalWorkflows * 0.3) {
      insights.push('High number of active workflows - monitor system capacity');
    }
    
    if (summary.averageExecutionTime > 300000) { // 5 minutes
      insights.push('Average execution time is high - consider optimization');
    }
    
    if (summary.failedWorkflows > summary.totalWorkflows * 0.1) {
      insights.push('High failure rate detected - review error patterns');
    }
    
    return insights;
  }
}

export interface DataProvider {
  getData(filters: ReportFilters): Promise<any>;
}