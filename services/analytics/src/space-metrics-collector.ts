import { SPACEMetrics, UUID, MetricData, MetricType } from '@devflow/shared-types';
import { DateRange } from './interfaces';

export interface SPACEMetricsCollector {
  collectSPACEMetrics(teamId: UUID, dateRange: DateRange): Promise<SPACEMetrics>;
  collectSatisfactionMetrics(teamId: UUID, dateRange: DateRange): Promise<number>;
  collectPerformanceMetrics(teamId: UUID, dateRange: DateRange): Promise<number>;
  collectActivityMetrics(teamId: UUID, dateRange: DateRange): Promise<number>;
  collectCommunicationMetrics(teamId: UUID, dateRange: DateRange): Promise<number>;
  collectEfficiencyMetrics(teamId: UUID, dateRange: DateRange): Promise<number>;
}

export interface DeveloperSatisfactionSurvey {
  developerId: UUID;
  teamId: UUID;
  satisfactionScore: number; // 1-10 scale
  workLifeBalance: number;
  toolsAndResources: number;
  teamCollaboration: number;
  careerGrowth: number;
  workload: number;
  submittedAt: Date;
}

export interface ProductivityMetrics {
  developerId: UUID;
  teamId: UUID;
  tasksCompleted: number;
  storyPointsCompleted: number;
  codeReviewsCompleted: number;
  bugsFixed: number;
  featuresDelivered: number;
  period: DateRange;
}

export interface ActivityMetrics {
  developerId: UUID;
  teamId: UUID;
  commitsCount: number;
  pullRequestsCreated: number;
  pullRequestsReviewed: number;
  issuesCreated: number;
  issuesResolved: number;
  codeReviewComments: number;
  period: DateRange;
}

export interface CommunicationMetrics {
  teamId: UUID;
  meetingParticipation: number; // percentage
  slackMessages: number;
  documentationContributions: number;
  knowledgeSharing: number; // sessions conducted
  mentoring: number; // hours spent mentoring
  crossTeamCollaboration: number; // interactions with other teams
  period: DateRange;
}

export interface EfficiencyMetrics {
  developerId: UUID;
  teamId: UUID;
  averageTaskCompletionTime: number; // hours
  codeReviewTurnaroundTime: number; // hours
  bugFixTime: number; // hours
  deploymentFrequency: number;
  reworkPercentage: number;
  focusTime: number; // uninterrupted coding hours per day
  period: DateRange;
}

export class SPACEMetricsCollectorImpl implements SPACEMetricsCollector {
  constructor(
    private satisfactionRepository: SatisfactionRepository,
    private productivityRepository: ProductivityRepository,
    private activityRepository: ActivityRepository,
    private communicationRepository: CommunicationRepository,
    private efficiencyRepository: EfficiencyRepository
  ) {}

  async collectSPACEMetrics(teamId: UUID, dateRange: DateRange): Promise<SPACEMetrics> {
    const [satisfaction, performance, activity, communication, efficiency] = await Promise.all([
      this.collectSatisfactionMetrics(teamId, dateRange),
      this.collectPerformanceMetrics(teamId, dateRange),
      this.collectActivityMetrics(teamId, dateRange),
      this.collectCommunicationMetrics(teamId, dateRange),
      this.collectEfficiencyMetrics(teamId, dateRange)
    ]);

    return {
      satisfaction,
      performance,
      activity,
      communication,
      efficiency
    };
  }

  async collectSatisfactionMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const surveys = await this.satisfactionRepository.getSurveysByTeam(teamId, dateRange);
    
    if (surveys.length === 0) {
      return 0;
    }

