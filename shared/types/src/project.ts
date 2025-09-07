import { BaseEntity, UUID } from './common';

export enum ProjectStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived'
}

export enum RepositoryProvider {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket'
}

export interface Repository {
  id: UUID;
  name: string;
  url: string;
  provider: RepositoryProvider;
  defaultBranch: string;
  isPrivate: boolean;
  webhookUrl?: string;
}

export interface ProjectConfiguration {
  buildCommand: string;
  testCommand: string;
  deployCommand: string;
  environmentVariables: Record<string, string>;
  dependencies: string[];
  frameworks: string[];
  languages: string[];
}

export interface Project extends BaseEntity {
  name: string;
  description: string;
  status: ProjectStatus;
  teamId: UUID;
  repositories: Repository[];
  configuration: ProjectConfiguration;
  integrationIds: UUID[];
  workflowIds: UUID[];
  metadata: Record<string, any>;
}