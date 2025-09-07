import { SPACEMetrics, UUID, MetricData, MetricType } from '@devflow/shared-types';
import { DateRange } from './interfaces';
import { SPACEMetricsCollector } from './space-metrics-collector';

export interface TeamPerformanceInsights {
  teamId: UUID;
  period: DateRange;
  spaceMetrics: SPACEMetrics;
  trends: PerformanceTrends;
  recommendations: PerformanceRecommendation[];
  benchmarks: TeamBenchmarks;
  riskFactors: RiskFactor[];
}

export interface PerformanceTrends {
  satisfaction: TrendData;
  performance: TrendData;
  activity: TrendData;
  communication: TrendData;
  efficiency: TrendData;
}

export interface TrendData {
  current: number;
  previous: number;
  change: number; // percentage change
  direction: 'up' | 'down' | 'stable';
  trend: 'improving' | 'declining' | 'stable';
}

export interface PerformanceRecommendation {
  category: 'satisfaction' | 'performance' | 'activity' | 'communication' | 'efficiency';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  actionItems: string[];
  expectedImpact: string;
  timeframe: string;
}

export interface TeamBenchmarks {
  industryAverage: SPACEMetrics;
  organizationAverage: SPACEMetrics;
  topPerformingTeams: SPACEMetrics;
  percentileRanking: {
    satisfaction: number;
    performance: number;
    activity: number;
    communication: number;
    efficiency: number;
  };
}

export interface RiskFactor {
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  indicators: string[];
  mitigationStrategies: string[];
}

export interface DeveloperPerformanceProfile {
  developerId: UUID;
  teamId: UUID;
  spaceMetrics: SPACEMetrics;
  strengths: string[];
  improvementAreas: string[];
  careerGrowthPath: string[];
  mentorshipNeeds: string[];
}

export interface TeamPerformanceService {
  generateTeamInsights(teamId: UUID, dateRange: DateRange): Promise<TeamPerformanceInsights>;
  generateDeveloperProfile(developerId: UUID, dateRange: DateRange): Promise<DeveloperPerformanceProfile>;
  trackPerformanceTrends(teamId: UUID, periods: DateRange[]): Promise<PerformanceTrends>;
  generateRecommendations(insights: TeamPerformanceInsights): Promise<PerformanceRecommendation[]>;
  getBenchmarks(teamId: UUID): Promise<TeamBenchmarks>;
  identifyRiskFactors(teamId: UUID, insights: TeamPerformanceInsights): Promise<RiskFactor[]>;
}

export class TeamPerformanceServiceImpl implements TeamPerformanceService {
  constructor(
    private spaceMetricsCollector: SPACEMetricsCollector,
    private benchmarkRepository: BenchmarkRepository,
    private performanceRepository: PerformanceRepository
  ) {}

  async generateTeamInsights(teamId: UUID, dateRange: DateRange): Promise<TeamPerformanceInsights> {
    const [spaceMetrics, trends, benchmarks] = await Promise.all([
      this.spaceMetricsCollector.collectSPACEMetrics(teamId, dateRange),
      this.trackPerformanceTrends(teamId, [dateRange, this.getPreviousPeriod(dateRange)]),
      this.getBenchmarks(teamId)
    ]);

    const insights: TeamPerformanceInsights = {
      teamId,
      period: dateRange,
      spaceMetrics,
      trends,
      recommendations: [],
      benchmarks,
      riskFactors: []
    };

    insights.recommendations = await this.generateRecommendations(insights);
    insights.riskFactors = await this.identifyRiskFactors(teamId, insights);

    return insights;
  }

  async generateDeveloperProfile(developerId: UUID, dateRange: DateRange): Promise<DeveloperPerformanceProfile> {
    // Get team ID for the developer
    const teamId = await this.performanceRepository.getDeveloperTeam(developerId);
    
    // Collect individual SPACE metrics
    const spaceMetrics = await this.collectDeveloperSPACEMetrics(developerId, dateRange);
    
    // Analyze strengths and improvement areas
    const strengths = this.identifyStrengths(spaceMetrics);
    const improvementAreas = this.identifyImprovementAreas(spaceMetrics);
    
    // Generate career growth recommendations
    const careerGrowthPath = await this.generateCareerGrowthPath(developerId, spaceMetrics);
    const mentorshipNeeds = this.identifyMentorshipNeeds(spaceMetrics, improvementAreas);

    return {
      developerId,
      teamId,
      spaceMetrics,
      strengths,
      improvementAreas,
      careerGrowthPath,
      mentorshipNeeds
    };
  }

