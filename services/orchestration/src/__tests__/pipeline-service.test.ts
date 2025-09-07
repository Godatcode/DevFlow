import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineService } from '../pipeline/pipeline-service';
import {
  PipelineType,
  TestingStrategy,
  PipelineGenerationRequest
} from '../pipeline/types';

describe('PipelineService', () => {
  let pipelineService: PipelineService;

  beforeEach(() => {
    pipelineService = new PipelineService();
  });

  describe('generatePipeline', () => {
    it('should generate a pipeline successfully', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);

      expect(pipeline).toBeDefined();
      expect(pipeline.projectId).toBe(request.projectId);
      expect(pipeline.type).toBe(PipelineType.FULL_CICD);
      expect(pipeline.stages.length).toBeGreaterThan(0);
    });

    it('should handle pipeline generation errors gracefully', async () => {
      // Mock the project analyzer to throw an error
      const originalAnalyzeProject = pipelineService['projectAnalyzer'].analyzeProject;
      pipelineService['projectAnalyzer'].analyzeProject = vi.fn().mockRejectedValue(new Error('Project not found'));

      const request: PipelineGenerationRequest = {
        projectId: 'non-existent-project' as any,
        type: PipelineType.FULL_CICD,
        requirements: {
          maxDuration: 3600,
          securityScanRequired: true,
          complianceChecks: [],
          environmentTargets: [],
          qualityGates: []
        },
        preferences: {
          parallelizationLevel: 'medium',
          resourceOptimization: true,
          cachingEnabled: true
        }
      };

      await expect(pipelineService.generatePipeline(request))
        .rejects.toThrow('Failed to generate pipeline');

      // Restore original method
      pipelineService['projectAnalyzer'].analyzeProject = originalAnalyzeProject;
    });
  });

  describe('optimizePipeline', () => {
    it('should optimize an existing pipeline', async () => {
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

      const originalPipeline = await pipelineService.generatePipeline(request);
      const optimizedPipeline = await pipelineService.optimizePipeline(originalPipeline);

      expect(optimizedPipeline).toBeDefined();
      expect(optimizedPipeline.optimizations.length).toBeGreaterThan(0);
    });
  });

  describe('validatePipeline', () => {
    it('should validate a pipeline', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const validationResult = await pipelineService.validatePipeline(pipeline);

      expect(validationResult).toBeDefined();
      expect(validationResult.isValid).toBe(true);
      expect(Array.isArray(validationResult.errors)).toBe(true);
      expect(Array.isArray(validationResult.warnings)).toBe(true);
      expect(Array.isArray(validationResult.suggestions)).toBe(true);
    });
  });

  describe('estimatePipelineDuration', () => {
    it('should estimate pipeline duration', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const duration = await pipelineService.estimatePipelineDuration(pipeline);

      expect(duration).toBeGreaterThan(0);
      expect(typeof duration).toBe('number');
    });
  });

  describe('analyzeProject', () => {
    it('should analyze project characteristics', async () => {
      const projectId = 'test-project-id' as any;
      const characteristics = await pipelineService.analyzeProject(projectId);

      expect(characteristics).toBeDefined();
      expect(characteristics.projectId).toBe(projectId);
      expect(Array.isArray(characteristics.languages)).toBe(true);
      expect(Array.isArray(characteristics.frameworks)).toBe(true);
      expect(Array.isArray(characteristics.dependencies)).toBe(true);
      expect(typeof characteristics.complexity).toBe('string');
      expect(typeof characteristics.criticality).toBe('string');
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return available pipeline templates', async () => {
      const templates = await pipelineService.getAvailableTemplates();

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      
      templates.forEach(template => {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('type');
        expect(template).toHaveProperty('stages');
        expect(Array.isArray(template.stages)).toBe(true);
      });
    });
  });

  describe('getRecommendedTestingStrategy', () => {
    it('should recommend testing strategy for a project', async () => {
      const projectId = 'test-project-id' as any;
      const recommendation = await pipelineService.getRecommendedTestingStrategy(projectId);

      expect(recommendation).toBeDefined();
      expect(recommendation).toHaveProperty('strategy');
      expect(recommendation).toHaveProperty('testTypes');
      expect(recommendation).toHaveProperty('estimatedDuration');
      expect(recommendation).toHaveProperty('characteristics');
      
      expect(Array.isArray(recommendation.testTypes)).toBe(true);
      expect(typeof recommendation.estimatedDuration).toBe('number');
      expect(Object.values(TestingStrategy)).toContain(recommendation.strategy);
    });
  });

  describe('getOptimizationSuggestions', () => {
    it('should provide optimization suggestions', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const suggestions = await pipelineService.getOptimizationSuggestions(pipeline);

      expect(suggestions).toBeDefined();
      expect(suggestions).toHaveProperty('speed');
      expect(suggestions).toHaveProperty('resources');
      expect(suggestions).toHaveProperty('reliability');
      expect(suggestions).toHaveProperty('all');
      
      expect(Array.isArray(suggestions.speed)).toBe(true);
      expect(Array.isArray(suggestions.resources)).toBe(true);
      expect(Array.isArray(suggestions.reliability)).toBe(true);
      expect(Array.isArray(suggestions.all)).toBe(true);
    });
  });

  describe('generatePlatformConfig', () => {
    it('should generate GitHub Actions configuration', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const config = await pipelineService.generatePlatformConfig(pipeline, 'github');

      expect(typeof config).toBe('string');
      expect(config).toContain('name:');
      expect(config).toContain('on:');
      expect(config).toContain('jobs:');
      expect(config).toContain('steps:');
    });

    it('should generate GitLab CI configuration', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const config = await pipelineService.generatePlatformConfig(pipeline, 'gitlab');

      expect(typeof config).toBe('string');
      expect(config).toContain('stages:');
      expect(config).toContain('script:');
    });

    it('should generate Jenkins configuration', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const config = await pipelineService.generatePlatformConfig(pipeline, 'jenkins');

      expect(typeof config).toBe('string');
      expect(config).toContain('pipeline');
      expect(config).toContain('stages');
      expect(config).toContain('steps');
    });

    it('should generate Azure Pipelines configuration', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      const config = await pipelineService.generatePlatformConfig(pipeline, 'azure');

      expect(typeof config).toBe('string');
      expect(config).toContain('trigger:');
      expect(config).toContain('pool:');
      expect(config).toContain('jobs:');
    });

    it('should throw error for unsupported platform', async () => {
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

      const pipeline = await pipelineService.generatePipeline(request);
      
      await expect(pipelineService.generatePlatformConfig(pipeline, 'unsupported' as any))
        .rejects.toThrow('Failed to generate platform config');
    });
  });
});