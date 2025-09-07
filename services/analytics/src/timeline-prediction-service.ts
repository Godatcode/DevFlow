import {
  TimelinePrediction,
  ProjectData,
  UUID,
  MetricData
} from '@devflow/shared-types';
import { MLPredictionEngine } from './prediction-engine';
import { HistoricalDataAnalyzer } from './historical-data-analyzer';
import { PredictionValidator } from './prediction-validator';
import { Logger } from '@devflow/shared-utils';

/**
 * Main service that orchestrates timeline prediction functionality
 * Combines machine learning models, historical analysis, and validation
 */
export class TimelinePredictionService {
  private logger = new Logger('TimelinePredictionService');
  private predictionEngine: MLPredictionEngine;
  private historicalAnalyzer: HistoricalDataAnalyzer;
  private validator: PredictionValidator;

  constructor() {
    this.predictionEngine = new MLPredictionEngine();
    this.historicalAnalyzer = new HistoricalDataAnalyzer();
    this.validator = new PredictionValidator();
  }

  /**
   * Generate a comprehensive timeline prediction for a project
   */
  async predictProjectTimeline(projectId: UUID): Promise<TimelinePrediction> {
    this.logger.info(`Generating timeline prediction for project ${projectId}`);

    try {
      // Generate the core prediction using ML models
      const prediction = await this.predictionEngine.predictProjectTimeline(projectId);

      // Enhance prediction with historical analysis insights
      const enhancedPrediction = await this.enhancePredictionWithHistoricalInsights(
        prediction,
        projectId
      );

      this.logger.info(`Timeline prediction completed for project ${projectId}`);
      return enhancedPrediction;
    } catch (error) {
      this.logger.error(`Failed to predict timeline for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Validate a prediction against actual outcomes and improve the model
   */
  async validateAndImprove(
    predictionId: UUID,
    actualOutcome: any
  ): Promise<void> {
    this.logger.info(`Validating prediction ${predictionId}`);

    try {
      // Validate the prediction accuracy
      const validationResult = await this.validator.validatePredictionAccuracy(
        predictionId,
        actualOutcome
      );

      // If accuracy is below threshold, trigger model improvement
      if (validationResult.accuracy.overall < 70) {
        this.logger.warn(`Low prediction accuracy (${validationResult.accuracy.overall}%), triggering model improvement`);
        
        await this.triggerModelImprovement(validationResult);
      }

      this.logger.info(`Prediction validation completed for ${predictionId}`);
    } catch (error) {
      this.logger.error(`Failed to validate prediction ${predictionId}:`, error);
      throw error;
    }
  }

  /**
   * Get comprehensive analytics about prediction performance
   */
  async getPredictionAnalytics(
    timeRange: { start: Date; end: Date }
  ): Promise<PredictionAnalytics> {
    this.logger.info('Generating prediction analytics');

    try {
      // Get performance analysis from validator
      const performanceAnalysis = await this.validator.analyzePredictionPerformance(timeRange);

      // Get quality monitoring results
      const qualityMonitoring = await this.validator.monitorPredictionQuality();

      // Combine into comprehensive analytics
      const analytics: PredictionAnalytics = {
        timeRange,
        performance: performanceAnalysis,
        quality: qualityMonitoring,
        summary: {
          totalPredictions: performanceAnalysis.totalPredictions,
          averageAccuracy: this.calculateAverageAccuracy(performanceAnalysis),
          improvementTrend: this.calculateImprovementTrend(performanceAnalysis),
          healthStatus: qualityMonitoring.overallHealth
        }
      };

      this.logger.info('Prediction analytics generated successfully');
      return analytics;
    } catch (error) {
      this.logger.error('Failed to generate prediction analytics:', error);
      throw error;
    }
  }

  /**
   * Analyze historical trends for better predictions
   */
  async analyzeHistoricalTrends(
    projectId: UUID,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    this.logger.info(`Analyzing historical trends for project ${projectId}`);

    try {
      // Analyze velocity trends
      const velocityAnalysis = await this.historicalAnalyzer.analyzeVelocityPatterns(
        projectId, // Using projectId as teamId for simplicity
        timeRange
      );

      // Analyze deployment patterns
      const deploymentAnalysis = await this.historicalAnalyzer.analyzeDeploymentPatterns(
        projectId,
        timeRange
      );

      return {
        velocity: velocityAnalysis,
        deployment: deploymentAnalysis,
        insights: this.generateHistoricalInsights(velocityAnalysis, deploymentAnalysis)
      };
    } catch (error) {
      this.logger.error(`Failed to analyze historical trends for project ${projectId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  private async enhancePredictionWithHistoricalInsights(
    prediction: TimelinePrediction,
    projectId: UUID
  ): Promise<TimelinePrediction> {
    try {
      // Get recent historical trends
      const recentTimeRange = {
        start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        end: new Date()
      };

      const historicalTrends = await this.analyzeHistoricalTrends(projectId, recentTimeRange);

      // Adjust prediction based on historical insights
      const adjustedPrediction = this.adjustPredictionWithTrends(prediction, historicalTrends);

      return adjustedPrediction;
    } catch (error) {
      this.logger.warn('Failed to enhance prediction with historical insights, using base prediction:', error);
      return prediction;
    }
  }

  private adjustPredictionWithTrends(
    prediction: TimelinePrediction,
    trends: any
  ): TimelinePrediction {
    // Simple adjustment based on velocity trends
    let adjustmentFactor = 1.0;

    if (trends.velocity?.velocityTrend === 'increasing') {
      adjustmentFactor = 0.9; // 10% faster
    } else if (trends.velocity?.velocityTrend === 'decreasing') {
      adjustmentFactor = 1.1; // 10% slower
    }

    // Apply adjustment to all scenarios
    const adjustedPrediction = {
      ...prediction,
      estimatedCompletionDate: new Date(
        prediction.estimatedCompletionDate.getTime() * adjustmentFactor
      ),
      scenarios: {
        optimistic: new Date(prediction.scenarios.optimistic.getTime() * adjustmentFactor),
        realistic: new Date(prediction.scenarios.realistic.getTime() * adjustmentFactor),
        pessimistic: new Date(prediction.scenarios.pessimistic.getTime() * adjustmentFactor)
      },
      factors: [
        ...prediction.factors,
        {
          name: 'Historical Trend Adjustment',
          impact: (adjustmentFactor - 1) * 0.5,
          description: `Adjusted based on recent velocity trend: ${trends.velocity?.velocityTrend || 'stable'}`
        }
      ]
    };

    return adjustedPrediction;
  }

  private async triggerModelImprovement(validationResult: any): Promise<void> {
    try {
      // Determine improvement strategy based on error analysis
      const strategy = this.determineImprovementStrategy(validationResult.errorAnalysis);

      // Trigger model improvement
      await this.validator.improveModel('current', strategy);

      this.logger.info(`Model improvement triggered with strategy: ${strategy.type}`);
    } catch (error) {
      this.logger.error('Failed to trigger model improvement:', error);
    }
  }

  private determineImprovementStrategy(errorAnalysis: any): any {
    // Simple strategy selection based on error patterns
    if (errorAnalysis.contributingFactors?.some((f: any) => f.type === 'scope_change')) {
      return {
        type: 'feature_engineering',
        parameters: { newFeatures: ['scope_volatility', 'change_frequency'] },
        expectedImprovement: 0.05
      };
    }

    if (errorAnalysis.severity === 'critical') {
      return {
        type: 'ensemble_methods',
        parameters: { models: ['random_forest', 'gradient_boosting', 'neural_network'] },
        expectedImprovement: 0.08
      };
    }

    return {
      type: 'hyperparameter_tuning',
      parameters: { learningRate: 0.01, regularization: 0.1 },
      expectedImprovement: 0.03
    };
  }

  private calculateAverageAccuracy(performanceAnalysis: any): number {
    // Placeholder calculation
    return 75.5;
  }

  private calculateImprovementTrend(performanceAnalysis: any): 'improving' | 'stable' | 'declining' {
    // Placeholder calculation
    return 'improving';
  }

  private generateHistoricalInsights(velocityAnalysis: any, deploymentAnalysis: any): string[] {
    const insights: string[] = [];

    if (velocityAnalysis.velocityTrend === 'increasing') {
      insights.push('Team velocity is trending upward, suggesting improved efficiency');
    }

    if (deploymentAnalysis.frequency?.trend === 'increasing') {
      insights.push('Deployment frequency is increasing, indicating better CI/CD maturity');
    }

    if (velocityAnalysis.consistency > 0.8) {
      insights.push('Team shows high velocity consistency, making predictions more reliable');
    }

    return insights;
  }
}

// Type definitions
export interface PredictionAnalytics {
  timeRange: { start: Date; end: Date };
  performance: any;
  quality: any;
  summary: {
    totalPredictions: number;
    averageAccuracy: number;
    improvementTrend: 'improving' | 'stable' | 'declining';
    healthStatus: 'healthy' | 'warning' | 'critical';
  };
}