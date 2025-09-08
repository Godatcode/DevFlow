import { UUID, SPACEMetrics } from '@devflow/shared-types';
import { DateRange } from './interfaces';
import {
  DeveloperSatisfactionSurvey,
  ProductivityMetrics,
  ActivityMetrics,
  CommunicationMetrics,
  EfficiencyMetrics,
  SatisfactionRepository,
  ProductivityRepository,
  ActivityRepository,
  CommunicationRepository,
  EfficiencyRepository,
  SPACEMetricsCollector
} from './space-metrics-collector';

// Export the implementation classes that are referenced in other files
export class SPACEMetricsCollectorImpl implements SPACEMetricsCollector {
  constructor(
    private satisfactionRepo: SatisfactionRepository,
    private productivityRepo: ProductivityRepository,
    private activityRepo: ActivityRepository,
    private communicationRepo: CommunicationRepository,
    private efficiencyRepo: EfficiencyRepository
  ) {}

  async collectSPACEMetrics(teamId: UUID, dateRange: DateRange): Promise<SPACEMetrics> {
    // Implementation would go here
    return {
      satisfaction: 7.5,
      performance: 85,
      activity: 75,
      communication: 80,
      efficiency: 78
    };
  }

  async collectSatisfactionMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    return await this.satisfactionRepo.getAverageSatisfaction(teamId, dateRange);
  }

  async collectPerformanceMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const metrics = await this.productivityRepo.getTeamProductivity(teamId, dateRange);
    return metrics.reduce((sum, m) => sum + m.tasksCompleted, 0) / metrics.length;
  }

  async collectActivityMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const metrics = await this.activityRepo.getTeamActivity(teamId, dateRange);
    return metrics.reduce((sum, m) => sum + m.commitsCount, 0) / metrics.length;
  }

  async collectCommunicationMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const metrics = await this.communicationRepo.getTeamCommunication(teamId, dateRange);
    return metrics.meetingParticipation;
  }

  async collectEfficiencyMetrics(teamId: UUID, dateRange: DateRange): Promise<number> {
    const metrics = await this.efficiencyRepo.getTeamEfficiency(teamId, dateRange);
    return metrics.reduce((sum, m) => sum + m.focusTime, 0) / metrics.length;
  }
}

export class PostgresSatisfactionRepository implements SatisfactionRepository {
  constructor(private db: any) {} // Database connection

  async getSurveysByTeam(teamId: UUID, dateRange: DateRange): Promise<DeveloperSatisfactionSurvey[]> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        satisfaction_score,
        work_life_balance,
        tools_and_resources,
        team_collaboration,
        career_growth,
        workload,
        submitted_at
      FROM developer_satisfaction_surveys 
      WHERE team_id = $1 
        AND submitted_at >= $2 
        AND submitted_at <= $3
      ORDER BY submitted_at DESC
    `;

    const result = await this.db.query(query, [teamId, dateRange.start, dateRange.end]);
    
    return result.rows.map((row: any) => ({
      developerId: row.developer_id,
      teamId: row.team_id,
      satisfactionScore: row.satisfaction_score,
      workLifeBalance: row.work_life_balance,
      toolsAndResources: row.tools_and_resources,
      teamCollaboration: row.team_collaboration,
      careerGrowth: row.career_growth,
      workload: row.workload,
      submittedAt: row.submitted_at
    }));
  }

  async saveSurvey(survey: DeveloperSatisfactionSurvey): Promise<void> {
    const query = `
      INSERT INTO developer_satisfaction_surveys (
        developer_id, team_id, satisfaction_score, work_life_balance,
        tools_and_resources, team_collaboration, career_growth, workload, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (developer_id, team_id, submitted_at) 
      DO UPDATE SET
        satisfaction_score = EXCLUDED.satisfaction_score,
        work_life_balance = EXCLUDED.work_life_balance,
        tools_and_resources = EXCLUDED.tools_and_resources,
        team_collaboration = EXCLUDED.team_collaboration,
        career_growth = EXCLUDED.career_growth,
        workload = EXCLUDED.workload
    `;

    await this.db.query(query, [
      survey.developerId,
      survey.teamId,
      survey.satisfactionScore,
      survey.workLifeBalance,
      survey.toolsAndResources,
      survey.teamCollaboration,
      survey.careerGrowth,
      survey.workload,
      survey.submittedAt
    ]);
  }

  async getAverageSatisfaction(teamId: UUID, dateRange: DateRange): Promise<number> {
    const query = `
      SELECT AVG(satisfaction_score) as avg_satisfaction
      FROM developer_satisfaction_surveys 
      WHERE team_id = $1 
        AND submitted_at >= $2 
        AND submitted_at <= $3
    `;

    const result = await this.db.query(query, [teamId, dateRange.start, dateRange.end]);
    return result.rows[0]?.avg_satisfaction || 0;
  }
}

export class PostgresProductivityRepository implements ProductivityRepository {
  constructor(private db: any) {}

  async getTeamProductivity(teamId: UUID, dateRange: DateRange): Promise<ProductivityMetrics[]> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        tasks_completed,
        story_points_completed,
        code_reviews_completed,
        bugs_fixed,
        features_delivered,
        period_start,
        period_end
      FROM productivity_metrics 
      WHERE team_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      ORDER BY developer_id, period_start
    `;

    const result = await this.db.query(query, [teamId, dateRange.start, dateRange.end]);
    
    return result.rows.map((row: any) => ({
      developerId: row.developer_id,
      teamId: row.team_id,
      tasksCompleted: row.tasks_completed,
      storyPointsCompleted: row.story_points_completed,
      codeReviewsCompleted: row.code_reviews_completed,
      bugsFixed: row.bugs_fixed,
      featuresDelivered: row.features_delivered,
      period: {
        start: row.period_start,
        end: row.period_end
      }
    }));
  }

