import { UUID } from '@devflow/shared-types';
import { v4 as uuidv4 } from 'uuid';
import {
  PipelineGenerator,
  PipelineTemplateManager,
  ProjectAnalyzer,
  TestingStrategySelector,
  PipelineOptimizer,
  PipelineValidationResult
} from './interfaces';
import {
  GeneratedPipeline,
  PipelineGenerationRequest,
  PipelineStage,
  PipelineStageConfig,
  TestingStrategy,
  DeploymentStrategy,
  PipelineType
} from './types';

export class IntelligentPipelineGenerator implements PipelineGenerator {
  constructor(
    private templateManager: PipelineTemplateManager,
    private projectAnalyzer: ProjectAnalyzer,
    private testingStrategySelector: TestingStrategySelector,
    private pipelineOptimizer: PipelineOptimizer
  ) {}

  async generatePipeline(request: PipelineGenerationRequest): Promise<GeneratedPipeline> {
    // Analyze project characteristics
    const characteristics = await this.projectAnalyzer.analyzeProject(request.projectId);
    
    // Find matching templates
    const matchingTemplates = await this.templateManager.findMatchingTemplates(characteristics);
    
    // Select best template based on requirements
    const selectedTemplate = this.selectBestTemplate(matchingTemplates, request);
    
    // Generate base pipeline from template
    const basePipeline = await this.generateFromTemplate(selectedTemplate, request, characteristics);
    
    // Select optimal testing strategy
    const testingStrategy = request.preferences.testingStrategy || 
      await this.testingStrategySelector.selectStrategy(characteristics);
    
    // Apply testing strategy to pipeline
    const pipelineWithTesting = await this.applyTestingStrategy(basePipeline, testingStrategy, characteristics);
    
    // Apply optimizations
    const optimizedPipeline = await this.optimizePipeline(pipelineWithTesting);
    
    return optimizedPipeline;
  }

  async optimizePipeline(pipeline: GeneratedPipeline): Promise<GeneratedPipeline> {
    const optimizations = await this.pipelineOptimizer.optimizeForSpeed(pipeline);
    const resourceOptimizations = await this.pipelineOptimizer.optimizeForResources(pipeline);
    const reliabilityOptimizations = await this.pipelineOptimizer.optimizeForReliability(pipeline);
    
    const allOptimizations = [...optimizations, ...resourceOptimizations, ...reliabilityOptimizations];
    
    return await this.pipelineOptimizer.applyOptimizations(pipeline, allOptimizations);
  }

  async validatePipeline(pipeline: GeneratedPipeline): Promise<PipelineValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    // Validate stage dependencies
    this.validateStageDependencies(pipeline, errors);
    
    // Validate resource requirements
    this.validateResourceRequirements(pipeline, warnings);
    
    // Validate security requirements
    this.validateSecurityRequirements(pipeline, errors, warnings);
    
    // Generate optimization suggestions
    this.generateOptimizationSuggestions(pipeline, suggestions);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  async estimateDuration(pipeline: GeneratedPipeline): Promise<number> {
    let totalDuration = 0;
    const parallelStages = this.groupParallelStages(pipeline.stages);
    
    for (const stageGroup of parallelStages) {
      const maxDurationInGroup = Math.max(...stageGroup.map(stage => stage.timeout));
      totalDuration += maxDurationInGroup;
    }
    
    // Add buffer for setup and teardown
    return totalDuration * 1.2;
  }

  private selectBestTemplate(templates: any[], request: PipelineGenerationRequest): any {
    if (templates.length === 0) {
      return this.getDefaultTemplate(request.type);
    }
    
    // Score templates based on requirements match
    const scoredTemplates = templates.map(template => ({
      template,
      score: this.scoreTemplate(template, request)
    }));
    
    // Return highest scoring template
    return scoredTemplates.sort((a, b) => b.score - a.score)[0].template;
  }

