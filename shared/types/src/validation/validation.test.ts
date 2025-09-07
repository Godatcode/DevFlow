import { describe, it, expect } from 'vitest';
import {
  BaseValidator,
  ValidationError,
  WorkflowValidator,
  TeamValidator,
  ProjectValidator,
  AnalyticsValidator,
  AgentValidator,
  IntegrationValidator
} from './index';
import {
  WorkflowStatus,
  EventTriggerType,
  WorkflowStepType,
  UserRole,
  SkillLevel,
  ProjectStatus,
  RepositoryProvider,
  MetricType,
  ReportType,
  AgentType,
  AgentCapability,
  ExecutionStatus,
  IntegrationProvider,
  IntegrationType,
  AuthType
} from '../index';

describe('BaseValidator', () => {
  describe('validateUUID', () => {
    it('should validate correct UUID', () => {
      expect(() => {
        (BaseValidator as any).validateUUID('123e4567-e89b-12d3-a456-426614174000', 'testId');
      }).not.toThrow();
    });

    it('should throw error for invalid UUID', () => {
      expect(() => {
        (BaseValidator as any).validateUUID('invalid-uuid', 'testId');
      }).toThrow(ValidationError);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email', () => {
      expect(() => {
        (BaseValidator as any).validateEmail('test@example.com', 'email');
      }).not.toThrow();
    });

    it('should throw error for invalid email', () => {
      expect(() => {
        (BaseValidator as any).validateEmail('invalid-email', 'email');
      }).toThrow(ValidationError);
    });
  });

  describe('validateString', () => {
    it('should validate string within length limits', () => {
      expect(() => {
        (BaseValidator as any).validateString('test', 'name', 1, 10);
      }).not.toThrow();
    });

    it('should throw error for string too short', () => {
      expect(() => {
        (BaseValidator as any).validateString('', 'name', 1, 10);
      }).toThrow(ValidationError);
    });

    it('should throw error for string too long', () => {
      expect(() => {
        (BaseValidator as any).validateString('very long string', 'name', 1, 5);
      }).toThrow(ValidationError);
    });
  });
});

describe('WorkflowValidator', () => {
  const validWorkflow = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
    definitionId: '123e4567-e89b-12d3-a456-426614174001',
    status: WorkflowStatus.ACTIVE,
    context: {
      projectId: '123e4567-e89b-12d3-a456-426614174002',
      userId: '123e4567-e89b-12d3-a456-426614174003',
      teamId: '123e4567-e89b-12d3-a456-426614174004',
      variables: {},
      metadata: {}
    },
    executionId: '123e4567-e89b-12d3-a456-426614174005',
    startedAt: new Date('2023-01-01T10:00:00Z'),
    completedAt: new Date('2023-01-01T11:00:00Z')
  };

  it('should validate correct workflow', () => {
    expect(() => {
      WorkflowValidator.validateWorkflow(validWorkflow);
    }).not.toThrow();
  });

  it('should throw error for invalid workflow status', () => {
    const invalidWorkflow = { ...validWorkflow, status: 'invalid' as any };
    expect(() => {
      WorkflowValidator.validateWorkflow(invalidWorkflow);
    }).toThrow(ValidationError);
  });

  it('should throw error when completedAt is before startedAt', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      startedAt: new Date('2023-01-01T11:00:00Z'),
      completedAt: new Date('2023-01-01T10:00:00Z')
    };
    expect(() => {
      WorkflowValidator.validateWorkflow(invalidWorkflow);
    }).toThrow(ValidationError);
  });
});

