import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  PredictionValidator,
  PredictionOutcome,
  ValidationResult,
  AccuracyMetrics,
  ErrorAnalysis
} from '../prediction-validator';
import {
  TimelinePrediction,
  UUID,
  PredictionFactor
} from '@devflow/shared-types';

// Mock the Logger
vi.mock('@devflow/shared-utils', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }))
}));

describe('PredictionValidator', () => {
  let validator: PredictionValidator;
  let mockPrediction: TimelinePrediction;
  let mockActualOutcome: PredictionOutcome;

  beforeEach(() => {
    validator = new PredictionValidator();

    const baseDate = new Date('2024-06-01');
    mockPrediction = {
      projectId: 'test-project-123' as UUID,
      estimatedCompletionDate: new Date('2024-07-01'), // 30 days from base
      confidenceLevel: 0.8,
      factors: [
        {
          name: 'Team Experience',
          impact: 0.2,
          description: 'Experienced team should deliver faster'
        }
      ] as PredictionFactor[],
      scenarios: {
        optimistic: new Date('2024-06-20'), // 20 days
        realistic: new Date('2024-07-01'),   // 30 days
        pessimistic: new Date('2024-07-15')  // 45 days
      }
    };

    mockActualOutcome = {
      completionDate: new Date('2024-07-03'), // 2 days late
      scopeChanges: 1,
      teamChanges: 0,
      externalDelays: 0,
      actualEffort: 240,
      qualityIssues: 2
    };

    // Mock private methods
    vi.spyOn(validator as any, 'getPrediction').mockResolvedValue(mockPrediction);
    vi.spyOn(validator as any, 'storePredictionValidation').mockResolvedValue(undefined);
    vi.spyOn(validator as any, 'updateModelPerformance').mockResolvedValue(undefined);
    vi.spyOn(validator as any, 'getValidationHistory').mockResolvedValue([]);
    vi.spyOn(validator as any, 'getModelPerformance').mockResolvedValue({ accuracy: 0.75 });
    vi.spyOn(validator as any, 'getModelValidationData').mockResolvedValue({});
    vi.spyOn(validator as any, 'testImprovedModel').mockResolvedValue({ accuracy: 0.8 });
    vi.spyOn(validator as any, 'deployImprovedModel').mockResolvedValue(undefined);
    vi.spyOn(validator as any, 'getRecentPredictions').mockResolvedValue([]);
    vi.spyOn(validator as any, 'sendQualityAlerts').mockResolvedValue(undefined);
  });

  describe('validatePredictionAccuracy', () => {
    it('should validate prediction accuracy successfully', async () => {
      const predictionId = 'prediction-123' as UUID;

      const result = await validator.validatePredictionAccuracy(predictionId, mockActualOutcome);

      expect(result).toBeDefined();
      expect(result.predictionId).toBe(predictionId);
      expect(result.accuracy).toBeDefined();
      expect(result.accuracy.overall).toBeGreaterThan(0);
      expect(result.accuracy.overall).toBeLessThanOrEqual(100);
      expect(result.errorAnalysis).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it('should calculate accuracy correctly for close predictions', async () => {
      const closeOutcome: PredictionOutcome = {
        completionDate: new Date('2024-07-02'), // 1 day late
        scopeChanges: 0,
        teamChanges: 0,
        externalDelays: 0
      };

      const result = await validator.validatePredictionAccuracy(
        'prediction-123' as UUID,
        closeOutcome
      );

      expect(result.accuracy.overall).toBeGreaterThan(90); // Should be high accuracy
      expect(result.accuracy.daysDifference).toBe(1);
      expect(result.accuracy.withinConfidenceInterval).toBe(true);
    });

    it('should calculate accuracy correctly for far predictions', async () => {
      const farOutcome: PredictionOutcome = {
        completionDate: new Date('2024-08-15'), // 45 days late
        scopeChanges: 5,
        teamChanges: 2,
        externalDelays: 10
      };

      const result = await validator.validatePredictionAccuracy(
        'prediction-123' as UUID,
        farOutcome
      );

      expect(result.accuracy.overall).toBeLessThan(50); // Should be low accuracy
      expect(result.accuracy.daysDifference).toBe(45);
      expect(result.errorAnalysis.severity).toMatch(/high|critical/);
    });

    it('should identify contributing factors correctly', async () => {
      const outcomeWithFactors: PredictionOutcome = {
        completionDate: new Date('2024-07-20'), // 19 days late
        scopeChanges: 3,
        teamChanges: 1,
        externalDelays: 5
      };

      const result = await validator.validatePredictionAccuracy(
        'prediction-123' as UUID,
        outcomeWithFactors
      );

      expect(result.errorAnalysis.contributingFactors.length).toBeGreaterThan(0);
      
      const scopeFactor = result.errorAnalysis.contributingFactors.find(
        f => f.type === 'scope_change'
      );
      expect(scopeFactor).toBeDefined();
      expect(scopeFactor?.impact).toBeGreaterThan(0);

      const teamFactor = result.errorAnalysis.contributingFactors.find(
        f => f.type === 'team_change'
      );
      expect(teamFactor).toBeDefined();

      const externalFactor = result.errorAnalysis.contributingFactors.find(
        f => f.type === 'external_dependency'
      );
      expect(externalFactor).toBeDefined();
    });

    it('should classify error types correctly', async () => {
      const testCases = [
        { days: 1, expectedType: 'minimal' },
        { days: 5, expectedType: 'acceptable' },
        { days: 10, expectedType: 'moderate' },
        { days: 20, expectedType: 'significant' },
        { days: 40, expectedType: 'critical' }
      ];

      for (const testCase of testCases) {
        const outcome: PredictionOutcome = {
          completionDate: new Date(mockPrediction.estimatedCompletionDate.getTime() + 
            testCase.days * 24 * 60 * 60 * 1000)
        };

        const result = await validator.validatePredictionAccuracy(
          'prediction-123' as UUID,
          outcome
        );

        expect(result.errorAnalysis.errorType).toBe(testCase.expectedType);
      }
    });

    it('should handle early completions correctly', async () => {
      const earlyOutcome: PredictionOutcome = {
        completionDate: new Date('2024-06-25'), // 6 days early
        scopeChanges: 0,
        teamChanges: 0,
        externalDelays: 0
      };

      const result = await validator.validatePredictionAccuracy(
        'prediction-123' as UUID,
        earlyOutcome
      );

      expect(result.accuracy.overall).toBeGreaterThanOrEqual(80); // Should be good accuracy
      expect(result.accuracy.daysDifference).toBe(6);
      expect(result.errorAnalysis.errorDays).toBe(-6); // Negative for early
    });

    it('should throw error when prediction not found', async () => {
      vi.spyOn(validator as any, 'getPrediction').mockResolvedValue(null);

      await expect(
        validator.validatePredictionAccuracy('nonexistent' as UUID, mockActualOutcome)
      ).rejects.toThrow('Prediction nonexistent not found');
    });
  });

  describe('batchValidatePredictions', () => {
    it('should validate multiple predictions', async () => {
      const validations = [
        { predictionId: 'pred-1' as UUID, actualOutcome: mockActualOutcome },
        { predictionId: 'pred-2' as UUID, actualOutcome: mockActualOutcome },
        { predictionId: 'pred-3' as UUID, actualOutcome: mockActualOutcome }
      ];

      const result = await validator.batchValidatePredictions(validations);

      expect(result.totalValidations).toBe(3);
      expect(result.successfulValidations).toBe(3);
      expect(result.failedValidations).toBe(0);
      expect(result.overallAccuracy).toBeGreaterThan(0);
      expect(result.trends).toBeDefined();
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle validation errors gracefully', async () => {
      vi.spyOn(validator as any, 'getPrediction')
        .mockResolvedValueOnce(mockPrediction)
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(mockPrediction);

      const validations = [
        { predictionId: 'pred-1' as UUID, actualOutcome: mockActualOutcome },
        { predictionId: 'pred-2' as UUID, actualOutcome: mockActualOutcome },
        { predictionId: 'pred-3' as UUID, actualOutcome: mockActualOutcome }
      ];

      const result = await validator.batchValidatePredictions(validations);

      expect(result.totalValidations).toBe(3);
      expect(result.successfulValidations).toBe(2);
      expect(result.failedValidations).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].predictionId).toBe('pred-2');
      expect(result.errors[0].error).toBe('Database error');
    });

    it('should calculate overall accuracy correctly', async () => {
      // Mock different accuracy results
      let callCount = 0;
      vi.spyOn(validator, 'validatePredictionAccuracy').mockImplementation(async () => {
        callCount++;
        return {
          predictionId: `pred-${callCount}` as UUID,
          accuracy: {
            overall: callCount === 1 ? 90 : callCount === 2 ? 80 : 70,
            timelineAccuracy: 85,
            daysDifference: 2,
            withinConfidenceInterval: true,
            scenarioAccuracy: {
              closestScenario: 'realistic',
              optimisticAccuracy: 80,
              realisticAccuracy: 90,
              pessimisticAccuracy: 70
            }
          } as AccuracyMetrics,
          errorAnalysis: {} as ErrorAnalysis,
          recommendations: []
        } as ValidationResult;
      });

      const validations = [
        { predictionId: 'pred-1' as UUID, actualOutcome: mockActualOutcome },
        { predictionId: 'pred-2' as UUID, actualOutcome: mockActualOutcome },
        { predictionId: 'pred-3' as UUID, actualOutcome: mockActualOutcome }
      ];

      const result = await validator.batchValidatePredictions(validations);

      expect(result.overallAccuracy).toBe(80); // (90 + 80 + 70) / 3
    });
  });

  describe('analyzePredictionPerformance', () => {
    it('should analyze prediction performance over time', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      };

      const analysis = await validator.analyzePredictionPerformance(timeRange);

      expect(analysis).toBeDefined();
      expect(analysis.timeRange).toEqual(timeRange);
      expect(analysis.totalPredictions).toBeGreaterThanOrEqual(0);
      expect(analysis.accuracyTrends).toBeDefined();
      expect(analysis.errorPatterns).toBeDefined();
      expect(analysis.modelComparison).toBeDefined();
      expect(analysis.improvementOpportunities).toBeDefined();
      expect(analysis.recommendations).toBeInstanceOf(Array);
    });

    it('should handle performance filters', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-06-01')
      };
      const filters = {
        projectIds: ['project-1', 'project-2'] as UUID[],
        accuracyThreshold: 0.8
      };

      const analysis = await validator.analyzePredictionPerformance(timeRange, filters);

      expect(analysis).toBeDefined();
      // Verify that filters were passed to the underlying method
      expect(validator['getValidationHistory']).toHaveBeenCalledWith(timeRange, filters);
    });
  });

  describe('improveModel', () => {
    it('should improve model with feature engineering', async () => {
      const improvementStrategy = {
        type: 'feature_engineering' as const,
        parameters: { newFeatures: ['code_churn', 'pr_size'] },
        expectedImprovement: 0.05
      };

      const result = await validator.improveModel('v1.0', improvementStrategy);

      expect(result).toBeDefined();
      expect(result.newModelVersion).toBeDefined();
      expect(result.improvements).toBeInstanceOf(Array);
      expect(result.testResults).toBeDefined();
      expect(result.deployed).toBe(true); // Should deploy since test accuracy > current
    });

    it('should improve model with hyperparameter tuning', async () => {
      const improvementStrategy = {
        type: 'hyperparameter_tuning' as const,
        parameters: { learningRate: 0.01, epochs: 100 },
        expectedImprovement: 0.03
      };

      const result = await validator.improveModel('v1.0', improvementStrategy);

      expect(result).toBeDefined();
      expect(result.newModelVersion).toBeDefined();
    });

    it('should not deploy model if performance does not improve', async () => {
      vi.spyOn(validator as any, 'testImprovedModel').mockResolvedValue({ accuracy: 0.7 }); // Lower than current 0.75

      const improvementStrategy = {
        type: 'ensemble_methods' as const,
        parameters: { models: ['random_forest', 'gradient_boosting'] },
        expectedImprovement: 0.02
      };

      const result = await validator.improveModel('v1.0', improvementStrategy);

      expect(result.deployed).toBe(false);
    });

    it('should handle unknown improvement strategy', async () => {
      const invalidStrategy = {
        type: 'unknown_strategy' as any,
        parameters: {},
        expectedImprovement: 0.01
      };

      await expect(
        validator.improveModel('v1.0', invalidStrategy)
      ).rejects.toThrow('Unknown improvement strategy: unknown_strategy');
    });
  });

  describe('monitorPredictionQuality', () => {
    it('should monitor prediction quality', async () => {
      const result = await validator.monitorPredictionQuality();

      expect(result).toBeDefined();
      expect(result.monitoringPeriod).toBe('24 hours');
      expect(result.totalPredictions).toBeGreaterThanOrEqual(0);
      expect(result.qualityMetrics).toBeDefined();
      expect(result.anomalies).toBeInstanceOf(Array);
      expect(result.alerts).toBeInstanceOf(Array);
      expect(['healthy', 'warning', 'critical']).toContain(result.overallHealth);
    });

    it('should send alerts when anomalies detected', async () => {
      const mockAnomalies = [
        { type: 'accuracy_drop', severity: 'high' },
        { type: 'prediction_volume_spike', severity: 'medium' }
      ];
      const mockAlerts = [
        { message: 'Prediction accuracy dropped below threshold', severity: 'high' }
      ];

      vi.spyOn(validator as any, 'detectQualityAnomalies').mockReturnValue(mockAnomalies);
      vi.spyOn(validator as any, 'generateQualityAlerts').mockReturnValue(mockAlerts);

      const result = await validator.monitorPredictionQuality();

      expect(result.anomalies).toEqual(mockAnomalies);
      expect(result.alerts).toEqual(mockAlerts);
      expect(validator['sendQualityAlerts']).toHaveBeenCalledWith(mockAlerts);
    });
  });

  describe('Accuracy Calculation', () => {
    it('should calculate scenario accuracy correctly', () => {
      const scenarioAccuracy = (validator as any).calculateScenarioAccuracy(
        mockPrediction,
        mockActualOutcome
      );

      expect(scenarioAccuracy).toBeDefined();
      expect(['optimistic', 'realistic', 'pessimistic']).toContain(scenarioAccuracy.closestScenario);
      expect(scenarioAccuracy.optimisticAccuracy).toBeGreaterThanOrEqual(0);
      expect(scenarioAccuracy.realisticAccuracy).toBeGreaterThanOrEqual(0);
      expect(scenarioAccuracy.pessimisticAccuracy).toBeGreaterThanOrEqual(0);
    });

    it('should determine if outcome is within confidence interval', () => {
      const withinInterval = (validator as any).isWithinConfidenceInterval(
        mockPrediction,
        mockActualOutcome
      );

      expect(typeof withinInterval).toBe('boolean');
      expect(withinInterval).toBe(true); // July 3rd is between June 20th and July 15th
    });

    it('should handle outcomes outside confidence interval', () => {
      const outsideOutcome: PredictionOutcome = {
        completionDate: new Date('2024-08-01'), // Way outside pessimistic scenario
      };

      const withinInterval = (validator as any).isWithinConfidenceInterval(
        mockPrediction,
        outsideOutcome
      );

      expect(withinInterval).toBe(false);
    });
  });

  describe('Error Analysis', () => {
    it('should classify error severity based on confidence', () => {
      const highConfidencePrediction = { ...mockPrediction, confidenceLevel: 0.9 };
      const lowConfidencePrediction = { ...mockPrediction, confidenceLevel: 0.4 };

      const highConfidenceSeverity = (validator as any).calculateErrorSeverity(10, 0.9);
      const lowConfidenceSeverity = (validator as any).calculateErrorSeverity(10, 0.4);

      // Same error should be more severe for high confidence predictions
      expect(['medium', 'high', 'critical']).toContain(highConfidenceSeverity);
      expect(['low', 'medium']).toContain(lowConfidenceSeverity);
    });

    it('should identify root cause from contributing factors', () => {
      const factors = [
        { type: 'scope_change', impact: 0.3, description: 'Major scope changes' },
        { type: 'team_change', impact: 0.1, description: 'Minor team changes' },
        { type: 'external_dependency', impact: 0.2, description: 'External delays' }
      ];

      const rootCause = (validator as any).identifyRootCause(factors);

      expect(rootCause).toContain('scope_change'); // Should identify highest impact factor
      expect(rootCause).toContain('Major scope changes');
    });

    it('should generate appropriate correction suggestions', () => {
      const factors = [
        { type: 'scope_change', impact: 0.3, description: 'Scope changes' },
        { type: 'team_change', impact: 0.2, description: 'Team changes' }
      ];

      const suggestions = (validator as any).generateCorrectionSuggestions('significant', factors);

      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s: string) => s.includes('scope'))).toBe(true);
      expect(suggestions.some((s: string) => s.includes('team'))).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete validation within reasonable time', async () => {
      const startTime = Date.now();

      await validator.validatePredictionAccuracy('prediction-123' as UUID, mockActualOutcome);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle batch validation efficiently', async () => {
      const validations = Array.from({ length: 50 }, (_, index) => ({
        predictionId: `pred-${index}` as UUID,
        actualOutcome: mockActualOutcome
      }));

      const startTime = Date.now();

      const result = await validator.batchValidatePredictions(validations);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(result.totalValidations).toBe(50);
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});