  private scoreTemplate(template: any, request: PipelineGenerationRequest): number {
    let score = 0;
    
    // Type match
    if (template.type === request.type) score += 10;
    
    // Requirements match
    if (request.requirements.securityScanRequired) {
      const hasSecurityScan = template.stages.some((stage: any) => 
        stage.stage === PipelineStage.SECURITY_SCAN
      );
      if (hasSecurityScan) score += 5;
    }
    
    // Duration preference
    const templateDuration = template.stages.reduce((sum: number, stage: any) => sum + stage.timeout, 0);
    if (templateDuration <= request.requirements.maxDuration) score += 3;
    
    return score;
  }

  private async generateFromTemplate(
    template: any, 
    request: PipelineGenerationRequest, 
    characteristics: any
  ): Promise<GeneratedPipeline> {
    const stages = template.stages.map((stageConfig: any) => ({
      ...stageConfig,
      commands: this.customizeCommands(stageConfig.commands, characteristics),
      environment: this.customizeEnvironment(stageConfig.environment, characteristics)
    }));

    return {
      id: uuidv4() as UUID,
      projectId: request.projectId,
      name: `Generated ${template.name}`,
      type: request.type,
      stages,
      testingStrategy: TestingStrategy.BALANCED,
      deploymentStrategy: DeploymentStrategy.ROLLING,
      optimizations: [],
      estimatedDuration: 0,
      createdAt: new Date()
    };
  }

  private async applyTestingStrategy(
    pipeline: GeneratedPipeline, 
    strategy: TestingStrategy, 
    characteristics: any
  ): Promise<GeneratedPipeline> {
    const testStages = this.generateTestStages(strategy, characteristics);
    
    // Insert test stages at appropriate positions
    const updatedStages = [...pipeline.stages];
    
    // Add unit tests after build
    const buildIndex = updatedStages.findIndex(stage => stage.stage === PipelineStage.BUILD);
    if (buildIndex !== -1 && testStages.unitTest) {
      updatedStages.splice(buildIndex + 1, 0, testStages.unitTest);
    }
    
    // Add integration tests after unit tests
    const unitTestIndex = updatedStages.findIndex(stage => stage.stage === PipelineStage.UNIT_TEST);
    if (unitTestIndex !== -1 && testStages.integrationTest) {
      updatedStages.splice(unitTestIndex + 1, 0, testStages.integrationTest);
    }
    
    // Add E2E tests after integration tests or unit tests
    const integrationTestIndex = updatedStages.findIndex(stage => stage.stage === PipelineStage.INTEGRATION_TEST);
    const insertIndex = integrationTestIndex !== -1 ? integrationTestIndex + 1 : 
                       (unitTestIndex !== -1 ? unitTestIndex + 1 : updatedStages.length);
    if (testStages.e2eTest) {
      updatedStages.splice(insertIndex, 0, testStages.e2eTest);
    }
    
    return {
      ...pipeline,
      stages: updatedStages,
      testingStrategy: strategy
    };
  }

  private generateTestStages(strategy: TestingStrategy, characteristics: any): any {
    const stages: any = {};
    
    switch (strategy) {
      case TestingStrategy.UNIT_ONLY:
        stages.unitTest = this.createUnitTestStage(characteristics);
        break;
      case TestingStrategy.INTEGRATION_FOCUSED:
        stages.unitTest = this.createUnitTestStage(characteristics);
        stages.integrationTest = this.createIntegrationTestStage(characteristics);
        break;
      case TestingStrategy.E2E_HEAVY:
        stages.unitTest = this.createUnitTestStage(characteristics);
        stages.integrationTest = this.createIntegrationTestStage(characteristics);
        stages.e2eTest = this.createE2ETestStage(characteristics);
        break;
      case TestingStrategy.BALANCED:
        stages.unitTest = this.createUnitTestStage(characteristics);
        stages.integrationTest = this.createIntegrationTestStage(characteristics);
        break;
    }
    
    return stages;
  }

  private createUnitTestStage(characteristics: any): PipelineStageConfig {
    const commands = this.getTestCommands('unit', characteristics.languages);
    
    return {
      stage: PipelineStage.UNIT_TEST,
      name: 'Unit Tests',
      commands,
      environment: {},
      timeout: 300, // 5 minutes
      retryConfig: {
        maxAttempts: 2,
        backoffStrategy: 'linear'
      },
      conditions: [],
      parallelizable: true,
      required: true
    };
  }

