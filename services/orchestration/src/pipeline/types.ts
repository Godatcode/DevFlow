import { UUID } from '@devflow/shared-types';

export enum PipelineType {
  BUILD = 'build',
  TEST = 'test',
  DEPLOY = 'deploy',
  FULL_CICD = 'full_cicd'
}

export enum PipelineStage {
  BUILD = 'build',
  UNIT_TEST = 'unit_test',
  INTEGRATION_TEST = 'integration_test',
  SECURITY_SCAN = 'security_scan',
  QUALITY_GATE = 'quality_gate',
  DEPLOY_STAGING = 'deploy_staging',
  E2E_TEST = 'e2e_test',
  DEPLOY_PRODUCTION = 'deploy_production',
  MONITORING = 'monitoring'
}

export enum TestingStrategy {
  UNIT_ONLY = 'unit_only',
  INTEGRATION_FOCUSED = 'integration_focused',
  E2E_HEAVY = 'e2e_heavy',
  BALANCED = 'balanced',
  PERFORMANCE_FOCUSED = 'performance_focused'
}

export enum DeploymentStrategy {
  BLUE_GREEN = 'blue_green',
  ROLLING = 'rolling',
  CANARY = 'canary',
  RECREATE = 'recreate'
}

export interface ProjectCharacteristics {
  projectId: UUID;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  repositorySize: number;
  teamSize: number;
  deploymentFrequency: number;
  testCoverage: number;
  complexity: 'low' | 'medium' | 'high';
  criticality: 'low' | 'medium' | 'high';
  complianceRequirements: string[];
}

export interface PipelineTemplate {
  id: UUID;
  name: string;
  description: string;
  type: PipelineType;
  stages: PipelineStageConfig[];
  applicableCharacteristics: ProjectCharacteristics;
  metadata: Record<string, any>;
}

export interface PipelineStageConfig {
  stage: PipelineStage;
  name: string;
  commands: string[];
  environment: Record<string, string>;
  timeout: number;
  retryConfig: {
    maxAttempts: number;
    backoffStrategy: 'linear' | 'exponential';
  };
  conditions: PipelineCondition[];
  parallelizable: boolean;
  required: boolean;
}

export interface PipelineCondition {
  type: 'branch' | 'file_changed' | 'environment' | 'time';
  condition: string;
  value: any;
}

export interface GeneratedPipeline {
  id: UUID;
  projectId: UUID;
  name: string;
  type: PipelineType;
  stages: PipelineStageConfig[];
  testingStrategy: TestingStrategy;
  deploymentStrategy: DeploymentStrategy;
  optimizations: PipelineOptimization[];
  estimatedDuration: number;
  createdAt: Date;
}

export interface PipelineOptimization {
  type: 'caching' | 'parallelization' | 'resource_allocation' | 'stage_skipping';
  description: string;
  impact: 'low' | 'medium' | 'high';
  implementation: Record<string, any>;
}

export interface PipelineGenerationRequest {
  projectId: UUID;
  type: PipelineType;
  requirements: PipelineRequirements;
  preferences: PipelinePreferences;
}

export interface PipelineRequirements {
  maxDuration: number;
  securityScanRequired: boolean;
  complianceChecks: string[];
  environmentTargets: string[];
  qualityGates: QualityGate[];
}

export interface QualityGate {
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  blocking: boolean;
}

export interface PipelinePreferences {
  testingStrategy?: TestingStrategy;
  deploymentStrategy?: DeploymentStrategy;
  parallelizationLevel: 'low' | 'medium' | 'high';
  resourceOptimization: boolean;
  cachingEnabled: boolean;
}