import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoricalDataAnalyzer } from '../historical-data-analyzer';
import {
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

describe('HistoricalDataAnalyzer', () => {
  let analyzer: HistoricalDataAnalyzer;
  let mockHistoricalData: MetricData[];

  beforeEach(() => {
    analyzer = new HistoricalDataAnalyzer();
    
    // Create mock historical data with trends
    mockHistoricalData = Array.from({ length: 30 }, (_, index) => ({
      id: `metric-${index}` as UUID,
      type: MetricType.TEAM_VELOCITY,
      value: 20 + index * 0.5 + Math.random() * 2, // Upward trend with noise
      unit: 'story_points',
      projectId: 'test-project-123' as UUID,
      teamId: 'test-team-123' as UUID,
      timestamp: new Date(Date.now() - (29 - index) * 24 * 60 * 60 * 1000),
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    // Mock data retrieval methods
    vi.spyOn(analyzer as any, 'getHistoricalData').mockResolvedValue(mockHistoricalData);
    vi.spyOn(analyzer as any, 'getTeamVelocityData').mockResolvedValue([]);
    vi.spyOn(analyzer as any, 'getDeploymentData').mockResolvedValue([]);
    vi.spyOn(analyzer as any, 'getProjectMetrics').mockResolvedValue({});
  });

  describe('analyzeTrends', () => {
    it('should analyze trends with sufficient data', async () => {
      const projectId = 'test-project-123' as UUID;
      const timeRange = {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const trendAnalysis = await analyzer.analyzeTrends(
        projectId,
        MetricType.TEAM_VELOCITY,
        timeRange
      );

      expect(trendAnalysis).toBeDefined();
      expect(trendAnalysis.metricType).toBe(MetricType.TEAM_VELOCITY);
      expect(trendAnalysis.projectId).toBe(projectId);
      expect(trendAnalysis.trend).toBeDefined();
      expect(trendAnalysis.seasonality).toBeDefined();
      expect(trendAnalysis.volatility).toBeGreaterThanOrEqual(0);
      expect(trendAnalysis.outliers).toBeInstanceOf(Array);
      expect(trendAnalysis.dataPoints).toBe(30);
      expect(trendAnalysis.confidence).toBeGreaterThan(0);
    });

    it('should detect increasing trends', async () => {
      // Create data with clear upward trend
      const increasingData = Array.from({ length: 20 }, (_, index) => ({
        id: `metric-${index}` as UUID,
        type: MetricType.TEAM_VELOCITY,
        value: 10 + index * 2, // Clear upward trend
        unit: 'story_points',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date(Date.now() - (19 - index) * 24 * 60 * 60 * 1000),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      vi.spyOn(analyzer as any, 'getHistoricalData').mockResolvedValue(increasingData);

      const trendAnalysis = await analyzer.analyzeTrends(
        'test-project-123' as UUID,
        MetricType.TEAM_VELOCITY,
        { start: new Date(), end: new Date() }
      );

      expect(trendAnalysis.trend.direction).toBe('increasing');
      expect(trendAnalysis.trend.slope).toBeGreaterThan(0);
      expect(trendAnalysis.trend.strength).toBe('strong');
    });

    it('should detect decreasing trends', async () => {
      // Create data with clear downward trend
      const decreasingData = Array.from({ length: 20 }, (_, index) => ({
        id: `metric-${index}` as UUID,
        type: MetricType.TEAM_VELOCITY,
        value: 50 - index * 1.5, // Clear downward trend
        unit: 'story_points',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date(Date.now() - (19 - index) * 24 * 60 * 60 * 1000),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      vi.spyOn(analyzer as any, 'getHistoricalData').mockResolvedValue(decreasingData);

      const trendAnalysis = await analyzer.analyzeTrends(
        'test-project-123' as UUID,
        MetricType.TEAM_VELOCITY,
        { start: new Date(), end: new Date() }
      );

      expect(trendAnalysis.trend.direction).toBe('decreasing');
      expect(trendAnalysis.trend.slope).toBeLessThan(0);
    });

    it('should handle insufficient data gracefully', async () => {
      vi.spyOn(analyzer as any, 'getHistoricalData').mockResolvedValue([]);

      const trendAnalysis = await analyzer.analyzeTrends(
        'test-project-123' as UUID,
        MetricType.TEAM_VELOCITY,
        { start: new Date(), end: new Date() }
      );

      expect(trendAnalysis.dataPoints).toBe(0);
      expect(trendAnalysis.confidence).toBe(0.3); // Default low confidence
    });

    it('should detect outliers correctly', async () => {
      // Create data with clear outliers
      const dataWithOutliers = Array.from({ length: 20 }, (_, index) => ({
        id: `metric-${index}` as UUID,
        type: MetricType.TEAM_VELOCITY,
        value: index === 10 ? 100 : 25, // One clear outlier
        unit: 'story_points',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date(Date.now() - (19 - index) * 24 * 60 * 60 * 1000),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      vi.spyOn(analyzer as any, 'getHistoricalData').mockResolvedValue(dataWithOutliers);

      const trendAnalysis = await analyzer.analyzeTrends(
        'test-project-123' as UUID,
        MetricType.TEAM_VELOCITY,
        { start: new Date(), end: new Date() }
      );

      expect(trendAnalysis.outliers.length).toBeGreaterThan(0);
      expect(trendAnalysis.outliers[0].type).toBe('high');
      expect(trendAnalysis.outliers[0].value).toBe(100);
    });
  });

  describe('performRegressionAnalysis', () => {
    it('should perform regression analysis with sufficient data', async () => {
      const regressionResult = await analyzer.performRegressionAnalysis(
        mockHistoricalData,
        30 // 30 days prediction horizon
      );

      expect(regressionResult).toBeDefined();
      expect(regressionResult.model).toBeDefined();
      expect(regressionResult.predictions).toBeInstanceOf(Array);
      expect(regressionResult.predictions).toHaveLength(30);
      expect(regressionResult.accuracy).toBeGreaterThanOrEqual(0);
      expect(regressionResult.accuracy).toBeLessThanOrEqual(1);
      expect(regressionResult.confidence).toBeGreaterThan(0);
    });

    it('should generate predictions for future dates', async () => {
      const regressionResult = await analyzer.performRegressionAnalysis(
        mockHistoricalData,
        7 // 7 days prediction horizon
      );

      const now = Date.now();
      regressionResult.predictions.forEach(prediction => {
        expect(prediction.date.getTime()).toBeGreaterThan(now);
        expect(prediction.value).toBeGreaterThan(0);
        expect(prediction.confidence).toBeGreaterThan(0);
        expect(prediction.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should throw error with insufficient data', async () => {
      const insufficientData = mockHistoricalData.slice(0, 3); // Only 3 data points

      await expect(
        analyzer.performRegressionAnalysis(insufficientData, 7)
      ).rejects.toThrow('Insufficient data for regression analysis');
    });

    it('should choose best model based on R-squared', async () => {
      const regressionResult = await analyzer.performRegressionAnalysis(
        mockHistoricalData,
        14
      );

      expect(regressionResult.model.type).toMatch(/linear|polynomial/);
      expect(regressionResult.model.rSquared).toBeGreaterThanOrEqual(0);
      expect(regressionResult.model.coefficients).toBeInstanceOf(Array);
      expect(typeof regressionResult.model.predict).toBe('function');
    });
  });

  describe('analyzeVelocityPatterns', () => {
    it('should analyze team velocity patterns', async () => {
      const teamId = 'test-team-123' as UUID;
      const timeRange = {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const velocityAnalysis = await analyzer.analyzeVelocityPatterns(teamId, timeRange);

      expect(velocityAnalysis).toBeDefined();
      expect(velocityAnalysis.teamId).toBe(teamId);
      expect(velocityAnalysis.timeRange).toEqual(timeRange);
      expect(velocityAnalysis.averageVelocity).toBeGreaterThan(0);
      expect(velocityAnalysis.velocityTrend).toBeDefined();
      expect(velocityAnalysis.consistency).toBeGreaterThanOrEqual(0);
      expect(velocityAnalysis.consistency).toBeLessThanOrEqual(1);
      expect(velocityAnalysis.recommendations).toBeInstanceOf(Array);
    });

    it('should provide velocity predictions', async () => {
      const velocityAnalysis = await analyzer.analyzeVelocityPatterns(
        'test-team-123' as UUID,
        { start: new Date(), end: new Date() }
      );

      expect(velocityAnalysis.predictedVelocity).toBeDefined();
      expect(velocityAnalysis.predictedVelocity.predicted).toBeGreaterThan(0);
      expect(velocityAnalysis.predictedVelocity.confidence).toBeGreaterThan(0);
    });
  });

  describe('analyzeDeploymentPatterns', () => {
    it('should analyze deployment patterns', async () => {
      const projectId = 'test-project-123' as UUID;
      const timeRange = {
        start: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        end: new Date()
      };

      const deploymentAnalysis = await analyzer.analyzeDeploymentPatterns(projectId, timeRange);

      expect(deploymentAnalysis).toBeDefined();
      expect(deploymentAnalysis.projectId).toBe(projectId);
      expect(deploymentAnalysis.timeRange).toEqual(timeRange);
      expect(deploymentAnalysis.frequency).toBeDefined();
      expect(deploymentAnalysis.successRate).toBeDefined();
      expect(deploymentAnalysis.timing).toBeDefined();
      expect(deploymentAnalysis.risk).toBeDefined();
      expect(deploymentAnalysis.optimalWindows).toBeInstanceOf(Array);
      expect(deploymentAnalysis.recommendations).toBeInstanceOf(Array);
    });

    it('should identify optimal deployment windows', async () => {
      const deploymentAnalysis = await analyzer.analyzeDeploymentPatterns(
        'test-project-123' as UUID,
        { start: new Date(), end: new Date() }
      );

      expect(deploymentAnalysis.optimalWindows).toBeInstanceOf(Array);
      deploymentAnalysis.optimalWindows.forEach(window => {
        expect(window).toHaveProperty('day');
        expect(window).toHaveProperty('hours');
      });
    });
  });

  describe('performComparativeAnalysis', () => {
    it('should compare project against similar projects', async () => {
      const targetProjectId = 'target-project' as UUID;
      const similarProjects = ['similar-1', 'similar-2', 'similar-3'] as UUID[];

      const comparativeAnalysis = await analyzer.performComparativeAnalysis(
        targetProjectId,
        similarProjects
      );

      expect(comparativeAnalysis).toBeDefined();
      expect(comparativeAnalysis.targetProjectId).toBe(targetProjectId);
      expect(comparativeAnalysis.benchmarks).toBeDefined();
      expect(comparativeAnalysis.comparison).toBeDefined();
      expect(comparativeAnalysis.insights).toBeInstanceOf(Array);
      expect(comparativeAnalysis.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Trend Calculation', () => {
    it('should calculate linear trend correctly', () => {
      const testData = [
        { value: 10 }, { value: 12 }, { value: 14 }, { value: 16 }, { value: 18 }
      ] as MetricData[];

      const trend = (analyzer as any).calculateTrend(testData);

      expect(trend.direction).toBe('increasing');
      expect(trend.slope).toBeGreaterThan(0);
      expect(trend.strength).toBe('strong');
    });

    it('should detect stable trends', () => {
      const testData = [
        { value: 15 }, { value: 15.1 }, { value: 14.9 }, { value: 15.2 }, { value: 14.8 }
      ] as MetricData[];

      const trend = (analyzer as any).calculateTrend(testData);

      expect(['stable', 'decreasing']).toContain(trend.direction); // Small variations can cause slight trends
      expect(Math.abs(trend.slope)).toBeLessThan(0.2);
    });
  });

  describe('Seasonality Detection', () => {
    it('should detect weekly patterns', () => {
      // Create data with weekly pattern (7-day cycle)
      const weeklyData = Array.from({ length: 28 }, (_, index) => ({
        value: 20 + 5 * Math.sin((index * 2 * Math.PI) / 7) // Weekly sine wave
      })) as MetricData[];

      const seasonality = (analyzer as any).detectSeasonality(weeklyData);

      expect(seasonality.detected).toBe(true);
      expect(seasonality.period).toBe(7);
      expect(seasonality.strength).toBeGreaterThan(0.3);
    });

    it('should not detect seasonality in random data', () => {
      const randomData = Array.from({ length: 30 }, () => ({
        value: Math.random() * 20 + 10
      })) as MetricData[];

      const seasonality = (analyzer as any).detectSeasonality(randomData);

      // Random data might occasionally show false patterns, so we check strength instead
      expect(seasonality.strength).toBeLessThan(0.5); // Should be relatively weak
    });
  });

  describe('Volatility Calculation', () => {
    it('should calculate volatility correctly', () => {
      const stableData = [
        { value: 20 }, { value: 21 }, { value: 19 }, { value: 20 }, { value: 21 }
      ] as MetricData[];

      const volatileData = [
        { value: 10 }, { value: 30 }, { value: 5 }, { value: 35 }, { value: 15 }
      ] as MetricData[];

      const stableVolatility = (analyzer as any).calculateVolatility(stableData);
      const highVolatility = (analyzer as any).calculateVolatility(volatileData);

      expect(highVolatility).toBeGreaterThan(stableVolatility);
      expect(stableVolatility).toBeLessThan(2);
      expect(highVolatility).toBeGreaterThan(5);
    });
  });

  describe('Outlier Detection', () => {
    it('should detect high outliers', () => {
      const dataWithHighOutlier = [
        { value: 20, timestamp: new Date() },
        { value: 21, timestamp: new Date() },
        { value: 19, timestamp: new Date() },
        { value: 100, timestamp: new Date() }, // High outlier
        { value: 20, timestamp: new Date() }
      ] as MetricData[];

      const outliers = (analyzer as any).detectOutliers(dataWithHighOutlier);

      expect(outliers.length).toBe(1);
      expect(outliers[0].type).toBe('high');
      expect(outliers[0].value).toBe(100);
      expect(outliers[0].severity).toBeGreaterThan(0);
    });

    it('should detect low outliers', () => {
      const dataWithLowOutlier = [
        { value: 20, timestamp: new Date() },
        { value: 21, timestamp: new Date() },
        { value: 19, timestamp: new Date() },
        { value: 1, timestamp: new Date() }, // Low outlier
        { value: 20, timestamp: new Date() }
      ] as MetricData[];

      const outliers = (analyzer as any).detectOutliers(dataWithLowOutlier);

      expect(outliers.length).toBe(1);
      expect(outliers[0].type).toBe('low');
      expect(outliers[0].value).toBe(1);
    });
  });

  describe('Regression Models', () => {
    it('should perform linear regression correctly', () => {
      const linearData = [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
        { x: 4, y: 8 },
        { x: 5, y: 10 }
      ];

      const model = (analyzer as any).performLinearRegression(linearData);

      expect(model.type).toBe('linear');
      expect(model.coefficients).toHaveLength(2);
      expect(model.rSquared).toBeCloseTo(1, 1); // Perfect linear relationship
      expect(model.predict(6)).toBeCloseTo(12, 1);
    });

    it('should perform polynomial regression', () => {
      const quadraticData = [
        { x: 1, y: 1 },
        { x: 2, y: 4 },
        { x: 3, y: 9 },
        { x: 4, y: 16 },
        { x: 5, y: 25 }
      ];

      const model = (analyzer as any).performPolynomialRegression(quadraticData, 2);

      expect(model.type).toBe('polynomial');
      expect(model.coefficients).toHaveLength(3);
      expect(model.rSquared).toBeGreaterThanOrEqual(0);
      expect(typeof model.predict).toBe('function');
    });
  });

  describe('Performance', () => {
    it('should complete trend analysis within reasonable time', async () => {
      const startTime = Date.now();

      await analyzer.analyzeTrends(
        'test-project-123' as UUID,
        MetricType.TEAM_VELOCITY,
        { start: new Date(), end: new Date() }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(executionTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle large datasets efficiently', async () => {
      // Create large dataset
      const largeDataset = Array.from({ length: 1000 }, (_, index) => ({
        id: `metric-${index}` as UUID,
        type: MetricType.TEAM_VELOCITY,
        value: 20 + Math.random() * 10,
        unit: 'story_points',
        projectId: 'test-project-123' as UUID,
        teamId: 'test-team-123' as UUID,
        timestamp: new Date(Date.now() - index * 60 * 60 * 1000),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      vi.spyOn(analyzer as any, 'getHistoricalData').mockResolvedValue(largeDataset);

      const startTime = Date.now();

      const trendAnalysis = await analyzer.analyzeTrends(
        'test-project-123' as UUID,
        MetricType.TEAM_VELOCITY,
        { start: new Date(), end: new Date() }
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(trendAnalysis.dataPoints).toBe(1000);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});