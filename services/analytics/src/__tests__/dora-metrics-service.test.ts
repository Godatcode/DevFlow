import { DORAMetricsService, DORAMetricsConfig, DORAMetricsRepository } from '../dora-metrics-service';
import { DeploymentEvent, ChangeEvent, IncidentEvent } from '../dora-metrics-collector';
import { MetricData, MetricType, UUID } from '@devflow/shared-types';
import { DateRange } from '../interfaces';

// Mock repository implementation
class MockDORAMetricsRepository implements DORAMetricsRepository {
  private metricData: MetricData[] = [];
  private deploymentEvents: DeploymentEvent[] = [];
  private changeEvents: ChangeEvent[] = [];
  private incidentEvents: IncidentEvent[] = [];

  async saveMetricData(metrics: MetricData[]): Promise<void> {
    this.metricData.push(...metrics);
  }

  async getMetricData(
    projectId: UUID, 
    metricTypes: MetricType[], 
    dateRange: DateRange
  ): Promise<MetricData[]> {
    return this.metricData.filter(m => 
      m.projectId === projectId &&
      metricTypes.includes(m.type) &&
      m.timestamp >= dateRange.start &&
      m.timestamp <= dateRange.end
    );
  }

  async getDeploymentEvents(projectId: UUID, dateRange: DateRange): Promise<DeploymentEvent[]> {
    return this.deploymentEvents.filter(e => 
      e.projectId === projectId &&
      e.timestamp >= dateRange.start &&
      e.timestamp <= dateRange.end
    );
  }

  async getChangeEvents(projectId: UUID, dateRange: DateRange): Promise<ChangeEvent[]> {
    return this.changeEvents.filter(e => 
      e.projectId === projectId &&
      e.timestamp >= dateRange.start &&
      e.timestamp <= dateRange.end
    );
  }

  async getIncidentEvents(projectId: UUID, dateRange: DateRange): Promise<IncidentEvent[]> {
    return this.incidentEvents.filter(e => 
      e.projectId === projectId &&
      e.timestamp >= dateRange.start &&
      e.timestamp <= dateRange.end
    );
  }

  // Helper methods for testing
  addDeploymentEvent(event: DeploymentEvent): void {
    this.deploymentEvents.push(event);
  }

  addChangeEvent(event: ChangeEvent): void {
    this.changeEvents.push(event);
  }

  addIncidentEvent(event: IncidentEvent): void {
    this.incidentEvents.push(event);
  }

  clear(): void {
    this.metricData = [];
    this.deploymentEvents = [];
    this.changeEvents = [];
    this.incidentEvents = [];
  }
}

