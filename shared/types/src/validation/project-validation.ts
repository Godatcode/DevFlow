import {
  Project,
  Repository,
  ProjectConfiguration,
  ProjectStatus,
  RepositoryProvider
} from '../project';
import { BaseValidator, ValidationError } from './base-validation';

export class ProjectValidator extends BaseValidator {
  static validateProject(project: Project): void {
    this.validateBaseEntity(project);
    this.validateString(project.name, 'name', 1, 100);
    this.validateString(project.description, 'description', 0, 500);
    this.validateEnum(project.status, ProjectStatus, 'status');
    this.validateUUID(project.teamId, 'teamId');
    
    this.validateArray(project.repositories, 'repositories', 1, 10);
    project.repositories.forEach((repo, index) => {
      this.validateRepository(repo, `repositories[${index}]`);
    });

    this.validateProjectConfiguration(project.configuration);
    
    this.validateArray(project.integrationIds, 'integrationIds', 0, 20);
    project.integrationIds.forEach((integrationId, index) => {
      this.validateUUID(integrationId, `integrationIds[${index}]`);
    });

    this.validateArray(project.workflowIds, 'workflowIds', 0, 50);
    project.workflowIds.forEach((workflowId, index) => {
      this.validateUUID(workflowId, `workflowIds[${index}]`);
    });

    this.validateObject(project.metadata, 'metadata');

    // Validate unique repository names
    const repoNames = project.repositories.map(r => r.name);
    const uniqueRepoNames = new Set(repoNames);
    if (repoNames.length !== uniqueRepoNames.size) {
      throw new ValidationError(
        'Project cannot have repositories with duplicate names',
        'DUPLICATE_REPOSITORY_NAMES'
      );
    }

    // Validate unique repository URLs
    const repoUrls = project.repositories.map(r => r.url);
    const uniqueRepoUrls = new Set(repoUrls);
    if (repoUrls.length !== uniqueRepoUrls.size) {
      throw new ValidationError(
        'Project cannot have repositories with duplicate URLs',
        'DUPLICATE_REPOSITORY_URLS'
      );
    }
  }

  static validateRepository(repository: Repository, fieldPrefix: string = ''): void {
    const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
    
    this.validateUUID(repository.id, `${prefix}id`);
    this.validateString(repository.name, `${prefix}name`, 1, 100);
    this.validateUrl(repository.url, `${prefix}url`);
    this.validateEnum(repository.provider, RepositoryProvider, `${prefix}provider`);
    this.validateString(repository.defaultBranch, `${prefix}defaultBranch`, 1, 100);
    
    if (typeof repository.isPrivate !== 'boolean') {
      throw new ValidationError(
        `${prefix}isPrivate must be a boolean`,
        'INVALID_TYPE'
      );
    }

    if (repository.webhookUrl) {
      this.validateUrl(repository.webhookUrl, `${prefix}webhookUrl`);
    }

    // Validate repository name format (basic validation)
    if (!/^[a-zA-Z0-9._-]+$/.test(repository.name)) {
      throw new ValidationError(
        `${prefix}name can only contain letters, numbers, dots, hyphens, and underscores`,
        'INVALID_REPOSITORY_NAME'
      );
    }

    // Validate default branch name format
    if (!/^[a-zA-Z0-9._/-]+$/.test(repository.defaultBranch)) {
      throw new ValidationError(
        `${prefix}defaultBranch contains invalid characters`,
        'INVALID_BRANCH_NAME'
      );
    }

    // Validate URL matches provider
    this.validateRepositoryUrlProvider(repository.url, repository.provider, prefix);
  }

  static validateProjectConfiguration(config: ProjectConfiguration): void {
    this.validateString(config.buildCommand, 'configuration.buildCommand', 1, 500);
    this.validateString(config.testCommand, 'configuration.testCommand', 1, 500);
    this.validateString(config.deployCommand, 'configuration.deployCommand', 1, 500);
    
    this.validateObject(config.environmentVariables, 'configuration.environmentVariables');
    
    // Validate environment variable names
    Object.keys(config.environmentVariables).forEach(key => {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        throw new ValidationError(
          `Environment variable name '${key}' is invalid. Must start with letter or underscore and contain only uppercase letters, numbers, and underscores`,
          'INVALID_ENV_VAR_NAME'
        );
      }
    });

    this.validateArray(config.dependencies, 'configuration.dependencies', 0, 100);
    config.dependencies.forEach((dep, index) => {
      this.validateString(dep, `configuration.dependencies[${index}]`, 1, 100);
    });

    this.validateArray(config.frameworks, 'configuration.frameworks', 0, 20);
    config.frameworks.forEach((framework, index) => {
      this.validateString(framework, `configuration.frameworks[${index}]`, 1, 50);
    });

    this.validateArray(config.languages, 'configuration.languages', 1, 10);
    config.languages.forEach((language, index) => {
      this.validateString(language, `configuration.languages[${index}]`, 1, 30);
    });

    // Validate command formats (basic validation)
    this.validateCommandFormat(config.buildCommand, 'configuration.buildCommand');
    this.validateCommandFormat(config.testCommand, 'configuration.testCommand');
    this.validateCommandFormat(config.deployCommand, 'configuration.deployCommand');
  }

  private static validateRepositoryUrlProvider(
    url: string,
    provider: RepositoryProvider,
    fieldPrefix: string
  ): void {
    const urlLower = url.toLowerCase();
    
    switch (provider) {
      case RepositoryProvider.GITHUB:
        if (!urlLower.includes('github.com')) {
          throw new ValidationError(
            `${fieldPrefix}url must be a GitHub URL when provider is GitHub`,
            'URL_PROVIDER_MISMATCH'
          );
        }
        break;
      case RepositoryProvider.GITLAB:
        if (!urlLower.includes('gitlab.com') && !urlLower.includes('gitlab.')) {
          throw new ValidationError(
            `${fieldPrefix}url must be a GitLab URL when provider is GitLab`,
            'URL_PROVIDER_MISMATCH'
          );
        }
        break;
      case RepositoryProvider.BITBUCKET:
        if (!urlLower.includes('bitbucket.org')) {
          throw new ValidationError(
            `${fieldPrefix}url must be a Bitbucket URL when provider is Bitbucket`,
            'URL_PROVIDER_MISMATCH'
          );
        }
        break;
    }
  }

  private static validateCommandFormat(command: string, fieldName: string): void {
    // Basic validation to prevent obviously dangerous commands
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /sudo/i,
      /chmod\s+777/i,
      />\s*\/dev\/null/i,
      /&&\s*rm/i,
      /;\s*rm/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new ValidationError(
          `${fieldName} contains potentially dangerous command patterns`,
          'DANGEROUS_COMMAND'
        );
      }
    }

    // Validate command doesn't start with dangerous characters
    if (command.trim().startsWith('|') || command.trim().startsWith(';')) {
      throw new ValidationError(
        `${fieldName} cannot start with pipe or semicolon`,
        'INVALID_COMMAND_START'
      );
    }
  }
}