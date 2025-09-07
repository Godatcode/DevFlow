import { PipelineOptimizer } from './interfaces';
import { GeneratedPipeline, PipelineOptimization, PipelineStage } from './types';

export class IntelligentPipelineOptimizer implements PipelineOptimizer {
  async optimizeForSpeed(pipeline: GeneratedPipeline): Promise<PipelineOptimization[]> {
    const optimizations: PipelineOptimization[] = [];

    // Identify parallelizable stages
    const parallelizableStages = pipeline.stages.filter(stage => stage.parallelizable);
    if (parallelizableStages.length > 1) {
      optimizations.push({
        type: 'parallelization',
        description: `Run ${parallelizableStages.length} stages in parallel to reduce execution time`,
        impact: 'high',
        implementation: {
          parallelStages: parallelizableStages.map(s => s.stage),
          estimatedTimeSaving: this.calculateParallelTimeSaving(parallelizableStages)
        }
      });
    }

    // Suggest caching for build stages
    const buildStages = pipeline.stages.filter(stage => 
      stage.stage === PipelineStage.BUILD || 
      stage.commands.some(cmd => cmd.includes('install') || cmd.includes('build'))
    );

    if (buildStages.length > 0) {
      optimizations.push({
        type: 'caching',
        description: 'Enable dependency and build artifact caching to speed up subsequent runs',
        impact: 'high',
        implementation: {
          cacheKeys: ['node_modules', 'target', 'dist', '.gradle'],
          stages: buildStages.map(s => s.stage),
          estimatedTimeSaving: 300 // 5 minutes average
        }
      });
    }

    // Suggest stage skipping for unchanged code
    optimizations.push({
      type: 'stage_skipping',
      description: 'Skip stages when related code has not changed',
      impact: 'medium',
      implementation: {
        skipConditions: [
          { stage: PipelineStage.UNIT_TEST, condition: 'no_test_changes' },
          { stage: PipelineStage.SECURITY_SCAN, condition: 'no_dependency_changes' },
          { stage: PipelineStage.BUILD, condition: 'no_source_changes' }
        ],
        estimatedTimeSaving: 180 // 3 minutes average
      }
    });

    // Optimize test execution
    const testStages = pipeline.stages.filter(stage => 
      stage.stage === PipelineStage.UNIT_TEST ||
      stage.stage === PipelineStage.INTEGRATION_TEST ||
      stage.stage === PipelineStage.E2E_TEST
    );

    if (testStages.length > 0) {
      optimizations.push({
        type: 'parallelization',
        description: 'Run tests in parallel and only test changed code',
        impact: 'medium',
        implementation: {
          testParallelization: true,
          changedFilesOnly: true,
          maxWorkers: 4,
          estimatedTimeSaving: 120 // 2 minutes average
        }
      });
    }

    return optimizations;
  }

  async optimizeForResources(pipeline: GeneratedPipeline): Promise<PipelineOptimization[]> {
    const optimizations: PipelineOptimization[] = [];

    // Resource allocation optimization
    optimizations.push({
      type: 'resource_allocation',
      description: 'Optimize CPU and memory allocation based on stage requirements',
      impact: 'medium',
      implementation: {
        stageResources: this.calculateOptimalResources(pipeline.stages),
        costSaving: 'up to 30%'
      }
    });

    // Container image optimization
    const containerStages = pipeline.stages.filter(stage =>
      stage.commands.some(cmd => cmd.includes('docker'))
    );

    if (containerStages.length > 0) {
      optimizations.push({
        type: 'caching',
        description: 'Use multi-stage Docker builds and layer caching',
        impact: 'high',
        implementation: {
          multiStageBuilds: true,
          layerCaching: true,
          baseImageOptimization: true,
          estimatedSizeReduction: '60%'
        }
      });
    }

    // Dependency optimization
    optimizations.push({
      type: 'caching',
      description: 'Cache dependencies across pipeline runs',
      impact: 'medium',
      implementation: {
        dependencyCache: true,
        cacheScope: 'project',
        invalidationStrategy: 'checksum',
        estimatedBandwidthSaving: '80%'
      }
    });

    return optimizations;
  }

