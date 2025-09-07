import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { MLPredictionEngine } from '../prediction-engine';
import {
  TimelinePrediction,
  ProjectData,
  MetricData,
  MetricType,
  UUID
} from '@devflow/shared-types';

// Mock the Logger
vi.mock('@devflow/shared-utils', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }))
}));

describe('MLPredictionEngine', () => {
  let predictionEngine: MLPredictionEngine;
  let mockProjectData: ProjectData;
  let mockHistoricalData: MetricData[];

  beforeEach(() => {
    predictionEngine = new MLPredictionEngine();
    
    mockProjectData = {
      projectId: 'test-project-123' as UUID,
      codebase: {
        linesOfCode: 50000,
        complexity: 12,
        testCoverage: 75,
        dependencies: ['react', 'typescript', 'node'],
        languages: ['typescript', 'javascript']
      },
      team: {
        size: 5,
        experience: 3.5,
        velocity: 25,
        skills: ['typescript', 'react', 'node.js']
      },
      historicalMetrics: []
    };

    mockHistoricalData = [
      {
        id: '1' as UUID,
        type: MetricType.TEAM_VELOCITY,
        value: 25,
        unit: 'story_points',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date('2024-01-01'),
        metadata: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      },
      {
        id: '2' as UUID,
        type: MetricType.DORA_LEAD_TIME,
        value: 72,
        unit: 'hours',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date('2024-01-02'),
        metadata: {},
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02')
      },
      {
        id: '3' as UUID,
        type: MetricType.DORA_CHANGE_FAILURE_RATE,
        value: 15,
        unit: 'percentage',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date('2024-01-03'),
        metadata: {},
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-03')
      }
    ];

    // Mock private methods
    vi.spyOn(predictionEngine as any, 'getHistoricalProjectData').mockResolvedValue(mockHistoricalData);
    vi.spyOn(predictionEngine as any, 'getCurrentProjectData').mockResolvedValue(mockProjectData);
  });

  describe('predictProjectTimeline', () => {
    it('should generate a timeline prediction with all required fields', async () => {
      const projectId = 'test-project-123' as UUID;
      
      const prediction = await predictionEngine.predictProjectTimeline(projectId);
      
      expect(prediction).toBeDefined();
      expect(prediction.projectId).toBe(projectId);
      expect(prediction.estimatedCompletionDate).toBeInstanceOf(Date);
      expect(prediction.confidenceLevel).toBeGreaterThan(0);
      expect(prediction.confidenceLevel).toBeLessThanOrEqual(1);
      expect(prediction.factors).toBeInstanceOf(Array);
      expect(prediction.scenarios).toBeDefined();
      expect(prediction.scenarios.optimistic).toBeInstanceOf(Date);
      expect(prediction.scenarios.realistic).toBeInstanceOf(Date);
      expect(prediction.scenarios.pessimistic).toBeInstanceOf(Date);
    });

    it('should generate realistic timeline scenarios', async () => {
      const projectId = 'test-project-123' as UUID;
      
      const prediction = await predictionEngine.predictProjectTimeline(projectId);
      
      // Optimistic should be earlier than realistic
      expect(prediction.scenarios.optimistic.getTime()).toBeLessThan(
        prediction.scenarios.realistic.getTime()
      );
      
      // Realistic should be earlier than pessimistic
      expect(prediction.scenarios.realistic.getTime()).toBeLessThan(
        prediction.scenarios.pessimistic.getTime()
      );
      
      // All scenarios should be in the future
      const now = Date.now();
      expect(prediction.scenarios.optimistic.getTime()).toBeGreaterThan(now);
      expect(prediction.scenarios.realistic.getTime()).toBeGreaterThan(now);
      expect(prediction.scenarios.pessimistic.getTime()).toBeGreaterThan(now);
    });

    it('should include relevant prediction factors', async () => {
      const projectId = 'test-project-123' as UUID;
      
      const prediction = await predictionEngine.predictProjectTimeline(projectId);
      
      expect(prediction.factors).toBeInstanceOf(Array);
      prediction.factors.forEach(factor => {
        expect(factor).toHaveProperty('name');
        expect(factor).toHaveProperty('impact');
        expect(factor).toHaveProperty('description');
        expect(typeof factor.impact).toBe('number');
        expect(factor.impact).toBeGreaterThanOrEqual(-1);
        expect(factor.impact).toBeLessThanOrEqual(1);
      });
    });

    it('should handle projects with high complexity', async () => {
      const highComplexityProject = {
        ...mockProjectData,
        codebase: {
          ...mockProjectData.codebase,
          complexity: 20, // High complexity
          testCoverage: 50 // Low test coverage
        }
      };
      
      vi.spyOn(predictionEngine as any, 'getCurrentProjectData').mockResolvedValue(highComplexityProject);
      
      const prediction = await predictionEngine.predictProjectTimeline('test-project-123' as UUID);
      
      // Should have factors related to complexity
      const complexityFactors = prediction.factors.filter(f => 
        f.name.toLowerCase().includes('complexity') || 
        f.name.toLowerCase().includes('coverage')
      );
      expect(complexityFactors.length).toBeGreaterThan(0);
    });

    it('should handle experienced teams differently', async () => {
      const experiencedTeamProject = {
        ...mockProjectData,
        team: {
          ...mockProjectData.team,
          experience: 8, // Very experienced team
          velocity: 35 // High velocity
        }
      };
      
      vi.spyOn(predictionEngine as any, 'getCurrentProjectData').mockResolvedValue(experiencedTeamProject);
      
      const prediction = await predictionEngine.predictProjectTimeline('test-project-123' as UUID);
      
      // Should have positive factors for experienced team
      const experienceFactors = prediction.factors.filter(f => 
        f.name.toLowerCase().includes('experienced') && f.impact > 0
      );
      expect(experienceFactors.length).toBeGreaterThan(0);
    });

    it('should throw error when prediction fails', async () => {
      vi.spyOn(predictionEngine as any, 'getCurrentProjectData').mockRejectedValue(
        new Error('Database connection failed')
      );
      
      await expect(
        predictionEngine.predictProjectTimeline('test-project-123' as UUID)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('predictResourceNeeds', () => {
    it('should predict resource needs for a team', async () => {
      const teamId = 'test-team-123' as UUID;
      
      const prediction = await predictionEngine.predictResourceNeeds(teamId);
      
      expect(prediction).toBeDefined();
      expect(prediction.teamId).toBe(teamId);
      expect(prediction.predictedNeeds).toBeDefined();
      expect(prediction.predictedNeeds.developers).toBeGreaterThan(0);
      expect(prediction.predictedNeeds.timeframe).toBeDefined();
      expect(prediction.predictedNeeds.confidence).toBeGreaterThan(0);
      expect(prediction.predictedNeeds.confidence).toBeLessThanOrEqual(1);
      expect(prediction.recommendations).toBeInstanceOf(Array);
    });

    it('should provide realistic developer count predictions', async () => {
      const teamId = 'test-team-123' as UUID;
      
      const prediction = await predictionEngine.predictResourceNeeds(teamId);
      
      // Should predict reasonable number of developers (1-20)
      expect(prediction.predictedNeeds.developers).toBeGreaterThanOrEqual(1);
      expect(prediction.predictedNeeds.developers).toBeLessThanOrEqual(20);
    });
  });

  describe('predictRiskFactors', () => {
    it('should assess project risks', async () => {
      const projectId = 'test-project-123' as UUID;
      
      const riskAssessment = await predictionEngine.predictRiskFactors(projectId);
      
      expect(riskAssessment).toBeDefined();
      expect(riskAssessment.projectId).toBe(projectId);
      expect(['low', 'medium', 'high', 'critical']).toContain(riskAssessment.riskLevel);
      expect(riskAssessment.factors).toBeInstanceOf(Array);
      expect(riskAssessment.mitigationStrategies).toBeInstanceOf(Array);
    });

    it('should identify risk factors with proper structure', async () => {
      const projectId = 'test-project-123' as UUID;
      
      const riskAssessment = await predictionEngine.predictRiskFactors(projectId);
      
      riskAssessment.factors.forEach(factor => {
        expect(factor).toHaveProperty('name');
        expect(factor).toHaveProperty('impact');
        expect(factor).toHaveProperty('probability');
        expect(factor).toHaveProperty('description');
        expect(typeof factor.impact).toBe('number');
        expect(typeof factor.probability).toBe('number');
      });
    });
  });

  describe('Feature Extraction', () => {
    it('should extract meaningful features from project data', () => {
      const features = (predictionEngine as any).extractFeatures(mockProjectData, mockHistoricalData);
      
      expect(features).toBeDefined();
      expect(features.teamVelocity).toBeGreaterThan(0);
      expect(features.codeComplexity).toBe(mockProjectData.codebase.complexity);
      expect(features.testCoverage).toBe(mockProjectData.codebase.testCoverage);
      expect(features.teamExperience).toBe(mockProjectData.team.experience);
      expect(features.teamSize).toBe(mockProjectData.team.size);
    });

    it('should handle missing historical data gracefully', () => {
      const features = (predictionEngine as any).extractFeatures(mockProjectData, []);
      
      expect(features).toBeDefined();
      expect(features.teamVelocity).toBeGreaterThan(0); // Should use default
      expect(features.historicalLeadTime).toBeGreaterThan(0); // Should use default
    });
  });

  describe('Prediction Models', () => {
    it('should generate velocity-based predictions', () => {
      const features = {
        teamVelocity: 25,
        codeComplexity: 12,
        testCoverage: 75,
        teamExperience: 3.5,
        teamSize: 5,
        historicalLeadTime: 72,
        changeFailureRate: 15,
        deploymentFrequency: 1,
        technicalDebtRatio: 20
      };
      
      const prediction = (predictionEngine as any).predictBasedOnVelocity(features);
      
      expect(prediction).toBeInstanceOf(Date);
      expect(prediction.getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate complexity-based predictions', () => {
      const features = {
        teamVelocity: 25,
        codeComplexity: 12,
        testCoverage: 75,
        teamExperience: 3.5,
        teamSize: 5,
        historicalLeadTime: 72,
        changeFailureRate: 15,
        deploymentFrequency: 1,
        technicalDebtRatio: 20
      };
      
      const prediction = (predictionEngine as any).predictBasedOnComplexity(features);
      
      expect(prediction).toBeInstanceOf(Date);
      expect(prediction.getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate team performance-based predictions', () => {
      const features = {
        teamVelocity: 25,
        codeComplexity: 12,
        testCoverage: 75,
        teamExperience: 3.5,
        teamSize: 5,
        historicalLeadTime: 72,
        changeFailureRate: 15,
        deploymentFrequency: 1,
        technicalDebtRatio: 20
      };
      
      const prediction = (predictionEngine as any).predictBasedOnTeamPerformance(features);
      
      expect(prediction).toBeInstanceOf(Date);
      expect(prediction.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Confidence Calculation', () => {
    it('should calculate prediction confidence based on data quality', async () => {
      const confidence = await (predictionEngine as any).calculatePredictionConfidence(
        mockProjectData,
        mockHistoricalData
      );
      
      expect(confidence).toBeGreaterThanOrEqual(0.3);
      expect(confidence).toBeLessThanOrEqual(0.95);
    });

    it('should return lower confidence for insufficient data', async () => {
      const confidence = await (predictionEngine as any).calculatePredictionConfidence(
        mockProjectData,
        [] // No historical data
      );
      
      expect(confidence).toBeLessThanOrEqual(0.6); // Should be low confidence
    });
  });

  describe('Scenario Generation', () => {
    it('should generate realistic scenarios with proper ordering', () => {
      const baselinePrediction = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
      const confidence = 0.75;
      
      const scenarios = (predictionEngine as any).calculateScenarios(baselinePrediction, confidence);
      
      expect(scenarios.optimistic.getTime()).toBeLessThan(scenarios.realistic.getTime());
      expect(scenarios.realistic.getTime()).toBeLessThan(scenarios.pessimistic.getTime());
      expect(scenarios.realistic.getTime()).toBe(baselinePrediction.getTime());
    });

    it('should adjust scenario spread based on confidence', () => {
      const baselinePrediction = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      
      const highConfidenceScenarios = (predictionEngine as any).calculateScenarios(baselinePrediction, 0.9);
      const lowConfidenceScenarios = (predictionEngine as any).calculateScenarios(baselinePrediction, 0.4);
      
      const highSpread = highConfidenceScenarios.pessimistic.getTime() - highConfidenceScenarios.optimistic.getTime();
      const lowSpread = lowConfidenceScenarios.pessimistic.getTime() - lowConfidenceScenarios.optimistic.getTime();
      
      expect(lowSpread).toBeGreaterThan(highSpread); // Lower confidence = wider spread
    });
  });

  describe('Prediction Factors', () => {
    it('should generate factors for high-performing teams', () => {
      const features = {
        teamVelocity: 35, // High velocity
        codeComplexity: 8, // Low complexity
        testCoverage: 85, // High coverage
        teamExperience: 6, // Experienced
        teamSize: 5,
        historicalLeadTime: 48,
        changeFailureRate: 5,
        deploymentFrequency: 2,
        technicalDebtRatio: 10
      };
      
      const factors = (predictionEngine as any).generatePredictionFactors(features, mockProjectData);
      
      const positiveFactors = factors.filter((f: any) => f.impact > 0);
      expect(positiveFactors.length).toBeGreaterThan(0);
    });

    it('should generate factors for challenging projects', () => {
      const challengingProject = {
        ...mockProjectData,
        codebase: {
          ...mockProjectData.codebase,
          complexity: 25, // Very high complexity
          testCoverage: 40 // Low coverage
        }
      };
      
      const features = {
        teamVelocity: 15, // Low velocity
        codeComplexity: 25,
        testCoverage: 40,
        teamExperience: 2, // Inexperienced
        teamSize: 3, // Small team
        historicalLeadTime: 120,
        changeFailureRate: 25,
        deploymentFrequency: 0.5,
        technicalDebtRatio: 40
      };
      
      const factors = (predictionEngine as any).generatePredictionFactors(features, challengingProject);
      
      const negativeFactors = factors.filter((f: any) => f.impact < 0);
      expect(negativeFactors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      vi.spyOn(predictionEngine as any, 'getHistoricalProjectData').mockRejectedValue(
        new Error('Database connection timeout')
      );
      
      await expect(
        predictionEngine.predictProjectTimeline('test-project-123' as UUID)
      ).rejects.toThrow('Database connection timeout');
    });

    it('should handle invalid project data', async () => {
      vi.spyOn(predictionEngine as any, 'getCurrentProjectData').mockResolvedValue(null);
      
      await expect(
        predictionEngine.predictProjectTimeline('invalid-project' as UUID)
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should complete predictions within reasonable time', async () => {
      const startTime = Date.now();
      
      await predictionEngine.predictProjectTimeline('test-project-123' as UUID);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle multiple concurrent predictions', async () => {
      const projectIds = ['proj1', 'proj2', 'proj3', 'proj4', 'proj5'] as UUID[];
      
      const startTime = Date.now();
      
      const predictions = await Promise.all(
        projectIds.map(id => predictionEngine.predictProjectTimeline(id))
      );
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(predictions).toHaveLength(5);
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      predictions.forEach(prediction => {
        expect(prediction).toBeDefined();
        expect(prediction.estimatedCompletionDate).toBeInstanceOf(Date);
      });
    });
  });
});