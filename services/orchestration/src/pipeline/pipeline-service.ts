import { UUID } from '@devflow/shared-types';
import {
  PipelineGenerator,
  PipelineTemplateManager,
  ProjectAnalyzer,
  TestingStrategySelector,
  PipelineOptimizer
} from './interfaces';
import {
  GeneratedPipeline,
  PipelineGenerationRequest,
  PipelineTemplate,
  ProjectCharacteristics
} from './types';
import { IntelligentPipelineGenerator } from './pipeline-generator';
import { DefaultPipelineTemplateManager } from './template-manager';
import { IntelligentProjectAnalyzer } from './project-analyzer';
import { IntelligentTestingStrategySelector } from './testing-strategy-selector';
import { IntelligentPipelineOptimizer } from './pipeline-optimizer';

export class PipelineService {
  private pipelineGenerator: PipelineGenerator;
  private templateManager: PipelineTemplateManager;
  private projectAnalyzer: ProjectAnalyzer;
  private testingStrategySelector: TestingStrategySelector;
  private pipelineOptimizer: PipelineOptimizer;

  constructor(
    projectRepository?: any,
    codeAnalysisService?: any
  ) {
    this.templateManager = new DefaultPipelineTemplateManager();
    this.projectAnalyzer = new IntelligentProjectAnalyzer(projectRepository, codeAnalysisService);
    this.testingStrategySelector = new IntelligentTestingStrategySelector();
    this.pipelineOptimizer = new IntelligentPipelineOptimizer();
    
    this.pipelineGenerator = new IntelligentPipelineGenerator(
      this.templateManager,
      this.projectAnalyzer,
      this.testingStrategySelector,
      this.pipelineOptimizer
    );
  }

