import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TechnicalDebtService, TechnicalDebtServiceConfig } from '../technical-debt-service';
import { TechnicalDebtAnalyzerService } from '../technical-debt-analyzer';
import { TechnicalDebtRepository } from '../technical-debt-repository';
import { TechnicalDebtAnalysis } from '@devflow/shared-types';
import { logger } from '@devflow/shared-utils';

// Mock dependencies
vi.mock('../technical-debt-analyzer');
vi.mock('../technical-debt-repository');
vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('TechnicalDebtService', () => {
  let service: TechnicalDebtService;
  let mockAnalyzer: Mock;
  let mockRepository: Mock;
  const mockProjectId = 'test-project-123';

  const mockConfig: TechnicalDebtServiceConfig = {
    analysisSchedule: '0 2 * * *', // Daily at 2 AM
    alertThresholds: {
      debtRatio: 0.2,
      criticalIssues: 5,
      totalDebtHours: 100
    },
    integrations: {
      sonarQube: {
        url: 'https://sonar.example.com',
        token: 'test-token'
      }
    }
  };

  const mockAnalysis: TechnicalDebtAnalysis = {
    totalDebtHours: 50,
    debtRatio: 0.15,
    criticalIssues: 3,
    recommendations: [
      {
        type: 'complexity_reduction',
        description: 'Reduce complexity',
        estimatedEffort: 20,
        priority: 'high',
        impact: 'Improves maintainability'
      }
    ],
    trends: {
      lastMonth: 45,
      lastQuarter: 60
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAnalyzer = vi.mocked(TechnicalDebtAnalyzerService);
    mockRepository = vi.mocked(TechnicalDebtRepository);

    service = new TechnicalDebtService(mockConfig);
  });

  describe('analyzeProjectDebt', () => {
    it('should analyze project debt and save results', async () => {
      const mockAnalyzerInstance = {
        analyzeCodebase: vi.fn().mockResolvedValue(mockAnalysis)
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      const mockRepositoryInstance = {
        saveTechnicalDebtAnalysis: vi.fn().mockResolvedValue('analysis-id-123'),
        getDebtItems: vi.fn().mockResolvedValue([])
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.analyzeProjectDebt(mockProjectId, true);

      expect(result).toEqual(mockAnalysis);
      expect(mockAnalyzerInstance.analyzeCodebase).toHaveBeenCalledWith(mockProjectId);
      expect(mockRepositoryInstance.saveTechnicalDebtAnalysis).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Starting technical debt analysis for project', { projectId: mockProjectId });
    });

    it('should analyze without saving when saveResults is false', async () => {
      const mockAnalyzerInstance = {
        analyzeCodebase: vi.fn().mockResolvedValue(mockAnalysis)
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      const mockRepositoryInstance = {
        saveTechnicalDebtAnalysis: vi.fn(),
        getDebtItems: vi.fn()
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.analyzeProjectDebt(mockProjectId, false);

      expect(result).toEqual(mockAnalysis);
      expect(mockRepositoryInstance.saveTechnicalDebtAnalysis).not.toHaveBeenCalled();
    });

    it('should trigger alerts when thresholds are exceeded', async () => {
      const highDebtAnalysis: TechnicalDebtAnalysis = {
        ...mockAnalysis,
        debtRatio: 0.25, // Above threshold
        criticalIssues: 8, // Above threshold
        totalDebtHours: 150 // Above threshold
      };

      const mockAnalyzerInstance = {
        analyzeCodebase: vi.fn().mockResolvedValue(highDebtAnalysis)
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      const mockRepositoryInstance = {
        saveTechnicalDebtAnalysis: vi.fn().mockResolvedValue('analysis-id-123'),
        getDebtItems: vi.fn().mockResolvedValue([])
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      await service.analyzeProjectDebt(mockProjectId);

      expect(logger.warn).toHaveBeenCalledWith('Technical debt alert thresholds exceeded', expect.objectContaining({
        projectId: mockProjectId,
        alerts: expect.arrayContaining([
          expect.stringContaining('High debt ratio'),
          expect.stringContaining('Critical issues'),
          expect.stringContaining('High total debt')
        ])
      }));
    });

    it('should handle analysis errors', async () => {
      const mockAnalyzerInstance = {
        analyzeCodebase: vi.fn().mockRejectedValue(new Error('Analysis failed'))
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      service = new TechnicalDebtService(mockConfig);

      await expect(service.analyzeProjectDebt(mockProjectId)).rejects.toThrow('Failed to analyze technical debt for project test-project-123: Analysis failed');

      expect(logger.error).toHaveBeenCalledWith('Technical debt analysis failed', expect.any(Object));
    });
  });

  describe('getLatestAnalysis', () => {
    it('should return latest analysis from repository', async () => {
      const mockRepositoryInstance = {
        getTechnicalDebtAnalysis: vi.fn().mockResolvedValue(mockAnalysis)
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.getLatestAnalysis(mockProjectId);

      expect(result).toEqual(mockAnalysis);
      expect(mockRepositoryInstance.getTechnicalDebtAnalysis).toHaveBeenCalledWith(mockProjectId);
    });

    it('should return null when no analysis exists', async () => {
      const mockRepositoryInstance = {
        getTechnicalDebtAnalysis: vi.fn().mockResolvedValue(null)
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.getLatestAnalysis(mockProjectId);

      expect(result).toBeNull();
    });
  });

  describe('getDebtTrends', () => {
    it('should merge analyzer and repository trends', async () => {
      const mockAnalyzerTrends = [
        {
          date: new Date('2024-01-01'),
          totalDebt: 50,
          newDebt: 5,
          resolvedDebt: 3,
          debtRatio: 0.1
        }
      ];

      const mockRepositoryTrends = [
        {
          date: new Date('2024-01-02'),
          totalDebt: 55,
          newDebt: 8,
          resolvedDebt: 2,
          debtRatio: 0.11
        }
      ];

      const mockAnalyzerInstance = {
        trackDebtTrends: vi.fn().mockResolvedValue(mockAnalyzerTrends)
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      const mockRepositoryInstance = {
        getDebtTrends: vi.fn().mockResolvedValue(mockRepositoryTrends)
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.getDebtTrends(mockProjectId, 30);

      expect(result).toHaveLength(2);
      expect(result[0].date).toEqual(new Date('2024-01-01'));
      expect(result[1].date).toEqual(new Date('2024-01-02'));
      expect(mockAnalyzerInstance.trackDebtTrends).toHaveBeenCalledWith(mockProjectId, 30);
      expect(mockRepositoryInstance.getDebtTrends).toHaveBeenCalledWith(mockProjectId, 30);
    });
  });

  describe('generateDebtReport', () => {
    it('should generate comprehensive debt report for multiple projects', async () => {
      const projectIds = ['project-1', 'project-2', 'project-3'];
      
      const mockSummary = new Map([
        ['project-1', { totalDebt: 50, criticalIssues: 2 }],
        ['project-2', { totalDebt: 80, criticalIssues: 5 }],
        ['project-3', { totalDebt: 30, criticalIssues: 1 }]
      ]);

      const mockRepositoryInstance = {
        getProjectDebtSummary: vi.fn().mockResolvedValue(mockSummary),
        getDebtTrends: vi.fn().mockResolvedValue([
          { date: new Date('2024-01-01'), totalDebt: 60, newDebt: 0, resolvedDebt: 0, debtRatio: 0.1 },
          { date: new Date('2024-01-02'), totalDebt: 50, newDebt: 0, resolvedDebt: 0, debtRatio: 0.09 }
        ]),
        getTechnicalDebtAnalysis: vi.fn().mockResolvedValue(mockAnalysis)
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      const mockAnalyzerInstance = {
        trackDebtTrends: vi.fn().mockResolvedValue([])
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.generateDebtReport(projectIds);

      expect(result.summary).toEqual(mockSummary);
      expect(result.trends.improving).toContain('project-1'); // Debt decreased
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(logger.info).toHaveBeenCalledWith('Generating debt report for projects', { projectIds });
    });

    it('should categorize project trends correctly', async () => {
      const projectIds = ['improving-project', 'degrading-project', 'stable-project'];
      
      const mockSummary = new Map([
        ['improving-project', { totalDebt: 40, criticalIssues: 1 }],
        ['degrading-project', { totalDebt: 70, criticalIssues: 3 }],
        ['stable-project', { totalDebt: 50, criticalIssues: 2 }]
      ]);

      const mockRepositoryInstance = {
        getProjectDebtSummary: vi.fn().mockResolvedValue(mockSummary),
        getTechnicalDebtAnalysis: vi.fn().mockResolvedValue(mockAnalysis),
        getDebtTrends: vi.fn().mockResolvedValue([])
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      const mockAnalyzerInstance = {
        trackDebtTrends: vi.fn()
          .mockResolvedValueOnce([ // improving-project
            { date: new Date('2024-01-01'), totalDebt: 50, newDebt: 0, resolvedDebt: 0, debtRatio: 0.1 },
            { date: new Date('2024-01-02'), totalDebt: 40, newDebt: 0, resolvedDebt: 0, debtRatio: 0.08 }
          ])
          .mockResolvedValueOnce([ // degrading-project
            { date: new Date('2024-01-01'), totalDebt: 60, newDebt: 0, resolvedDebt: 0, debtRatio: 0.1 },
            { date: new Date('2024-01-02'), totalDebt: 70, newDebt: 0, resolvedDebt: 0, debtRatio: 0.12 }
          ])
          .mockResolvedValueOnce([ // stable-project
            { date: new Date('2024-01-01'), totalDebt: 50, newDebt: 0, resolvedDebt: 0, debtRatio: 0.1 },
            { date: new Date('2024-01-02'), totalDebt: 51, newDebt: 0, resolvedDebt: 0, debtRatio: 0.102 }
          ])
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      service = new TechnicalDebtService(mockConfig);

      const result = await service.generateDebtReport(projectIds);

      expect(result.trends.improving).toContain('improving-project');
      expect(result.trends.degrading).toContain('degrading-project');
      expect(result.trends.stable).toContain('stable-project');
    });
  });

  describe('scheduleAnalysis', () => {
    it('should schedule and execute immediate analysis', async () => {
      const mockAnalyzerInstance = {
        analyzeCodebase: vi.fn().mockResolvedValue(mockAnalysis)
      };
      mockAnalyzer.mockImplementation(() => mockAnalyzerInstance);

      const mockRepositoryInstance = {
        saveTechnicalDebtAnalysis: vi.fn().mockResolvedValue('analysis-id-123'),
        getDebtItems: vi.fn().mockResolvedValue([])
      };
      mockRepository.mockImplementation(() => mockRepositoryInstance);

      service = new TechnicalDebtService(mockConfig);

      await service.scheduleAnalysis(mockProjectId);

      expect(logger.info).toHaveBeenCalledWith('Scheduling technical debt analysis', {
        projectId: mockProjectId,
        schedule: mockConfig.analysisSchedule
      });
      expect(mockAnalyzerInstance.analyzeCodebase).toHaveBeenCalledWith(mockProjectId);
    });
  });
});