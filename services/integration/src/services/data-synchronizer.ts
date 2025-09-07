import { DataSynchronizer, SyncStatus } from '../interfaces';
import { 
  UUID, 
  SyncType, 
  SyncResult, 
  Integration,
  IntegrationProvider 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';
import { GitHubAdapter } from '../adapters/github-adapter';
import { GitLabAdapter } from '../adapters/gitlab-adapter';
import { BitbucketAdapter } from '../adapters/bitbucket-adapter';
import { JiraAdapter } from '../adapters/jira-adapter';
import { LinearAdapter } from '../adapters/linear-adapter';
import { AzureDevOpsAdapter } from '../adapters/azure-devops-adapter';

export interface SyncJob {
  id: UUID;
  integrationId: UUID;
  syncType: SyncType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: SyncResult;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export class DataSynchronizerService implements DataSynchronizer {
  private readonly logger = new Logger('DataSynchronizerService');
  private readonly syncJobs = new Map<UUID, SyncJob>();
  private readonly syncStatus = new Map<UUID, SyncStatus>();
  private readonly adapters = new Map<IntegrationProvider, any>();
  private readonly syncQueue: SyncJob[] = [];
  private isProcessing = false;

  constructor() {
    this.adapters.set(IntegrationProvider.GITHUB, new GitHubAdapter());
    this.adapters.set(IntegrationProvider.GITLAB, new GitLabAdapter());
    this.adapters.set(IntegrationProvider.BITBUCKET, new BitbucketAdapter());
    this.adapters.set(IntegrationProvider.JIRA, new JiraAdapter());
    this.adapters.set(IntegrationProvider.LINEAR, new LinearAdapter());
    this.adapters.set(IntegrationProvider.AZURE_DEVOPS, new AzureDevOpsAdapter());
    
    // Start the sync processor
    this.startSyncProcessor();
  }

  async scheduleSync(integrationId: UUID, syncType: SyncType): Promise<void> {
    this.logger.info('Scheduling sync', { integrationId, syncType });

    const jobId = this.generateJobId();
    const syncJob: SyncJob = {
      id: jobId,
      integrationId,
      syncType,
      status: 'pending',
      scheduledAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
    };

    this.syncJobs.set(jobId, syncJob);
    this.syncQueue.push(syncJob);

    // Update sync status
    this.updateSyncStatus(integrationId, {
      integrationId,
      isRunning: false,
      nextSync: new Date(),
    });

    this.logger.info('Sync scheduled', { jobId, integrationId, syncType });
  }

  async cancelSync(integrationId: UUID): Promise<void> {
    this.logger.info('Cancelling sync', { integrationId });

    // Remove pending jobs from queue
    const pendingJobIndex = this.syncQueue.findIndex(
      job => job.integrationId === integrationId && job.status === 'pending'
    );

    if (pendingJobIndex !== -1) {
      const job = this.syncQueue.splice(pendingJobIndex, 1)[0];
      job.status = 'failed';
      job.error = 'Cancelled by user';
      job.completedAt = new Date();
    }

    // Update sync status
    this.updateSyncStatus(integrationId, {
      integrationId,
      isRunning: false,
    });

    this.logger.info('Sync cancelled', { integrationId });
  }

  async getSyncStatus(integrationId: UUID): Promise<SyncStatus> {
    const status = this.syncStatus.get(integrationId);
    if (!status) {
      return {
        integrationId,
        isRunning: false,
      };
    }
    return status;
  }

  async getSyncHistory(integrationId: UUID, limit = 10): Promise<SyncResult[]> {
    const jobs = Array.from(this.syncJobs.values())
      .filter(job => job.integrationId === integrationId && job.result)
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
      .slice(0, limit);

    return jobs.map(job => job.result!).filter(Boolean);
  }

  private async startSyncProcessor(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.logger.info('Starting sync processor');

    while (this.isProcessing) {
      try {
        const job = this.syncQueue.shift();
        if (!job) {
          // Wait for new jobs
          await this.sleep(1000);
          continue;
        }

        await this.processSync(job);
      } catch (error) {
        this.logger.error('Error in sync processor', { error });
        await this.sleep(5000); // Wait before retrying
      }
    }
  }

  private async processSync(job: SyncJob): Promise<void> {
    this.logger.info('Processing sync job', { jobId: job.id, integrationId: job.integrationId });

    try {
      job.status = 'running';
      job.startedAt = new Date();

      // Update sync status
      this.updateSyncStatus(job.integrationId, {
        integrationId: job.integrationId,
        isRunning: true,
        progress: 0,
      });

      // Get integration details (in a real implementation, this would come from a database)
      const integration = await this.getIntegration(job.integrationId);
      if (!integration) {
        throw new Error(`Integration not found: ${job.integrationId}`);
      }

      // Get appropriate adapter
      const adapter = this.adapters.get(integration.provider);
      if (!adapter) {
        throw new Error(`No adapter found for provider: ${integration.provider}`);
      }

      // Perform sync
      const result = await adapter.syncData(integration, job.syncType);

      // Update job with result
      job.status = result.success ? 'completed' : 'failed';
      job.completedAt = new Date();
      job.result = result;
      if (!result.success) {
        job.error = result.error;
      }

      // Update sync status
      this.updateSyncStatus(job.integrationId, {
        integrationId: job.integrationId,
        isRunning: false,
        lastSync: new Date(),
        progress: 100,
      });

      this.logger.info('Sync job completed', { 
        jobId: job.id, 
        integrationId: job.integrationId,
        success: result.success,
        recordsProcessed: result.recordsProcessed 
      });

    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown error';

      // Update sync status
      this.updateSyncStatus(job.integrationId, {
        integrationId: job.integrationId,
        isRunning: false,
        error: job.error,
      });

      this.logger.error('Sync job failed', { 
        jobId: job.id, 
        integrationId: job.integrationId,
        error: job.error 
      });

      // Retry if possible
      if (job.retryCount < job.maxRetries) {
        job.retryCount++;
        job.status = 'pending';
        job.startedAt = undefined;
        job.completedAt = undefined;
        job.error = undefined;
        
        // Add back to queue with delay
        setTimeout(() => {
          this.syncQueue.push(job);
        }, Math.pow(2, job.retryCount) * 1000); // Exponential backoff

        this.logger.info('Sync job scheduled for retry', { 
          jobId: job.id, 
          integrationId: job.integrationId,
          retryCount: job.retryCount 
        });
      }
    }
  }

  private updateSyncStatus(integrationId: UUID, updates: Partial<SyncStatus>): void {
    const currentStatus = this.syncStatus.get(integrationId) || {
      integrationId,
      isRunning: false,
    };

    const newStatus = { ...currentStatus, ...updates };
    this.syncStatus.set(integrationId, newStatus);
  }

  private generateJobId(): UUID {
    return crypto.randomUUID() as UUID;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getIntegration(integrationId: UUID): Promise<Integration | null> {
    // In a real implementation, this would query the database
    // For now, return a mock integration
    return {
      id: integrationId,
      name: 'Mock Integration',
      provider: IntegrationProvider.GITHUB,
      type: 'version_control' as any,
      config: {
        apiUrl: 'https://api.github.com',
        credentials: {
          type: 'api_key' as any,
          data: { token: 'mock-token' },
        },
        settings: {},
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 5000,
        },
      },
      syncSchedule: {
        enabled: true,
        frequency: '0 */6 * * *', // Every 6 hours
      },
      projectIds: [],
      teamIds: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Additional utility methods

  async getSyncJobStatus(jobId: UUID): Promise<SyncJob | undefined> {
    return this.syncJobs.get(jobId);
  }

  async listActiveSyncs(): Promise<SyncJob[]> {
    return Array.from(this.syncJobs.values()).filter(job => job.status === 'running');
  }

  async getSyncMetrics(integrationId: UUID): Promise<SyncMetrics> {
    const jobs = Array.from(this.syncJobs.values())
      .filter(job => job.integrationId === integrationId);

    const totalJobs = jobs.length;
    const completedJobs = jobs.filter(job => job.status === 'completed').length;
    const failedJobs = jobs.filter(job => job.status === 'failed').length;
    const averageDuration = jobs
      .filter(job => job.result)
      .reduce((sum, job) => sum + job.result!.duration, 0) / completedJobs || 0;

    return {
      integrationId,
      totalSyncs: totalJobs,
      successfulSyncs: completedJobs,
      failedSyncs: failedJobs,
      averageSyncDuration: averageDuration,
      lastSync: jobs
        .filter(job => job.completedAt)
        .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))[0]?.completedAt,
    };
  }

  stopSyncProcessor(): void {
    this.isProcessing = false;
    this.logger.info('Sync processor stopped');
  }
}

export interface SyncMetrics {
  integrationId: UUID;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageSyncDuration: number;
  lastSync?: Date;
}