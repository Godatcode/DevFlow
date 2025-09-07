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

export interface AWSPipeline {
  name: string;
  version: number;
  pipelineArn: string;
  roleArn: string;
  artifactStore: {
    type: string;
    location: string;
    encryptionKey?: {
      id: string;
      type: string;
    };
  };
  stages: AWSPipelineStage[];
  created: Date;
  updated: Date;
}

export interface AWSPipelineStage {
  name: string;
  actions: AWSPipelineAction[];
  blockers?: any[];
}

export interface AWSPipelineAction {
  name: string;
  actionTypeId: {
    category: string;
    owner: string;
    provider: string;
    version: string;
  };
  configuration: Record<string, string>;
  inputArtifacts?: any[];
  outputArtifacts?: any[];
  runOrder?: number;
  region?: string;
  roleArn?: string;
}

export interface AWSPipelineExecution {
  pipelineExecutionId: string;
  pipelineName: string;
  pipelineVersion: number;
  status: 'InProgress' | 'Stopped' | 'Stopping' | 'Succeeded' | 'Superseded' | 'Failed';
  statusSummary?: string;
  artifactRevisions?: any[];
  trigger: {
    triggerType: string;
    triggerDetail?: string;
  };
  startTime: Date;
  lastUpdateTime: Date;
}

export interface AWSCodeBuildProject {
  name: string;
  arn: string;
  description?: string;
  source: {
    type: string;
    location?: string;
    gitCloneDepth?: number;
    gitSubmodulesConfig?: any;
    buildspec?: string;
    auth?: any;
    reportBuildStatus?: boolean;
    buildStatusConfig?: any;
    insecureSsl?: boolean;
    sourceIdentifier?: string;
  };
  secondarySources?: any[];
  sourceVersion?: string;
  secondarySourceVersions?: any[];
  artifacts: {
    type: string;
    location?: string;
    path?: string;
    namespaceType?: string;
    name?: string;
    packaging?: string;
    overrideArtifactName?: boolean;
    encryptionDisabled?: boolean;
    artifactIdentifier?: string;
  };
  secondaryArtifacts?: any[];
  cache?: any;
  environment: {
    type: string;
    image: string;
    computeType: string;
    environmentVariables?: any[];
    privilegedMode?: boolean;
    certificate?: string;
    registryCredential?: any;
    imagePullCredentialsType?: string;
  };
  serviceRole: string;
  timeoutInMinutes?: number;
  queuedTimeoutInMinutes?: number;
  encryptionKey?: string;
  tags?: any[];
  created: Date;
  lastModified: Date;
  webhook?: any;
  vpcConfig?: any;
  badge?: any;
  logsConfig?: any;
  fileSystemLocations?: any[];
  buildBatchConfig?: any;
  concurrentBuildLimit?: number;
}

export interface AWSCodeBuildBuild {
  id: string;
  arn: string;
  buildNumber?: number;
  startTime: Date;
  endTime?: Date;
  currentPhase?: string;
  buildStatus: 'SUCCEEDED' | 'FAILED' | 'FAULT' | 'TIMED_OUT' | 'IN_PROGRESS' | 'STOPPED';
  sourceVersion?: string;
  resolvedSourceVersion?: string;
  projectName: string;
  phases?: any[];
  source: any;
  secondarySources?: any[];
  secondarySourceVersions?: any[];
  artifacts: any;
  secondaryArtifacts?: any[];
  cache?: any;
  environment: any;
  serviceRole?: string;
  logs?: any;
  timeoutInMinutes?: number;
  queuedTimeoutInMinutes?: number;
  buildComplete?: boolean;
  initiator?: string;
  vpcConfig?: any;
  networkInterface?: any;
  encryptionKey?: string;
  exportedEnvironmentVariables?: any[];
  reportArns?: string[];
  fileSystemLocations?: any[];
  debugSession?: any;
  buildBatchArn?: string;
}

export class AWSAdapter implements IntegrationAdapter {
  readonly provider = IntegrationProvider.AWS;
  private readonly logger = new Logger('AWSAdapter');
  private readonly region: string;

