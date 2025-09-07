// Integration Service Entry Point
export * from './interfaces';
export * from './types';

// Adapters
export * from './adapters/github-adapter';
export * from './adapters/gitlab-adapter';
export * from './adapters/bitbucket-adapter';
export * from './adapters/jira-adapter';
export * from './adapters/linear-adapter';
export * from './adapters/azure-devops-adapter';
export * from './adapters/slack-adapter';
export * from './adapters/teams-adapter';
export * from './adapters/discord-adapter';
export * from './adapters/aws-adapter';
export * from './adapters/gcp-adapter';
export * from './adapters/azure-adapter';

// Services
export * from './services/integration-manager';
export * from './services/webhook-processor';
export * from './services/data-synchronizer';
export * from './services/notification-router';