  async optimizeForReliability(pipeline: GeneratedPipeline): Promise<PipelineOptimization[]> {
    const optimizations: PipelineOptimization[] = [];

    // Retry configuration optimization
    const criticalStages = pipeline.stages.filter(stage =>
      stage.stage === PipelineStage.DEPLOY_PRODUCTION ||
      stage.stage === PipelineStage.DEPLOY_STAGING ||
      stage.required
    );

    if (criticalStages.length > 0) {
      optimizations.push({
        type: 'resource_allocation',
        description: 'Optimize retry strategies for critical stages',
        impact: 'high',
        implementation: {
          retryStrategies: criticalStages.map(stage => ({
            stage: stage.stage,
            maxAttempts: stage.stage.includes('DEPLOY') ? 3 : 2,
            backoffStrategy: 'exponential',
            timeout: stage.timeout * 1.5
          }))
        }
      });
    }

    // Health checks and monitoring
    optimizations.push({
      type: 'resource_allocation',
      description: 'Add health checks and monitoring to detect failures early',
      impact: 'medium',
      implementation: {
        healthChecks: true,
        monitoringIntegration: true,
        alerting: true,
        rollbackTriggers: ['health_check_failure', 'error_rate_spike']
      }
    });

    // Deployment safety measures
    const deploymentStages = pipeline.stages.filter(stage =>
      stage.stage === PipelineStage.DEPLOY_PRODUCTION ||
      stage.stage === PipelineStage.DEPLOY_STAGING
    );

    if (deploymentStages.length > 0) {
      optimizations.push({
        type: 'resource_allocation',
        description: 'Implement blue-green deployment and automatic rollback',
        impact: 'high',
        implementation: {
          deploymentStrategy: 'blue_green',
          automaticRollback: true,
          rollbackTriggers: ['health_check_failure', 'error_rate_threshold'],
          rollbackTimeout: 600 // 10 minutes
        }
      });
    }

    // Test reliability improvements
    const testStages = pipeline.stages.filter(stage =>
      stage.stage === PipelineStage.UNIT_TEST ||
      stage.stage === PipelineStage.INTEGRATION_TEST ||
      stage.stage === PipelineStage.E2E_TEST
    );

    if (testStages.length > 0) {
      optimizations.push({
        type: 'resource_allocation',
        description: 'Improve test reliability with better isolation and retry logic',
        impact: 'medium',
        implementation: {
          testIsolation: true,
          flakyTestDetection: true,
          testRetryLogic: true,
          parallelTestExecution: false // For reliability
        }
      });
    }

    return optimizations;
  }

  async applyOptimizations(
    pipeline: GeneratedPipeline, 
    optimizations: PipelineOptimization[]
  ): Promise<GeneratedPipeline> {
    let optimizedPipeline = { ...pipeline };

    for (const optimization of optimizations) {
      optimizedPipeline = await this.applyOptimization(optimizedPipeline, optimization);
    }

    // Recalculate estimated duration
    optimizedPipeline.estimatedDuration = this.calculateOptimizedDuration(
      optimizedPipeline, 
      optimizations
    );

    // Add optimizations to pipeline metadata
    optimizedPipeline.optimizations = optimizations;

    return optimizedPipeline;
  }

  private async applyOptimization(
    pipeline: GeneratedPipeline, 
    optimization: PipelineOptimization
  ): Promise<GeneratedPipeline> {
    const optimizedPipeline = { ...pipeline };

    switch (optimization.type) {
      case 'caching':
        optimizedPipeline.stages = this.applyCachingOptimization(
          pipeline.stages, 
          optimization.implementation
        );
        break;

      case 'parallelization':
        optimizedPipeline.stages = this.applyParallelizationOptimization(
          pipeline.stages, 
          optimization.implementation
        );
        break;

      case 'resource_allocation':
        optimizedPipeline.stages = this.applyResourceOptimization(
          pipeline.stages, 
          optimization.implementation
        );
        break;

      case 'stage_skipping':
        optimizedPipeline.stages = this.applyStageSkippingOptimization(
          pipeline.stages, 
          optimization.implementation
        );
        break;
    }

    return optimizedPipeline;
  }

  private applyCachingOptimization(stages: any[], implementation: any): any[] {
    return stages.map(stage => {
      if (implementation.stages?.includes(stage.stage) || 
          stage.commands.some((cmd: string) => cmd.includes('install') || cmd.includes('build'))) {
        return {
          ...stage,
          environment: {
            ...stage.environment,
            CACHE_ENABLED: 'true',
            CACHE_KEY: implementation.cacheKeys?.join(',') || 'default'
          },
          commands: [
            'echo "Restoring cache..."',
            ...stage.commands,
            'echo "Saving cache..."'
          ]
        };
      }
      return stage;
    });
  }

