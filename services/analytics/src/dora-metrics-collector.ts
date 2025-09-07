import { 
  DORAMetrics, 
  MetricData, 
  MetricType, 
  UUID 
} from '@devflow/shared-types';
import { DateRange } from './interfaces';

export interface DeploymentEvent {
  id: UUID;
  projectId: UUID;
  timestamp: Date;
  status: 'success' | 'failure';
  commitSha: string;
  environment: string;
  duration: number; // in minutes
  rollbackRequired: boolean;
}

export interface ChangeEvent {
  id: UUID;
  projectId: UUID;
  commitSha: string;
  timestamp: Date;
  author: string;
  pullRequestId?: UUID;
  mergedAt?: Date;
  deployedAt?: Date;
}

export interface IncidentEvent {
  id: UUID;
  projectId: UUID;
  timestamp: Date;
  resolvedAt?: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  causedByDeployment?: UUID;
  description: string;
}

export class DORAMetricsCollector {
  private deploymentEvents: Map<UUID, DeploymentEvent[]> = new Map();
  private changeEvents: Map<UUID, ChangeEvent[]> = new Map();
  private incidentEvents: Map<UUID, IncidentEvent[]> = new Map();

  /**
   * Records a deployment event for DORA metrics calculation
   */
  async recordDeploymentEvent(event: DeploymentEvent): Promise<void> {
    const projectEvents = this.deploymentEvents.get(event.projectId) || [];
    projectEvents.push(event);
    this.deploymentEvents.set(event.projectId, projectEvents);
  }

  /**
   * Records a code change event for lead time calculation
   */
  async recordChangeEvent(event: ChangeEvent): Promise<void> {
    const projectEvents = this.changeEvents.get(event.projectId) || [];
    projectEvents.push(event);
    this.changeEvents.set(event.projectId, projectEvents);
  }

  /**
   * Records an incident event for recovery time calculation
   */
  async recordIncidentEvent(event: IncidentEvent): Promise<void> {
    const projectEvents = this.incidentEvents.get(event.projectId) || [];
    projectEvents.push(event);
    this.incidentEvents.set(event.projectId, projectEvents);
  }

  /**
   * Calculates DORA metrics for a given project and date range
   */
  async calculateDORAMetrics(projectId: UUID, dateRange: DateRange): Promise<DORAMetrics> {
    const deployments = this.getEventsInRange(
      this.deploymentEvents.get(projectId) || [],
      dateRange
    );
    const changes = this.getEventsInRange(
      this.changeEvents.get(projectId) || [],
      dateRange
    );
    const incidents = this.getEventsInRange(
      this.incidentEvents.get(projectId) || [],
      dateRange
    );

    return {
      deploymentFrequency: this.calculateDeploymentFrequency(deployments, dateRange),
      leadTimeForChanges: this.calculateLeadTime(changes, deployments),
      changeFailureRate: this.calculateChangeFailureRate(deployments, incidents),
      timeToRestoreService: this.calculateRecoveryTime(incidents),
      period: {
        start: dateRange.start,
        end: dateRange.end
      }
    };
  }

  /**
   * Calculates deployment frequency (deployments per day)
   */
  private calculateDeploymentFrequency(
    deployments: DeploymentEvent[], 
    dateRange: DateRange
  ): number {
    const daysDiff = Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysDiff === 0) return 0;
    
    const successfulDeployments = deployments.filter(d => d.status === 'success');
    return successfulDeployments.length / daysDiff;
  }

  /**
   * Calculates lead time for changes (hours from commit to deployment)
   */
  private calculateLeadTime(
    changes: ChangeEvent[], 
    deployments: DeploymentEvent[]
  ): number {
    const leadTimes: number[] = [];

    for (const change of changes) {
      if (!change.deployedAt) continue;

      const leadTimeMs = change.deployedAt.getTime() - change.timestamp.getTime();
      const leadTimeHours = leadTimeMs / (1000 * 60 * 60);
      leadTimes.push(leadTimeHours);
    }

    if (leadTimes.length === 0) return 0;

    // Return median lead time
    leadTimes.sort((a, b) => a - b);
    const mid = Math.floor(leadTimes.length / 2);
    return leadTimes.length % 2 === 0
      ? (leadTimes[mid - 1] + leadTimes[mid]) / 2
      : leadTimes[mid];
  }

  /**
   * Calculates change failure rate (percentage of deployments causing incidents)
   */
  private calculateChangeFailureRate(
    deployments: DeploymentEvent[], 
    incidents: IncidentEvent[]
  ): number {
    if (deployments.length === 0) return 0;

    const failedDeployments = deployments.filter(deployment => {
      return incidents.some(incident => 
        incident.causedByDeployment === deployment.id
      ) || deployment.rollbackRequired || deployment.status === 'failure';
    });

    return (failedDeployments.length / deployments.length) * 100;
  }

  /**
   * Calculates mean time to restore service (hours)
   */
  private calculateRecoveryTime(incidents: IncidentEvent[]): number {
    const recoveryTimes: number[] = [];

    for (const incident of incidents) {
      if (!incident.resolvedAt) continue;

      const recoveryTimeMs = incident.resolvedAt.getTime() - incident.timestamp.getTime();
      const recoveryTimeHours = recoveryTimeMs / (1000 * 60 * 60);
      recoveryTimes.push(recoveryTimeHours);
    }

    if (recoveryTimes.length === 0) return 0;

    // Return mean recovery time
    return recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length;
  }

  /**
   * Filters events to those within the specified date range
   */
  private getEventsInRange<T extends { timestamp: Date }>(
    events: T[], 
    dateRange: DateRange
  ): T[] {
    return events.filter(event => 
      event.timestamp >= dateRange.start && event.timestamp <= dateRange.end
    );
  }

  /**
   * Generates metric data objects for storage
   */
  async generateMetricData(
    projectId: UUID, 
    teamId: UUID, 
    metrics: DORAMetrics
  ): Promise<MetricData[]> {
    const timestamp = new Date();
    
    return [
      {
        id: this.generateUUID(),
        type: MetricType.DORA_DEPLOYMENT_FREQUENCY,
        value: metrics.deploymentFrequency,
        unit: 'deployments/day',
        projectId,
        teamId,
        timestamp,
        metadata: { period: metrics.period },
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: this.generateUUID(),
        type: MetricType.DORA_LEAD_TIME,
        value: metrics.leadTimeForChanges,
        unit: 'hours',
        projectId,
        teamId,
        timestamp,
        metadata: { period: metrics.period },
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: this.generateUUID(),
        type: MetricType.DORA_CHANGE_FAILURE_RATE,
        value: metrics.changeFailureRate,
        unit: 'percentage',
        projectId,
        teamId,
        timestamp,
        metadata: { period: metrics.period },
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: this.generateUUID(),
        type: MetricType.DORA_RECOVERY_TIME,
        value: metrics.timeToRestoreService,
        unit: 'hours',
        projectId,
        teamId,
        timestamp,
        metadata: { period: metrics.period },
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];
  }

  private generateUUID(): UUID {
    return crypto.randomUUID() as UUID;
  }
}