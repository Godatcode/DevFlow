import { CacheInvalidationStrategy } from './interfaces';

export class TimeBasedInvalidationStrategy implements CacheInvalidationStrategy {
  public readonly name = 'time-based';

  constructor(private maxAge: number = 3600000) {} // 1 hour default

  shouldInvalidate(key: string, tags: string[], context: any): boolean {
    const timestamp = context.timestamp || Date.now();
    const keyTimestamp = context.keyTimestamps?.[key];
    
    if (!keyTimestamp) {
      return false;
    }

    return timestamp - keyTimestamp > this.maxAge;
  }

  getInvalidationKeys(context: any): string[] {
    const { keyTimestamps = {}, currentTime = Date.now() } = context;
    const keysToInvalidate: string[] = [];

    for (const [key, timestamp] of Object.entries(keyTimestamps)) {
      if (currentTime - (timestamp as number) > this.maxAge) {
        keysToInvalidate.push(key);
      }
    }

    return keysToInvalidate;
  }
}

export class WorkflowInvalidationStrategy implements CacheInvalidationStrategy {
  public readonly name = 'workflow-based';

  shouldInvalidate(key: string, tags: string[], context: any): boolean {
    const { workflowId, affectedWorkflows = [] } = context;
    
    // Invalidate if the key is tagged with an affected workflow
    return tags.some(tag => 
      tag.startsWith('workflow:') && 
      affectedWorkflows.includes(tag.replace('workflow:', ''))
    );
  }

  getInvalidationKeys(context: any): string[] {
    const { workflowId, relatedKeys = [] } = context;
    const keysToInvalidate: string[] = [];

    // Add workflow-specific keys
    keysToInvalidate.push(`workflow:${workflowId}:*`);
    
    // Add related keys
    keysToInvalidate.push(...relatedKeys);

    return keysToInvalidate;
  }
}

export class UserInvalidationStrategy implements CacheInvalidationStrategy {
  public readonly name = 'user-based';

  shouldInvalidate(key: string, tags: string[], context: any): boolean {
    const { userId, affectedUsers = [] } = context;
    
    return tags.some(tag => 
      tag.startsWith('user:') && 
      affectedUsers.includes(tag.replace('user:', ''))
    );
  }

  getInvalidationKeys(context: any): string[] {
    const { userId, sessionId } = context;
    const keysToInvalidate: string[] = [];

    if (userId) {
      keysToInvalidate.push(`user:${userId}:*`);
    }

    if (sessionId) {
      keysToInvalidate.push(`session:${sessionId}:*`);
    }

    return keysToInvalidate;
  }
}

export class ProjectInvalidationStrategy implements CacheInvalidationStrategy {
  public readonly name = 'project-based';

  shouldInvalidate(key: string, tags: string[], context: any): boolean {
    const { projectId, affectedProjects = [] } = context;
    
    return tags.some(tag => 
      tag.startsWith('project:') && 
      affectedProjects.includes(tag.replace('project:', ''))
    );
  }

  getInvalidationKeys(context: any): string[] {
    const { projectId, repositoryId, teamId } = context;
    const keysToInvalidate: string[] = [];

    if (projectId) {
      keysToInvalidate.push(`project:${projectId}:*`);
    }

    if (repositoryId) {
      keysToInvalidate.push(`repository:${repositoryId}:*`);
    }

    if (teamId) {
      keysToInvalidate.push(`team:${teamId}:*`);
    }

    return keysToInvalidate;
  }
}

export class MetricsInvalidationStrategy implements CacheInvalidationStrategy {
  public readonly name = 'metrics-based';

  shouldInvalidate(key: string, tags: string[], context: any): boolean {
    const { metricType, affectedMetrics = [] } = context;
    
    return tags.some(tag => 
      tag.startsWith('metrics:') && 
      affectedMetrics.includes(tag.replace('metrics:', ''))
    );
  }

  getInvalidationKeys(context: any): string[] {
    const { metricType, projectId, teamId, timeRange } = context;
    const keysToInvalidate: string[] = [];

    if (metricType && projectId) {
      keysToInvalidate.push(`metrics:${metricType}:project:${projectId}:*`);
    }

    if (metricType && teamId) {
      keysToInvalidate.push(`metrics:${metricType}:team:${teamId}:*`);
    }

    // Invalidate time-range specific metrics
    if (timeRange) {
      keysToInvalidate.push(`metrics:*:${timeRange}:*`);
    }

    return keysToInvalidate;
  }
}

// Factory function to create all default strategies
export function createDefaultInvalidationStrategies(): CacheInvalidationStrategy[] {
  return [
    new TimeBasedInvalidationStrategy(),
    new WorkflowInvalidationStrategy(),
    new UserInvalidationStrategy(),
    new ProjectInvalidationStrategy(),
    new MetricsInvalidationStrategy()
  ];
}