  async getDeveloperProductivity(developerId: UUID, dateRange: DateRange): Promise<ProductivityMetrics> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        SUM(tasks_completed) as tasks_completed,
        SUM(story_points_completed) as story_points_completed,
        SUM(code_reviews_completed) as code_reviews_completed,
        SUM(bugs_fixed) as bugs_fixed,
        SUM(features_delivered) as features_delivered
      FROM productivity_metrics 
      WHERE developer_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      GROUP BY developer_id, team_id
    `;

    const result = await this.db.query(query, [developerId, dateRange.start, dateRange.end]);
    const row = result.rows[0];

    if (!row) {
      throw new Error(`No productivity data found for developer ${developerId}`);
    }

    return {
      developerId: row.developer_id,
      teamId: row.team_id,
      tasksCompleted: row.tasks_completed,
      storyPointsCompleted: row.story_points_completed,
      codeReviewsCompleted: row.code_reviews_completed,
      bugsFixed: row.bugs_fixed,
      featuresDelivered: row.features_delivered,
      period: dateRange
    };
  }

  async saveProductivityMetrics(metrics: ProductivityMetrics): Promise<void> {
    const query = `
      INSERT INTO productivity_metrics (
        developer_id, team_id, tasks_completed, story_points_completed,
        code_reviews_completed, bugs_fixed, features_delivered, period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (developer_id, period_start, period_end) 
      DO UPDATE SET
        tasks_completed = EXCLUDED.tasks_completed,
        story_points_completed = EXCLUDED.story_points_completed,
        code_reviews_completed = EXCLUDED.code_reviews_completed,
        bugs_fixed = EXCLUDED.bugs_fixed,
        features_delivered = EXCLUDED.features_delivered
    `;

    await this.db.query(query, [
      metrics.developerId,
      metrics.teamId,
      metrics.tasksCompleted,
      metrics.storyPointsCompleted,
      metrics.codeReviewsCompleted,
      metrics.bugsFixed,
      metrics.featuresDelivered,
      metrics.period.start,
      metrics.period.end
    ]);
  }
}

export class PostgresActivityRepository implements ActivityRepository {
  constructor(private db: any) {}

  async getTeamActivity(teamId: UUID, dateRange: DateRange): Promise<ActivityMetrics[]> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        commits_count,
        pull_requests_created,
        pull_requests_reviewed,
        issues_created,
        issues_resolved,
        code_review_comments,
        period_start,
        period_end
      FROM activity_metrics 
      WHERE team_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      ORDER BY developer_id, period_start
    `;

    const result = await this.db.query(query, [teamId, dateRange.start, dateRange.end]);
    
    return result.rows.map((row: any) => ({
      developerId: row.developer_id,
      teamId: row.team_id,
      commitsCount: row.commits_count,
      pullRequestsCreated: row.pull_requests_created,
      pullRequestsReviewed: row.pull_requests_reviewed,
      issuesCreated: row.issues_created,
      issuesResolved: row.issues_resolved,
      codeReviewComments: row.code_review_comments,
      period: {
        start: row.period_start,
        end: row.period_end
      }
    }));
  }

