import { IntegrationAdapter } from '../interfaces';
import {
  IntegrationProvider,
  Integration,
  Credentials,
  AuthToken,
  SyncType,
  SyncResult,
  WebhookPayload,
  AuthType
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export interface GCPCloudBuildTrigger {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  disabled?: boolean;
  substitutions?: Record<string, string>;
  filename?: string;
  ignoredFiles?: string[];
  includedFiles?: string[];
  triggerTemplate?: {
    projectId: string;
    repoName: string;
    branchName?: string;
    tagName?: string;
    commitSha?: string;
    dir?: string;
    invertRegex?: boolean;
  };
  github?: {
    owner: string;
    name: string;
    pullRequest?: {
      branch: string;
      commentControl?: string;
      invertRegex?: boolean;
    };
    push?: {
      branch?: string;
      tag?: string;
      invertRegex?: boolean;
    };
  };
  build?: GCPCloudBuild;
  createTime: string;
  updateTime: string;
}

export interface GCPCloudBuild {
  id?: string;
  projectId: string;
  status?: 'STATUS_UNKNOWN' | 'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'INTERNAL_ERROR' | 'TIMEOUT' | 'CANCELLED' | 'EXPIRED';
  statusDetail?: string;
  source?: {
    storageSource?: {
      bucket: string;
      object: string;
      generation?: string;
    };
    repoSource?: {
      projectId: string;
      repoName: string;
      branchName?: string;
      tagName?: string;
      commitSha?: string;
      dir?: string;
      invertRegex?: boolean;
    };
  };
  steps: GCPBuildStep[];
  results?: {
    images?: any[];
    buildStepImages?: string[];
    artifactManifest?: string;
    numArtifacts?: string;
    buildStepOutputs?: string[];
    artifactTiming?: any;
    pythonPackages?: any[];
    mavenArtifacts?: any[];
  };
  createTime?: string;
  startTime?: string;
  finishTime?: string;
  timeout?: string;
  images?: string[];
  queueTtl?: string;
  artifacts?: any;
  logsBucket?: string;
  sourceProvenance?: any;
  buildTriggerId?: string;
  options?: any;
  logUrl?: string;
  substitutions?: Record<string, string>;
  tags?: string[];
  secrets?: any[];
  timing?: Record<string, any>;
  approval?: any;
  serviceAccount?: string;
  availableSecrets?: any;
  warnings?: any[];
  failureInfo?: any;
}

export interface GCPBuildStep {
  name: string;
  env?: string[];
  args?: string[];
  dir?: string;
  id?: string;
  waitFor?: string[];
  entrypoint?: string;
  secretEnv?: string[];
  volumes?: any[];
  timing?: any;
  pullTiming?: any;
  timeout?: string;
  status?: string;
}

export interface GCPComputeInstance {
  id: string;
  creationTimestamp: string;
  name: string;
  description?: string;
  tags?: {
    items?: string[];
    fingerprint?: string;
  };
  machineType: string;
  status: 'PROVISIONING' | 'STAGING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'SUSPENDING' | 'SUSPENDED' | 'TERMINATED';
  zone: string;
  canIpForward?: boolean;
  networkInterfaces: any[];
  disks: any[];
  metadata?: {
    kind?: string;
    fingerprint?: string;
    items?: any[];
  };
  serviceAccounts?: any[];
  selfLink: string;
  scheduling?: any;
  cpuPlatform?: string;
  labelFingerprint?: string;
  labels?: Record<string, string>;
  startRestricted?: boolean;
  deletionProtection?: boolean;
  reservationAffinity?: any;
  displayDevice?: any;
  shieldedInstanceConfig?: any;
  shieldedInstanceIntegrityPolicy?: any;
  confidentialInstanceConfig?: any;
  fingerprint?: string;
  lastStartTimestamp?: string;
  lastStopTimestamp?: string;
  lastSuspendedTimestamp?: string;
  satisfiesPzs?: boolean;
}

export class GCPAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.GCP;
  private readonly logger = new Logger('GCPAdapter');
  private readonly baseUrl = 'https://cloudbuild.googleapis.com/v1';
  private readonly computeUrl = 'https://compute.googleapis.com/compute/v1';
  private readonly projectId: string;

  constructor(projectId?: string) {
    this.projectId = projectId || 'default-project';
  }

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Google Cloud Platform');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateServiceAccount(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri } = credentials.data;
    
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`GCP OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`GCP OAuth authentication failed: ${data.error_description}`);
    }
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateServiceAccount(credentials: Credentials): Promise<AuthToken> {
    const { service_account_key } = credentials.data;
    
    let serviceAccountData;
    try {
      serviceAccountData = typeof service_account_key === 'string' 
        ? JSON.parse(service_account_key) 
        : service_account_key;
    } catch (error) {
      throw new Error('Invalid service account key format');
    }

    // Create JWT for service account authentication
    const jwt = await this.createServiceAccountJWT(serviceAccountData);
    
    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`GCP service account authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`GCP service account authentication failed: ${data.error_description}`);
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = this.getToken(integration);
      
      const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/triggers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('GCP connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting GCP data sync', { integrationId: integration.id, syncType });

    try {
      const token = this.getToken(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync Cloud Build triggers
      const triggers = await this.fetchBuildTriggers(token);
      recordsProcessed += triggers.length;
      recordsCreated += triggers.length; // Simplified for now

      // Sync recent builds
      const builds = await this.fetchBuilds(token);
      recordsProcessed += builds.length;
      recordsCreated += builds.length; // Simplified for now

      // Sync Compute Engine instances
      const instances = await this.fetchComputeInstances(token);
      recordsProcessed += instances.length;
      recordsCreated += instances.length; // Simplified for now

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        integrationId: integration.id,
        syncType,
        success: true,
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsDeleted: 0,
        duration,
        startTime,
        endTime,
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error('GCP sync failed', { error, integrationId: integration.id });

      return {
        integrationId: integration.id,
        syncType,
        success: false,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
        endTime,
      };
    }
  }

  async processWebhook(webhook: WebhookPayload): Promise<void> {
    this.logger.info('Processing GCP webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'google.cloud.build.Build':
        await this.handleBuildEvent(webhook.data);
        break;
      case 'google.cloud.compute.Instance':
        await this.handleComputeInstanceEvent(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled GCP webhook event', { event: webhook.event });
    }
  }

  private getToken(integration: Integration): string {
    const credentials = integration.config.credentials;
    return credentials.data.access_token || credentials.data.token;
  }

  private async createServiceAccountJWT(serviceAccountData: any): Promise<string> {
    // This is a simplified JWT creation
    // In a real implementation, you would use a proper JWT library
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountData.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    // In a real implementation, you would sign this with the private key
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    return `${encodedHeader}.${encodedPayload}.mock-signature`;
  }

  private async fetchBuildTriggers(token: string): Promise<GCPCloudBuildTrigger[]> {
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/triggers`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch build triggers: ${response.statusText}`);
    }

    const data = await response.json();
    return data.triggers || [];
  }

  private async fetchBuilds(token: string): Promise<GCPCloudBuild[]> {
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/builds?pageSize=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch builds: ${response.statusText}`);
    }

    const data = await response.json();
    return data.builds || [];
  }

  private async fetchComputeInstances(token: string): Promise<GCPComputeInstance[]> {
    // This would typically aggregate instances from all zones
    // For simplicity, we'll just fetch from one zone
    const zone = 'us-central1-a';
    
    const response = await fetch(`${this.computeUrl}/projects/${this.projectId}/zones/${zone}/instances`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch compute instances: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  private async handleBuildEvent(data: any): Promise<void> {
    this.logger.info('Handling build event', { 
      buildId: data.id,
      status: data.status,
      projectId: data.projectId 
    });
    
    // Process build event - send notifications, update metrics, etc.
  }

  private async handleComputeInstanceEvent(data: any): Promise<void> {
    this.logger.info('Handling compute instance event', { 
      instanceId: data.id,
      status: data.status,
      zone: data.zone 
    });
    
    // Process compute instance event - monitor resources, send alerts, etc.
  }

  // Build management methods

  async createBuild(integration: Integration, buildConfig: Partial<GCPCloudBuild>): Promise<string> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/builds`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to create build: ${response.statusText}`);
    }

    const data = await response.json();
    const buildId = data.metadata?.build?.id || data.name;
    
    this.logger.info('Build created', { buildId });
    
    return buildId;
  }

  async cancelBuild(integration: Integration, buildId: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/builds/${buildId}:cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel build: ${response.statusText}`);
    }

    this.logger.info('Build cancelled', { buildId });
  }

  async runBuildTrigger(integration: Integration, triggerId: string, source?: any): Promise<string> {
    const token = this.getToken(integration);
    
    const requestBody = source ? { source } : {};
    
    const response = await fetch(`${this.baseUrl}/projects/${this.projectId}/triggers/${triggerId}:run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to run build trigger: ${response.statusText}`);
    }

    const data = await response.json();
    const buildId = data.metadata?.build?.id || data.name;
    
    this.logger.info('Build trigger executed', { triggerId, buildId });
    
    return buildId;
  }

  // Compute Engine management methods

  async startInstance(integration: Integration, zone: string, instanceName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.computeUrl}/projects/${this.projectId}/zones/${zone}/instances/${instanceName}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to start instance: ${response.statusText}`);
    }

    this.logger.info('Instance start initiated', { zone, instanceName });
  }

  async stopInstance(integration: Integration, zone: string, instanceName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.computeUrl}/projects/${this.projectId}/zones/${zone}/instances/${instanceName}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to stop instance: ${response.statusText}`);
    }

    this.logger.info('Instance stop initiated', { zone, instanceName });
  }

  async restartInstance(integration: Integration, zone: string, instanceName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.computeUrl}/projects/${this.projectId}/zones/${zone}/instances/${instanceName}/reset`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to restart instance: ${response.statusText}`);
    }

    this.logger.info('Instance restart initiated', { zone, instanceName });
  }
}