import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntelligentPipelineGenerator } from '../pipeline/pipeline-generator';
import { DefaultPipelineTemplateManager } from '../pipeline/template-manager';
import { IntelligentProjectAnalyzer } from '../pipeline/project-analyzer';
import { IntelligentTestingStrategySelector } from '../pipeline/testing-strategy-selector';
import { IntelligentPipelineOptimizer } from '../pipeline/pipeline-optimizer';
import {
  PipelineType,
  TestingStrategy,
  PipelineGenerationRequest,
  ProjectCharacteristics
} from '../pipeline/types';

describe('IntelligentPipelineGenerator', () => {
  let pipelineGenerator: IntelligentPipelineGenerator;
  let templateManager: DefaultPipelineTemplateManager;
  let projectAnalyzer: IntelligentProjectAnalyzer;
  let testingStrategySelector: IntelligentTestingStrategySelector;
  let pipelineOptimizer: IntelligentPipelineOptimizer;

  const mockProjectCharacteristics: ProjectCharacteristics = {
    projectId: 'test-project-id' as any,
    languages: ['typescript', 'javascript'],
    frameworks: ['express', 'react'],
    dependencies: ['package.json', 'package-lock.json'],
    repositorySize: 50000,
    teamSize: 8,
    deploymentFrequency: 3,
    testCoverage: 75,
    complexity: 'medium',
    criticality: 'medium',
    complianceRequirements: ['SOC2']
  };

  beforeEach(() => {
    templateManager = new DefaultPipelineTemplateManager();
    projectAnalyzer = new IntelligentProjectAnalyzer(null, null);
    testingStrategySelector = new IntelligentTestingStrategySelector();
    pipelineOptimizer = new IntelligentPipelineOptimizer();

    pipelineGenerator = new IntelligentPipelineGenerator(
      templateManager,
      projectAnalyzer,
      testingStrategySelector,
      pipelineOptimizer
    );

    // Mock project analyzer
    vi.spyOn(projectAnalyzer, 'analyzeProject').mockResolvedValue(mockProjectCharacteristics);
  });

  describe('generatePipeline', () => {
    it('should generate a complete CI/CD pipeline', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: true,
          complianceChecks: ['SOC2'],
          environmentTargets: ['staging', 'production'],
          qualityGates: [
            { metric: 'coverage', threshold: 80, operator: 'gte', blocking: true }
          ]
        },
        preferences: {
          testingStrategy: TestingStrategy.BALANCED,
          parallelizationLevel: 'medium',
          resourceOptimization: true,
          cachingEnabled: true
        }
      };

      const pipeline = await pipelineGenerator.generatePipeline(request);

      expect(pipeline).toBeDefined();
      expect(pipeline.projectId).toBe(request.projectId);
      expect(pipeline.type).toBe(PipelineType.FULL_CICD);
      expect(pipeline.stages.length).toBeGreaterThan(0);
      expect(pipeline.testingStrategy).toBe(TestingStrategy.BALANCED);
      expect(pipeline.optimizations).toBeDefined();
      expect(pipeline.estimatedDuration).toBeGreaterThan(0);
    });

    it('should include security scan when required', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: true,
          complianceChecks: [],
          environmentTargets: ['staging'],
          qualityGates: []
        },
        preferences: {
          parallelizationLevel: 'low',
          resourceOptimization: false,
          cachingEnabled: false
        }
      };

      const pipeline = await pipelineGenerator.generatePipeline(request);

      const hasSecurityScan = pipeline.stages.some(stage => 
        stage.stage === 'security_scan' || 
        stage.commands.some(cmd => cmd.includes('audit') || cmd.includes('snyk'))
      );

      expect(hasSecurityScan).toBe(true);
    });

    it('should customize commands based on project characteristics', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.BUILD,
        requirements: {
          maxDuration: 1800,
          securityScanRequired: false,
          complianceChecks: [],
          environmentTargets: [],
          qualityGates: []
        },
        preferences: {
          parallelizationLevel: 'low',
          resourceOptimization: false,
          cachingEnabled: false
        }
      };

      const pipeline = await pipelineGenerator.generatePipeline(request);

      const buildStage = pipeline.stages.find(stage => stage.stage === 'build');
      expect(buildStage).toBeDefined();
      expect(buildStage?.commands.some(cmd => /npm|yarn|build/.test(cmd))).toBe(true);
    });

    it('should apply testing strategy correctly', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: false,
          complianceChecks: [],
          environmentTargets: ['staging'],
          qualityGates: []
        },
        preferences: {
          testingStrategy: TestingStrategy.E2E_HEAVY,
          parallelizationLevel: 'medium',
          resourceOptimization: true,
          cachingEnabled: true
        }
      };

      const pipeline = await pipelineGenerator.generatePipeline(request);

      expect(pipeline.testingStrategy).toBe(TestingStrategy.E2E_HEAVY);
      
      const hasUnitTests = pipeline.stages.some(stage => stage.stage === 'unit_test');
      const hasIntegrationTests = pipeline.stages.some(stage => stage.stage === 'integration_test');
      const hasE2ETests = pipeline.stages.some(stage => stage.stage === 'e2e_test');

      expect(hasUnitTests).toBe(true);
      expect(hasIntegrationTests).toBe(true);
      expect(hasE2ETests).toBe(true);
    });
  });

  describe('optimizePipeline', () => {
    it('should apply optimizations to pipeline', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: true,
          complianceChecks: [],
          environmentTargets: ['staging'],
          qualityGates: []
        },
        preferences: {
          parallelizationLevel: 'high',
          resourceOptimization: true,
          cachingEnabled: true
        }
      };

      const basePipeline = await pipelineGenerator.generatePipeline(request);
      const originalDuration = basePipeline.estimatedDuration;

      const optimizedPipeline = await pipelineGenerator.optimizePipeline(basePipeline);

      expect(optimizedPipeline.optimizations.length).toBeGreaterThan(0);
      // Optimized pipeline should have optimizations applied
      expect(optimizedPipeline.estimatedDuration).toBeGreaterThan(0);
    });
  });

  describe('validatePipeline', () => {
    it('should validate pipeline successfully', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: true,
          complianceChecks: [],
          environmentTargets: ['staging'],
          qualityGates: []
        },
        preferences: {
          parallelizationLevel: 'medium',
          resourceOptimization: true,
          cachingEnabled: true
        }
      };

      const pipeline = await pipelineGenerator.generatePipeline(request);
      const validationResult = await pipelineGenerator.validatePipeline(pipeline);

      expect(validationResult).toBeDefined();
      expect(typeof validationResult.isValid).toBe('boolean');
    });

    it('should detect validation errors', async () => {
      const invalidPipeline = {
        id: 'test-id' as any,
        projectId: 'test-project-id' as any,
        name: 'Invalid Pipeline',
        type: PipelineType.FULL_CICD,
        stages: [
          {
            stage: 'deploy_production' as any,
            name: 'Deploy Production',
            commands: ['deploy'],
            environment: {},
            timeout: 600,
            retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' as const },
            conditions: [],
            parallelizable: false,
            required: true
          },
          {
            stage: 'build' as any,
            name: 'Build',
            commands: ['build'],
            environment: {},
            timeout: 300,
            retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' as const },
            conditions: [],
            parallelizable: false,
            required: true
          }
        ],
        testingStrategy: TestingStrategy.BALANCED,
        deploymentStrategy: 'rolling' as any,
        optimizations: [],
        estimatedDuration: 900,
        createdAt: new Date()
      };

      const validationResult = await pipelineGenerator.validatePipeline(invalidPipeline);

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('estimateDuration', () => {
    it('should estimate pipeline duration correctly', async () => {
      const request: PipelineGenerationRequest = {
        projectId: 'test-project-id' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: true,
          complianceChecks: [],
          environmentTargets: ['staging'],
          qualityGates: []
        },
        preferences: {
          parallelizationLevel: 'medium',
          resourceOptimization: true,
          cachingEnabled: true
        }
      };

      const pipeline = await pipelineGenerator.generatePipeline(request);
      const estimatedDuration = await pipelineGenerator.estimateDuration(pipeline);

      expect(estimatedDuration).toBeGreaterThan(0);
      expect(estimatedDuration).toBeGreaterThan(0);
    });

    it('should account for parallel stages in duration estimation', async () => {
      const pipelineWithParallelStages = {
        id: 'test-id' as any,
        projectId: 'test-project-id' as any,
        name: 'Parallel Pipeline',
        type: PipelineType.FULL_CICD,
        stages: [
          {
            stage: 'build' as any,
            name: 'Build',
            commands: ['build'],
            environment: {},
            timeout: 600,
            retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' as const },
            conditions: [],
            parallelizable: false,
            required: true
          },
          {
            stage: 'unit_test' as any,
            name: 'Unit Tests',
            commands: ['test'],
            environment: {},
            timeout: 300,
            retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' as const },
            conditions: [],
            parallelizable: true,
            required: true
          },
          {
            stage: 'security_scan' as any,
            name: 'Security Scan',
            commands: ['scan'],
            environment: {},
            timeout: 180,
            retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' as const },
            conditions: [],
            parallelizable: true,
            required: true
          }
        ],
        testingStrategy: TestingStrategy.BALANCED,
        deploymentStrategy: 'rolling' as any,
        optimizations: [],
        estimatedDuration: 0,
        createdAt: new Date()
      };

      const estimatedDuration = await pipelineGenerator.estimateDuration(pipelineWithParallelStages);

      // Should be less than sum of all timeouts due to parallelization
      const totalSequentialTime = pipelineWithParallelStages.stages.reduce((sum, stage) => sum + stage.timeout, 0);
      expect(estimatedDuration).toBeLessThan(totalSequentialTime * 1.2);
    });
  });
});