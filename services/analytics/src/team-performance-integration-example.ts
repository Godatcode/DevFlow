/**
 * Team Performance Insights Integration Example
 * 
 * This example demonstrates how to use the SPACE metrics collector and team performance service
 * to generate comprehensive team insights, track performance trends, and provide actionable recommendations.
 */

import { 
  SPACEMetricsCollectorImpl,
  PostgresSatisfactionRepository,
  PostgresProductivityRepository,
  PostgresActivityRepository,
  PostgresCommunicationRepository,
  PostgresEfficiencyRepository
} from './space-metrics-repository';
import { TeamPerformanceServiceImpl } from './team-performance-service';
import { DateRange } from './interfaces';
import { UUID } from '@devflow/shared-types';

// Example usage of the team performance insights system
export class TeamPerformanceIntegrationExample {
  private spaceMetricsCollector: SPACEMetricsCollectorImpl;
  private teamPerformanceService: TeamPerformanceServiceImpl;

  constructor(databaseConnection: any) {
    // Initialize repositories
    const satisfactionRepo = new PostgresSatisfactionRepository(databaseConnection);
    const productivityRepo = new PostgresProductivityRepository(databaseConnection);
    const activityRepo = new PostgresActivityRepository(databaseConnection);
    const communicationRepo = new PostgresCommunicationRepository(databaseConnection);
    const efficiencyRepo = new PostgresEfficiencyRepository(databaseConnection);

    // Initialize SPACE metrics collector
    this.spaceMetricsCollector = new SPACEMetricsCollectorImpl(
      satisfactionRepo,
      productivityRepo,
      activityRepo,
      communicationRepo,
      efficiencyRepo
    );

    // Initialize team performance service
    const benchmarkRepo = new MockBenchmarkRepository();
    const performanceRepo = new MockPerformanceRepository();
    
    this.teamPerformanceService = new TeamPerformanceServiceImpl(
      this.spaceMetricsCollector,
      benchmarkRepo,
      performanceRepo
    );
  }

  /**
   * Example: Generate comprehensive team performance insights
   */
  async generateTeamInsightsExample(teamId: UUID): Promise<void> {
    console.log('🔍 Generating Team Performance Insights...\n');

    // Define the analysis period (last 30 days)
    const dateRange: DateRange = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    try {
      // Generate comprehensive team insights
      const insights = await this.teamPerformanceService.generateTeamInsights(teamId, dateRange);

      console.log('📊 SPACE Metrics:');
      console.log(`  Satisfaction: ${insights.spaceMetrics.satisfaction}/10`);
      console.log(`  Performance: ${insights.spaceMetrics.performance}/100`);
      console.log(`  Activity: ${insights.spaceMetrics.activity}/100`);
      console.log(`  Communication: ${insights.spaceMetrics.communication}/100`);
      console.log(`  Efficiency: ${insights.spaceMetrics.efficiency}/100\n`);

      console.log('📈 Performance Trends:');
      Object.entries(insights.trends).forEach(([metric, trend]: [string, any]) => {
        const arrow = trend.direction === 'up' ? '↗️' : trend.direction === 'down' ? '↘️' : '➡️';
        console.log(`  ${metric}: ${trend.current} ${arrow} (${trend.change > 0 ? '+' : ''}${trend.change}%)`);
      });
      console.log();

      console.log('💡 Recommendations:');
      insights.recommendations.forEach((rec: any, index: number) => {
        const priorityEmoji = rec.priority === 'critical' ? '🚨' : rec.priority === 'high' ? '⚠️' : '💡';
        console.log(`  ${index + 1}. ${priorityEmoji} ${rec.title} (${rec.priority})`);
        console.log(`     ${rec.description}`);
        console.log(`     Expected Impact: ${rec.expectedImpact}`);
        console.log(`     Timeframe: ${rec.timeframe}\n`);
      });

      console.log('⚠️ Risk Factors:');
      insights.riskFactors.forEach((risk: any, index: number) => {
        const severityEmoji = risk.severity === 'critical' ? '🚨' : risk.severity === 'high' ? '⚠️' : '⚡';
        console.log(`  ${index + 1}. ${severityEmoji} ${risk.name} (${risk.severity})`);
        console.log(`     Impact: ${risk.impact}`);
        console.log(`     Mitigation: ${risk.mitigationStrategies.join(', ')}\n`);
      });

      console.log('🏆 Benchmarks:');
      console.log(`  Industry Percentile: ${insights.benchmarks.percentileRanking.satisfaction}th (Satisfaction)`);
      console.log(`  Organization Percentile: ${insights.benchmarks.percentileRanking.performance}th (Performance)`);
      console.log();

    } catch (error) {
      console.error('❌ Error generating team insights:', error);
    }
  }

  /**
   * Example: Generate individual developer performance profile
   */
  async generateDeveloperProfileExample(developerId: UUID): Promise<void> {
    console.log('👤 Generating Developer Performance Profile...\n');

    const dateRange: DateRange = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    try {
      const profile = await this.teamPerformanceService.generateDeveloperProfile(developerId, dateRange);

      console.log('📊 Individual SPACE Metrics:');
      console.log(`  Satisfaction: ${profile.spaceMetrics.satisfaction}/10`);
      console.log(`  Performance: ${profile.spaceMetrics.performance}/100`);
      console.log(`  Activity: ${profile.spaceMetrics.activity}/100`);
      console.log(`  Communication: ${profile.spaceMetrics.communication}/100`);
      console.log(`  Efficiency: ${profile.spaceMetrics.efficiency}/100\n`);

      console.log('💪 Strengths:');
      profile.strengths.forEach((strength: any, index: number) => {
        console.log(`  ${index + 1}. ${strength}`);
      });
      console.log();

      console.log('🎯 Improvement Areas:');
      profile.improvementAreas.forEach((area: any, index: number) => {
        console.log(`  ${index + 1}. ${area}`);
      });
      console.log();

      console.log('🚀 Career Growth Path:');
      profile.careerGrowthPath.forEach((path: any, index: number) => {
        console.log(`  ${index + 1}. ${path}`);
      });
      console.log();

      console.log('🤝 Mentorship Needs:');
      profile.mentorshipNeeds.forEach((need: any, index: number) => {
        console.log(`  ${index + 1}. ${need}`);
      });
      console.log();

    } catch (error) {
      console.error('❌ Error generating developer profile:', error);
    }
  }

