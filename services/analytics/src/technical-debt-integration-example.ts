/**
 * Technical Debt Analysis Integration Example
 * 
 * This file demonstrates how to integrate the technical debt analysis
 * functionality with external tools and services.
 */

import { TechnicalDebtService, TechnicalDebtServiceConfig } from './technical-debt-service';
import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

const logger = new Logger('TechnicalDebtIntegration');

// Example configuration for the technical debt service
const exampleConfig: TechnicalDebtServiceConfig = {
  analysisSchedule: '0 2 * * *', // Daily at 2 AM
  alertThresholds: {
    debtRatio: 0.2, // 20% debt ratio threshold
    criticalIssues: 5, // 5 critical issues threshold
    totalDebtHours: 100 // 100 hours total debt threshold
  },
  integrations: {
    sonarQube: {
      url: 'https://sonar.company.com',
      token: process.env.SONARQUBE_TOKEN || ''
    },
    eslint: {
      configPath: '.eslintrc.json'
    },
    codeClimate: {
      token: process.env.CODE_CLIMATE_TOKEN || ''
    }
  }
};

/**
 * Example: Analyze technical debt for a project
 */
export async function analyzeProjectExample(projectId: UUID): Promise<void> {
  const service = new TechnicalDebtService(exampleConfig);

  try {
    logger.info('Starting technical debt analysis example', { projectId });

    // Perform analysis
    const analysis = await service.analyzeProjectDebt(projectId, true);

    logger.info('Technical debt analysis results:', {
      projectId,
      totalDebtHours: analysis.totalDebtHours,
      debtRatio: `${(analysis.debtRatio * 100).toFixed(1)}%`,
      criticalIssues: analysis.criticalIssues,
      recommendationsCount: analysis.recommendations.length
    });

    // Display recommendations
    console.log('\n=== Technical Debt Recommendations ===');
    analysis.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.type}`);
      console.log(`   Description: ${rec.description}`);
      console.log(`   Estimated Effort: ${rec.estimatedEffort} hours`);
      console.log(`   Impact: ${rec.impact}`);
      console.log('');
    });

    // Get trends
    const trends = await service.getDebtTrends(projectId, 30);
    console.log('\n=== Debt Trends (Last 30 Days) ===');
    console.log(`Data points: ${trends.length}`);
    if (trends.length >= 2) {
      const latest = trends[trends.length - 1];
      const previous = trends[trends.length - 2];
      const change = latest.totalDebt - previous.totalDebt;
      const direction = change > 0 ? 'increased' : change < 0 ? 'decreased' : 'remained stable';
      console.log(`Debt has ${direction} by ${Math.abs(change).toFixed(1)} hours`);
    }

  } catch (error) {
    logger.error('Technical debt analysis example failed', { projectId, error });
    throw error;
  }
}

/**
 * Example: Generate debt report for multiple projects
 */
export async function generateTeamDebtReportExample(projectIds: UUID[]): Promise<void> {
  const service = new TechnicalDebtService(exampleConfig);

  try {
    logger.info('Generating team debt report example', { projectCount: projectIds.length });

    const report = await service.generateDebtReport(projectIds);

    console.log('\n=== Team Technical Debt Report ===');
    console.log(`Projects analyzed: ${projectIds.length}`);
    console.log(`Improving projects: ${report.trends.improving.length}`);
    console.log(`Degrading projects: ${report.trends.degrading.length}`);
    console.log(`Stable projects: ${report.trends.stable.length}`);

    console.log('\n=== Project Summary ===');
    report.summary.forEach((summary, projectId) => {
      console.log(`Project ${projectId}:`);
      console.log(`  Total Debt: ${summary.totalDebt} hours`);
      console.log(`  Critical Issues: ${summary.criticalIssues}`);
    });

    if (report.recommendations.length > 0) {
      console.log('\n=== Team Recommendations ===');
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

  } catch (error) {
    logger.error('Team debt report example failed', { projectIds, error });
    throw error;
  }
}

/**
 * Example: Schedule automated analysis
 */
export async function scheduleAutomatedAnalysisExample(projectIds: UUID[]): Promise<void> {
  const service = new TechnicalDebtService(exampleConfig);

  try {
    logger.info('Scheduling automated analysis example', { projectCount: projectIds.length });

    for (const projectId of projectIds) {
      await service.scheduleAnalysis(projectId);
      console.log(`Scheduled analysis for project: ${projectId}`);
    }

    console.log(`\nScheduled automated analysis for ${projectIds.length} projects`);
    console.log(`Analysis will run: ${exampleConfig.analysisSchedule}`);

  } catch (error) {
    logger.error('Automated analysis scheduling failed', { projectIds, error });
    throw error;
  }
}

/**
 * Example: Monitor debt items for a project
 */
export async function monitorDebtItemsExample(projectId: UUID): Promise<void> {
  const service = new TechnicalDebtService(exampleConfig);

  try {
    logger.info('Monitoring debt items example', { projectId });

    const debtItems = await service.getDebtItems(projectId);

    console.log('\n=== Technical Debt Items ===');
    console.log(`Total items: ${debtItems.length}`);

    // Group by severity
    const bySeverity = debtItems.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('By severity:');
    Object.entries(bySeverity).forEach(([severity, count]) => {
      console.log(`  ${severity}: ${count} items`);
    });

    // Group by type
    const byType = debtItems.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('By type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} items`);
    });

    // Show critical items
    const criticalItems = debtItems.filter(item => item.severity === 'critical');
    if (criticalItems.length > 0) {
      console.log('\n=== Critical Items (Immediate Attention Required) ===');
      criticalItems.forEach((item, index) => {
        console.log(`${index + 1}. ${item.file}:${item.line}`);
        console.log(`   Type: ${item.type}`);
        console.log(`   Description: ${item.description}`);
        console.log(`   Estimated Effort: ${item.estimatedEffort} hours`);
        console.log('');
      });
    }

  } catch (error) {
    logger.error('Debt items monitoring failed', { projectId, error });
    throw error;
  }
}

// Example usage (commented out to prevent execution during import)
/*
async function runExamples() {
  const exampleProjectId = 'example-project-123';
  const exampleProjectIds = ['project-1', 'project-2', 'project-3'];

  try {
    // Analyze single project
    await analyzeProjectExample(exampleProjectId);

    // Generate team report
    await generateTeamDebtReportExample(exampleProjectIds);

    // Schedule automated analysis
    await scheduleAutomatedAnalysisExample(exampleProjectIds);

    // Monitor debt items
    await monitorDebtItemsExample(exampleProjectId);

  } catch (error) {
    console.error('Examples failed:', error);
  }
}

// Uncomment to run examples
// runExamples();
*/