    const totalSatisfaction = surveys.reduce((sum, survey) => sum + survey.satisfactionScore, 0);
    return Math.round((totalSatisfaction / surveys.length) * 10) / 10;
  }

  async collectPerformanceMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const productivityData = await this.productivityRepository.getTeamProductivity(teamId, dateRange);
    
    if (productivityData.length === 0) {
      return 0;
    }

    // Calculate weighted performance score based on tasks completed and story points
    const totalTasks = productivityData.reduce((sum, data) => sum + data.tasksCompleted, 0);
    const totalStoryPoints = productivityData.reduce((sum, data) => sum + data.storyPointsCompleted, 0);
    const totalFeatures = productivityData.reduce((sum, data) => sum + data.featuresDelivered, 0);

    // Normalize to 0-100 scale based on team size and sprint duration
    const teamSize = productivityData.length;
    const sprintDuration = this.calculateSprintDuration(dateRange);
    const expectedTasksPerDeveloper = sprintDuration * 2; // Assuming 2 tasks per week per developer

    const performanceScore = Math.min(100, (totalTasks / (teamSize * expectedTasksPerDeveloper)) * 100);
    return Math.round(performanceScore * 10) / 10;
  }

  async collectActivityMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const activityData = await this.activityRepository.getTeamActivity(teamId, dateRange);
    
    if (activityData.length === 0) {
      return 0;
    }

    // Calculate activity score based on commits, PRs, and reviews
    const totalCommits = activityData.reduce((sum, data) => sum + data.commitsCount, 0);
    const totalPRs = activityData.reduce((sum, data) => sum + data.pullRequestsCreated, 0);
    const totalReviews = activityData.reduce((sum, data) => sum + data.pullRequestsReviewed, 0);

    const teamSize = activityData.length;
    const weeksDuration = this.calculateWeeksDuration(dateRange);
    
    // Expected activity per developer per week
    const expectedCommitsPerWeek = 10;
    const expectedPRsPerWeek = 2;
    const expectedReviewsPerWeek = 3;

    const commitScore = Math.min(100, (totalCommits / (teamSize * weeksDuration * expectedCommitsPerWeek)) * 100);
    const prScore = Math.min(100, (totalPRs / (teamSize * weeksDuration * expectedPRsPerWeek)) * 100);
    const reviewScore = Math.min(100, (totalReviews / (teamSize * weeksDuration * expectedReviewsPerWeek)) * 100);

    const activityScore = (commitScore * 0.4 + prScore * 0.3 + reviewScore * 0.3);
    return Math.round(activityScore * 10) / 10;
  }

  async collectCommunicationMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const communicationData = await this.communicationRepository.getTeamCommunication(teamId, dateRange);
    
    if (!communicationData) {
      return 0;
    }

    // Calculate communication score based on various factors
    const meetingScore = Math.min(100, communicationData.meetingParticipation);
    const documentationScore = Math.min(100, (communicationData.documentationContributions / 10) * 100);
    const knowledgeSharingScore = Math.min(100, (communicationData.knowledgeSharing / 5) * 100);
    const collaborationScore = Math.min(100, (communicationData.crossTeamCollaboration / 20) * 100);

    const communicationScore = (
      meetingScore * 0.3 +
      documentationScore * 0.2 +
      knowledgeSharingScore * 0.3 +
      collaborationScore * 0.2
    );

    return Math.round(communicationScore * 10) / 10;
  }

  async collectEfficiencyMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const efficiencyData = await this.efficiencyRepository.getTeamEfficiency(teamId, dateRange);
    
    if (efficiencyData.length === 0) {
      return 0;
    }

    // Calculate efficiency score based on completion times and rework
    const avgTaskTime = efficiencyData.reduce((sum, data) => sum + data.averageTaskCompletionTime, 0) / efficiencyData.length;
    const avgReviewTime = efficiencyData.reduce((sum, data) => sum + data.codeReviewTurnaroundTime, 0) / efficiencyData.length;
    const avgRework = efficiencyData.reduce((sum, data) => sum + data.reworkPercentage, 0) / efficiencyData.length;
    const avgFocusTime = efficiencyData.reduce((sum, data) => sum + data.focusTime, 0) / efficiencyData.length;

    // Normalize scores (lower times and rework = higher efficiency)
    const taskTimeScore = Math.max(0, 100 - (avgTaskTime / 8) * 100); // 8 hours as baseline
    const reviewTimeScore = Math.max(0, 100 - (avgReviewTime / 4) * 100); // 4 hours as baseline
    const reworkScore = Math.max(0, 100 - avgRework); // Lower rework is better
    const focusTimeScore = Math.min(100, (avgFocusTime / 6) * 100); // 6 hours as target

    const efficiencyScore = (
      taskTimeScore * 0.3 +
      reviewTimeScore * 0.2 +
      reworkScore * 0.3 +
      focusTimeScore * 0.2
    );

    return Math.round(efficiencyScore * 10) / 10;
  }

  private calculateSprintDuration(dateRange: DateRange): number {
    const diffTime = Math.abs(dateRange.end.getTime() - dateRange.start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)); // weeks
  }

  private calculateWeeksDuration(dateRange: DateRange): number {
    const diffTime = Math.abs(dateRange.end.getTime() - dateRange.start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7)); // weeks
  }
}

// Repository interfaces for data access
export interface SatisfactionRepository {
  getSurveysByTeam(teamId: UUID, dateRange: DateRange): Promise<DeveloperSatisfactionSurvey[]>;
  saveSurvey(survey: DeveloperSatisfactionSurvey): Promise<void>;
  getAverageSatisfaction(teamId: UUID, dateRange: DateRange): Promise<number>;
}

export interface ProductivityRepository {
  getTeamProductivity(teamId: UUID, dateRange: DateRange): Promise<ProductivityMetrics[]>;
  getDeveloperProductivity(developerId: UUID, dateRange: DateRange): Promise<ProductivityMetrics>;
  saveProductivityMetrics(metrics: ProductivityMetrics): Promise<void>;
}

export interface ActivityRepository {
  getTeamActivity(teamId: UUID, dateRange: DateRange): Promise<ActivityMetrics[]>;
  getDeveloperActivity(developerId: UUID, dateRange: DateRange): Promise<ActivityMetrics>;
  saveActivityMetrics(metrics: ActivityMetrics): Promise<void>;
}

export interface CommunicationRepository {
  getTeamCommunication(teamId: UUID, dateRange: DateRange): Promise<CommunicationMetrics>;
  saveCommunicationMetrics(metrics: CommunicationMetrics): Promise<void>;
}

export interface EfficiencyRepository {
  getTeamEfficiency(teamId: UUID, dateRange: DateRange): Promise<EfficiencyMetrics[]>;
  getDeveloperEfficiency(developerId: UUID, dateRange: DateRange): Promise<EfficiencyMetrics>;
  saveEfficiencyMetrics(metrics: EfficiencyMetrics): Promise<void>;
}