  async getDeveloperActivity(developerId: UUID, dateRange: DateRange): Promise<ActivityMetrics> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        SUM(commits_count) as commits_count,
        SUM(pull_requests_created) as pull_requests_created,
        SUM(pull_requests_reviewed) as pull_requests_reviewed,
        SUM(issues_created) as issues_created,
        SUM(issues_resolved) as issues_resolved,
        SUM(code_review_comments) as code_review_comments
      FROM activity_metrics 
      WHERE developer_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      GROUP BY developer_id, team_id
    `;

    const result = await this.db.query(query, [developerId, dateRange.start, dateRange.end]);
    const row = result.rows[0];

    if (!row) {
      throw new Error(`No activity data found for developer ${developerId}`);
    }

    return {
      developerId: row.developer_id,
      teamId: row.team_id,
      commitsCount: row.commits_count,
      pullRequestsCreated: row.pull_requests_created,
      pullRequestsReviewed: row.pull_requests_reviewed,
      issuesCreated: row.issues_created,
      issuesResolved: row.issues_resolved,
      codeReviewComments: row.code_review_comments,
      period: dateRange
    };
  }

  async saveActivityMetrics(metrics: ActivityMetrics): Promise<void> {
    const query = `
      INSERT INTO activity_metrics (
        developer_id, team_id, commits_count, pull_requests_created,
        pull_requests_reviewed, issues_created, issues_resolved, 
        code_review_comments, period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (developer_id, period_start, period_end) 
      DO UPDATE SET
        commits_count = EXCLUDED.commits_count,
        pull_requests_created = EXCLUDED.pull_requests_created,
        pull_requests_reviewed = EXCLUDED.pull_requests_reviewed,
        issues_created = EXCLUDED.issues_created,
        issues_resolved = EXCLUDED.issues_resolved,
        code_review_comments = EXCLUDED.code_review_comments
    `;

    await this.db.query(query, [
      metrics.developerId,
      metrics.teamId,
      metrics.commitsCount,
      metrics.pullRequestsCreated,
      metrics.pullRequestsReviewed,
      metrics.issuesCreated,
      metrics.issuesResolved,
      metrics.codeReviewComments,
      metrics.period.start,
      metrics.period.end
    ]);
  }
}

export class PostgresCommunicationRepository implements CommunicationRepository {
  constructor(private db: any) {}

  async getTeamCommunication(teamId: UUID, dateRange: DateRange): Promise<CommunicationMetrics> {
    const query = `
      SELECT 
        team_id,
        meeting_participation,
        slack_messages,
        documentation_contributions,
        knowledge_sharing,
        mentoring,
        cross_team_collaboration,
        period_start,
        period_end
      FROM communication_metrics 
      WHERE team_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      ORDER BY period_start DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [teamId, dateRange.start, dateRange.end]);
    const row = result.rows[0];

    if (!row) {
      // Return default metrics if no data found
      return {
        teamId,
        meetingParticipation: 0,
        slackMessages: 0,
        documentationContributions: 0,
        knowledgeSharing: 0,
        mentoring: 0,
        crossTeamCollaboration: 0,
        period: dateRange
      };
    }

    return {
      teamId: row.team_id,
      meetingParticipation: row.meeting_participation,
      slackMessages: row.slack_messages,
      documentationContributions: row.documentation_contributions,
      knowledgeSharing: row.knowledge_sharing,
      mentoring: row.mentoring,
      crossTeamCollaboration: row.cross_team_collaboration,
      period: {
        start: row.period_start,
        end: row.period_end
      }
    };
  }

  async saveCommunicationMetrics(metrics: CommunicationMetrics): Promise<void> {
    const query = `
      INSERT INTO communication_metrics (
        team_id, meeting_participation, slack_messages, documentation_contributions,
        knowledge_sharing, mentoring, cross_team_collaboration, period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (team_id, period_start, period_end) 
      DO UPDATE SET
        meeting_participation = EXCLUDED.meeting_participation,
        slack_messages = EXCLUDED.slack_messages,
        documentation_contributions = EXCLUDED.documentation_contributions,
        knowledge_sharing = EXCLUDED.knowledge_sharing,
        mentoring = EXCLUDED.mentoring,
        cross_team_collaboration = EXCLUDED.cross_team_collaboration
    `;

    await this.db.query(query, [
      metrics.teamId,
      metrics.meetingParticipation,
      metrics.slackMessages,
      metrics.documentationContributions,
      metrics.knowledgeSharing,
      metrics.mentoring,
      metrics.crossTeamCollaboration,
      metrics.period.start,
      metrics.period.end
    ]);
  }
}