describe('DORAMetricsService', () => {
  let service: DORAMetricsService;
  let mockRepository: MockDORAMetricsRepository;
  const projectId = 'test-project-123' as UUID;

  const defaultConfig: DORAMetricsConfig = {
    calculationInterval: 60,
    retentionPeriod: 90,
    alertThresholds: {
      deploymentFrequency: { min: 0.1, max: 10 },
      leadTime: { max: 168 },
      changeFailureRate: { max: 15 },
      recoveryTime: { max: 24 }
    }
  };

  beforeEach(() => {
    mockRepository = new MockDORAMetricsRepository();
    service = new DORAMetricsService(mockRepository, defaultConfig);
  });

  afterEach(() => {
    mockRepository.clear();
  });

  describe('processDeploymentEvent', () => {
    it('should process deployment event and trigger metrics calculation', async () => {
      const event: DeploymentEvent = {
        id: 'deploy-1' as UUID,
        projectId,
        timestamp: new Date(),
        status: 'success',
        commitSha: 'commit-1',
        environment: 'production',
        duration: 10,
        rollbackRequired: false
      };

      await service.processDeploymentEvent(event);

      // Verify metrics were calculated and stored
      const storedMetrics = await mockRepository.getMetricData(
        projectId,
        [MetricType.DORA_DEPLOYMENT_FREQUENCY],
        { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() }
      );

      expect(storedMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('processChangeEvent', () => {
    it('should process change event with deployment timestamp', async () => {
      const event: ChangeEvent = {
        id: 'change-1' as UUID,
        projectId,
        commitSha: 'commit-1',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        author: 'dev1',
        deployedAt: new Date() // Just deployed
      };

      await service.processChangeEvent(event);

      // Verify metrics were calculated and stored
      const storedMetrics = await mockRepository.getMetricData(
        projectId,
        [MetricType.DORA_LEAD_TIME],
        { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() }
      );

      expect(storedMetrics.length).toBeGreaterThan(0);
    });

    it('should not trigger calculation for change without deployment timestamp', async () => {
      const event: ChangeEvent = {
        id: 'change-1' as UUID,
        projectId,
        commitSha: 'commit-1',
        timestamp: new Date(),
        author: 'dev1'
        // No deployedAt
      };

      const initialMetricsCount = (await mockRepository.getMetricData(
        projectId,
        [MetricType.DORA_LEAD_TIME],
        { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() }
      )).length;

      await service.processChangeEvent(event);

      const finalMetricsCount = (await mockRepository.getMetricData(
        projectId,
        [MetricType.DORA_LEAD_TIME],
        { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() }
      )).length;

      expect(finalMetricsCount).toBe(initialMetricsCount);
    });
  });

  describe('processIncidentEvent', () => {
    it('should process resolved incident event', async () => {
      const event: IncidentEvent = {
        id: 'incident-1' as UUID,
        projectId,
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        resolvedAt: new Date(), // Just resolved
        severity: 'high',
        description: 'Service outage'
      };

      await service.processIncidentEvent(event);

      // Verify metrics were calculated and stored
      const storedMetrics = await mockRepository.getMetricData(
        projectId,
        [MetricType.DORA_RECOVERY_TIME],
        { start: new Date(Date.now() - 24 * 60 * 60 * 1000), end: new Date() }
      );

      expect(storedMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('getDORAMetricsTrends', () => {
    it('should generate daily trends', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-04')
      };

      // Add some test data
      const deployment: DeploymentEvent = {
        id: 'deploy-1' as UUID,
        projectId,
        timestamp: new Date('2024-01-02'),
        status: 'success',
        commitSha: 'commit-1',
        environment: 'production',
        duration: 10,
        rollbackRequired: false
      };

      await service.processDeploymentEvent(deployment);

      const trends = await service.getDORAMetricsTrends(projectId, dateRange, 'daily');

      expect(trends.length).toBe(3); // 3 days
      expect(trends[0].period.start).toEqual(new Date('2024-01-01'));
      expect(trends[0].period.end).toEqual(new Date('2024-01-02'));
    });

    it('should generate weekly trends', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-15')
      };

      const trends = await service.getDORAMetricsTrends(projectId, dateRange, 'weekly');

      expect(trends.length).toBe(2); // 2 weeks
      expect(trends[0].period.start).toEqual(new Date('2024-01-01'));
      expect(trends[0].period.end).toEqual(new Date('2024-01-08'));
    });
  });

  describe('analyzeDORAPerformance', () => {
    it('should categorize elite performance correctly', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      // Add elite performance data
      const deployments: DeploymentEvent[] = [];
      for (let i = 0; i < 7; i++) {
        deployments.push({
          id: `deploy-${i}` as UUID,
          projectId,
          timestamp: new Date(`2024-01-0${i + 1}`),
          status: 'success',
          commitSha: `commit-${i}`,
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        });
      }

      for (const deployment of deployments) {
        await service.processDeploymentEvent(deployment);
      }

      // Add changes with low lead time
      const changes: ChangeEvent[] = [];
      for (let i = 0; i < 7; i++) {
        changes.push({
          id: `change-${i}` as UUID,
          projectId,
          commitSha: `commit-${i}`,
          timestamp: new Date(`2024-01-0${i + 1}T10:00:00Z`),
          author: 'dev1',
          deployedAt: new Date(`2024-01-0${i + 1}T12:00:00Z`) // 2 hours lead time
        });
      }

      for (const change of changes) {
        await service.processChangeEvent(change);
      }

      const analysis = await service.analyzeDORAPerformance(projectId, dateRange);

      expect(analysis.performance.deploymentFrequency).toBe('elite');
      expect(analysis.performance.leadTime).toBe('elite');
      // Elite performance should have fewer recommendations
      expect(analysis.recommendations.length).toBe(0);
    });

    it('should generate alerts for poor performance', async () => {
      const dateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31') // 30 days
      };

      // Add poor performance data - only 1 deployment in 30 days
      const deployment: DeploymentEvent = {
        id: 'deploy-1' as UUID,
        projectId,
        timestamp: new Date('2024-01-15'),
        status: 'success',
        commitSha: 'commit-1',
        environment: 'production',
        duration: 10,
        rollbackRequired: false
      };

      await service.processDeploymentEvent(deployment);

      // Add change with high lead time
      const change: ChangeEvent = {
        id: 'change-1' as UUID,
        projectId,
        commitSha: 'commit-1',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        author: 'dev1',
        deployedAt: new Date('2024-01-15T10:00:00Z') // 14 days = 336 hours lead time
      };

      await service.processChangeEvent(change);

      const analysis = await service.analyzeDORAPerformance(projectId, dateRange);

      expect(analysis.alerts.length).toBeGreaterThan(0);
      
      const deploymentFreqAlert = analysis.alerts.find(a => a.type === 'deployment_frequency_low');
      expect(deploymentFreqAlert).toBeDefined();
      
      const leadTimeAlert = analysis.alerts.find(a => a.type === 'lead_time_high');
      expect(leadTimeAlert).toBeDefined();
    });
  });

  describe('performance categorization', () => {
    it('should categorize deployment frequency correctly', async () => {
      // Test elite performance (>= 1 deployment per day)
      const eliteProjectId = 'elite-project' as UUID;
      const eliteDateRange: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };
      
      // Add 14 deployments over 7 days = 2 per day (elite)
      for (let i = 0; i < 14; i++) {
        const dayIndex = (i % 7) + 1;
        const deployment: DeploymentEvent = {
          id: `elite-deploy-${i}` as UUID,
          projectId: eliteProjectId,
          timestamp: new Date(`2024-01-${dayIndex.toString().padStart(2, '0')}`),
          status: 'success',
          commitSha: `elite-commit-${i}`,
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        };
        await service.processDeploymentEvent(deployment);
      }
      
      const eliteAnalysis = await service.analyzeDORAPerformance(eliteProjectId, eliteDateRange);
      expect(eliteAnalysis.performance.deploymentFrequency).toBe('elite');

      // Test high performance (>= 0.14 but < 1 deployment per day)
      const highProjectId = 'high-project' as UUID;
      const highDateRange: DateRange = {
        start: new Date('2024-02-01'),
        end: new Date('2024-02-08')
      };
      
      // Add 3 deployments over 7 days = 0.43 per day (high)
      for (let i = 0; i < 3; i++) {
        const deployment: DeploymentEvent = {
          id: `high-deploy-${i}` as UUID,
          projectId: highProjectId,
          timestamp: new Date(`2024-02-0${i + 2}`),
          status: 'success',
          commitSha: `high-commit-${i}`,
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        };
        await service.processDeploymentEvent(deployment);
      }
      
      const highAnalysis = await service.analyzeDORAPerformance(highProjectId, highDateRange);
      expect(highAnalysis.performance.deploymentFrequency).toBe('high');

      // Test medium performance (>= 0.03 but < 0.14 deployment per day)
      const mediumProjectId = 'medium-project' as UUID;
      const mediumDateRange: DateRange = {
        start: new Date('2024-03-01'),
        end: new Date('2024-03-31') // 30 days
      };
      
      // Add 2 deployments over 30 days = 0.067 per day (medium)
      for (let i = 0; i < 2; i++) {
        const deployment: DeploymentEvent = {
          id: `medium-deploy-${i}` as UUID,
          projectId: mediumProjectId,
          timestamp: new Date(`2024-03-${(i * 15) + 5}`), // Spread across the month
          status: 'success',
          commitSha: `medium-commit-${i}`,
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        };
        await service.processDeploymentEvent(deployment);
      }
      
      const mediumAnalysis = await service.analyzeDORAPerformance(mediumProjectId, mediumDateRange);
      expect(mediumAnalysis.performance.deploymentFrequency).toBe('medium');

      // Test low performance (< 0.03 deployment per day)
      const lowProjectId = 'low-project' as UUID;
      const lowDateRange: DateRange = {
        start: new Date('2024-04-01'),
        end: new Date('2024-04-30') // 29 days
      };
      
      // Add 0 deployments = 0 per day (low)
      const lowAnalysis = await service.analyzeDORAPerformance(lowProjectId, lowDateRange);
      expect(lowAnalysis.performance.deploymentFrequency).toBe('low');
    });
  });
});