  async trackPerformanceTrends(teamId: UUID, periods: DateRange[]): Promise<PerformanceTrends> {
    if (periods.length < 2) {
      throw new Error('At least 2 periods required for trend analysis');
    }

    const [current, previous] = await Promise.all([
      this.spaceMetricsCollector.collectSPACEMetrics(teamId, periods[0]),
      this.spaceMetricsCollector.collectSPACEMetrics(teamId, periods[1])
    ]);

    return {
      satisfaction: this.calculateTrend(current.satisfaction, previous.satisfaction),
      performance: this.calculateTrend(current.performance, previous.performance),
      activity: this.calculateTrend(current.activity, previous.activity),
      communication: this.calculateTrend(current.communication, previous.communication),
      efficiency: this.calculateTrend(current.efficiency, previous.efficiency)
    };
  }

  async generateRecommendations(insights: TeamPerformanceInsights): Promise<PerformanceRecommendation[]> {
    const recommendations: PerformanceRecommendation[] = [];
    const { spaceMetrics, trends, benchmarks } = insights;

    // Satisfaction recommendations
    if (spaceMetrics.satisfaction < 7 || trends.satisfaction.direction === 'down') {
      recommendations.push({
        category: 'satisfaction',
        priority: spaceMetrics.satisfaction < 5 ? 'critical' : 'high',
        title: 'Improve Developer Satisfaction',
        description: 'Team satisfaction is below optimal levels and needs attention',
        actionItems: [
          'Conduct one-on-one meetings with team members',
          'Review workload distribution and work-life balance',
          'Assess tool and resource adequacy',
          'Implement team building activities',
          'Address any blockers or frustrations'
        ],
        expectedImpact: 'Improved retention, higher productivity, better code quality',
        timeframe: '2-4 weeks'
      });
    }

    // Performance recommendations
    if (spaceMetrics.performance < benchmarks.organizationAverage.performance * 0.8) {
      recommendations.push({
        category: 'performance',
        priority: 'high',
        title: 'Boost Team Performance',
        description: 'Team performance is below organizational average',
        actionItems: [
          'Review sprint planning and estimation processes',
          'Identify and remove blockers',
          'Provide additional training or resources',
          'Optimize development workflows',
          'Consider pair programming or code reviews'
        ],
        expectedImpact: 'Increased delivery velocity and quality',
        timeframe: '4-6 weeks'
      });
    }

    // Activity recommendations
    if (spaceMetrics.activity < 60 || trends.activity.direction === 'down') {
      recommendations.push({
        category: 'activity',
        priority: 'medium',
        title: 'Increase Development Activity',
        description: 'Team activity levels could be improved',
        actionItems: [
          'Encourage more frequent commits and smaller PRs',
          'Promote code review participation',
          'Set up automated reminders for pending reviews',
          'Gamify development activities',
          'Provide recognition for active contributors'
        ],
        expectedImpact: 'Better collaboration and code quality',
        timeframe: '2-3 weeks'
      });
    }

    // Communication recommendations
    if (spaceMetrics.communication < 70) {
      recommendations.push({
        category: 'communication',
        priority: 'medium',
        title: 'Enhance Team Communication',
        description: 'Team communication could be more effective',
        actionItems: [
          'Implement regular stand-ups and retrospectives',
          'Encourage documentation and knowledge sharing',
          'Set up cross-team collaboration sessions',
          'Use communication tools more effectively',
          'Create mentorship programs'
        ],
        expectedImpact: 'Better coordination and knowledge transfer',
        timeframe: '3-4 weeks'
      });
    }

    // Efficiency recommendations
    if (spaceMetrics.efficiency < 75 || trends.efficiency.direction === 'down') {
      recommendations.push({
        category: 'efficiency',
        priority: 'high',
        title: 'Improve Development Efficiency',
        description: 'Team efficiency metrics indicate room for improvement',
        actionItems: [
          'Analyze and optimize development workflows',
          'Reduce context switching and interruptions',
          'Improve tooling and automation',
          'Address technical debt',
          'Provide focused work time blocks'
        ],
        expectedImpact: 'Faster delivery and reduced waste',
        timeframe: '4-8 weeks'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  async getBenchmarks(teamId: UUID): Promise<TeamBenchmarks> {
    const [industryAverage, organizationAverage, topPerformingTeams] = await Promise.all([
      this.benchmarkRepository.getIndustryBenchmarks(),
      this.benchmarkRepository.getOrganizationBenchmarks(),
      this.benchmarkRepository.getTopPerformingTeamsBenchmarks()
    ]);

    const currentMetrics = await this.spaceMetricsCollector.collectSPACEMetrics(
      teamId, 
      this.getCurrentPeriod()
    );

    const percentileRanking = await this.calculatePercentileRanking(teamId, currentMetrics);

    return {
      industryAverage,
      organizationAverage,
      topPerformingTeams,
      percentileRanking
    };
  }

  async identifyRiskFactors(teamId: UUID, insights: TeamPerformanceInsights): Promise<RiskFactor[]> {
    const riskFactors: RiskFactor[] = [];
    const { spaceMetrics, trends } = insights;

    // Low satisfaction risk
    if (spaceMetrics.satisfaction < 6) {
      riskFactors.push({
        name: 'Low Developer Satisfaction',
        severity: spaceMetrics.satisfaction < 4 ? 'critical' : 'high',
        impact: 'High risk of turnover, reduced productivity, poor code quality',
        indicators: [
          `Satisfaction score: ${spaceMetrics.satisfaction}/10`,
          trends.satisfaction.direction === 'down' ? 'Declining trend' : 'Stable low score'
        ],
        mitigationStrategies: [
          'Conduct satisfaction surveys and one-on-ones',
          'Address workload and work-life balance issues',
          'Improve tools and resources',
          'Enhance career development opportunities'
        ]
      });
    }

    // Declining performance risk
    if (trends.performance.direction === 'down' && trends.performance.change < -10) {
      riskFactors.push({
        name: 'Declining Performance',
        severity: 'high',
        impact: 'Missed deadlines, reduced delivery quality, stakeholder dissatisfaction',
        indicators: [
          `Performance decline: ${trends.performance.change}%`,
          `Current performance: ${spaceMetrics.performance}/100`
        ],
        mitigationStrategies: [
          'Identify and remove performance blockers',
          'Review and optimize development processes',
          'Provide additional training or support',
          'Reassess workload and priorities'
        ]
      });
    }

    // Low activity risk
    if (spaceMetrics.activity < 50) {
      riskFactors.push({
        name: 'Low Development Activity',
        severity: 'medium',
        impact: 'Reduced collaboration, knowledge silos, slower delivery',
        indicators: [
          `Activity score: ${spaceMetrics.activity}/100`,
          'Low commit frequency or code review participation'
        ],
        mitigationStrategies: [
          'Encourage more frequent commits',
          'Promote code review culture',
          'Implement pair programming',
          'Provide activity recognition and incentives'
        ]
      });
    }

    // Communication breakdown risk
    if (spaceMetrics.communication < 60) {
      riskFactors.push({
        name: 'Poor Team Communication',
        severity: 'medium',
        impact: 'Misaligned goals, duplicated work, reduced team cohesion',
        indicators: [
          `Communication score: ${spaceMetrics.communication}/100`,
          'Low meeting participation or documentation contributions'
        ],
        mitigationStrategies: [
          'Implement structured communication practices',
          'Encourage documentation and knowledge sharing',
          'Facilitate cross-team collaboration',
          'Provide communication training'
        ]
      });
    }

    return riskFactors.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  private async collectDeveloperSPACEMetrics(developerId: UUID, dateRange: DateRange): Promise<SPACEMetrics> {
    // This would collect individual developer metrics
    // For now, returning a placeholder implementation
    return {
      satisfaction: 7.5,
      performance: 85,
      activity: 75,
      communication: 80,
      efficiency: 78
    };
  }

  private identifyStrengths(spaceMetrics: SPACEMetrics): string[] {
    const strengths: string[] = [];
    
    if (spaceMetrics.satisfaction >= 8) strengths.push('High job satisfaction and engagement');
    if (spaceMetrics.performance >= 85) strengths.push('Excellent task completion and delivery');
    if (spaceMetrics.activity >= 80) strengths.push('Strong development activity and collaboration');
    if (spaceMetrics.communication >= 80) strengths.push('Effective communication and knowledge sharing');
    if (spaceMetrics.efficiency >= 80) strengths.push('High efficiency and focused work');

    return strengths;
  }

  private identifyImprovementAreas(spaceMetrics: SPACEMetrics): string[] {
    const areas: string[] = [];
    
    if (spaceMetrics.satisfaction < 7) areas.push('Job satisfaction and work-life balance');
    if (spaceMetrics.performance < 75) areas.push('Task completion and delivery speed');
    if (spaceMetrics.activity < 70) areas.push('Development activity and collaboration');
    if (spaceMetrics.communication < 70) areas.push('Communication and knowledge sharing');
    if (spaceMetrics.efficiency < 70) areas.push('Work efficiency and focus');

    return areas;
  }

  private async generateCareerGrowthPath(developerId: UUID, spaceMetrics: SPACEMetrics): Promise<string[]> {
    const growthPath: string[] = [];
    
    if (spaceMetrics.communication >= 80) {
      growthPath.push('Consider technical leadership or mentoring roles');
    }
    if (spaceMetrics.performance >= 85) {
      growthPath.push('Explore senior developer or architect positions');
    }
    if (spaceMetrics.activity >= 80) {
      growthPath.push('Take on code review leadership or open source contributions');
    }

    return growthPath;
  }

  private identifyMentorshipNeeds(spaceMetrics: SPACEMetrics, improvementAreas: string[]): string[] {
    const needs: string[] = [];
    
    if (improvementAreas.includes('Task completion and delivery speed')) {
      needs.push('Time management and prioritization mentoring');
    }
    if (improvementAreas.includes('Communication and knowledge sharing')) {
      needs.push('Communication skills and documentation best practices');
    }
    if (improvementAreas.includes('Work efficiency and focus')) {
      needs.push('Productivity techniques and workflow optimization');
    }

    return needs;
  }

  private calculateTrend(current: number, previous: number): TrendData {
    const change = ((current - previous) / previous) * 100;
    const direction = change > 2 ? 'up' : change < -2 ? 'down' : 'stable';
    const trend = change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable';

    return {
      current,
      previous,
      change: Math.round(change * 10) / 10,
      direction,
      trend
    };
  }

  private getPreviousPeriod(dateRange: DateRange): DateRange {
    const duration = dateRange.end.getTime() - dateRange.start.getTime();
    return {
      start: new Date(dateRange.start.getTime() - duration),
      end: new Date(dateRange.start.getTime())
    };
  }

  private getCurrentPeriod(): DateRange {
    const end = new Date();
    const start = new Date(end.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    return { start, end };
  }

  private async calculatePercentileRanking(teamId: UUID, metrics: SPACEMetrics): Promise<any> {
    // This would calculate percentile ranking against all teams
    // Placeholder implementation
    return {
      satisfaction: 75,
      performance: 80,
      activity: 70,
      communication: 85,
      efficiency: 78
    };
  }
}

// Repository interfaces
export interface BenchmarkRepository {
  getIndustryBenchmarks(): Promise<SPACEMetrics>;
  getOrganizationBenchmarks(): Promise<SPACEMetrics>;
  getTopPerformingTeamsBenchmarks(): Promise<SPACEMetrics>;
}

export interface PerformanceRepository {
  getDeveloperTeam(developerId: UUID): Promise<UUID>;
  saveTeamInsights(insights: TeamPerformanceInsights): Promise<void>;
  getHistoricalInsights(teamId: UUID, periods: DateRange[]): Promise<TeamPerformanceInsights[]>;
}