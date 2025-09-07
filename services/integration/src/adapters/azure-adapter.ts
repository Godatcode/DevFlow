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

export interface AzurePipeline {
  id: number;
  name: string;
  url: string;
  folder: string;
  revision: number;
  configuration: {
    type: string;
    designerJson?: any;
    path?: string;
    repository?: {
      id: string;
      name: string;
      url: string;
      type: string;
      defaultBranch: string;
      clean?: string;
      checkoutSubmodules?: boolean;
    };
    variables?: Record<string, any>;
    variableGroups?: any[];
    demands?: any[];
    pool?: {
      id: number;
      name: string;
      isHosted: boolean;
    };
  };
}

export interface AzurePipelineRun {
  id: number;
  name: string;
  url: string;
  state: 'unknown' | 'inProgress' | 'completed' | 'cancelling' | 'postponed' | 'notStarted';
  result?: 'unknown' | 'succeeded' | 'partiallySucceeded' | 'failed' | 'canceled';
  createdDate: string;
  finishedDate?: string;
  pipeline: {
    id: number;
    name: string;
    url: string;
    folder: string;
    revision: number;
  };
  resources?: {
    repositories?: Record<string, any>;
    pipelines?: Record<string, any>;
    builds?: Record<string, any>;
    containers?: Record<string, any>;
    packages?: Record<string, any>;
  };
  variables?: Record<string, any>;
  templateParameters?: Record<string, any>;
}

export interface AzureResourceGroup {
  id: string;
  name: string;
  type: string;
  location: string;
  managedBy?: string;
  tags?: Record<string, string>;
  properties: {
    provisioningState: string;
  };
}

export interface AzureVirtualMachine {
  id: string;
  name: string;
  type: string;
  location: string;
  tags?: Record<string, string>;
  properties: {
    vmId: string;
    hardwareProfile: {
      vmSize: string;
    };
    storageProfile: {
      imageReference?: any;
      osDisk?: any;
      dataDisks?: any[];
    };
    osProfile?: {
      computerName: string;
      adminUsername: string;
      windowsConfiguration?: any;
      linuxConfiguration?: any;
      secrets?: any[];
      allowExtensionOperations?: boolean;
      requireGuestProvisionSignal?: boolean;
    };
    networkProfile: {
      networkInterfaces: any[];
    };
    diagnosticsProfile?: {
      bootDiagnostics?: any;
    };
    availabilitySet?: any;
    virtualMachineScaleSet?: any;
    proximityPlacementGroup?: any;
    priority?: string;
    evictionPolicy?: string;
    billingProfile?: any;
    host?: any;
    hostGroup?: any;
    provisioningState: string;
    instanceView?: any;
    licenseType?: string;
    extensionsTimeBudget?: string;
    platformFaultDomain?: number;
  };
  resources?: any[];
  identity?: any;
  zones?: string[];
  plan?: any;
}