export class PostgresEfficiencyRepository implements EfficiencyRepository {
  constructor(private db: any) {}

  async getTeamEfficiency(teamId: UUID, dateRange: DateRange): Promise<EfficiencyMetrics[]> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        average_task_completion_time,
        code_review_turnaround_time,
        bug_fix_time,
        deployment_frequency,
        rework_percentage,
        focus_time,
        period_start,
        period_end
      FROM efficiency_metrics 
      WHERE team_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      ORDER BY developer_id, period_start
    `;

    const result = await this.db.query(query, [teamId, dateRange.start, dateRange.end]);
    
    return result.rows.map((row: any) => ({
      developerId: row.developer_id,
      teamId: row.team_id,
      averageTaskCompletionTime: row.average_task_completion_time,
      codeReviewTurnaroundTime: row.code_review_turnaround_time,
      bugFixTime: row.bug_fix_time,
      deploymentFrequency: row.deployment_frequency,
      reworkPercentage: row.rework_percentage,
      focusTime: row.focus_time,
      period: {
        start: row.period_start,
        end: row.period_end
      }
    }));
  }

  async getDeveloperEfficiency(developerId: UUID, dateRange: DateRange): Promise<EfficiencyMetrics> {
    const query = `
      SELECT 
        developer_id,
        team_id,
        AVG(average_task_completion_time) as average_task_completion_time,
        AVG(code_review_turnaround_time) as code_review_turnaround_time,
        AVG(bug_fix_time) as bug_fix_time,
        AVG(deployment_frequency) as deployment_frequency,
        AVG(rework_percentage) as rework_percentage,
        AVG(focus_time) as focus_time
      FROM efficiency_metrics 
      WHERE developer_id = $1 
        AND period_start >= $2 
        AND period_end <= $3
      GROUP BY developer_id, team_id
    `;

    const result = await this.db.query(query, [developerId, dateRange.start, dateRange.end]);
    const row = result.rows[0];

    if (!row) {
      throw new Error(`No efficiency data found for developer ${developerId}`);
    }

    return {
      developerId: row.developer_id,
      teamId: row.team_id,
      averageTaskCompletionTime: row.average_task_completion_time,
      codeReviewTurnaroundTime: row.code_review_turnaround_time,
      bugFixTime: row.bug_fix_time,
      deploymentFrequency: row.deployment_frequency,
      reworkPercentage: row.rework_percentage,
      focusTime: row.focus_time,
      period: dateRange
    };
  }

  async saveEfficiencyMetrics(metrics: EfficiencyMetrics): Promise<void> {
    const query = `
      INSERT INTO efficiency_metrics (
        developer_id, team_id, average_task_completion_time, code_review_turnaround_time,
        bug_fix_time, deployment_frequency, rework_percentage, focus_time, period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (developer_id, period_start, period_end) 
      DO UPDATE SET
        average_task_completion_time = EXCLUDED.average_task_completion_time,
        code_review_turnaround_time = EXCLUDED.code_review_turnaround_time,
        bug_fix_time = EXCLUDED.bug_fix_time,
        deployment_frequency = EXCLUDED.deployment_frequency,
        rework_percentage = EXCLUDED.rework_percentage,
        focus_time = EXCLUDED.focus_time
    `;

    await this.db.query(query, [
      metrics.developerId,
      metrics.teamId,
      metrics.averageTaskCompletionTime,
      metrics.codeReviewTurnaroundTime,
      metrics.bugFixTime,
      metrics.deploymentFrequency,
      metrics.reworkPercentage,
      metrics.focusTime,
      metrics.period.start,
      metrics.period.end
    ]);
  }
}