  private createIntegrationTestStage(characteristics: any): PipelineStageConfig {
    const commands = this.getTestCommands('integration', characteristics.languages);
    
    return {
      stage: PipelineStage.INTEGRATION_TEST,
      name: 'Integration Tests',
      commands,
      environment: {},
      timeout: 600, // 10 minutes
      retryConfig: {
        maxAttempts: 2,
        backoffStrategy: 'exponential'
      },
      conditions: [],
      parallelizable: false,
      required: true
    };
  }

  private createE2ETestStage(characteristics: any): PipelineStageConfig {
    const commands = this.getTestCommands('e2e', characteristics.languages);
    
    return {
      stage: PipelineStage.E2E_TEST,
      name: 'End-to-End Tests',
      commands,
      environment: {},
      timeout: 1200, // 20 minutes
      retryConfig: {
        maxAttempts: 1,
        backoffStrategy: 'linear'
      },
      conditions: [],
      parallelizable: false,
      required: false
    };
  }

  private getTestCommands(testType: string, languages: string[]): string[] {
    const commandMap: Record<string, Record<string, string[]>> = {
      unit: {
        javascript: ['npm test', 'npm run test:unit'],
        typescript: ['npm test', 'npm run test:unit'],
        python: ['pytest tests/unit/', 'python -m pytest tests/unit/'],
        java: ['mvn test', './gradlew test'],
        csharp: ['dotnet test']
      },
      integration: {
        javascript: ['npm run test:integration'],
        typescript: ['npm run test:integration'],
        python: ['pytest tests/integration/'],
        java: ['mvn integration-test'],
        csharp: ['dotnet test --filter Category=Integration']
      },
      e2e: {
        javascript: ['npm run test:e2e'],
        typescript: ['npm run test:e2e'],
        python: ['pytest tests/e2e/'],
        java: ['mvn verify'],
        csharp: ['dotnet test --filter Category=E2E']
      }
    };
    
    const primaryLanguage = languages[0]?.toLowerCase() || 'javascript';
    return commandMap[testType][primaryLanguage] || commandMap[testType]['javascript'];
  }

  private customizeCommands(commands: string[], characteristics: any): string[] {
    return commands.map(command => {
      // Replace placeholders with actual values
      return command
        .replace('{{BUILD_COMMAND}}', this.getBuildCommand(characteristics))
        .replace('{{TEST_COMMAND}}', this.getTestCommand(characteristics))
        .replace('{{PACKAGE_MANAGER}}', this.getPackageManager(characteristics));
    });
  }

  private customizeEnvironment(environment: Record<string, string>, characteristics: any): Record<string, string> {
    return {
      ...environment,
      NODE_ENV: 'test',
      CI: 'true',
      PROJECT_COMPLEXITY: characteristics.complexity
    };
  }

  private getBuildCommand(characteristics: any): string {
    const primaryLanguage = characteristics.languages[0]?.toLowerCase();
    
    switch (primaryLanguage) {
      case 'javascript':
      case 'typescript':
        return 'npm run build';
      case 'python':
        return 'python setup.py build';
      case 'java':
        return 'mvn compile';
      case 'csharp':
        return 'dotnet build';
      default:
        return 'make build';
    }
  }

  private getTestCommand(characteristics: any): string {
    const primaryLanguage = characteristics.languages[0]?.toLowerCase();
    
    switch (primaryLanguage) {
      case 'javascript':
      case 'typescript':
        return 'npm test';
      case 'python':
        return 'pytest';
      case 'java':
        return 'mvn test';
      case 'csharp':
        return 'dotnet test';
      default:
        return 'make test';
    }
  }

  private getPackageManager(characteristics: any): string {
    if (characteristics.dependencies.includes('package-lock.json')) return 'npm';
    if (characteristics.dependencies.includes('yarn.lock')) return 'yarn';
    if (characteristics.dependencies.includes('pnpm-lock.yaml')) return 'pnpm';
    return 'npm';
  }

  private getDefaultTemplate(type: PipelineType): any {
    return {
      id: uuidv4(),
      name: `Default ${type} Pipeline`,
      type,
      stages: this.getDefaultStages(type)
    };
  }

