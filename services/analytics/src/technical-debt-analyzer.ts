import { 
  TechnicalDebtAnalysis, 
  TechnicalDebtRecommendation, 
  CodebaseData, 
  UUID 
} from '@devflow/shared-types';
import { TechnicalDebtAnalyzer, DebtTrend } from './interfaces';
import { Logger } from '@devflow/shared-utils';

const logger = new Logger('TechnicalDebtAnalyzer');

export interface CodeQualityMetrics {
  cyclomaticComplexity: number;
  codeSmells: number;
  duplicatedLines: number;
  maintainabilityIndex: number;
  testCoverage: number;
  technicalDebtRatio: number;
}

export interface DebtItem {
  type: 'code_smell' | 'bug' | 'vulnerability' | 'duplication' | 'complexity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line: number;
  description: string;
  estimatedEffort: number; // hours
  tags: string[];
}

export class TechnicalDebtAnalyzerService implements TechnicalDebtAnalyzer {
  private readonly DEBT_RATIO_THRESHOLDS = {
    LOW: 0.05,
    MEDIUM: 0.15,
    HIGH: 0.30,
    CRITICAL: 0.50
  };

  private readonly COMPLEXITY_THRESHOLDS = {
    LOW: 10,
    MEDIUM: 20,
    HIGH: 30,
    CRITICAL: 50
  };

