import { UUID } from '@devflow/shared-types';
import { TestingStrategy, ProjectCharacteristics } from './types';

export interface TestExecutionPlan {
  id: UUID;
  projectId: UUID;
  strategy: TestingStrategy;
  phases: TestPhase[];
  estimatedDuration: number;
  parallelization: TestParallelizationConfig;
  createdAt: Date;
}

export interface TestPhase {
  id: UUID;
  name: string;
  type: TestPhaseType;
  tests: TestSuite[];
  dependencies: UUID[];
  timeout: number;
  retryConfig: TestRetryConfig;
  parallelizable: boolean;
  required: boolean;
}

export enum TestPhaseType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  CONTRACT = 'contract',
  SMOKE = 'smoke',
  REGRESSION = 'regression',
  CRITICAL = 'critical',
  COMPLIANCE = 'compliance'
}

export interface TestSuite {
  id: UUID;
  name: string;
  path: string;
  framework: string;
  estimatedDuration: number;
  priority: TestPriority;
  tags: string[];
  dependencies: string[];
}

export enum TestPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface TestRetryConfig {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential';
  retryableFailures: string[];
}

export interface TestParallelizationConfig {
  enabled: boolean;
  maxWorkers: number;
  strategy: 'file' | 'suite' | 'test';
  resourceAllocation: TestResourceAllocation;
}

export interface TestResourceAllocation {
  cpu: string;
  memory: string;
  storage: string;
}

export interface TestExecutionResult {
  planId: UUID;
  status: TestExecutionStatus;
  phases: TestPhaseResult[];
  totalDuration: number;
  coverage: TestCoverage;
  summary: TestExecutionSummary;
  completedAt: Date;
}

export enum TestExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface TestPhaseResult {
  phaseId: UUID;
  type: TestPhaseType;
  status: TestExecutionStatus;
  suites: TestSuiteResult[];
  duration: number;
  coverage: TestCoverage;
}

export interface TestSuiteResult {
  suiteId: UUID;
  status: TestExecutionStatus;
  tests: TestResult[];
  duration: number;
  coverage: TestCoverage;
}

export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  retries: number;
}

export interface TestCoverage {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export interface TestExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage: TestCoverage;
}

export class TestExecutionCoordinator {
  private executionPlans: Map<UUID, TestExecutionPlan> = new Map();
  private executionResults: Map<UUID, TestExecutionResult> = new Map();

  async createExecutionPlan(
    projectId: UUID,
    strategy: TestingStrategy,
    characteristics: ProjectCharacteristics
  ): Promise<TestExecutionPlan> {
    const phases = await this.generateTestPhases(strategy, characteristics);
    const parallelization = this.determineParallelizationConfig(characteristics);
    const estimatedDuration = this.calculateEstimatedDuration(phases, parallelization);

    const plan: TestExecutionPlan = {
      id: this.generateId(),
      projectId,
      strategy,
      phases,
      estimatedDuration,
      parallelization,
      createdAt: new Date()
    };

    this.executionPlans.set(plan.id, plan);
    return plan;
  }