  private getDefaultStages(type: PipelineType): PipelineStageConfig[] {
    const baseStages: PipelineStageConfig[] = [
      {
        stage: PipelineStage.BUILD,
        name: 'Build',
        commands: ['{{BUILD_COMMAND}}'],
        environment: {},
        timeout: 600,
        retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
        conditions: [],
        parallelizable: false,
        required: true
      }
    ];

    if (type === PipelineType.FULL_CICD) {
      baseStages.push(
        {
          stage: PipelineStage.SECURITY_SCAN,
          name: 'Security Scan',
          commands: ['npm audit', 'snyk test'],
          environment: {},
          timeout: 300,
          retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        },
        {
          stage: PipelineStage.DEPLOY_STAGING,
          name: 'Deploy to Staging',
          commands: ['deploy-staging.sh'],
          environment: { ENVIRONMENT: 'staging' },
          timeout: 900,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'exponential' },
          conditions: [],
          parallelizable: false,
          required: true
        }
      );
    }

    return baseStages;
  }

  private validateStageDependencies(pipeline: GeneratedPipeline, errors: any[]): void {
    // Implementation for stage dependency validation
    const stageOrder = [
      PipelineStage.BUILD,
      PipelineStage.UNIT_TEST,
      PipelineStage.INTEGRATION_TEST,
      PipelineStage.SECURITY_SCAN,
      PipelineStage.QUALITY_GATE,
      PipelineStage.DEPLOY_STAGING,
      PipelineStage.E2E_TEST,
      PipelineStage.DEPLOY_PRODUCTION
    ];

    const presentStages = pipeline.stages.map(s => s.stage);
    
    for (let i = 0; i < presentStages.length - 1; i++) {
      const currentStageIndex = stageOrder.indexOf(presentStages[i]);
      const nextStageIndex = stageOrder.indexOf(presentStages[i + 1]);
      
      if (currentStageIndex > nextStageIndex) {
        errors.push({
          stage: presentStages[i + 1],
          field: 'order',
          message: `Stage ${presentStages[i + 1]} should come before ${presentStages[i]}`,
          code: 'INVALID_STAGE_ORDER'
        });
      }
    }
  }

  private validateResourceRequirements(pipeline: GeneratedPipeline, warnings: any[]): void {
    const totalTimeout = pipeline.stages.reduce((sum, stage) => sum + stage.timeout, 0);
    
    if (totalTimeout > 3600) { // 1 hour
      warnings.push({
        stage: 'pipeline',
        field: 'duration',
        message: 'Pipeline duration exceeds 1 hour, consider optimization',
        code: 'LONG_PIPELINE_DURATION'
      });
    }
  }

  private validateSecurityRequirements(pipeline: GeneratedPipeline, errors: any[], warnings: any[]): void {
    const hasSecurityScan = pipeline.stages.some(stage => stage.stage === PipelineStage.SECURITY_SCAN);
    
    if (!hasSecurityScan) {
      warnings.push({
        stage: 'pipeline',
        field: 'security',
        message: 'No security scan stage found, consider adding vulnerability scanning',
        code: 'MISSING_SECURITY_SCAN'
      });
    }
  }

  private generateOptimizationSuggestions(pipeline: GeneratedPipeline, suggestions: any[]): void {
    // Check for parallelizable stages
    const parallelizableStages = pipeline.stages.filter(stage => stage.parallelizable);
    
    if (parallelizableStages.length > 1) {
      suggestions.push({
        stage: 'pipeline',
        type: 'optimization',
        message: `${parallelizableStages.length} stages can be run in parallel to reduce duration`,
        impact: 'high'
      });
    }
  }

  private groupParallelStages(stages: PipelineStageConfig[]): PipelineStageConfig[][] {
    const groups: PipelineStageConfig[][] = [];
    let currentGroup: PipelineStageConfig[] = [];
    
    for (const stage of stages) {
      if (stage.parallelizable && currentGroup.length === 0) {
        currentGroup.push(stage);
      } else if (stage.parallelizable && currentGroup.length > 0 && currentGroup[0].parallelizable) {
        currentGroup.push(stage);
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([stage]);
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
}