  /**
   * Example: Track performance trends over multiple periods
   */
  async trackPerformanceTrendsExample(teamId: UUID): Promise<void> {
    console.log('📈 Tracking Performance Trends...\n');

    // Define current and previous periods
    const currentPeriod: DateRange = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    const previousPeriod: DateRange = {
      start: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      end: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    };

    try {
      const trends = await this.teamPerformanceService.trackPerformanceTrends(
        teamId, 
        [currentPeriod, previousPeriod]
      );

      console.log('📊 Performance Trends Analysis:');
      console.log('─'.repeat(50));

      Object.entries(trends).forEach(([metric, trend]: [string, any]) => {
        const arrow = trend.direction === 'up' ? '↗️' : trend.direction === 'down' ? '↘️' : '➡️';
        const trendEmoji = trend.trend === 'improving' ? '📈' : trend.trend === 'declining' ? '📉' : '📊';
        
        console.log(`${metric.toUpperCase()}:`);
        console.log(`  Current: ${trend.current}`);
        console.log(`  Previous: ${trend.previous}`);
        console.log(`  Change: ${trend.change > 0 ? '+' : ''}${trend.change}% ${arrow}`);
        console.log(`  Trend: ${trend.trend} ${trendEmoji}\n`);
      });

    } catch (error) {
      console.error('❌ Error tracking performance trends:', error);
    }
  }

  /**
   * Example: Collect and display raw SPACE metrics
   */
  async collectSPACEMetricsExample(teamId: UUID): Promise<void> {
    console.log('📊 Collecting SPACE Metrics...\n');

    const dateRange: DateRange = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      end: new Date()
    };

    try {
      // Collect individual SPACE components
      const satisfaction = await this.spaceMetricsCollector.collectSatisfactionMetrics(teamId, dateRange);
      const performance = await this.spaceMetricsCollector.collectPerformanceMetrics(teamId, dateRange);
      const activity = await this.spaceMetricsCollector.collectActivityMetrics(teamId, dateRange);
      const communication = await this.spaceMetricsCollector.collectCommunicationMetrics(teamId, dateRange);
      const efficiency = await this.spaceMetricsCollector.collectEfficiencyMetrics(teamId, dateRange);

      console.log('📋 Individual SPACE Components:');
      console.log(`  😊 Satisfaction: ${satisfaction}/10`);
      console.log(`  🎯 Performance: ${performance}/100`);
      console.log(`  🔄 Activity: ${activity}/100`);
      console.log(`  💬 Communication: ${communication}/100`);
      console.log(`  ⚡ Efficiency: ${efficiency}/100\n`);

      // Collect complete SPACE metrics
      const spaceMetrics = await this.spaceMetricsCollector.collectSPACEMetrics(teamId, dateRange);

      console.log('🏆 Complete SPACE Score:');
      console.log(`  Overall Team Health: ${(
        spaceMetrics.satisfaction * 10 + 
        spaceMetrics.performance + 
        spaceMetrics.activity + 
        spaceMetrics.communication + 
        spaceMetrics.efficiency
      ) / 5}/100\n`);

    } catch (error) {
      console.error('❌ Error collecting SPACE metrics:', error);
    }
  }
}

// Mock implementations for the example
class MockBenchmarkRepository {
  async getIndustryBenchmarks() {
    return {
      satisfaction: 7.0,
      performance: 80,
      activity: 70,
      communication: 75,
      efficiency: 75
    };
  }

  async getOrganizationBenchmarks() {
    return {
      satisfaction: 7.2,
      performance: 82,
      activity: 72,
      communication: 77,
      efficiency: 76
    };
  }

  async getTopPerformingTeamsBenchmarks() {
    return {
      satisfaction: 8.5,
      performance: 95,
      activity: 90,
      communication: 90,
      efficiency: 88
    };
  }
}

class MockPerformanceRepository {
  async getDeveloperTeam(developerId: UUID): Promise<UUID> {
    return 'team-123';
  }

  async saveTeamInsights(): Promise<void> {
    // Mock implementation
  }

  async getHistoricalInsights(): Promise<any[]> {
    return [];
  }
}

// Usage example
export async function runTeamPerformanceExample(): Promise<void> {
  console.log('🚀 DevFlow.ai Team Performance Insights Example\n');
  console.log('=' .repeat(60));

  // Mock database connection
  const mockDb = {};
  const example = new TeamPerformanceIntegrationExample(mockDb);

  const teamId = 'team-123';
  const developerId = 'dev-456';

  try {
    await example.generateTeamInsightsExample(teamId);
    console.log('=' .repeat(60));
    
    await example.generateDeveloperProfileExample(developerId);
    console.log('=' .repeat(60));
    
    await example.trackPerformanceTrendsExample(teamId);
    console.log('=' .repeat(60));
    
    await example.collectSPACEMetricsExample(teamId);
    console.log('=' .repeat(60));

    console.log('✅ Team Performance Insights Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Uncomment to run the example
// runTeamPerformanceExample();