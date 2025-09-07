import { UUID, TechnicalDebtAnalysis } from '@devflow/shared-types';
import { logger } from '@devflow/shared-utils';
import { TechnicalDebtAnalyzerService, DebtItem } from './technical-debt-analyzer';
import { TechnicalDebtRepository } from './technical-debt-repository';
import { DebtTrend } from './interfaces';

export interface TechnicalDebtServiceConfig {
  analysisSchedule: string; // cron expression
  alertThresholds: {
    debtRatio: number;
    criticalIssues: number;
    totalDebtHours: number;
  };
  integrations: {
    sonarQube?: {
      url: string;
      token: string;
    };
    eslint?: {
      configPath: string;
    };
    codeClimate?: {
      token: string;
    };
  };
}

export class TechnicalDebtService {
  private analyzer: TechnicalDebtAnalyzerService;
  private repository: TechnicalDebtRepository;
  private config: TechnicalDebtServiceConfig;

  constructor(config: TechnicalDebtServiceConfig) {
    this.analyzer = new TechnicalDebtAnalyzerService();
    this.repository = new TechnicalDebtRepository();
    this.config = config;
  }

  async analyzeProjectDebt(projectId: UUID, saveResults: boolean = true): Promise<TechnicalDebtAnalysis> {
    try {
      logger.info('Starting technical debt analysis for project', { projectId });

      // Perform the analysis
      const analysis = await this.analyzer.analyzeCodebase(projectId);

      if (saveResults) {
        // Get debt items for storage
        const debtItems = await this.getDebtItemsForProject(projectId);
        
        // Save to database
        await this.repository.saveTechnicalDebtAnalysis(projectId, analysis, debtItems);
      }

      // Check if alerts should be triggered
      await this.checkAlertThresholds(projectId, analysis);

      logger.info('Technical debt analysis completed', { 
        projectId, 
        totalDebtHours: analysis.totalDebtHours,
        debtRatio: analysis.debtRatio,
        criticalIssues: analysis.criticalIssues
      });

      return analysis;

    } catch (error) {
      logger.error('Technical debt analysis failed', { projectId, error });
      throw new Error(`Failed to analyze technical debt for project ${projectId}: ${error.message}`);
    }
  }

  async getLatestAnalysis(projectId: UUID): Promise<TechnicalDebtAnalysis | null> {
    try {
      return await this.repository.getTechnicalDebtAnalysis(projectId);
    } catch (error) {
      logger.error('Failed to get latest technical debt analysis', { projectId, error });
      throw error;
    }
  }

  async getDebtTrends(projectId: UUID, days: number = 30): Promise<DebtTrend[]> {
    try {
      // Get trends from analyzer (includes calculated trends)
      const analyzerTrends = await this.analyzer.trackDebtTrends(projectId, days);
      
      // Get historical data from repository
      const historicalTrends = await this.repository.getDebtTrends(projectId, days);
      
      // Merge and deduplicate by date
      const trendMap = new Map<string, DebtTrend>();
      
      [...historicalTrends, ...analyzerTrends].forEach(trend => {
        const dateKey = trend.date.toISOString().split('T')[0];
        if (!trendMap.has(dateKey) || trend.totalDebt > 0) {
          trendMap.set(dateKey, trend);
        }
      });

      return Array.from(trendMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

    } catch (error) {
      logger.error('Failed to get debt trends', { projectId, days, error });
      throw error;
    }
  }

  async getDebtItems(projectId: UUID): Promise<DebtItem[]> {
    try {
      return await this.repository.getDebtItems(projectId);
    } catch (error) {
      logger.error('Failed to get debt items', { projectId, error });
      throw error;
    }
  }

  async generateDebtReport(projectIds: UUID[]): Promise<{
    summary: Map<UUID, { totalDebt: number; criticalIssues: number }>;
    recommendations: string[];
    trends: { improving: UUID[]; degrading: UUID[]; stable: UUID[] };
  }> {
    try {
      logger.info('Generating debt report for projects', { projectIds });

      // Get summary for all projects
      const summary = await this.repository.getProjectDebtSummary(projectIds);

      // Analyze trends for each project
      const trends = { improving: [], degrading: [], stable: [] };
      const recommendations: string[] = [];

      for (const projectId of projectIds) {
        const projectTrends = await this.getDebtTrends(projectId, 30);
        
        if (projectTrends.length >= 2) {
          const recent = projectTrends[projectTrends.length - 1];
          const previous = projectTrends[projectTrends.length - 2];
          
          const change = recent.totalDebt - previous.totalDebt;
          const changePercent = Math.abs(change) / previous.totalDebt;
          
          if (changePercent < 0.05) {
            trends.stable.push(projectId);
          } else if (change < 0) {
            trends.improving.push(projectId);
          } else {
            trends.degrading.push(projectId);
          }
        }

        // Generate project-specific recommendations
        const analysis = await this.getLatestAnalysis(projectId);
        if (analysis) {
          if (analysis.debtRatio > this.config.alertThresholds.debtRatio) {
            recommendations.push(`Project ${projectId}: High debt ratio (${(analysis.debtRatio * 100).toFixed(1)}%) requires immediate attention`);
          }
          if (analysis.criticalIssues > this.config.alertThresholds.criticalIssues) {
            recommendations.push(`Project ${projectId}: ${analysis.criticalIssues} critical issues need urgent resolution`);
          }
        }
      }

      logger.info('Debt report generated', { 
        projectCount: projectIds.length,
        improvingProjects: trends.improving.length,
        degradingProjects: trends.degrading.length
      });

      return { summary, recommendations, trends };

    } catch (error) {
      logger.error('Failed to generate debt report', { projectIds, error });
      throw error;
    }
  }

  async scheduleAnalysis(projectId: UUID): Promise<void> {
    try {
      // In a real implementation, this would integrate with a job scheduler
      // For now, we'll just log the scheduling
      logger.info('Scheduling technical debt analysis', { 
        projectId, 
        schedule: this.config.analysisSchedule 
      });

      // Immediate analysis for demonstration
      await this.analyzeProjectDebt(projectId);

    } catch (error) {
      logger.error('Failed to schedule analysis', { projectId, error });
      throw error;
    }
  }

  private async getDebtItemsForProject(projectId: UUID): Promise<DebtItem[]> {
    // This would typically integrate with external tools to get actual debt items
    // For now, we'll use the analyzer's mock data
    return [];
  }

  private async checkAlertThresholds(projectId: UUID, analysis: TechnicalDebtAnalysis): Promise<void> {
    const alerts: string[] = [];

    if (analysis.debtRatio > this.config.alertThresholds.debtRatio) {
      alerts.push(`High debt ratio: ${(analysis.debtRatio * 100).toFixed(1)}%`);
    }

    if (analysis.criticalIssues > this.config.alertThresholds.criticalIssues) {
      alerts.push(`Critical issues: ${analysis.criticalIssues}`);
    }

    if (analysis.totalDebtHours > this.config.alertThresholds.totalDebtHours) {
      alerts.push(`High total debt: ${analysis.totalDebtHours} hours`);
    }

    if (alerts.length > 0) {
      logger.warn('Technical debt alert thresholds exceeded', { 
        projectId, 
        alerts,
        analysis: {
          debtRatio: analysis.debtRatio,
          criticalIssues: analysis.criticalIssues,
          totalDebtHours: analysis.totalDebtHours
        }
      });

      // In a real implementation, this would trigger notifications
      // through the integration service (Slack, email, etc.)
    }
  }
}