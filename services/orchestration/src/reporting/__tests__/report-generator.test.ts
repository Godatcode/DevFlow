import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowReportGenerator, DataProvider } from '../report-generator';
import { ReportTemplateManager, ReportTemplate, ReportType, ReportFilters } from '../interfaces';
import { UUID, WorkflowStatus } from '@devflow/shared-types';

// Mock logger
vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('WorkflowReportGenerator', () => {
  let reportGenerator: WorkflowReportGenerator;
  let mockTemplateManager: ReportTemplateManager;
  let mockDataProviders: Map<string, DataProvider>;

  const templateId = 'template-1' as UUID;
  const mockTemplate: ReportTemplate = {
    id: templateId,
    name: 'Test Report',
    type: ReportType.WORKFLOW_SUMMARY,
    description: 'Test report template',
    sections: [
      {
        id: 'metrics',
        title: 'Workflow Metrics',
        type: 'metric',
        dataSource: 'workflows',
        config: { aggregation: 'count', field: 'id' },
        order: 1
      },
      {
        id: 'chart',
        title: 'Status Chart',
        type: 'chart',
        dataSource: 'workflows',
        config: { chartType: 'pie', xField: 'status', yField: 'count' },
        order: 2
      }
    ],
    filters: {
      dateRange: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      }
    },
    formatting: {
      theme: 'light',
      colorScheme: ['#3498db'],
      fontSize: 'medium',
      includeCharts: true,
      includeTables: true,
      includeMetrics: true
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockWorkflowData = [
    { id: '1', status: WorkflowStatus.COMPLETED, duration: 1000 },
    { id: '2', status: WorkflowStatus.COMPLETED, duration: 2000 },
    { id: '3', status: WorkflowStatus.FAILED, duration: 500 },
    { id: '4', status: WorkflowStatus.ACTIVE, duration: null }
  ];

  beforeEach(() => {
    mockTemplateManager = {
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      getTemplate: vi.fn().mockResolvedValue(mockTemplate),
      getTemplates: vi.fn(),
      cloneTemplate: vi.fn()
    };

    const mockWorkflowProvider: DataProvider = {
      getData: vi.fn().mockResolvedValue(mockWorkflowData)
    };

    mockDataProviders = new Map([
      ['workflows', mockWorkflowProvider]
    ]);

    reportGenerator = new WorkflowReportGenerator(mockTemplateManager, mockDataProviders);
  });

  describe('generateReport', () => {
    it('should generate report from template ID', async () => {
      const report = await reportGenerator.generateReport(templateId);

      expect(report).toBeDefined();
      expect(report.templateId).toBe(templateId);
      expect(report.title).toBe(mockTemplate.name);
      expect(report.content.sections).toHaveLength(2);
      expect(report.content.summary).toBeDefined();
      expect(report.metadata).toBeDefined();
    });

    it('should throw error for non-existent template', async () => {
      vi.mocked(mockTemplateManager.getTemplate).mockResolvedValue(null);

      await expect(reportGenerator.generateReport(templateId))
        .rejects.toThrow('Report template not found');
    });
  });

  describe('generateFromTemplate', () => {
    it('should generate report with summary metrics', async () => {
      const report = await reportGenerator.generateFromTemplate(mockTemplate);

      expect(report.content.summary.totalWorkflows).toBe(4);
      expect(report.content.summary.completedWorkflows).toBe(2);
      expect(report.content.summary.failedWorkflows).toBe(1);
      expect(report.content.summary.activeWorkflows).toBe(1);
      expect(report.content.summary.successRate).toBe(50); // 2/4 * 100
      expect(report.content.summary.averageExecutionTime).toBe(1500); // (1000 + 2000) / 2
    });

    it('should generate sections with correct data', async () => {
      const report = await reportGenerator.generateFromTemplate(mockTemplate);

      expect(report.content.sections).toHaveLength(2);
      
      const metricsSection = report.content.sections.find(s => s.id === 'metrics');
      expect(metricsSection).toBeDefined();
      expect(metricsSection?.type).toBe('metric');
      
      const chartSection = report.content.sections.find(s => s.id === 'chart');
      expect(chartSection).toBeDefined();
      expect(chartSection?.type).toBe('chart');
      expect(chartSection?.visualization).toBeDefined();
    });

    it('should merge filters correctly', async () => {
      const additionalFilters: ReportFilters = {
        statuses: [WorkflowStatus.COMPLETED]
      };

      const report = await reportGenerator.generateFromTemplate(mockTemplate, additionalFilters);

      expect(report.metadata.filters.statuses).toEqual([WorkflowStatus.COMPLETED]);
      expect(report.metadata.filters.dateRange).toEqual(mockTemplate.filters.dateRange);
    });

    it('should generate key insights', async () => {
      const report = await reportGenerator.generateFromTemplate(mockTemplate);

      expect(report.content.summary.keyInsights).toBeDefined();
      expect(report.content.summary.keyInsights.length).toBeGreaterThan(0);
    });

    it('should include generation metadata', async () => {
      const report = await reportGenerator.generateFromTemplate(mockTemplate);

      expect(report.metadata.generationTime).toBeGreaterThanOrEqual(0);
      expect(report.metadata.dataPoints).toBe(8); // 4 data points per section * 2 sections
      expect(report.metadata.version).toBe('1.0.0');
    });
  });

  describe('getReportData', () => {
    it('should retrieve data from correct provider', async () => {
      const filters: ReportFilters = {};
      const data = await reportGenerator.getReportData('workflows', filters);

      expect(data).toEqual(mockWorkflowData);
      expect(mockDataProviders.get('workflows')?.getData).toHaveBeenCalledWith(filters);
    });

    it('should throw error for unknown data source', async () => {
      await expect(reportGenerator.getReportData('unknown', {}))
        .rejects.toThrow('Data provider not found: unknown');
    });
  });

  describe('data processing', () => {
    it('should process metric data correctly', async () => {
      const mockProvider: DataProvider = {
        getData: vi.fn().mockResolvedValue([
          { value: 10 },
          { value: 20 },
          { value: 30 }
        ])
      };

      mockDataProviders.set('test', mockProvider);

      const template = {
        ...mockTemplate,
        sections: [{
          id: 'test-metric',
          title: 'Test Metric',
          type: 'metric',
          dataSource: 'test',
          config: { aggregation: 'sum', field: 'value' },
          order: 1
        }]
      };

      const report = await reportGenerator.generateFromTemplate(template);
      const section = report.content.sections[0];

      expect(section.data).toBe(60); // 10 + 20 + 30
    });

    it('should process chart data correctly', async () => {
      const mockProvider: DataProvider = {
        getData: vi.fn().mockResolvedValue([
          { status: 'completed', count: 5 },
          { status: 'failed', count: 2 }
        ])
      };

      mockDataProviders.set('test', mockProvider);

      const template = {
        ...mockTemplate,
        sections: [{
          id: 'test-chart',
          title: 'Test Chart',
          type: 'chart',
          dataSource: 'test',
          config: { chartType: 'bar', xField: 'status', yField: 'count' },
          order: 1
        }]
      };

      const report = await reportGenerator.generateFromTemplate(template);
      const section = report.content.sections[0];

      expect(section.data).toEqual([
        { x: 'completed', y: 5 },
        { x: 'failed', y: 2 }
      ]);
    });
  });
});