describe('TeamValidator', () => {
  const validTeam = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
    name: 'Test Team',
    description: 'A test team',
    members: [{
      userId: '123e4567-e89b-12d3-a456-426614174001',
      role: UserRole.ADMIN,
      joinedAt: new Date('2023-01-01'),
      permissions: ['read', 'write']
    }],
    settings: {
      workingHours: {
        start: '09:00',
        end: '17:00',
        timezone: 'America/New_York'
      },
      codeReviewSettings: {
        requiredApprovals: 2,
        requireOwnerReview: true,
        dismissStaleReviews: false
      },
      deploymentSettings: {
        autoDeployBranches: ['main'],
        requireApprovalForProduction: true
      },
      notificationChannels: {
        slack: '#team-notifications'
      }
    },
    projectIds: ['123e4567-e89b-12d3-a456-426614174002'],
    isActive: true
  };

  it('should validate correct team', () => {
    expect(() => {
      TeamValidator.validateTeam(validTeam);
    }).not.toThrow();
  });

  it('should throw error for team without leadership', () => {
    const invalidTeam = {
      ...validTeam,
      members: [{
        ...validTeam.members[0],
        role: UserRole.DEVELOPER
      }]
    };
    expect(() => {
      TeamValidator.validateTeam(invalidTeam);
    }).toThrow(ValidationError);
  });

  it('should throw error for invalid working hours', () => {
    const invalidTeam = {
      ...validTeam,
      settings: {
        ...validTeam.settings,
        workingHours: {
          start: '17:00',
          end: '09:00', // End before start
          timezone: 'America/New_York'
        }
      }
    };
    expect(() => {
      TeamValidator.validateTeam(invalidTeam);
    }).toThrow(ValidationError);
  });
});

describe('ProjectValidator', () => {
  const validProject = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
    name: 'Test Project',
    description: 'A test project',
    status: ProjectStatus.ACTIVE,
    teamId: '123e4567-e89b-12d3-a456-426614174001',
    repositories: [{
      id: '123e4567-e89b-12d3-a456-426614174002',
      name: 'test-repo',
      url: 'https://github.com/test/repo',
      provider: RepositoryProvider.GITHUB,
      defaultBranch: 'main',
      isPrivate: true
    }],
    configuration: {
      buildCommand: 'npm run build',
      testCommand: 'npm test',
      deployCommand: 'npm run deploy',
      environmentVariables: {
        NODE_ENV: 'production'
      },
      dependencies: ['react', 'typescript'],
      frameworks: ['React'],
      languages: ['TypeScript', 'JavaScript']
    },
    integrationIds: [],
    workflowIds: [],
    metadata: {}
  };

  it('should validate correct project', () => {
    expect(() => {
      ProjectValidator.validateProject(validProject);
    }).not.toThrow();
  });

  it('should throw error for repository URL/provider mismatch', () => {
    const invalidProject = {
      ...validProject,
      repositories: [{
        ...validProject.repositories[0],
        url: 'https://gitlab.com/test/repo',
        provider: RepositoryProvider.GITHUB // Mismatch
      }]
    };
    expect(() => {
      ProjectValidator.validateProject(invalidProject);
    }).toThrow(ValidationError);
  });

  it('should throw error for invalid environment variable name', () => {
    const invalidProject = {
      ...validProject,
      configuration: {
        ...validProject.configuration,
        environmentVariables: {
          'invalid-name': 'value' // Invalid name format
        }
      }
    };
    expect(() => {
      ProjectValidator.validateProject(invalidProject);
    }).toThrow(ValidationError);
  });
});

describe('AnalyticsValidator', () => {
  const validMetricData = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
    type: MetricType.DORA_DEPLOYMENT_FREQUENCY,
    value: 5.2,
    unit: 'per day',
    projectId: '123e4567-e89b-12d3-a456-426614174001',
    teamId: '123e4567-e89b-12d3-a456-426614174002',
    timestamp: new Date('2023-01-01T10:00:00Z'),
    metadata: {}
  };

  it('should validate correct metric data', () => {
    expect(() => {
      AnalyticsValidator.validateMetricData(validMetricData);
    }).not.toThrow();
  });

  it('should throw error for future timestamp', () => {
    const invalidMetric = {
      ...validMetricData,
      timestamp: new Date(Date.now() + 86400000) // Tomorrow
    };
    expect(() => {
      AnalyticsValidator.validateMetricData(invalidMetric);
    }).toThrow(ValidationError);
  });

  it('should throw error for invalid change failure rate', () => {
    const invalidMetric = {
      ...validMetricData,
      type: MetricType.DORA_CHANGE_FAILURE_RATE,
      value: 150 // Over 100%
    };
    expect(() => {
      AnalyticsValidator.validateMetricData(invalidMetric);
    }).toThrow(ValidationError);
  });
});