  constructor(region = 'us-east-1') {
    this.region = region;
  }

  async authenticate(credentials: Credentials): Promise<AuthToken> {
    this.logger.info('Authenticating with AWS');
    
    if (credentials.type === AuthType.API_KEY) {
      return this.authenticateAccessKey(credentials);
    } else if (credentials.type === AuthType.OAUTH2) {
      return this.authenticateAssumeRole(credentials);
    }
    
    throw new Error(`Unsupported auth type: ${credentials.type}`);
  }

  private async authenticateAccessKey(credentials: Credentials): Promise<AuthToken> {
    const { access_key_id, secret_access_key, session_token } = credentials.data;
    
    // Validate credentials by making a test request to STS
    const stsUrl = `https://sts.${this.region}.amazonaws.com/`;
    const params = new URLSearchParams({
      Action: 'GetCallerIdentity',
      Version: '2011-06-15',
    });

    const authHeader = await this.generateAWSSignature(
      'GET',
      stsUrl,
      params.toString(),
      access_key_id,
      secret_access_key,
      session_token
    );

    const response = await fetch(`${stsUrl}?${params}`, {
      headers: {
        'Authorization': authHeader,
        'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
      },
    });

    if (!response.ok) {
      throw new Error(`AWS access key authentication failed: ${response.statusText}`);
    }

    return {
      accessToken: JSON.stringify({
        accessKeyId: access_key_id,
        secretAccessKey: secret_access_key,
        sessionToken: session_token,
      }),
      expiresAt: session_token 
        ? new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours for temporary credentials
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year for permanent credentials
    };
  }

  private async authenticateAssumeRole(credentials: Credentials): Promise<AuthToken> {
    const { role_arn, external_id, access_key_id, secret_access_key } = credentials.data;
    
    // This would typically use AWS STS AssumeRole API
    // For now, we'll simulate the process
    const response = await this.assumeRole(role_arn, external_id, access_key_id, secret_access_key);
    
    return {
      accessToken: JSON.stringify({
        accessKeyId: response.AccessKeyId,
        secretAccessKey: response.SecretAccessKey,
        sessionToken: response.SessionToken,
      }),
      expiresAt: new Date(response.Expiration),
    };
  }

