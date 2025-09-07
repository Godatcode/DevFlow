import { 
  PerformanceOptimizerAgent, 
  createPerformanceOptimizerAgent,
  PerformanceOptimizerConfig,
  BottleneckType,
  OptimizationType 
} from '../agents/performance-optimizer-agent';
import { 
  AgentType, 
  AgentCapability, 
  AgentContext, 
  AgentInput,
  ExecutionStatus 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
} as unknown as Logger;

describe('PerformanceOptimizerAgent', () => {
  let agent: PerformanceOptimizerAgent;
  let config: PerformanceOptimizerConfig;
  let context: AgentContext;
  let input: AgentInput;

  beforeEach(() => {
    config = {
      enableStaticAnalysis: true,
      enableRuntimeProfiling: false,
      enableBundleAnalysis: true,
      enableDatabaseAnalysis: true,
      performanceThresholds: {
        maxExecutionTime: 1000,
        maxMemoryUsage: 100,
        maxCpuUsage: 80,
        maxBundleSize: 5,
        minCacheHitRatio: 80,
        maxRenderTime: 100
      },
      customRules: [],
      excludePatterns: ['node_modules/**']
    };

    agent = new PerformanceOptimizerAgent('perf-agent-1', config, mockLogger);

    context = {
      workflowId: 'workflow-1',
      projectId: 'project-1',
      userId: 'user-1',
      teamId: 'team-1',
      environment: 'development',
      metadata: {}
    };

    input = {
      workflowId: 'workflow-1',
      projectId: 'project-1',
      context: {},
      parameters: {
        codeContent: '',
        filePath: 'test.js'
      }
    };
  });

  describe('agent properties', () => {
    it('should have correct agent properties', () => {
      expect(agent.id).toBe('perf-agent-1');
      expect(agent.name).toBe('Performance Optimizer');
      expect(agent.type).toBe(AgentType.PERFORMANCE_OPTIMIZER);
      expect(agent.version).toBe('1.0.0');
      expect(agent.capabilities).toContain(AgentCapability.PERFORMANCE_MONITORING);
      expect(agent.capabilities).toContain(AgentCapability.CODE_ANALYSIS);
      expect(agent.isActive).toBe(true);
    });

    it('should have creation and update timestamps', () => {
      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('execute', () => {
    it('should execute performance analysis successfully with no bottlenecks', async () => {
      input.parameters.codeContent = 'const message = "Hello, World!";';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
      expect(result.output.data.analysisResult).toBeDefined();
      expect(result.output.data.analysisResult.bottlenecks).toHaveLength(0);
      expect(result.output.data.analysisResult.performanceScore).toBe(100);
    });

    it('should detect nested loops', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop operation
          }
        }
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      expect(bottlenecks.length).toBeGreaterThan(0);
      
      const nestedLoopBottleneck = bottlenecks.find(b => 
        b.type === BottleneckType.INEFFICIENT_ALGORITHM && 
        b.title.includes('Nested loops')
      );
      expect(nestedLoopBottleneck).toBeDefined();
      expect(nestedLoopBottleneck?.severity).toBe('high');
    });

    it('should detect nested forEach loops', async () => {
      input.parameters.codeContent = `
        array1.forEach(item1 => {
          array2.forEach(item2 => {
            console.log(item1, item2);
          });
        });
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const forEachBottleneck = bottlenecks.find(b => 
        b.type === BottleneckType.INEFFICIENT_ALGORITHM &&
        b.title.includes('forEach')
      );
      expect(forEachBottleneck).toBeDefined();
      expect(forEachBottleneck?.severity).toBe('medium');
    });

    it('should detect frequent DOM queries', async () => {
      input.parameters.codeContent = `
        const element1 = document.getElementById('test1');
        const element2 = document.querySelector('.test2');
        const element3 = document.getElementById('test3');
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const domBottlenecks = bottlenecks.filter(b => 
        b.type === BottleneckType.INEFFICIENT_RENDERING
      );
      expect(domBottlenecks.length).toBeGreaterThan(0);
    });

    it('should detect tight timer loops', async () => {
      input.parameters.codeContent = `
        setInterval(function() {
          // frequent operation
        }, 0);
        setTimeout(callback, 0);
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const timerBottlenecks = bottlenecks.filter(b => 
        b.type === BottleneckType.CPU_INTENSIVE
      );
      expect(timerBottlenecks.length).toBeGreaterThan(0);
    });

    it('should detect inefficient object cloning', async () => {
      input.parameters.codeContent = `
        const cloned = JSON.parse(JSON.stringify(originalObject));
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const cloningBottleneck = bottlenecks.find(b => 
        b.title.includes('object cloning')
      );
      expect(cloningBottleneck).toBeDefined();
      expect(cloningBottleneck?.type).toBe(BottleneckType.INEFFICIENT_ALGORITHM);
    });

    it('should apply custom performance rules', async () => {
      const customConfig = {
        ...config,
        customRules: [{
          id: 'custom-1',
          name: 'Inefficient Array Operation',
          description: 'Usage of inefficient array operation',
          pattern: 'array\\.push\\.apply',
          bottleneckType: BottleneckType.INEFFICIENT_ALGORITHM,
          severity: 'medium' as const
        }]
      };

      const customAgent = new PerformanceOptimizerAgent('custom-agent', customConfig, mockLogger);
      input.parameters.codeContent = 'array.push.apply(target, source);';

      const result = await customAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const customBottleneck = bottlenecks.find(b => b.title === 'Inefficient Array Operation');
      expect(customBottleneck).toBeDefined();
      expect(customBottleneck?.severity).toBe('medium');
    });

    it('should analyze bundle size and dependencies', async () => {
      input.parameters.packageJson = {
        dependencies: {
          'lodash': '4.17.21',
          'moment': '2.29.4'
        }
      };

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const bundleBottlenecks = bottlenecks.filter(b => 
        b.type === BottleneckType.LARGE_BUNDLE
      );
      expect(bundleBottlenecks.length).toBeGreaterThan(0);
    });

    it('should detect large bundle size', async () => {
      input.parameters.packageJson = {
        dependencies: {
          'react': '18.0.0'
        }
      };
      input.parameters.bundleStats = {
        size: 10 * 1024 * 1024 // 10MB, exceeds 5MB threshold
      };

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const largeBundleBottleneck = bottlenecks.find(b => 
        b.title.includes('Large bundle size')
      );
      expect(largeBundleBottleneck).toBeDefined();
      expect(largeBundleBottleneck?.severity).toBe('high');
    });

    it('should detect database performance issues', async () => {
      input.parameters.codeContent = `
        const users = await db.query('SELECT * FROM users');
        const posts = users.find().forEach(user => {
          return db.query('SELECT * FROM posts WHERE user_id = ?', user.id);
        });
        const results = await db.query("SELECT * FROM table WHERE name LIKE '%search%'");
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const dbBottlenecks = bottlenecks.filter(b => 
        b.type === BottleneckType.DATABASE_QUERY
      );
      expect(dbBottlenecks.length).toBeGreaterThan(0);
    });

    it('should generate optimizations for each bottleneck', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop
          }
        }
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const optimizations = result.output.data.analysisResult.optimizations;
      expect(optimizations.length).toBeGreaterThan(0);
      
      const algorithmOpt = optimizations.find(opt => 
        opt.type === OptimizationType.ALGORITHM_OPTIMIZATION
      );
      expect(algorithmOpt).toBeDefined();
      expect(algorithmOpt?.estimatedImprovement.executionTime).toBeGreaterThan(0);
    });

    it('should calculate performance score correctly', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            document.getElementById('test' + i + j);
          }
        }
        setInterval(() => {}, 0);
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.analysisResult.performanceScore).toBeLessThan(100);
      expect(result.output.data.analysisResult.performanceScore).toBeGreaterThanOrEqual(0);
    });

    it('should generate appropriate recommendations', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop
          }
        }
      `;
      input.parameters.packageJson = {
        dependencies: {
          'lodash': '4.17.21'
        }
      };

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const recommendations = result.output.data.analysisResult.recommendations;
      expect(recommendations.length).toBeGreaterThan(0);
      
      const algorithmRec = recommendations.find(r => 
        r.title.includes('Algorithm Optimization')
      );
      expect(algorithmRec).toBeDefined();
      expect(algorithmRec?.priority).toBe('high');
    });

    it('should generate performance report', async () => {
      input.parameters.codeContent = 'for(let i=0;i<n;i++){for(let j=0;j<m;j++){}}';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.report).toBeDefined();
      expect(result.output.data.report).toContain('Performance Analysis Report');
      expect(result.output.data.report).toContain(context.projectId);
      expect(result.output.data.report).toContain('Performance Score:');
    });

    it('should include execution metrics', async () => {
      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.metrics).toBeDefined();
      expect(result.output.metrics.analysisDuration).toBeGreaterThanOrEqual(0);
      expect(result.output.metrics.bottlenecksFound).toBeDefined();
      expect(result.output.metrics.optimizationsGenerated).toBeDefined();
      expect(result.output.metrics.performanceScore).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle execution errors gracefully', async () => {
      // Mock an error by providing invalid input
      const invalidInput = {
        ...input,
        parameters: null
      };

      const result = await agent.execute(context, invalidInput);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.output.success).toBe(false);
      expect(result.output.error).toBeDefined();
    });

    it('should handle disabled analysis types', async () => {
      const limitedConfig = {
        ...config,
        enableStaticAnalysis: false,
        enableBundleAnalysis: true,
        enableDatabaseAnalysis: false
      };

      const limitedAgent = new PerformanceOptimizerAgent('limited-agent', limitedConfig, mockLogger);
      
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // This should not be detected with static analysis disabled
          }
        }
      `;
      input.parameters.packageJson = {
        dependencies: {
          'lodash': '4.17.21' // This should be detected with bundle analysis enabled
        }
      };

      const result = await limitedAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      // Should only find bundle issues, not algorithm issues
      const algorithmBottlenecks = bottlenecks.filter(b => 
        b.type === BottleneckType.INEFFICIENT_ALGORITHM
      );
      const bundleBottlenecks = bottlenecks.filter(b => 
        b.type === BottleneckType.LARGE_BUNDLE
      );
      
      expect(algorithmBottlenecks.length).toBe(0);
      expect(bundleBottlenecks.length).toBeGreaterThan(0);
    });
  });

  describe('createPerformanceOptimizerAgent factory', () => {
    it('should create agent with default configuration', () => {
      const factoryAgent = createPerformanceOptimizerAgent('factory-agent', {}, mockLogger);

      expect(factoryAgent).toBeInstanceOf(PerformanceOptimizerAgent);
      expect(factoryAgent.id).toBe('factory-agent');
      expect(factoryAgent.configuration.enableStaticAnalysis).toBe(true);
      expect(factoryAgent.configuration.enableBundleAnalysis).toBe(true);
      expect(factoryAgent.configuration.enableDatabaseAnalysis).toBe(true);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        enableRuntimeProfiling: true,
        performanceThresholds: {
          maxExecutionTime: 2000,
          maxMemoryUsage: 200,
          maxCpuUsage: 90,
          maxBundleSize: 10,
          minCacheHitRatio: 90,
          maxRenderTime: 200
        }
      };

      const factoryAgent = createPerformanceOptimizerAgent('factory-agent', customConfig, mockLogger);

      expect(factoryAgent.configuration.enableRuntimeProfiling).toBe(true);
      expect(factoryAgent.configuration.performanceThresholds.maxExecutionTime).toBe(2000);
      expect(factoryAgent.configuration.enableStaticAnalysis).toBe(true); // Default preserved
    });
  });

  describe('performance impact estimation', () => {
    it('should provide accurate line numbers for bottlenecks', async () => {
      input.parameters.codeContent = `
        const normalCode = "safe";
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop on line 4
          }
        }
        const moreCode = "also safe";
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const nestedLoopBottleneck = bottlenecks.find(b => 
        b.type === BottleneckType.INEFFICIENT_ALGORITHM
      );
      
      expect(nestedLoopBottleneck?.location.line).toBe(3); // Nested loop starts on line 3
    });

    it('should estimate performance impact correctly', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // high severity nested loop
          }
        }
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const bottlenecks = result.output.data.analysisResult.bottlenecks;
      const nestedLoopBottleneck = bottlenecks.find(b => 
        b.type === BottleneckType.INEFFICIENT_ALGORITHM
      );
      
      expect(nestedLoopBottleneck?.impact).toBeDefined();
      expect(nestedLoopBottleneck?.impact.executionTime).toBeGreaterThan(0);
      expect(nestedLoopBottleneck?.impact.cpuUsage).toBeGreaterThan(0);
      expect(nestedLoopBottleneck?.impact.estimatedUserImpact).toBe('high');
    });

    it('should prioritize optimizations correctly', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop
          }
        }
        const query = 'SELECT * FROM users';
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const optimizations = result.output.data.analysisResult.optimizations;
      expect(optimizations.length).toBeGreaterThan(0);
      
      // Database optimization should have higher priority than algorithm optimization
      const dbOpt = optimizations.find(opt => 
        opt.type === OptimizationType.DATABASE_OPTIMIZATION
      );
      const algoOpt = optimizations.find(opt => 
        opt.type === OptimizationType.ALGORITHM_OPTIMIZATION
      );
      
      if (dbOpt && algoOpt) {
        expect(dbOpt.priority).toBeGreaterThan(algoOpt.priority);
      }
    });

    it('should calculate metrics accurately', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            document.getElementById('test');
          }
        }
      `;
      input.parameters.bundleStats = {
        size: 2 * 1024 * 1024 // 2MB
      };

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const metrics = result.output.data.analysisResult.metrics;
      expect(metrics.totalExecutionTime).toBeGreaterThan(0);
      expect(metrics.memoryPeakUsage).toBeGreaterThan(0);
      expect(metrics.averageCpuUsage).toBeGreaterThan(0);
      expect(metrics.bundleSize).toBe(2 * 1024 * 1024);
      expect(metrics.renderTime).toBeGreaterThan(0); // Due to DOM queries
    });
  });

  describe('optimization recommendations', () => {
    it('should provide implementation guidance for optimizations', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop
          }
        }
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const optimizations = result.output.data.analysisResult.optimizations;
      expect(optimizations.length).toBeGreaterThan(0);
      
      for (const optimization of optimizations) {
        expect(optimization.implementation).toBeDefined();
        expect(optimization.implementation.length).toBeGreaterThan(0);
        expect(optimization.estimatedImprovement).toBeDefined();
        expect(optimization.effort).toBeDefined();
        expect(optimization.priority).toBeGreaterThan(0);
      }
    });

    it('should provide actionable recommendations', async () => {
      input.parameters.codeContent = `
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < m; j++) {
            // nested loop
          }
        }
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const recommendations = result.output.data.analysisResult.recommendations;
      expect(recommendations.length).toBeGreaterThan(0);
      
      for (const recommendation of recommendations) {
        expect(recommendation.actionItems).toBeDefined();
        expect(recommendation.actionItems.length).toBeGreaterThan(0);
        expect(recommendation.implementationGuide).toBeDefined();
        expect(recommendation.estimatedImpact).toBeDefined();
        expect(recommendation.references).toBeDefined();
      }
    });
  });
});