export class AzureAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.AZURE;
  private readonly logger = new Logger('AzureAdapter');
  private readonly baseUrl = 'https://management.azure.com';
  private readonly devOpsUrl = 'https://dev.azure.com';
  private readonly subscriptionId: string;
  private readonly organization?: string;

  constructor(subscriptionId?: string, organization?: string) {
    this.subscriptionId = subscriptionId || 'default-subscription';
    this.organization = organization;
  }

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with Microsoft Azure');
    
    if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateOAuth(credentials);
    } else if (credentials.type === AuthType.API_KEY) {
      return this.authenticateServicePrincipal(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateOAuth(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, code, redirect_uri, tenant_id } = credentials.data;
    
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    
    const response = await fetch(tokenUrl, {
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
        scope: 'https://management.azure.com/.default',
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure OAuth authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Azure OAuth authentication failed: ${data.error_description}`);
    }
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope?.split(' ') || [],
    };
  }

  private async authenticateServicePrincipal(credentials: Credentials): Promise<AuthToken> {
    const { client_id, client_secret, tenant_id } = credentials.data;
    
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id,
        client_secret,
        grant_type: 'client_credentials',
        scope: 'https://management.azure.com/.default',
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure service principal authentication failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`Azure service principal authentication failed: ${data.error_description}`);
    }

    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const token = this.getToken(integration);
      
      const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/resourcegroups?api-version=2021-04-01`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Azure connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting Azure data sync', { integrationId: integration.id, syncType });

    try {
      const token = this.getToken(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync resource groups
      const resourceGroups = await this.fetchResourceGroups(token);
      recordsProcessed += resourceGroups.length;
      recordsCreated += resourceGroups.length; // Simplified for now

      // Sync virtual machines
      const virtualMachines = await this.fetchVirtualMachines(token);
      recordsProcessed += virtualMachines.length;
      recordsCreated += virtualMachines.length; // Simplified for now

      // Sync Azure DevOps pipelines if organization is configured
      if (this.organization) {
        const pipelines = await this.fetchPipelines(token);
        recordsProcessed += pipelines.length;
        recordsCreated += pipelines.length; // Simplified for now
      }

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

      this.logger.error('Azure sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing Azure webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'ms.vss-pipelines.run-state-changed-event':
        await this.handlePipelineRunStateChanged(webhook.data);
        break;
      case 'ms.vss-pipelines.stage-state-changed-event':
        await this.handlePipelineStageStateChanged(webhook.data);
        break;
      case 'Microsoft.Resources.ResourceWriteSuccess':
        await this.handleResourceWriteSuccess(webhook.data);
        break;
      case 'Microsoft.Resources.ResourceDeleteSuccess':
        await this.handleResourceDeleteSuccess(webhook.data);
        break;
      case 'Microsoft.Compute.VirtualMachineScaleSetVMCreated':
        await this.handleVMCreated(webhook.data);
        break;
      case 'Microsoft.Compute.VirtualMachineScaleSetVMDeleted':
        await this.handleVMDeleted(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled Azure webhook event', { event: webhook.event });
    }
  }

  private getToken(integration: Integration): string {
    const credentials = integration.config.credentials;
    return credentials.data.access_token || credentials.data.token;
  }

  private async fetchResourceGroups(token: string): Promise<AzureResourceGroup[]> {
    const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/resourcegroups?api-version=2021-04-01`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch resource groups: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async fetchVirtualMachines(token: string): Promise<AzureVirtualMachine[]> {
    const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/providers/Microsoft.Compute/virtualMachines?api-version=2021-11-01`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch virtual machines: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async fetchPipelines(token: string): Promise<AzurePipeline[]> {
    if (!this.organization) {
      return [];
    }

    const response = await fetch(`${this.devOpsUrl}/${this.organization}/_apis/pipelines?api-version=6.0-preview.1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pipelines: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  }

  private async handlePipelineRunStateChanged(data: any): Promise<void> {
    this.logger.info('Handling pipeline run state changed event', { 
      runId: data.resource?.id,
      state: data.resource?.state,
      result: data.resource?.result 
    });
    
    // Process pipeline run state change - send notifications, update metrics, etc.
  }

  private async handlePipelineStageStateChanged(data: any): Promise<void> {
    this.logger.info('Handling pipeline stage state changed event', { 
      runId: data.resource?.runId,
      stageName: data.resource?.stageName,
      state: data.resource?.state 
    });
    
    // Process pipeline stage state change - update progress, send notifications, etc.
  }

  private async handleResourceWriteSuccess(data: any): Promise<void> {
    this.logger.info('Handling resource write success event', { 
      resourceId: data.data?.resourceUri,
      resourceType: data.data?.resourceType 
    });
    
    // Process resource write success - update inventory, send notifications, etc.
  }

  private async handleResourceDeleteSuccess(data: any): Promise<void> {
    this.logger.info('Handling resource delete success event', { 
      resourceId: data.data?.resourceUri,
      resourceType: data.data?.resourceType 
    });
    
    // Process resource delete success - update inventory, cleanup references, etc.
  }

  private async handleVMCreated(data: any): Promise<void> {
    this.logger.info('Handling VM created event', { 
      vmId: data.data?.resourceUri 
    });
    
    // Process VM created - setup monitoring, send notifications, etc.
  }

  private async handleVMDeleted(data: any): Promise<void> {
    this.logger.info('Handling VM deleted event', { 
      vmId: data.data?.resourceUri 
    });
    
    // Process VM deleted - cleanup monitoring, send notifications, etc.
  }

  // Pipeline management methods

  async runPipeline(integration: Integration, pipelineId: number, project?: string): Promise<number> {
    if (!this.organization) {
      throw new Error('Organization not configured for Azure DevOps operations');
    }

    const token = this.getToken(integration);
    const projectPath = project ? `/${project}` : '';
    
    const response = await fetch(`${this.devOpsUrl}/${this.organization}${projectPath}/_apis/pipelines/${pipelineId}/runs?api-version=6.0-preview.1`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to run pipeline: ${response.statusText}`);
    }

    const data = await response.json();
    const runId = data.id;
    
    this.logger.info('Pipeline run started', { pipelineId, runId });
    
    return runId;
  }

  async cancelPipelineRun(integration: Integration, runId: number, project?: string): Promise<void> {
    if (!this.organization) {
      throw new Error('Organization not configured for Azure DevOps operations');
    }

    const token = this.getToken(integration);
    const projectPath = project ? `/${project}` : '';
    
    const response = await fetch(`${this.devOpsUrl}/${this.organization}${projectPath}/_apis/pipelines/runs/${runId}?api-version=6.0-preview.1`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: 'cancelling',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel pipeline run: ${response.statusText}`);
    }

    this.logger.info('Pipeline run cancelled', { runId });
  }

  // Virtual Machine management methods

  async startVirtualMachine(integration: Integration, resourceGroupName: string, vmName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}/start?api-version=2021-11-01`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to start virtual machine: ${response.statusText}`);
    }

    this.logger.info('Virtual machine start initiated', { resourceGroupName, vmName });
  }

  async stopVirtualMachine(integration: Integration, resourceGroupName: string, vmName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}/powerOff?api-version=2021-11-01`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to stop virtual machine: ${response.statusText}`);
    }

    this.logger.info('Virtual machine stop initiated', { resourceGroupName, vmName });
  }

  async restartVirtualMachine(integration: Integration, resourceGroupName: string, vmName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}/restart?api-version=2021-11-01`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to restart virtual machine: ${response.statusText}`);
    }

    this.logger.info('Virtual machine restart initiated', { resourceGroupName, vmName });
  }

  async deallocateVirtualMachine(integration: Integration, resourceGroupName: string, vmName: string): Promise<void> {
    const token = this.getToken(integration);
    
    const response = await fetch(`${this.baseUrl}/subscriptions/${this.subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Compute/virtualMachines/${vmName}/deallocate?api-version=2021-11-01`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to deallocate virtual machine: ${response.statusText}`);
    }

    this.logger.info('Virtual machine deallocation initiated', { resourceGroupName, vmName });
  }
}