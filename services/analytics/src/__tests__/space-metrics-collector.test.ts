import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SPACEMetricsCollectorImpl } from '../space-metrics-collector';
import type {
  SatisfactionRepository,
  ProductivityRepository,
  ActivityRepository,
  CommunicationRepository,
  EfficiencyRepository,
  DeveloperSatisfactionSurvey,
  ProductivityMetrics,
  ActivityMetrics,
  CommunicationMetrics,
  EfficiencyMetrics
} from '../space-metrics-collector';
import { DateRange } from '../interfaces';

describe('SPACEMetricsCollector', () => {
  let collector: SPACEMetricsCollectorImpl;
  let mockSatisfactionRepo: SatisfactionRepository;
  let mockProductivityRepo: ProductivityRepository;
  let mockActivityRepo: ActivityRepository;
  let mockCommunicationRepo: CommunicationRepository;
  let mockEfficiencyRepo: EfficiencyRepository;

  const testTeamId = 'team-123';
  const testDateRange: DateRange = {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31')
  };

  beforeEach(() => {
    mockSatisfactionRepo = {
      getSurveysByTeam: vi.fn(),
      saveSurvey: vi.fn(),
      getAverageSatisfaction: vi.fn()
    };

    mockProductivityRepo = {
      getTeamProductivity: vi.fn(),
      getDeveloperProductivity: vi.fn(),
      saveProductivityMetrics: vi.fn()
    };

    mockActivityRepo = {
      getTeamActivity: vi.fn(),
      getDeveloperActivity: vi.fn(),
      saveActivityMetrics: vi.fn()
    };

    mockCommunicationRepo = {
      getTeamCommunication: vi.fn(),
      saveCommunicationMetrics: vi.fn()
    };

    mockEfficiencyRepo = {
      getTeamEfficiency: vi.fn(),
      getDeveloperEfficiency: vi.fn(),
      saveEfficiencyMetrics: vi.fn()
    };

    collector = new SPACEMetricsCollectorImpl(
      mockSatisfactionRepo,
      mockProductivityRepo,
      mockActivityRepo,
      mockCommunicationRepo,
      mockEfficiencyRepo
    );
  });

  describe('collectSPACEMetrics', () => {
    it('should collect all SPACE metrics successfully', async () => {
      // Mock satisfaction data
      const mockSurveys: DeveloperSatisfactionSurvey[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          satisfactionScore: 8,
          workLifeBalance: 7,
          toolsAndResources: 9,
          teamCollaboration: 8,
          careerGrowth: 7,
          workload: 6,
          submittedAt: new Date('2024-01-15')
        },
        {
          developerId: 'dev-2',
          teamId: testTeamId,
          satisfactionScore: 7,
          workLifeBalance: 8,
          toolsAndResources: 7,
          teamCollaboration: 9,
          careerGrowth: 8,
          workload: 7,
          submittedAt: new Date('2024-01-20')
        }
      ];

      // Mock productivity data
      const mockProductivity: ProductivityMetrics[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          tasksCompleted: 12,
          storyPointsCompleted: 25,
          codeReviewsCompleted: 8,
          bugsFixed: 3,
          featuresDelivered: 2,
          period: testDateRange
        },
        {
          developerId: 'dev-2',
          teamId: testTeamId,
          tasksCompleted: 10,
          storyPointsCompleted: 20,
          codeReviewsCompleted: 6,
          bugsFixed: 2,
          featuresDelivered: 1,
          period: testDateRange
        }
      ];

      // Mock activity data
      const mockActivity: ActivityMetrics[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          commitsCount: 45,
          pullRequestsCreated: 8,
          pullRequestsReviewed: 12,
          issuesCreated: 3,
          issuesResolved: 5,
          codeReviewComments: 25,
          period: testDateRange
        },
        {
          developerId: 'dev-2',
          teamId: testTeamId,
          commitsCount: 38,
          pullRequestsCreated: 6,
          pullRequestsReviewed: 10,
          issuesCreated: 2,
          issuesResolved: 4,
          codeReviewComments: 20,
          period: testDateRange
        }
      ];

      // Mock communication data
      const mockCommunication: CommunicationMetrics = {
        teamId: testTeamId,
        meetingParticipation: 85,
        slackMessages: 150,
        documentationContributions: 8,
        knowledgeSharing: 3,
        mentoring: 5,
        crossTeamCollaboration: 12,
        period: testDateRange
      };

      // Mock efficiency data
      const mockEfficiency: EfficiencyMetrics[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          averageTaskCompletionTime: 6,
          codeReviewTurnaroundTime: 2,
          bugFixTime: 4,
          deploymentFrequency: 8,
          reworkPercentage: 15,
          focusTime: 5.5,
          period: testDateRange
        },
        {
          developerId: 'dev-2',
          teamId: testTeamId,
          averageTaskCompletionTime: 7,
          codeReviewTurnaroundTime: 3,
          bugFixTime: 5,
          deploymentFrequency: 6,
          reworkPercentage: 20,
          focusTime: 5,
          period: testDateRange
        }
      ];

      // Setup mocks
      vi.mocked(mockSatisfactionRepo.getSurveysByTeam).mockResolvedValue(mockSurveys);
      vi.mocked(mockProductivityRepo.getTeamProductivity).mockResolvedValue(mockProductivity);
      vi.mocked(mockActivityRepo.getTeamActivity).mockResolvedValue(mockActivity);
      vi.mocked(mockCommunicationRepo.getTeamCommunication).mockResolvedValue(mockCommunication);
      vi.mocked(mockEfficiencyRepo.getTeamEfficiency).mockResolvedValue(mockEfficiency);

      const result = await collector.collectSPACEMetrics(testTeamId, testDateRange);

      expect(result).toEqual({
        satisfaction: 7.5, // Average of 8 and 7
        performance: expect.any(Number),
        activity: expect.any(Number),
        communication: expect.any(Number),
        efficiency: expect.any(Number)
      });

      expect(result.satisfaction).toBe(7.5);
      expect(result.performance).toBeGreaterThan(0);
      expect(result.activity).toBeGreaterThan(0);
      expect(result.communication).toBeGreaterThan(0);
      expect(result.efficiency).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      // Setup empty mocks
      vi.mocked(mockSatisfactionRepo.getSurveysByTeam).mockResolvedValue([]);
      vi.mocked(mockProductivityRepo.getTeamProductivity).mockResolvedValue([]);
      vi.mocked(mockActivityRepo.getTeamActivity).mockResolvedValue([]);
      vi.mocked(mockCommunicationRepo.getTeamCommunication).mockResolvedValue({
        teamId: testTeamId,
        meetingParticipation: 0,
        slackMessages: 0,
        documentationContributions: 0,
        knowledgeSharing: 0,
        mentoring: 0,
        crossTeamCollaboration: 0,
        period: testDateRange
      });
      vi.mocked(mockEfficiencyRepo.getTeamEfficiency).mockResolvedValue([]);

      const result = await collector.collectSPACEMetrics(testTeamId, testDateRange);

      expect(result).toEqual({
        satisfaction: 0,
        performance: 0,
        activity: 0,
        communication: 0,
        efficiency: 0
      });
    });
  });

  describe('collectSatisfactionMetrics', () => {
    it('should calculate average satisfaction correctly', async () => {
      const mockSurveys: DeveloperSatisfactionSurvey[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          satisfactionScore: 8,
          workLifeBalance: 7,
          toolsAndResources: 9,
          teamCollaboration: 8,
          careerGrowth: 7,
          workload: 6,
          submittedAt: new Date('2024-01-15')
        },
        {
          developerId: 'dev-2',
          teamId: testTeamId,
          satisfactionScore: 6,
          workLifeBalance: 5,
          toolsAndResources: 7,
          teamCollaboration: 6,
          careerGrowth: 5,
          workload: 4,
          submittedAt: new Date('2024-01-20')
        }
      ];

      vi.mocked(mockSatisfactionRepo.getSurveysByTeam).mockResolvedValue(mockSurveys);

      const result = await collector.collectSatisfactionMetrics(testTeamId, testDateRange);

      expect(result).toBe(7.0); // (8 + 6) / 2 = 7.0
    });

    it('should return 0 when no surveys exist', async () => {
      vi.mocked(mockSatisfactionRepo.getSurveysByTeam).mockResolvedValue([]);

      const result = await collector.collectSatisfactionMetrics(testTeamId, testDateRange);

      expect(result).toBe(0);
    });
  });

  describe('collectPerformanceMetrics', () => {
    it('should calculate performance score based on tasks and story points', async () => {
      const mockProductivity: ProductivityMetrics[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          tasksCompleted: 16, // 4 weeks * 2 tasks/week = 8 expected, so 200%
          storyPointsCompleted: 25,
          codeReviewsCompleted: 8,
          bugsFixed: 3,
          featuresDelivered: 2,
          period: testDateRange
        }
      ];

      vi.mocked(mockProductivityRepo.getTeamProductivity).mockResolvedValue(mockProductivity);

      const result = await collector.collectPerformanceMetrics(testTeamId, testDateRange);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe('collectActivityMetrics', () => {
    it('should calculate activity score based on commits, PRs, and reviews', async () => {
      const mockActivity: ActivityMetrics[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          commitsCount: 40, // 4 weeks * 10 commits/week = 40 expected, so 100%
          pullRequestsCreated: 8, // 4 weeks * 2 PRs/week = 8 expected, so 100%
          pullRequestsReviewed: 12, // 4 weeks * 3 reviews/week = 12 expected, so 100%
          issuesCreated: 3,
          issuesResolved: 5,
          codeReviewComments: 25,
          period: testDateRange
        }
      ];

      vi.mocked(mockActivityRepo.getTeamActivity).mockResolvedValue(mockActivity);

      const result = await collector.collectActivityMetrics(testTeamId, testDateRange);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe('collectCommunicationMetrics', () => {
    it('should calculate communication score based on various factors', async () => {
      const mockCommunication: CommunicationMetrics = {
        teamId: testTeamId,
        meetingParticipation: 90,
        slackMessages: 150,
        documentationContributions: 10,
        knowledgeSharing: 5,
        mentoring: 8,
        crossTeamCollaboration: 20,
        period: testDateRange
      };

      vi.mocked(mockCommunicationRepo.getTeamCommunication).mockResolvedValue(mockCommunication);

      const result = await collector.collectCommunicationMetrics(testTeamId, testDateRange);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });

  describe('collectEfficiencyMetrics', () => {
    it('should calculate efficiency score based on completion times and rework', async () => {
      const mockEfficiency: EfficiencyMetrics[] = [
        {
          developerId: 'dev-1',
          teamId: testTeamId,
          averageTaskCompletionTime: 4, // Good efficiency (< 8 hours baseline)
          codeReviewTurnaroundTime: 2, // Good efficiency (< 4 hours baseline)
          bugFixTime: 3,
          deploymentFrequency: 8,
          reworkPercentage: 10, // Low rework is good
          focusTime: 6, // Good focus time (6 hours target)
          period: testDateRange
        }
      ];

      vi.mocked(mockEfficiencyRepo.getTeamEfficiency).mockResolvedValue(mockEfficiency);

      const result = await collector.collectEfficiencyMetrics(testTeamId, testDateRange);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(100);
    });
  });
});