  private applyParallelizationOptimization(stages: any[], implementation: any): any[] {
    if (implementation.parallelStages) {
      return stages.map(stage => {
        if (implementation.parallelStages.includes(stage.stage)) {
          return {
            ...stage,
            parallelizable: true,
            environment: {
              ...stage.environment,
              PARALLEL_EXECUTION: 'true'
            }
          };
        }
        return stage;
      });
    }

    if (implementation.testParallelization) {
      return stages.map(stage => {
        if (stage.stage === PipelineStage.UNIT_TEST || 
            stage.stage === PipelineStage.INTEGRATION_TEST) {
          return {
            ...stage,
            commands: stage.commands.map((cmd: string) => 
              cmd.includes('test') ? `${cmd} --parallel --max-workers=${implementation.maxWorkers || 4}` : cmd
            ),
            environment: {
              ...stage.environment,
              TEST_PARALLEL: 'true',
              MAX_WORKERS: implementation.maxWorkers?.toString() || '4'
            }
          };
        }
        return stage;
      });
    }

    return stages;
  }

  private applyResourceOptimization(stages: any[], implementation: any): any[] {
    if (implementation.stageResources) {
      return stages.map(stage => {
        const resourceConfig = implementation.stageResources[stage.stage];
        if (resourceConfig) {
          return {
            ...stage,
            environment: {
              ...stage.environment,
              CPU_LIMIT: resourceConfig.cpu,
              MEMORY_LIMIT: resourceConfig.memory
            }
          };
        }
        return stage;
      });
    }

    if (implementation.retryStrategies) {
      return stages.map(stage => {
        const retryConfig = implementation.retryStrategies.find(
          (config: any) => config.stage === stage.stage
        );
        if (retryConfig) {
          return {
            ...stage,
            retryConfig: {
              maxAttempts: retryConfig.maxAttempts,
              backoffStrategy: retryConfig.backoffStrategy
            },
            timeout: retryConfig.timeout
          };
        }
        return stage;
      });
    }

    return stages;
  }

  private applyStageSkippingOptimization(stages: any[], implementation: any): any[] {
    return stages.map(stage => {
      const skipCondition = implementation.skipConditions?.find(
        (condition: any) => condition.stage === stage.stage
      );
      
      if (skipCondition) {
        return {
          ...stage,
          conditions: [
            ...stage.conditions,
            {
              type: 'file_changed',
              condition: 'not_equals',
              value: skipCondition.condition
            }
          ]
        };
      }
      return stage;
    });
  }

  private calculateParallelTimeSaving(stages: any[]): number {
    const totalSequentialTime = stages.reduce((sum, stage) => sum + stage.timeout, 0);
    const maxParallelTime = Math.max(...stages.map(stage => stage.timeout));
    return totalSequentialTime - maxParallelTime;
  }

  private calculateOptimalResources(stages: any[]): Record<string, any> {
    const resourceMap: Record<string, any> = {};

    stages.forEach(stage => {
      switch (stage.stage) {
        case PipelineStage.BUILD:
          resourceMap[stage.stage] = { cpu: '2', memory: '4Gi' };
          break;
        case PipelineStage.UNIT_TEST:
          resourceMap[stage.stage] = { cpu: '1', memory: '2Gi' };
          break;
        case PipelineStage.INTEGRATION_TEST:
          resourceMap[stage.stage] = { cpu: '2', memory: '4Gi' };
          break;
        case PipelineStage.E2E_TEST:
          resourceMap[stage.stage] = { cpu: '4', memory: '8Gi' };
          break;
        case PipelineStage.SECURITY_SCAN:
          resourceMap[stage.stage] = { cpu: '1', memory: '2Gi' };
          break;
        case PipelineStage.DEPLOY_STAGING:
        case PipelineStage.DEPLOY_PRODUCTION:
          resourceMap[stage.stage] = { cpu: '1', memory: '1Gi' };
          break;
        default:
          resourceMap[stage.stage] = { cpu: '1', memory: '2Gi' };
      }
    });

    return resourceMap;
  }

  private calculateOptimizedDuration(
    pipeline: GeneratedPipeline, 
    optimizations: PipelineOptimization[]
  ): number {
    let baseDuration = pipeline.stages.reduce((sum, stage) => sum + stage.timeout, 0);

    // Apply time savings from optimizations
    optimizations.forEach(optimization => {
      if (optimization.implementation.estimatedTimeSaving) {
        baseDuration -= optimization.implementation.estimatedTimeSaving;
      }
    });

    // Account for parallelization
    const parallelizationOpt = optimizations.find(opt => opt.type === 'parallelization');
    if (parallelizationOpt && parallelizationOpt.implementation.parallelStages) {
      const parallelStages = pipeline.stages.filter(stage =>
        parallelizationOpt.implementation.parallelStages.includes(stage.stage)
      );
      
      if (parallelStages.length > 1) {
        const sequentialTime = parallelStages.reduce((sum, stage) => sum + stage.timeout, 0);
        const parallelTime = Math.max(...parallelStages.map(stage => stage.timeout));
        baseDuration = baseDuration - sequentialTime + parallelTime;
      }
    }

    return Math.max(baseDuration, 60); // Minimum 1 minute
  }
}