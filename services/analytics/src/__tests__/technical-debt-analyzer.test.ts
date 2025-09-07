import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { TechnicalDebtAnalyzerService, CodeQualityMetrics, DebtItem } from '../technical-debt-analyzer';
import { logger } from '@devflow/shared-utils';

// Mock the logger
vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('TechnicalDebtAnalyzerService', () => {
  let analyzer: TechnicalDebtAnalyzerService;
  const mockProjectId = 'test-project-123';

  beforeEach(() => {
    analyzer = new TechnicalDebtAnalyzerService();
    vi.clearAllMocks();
  });

  describe('analyzeCodebase', () => {
    it('should analyze codebase and return technical debt analysis', async () => {
      const result = await analyzer.analyzeCodebase(mockProjectId);

      expect(result).toHaveProperty('totalDebtHours');
      expect(result).toHaveProperty('debtRatio');
      expect(result).toHaveProperty('criticalIssues');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('trends');

      expect(typeof result.totalDebtHours).toBe('number');
      expect(typeof result.debtRatio).toBe('number');
      expect(typeof result.criticalIssues).toBe('number');
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.trends).toHaveProperty('lastMonth');
      expect(result.trends).toHaveProperty('lastQuarter');

      expect(logger.info).toHaveBeenCalledWith('Starting technical debt analysis', { projectId: mockProjectId });
      expect(logger.info).toHaveBeenCalledWith('Technical debt analysis completed', expect.any(Object));
    });

    it('should handle analysis errors gracefully', async () => {
      // Mock a method to throw an error
      const originalMethod = analyzer['collectCodeQualityMetrics'];
      analyzer['collectCodeQualityMetrics'] = vi.fn().mockRejectedValue(new Error('Analysis failed'));

      await expect(analyzer.analyzeCodebase(mockProjectId)).rejects.toThrow('Technical debt analysis failed: Analysis failed');

      expect(logger.error).toHaveBeenCalledWith('Failed to analyze technical debt', expect.any(Object));

      // Restore original method
      analyzer['collectCodeQualityMetrics'] = originalMethod;
    });

    it('should calculate debt ratio correctly', async () => {
      const result = await analyzer.analyzeCodebase(mockProjectId);

      expect(result.debtRatio).toBeGreaterThanOrEqual(0);
      expect(result.debtRatio).toBeLessThanOrEqual(1);
    });

    it('should generate appropriate recommendations', async () => {
      const result = await analyzer.analyzeCodebase(mockProjectId);

      expect(result.recommendations.length).toBeGreaterThan(0);
      
      result.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('estimatedEffort');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('impact');
        
        expect(['low', 'medium', 'high', 'critical']).toContain(rec.priority);
        expect(typeof rec.estimatedEffort).toBe('number');
        expect(rec.estimatedEffort).toBeGreaterThan(0);
      });
    });
  });

  describe('trackDebtTrends', () => {
    it('should return debt trends for specified period', async () => {
      const period = 30;
      const trends = await analyzer.trackDebtTrends(mockProjectId, period);

      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBeGreaterThan(0);

      trends.forEach(trend => {
        expect(trend).toHaveProperty('date');
        expect(trend).toHaveProperty('totalDebt');
        expect(trend).toHaveProperty('newDebt');
        expect(trend).toHaveProperty('resolvedDebt');
        expect(trend).toHaveProperty('debtRatio');

        expect(trend.date).toBeInstanceOf(Date);
        expect(typeof trend.totalDebt).toBe('number');
        expect(typeof trend.newDebt).toBe('number');
        expect(typeof trend.resolvedDebt).toBe('number');
        expect(typeof trend.debtRatio).toBe('number');
      });

      // Trends should be sorted by date
      for (let i = 1; i < trends.length; i++) {
        expect(trends[i].date.getTime()).toBeGreaterThanOrEqual(trends[i - 1].date.getTime());
      }
    });

    it('should handle trend tracking errors', async () => {
      const originalMethod = analyzer['getDebtSnapshot'];
      analyzer['getDebtSnapshot'] = vi.fn().mockRejectedValue(new Error('Snapshot failed'));

      await expect(analyzer.trackDebtTrends(mockProjectId, 30)).rejects.toThrow('Debt trend tracking failed: Snapshot failed');

      expect(logger.error).toHaveBeenCalledWith('Failed to track debt trends', expect.any(Object));

      // Restore original method
      analyzer['getDebtSnapshot'] = originalMethod;
    });

    it('should limit trend analysis to reasonable period', async () => {
      const longPeriod = 365; // 1 year
      const trends = await analyzer.trackDebtTrends(mockProjectId, longPeriod);

      // Should be limited to ~90 days with weekly intervals
      expect(trends.length).toBeLessThanOrEqual(15); // ~90 days / 7 days per week
    });
  });

  describe('generateRecommendations', () => {
    it('should generate complexity reduction recommendations for high complexity', async () => {
      const mockQualityMetrics: CodeQualityMetrics = {
        cyclomaticComplexity: 35, // High complexity
        codeSmells: 20,
        duplicatedLines: 500,
        maintainabilityIndex: 70,
        testCoverage: 85,
        technicalDebtRatio: 0.1
      };

      const mockDebtItems: DebtItem[] = [];

      const recommendations = await analyzer.generateRecommendations(mockDebtItems, mockQualityMetrics);

      const complexityRec = recommendations.find(r => r.type === 'complexity_reduction');
      expect(complexityRec).toBeDefined();
      expect(complexityRec?.priority).toBe('high');
      expect(complexityRec?.estimatedEffort).toBeGreaterThan(0);
    });

    it('should generate test coverage recommendations for low coverage', async () => {
      const mockQualityMetrics: CodeQualityMetrics = {
        cyclomaticComplexity: 15,
        codeSmells: 20,
        duplicatedLines: 500,
        maintainabilityIndex: 70,
        testCoverage: 45, // Low coverage
        technicalDebtRatio: 0.1
      };

      const mockDebtItems: DebtItem[] = [];

      const recommendations = await analyzer.generateRecommendations(mockDebtItems, mockQualityMetrics);

      const coverageRec = recommendations.find(r => r.type === 'test_coverage');
      expect(coverageRec).toBeDefined();
      expect(coverageRec?.priority).toBe('high');
      expect(coverageRec?.description).toContain('test coverage');
    });

    it('should generate critical issues recommendations', async () => {
      const mockQualityMetrics: CodeQualityMetrics = {
        cyclomaticComplexity: 15,
        codeSmells: 20,
        duplicatedLines: 500,
        maintainabilityIndex: 70,
        testCoverage: 85,
        technicalDebtRatio: 0.1
      };

      const mockDebtItems: DebtItem[] = [
        {
          type: 'vulnerability',
          severity: 'critical',
          file: 'test.ts',
          line: 1,
          description: 'Critical security issue',
          estimatedEffort: 8,
          tags: ['security']
        },
        {
          type: 'bug',
          severity: 'critical',
          file: 'test2.ts',
          line: 10,
          description: 'Critical bug',
          estimatedEffort: 4,
          tags: ['bug']
        }
      ];

      const recommendations = await analyzer.generateRecommendations(mockDebtItems, mockQualityMetrics);

      const criticalRec = recommendations.find(r => r.type === 'critical_issues');
      expect(criticalRec).toBeDefined();
      expect(criticalRec?.priority).toBe('critical');
      expect(criticalRec?.estimatedEffort).toBe(12); // 8 + 4
      expect(criticalRec?.description).toContain('2 critical issues');
    });

    it('should sort recommendations by priority', async () => {
      const mockQualityMetrics: CodeQualityMetrics = {
        cyclomaticComplexity: 35, // High - generates high priority rec
        codeSmells: 20,
        duplicatedLines: 1500, // High - generates medium priority rec
        maintainabilityIndex: 70,
        testCoverage: 45, // Low - generates high priority rec
        technicalDebtRatio: 0.1
      };

      const mockDebtItems: DebtItem[] = [
        {
          type: 'vulnerability',
          severity: 'critical',
          file: 'test.ts',
          line: 1,
          description: 'Critical issue',
          estimatedEffort: 8,
          tags: ['security']
        }
      ];

      const recommendations = await analyzer.generateRecommendations(mockDebtItems, mockQualityMetrics);

      // Should be sorted with critical first, then high, then medium
      const priorities = recommendations.map(r => r.priority);
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      
      for (let i = 1; i < priorities.length; i++) {
        expect(priorityOrder[priorities[i - 1]]).toBeGreaterThanOrEqual(priorityOrder[priorities[i]]);
      }
    });
  });
});