  async testConnection(integration: Integration): Promise<boolean> {
    try {
      const credentials = this.parseCredentials(integration);
      
      // Test connection by calling STS GetCallerIdentity
      const stsUrl = `https://sts.${this.region}.amazonaws.com/`;
      const params = new URLSearchParams({
        Action: 'GetCallerIdentity',
        Version: '2011-06-15',
      });

      const authHeader = await this.generateAWSSignature(
        'GET',
        stsUrl,
        params.toString(),
        credentials.accessKeyId,
        credentials.secretAccessKey,
        credentials.sessionToken
      );

      const response = await fetch(`${stsUrl}?${params}`, {
        headers: {
          'Authorization': authHeader,
          'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error('AWS connection test failed', { error });
      return false;
    }
  }

  async syncData(integration: Integration, syncType: SyncType): Promise<SyncResult> {
    const startTime = new Date();
    this.logger.info('Starting AWS data sync', { integrationId: integration.id, syncType });

    try {
      const credentials = this.parseCredentials(integration);
      
      let recordsProcessed = 0;
      let recordsCreated = 0;
      let recordsUpdated = 0;

      // Sync CodePipeline pipelines
      const pipelines = await this.fetchPipelines(credentials);
      recordsProcessed += pipelines.length;
      recordsCreated += pipelines.length; // Simplified for now

      // Sync CodeBuild projects
      const projects = await this.fetchCodeBuildProjects(credentials);
      recordsProcessed += projects.length;
      recordsCreated += projects.length; // Simplified for now

      // Sync recent pipeline executions
      for (const pipeline of pipelines) {
        const executions = await this.fetchPipelineExecutions(credentials, pipeline.name);
        recordsProcessed += executions.length;
        recordsCreated += executions.length; // Simplified for now
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

      this.logger.error('AWS sync failed', { error, integrationId: integration.id });

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
    this.logger.info('Processing AWS webhook', { event: webhook.event });

    switch (webhook.event) {
      case 'codepipeline-pipeline-execution-started':
        await this.handlePipelineExecutionStarted(webhook.data);
        break;
      case 'codepipeline-pipeline-execution-succeeded':
        await this.handlePipelineExecutionSucceeded(webhook.data);
        break;
      case 'codepipeline-pipeline-execution-failed':
        await this.handlePipelineExecutionFailed(webhook.data);
        break;
      case 'codebuild-build-state-change':
        await this.handleBuildStateChange(webhook.data);
        break;
      case 'codebuild-build-phase-change':
        await this.handleBuildPhaseChange(webhook.data);
        break;
      default:
        this.logger.warn('Unhandled AWS webhook event', { event: webhook.event });
    }
  }

  private parseCredentials(integration: Integration): any {
    const token = integration.config.credentials.data.access_token || 
                 integration.config.credentials.data.token;
    
    if (typeof token === 'string') {
      return JSON.parse(token);
    }
    
    return {
      accessKeyId: integration.config.credentials.data.access_key_id,
      secretAccessKey: integration.config.credentials.data.secret_access_key,
      sessionToken: integration.config.credentials.data.session_token,
    };
  }

  private async generateAWSSignature(
    method: string,
    url: string,
    queryString: string,
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken?: string
  ): Promise<string> {
    // This is a simplified AWS signature generation
    // In a real implementation, you would use the AWS SDK or a proper signing library
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = timestamp.substr(0, 8);
    
    return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${date}/${this.region}/sts/aws4_request, SignedHeaders=host;x-amz-date, Signature=mock-signature`;
  }

  private async assumeRole(roleArn: string, externalId: string, accessKeyId: string, secretAccessKey: string): Promise<any> {
    // This would typically call AWS STS AssumeRole
    // For now, return mock credentials
    return {
      AccessKeyId: 'ASIA' + Math.random().toString(36).substr(2, 16).toUpperCase(),
      SecretAccessKey: Math.random().toString(36).substr(2, 40),
      SessionToken: Math.random().toString(36).substr(2, 100),
      Expiration: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
  }

  private async fetchPipelines(credentials: any): Promise<AWSPipeline[]> {
    // This would typically call AWS CodePipeline ListPipelines API
    // For now, return mock data
    return [
      {
        name: 'sample-pipeline',
        version: 1,
        pipelineArn: `arn:aws:codepipeline:${this.region}:123456789012:pipeline/sample-pipeline`,
        roleArn: `arn:aws:iam::123456789012:role/service-role/AWSCodePipelineServiceRole`,
        artifactStore: {
          type: 'S3',
          location: 'codepipeline-artifacts-bucket',
        },
        stages: [
          {
            name: 'Source',
            actions: [
              {
                name: 'SourceAction',
                actionTypeId: {
                  category: 'Source',
                  owner: 'AWS',
                  provider: 'S3',
                  version: '1',
                },
                configuration: {
                  S3Bucket: 'source-bucket',
                  S3ObjectKey: 'source.zip',
                },
                outputArtifacts: [{ name: 'SourceOutput' }],
              },
            ],
          },
        ],
        created: new Date(),
        updated: new Date(),
      },
    ];
  }

  private async fetchCodeBuildProjects(credentials: any): Promise<AWSCodeBuildProject[]> {
    // This would typically call AWS CodeBuild ListProjects API
    // For now, return mock data
    return [
      {
        name: 'sample-build-project',
        arn: `arn:aws:codebuild:${this.region}:123456789012:project/sample-build-project`,
        description: 'Sample build project',
        source: {
          type: 'GITHUB',
          location: 'https://github.com/example/repo.git',
          buildspec: 'buildspec.yml',
        },
        artifacts: {
          type: 'S3',
          location: 'build-artifacts-bucket',
        },
        environment: {
          type: 'LINUX_CONTAINER',
          image: 'aws/codebuild/amazonlinux2-x86_64-standard:3.0',
          computeType: 'BUILD_GENERAL1_MEDIUM',
        },
        serviceRole: `arn:aws:iam::123456789012:role/service-role/codebuild-service-role`,
        created: new Date(),
        lastModified: new Date(),
      },
    ];
  }

  private async fetchPipelineExecutions(credentials: any, pipelineName: string): Promise<AWSPipelineExecution[]> {
    // This would typically call AWS CodePipeline ListPipelineExecutions API
    // For now, return mock data
    return [
      {
        pipelineExecutionId: 'execution-' + Math.random().toString(36).substr(2, 9),
        pipelineName,
        pipelineVersion: 1,
        status: 'Succeeded',
        trigger: {
          triggerType: 'StartPipelineExecution',
        },
        startTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        lastUpdateTime: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      },
    ];
  }

  private async handlePipelineExecutionStarted(data: any): Promise<void> {
    this.logger.info('Handling pipeline execution started event', { 
      pipelineName: data.detail?.['pipeline-name'],
      executionId: data.detail?.['execution-id'] 
    });
    
    // Process pipeline execution started - send notifications, update status, etc.
  }

  private async handlePipelineExecutionSucceeded(data: any): Promise<void> {
    this.logger.info('Handling pipeline execution succeeded event', { 
      pipelineName: data.detail?.['pipeline-name'],
      executionId: data.detail?.['execution-id'] 
    });
    
    // Process pipeline execution succeeded - send notifications, trigger deployments, etc.
  }

  private async handlePipelineExecutionFailed(data: any): Promise<void> {
    this.logger.info('Handling pipeline execution failed event', { 
      pipelineName: data.detail?.['pipeline-name'],
      executionId: data.detail?.['execution-id'] 
    });
    
    // Process pipeline execution failed - send alerts, trigger rollbacks, etc.
  }

  private async handleBuildStateChange(data: any): Promise<void> {
    this.logger.info('Handling build state change event', { 
      projectName: data.detail?.['project-name'],
      buildId: data.detail?.['build-id'],
      buildStatus: data.detail?.['build-status'] 
    });
    
    // Process build state change - update metrics, send notifications, etc.
  }

  private async handleBuildPhaseChange(data: any): Promise<void> {
    this.logger.info('Handling build phase change event', { 
      projectName: data.detail?.['project-name'],
      buildId: data.detail?.['build-id'],
      phase: data.detail?.['completed-phase'] 
    });
    
    // Process build phase change - update progress, send notifications, etc.
  }

  // Pipeline management methods

  async startPipelineExecution(integration: Integration, pipelineName: string): Promise<string> {
    const credentials = this.parseCredentials(integration);
    
    // This would typically call AWS CodePipeline StartPipelineExecution API
    const executionId = 'execution-' + Math.random().toString(36).substr(2, 9);
    
    this.logger.info('Pipeline execution started', { pipelineName, executionId });
    
    return executionId;
  }

  async stopPipelineExecution(integration: Integration, pipelineName: string, executionId: string): Promise<void> {
    const credentials = this.parseCredentials(integration);
    
    // This would typically call AWS CodePipeline StopPipelineExecution API
    this.logger.info('Pipeline execution stopped', { pipelineName, executionId });
  }

  async startBuild(integration: Integration, projectName: string): Promise<string> {
    const credentials = this.parseCredentials(integration);
    
    // This would typically call AWS CodeBuild StartBuild API
    const buildId = 'build-' + Math.random().toString(36).substr(2, 9);
    
    this.logger.info('Build started', { projectName, buildId });
    
    return buildId;
  }

  async stopBuild(integration: Integration, buildId: string): Promise<void> {
    const credentials = this.parseCredentials(integration);
    
    // This would typically call AWS CodeBuild StopBuild API
    this.logger.info('Build stopped', { buildId });
  }
}