import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimelinePredictionService } from '../timeline-prediction-service';
import { UUID } from '@devflow/shared-types';

// Mock the Logger
vi.mock('@devflow/shared-utils', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }))
}));

// Mock the underlying services
vi.mock('../prediction-engine', () => ({
  MLPredictionEngine: vi.fn().mockImplementation(() => ({
    predictProjectTimeline: vi.fn().mockResolvedValue({
      projectId: 'test-project',
      estimatedCompletionDate: new Date('2024-07-01'),
      confidenceLevel: 0.8,
      factors: [],
      scenarios: {
        optimistic: new Date('2024-06-20'),
        realistic: new Date('2024-07-01'),
        pessimistic: new Date('2024-07-15')
      }
    })
  }))
}));

vi.mock('../historical-data-analyzer', () => ({
  HistoricalDataAnalyzer: vi.fn().mockImplementation(() => ({
    analyzeVelocityPatterns: vi.fn().mockResolvedValue({
      velocityTrend: 'stable',
      consistency: 0.8
    }),
    analyzeDeploymentPatterns: vi.fn().mockResolvedValue({
      frequency: { trend: 'stable' }
    })
  }))
}));

vi.mock('../prediction-validator', () => ({
  PredictionValidator: vi.fn().mockImplementation(() => ({
    validatePredictionAccuracy: vi.fn().mockResolvedValue({
      accuracy: { overall: 85 },
      errorAnalysis: { severity: 'low' }
    }),
    analyzePredictionPerformance: vi.fn().mockResolvedValue({
      totalPredictions: 100
    }),
    monitorPredictionQuality: vi.fn().mockResolvedValue({
      overallHealth: 'healthy'
    }),
    improveModel: vi.fn().mockResolvedValue({
      newModelVersion: 'v2.0'
    })
  }))
}));

describe('TimelinePredictionService', () => {
  let service: TimelinePredictionService;

  beforeEach(() => {
    service = new TimelinePredictionService();
  });

  describe('predictProjectTimeline', () => {
    it('should generate timeline prediction successfully', async () => {
      const projectId = 'test-project-123' as UUID;

      const prediction = await service.predictProjectTimeline(projectId);

      expect(prediction).toBeDefined();
      expect(prediction.projectId).toBe('test-project');
      expect(prediction.estimatedCompletionDate).toBeInstanceOf(Date);
      expect(prediction.confidenceLevel).toBeGreaterThan(0);
      expect(prediction.scenarios).toBeDefined();
    });

    it('should handle prediction errors gracefully', async () => {
      const projectId = 'invalid-project' as UUID;
      
      // Mock the prediction engine to throw an error
      vi.mocked(service['predictionEngine'].predictProjectTimeline).mockRejectedValue(
        new Error('Project not found')
      );

      await expect(service.predictProjectTimeline(projectId)).rejects.toThrow('Project not found');
    });
  });

  describe('validateAndImprove', () => {
    it('should validate prediction successfully', async () => {
      const predictionId = 'prediction-123' as UUID;
      const actualOutcome = {
        completionDate: new Date('2024-07-03')
      };

      await expect(
        service.validateAndImprove(predictionId, actualOutcome)
      ).resolves.not.toThrow();
    });

    it('should trigger model improvement for low accuracy', async () => {
      const predictionId = 'prediction-123' as UUID;
      const actualOutcome = {
        completionDate: new Date('2024-08-15')
      };

      // Mock low accuracy result
      vi.mocked(service['validator'].validatePredictionAccuracy).mockResolvedValue({
        predictionId,
        accuracy: { overall: 50 }, // Low accuracy
        errorAnalysis: { 
          severity: 'high',
          contributingFactors: [{ type: 'scope_change' }]
        },
        recommendations: []
      });

      await service.validateAndImprove(predictionId, actualOutcome);

      expect(service['validator'].improveModel).toHaveBeenCalled();
    });
  });

  describe('getPredictionAnalytics', () => {
    it('should generate comprehensive analytics', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      };

      const analytics = await service.getPredictionAnalytics(timeRange);

      expect(analytics).toBeDefined();
      expect(analytics.timeRange).toEqual(timeRange);
      expect(analytics.performance).toBeDefined();
      expect(analytics.quality).toBeDefined();
      expect(analytics.summary).toBeDefined();
      expect(analytics.summary.totalPredictions).toBeGreaterThanOrEqual(0);
      expect(analytics.summary.averageAccuracy).toBeGreaterThan(0);
      expect(['improving', 'stable', 'declining']).toContain(analytics.summary.improvementTrend);
      expect(['healthy', 'warning', 'critical']).toContain(analytics.summary.healthStatus);
    });
  });

  describe('analyzeHistoricalTrends', () => {
    it('should analyze historical trends successfully', async () => {
      const projectId = 'test-project-123' as UUID;
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      };

      const trends = await service.analyzeHistoricalTrends(projectId, timeRange);

      expect(trends).toBeDefined();
      expect(trends.velocity).toBeDefined();
      expect(trends.deployment).toBeDefined();
      expect(trends.insights).toBeInstanceOf(Array);
    });

    it('should handle analysis errors gracefully', async () => {
      const projectId = 'invalid-project' as UUID;
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      };

      // Mock analyzer to throw error
      vi.mocked(service['historicalAnalyzer'].analyzeVelocityPatterns).mockRejectedValue(
        new Error('Data not available')
      );

      await expect(
        service.analyzeHistoricalTrends(projectId, timeRange)
      ).rejects.toThrow('Data not available');
    });
  });

  describe('Integration', () => {
    it('should enhance predictions with historical insights', async () => {
      const projectId = 'test-project-123' as UUID;

      // Mock historical trends that should affect prediction
      vi.mocked(service['historicalAnalyzer'].analyzeVelocityPatterns).mockResolvedValue({
        velocityTrend: 'increasing',
        consistency: 0.9
      });

      const prediction = await service.predictProjectTimeline(projectId);

      expect(prediction).toBeDefined();
      // The prediction should be enhanced with historical insights
      expect(prediction.factors.some(f => f.name.includes('Historical'))).toBe(true);
    });

    it('should work end-to-end for a complete prediction cycle', async () => {
      const projectId = 'test-project-123' as UUID;

      // 1. Generate prediction
      const prediction = await service.predictProjectTimeline(projectId);
      expect(prediction).toBeDefined();

      // 2. Validate prediction
      const actualOutcome = {
        completionDate: new Date('2024-07-02')
      };
      await service.validateAndImprove('prediction-123' as UUID, actualOutcome);

      // 3. Get analytics
      const analytics = await service.getPredictionAnalytics({
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      });
      expect(analytics).toBeDefined();

      // 4. Analyze trends
      const trends = await service.analyzeHistoricalTrends(projectId, {
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      });
      expect(trends).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete prediction within reasonable time', async () => {
      const projectId = 'test-project-123' as UUID;
      const startTime = Date.now();

      await service.predictProjectTimeline(projectId);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle multiple concurrent predictions', async () => {
      const projectIds = ['proj1', 'proj2', 'proj3'] as UUID[];
      const startTime = Date.now();

      const predictions = await Promise.all(
        projectIds.map(id => service.predictProjectTimeline(id))
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(predictions).toHaveLength(3);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      predictions.forEach(prediction => {
        expect(prediction).toBeDefined();
        expect(prediction.estimatedCompletionDate).toBeInstanceOf(Date);
      });
    });
  });
});