  async executeTestPlan(planId: UUID): Promise<TestExecutionResult> {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Test execution plan ${planId} not found`);
    }

    const result: TestExecutionResult = {
      planId,
      status: TestExecutionStatus.RUNNING,
      phases: [],
      totalDuration: 0,
      coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        coverage: { lines: 0, functions: 0, branches: 0, statements: 0 }
      },
      completedAt: new Date()
    };

    try {
      const startTime = Date.now();
      
      // Execute phases based on dependencies
      const phaseResults = await this.executePhases(plan.phases, plan.parallelization);
      
      result.phases = phaseResults;
      result.totalDuration = Date.now() - startTime;
      result.status = this.determineOverallStatus(phaseResults);
      result.coverage = this.aggregateCoverage(phaseResults);
      result.summary = this.generateSummary(phaseResults);
      result.completedAt = new Date();

    } catch (error) {
      result.status = TestExecutionStatus.FAILED;
      result.completedAt = new Date();
    }

    this.executionResults.set(planId, result);
    return result;
  }

  async getExecutionResult(planId: UUID): Promise<TestExecutionResult | null> {
    return this.executionResults.get(planId) || null;
  }

  async cancelExecution(planId: UUID): Promise<void> {
    const result = this.executionResults.get(planId);
    if (result && result.status === TestExecutionStatus.RUNNING) {
      result.status = TestExecutionStatus.CANCELLED;
      result.completedAt = new Date();
    }
  }

  private async generateTestPhases(
    strategy: TestingStrategy,
    characteristics: ProjectCharacteristics
  ): Promise<TestPhase[]> {
    const phases: TestPhase[] = [];

    // Always include unit tests
    phases.push(await this.createUnitTestPhase(characteristics));

    // Add phases based on strategy
    switch (strategy) {
      case TestingStrategy.UNIT_ONLY:
        // Only unit tests
        break;
      
      case TestingStrategy.INTEGRATION_FOCUSED:
        phases.push(await this.createIntegrationTestPhase(characteristics));
        break;
      
      case TestingStrategy.E2E_HEAVY:
        phases.push(await this.createIntegrationTestPhase(characteristics));
        phases.push(await this.createE2ETestPhase(characteristics));
        phases.push(await this.createSmokeTestPhase(characteristics));
        break;
      
      case TestingStrategy.BALANCED:
        phases.push(await this.createIntegrationTestPhase(characteristics));
        if (this.shouldIncludeE2E(characteristics)) {
          phases.push(await this.createE2ETestPhase(characteristics));
        }
        break;
      
      case TestingStrategy.PERFORMANCE_FOCUSED:
        phases.push(await this.createIntegrationTestPhase(characteristics));
        phases.push(await this.createPerformanceTestPhase(characteristics));
        break;
    }

    // Add security tests if compliance requirements exist
    if (characteristics.complianceRequirements.length > 0) {
      phases.push(await this.createSecurityTestPhase(characteristics));
    }

    // Add contract tests for microservices
    if (this.isMicroserviceArchitecture(characteristics)) {
      phases.push(await this.createContractTestPhase(characteristics));
    }

    return phases;
  }

  private async createUnitTestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.UNIT, characteristics);
    
    return {
      id: this.generateId(),
      name: 'Unit Tests',
      type: TestPhaseType.UNIT,
      tests: testSuites,
      dependencies: [],
      timeout: 600, // 10 minutes
      retryConfig: {
        maxAttempts: 2,
        backoffStrategy: 'linear',
        retryableFailures: ['timeout', 'flaky']
      },
      parallelizable: true,
      required: true
    };
  }

  private async createIntegrationTestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.INTEGRATION, characteristics);
    
    return {
      id: this.generateId(),
      name: 'Integration Tests',
      type: TestPhaseType.INTEGRATION,
      tests: testSuites,
      dependencies: [], // Depends on unit tests completion
      timeout: 1200, // 20 minutes
      retryConfig: {
        maxAttempts: 2,
        backoffStrategy: 'exponential',
        retryableFailures: ['timeout', 'network', 'database']
      },
      parallelizable: false,
      required: true
    };
  }

  private async createE2ETestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.E2E, characteristics);
    
    return {
      id: this.generateId(),
      name: 'End-to-End Tests',
      type: TestPhaseType.E2E,
      tests: testSuites,
      dependencies: [], // Depends on integration tests
      timeout: 1800, // 30 minutes
      retryConfig: {
        maxAttempts: 1,
        backoffStrategy: 'linear',
        retryableFailures: ['timeout', 'browser']
      },
      parallelizable: false,
      required: false
    };
  }

  private async createPerformanceTestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.PERFORMANCE, characteristics);
    
    return {
      id: this.generateId(),
      name: 'Performance Tests',
      type: TestPhaseType.PERFORMANCE,
      tests: testSuites,
      dependencies: [],
      timeout: 2400, // 40 minutes
      retryConfig: {
        maxAttempts: 1,
        backoffStrategy: 'linear',
        retryableFailures: ['timeout']
      },
      parallelizable: false,
      required: false
    };
  }

  private async createSecurityTestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.SECURITY, characteristics);
    
    return {
      id: this.generateId(),
      name: 'Security Tests',
      type: TestPhaseType.SECURITY,
      tests: testSuites,
      dependencies: [],
      timeout: 900, // 15 minutes
      retryConfig: {
        maxAttempts: 1,
        backoffStrategy: 'linear',
        retryableFailures: ['timeout']
      },
      parallelizable: true,
      required: true
    };
  }

  private async createContractTestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.CONTRACT, characteristics);
    
    return {
      id: this.generateId(),
      name: 'Contract Tests',
      type: TestPhaseType.CONTRACT,
      tests: testSuites,
      dependencies: [],
      timeout: 600, // 10 minutes
      retryConfig: {
        maxAttempts: 2,
        backoffStrategy: 'linear',
        retryableFailures: ['timeout', 'network']
      },
      parallelizable: true,
      required: true
    };
  }

  private async createSmokeTestPhase(characteristics: ProjectCharacteristics): Promise<TestPhase> {
    const testSuites = await this.discoverTestSuites(TestPhaseType.SMOKE, characteristics);
    
    return {
      id: this.generateId(),
      name: 'Smoke Tests',
      type: TestPhaseType.SMOKE,
      tests: testSuites,
      dependencies: [],
      timeout: 300, // 5 minutes
      retryConfig: {
        maxAttempts: 2,
        backoffStrategy: 'linear',
        retryableFailures: ['timeout', 'network']
      },
      parallelizable: false,
      required: true
    };
  }

  private async discoverTestSuites(
    type: TestPhaseType,
    characteristics: ProjectCharacteristics
  ): Promise<TestSuite[]> {
    // Mock test suite discovery - in real implementation, this would scan the codebase
    const suites: TestSuite[] = [];
    
    const primaryLanguage = characteristics.languages[0]?.toLowerCase() || 'javascript';
    const framework = this.getTestFramework(primaryLanguage, type);
    
    // Generate mock test suites based on project characteristics
    const suiteCount = this.calculateSuiteCount(type, characteristics);
    
    for (let i = 0; i < suiteCount; i++) {
      suites.push({
        id: this.generateId(),
        name: `${type}-test-suite-${i + 1}`,
        path: `tests/${type}/suite-${i + 1}`,
        framework,
        estimatedDuration: this.estimateSuiteDuration(type, characteristics),
        priority: this.determineSuitePriority(type, i, suiteCount),
        tags: this.generateSuiteTags(type, characteristics),
        dependencies: []
      });
    }
    
    return suites;
  }

  private getTestFramework(language: string, type: TestPhaseType): string {
    const frameworkMap: Record<string, Record<TestPhaseType, string>> = {
      javascript: {
        [TestPhaseType.UNIT]: 'jest',
        [TestPhaseType.INTEGRATION]: 'jest',
        [TestPhaseType.E2E]: 'playwright',
        [TestPhaseType.PERFORMANCE]: 'k6',
        [TestPhaseType.SECURITY]: 'zap',
        [TestPhaseType.CONTRACT]: 'pact',
        [TestPhaseType.SMOKE]: 'playwright',
        [TestPhaseType.REGRESSION]: 'jest',
        [TestPhaseType.CRITICAL]: 'jest',
        [TestPhaseType.COMPLIANCE]: 'jest'
      },
      typescript: {
        [TestPhaseType.UNIT]: 'vitest',
        [TestPhaseType.INTEGRATION]: 'vitest',
        [TestPhaseType.E2E]: 'playwright',
        [TestPhaseType.PERFORMANCE]: 'k6',
        [TestPhaseType.SECURITY]: 'zap',
        [TestPhaseType.CONTRACT]: 'pact',
        [TestPhaseType.SMOKE]: 'playwright',
        [TestPhaseType.REGRESSION]: 'vitest',
        [TestPhaseType.CRITICAL]: 'vitest',
        [TestPhaseType.COMPLIANCE]: 'vitest'
      },
      python: {
        [TestPhaseType.UNIT]: 'pytest',
        [TestPhaseType.INTEGRATION]: 'pytest',
        [TestPhaseType.E2E]: 'selenium',
        [TestPhaseType.PERFORMANCE]: 'locust',
        [TestPhaseType.SECURITY]: 'bandit',
        [TestPhaseType.CONTRACT]: 'pact',
        [TestPhaseType.SMOKE]: 'pytest',
        [TestPhaseType.REGRESSION]: 'pytest',
        [TestPhaseType.CRITICAL]: 'pytest',
        [TestPhaseType.COMPLIANCE]: 'pytest'
      }
    };
    
    return frameworkMap[language]?.[type] || frameworkMap['javascript'][type];
  }

  private calculateSuiteCount(type: TestPhaseType, characteristics: ProjectCharacteristics): number {
    const baseCount = {
      [TestPhaseType.UNIT]: Math.ceil(characteristics.repositorySize / 10000),
      [TestPhaseType.INTEGRATION]: Math.ceil(characteristics.repositorySize / 25000),
      [TestPhaseType.E2E]: Math.ceil(characteristics.repositorySize / 50000),
      [TestPhaseType.PERFORMANCE]: 1,
      [TestPhaseType.SECURITY]: 1,
      [TestPhaseType.CONTRACT]: characteristics.frameworks.length,
      [TestPhaseType.SMOKE]: 1,
      [TestPhaseType.REGRESSION]: Math.ceil(characteristics.repositorySize / 20000),
      [TestPhaseType.CRITICAL]: 1,
      [TestPhaseType.COMPLIANCE]: 1
    };
    
    return Math.max(1, Math.min(baseCount[type], 10)); // Cap at 10 suites
  }

  private estimateSuiteDuration(type: TestPhaseType, characteristics: ProjectCharacteristics): number {
    const baseDurations = {
      [TestPhaseType.UNIT]: 30,
      [TestPhaseType.INTEGRATION]: 120,
      [TestPhaseType.E2E]: 300,
      [TestPhaseType.PERFORMANCE]: 600,
      [TestPhaseType.SECURITY]: 180,
      [TestPhaseType.CONTRACT]: 60,
      [TestPhaseType.SMOKE]: 30,
      [TestPhaseType.REGRESSION]: 180,
      [TestPhaseType.CRITICAL]: 60,
      [TestPhaseType.COMPLIANCE]: 120
    };
    
    const complexityMultiplier = characteristics.complexity === 'high' ? 1.5 : 
                                characteristics.complexity === 'low' ? 0.7 : 1.0;
    
    return Math.round(baseDurations[type] * complexityMultiplier);
  }

  private determineSuitePriority(type: TestPhaseType, index: number, total: number): TestPriority {
    if (type === TestPhaseType.UNIT || type === TestPhaseType.SMOKE) {
      return TestPriority.CRITICAL;
    }
    
    if (index < total * 0.3) return TestPriority.HIGH;
    if (index < total * 0.7) return TestPriority.MEDIUM;
    return TestPriority.LOW;
  }

  private generateSuiteTags(type: TestPhaseType, characteristics: ProjectCharacteristics): string[] {
    const tags = [type];
    
    if (characteristics.criticality === 'high') tags.push(TestPhaseType.CRITICAL);
    if (characteristics.complianceRequirements.length > 0) tags.push(TestPhaseType.COMPLIANCE);
    
    return tags;
  }

  private determineParallelizationConfig(characteristics: ProjectCharacteristics): TestParallelizationConfig {
    const maxWorkers = Math.min(characteristics.teamSize, 8); // Cap at 8 workers
    
    return {
      enabled: characteristics.repositorySize > 10000,
      maxWorkers,
      strategy: 'suite',
      resourceAllocation: {
        cpu: characteristics.complexity === 'high' ? '2' : '1',
        memory: characteristics.complexity === 'high' ? '4Gi' : '2Gi',
        storage: '10Gi'
      }
    };
  }

  private calculateEstimatedDuration(phases: TestPhase[], parallelization: TestParallelizationConfig): number {
    let totalDuration = 0;
    
    for (const phase of phases) {
      const phaseDuration = phase.tests.reduce((sum, suite) => sum + suite.estimatedDuration, 0);
      
      if (phase.parallelizable && parallelization.enabled) {
        // Parallel execution
        const maxSuiteDuration = Math.max(...phase.tests.map(suite => suite.estimatedDuration));
        totalDuration += maxSuiteDuration;
      } else {
        // Sequential execution
        totalDuration += phaseDuration;
      }
    }
    
    return totalDuration;
  }

  private async executePhases(phases: TestPhase[], parallelization: TestParallelizationConfig): Promise<TestPhaseResult[]> {
    const results: TestPhaseResult[] = [];
    
    // Execute phases in dependency order
    const sortedPhases = this.sortPhasesByDependencies(phases);
    
    for (const phase of sortedPhases) {
      const result = await this.executePhase(phase, parallelization);
      results.push(result);
      
      // Stop execution if critical phase fails
      if (phase.required && result.status === TestExecutionStatus.FAILED) {
        break;
      }
    }
    
    return results;
  }

  private async executePhase(phase: TestPhase, parallelization: TestParallelizationConfig): Promise<TestPhaseResult> {
    const startTime = Date.now();
    const suiteResults: TestSuiteResult[] = [];
    
    try {
      if (phase.parallelizable && parallelization.enabled) {
        // Execute suites in parallel
        const promises = phase.tests.map(suite => this.executeSuite(suite));
        suiteResults.push(...await Promise.all(promises));
      } else {
        // Execute suites sequentially
        for (const suite of phase.tests) {
          const result = await this.executeSuite(suite);
          suiteResults.push(result);
        }
      }
      
      const status = suiteResults.every(r => r.status === TestExecutionStatus.COMPLETED) 
        ? TestExecutionStatus.COMPLETED 
        : TestExecutionStatus.FAILED;
      
      return {
        phaseId: phase.id,
        type: phase.type,
        status,
        suites: suiteResults,
        duration: Date.now() - startTime,
        coverage: this.aggregateSuiteCoverage(suiteResults)
      };
      
    } catch (error) {
      return {
        phaseId: phase.id,
        type: phase.type,
        status: TestExecutionStatus.FAILED,
        suites: suiteResults,
        duration: Date.now() - startTime,
        coverage: { lines: 0, functions: 0, branches: 0, statements: 0 }
      };
    }
  }

  private async executeSuite(suite: TestSuite): Promise<TestSuiteResult> {
    // Mock test suite execution
    const startTime = Date.now();
    
    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, Math.min(suite.estimatedDuration * 10, 1000)));
    
    const testCount = Math.floor(Math.random() * 20) + 5; // 5-25 tests per suite
    const tests: TestResult[] = [];
    
    for (let i = 0; i < testCount; i++) {
      const passed = Math.random() > 0.1; // 90% pass rate
      tests.push({
        name: `test-${i + 1}`,
        status: passed ? 'passed' : 'failed',
        duration: Math.floor(Math.random() * 1000) + 100,
        error: passed ? undefined : 'Mock test failure',
        retries: passed ? 0 : Math.floor(Math.random() * 2)
      });
    }
    
    const status = tests.every(t => t.status === 'passed') 
      ? TestExecutionStatus.COMPLETED 
      : TestExecutionStatus.FAILED;
    
    return {
      suiteId: suite.id,
      status,
      tests,
      duration: Date.now() - startTime,
      coverage: {
        lines: Math.floor(Math.random() * 40) + 60, // 60-100%
        functions: Math.floor(Math.random() * 30) + 70, // 70-100%
        branches: Math.floor(Math.random() * 50) + 50, // 50-100%
        statements: Math.floor(Math.random() * 40) + 60 // 60-100%
      }
    };
  }

  private sortPhasesByDependencies(phases: TestPhase[]): TestPhase[] {
    // Simple topological sort - in real implementation, would handle complex dependencies
    return phases.sort((a, b) => {
      const order = [
        TestPhaseType.UNIT,
        TestPhaseType.INTEGRATION,
        TestPhaseType.CONTRACT,
        TestPhaseType.SECURITY,
        TestPhaseType.E2E,
        TestPhaseType.SMOKE,
        TestPhaseType.PERFORMANCE,
        TestPhaseType.REGRESSION
      ];
      
      return order.indexOf(a.type) - order.indexOf(b.type);
    });
  }

  private shouldIncludeE2E(characteristics: ProjectCharacteristics): boolean {
    return characteristics.frameworks.some(fw => 
      ['react', 'vue', 'angular', 'express', 'nestjs'].includes(fw.toLowerCase())
    ) || characteristics.criticality === 'high';
  }

  private isMicroserviceArchitecture(characteristics: ProjectCharacteristics): boolean {
    return characteristics.frameworks.some(fw =>
      ['express', 'nestjs', 'spring-boot', 'fastapi'].includes(fw.toLowerCase())
    ) || characteristics.dependencies.includes('docker');
  }

  private determineOverallStatus(phaseResults: TestPhaseResult[]): TestExecutionStatus {
    if (phaseResults.length === 0) return TestExecutionStatus.PENDING;
    if (phaseResults.some(r => r.status === TestExecutionStatus.FAILED)) return TestExecutionStatus.FAILED;
    if (phaseResults.every(r => r.status === TestExecutionStatus.COMPLETED)) return TestExecutionStatus.COMPLETED;
    return TestExecutionStatus.RUNNING;
  }

  private aggregateCoverage(phaseResults: TestPhaseResult[]): TestCoverage {
    if (phaseResults.length === 0) {
      return { lines: 0, functions: 0, branches: 0, statements: 0 };
    }
    
    const totalCoverage = phaseResults.reduce((acc, result) => ({
      lines: acc.lines + result.coverage.lines,
      functions: acc.functions + result.coverage.functions,
      branches: acc.branches + result.coverage.branches,
      statements: acc.statements + result.coverage.statements
    }), { lines: 0, functions: 0, branches: 0, statements: 0 });
    
    const count = phaseResults.length;
    return {
      lines: Math.round(totalCoverage.lines / count),
      functions: Math.round(totalCoverage.functions / count),
      branches: Math.round(totalCoverage.branches / count),
      statements: Math.round(totalCoverage.statements / count)
    };
  }

  private aggregateSuiteCoverage(suiteResults: TestSuiteResult[]): TestCoverage {
    if (suiteResults.length === 0) {
      return { lines: 0, functions: 0, branches: 0, statements: 0 };
    }
    
    const totalCoverage = suiteResults.reduce((acc, result) => ({
      lines: acc.lines + result.coverage.lines,
      functions: acc.functions + result.coverage.functions,
      branches: acc.branches + result.coverage.branches,
      statements: acc.statements + result.coverage.statements
    }), { lines: 0, functions: 0, branches: 0, statements: 0 });
    
    const count = suiteResults.length;
    return {
      lines: Math.round(totalCoverage.lines / count),
      functions: Math.round(totalCoverage.functions / count),
      branches: Math.round(totalCoverage.branches / count),
      statements: Math.round(totalCoverage.statements / count)
    };
  }

  private generateSummary(phaseResults: TestPhaseResult[]): TestExecutionSummary {
    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let duration = 0;
    
    for (const phaseResult of phaseResults) {
      duration += phaseResult.duration;
      
      for (const suiteResult of phaseResult.suites) {
        for (const test of suiteResult.tests) {
          total++;
          switch (test.status) {
            case 'passed': passed++; break;
            case 'failed': failed++; break;
            case 'skipped': skipped++; break;
          }
        }
      }
    }
    
    return {
      total,
      passed,
      failed,
      skipped,
      duration,
      coverage: this.aggregateCoverage(phaseResults)
    };
  }

  private generateId(): UUID {
    return crypto.randomUUID() as UUID;
  }
}