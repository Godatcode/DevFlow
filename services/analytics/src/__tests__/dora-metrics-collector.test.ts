import { DORAMetricsCollector, DeploymentEvent, ChangeEvent, IncidentEvent } from '../dora-metrics-collector';
import { UUID } from '@devflow/shared-types';

describe('DORAMetricsCollector', () => {
  let collector: DORAMetricsCollector;
  const projectId = 'test-project-123' as UUID;

  beforeEach(() => {
    collector = new DORAMetricsCollector();
  });

  describe('calculateDeploymentFrequency', () => {
    it('should calculate deployment frequency correctly', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08') // 7 days
      };

      // Add 7 successful deployments over 7 days
      for (let i = 0; i < 7; i++) {
        const event: DeploymentEvent = {
          id: `deploy-${i}` as UUID,
          projectId,
          timestamp: new Date(`2024-01-0${i + 1}`),
          status: 'success',
          commitSha: `commit-${i}`,
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        };
        await collector.recordDeploymentEvent(event);
      }

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      
      // 7 deployments over 7 days = 1 deployment per day
      expect(metrics.deploymentFrequency).toBe(1);
    });

    it('should handle zero deployments', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      expect(metrics.deploymentFrequency).toBe(0);
    });

    it('should only count successful deployments', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-03') // 2 days
      };

      // Add 1 successful and 1 failed deployment
      const successEvent: DeploymentEvent = {
        id: 'deploy-success' as UUID,
        projectId,
        timestamp: new Date('2024-01-01'),
        status: 'success',
        commitSha: 'commit-1',
        environment: 'production',
        duration: 10,
        rollbackRequired: false
      };

      const failEvent: DeploymentEvent = {
        id: 'deploy-fail' as UUID,
        projectId,
        timestamp: new Date('2024-01-02'),
        status: 'failure',
        commitSha: 'commit-2',
        environment: 'production',
        duration: 5,
        rollbackRequired: false
      };

      await collector.recordDeploymentEvent(successEvent);
      await collector.recordDeploymentEvent(failEvent);

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      
      // Only 1 successful deployment over 2 days = 0.5 per day
      expect(metrics.deploymentFrequency).toBe(0.5);
    });
  });

  describe('calculateLeadTime', () => {
    it('should calculate median lead time correctly', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      // Add changes with different lead times
      const changes: ChangeEvent[] = [
        {
          id: 'change-1' as UUID,
          projectId,
          commitSha: 'commit-1',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          author: 'dev1',
          deployedAt: new Date('2024-01-01T12:00:00Z') // 2 hours lead time
        },
        {
          id: 'change-2' as UUID,
          projectId,
          commitSha: 'commit-2',
          timestamp: new Date('2024-01-02T10:00:00Z'),
          author: 'dev2',
          deployedAt: new Date('2024-01-02T14:00:00Z') // 4 hours lead time
        },
        {
          id: 'change-3' as UUID,
          projectId,
          commitSha: 'commit-3',
          timestamp: new Date('2024-01-03T10:00:00Z'),
          author: 'dev3',
          deployedAt: new Date('2024-01-03T16:00:00Z') // 6 hours lead time
        }
      ];

      for (const change of changes) {
        await collector.recordChangeEvent(change);
      }

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      
      // Median of [2, 4, 6] = 4 hours
      expect(metrics.leadTimeForChanges).toBe(4);
    });

    it('should handle changes without deployment timestamps', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      const change: ChangeEvent = {
        id: 'change-1' as UUID,
        projectId,
        commitSha: 'commit-1',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        author: 'dev1'
        // No deployedAt timestamp
      };

      await collector.recordChangeEvent(change);

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      expect(metrics.leadTimeForChanges).toBe(0);
    });
  });

  describe('calculateChangeFailureRate', () => {
    it('should calculate change failure rate correctly', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      // Add 4 deployments: 1 failed, 1 with rollback, 2 successful
      const deployments: DeploymentEvent[] = [
        {
          id: 'deploy-1' as UUID,
          projectId,
          timestamp: new Date('2024-01-01'),
          status: 'failure',
          commitSha: 'commit-1',
          environment: 'production',
          duration: 5,
          rollbackRequired: false
        },
        {
          id: 'deploy-2' as UUID,
          projectId,
          timestamp: new Date('2024-01-02'),
          status: 'success',
          commitSha: 'commit-2',
          environment: 'production',
          duration: 10,
          rollbackRequired: true
        },
        {
          id: 'deploy-3' as UUID,
          projectId,
          timestamp: new Date('2024-01-03'),
          status: 'success',
          commitSha: 'commit-3',
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        },
        {
          id: 'deploy-4' as UUID,
          projectId,
          timestamp: new Date('2024-01-04'),
          status: 'success',
          commitSha: 'commit-4',
          environment: 'production',
          duration: 10,
          rollbackRequired: false
        }
      ];

      for (const deployment of deployments) {
        await collector.recordDeploymentEvent(deployment);
      }

      // Add an incident for one of the deployments to test incident-based failure detection
      const incident: IncidentEvent = {
        id: 'incident-1' as UUID,
        projectId,
        timestamp: new Date('2024-01-05'),
        severity: 'high',
        causedByDeployment: 'deploy-3' as UUID, // This will make deploy-3 count as failed too
        description: 'Service outage after deployment'
      };
      await collector.recordIncidentEvent(incident);

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      
      // 3 failed deployments out of 4 total = 75%
      // (1 failure status + 1 rollback + 1 caused incident)
      expect(metrics.changeFailureRate).toBe(75);
    });

    it('should handle deployments caused by incidents', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      const deployment: DeploymentEvent = {
        id: 'deploy-1' as UUID,
        projectId,
        timestamp: new Date('2024-01-01'),
        status: 'success',
        commitSha: 'commit-1',
        environment: 'production',
        duration: 10,
        rollbackRequired: false
      };

      const incident: IncidentEvent = {
        id: 'incident-1' as UUID,
        projectId,
        timestamp: new Date('2024-01-01T01:00:00Z'),
        severity: 'high',
        causedByDeployment: 'deploy-1' as UUID,
        description: 'Service outage after deployment'
      };

      await collector.recordDeploymentEvent(deployment);
      await collector.recordIncidentEvent(incident);

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      
      // 1 deployment caused incident = 100% failure rate
      expect(metrics.changeFailureRate).toBe(100);
    });
  });

  describe('calculateRecoveryTime', () => {
    it('should calculate mean recovery time correctly', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      const incidents: IncidentEvent[] = [
        {
          id: 'incident-1' as UUID,
          projectId,
          timestamp: new Date('2024-01-01T10:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'), // 2 hours
          severity: 'high',
          description: 'Service outage'
        },
        {
          id: 'incident-2' as UUID,
          projectId,
          timestamp: new Date('2024-01-02T10:00:00Z'),
          resolvedAt: new Date('2024-01-02T14:00:00Z'), // 4 hours
          severity: 'medium',
          description: 'Performance degradation'
        }
      ];

      for (const incident of incidents) {
        await collector.recordIncidentEvent(incident);
      }

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      
      // Mean of [2, 4] = 3 hours
      expect(metrics.timeToRestoreService).toBe(3);
    });

    it('should handle unresolved incidents', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-08')
      };

      const incident: IncidentEvent = {
        id: 'incident-1' as UUID,
        projectId,
        timestamp: new Date('2024-01-01T10:00:00Z'),
        // No resolvedAt timestamp
        severity: 'high',
        description: 'Ongoing service outage'
      };

      await collector.recordIncidentEvent(incident);

      const metrics = await collector.calculateDORAMetrics(projectId, dateRange);
      expect(metrics.timeToRestoreService).toBe(0);
    });
  });

  describe('generateMetricData', () => {
    it('should generate correct metric data objects', async () => {
      const teamId = 'test-team-123' as UUID;
      const metrics = {
        deploymentFrequency: 1.5,
        leadTimeForChanges: 24,
        changeFailureRate: 10,
        timeToRestoreService: 2,
        period: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-08')
        }
      };

      const metricData = await collector.generateMetricData(projectId, teamId, metrics);

      expect(metricData).toHaveLength(4);
      
      const deploymentFreqMetric = metricData.find(m => m.type === 'dora_deployment_frequency');
      expect(deploymentFreqMetric).toBeDefined();
      expect(deploymentFreqMetric?.value).toBe(1.5);
      expect(deploymentFreqMetric?.unit).toBe('deployments/day');
      expect(deploymentFreqMetric?.projectId).toBe(projectId);
      expect(deploymentFreqMetric?.teamId).toBe(teamId);

      const leadTimeMetric = metricData.find(m => m.type === 'dora_lead_time');
      expect(leadTimeMetric).toBeDefined();
      expect(leadTimeMetric?.value).toBe(24);
      expect(leadTimeMetric?.unit).toBe('hours');

      const changeFailureMetric = metricData.find(m => m.type === 'dora_change_failure_rate');
      expect(changeFailureMetric).toBeDefined();
      expect(changeFailureMetric?.value).toBe(10);
      expect(changeFailureMetric?.unit).toBe('percentage');

      const recoveryTimeMetric = metricData.find(m => m.type === 'dora_recovery_time');
      expect(recoveryTimeMetric).toBeDefined();
      expect(recoveryTimeMetric?.value).toBe(2);
      expect(recoveryTimeMetric?.unit).toBe('hours');
    });
  });
});