  /**
   * Generate an intelligent CI/CD pipeline for a project
   */
  async generatePipeline(request: PipelineGenerationRequest): Promise<GeneratedPipeline> {
    try {
      const pipeline = await this.pipelineGenerator.generatePipeline(request);
      
      // Validate the generated pipeline
      const validationResult = await this.pipelineGenerator.validatePipeline(pipeline);
      
      if (!validationResult.isValid) {
        throw new Error(`Pipeline validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }

      return pipeline;
    } catch (error) {
      throw new Error(`Failed to generate pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Optimize an existing pipeline
   */
  async optimizePipeline(pipeline: GeneratedPipeline): Promise<GeneratedPipeline> {
    try {
      return await this.pipelineGenerator.optimizePipeline(pipeline);
    } catch (error) {
      throw new Error(`Failed to optimize pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate a pipeline configuration
   */
  async validatePipeline(pipeline: GeneratedPipeline) {
    try {
      return await this.pipelineGenerator.validatePipeline(pipeline);
    } catch (error) {
      throw new Error(`Failed to validate pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Estimate pipeline execution duration
   */
  async estimatePipelineDuration(pipeline: GeneratedPipeline): Promise<number> {
    try {
      return await this.pipelineGenerator.estimateDuration(pipeline);
    } catch (error) {
      throw new Error(`Failed to estimate pipeline duration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze project characteristics for pipeline generation
   */
  async analyzeProject(projectId: UUID): Promise<ProjectCharacteristics> {
    try {
      return await this.projectAnalyzer.analyzeProject(projectId);
    } catch (error) {
      throw new Error(`Failed to analyze project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get available pipeline templates
   */
  async getAvailableTemplates(): Promise<PipelineTemplate[]> {
    try {
      return await this.templateManager.getTemplates();
    } catch (error) {
      throw new Error(`Failed to get templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Find templates matching project characteristics
   */
  async findMatchingTemplates(characteristics: ProjectCharacteristics): Promise<PipelineTemplate[]> {
    try {
      return await this.templateManager.findMatchingTemplates(characteristics);
    } catch (error) {
      throw new Error(`Failed to find matching templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a custom pipeline template
   */
  async createTemplate(template: Omit<PipelineTemplate, 'id'>): Promise<PipelineTemplate> {
    try {
      return await this.templateManager.createTemplate(template);
    } catch (error) {
      throw new Error(`Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recommended testing strategy for a project
   */
  async getRecommendedTestingStrategy(projectId: UUID) {
    try {
      const characteristics = await this.projectAnalyzer.analyzeProject(projectId);
      const strategy = await this.testingStrategySelector.selectStrategy(characteristics);
      const testTypes = await this.testingStrategySelector.getRecommendedTestTypes(characteristics);
      const estimatedDuration = await this.testingStrategySelector.estimateTestDuration(strategy, characteristics);

      return {
        strategy,
        testTypes,
        estimatedDuration,
        characteristics
      };
    } catch (error) {
      throw new Error(`Failed to get testing strategy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get pipeline optimization suggestions
   */
  async getOptimizationSuggestions(pipeline: GeneratedPipeline) {
    try {
      const speedOptimizations = await this.pipelineOptimizer.optimizeForSpeed(pipeline);
      const resourceOptimizations = await this.pipelineOptimizer.optimizeForResources(pipeline);
      const reliabilityOptimizations = await this.pipelineOptimizer.optimizeForReliability(pipeline);

      return {
        speed: speedOptimizations,
        resources: resourceOptimizations,
        reliability: reliabilityOptimizations,
        all: [...speedOptimizations, ...resourceOptimizations, ...reliabilityOptimizations]
      };
    } catch (error) {
      throw new Error(`Failed to get optimization suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate pipeline configuration for specific CI/CD platforms
   */
  async generatePlatformConfig(pipeline: GeneratedPipeline, platform: 'github' | 'gitlab' | 'jenkins' | 'azure'): Promise<string> {
    try {
      switch (platform) {
        case 'github':
          return this.generateGitHubActionsConfig(pipeline);
        case 'gitlab':
          return this.generateGitLabCIConfig(pipeline);
        case 'jenkins':
          return this.generateJenkinsConfig(pipeline);
        case 'azure':
          return this.generateAzurePipelinesConfig(pipeline);
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      throw new Error(`Failed to generate platform config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateGitHubActionsConfig(pipeline: GeneratedPipeline): string {
    const stages = pipeline.stages.map(stage => {
      const stepName = stage.name.toLowerCase().replace(/\s+/g, '-');
      return `
      - name: ${stage.name}
        run: |
          ${stage.commands.join('\n          ')}
        timeout-minutes: ${Math.ceil(stage.timeout / 60)}
        env:
          ${Object.entries(stage.environment).map(([key, value]) => `${key}: ${value}`).join('\n          ')}`;
    }).join('');

    return `
name: ${pipeline.name}

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  pipeline:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      ${stages}
`;
  }

  private generateGitLabCIConfig(pipeline: GeneratedPipeline): string {
    const stages = pipeline.stages.map(stage => {
      const stageName = stage.name.toLowerCase().replace(/\s+/g, '-');
      return `
${stageName}:
  stage: ${stage.stage}
  script:
    ${stage.commands.map(cmd => `- ${cmd}`).join('\n    ')}
  timeout: ${Math.ceil(stage.timeout / 60)}m
  variables:
    ${Object.entries(stage.environment).map(([key, value]) => `${key}: "${value}"`).join('\n    ')}
`;
    }).join('');

    const stageNames = [...new Set(pipeline.stages.map(s => s.stage))];

    return `
stages:
  ${stageNames.map(stage => `- ${stage}`).join('\n  ')}

${stages}
`;
  }

  private generateJenkinsConfig(pipeline: GeneratedPipeline): string {
    const stages = pipeline.stages.map(stage => `
        stage('${stage.name}') {
            steps {
                timeout(time: ${Math.ceil(stage.timeout / 60)}, unit: 'MINUTES') {
                    ${stage.commands.map(cmd => `sh '${cmd}'`).join('\n                    ')}
                }
            }
            environment {
                ${Object.entries(stage.environment).map(([key, value]) => `${key} = '${value}'`).join('\n                ')}
            }
        }`).join('');

    return `
pipeline {
    agent any
    
    stages {${stages}
    }
    
    post {
        always {
            cleanWs()
        }
    }
}
`;
  }

  private generateAzurePipelinesConfig(pipeline: GeneratedPipeline): string {
    const jobs = pipeline.stages.map(stage => {
      const jobName = stage.name.toLowerCase().replace(/\s+/g, '');
      return `
  - job: ${jobName}
    displayName: '${stage.name}'
    timeoutInMinutes: ${Math.ceil(stage.timeout / 60)}
    variables:
      ${Object.entries(stage.environment).map(([key, value]) => `${key}: '${value}'`).join('\n      ')}
    steps:
      ${stage.commands.map(cmd => `- script: ${cmd}`).join('\n      ')}`;
    }).join('');

    return `
trigger:
  branches:
    include:
      - main
      - develop

pool:
  vmImage: 'ubuntu-latest'

jobs:${jobs}
`;
  }
}