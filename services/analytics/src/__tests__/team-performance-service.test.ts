import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TeamPerformanceServiceImpl } from '../team-performance-service';
import type {
  SPACEMetricsCollector,
  BenchmarkRepository,
  PerformanceRepository,
  TeamPerformanceInsights,
  PerformanceTrends,
  TeamBenchmarks
} from '../team-performance-service';
import { SPACEMetrics } from '@devflow/shared-types';
import { DateRange } from '../interfaces';

describe('TeamPerformanceService', () => {
  let service: TeamPerformanceServiceImpl;
  let mockSpaceCollector: SPACEMetricsCollector;
  let mockBenchmarkRepo: BenchmarkRepository;
  let mockPerformanceRepo: PerformanceRepository;

  const testTeamId = 'team-123';
  const testDateRange: DateRange = {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31')
  };

  const mockSPACEMetrics: SPACEMetrics = {
    satisfaction: 7.5,
    performance: 85,
    activity: 75,
    communication: 80,
    efficiency: 78
  };

  beforeEach(() => {
    mockSpaceCollector = {
      collectSPACEMetrics: vi.fn(),
      collectSatisfactionMetrics: vi.fn(),
      collectPerformanceMetrics: vi.fn(),
      collectActivityMetrics: vi.fn(),
      collectCommunicationMetrics: vi.fn(),
      collectEfficiencyMetrics: vi.fn()
    };

    mockBenchmarkRepo = {
      getIndustryBenchmarks: vi.fn(),
      getOrganizationBenchmarks: vi.fn(),
      getTopPerformingTeamsBenchmarks: vi.fn()
    };

    mockPerformanceRepo = {
      getDeveloperTeam: vi.fn(),
      saveTeamInsights: vi.fn(),
      getHistoricalInsights: vi.fn()
    };

    service = new TeamPerformanceServiceImpl(
      mockSpaceCollector,
      mockBenchmarkRepo,
      mockPerformanceRepo
    );
  });

  describe('generateTeamInsights', () => {
    it('should generate comprehensive team insights', async () => {
      const mockBenchmarks: TeamBenchmarks = {
        industryAverage: {
          satisfaction: 7.0,
          performance: 80,
          activity: 70,
          communication: 75,
          efficiency: 75
        },
        organizationAverage: {
          satisfaction: 7.2,
          performance: 82,
          activity: 72,
          communication: 77,
          efficiency: 76
        },
        topPerformingTeams: {
          satisfaction: 8.5,
          performance: 95,
          activity: 90,
          communication: 90,
          efficiency: 88
        },
        percentileRanking: {
          satisfaction: 75,
          performance: 80,
          activity: 70,
          communication: 85,
          efficiency: 78
        }
      };

      const mockTrends: PerformanceTrends = {
        satisfaction: {
          current: 7.5,
          previous: 7.0,
          change: 7.1,
          direction: 'up',
          trend: 'improving'
        },
        performance: {
          current: 85,
          previous: 80,
          change: 6.3,
          direction: 'up',
          trend: 'improving'
        },
        activity: {
          current: 75,
          previous: 78,
          change: -3.8,
          direction: 'down',
          trend: 'stable'
        },
        communication: {
          current: 80,
          previous: 79,
          change: 1.3,
          direction: 'stable',
          trend: 'stable'
        },
        efficiency: {
          current: 78,
          previous: 75,
          change: 4.0,
          direction: 'up',
          trend: 'stable'
        }
      };

      // Setup mocks
      vi.mocked(mockSpaceCollector.collectSPACEMetrics)
        .mockResolvedValueOnce(mockSPACEMetrics) // For generateTeamInsights call
        .mockResolvedValueOnce(mockSPACEMetrics) // For trackPerformanceTrends current period
        .mockResolvedValueOnce({ // For trackPerformanceTrends previous period
          satisfaction: 7.0,
          performance: 80,
          activity: 78,
          communication: 79,
          efficiency: 75
        })
        .mockResolvedValue(mockSPACEMetrics); // For getBenchmarks call

      vi.mocked(mockBenchmarkRepo.getIndustryBenchmarks).mockResolvedValue(mockBenchmarks.industryAverage);
      vi.mocked(mockBenchmarkRepo.getOrganizationBenchmarks).mockResolvedValue(mockBenchmarks.organizationAverage);
      vi.mocked(mockBenchmarkRepo.getTopPerformingTeamsBenchmarks).mockResolvedValue(mockBenchmarks.topPerformingTeams);

      const result = await service.generateTeamInsights(testTeamId, testDateRange);

      expect(result).toMatchObject({
        teamId: testTeamId,
        period: testDateRange,
        spaceMetrics: mockSPACEMetrics,
        trends: expect.any(Object),
        recommendations: expect.any(Array),
        benchmarks: expect.any(Object),
        riskFactors: expect.any(Array)
      });

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.riskFactors).toBeDefined();
    });
  });

  describe('generateDeveloperProfile', () => {
    it('should generate individual developer performance profile', async () => {
      const developerId = 'dev-123';
      
      vi.mocked(mockPerformanceRepo.getDeveloperTeam).mockResolvedValue(testTeamId);

      const result = await service.generateDeveloperProfile(developerId, testDateRange);

      expect(result).toMatchObject({
        developerId,
        teamId: testTeamId,
        spaceMetrics: expect.any(Object),
        strengths: expect.any(Array),
        improvementAreas: expect.any(Array),
        careerGrowthPath: expect.any(Array),
        mentorshipNeeds: expect.any(Array)
      });
    });
  });

  describe('trackPerformanceTrends', () => {
    it('should calculate performance trends correctly', async () => {
      const periods = [testDateRange, {
        start: new Date('2023-12-01'),
        end: new Date('2023-12-31')
      }];

      const currentMetrics = mockSPACEMetrics;
      const previousMetrics: SPACEMetrics = {
        satisfaction: 7.0,
        performance: 80,
        activity: 78,
        communication: 79,
        efficiency: 75
      };

      vi.mocked(mockSpaceCollector.collectSPACEMetrics)
        .mockResolvedValueOnce(currentMetrics)
        .mockResolvedValueOnce(previousMetrics);

      const result = await service.trackPerformanceTrends(testTeamId, periods);

      expect(result.satisfaction.current).toBe(7.5);
      expect(result.satisfaction.previous).toBe(7.0);
      expect(result.satisfaction.change).toBeCloseTo(7.1, 1);
      expect(result.satisfaction.direction).toBe('up');
      expect(result.satisfaction.trend).toBe('improving');

      expect(result.performance.current).toBe(85);
      expect(result.performance.previous).toBe(80);
      expect(result.performance.change).toBeCloseTo(6.3, 1);
      expect(result.performance.direction).toBe('up');
    });

    it('should throw error with insufficient periods', async () => {
      await expect(
        service.trackPerformanceTrends(testTeamId, [testDateRange])
      ).rejects.toThrow('At least 2 periods required for trend analysis');
    });
  });

  describe('generateRecommendations', () => {
    it('should generate satisfaction recommendations for low scores', async () => {
      const lowSatisfactionInsights: TeamPerformanceInsights = {
        teamId: testTeamId,
        period: testDateRange,
        spaceMetrics: {
          satisfaction: 4.5, // Low satisfaction
          performance: 85,
          activity: 75,
          communication: 80,
          efficiency: 78
        },
        trends: {
          satisfaction: {
            current: 4.5,
            previous: 5.0,
            change: -10,
            direction: 'down',
            trend: 'declining'
          },
          performance: {
            current: 85,
            previous: 80,
            change: 6.3,
            direction: 'up',
            trend: 'improving'
          },
          activity: {
            current: 75,
            previous: 78,
            change: -3.8,
            direction: 'down',
            trend: 'stable'
          },
          communication: {
            current: 80,
            previous: 79,
            change: 1.3,
            direction: 'stable',
            trend: 'stable'
          },
          efficiency: {
            current: 78,
            previous: 75,
            change: 4.0,
            direction: 'up',
            trend: 'stable'
          }
        },
        recommendations: [],
        benchmarks: {
          industryAverage: mockSPACEMetrics,
          organizationAverage: mockSPACEMetrics,
          topPerformingTeams: mockSPACEMetrics,
          percentileRanking: {
            satisfaction: 25,
            performance: 80,
            activity: 70,
            communication: 85,
            efficiency: 78
          }
        },
        riskFactors: []
      };

      const recommendations = await service.generateRecommendations(lowSatisfactionInsights);

      expect(recommendations.length).toBeGreaterThan(0); // Should have recommendations
      
      const satisfactionRec = recommendations.find(r => r.category === 'satisfaction');
      expect(satisfactionRec).toBeDefined();
      expect(satisfactionRec?.priority).toBe('critical');
      expect(satisfactionRec?.title).toBe('Improve Developer Satisfaction');
    });

    it('should generate performance recommendations for below-average performance', async () => {
      const lowPerformanceInsights: TeamPerformanceInsights = {
        teamId: testTeamId,
        period: testDateRange,
        spaceMetrics: {
          satisfaction: 7.5,
          performance: 60, // Low performance
          activity: 75,
          communication: 80,
          efficiency: 78
        },
        trends: {
          satisfaction: {
            current: 7.5,
            previous: 7.0,
            change: 7.1,
            direction: 'up',
            trend: 'improving'
          },
          performance: {
            current: 60,
            previous: 65,
            change: -7.7,
            direction: 'down',
            trend: 'declining'
          },
          activity: {
            current: 75,
            previous: 78,
            change: -3.8,
            direction: 'down',
            trend: 'stable'
          },
          communication: {
            current: 80,
            previous: 79,
            change: 1.3,
            direction: 'stable',
            trend: 'stable'
          },
          efficiency: {
            current: 78,
            previous: 75,
            change: 4.0,
            direction: 'up',
            trend: 'stable'
          }
        },
        recommendations: [],
        benchmarks: {
          industryAverage: mockSPACEMetrics,
          organizationAverage: mockSPACEMetrics,
          topPerformingTeams: mockSPACEMetrics,
          percentileRanking: {
            satisfaction: 75,
            performance: 40,
            activity: 70,
            communication: 85,
            efficiency: 78
          }
        },
        riskFactors: []
      };

      const recommendations = await service.generateRecommendations(lowPerformanceInsights);

      const performanceRec = recommendations.find(r => r.category === 'performance');
      expect(performanceRec).toBeDefined();
      expect(performanceRec?.priority).toBe('high');
      expect(performanceRec?.title).toBe('Boost Team Performance');
    });
  });

  describe('identifyRiskFactors', () => {
    it('should identify low satisfaction as a risk factor', async () => {
      const lowSatisfactionInsights: TeamPerformanceInsights = {
        teamId: testTeamId,
        period: testDateRange,
        spaceMetrics: {
          satisfaction: 4.0, // Very low satisfaction
          performance: 85,
          activity: 75,
          communication: 80,
          efficiency: 78
        },
        trends: {
          satisfaction: {
            current: 4.0,
            previous: 5.0,
            change: -20,
            direction: 'down',
            trend: 'declining'
          },
          performance: {
            current: 85,
            previous: 80,
            change: 6.3,
            direction: 'up',
            trend: 'improving'
          },
          activity: {
            current: 75,
            previous: 78,
            change: -3.8,
            direction: 'down',
            trend: 'stable'
          },
          communication: {
            current: 80,
            previous: 79,
            change: 1.3,
            direction: 'stable',
            trend: 'stable'
          },
          efficiency: {
            current: 78,
            previous: 75,
            change: 4.0,
            direction: 'up',
            trend: 'stable'
          }
        },
        recommendations: [],
        benchmarks: {
          industryAverage: mockSPACEMetrics,
          organizationAverage: mockSPACEMetrics,
          topPerformingTeams: mockSPACEMetrics,
          percentileRanking: {
            satisfaction: 10,
            performance: 80,
            activity: 70,
            communication: 85,
            efficiency: 78
          }
        },
        riskFactors: []
      };

      const riskFactors = await service.identifyRiskFactors(testTeamId, lowSatisfactionInsights);

      expect(riskFactors.length).toBeGreaterThan(0);
      
      const satisfactionRisk = riskFactors.find(r => r.name === 'Low Developer Satisfaction');
      expect(satisfactionRisk).toBeDefined();
      expect(satisfactionRisk?.severity).toBe('high'); // 4.0 satisfaction triggers 'high' severity, not 'critical'
      expect(satisfactionRisk?.impact).toContain('turnover');
    });

    it('should identify declining performance as a risk factor', async () => {
      const decliningPerformanceInsights: TeamPerformanceInsights = {
        teamId: testTeamId,
        period: testDateRange,
        spaceMetrics: {
          satisfaction: 7.5,
          performance: 70,
          activity: 75,
          communication: 80,
          efficiency: 78
        },
        trends: {
          satisfaction: {
            current: 7.5,
            previous: 7.0,
            change: 7.1,
            direction: 'up',
            trend: 'improving'
          },
          performance: {
            current: 70,
            previous: 85,
            change: -17.6, // Significant decline
            direction: 'down',
            trend: 'declining'
          },
          activity: {
            current: 75,
            previous: 78,
            change: -3.8,
            direction: 'down',
            trend: 'stable'
          },
          communication: {
            current: 80,
            previous: 79,
            change: 1.3,
            direction: 'stable',
            trend: 'stable'
          },
          efficiency: {
            current: 78,
            previous: 75,
            change: 4.0,
            direction: 'up',
            trend: 'stable'
          }
        },
        recommendations: [],
        benchmarks: {
          industryAverage: mockSPACEMetrics,
          organizationAverage: mockSPACEMetrics,
          topPerformingTeams: mockSPACEMetrics,
          percentileRanking: {
            satisfaction: 75,
            performance: 50,
            activity: 70,
            communication: 85,
            efficiency: 78
          }
        },
        riskFactors: []
      };

      const riskFactors = await service.identifyRiskFactors(testTeamId, decliningPerformanceInsights);

      const performanceRisk = riskFactors.find(r => r.name === 'Declining Performance');
      expect(performanceRisk).toBeDefined();
      expect(performanceRisk?.severity).toBe('high');
      expect(performanceRisk?.impact).toContain('deadlines');
    });
  });
});