describe('AgentValidator', () => {
  const validAgent = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
    name: 'Security Guardian',
    type: AgentType.SECURITY_GUARDIAN,
    version: '1.0.0',
    capabilities: [AgentCapability.VULNERABILITY_SCANNING, AgentCapability.CODE_ANALYSIS],
    configuration: {
      scanDepth: 'deep',
      reportFormat: 'json'
    },
    isActive: true,
    execute: async () => ({
      executionId: '123e4567-e89b-12d3-a456-426614174001',
      status: ExecutionStatus.COMPLETED,
      output: {
        success: true,
        data: {},
        metrics: {}
      },
      duration: 1000,
      startTime: new Date()
    })
  };

  it('should validate correct agent', () => {
    expect(() => {
      AgentValidator.validateAIAgent(validAgent);
    }).not.toThrow();
  });

  it('should throw error for invalid version format', () => {
    const invalidAgent = {
      ...validAgent,
      version: 'invalid-version'
    };
    expect(() => {
      AgentValidator.validateAIAgent(invalidAgent);
    }).toThrow(ValidationError);
  });

  it('should throw error for missing required capabilities', () => {
    const invalidAgent = {
      ...validAgent,
      capabilities: [AgentCapability.PERFORMANCE_MONITORING] // Wrong capability for Security Guardian
    };
    expect(() => {
      AgentValidator.validateAIAgent(invalidAgent);
    }).toThrow(ValidationError);
  });
});

describe('IntegrationValidator', () => {
  const validIntegration = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
    name: 'GitHub Integration',
    provider: IntegrationProvider.GITHUB,
    type: IntegrationType.VERSION_CONTROL,
    config: {
      apiUrl: 'https://api.github.com',
      credentials: {
        type: AuthType.OAUTH2,
        data: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret'
        }
      },
      settings: {},
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 5000
      }
    },
    syncSchedule: {
      enabled: true,
      frequency: '0 */15 * * * *', // Every 15 minutes
      nextSync: new Date(Date.now() + 900000) // 15 minutes from now
    },
    projectIds: ['123e4567-e89b-12d3-a456-426614174001'],
    teamIds: ['123e4567-e89b-12d3-a456-426614174002'],
    isActive: true
  };

  it('should validate correct integration', () => {
    expect(() => {
      IntegrationValidator.validateIntegration(validIntegration);
    }).not.toThrow();
  });

  it('should throw error for incompatible provider and type', () => {
    const invalidIntegration = {
      ...validIntegration,
      provider: IntegrationProvider.GITHUB,
      type: IntegrationType.COMMUNICATION // Incompatible
    };
    expect(() => {
      IntegrationValidator.validateIntegration(invalidIntegration);
    }).toThrow(ValidationError);
  });

  it('should throw error for missing OAuth2 credentials', () => {
    const invalidIntegration = {
      ...validIntegration,
      config: {
        ...validIntegration.config,
        credentials: {
          type: AuthType.OAUTH2,
          data: {
            clientId: 'test-client-id'
            // Missing clientSecret
          }
        }
      }
    };
    expect(() => {
      IntegrationValidator.validateIntegration(invalidIntegration);
    }).toThrow(ValidationError);
  });

  it('should throw error for inconsistent rate limits', () => {
    const invalidIntegration = {
      ...validIntegration,
      config: {
        ...validIntegration.config,
        rateLimits: {
          requestsPerMinute: 100,
          requestsPerHour: 1000 // Should be at least 100 * 60 = 6000
        }
      }
    };
    expect(() => {
      IntegrationValidator.validateIntegration(invalidIntegration);
    }).toThrow(ValidationError);
  });
});