  async analyzeCodebase(projectId: UUID): Promise<TechnicalDebtAnalysis> {
    try {
      logger.info('Starting technical debt analysis', { projectId });

      // Collect code quality metrics
      const qualityMetrics = await this.collectCodeQualityMetrics(projectId);
      
      // Identify debt items
      const debtItems = await this.identifyDebtItems(projectId);
      
      // Calculate total debt
      const totalDebtHours = this.calculateTotalDebt(debtItems);
      
      // Calculate debt ratio
      const debtRatio = this.calculateDebtRatio(qualityMetrics);
      
      // Count critical issues
      const criticalIssues = debtItems.filter(item => item.severity === 'critical').length;
      
      // Generate recommendations
      const analysis: TechnicalDebtAnalysis = {
        totalDebtHours: debtItems.reduce((sum, item) => sum + item.estimatedEffort, 0),
        debtRatio: qualityMetrics.technicalDebtRatio * 100,
        criticalIssues: debtItems.filter(item => item.severity === 'critical').length,
        recommendations: [], // Will be filled below
        trends: {
          lastMonth: 0,
          lastQuarter: 0
        }
      };
      
      const recommendationStrings = await this.generateRecommendations(analysis);
      analysis.recommendations = recommendationStrings.map(rec => ({
        type: 'general',
        description: rec,
        estimatedEffort: 8,
        priority: 'medium' as const,
        impact: 'Improves code quality'
      }));
      
      // Get trends
      const trends = await this.getDebtTrends(projectId);
      analysis.trends = {
        lastMonth: trends.lastMonth,
          lastQuarter: trends.lastQuarter
        };

      logger.info('Technical debt analysis completed', { 
        projectId, 
        totalDebtHours: analysis.totalDebtHours, 
        debtRatio: analysis.debtRatio, 
        criticalIssues: analysis.criticalIssues 
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze technical debt', { projectId, error });
      throw new Error(`Technical debt analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async trackDebtTrends(projectId: UUID, period: number): Promise<DebtTrend[]> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (period * 24 * 60 * 60 * 1000));
      
      // Get historical debt data points
      const trends: DebtTrend[] = [];
      const daysToAnalyze = Math.min(period, 90); // Limit to 90 days for performance
      
      for (let i = 0; i < daysToAnalyze; i += 7) { // Weekly data points
        const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
        const snapshot = await this.getDebtSnapshot(projectId, date);
        trends.push(snapshot);
      }

      return trends.sort((a, b) => a.date.getTime() - b.date.getTime());
    } catch (error) {
      logger.error('Failed to track debt trends', { projectId, period, error });
      throw new Error(`Debt trend tracking failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateRecommendations(analysis: TechnicalDebtAnalysis): Promise<string[]> {
    // Extract data from analysis
    const debtItems: DebtItem[] = []; // Would be extracted from analysis
    const qualityMetrics: CodeQualityMetrics = {
      cyclomaticComplexity: analysis.totalDebtHours / 10, // Rough conversion
      codeSmells: analysis.criticalIssues,
      duplicatedLines: 0,
      testCoverage: 80, // Default value
      maintainabilityIndex: 70, // Default value
      technicalDebtRatio: analysis.debtRatio / 100 // Convert percentage to ratio
    };
    const recommendations: TechnicalDebtRecommendation[] = [];

    // High complexity recommendation
    if (qualityMetrics.cyclomaticComplexity > this.COMPLEXITY_THRESHOLDS.HIGH) {
      recommendations.push({
        type: 'complexity_reduction',
        description: 'Refactor complex methods to improve maintainability',
        estimatedEffort: Math.ceil(qualityMetrics.cyclomaticComplexity / 10) * 4,
        priority: qualityMetrics.cyclomaticComplexity > this.COMPLEXITY_THRESHOLDS.CRITICAL ? 'critical' : 'high',
        impact: 'Reduces maintenance cost and improves code readability'
      });
    }

    // Test coverage recommendation
    if (qualityMetrics.testCoverage < 80) {
      recommendations.push({
        type: 'test_coverage',
        description: 'Increase test coverage to improve code reliability',
        estimatedEffort: Math.ceil((80 - qualityMetrics.testCoverage) * 0.5),
        priority: qualityMetrics.testCoverage < 50 ? 'high' : 'medium',
        impact: 'Reduces bugs and improves confidence in deployments'
      });
    }

    // Code duplication recommendation
    if (qualityMetrics.duplicatedLines > 1000) {
      recommendations.push({
        type: 'duplication_removal',
        description: 'Remove code duplication to improve maintainability',
        estimatedEffort: Math.ceil(qualityMetrics.duplicatedLines / 100) * 2,
        priority: 'medium',
        impact: 'Reduces maintenance effort and improves consistency'
      });
    }

    // Critical issues recommendation
    const criticalItems = debtItems.filter(item => item.severity === 'critical');
    if (criticalItems.length > 0) {
      recommendations.push({
        type: 'critical_issues',
        description: `Address ${criticalItems.length} critical issues immediately`,
        estimatedEffort: criticalItems.reduce((sum, item) => sum + item.estimatedEffort, 0),
        priority: 'critical',
        impact: 'Prevents potential system failures and security vulnerabilities'
      });
    }

    // Sort by priority and return as string array
    const sortedRecommendations = recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return sortedRecommendations.map(rec => `${rec.type}: ${rec.description} (${rec.priority} priority, ${rec.estimatedEffort}h effort)`);
  }

  private async collectCodeQualityMetrics(projectId: UUID): Promise<CodeQualityMetrics> {
    // In a real implementation, this would integrate with tools like SonarQube, ESLint, etc.
    // For now, we'll simulate the metrics collection
    
    // This would typically call external code analysis tools
    const mockMetrics: CodeQualityMetrics = {
      cyclomaticComplexity: Math.floor(Math.random() * 50) + 10,
      codeSmells: Math.floor(Math.random() * 100) + 20,
      duplicatedLines: Math.floor(Math.random() * 2000) + 500,
      maintainabilityIndex: Math.floor(Math.random() * 40) + 60,
      testCoverage: Math.floor(Math.random() * 40) + 60,
      technicalDebtRatio: Math.random() * 0.3 + 0.05
    };

    return mockMetrics;
  }

  private async identifyDebtItems(projectId: UUID): Promise<DebtItem[]> {
    // In a real implementation, this would analyze the codebase using various tools
    // For now, we'll simulate debt item identification
    
    const mockDebtItems: DebtItem[] = [
      {
        type: 'complexity',
        severity: 'high',
        file: 'src/services/user-service.ts',
        line: 45,
        description: 'Method has cyclomatic complexity of 25, consider refactoring',
        estimatedEffort: 8,
        tags: ['refactoring', 'complexity']
      },
      {
        type: 'duplication',
        severity: 'medium',
        file: 'src/utils/validation.ts',
        line: 120,
        description: 'Duplicated validation logic found in multiple files',
        estimatedEffort: 4,
        tags: ['duplication', 'refactoring']
      },
      {
        type: 'vulnerability',
        severity: 'critical',
        file: 'src/auth/jwt-handler.ts',
        line: 78,
        description: 'Potential security vulnerability in JWT validation',
        estimatedEffort: 6,
        tags: ['security', 'vulnerability']
      }
    ];

    return mockDebtItems;
  }

  private calculateTotalDebt(debtItems: DebtItem[]): number {
    return debtItems.reduce((total, item) => total + item.estimatedEffort, 0);
  }

  private calculateDebtRatio(qualityMetrics: CodeQualityMetrics): number {
    // Calculate debt ratio based on various quality metrics
    const complexityRatio = Math.min(qualityMetrics.cyclomaticComplexity / 100, 0.5);
    const coverageRatio = Math.max(0, (80 - qualityMetrics.testCoverage) / 100);
    const maintainabilityRatio = Math.max(0, (100 - qualityMetrics.maintainabilityIndex) / 100);
    
    return Math.min((complexityRatio + coverageRatio + maintainabilityRatio) / 3, 1);
  }

  private async getDebtTrends(projectId: UUID): Promise<{ lastMonth: number; lastQuarter: number }> {
    // In a real implementation, this would query historical data
    // For now, we'll simulate trend data
    
    return {
      lastMonth: Math.random() * 20 + 10, // 10-30 hours
      lastQuarter: Math.random() * 60 + 30 // 30-90 hours
    };
  }

  private async getDebtSnapshot(projectId: UUID, date: Date): Promise<DebtTrend> {
    // In a real implementation, this would get historical snapshot data
    // For now, we'll simulate snapshot data
    
    const baseDebt = 50;
    const variation = Math.random() * 20 - 10; // -10 to +10
    const totalDebt = Math.max(0, baseDebt + variation);
    
    return {
      date,
      totalDebt,
      newDebt: Math.random() * 10,
      resolvedDebt: Math.random() * 8,
      debtRatio: totalDebt / 1000 // Assuming 1000 hours as baseline
    };
  }
}