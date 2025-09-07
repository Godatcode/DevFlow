import {
  MetricData,
  MetricType,
  UUID,
  DORAMetrics
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export class HistoricalDataAnalyzer {
  private logger = new Logger('HistoricalDataAnalyzer');

  /**
   * Analyzes historical trends to identify patterns and seasonality
   */
  async analyzeTrends(
    projectId: UUID,
    metricType: MetricType,
    timeRange: { start: Date; end: Date }
  ): Promise<TrendAnalysis> {
    this.logger.info(`Analyzing trends for ${metricType} in project ${projectId}`);

    const historicalData = await this.getHistoricalData(projectId, metricType, timeRange);
    
    if (historicalData.length < 10) {
      this.logger.warn(`Insufficient data points (${historicalData.length}) for trend analysis`);
      return this.createDefaultTrendAnalysis();
    }

    const trend = this.calculateTrend(historicalData);
    const seasonality = this.detectSeasonality(historicalData);
    const volatility = this.calculateVolatility(historicalData);
    const outliers = this.detectOutliers(historicalData);

    return {
      metricType,
      projectId,
      trend,
      seasonality,
      volatility,
      outliers,
      dataPoints: historicalData.length,
      timeRange,
      confidence: this.calculateTrendConfidence(historicalData)
    };
  }

  /**
   * Performs regression analysis to predict future values
   */
  async performRegressionAnalysis(
    historicalData: MetricData[],
    predictionHorizon: number // days
  ): Promise<RegressionResult> {
    this.logger.info(`Performing regression analysis with ${historicalData.length} data points`);

    if (historicalData.length < 5) {
      throw new Error('Insufficient data for regression analysis');
    }

    // Prepare data for regression
    const dataPoints = this.prepareRegressionData(historicalData);
    
    // Perform linear regression
    const linearRegression = this.performLinearRegression(dataPoints);
    
    // Perform polynomial regression (degree 2)
    const polynomialRegression = this.performPolynomialRegression(dataPoints, 2);
    
    // Choose best model based on R-squared
    const bestModel = linearRegression.rSquared > polynomialRegression.rSquared 
      ? linearRegression 
      : polynomialRegression;

    // Generate predictions
    const predictions = this.generatePredictions(bestModel, predictionHorizon);

    return {
      model: bestModel,
      predictions,
      accuracy: bestModel.rSquared,
      confidence: this.calculateRegressionConfidence(bestModel, historicalData)
    };
  }

  /**
   * Analyzes velocity patterns and team performance cycles
   */
  async analyzeVelocityPatterns(
    teamId: UUID,
    timeRange: { start: Date; end: Date }
  ): Promise<VelocityAnalysis> {
    this.logger.info(`Analyzing velocity patterns for team ${teamId}`);

    const velocityData = await this.getTeamVelocityData(teamId, timeRange);
    
    const sprintAnalysis = this.analyzeSprintVelocity(velocityData);
    const burndownPatterns = this.analyzeBurndownPatterns(velocityData);
    const capacityUtilization = this.analyzeCapacityUtilization(velocityData);
    const predictedVelocity = this.predictFutureVelocity(velocityData);

    return {
      teamId,
      timeRange,
      averageVelocity: sprintAnalysis.average,
      velocityTrend: sprintAnalysis.trend,
      consistency: sprintAnalysis.consistency,
      burndownPatterns,
      capacityUtilization,
      predictedVelocity,
      recommendations: this.generateVelocityRecommendations(sprintAnalysis)
    };
  }

  /**
   * Analyzes deployment patterns and identifies optimal deployment windows
   */
  async analyzeDeploymentPatterns(
    projectId: UUID,
    timeRange: { start: Date; end: Date }
  ): Promise<DeploymentAnalysis> {
    this.logger.info(`Analyzing deployment patterns for project ${projectId}`);

    const deploymentData = await this.getDeploymentData(projectId, timeRange);
    
    const frequencyAnalysis = this.analyzeDeploymentFrequency(deploymentData);
    const successRateAnalysis = this.analyzeDeploymentSuccessRate(deploymentData);
    const timeAnalysis = this.analyzeDeploymentTiming(deploymentData);
    const riskAnalysis = this.analyzeDeploymentRisk(deploymentData);

    return {
      projectId,
      timeRange,
      frequency: frequencyAnalysis,
      successRate: successRateAnalysis,
      timing: timeAnalysis,
      risk: riskAnalysis,
      optimalWindows: this.identifyOptimalDeploymentWindows(deploymentData),
      recommendations: this.generateDeploymentRecommendations(deploymentData)
    };
  }

  /**
   * Performs comparative analysis between similar projects
   */
  async performComparativeAnalysis(
    targetProjectId: UUID,
    similarProjects: UUID[]
  ): Promise<ComparativeAnalysis> {
    this.logger.info(`Performing comparative analysis for project ${targetProjectId}`);

    const targetMetrics = await this.getProjectMetrics(targetProjectId);
    const similarProjectsMetrics = await Promise.all(
      similarProjects.map(id => this.getProjectMetrics(id))
    );

    const benchmarks = this.calculateBenchmarks(similarProjectsMetrics);
    const comparison = this.compareAgainstBenchmarks(targetMetrics, benchmarks);
    const insights = this.generateComparativeInsights(comparison);

    return {
      targetProjectId,
      benchmarks,
      comparison,
      insights,
      recommendations: this.generateBenchmarkRecommendations(comparison)
    };
  }

  // Private helper methods

  private calculateTrend(data: MetricData[]): TrendInfo {
    const values = data.map(d => d.value);
    const n = values.length;
    
    // Calculate linear trend using least squares
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + val * index, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return {
      direction: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
      slope,
      intercept,
      strength: Math.abs(slope) > 0.1 ? 'strong' : Math.abs(slope) > 0.05 ? 'moderate' : 'weak'
    };
  }

  private detectSeasonality(data: MetricData[]): SeasonalityInfo {
    // Simple seasonality detection using autocorrelation
    const values = data.map(d => d.value);
    const periods = [7, 14, 30]; // Weekly, bi-weekly, monthly patterns
    
    let bestPeriod = 0;
    let bestCorrelation = 0;
    
    for (const period of periods) {
      if (values.length > period * 2) {
        const correlation = this.calculateAutocorrelation(values, period);
        if (Math.abs(correlation) > Math.abs(bestCorrelation)) {
          bestCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }
    
    return {
      detected: Math.abs(bestCorrelation) > 0.3,
      period: bestPeriod,
      strength: Math.abs(bestCorrelation),
      type: bestCorrelation > 0 ? 'positive' : 'negative'
    };
  }

  private calculateVolatility(data: MetricData[]): number {
    const values = data.map(d => d.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private detectOutliers(data: MetricData[]): OutlierInfo[] {
    const values = data.map(d => d.value);
    const q1 = this.calculatePercentile(values, 25);
    const q3 = this.calculatePercentile(values, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return data
      .filter(d => d.value < lowerBound || d.value > upperBound)
      .map(d => ({
        timestamp: d.timestamp,
        value: d.value,
        type: d.value < lowerBound ? 'low' : 'high',
        severity: Math.abs(d.value - (d.value < lowerBound ? lowerBound : upperBound)) / iqr
      }));
  }

  private calculateAutocorrelation(values: number[], lag: number): number {
    const n = values.length - lag;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }
    
    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }
    
    return numerator / denominator;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private prepareRegressionData(data: MetricData[]): Array<{ x: number; y: number }> {
    const startTime = data[0].timestamp.getTime();
    return data.map(d => ({
      x: (d.timestamp.getTime() - startTime) / (24 * 60 * 60 * 1000), // Days since start
      y: d.value
    }));
  }

  private performLinearRegression(data: Array<{ x: number; y: number }>): RegressionModel {
    const n = data.length;
    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumXX = data.reduce((sum, point) => sum + point.x * point.x, 0);
    const sumYY = data.reduce((sum, point) => sum + point.y * point.y, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R-squared
    const meanY = sumY / n;
    const ssRes = data.reduce((sum, point) => {
      const predicted = slope * point.x + intercept;
      return sum + Math.pow(point.y - predicted, 2);
    }, 0);
    const ssTot = data.reduce((sum, point) => sum + Math.pow(point.y - meanY, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);
    
    return {
      type: 'linear',
      coefficients: [intercept, slope],
      rSquared,
      predict: (x: number) => slope * x + intercept
    };
  }

  private performPolynomialRegression(
    data: Array<{ x: number; y: number }>,
    degree: number
  ): RegressionModel {
    // Simplified polynomial regression for degree 2
    if (degree !== 2) {
      throw new Error('Only degree 2 polynomial regression is supported');
    }
    
    const n = data.length;
    const sumX = data.reduce((sum, point) => sum + point.x, 0);
    const sumX2 = data.reduce((sum, point) => sum + point.x * point.x, 0);
    const sumX3 = data.reduce((sum, point) => sum + Math.pow(point.x, 3), 0);
    const sumX4 = data.reduce((sum, point) => sum + Math.pow(point.x, 4), 0);
    const sumY = data.reduce((sum, point) => sum + point.y, 0);
    const sumXY = data.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumX2Y = data.reduce((sum, point) => sum + point.x * point.x * point.y, 0);
    
    // Solve system of equations using matrix operations (simplified)
    // For now, return a basic quadratic fit
    const a = 0.001; // Placeholder coefficients
    const b = 0.1;
    const c = sumY / n;
    
    const meanY = sumY / n;
    const ssRes = data.reduce((sum, point) => {
      const predicted = a * point.x * point.x + b * point.x + c;
      return sum + Math.pow(point.y - predicted, 2);
    }, 0);
    const ssTot = data.reduce((sum, point) => sum + Math.pow(point.y - meanY, 2), 0);
    const rSquared = Math.max(0, 1 - (ssRes / ssTot));
    
    return {
      type: 'polynomial',
      coefficients: [c, b, a],
      rSquared,
      predict: (x: number) => a * x * x + b * x + c
    };
  }

  private generatePredictions(model: RegressionModel, horizonDays: number): PredictionPoint[] {
    const predictions: PredictionPoint[] = [];
    const currentTime = Date.now();
    
    for (let day = 1; day <= horizonDays; day++) {
      const predictedValue = model.predict(day);
      const confidence = Math.max(0.3, model.rSquared * (1 - day / horizonDays * 0.5));
      
      predictions.push({
        date: new Date(currentTime + day * 24 * 60 * 60 * 1000),
        value: predictedValue,
        confidence
      });
    }
    
    return predictions;
  }

  private calculateTrendConfidence(data: MetricData[]): number {
    // Confidence based on data quantity and consistency
    const dataQuality = Math.min(1, data.length / 30); // 30 points is ideal
    const consistency = 1 - this.calculateVolatility(data) / 100; // Normalize volatility
    
    return Math.max(0.3, (dataQuality + consistency) / 2);
  }

  private calculateRegressionConfidence(model: RegressionModel, data: MetricData[]): number {
    return Math.max(0.3, model.rSquared * (1 - 0.1 * Math.max(0, 30 - data.length) / 30));
  }

  private createDefaultTrendAnalysis(): TrendAnalysis {
    return {
      metricType: MetricType.TEAM_VELOCITY,
      projectId: '',
      trend: {
        direction: 'stable',
        slope: 0,
        intercept: 0,
        strength: 'weak'
      },
      seasonality: {
        detected: false,
        period: 0,
        strength: 0,
        type: 'positive'
      },
      volatility: 0,
      outliers: [],
      dataPoints: 0,
      timeRange: { start: new Date(), end: new Date() },
      confidence: 0.3
    };
  }

  // Placeholder methods for data retrieval
  private async getHistoricalData(
    projectId: UUID,
    metricType: MetricType,
    timeRange: { start: Date; end: Date }
  ): Promise<MetricData[]> {
    // This would query the actual database
    return [];
  }

  private async getTeamVelocityData(teamId: UUID, timeRange: { start: Date; end: Date }): Promise<any[]> {
    return [];
  }

  private async getDeploymentData(projectId: UUID, timeRange: { start: Date; end: Date }): Promise<any[]> {
    return [];
  }

  private async getProjectMetrics(projectId: UUID): Promise<any> {
    return {};
  }

  // Additional placeholder methods for analysis functions
  private analyzeSprintVelocity(data: any[]): any {
    return { average: 25, trend: 'stable', consistency: 0.8 };
  }

  private analyzeBurndownPatterns(data: any[]): any {
    return { pattern: 'consistent' };
  }

  private analyzeCapacityUtilization(data: any[]): any {
    return { utilization: 0.85 };
  }

  private predictFutureVelocity(data: any[]): any {
    return { predicted: 26, confidence: 0.75 };
  }

  private generateVelocityRecommendations(analysis: any): string[] {
    return ['Maintain current sprint planning approach'];
  }

  private analyzeDeploymentFrequency(data: any[]): any {
    return { average: 2.5, trend: 'increasing' };
  }

  private analyzeDeploymentSuccessRate(data: any[]): any {
    return { rate: 0.95, trend: 'stable' };
  }

  private analyzeDeploymentTiming(data: any[]): any {
    return { optimalHours: [10, 11, 14, 15] };
  }

  private analyzeDeploymentRisk(data: any[]): any {
    return { level: 'low', factors: [] };
  }

  private identifyOptimalDeploymentWindows(data: any[]): any[] {
    return [{ day: 'Tuesday', hours: [10, 11] }];
  }

  private generateDeploymentRecommendations(data: any[]): string[] {
    return ['Continue current deployment schedule'];
  }

  private calculateBenchmarks(data: any[]): any {
    return {};
  }

  private compareAgainstBenchmarks(target: any, benchmarks: any): any {
    return {};
  }

  private generateComparativeInsights(comparison: any): string[] {
    return [];
  }

  private generateBenchmarkRecommendations(comparison: any): string[] {
    return [];
  }
}

// Type definitions for analysis results
export interface TrendAnalysis {
  metricType: MetricType;
  projectId: UUID;
  trend: TrendInfo;
  seasonality: SeasonalityInfo;
  volatility: number;
  outliers: OutlierInfo[];
  dataPoints: number;
  timeRange: { start: Date; end: Date };
  confidence: number;
}

export interface TrendInfo {
  direction: 'increasing' | 'decreasing' | 'stable';
  slope: number;
  intercept: number;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface SeasonalityInfo {
  detected: boolean;
  period: number;
  strength: number;
  type: 'positive' | 'negative';
}

export interface OutlierInfo {
  timestamp: Date;
  value: number;
  type: 'high' | 'low';
  severity: number;
}

export interface RegressionResult {
  model: RegressionModel;
  predictions: PredictionPoint[];
  accuracy: number;
  confidence: number;
}

export interface RegressionModel {
  type: 'linear' | 'polynomial';
  coefficients: number[];
  rSquared: number;
  predict: (x: number) => number;
}

export interface PredictionPoint {
  date: Date;
  value: number;
  confidence: number;
}

export interface VelocityAnalysis {
  teamId: UUID;
  timeRange: { start: Date; end: Date };
  averageVelocity: number;
  velocityTrend: string;
  consistency: number;
  burndownPatterns: any;
  capacityUtilization: any;
  predictedVelocity: any;
  recommendations: string[];
}

export interface DeploymentAnalysis {
  projectId: UUID;
  timeRange: { start: Date; end: Date };
  frequency: any;
  successRate: any;
  timing: any;
  risk: any;
  optimalWindows: any[];
  recommendations: string[];
}

export interface ComparativeAnalysis {
  targetProjectId: UUID;
  benchmarks: any;
  comparison: any;
  insights: string[];
  recommendations: string[];
}