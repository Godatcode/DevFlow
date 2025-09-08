import { UUID } from '@devflow/shared-types';
import { 
  TestExecutionResult, 
  TestExecutionSummary, 
  TestCoverage,
  TestPhaseResult,
  TestSuiteResult,
  TestResult,
  TestPhaseType
} from './test-execution-coordinator';

export interface TestAnalysisReport {
  id: UUID;
  executionId: UUID;
  projectId: UUID;
  generatedAt: Date;
  summary: TestExecutionSummary;
  insights: TestInsight[];
  recommendations: TestRecommendation[];
  trends: TestTrend[];
  qualityMetrics: QualityMetrics;
  riskAssessment: RiskAssessment;
}

export interface TestInsight {
  type: InsightType;
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  data: Record<string, any>;
}

export enum InsightType {
  COVERAGE_IMPROVEMENT = 'coverage_improvement',
  FLAKY_TESTS = 'flaky_tests',
  SLOW_TESTS = 'slow_tests',
  FAILING_PATTERNS = 'failing_patterns',
  RESOURCE_USAGE = 'resource_usage',
  OPTIMIZATION_OPPORTUNITY = 'optimization_opportunity'
}

export interface TestRecommendation {
  type: RecommendationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  actionItems: string[];
  estimatedImpact: string;
  estimatedEffort: string;
}

export enum RecommendationType {
  INCREASE_COVERAGE = 'increase_coverage',
  FIX_FLAKY_TESTS = 'fix_flaky_tests',
  OPTIMIZE_PERFORMANCE = 'optimize_performance',
  ADD_TEST_TYPES = 'add_test_types',
  IMPROVE_PARALLELIZATION = 'improve_parallelization',
  REDUCE_TEST_DEBT = 'reduce_test_debt'
}

export interface TestTrend {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  isImprovement: boolean;
}

export interface QualityMetrics {
  testReliability: number; // 0-100
  testMaintainability: number; // 0-100
  testEfficiency: number; // 0-100
  overallQuality: number; // 0-100
}

export interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  mitigationStrategies: string[];
}

export interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  likelihood: number; // 0-100
  impact: number; // 0-100
}

export interface TestMetricsHistory {
  projectId: UUID;
  timestamp: Date;
  metrics: TestExecutionSummary;
  coverage: TestCoverage;
  duration: number;
  reliability: number;
}

export class TestResultAnalyzer {
  private metricsHistory: Map<UUID, TestMetricsHistory[]> = new Map();

  async analyzeTestResults(
    result: TestExecutionResult,
    projectId: UUID
  ): Promise<TestAnalysisReport> {
    // Store metrics for trend analysis
    await this.storeMetrics(result, projectId);

    const insights = await this.generateInsights(result);
    const recommendations = await this.generateRecommendations(result, insights);
    const trends = await this.calculateTrends(projectId, result);
    const qualityMetrics = this.calculateQualityMetrics(result);
    const riskAssessment = this.assessRisk(result, insights);

    return {
      id: crypto.randomUUID() as UUID,
      executionId: result.planId,
      projectId,
      generatedAt: new Date(),
      summary: result.summary,
      insights,
      recommendations,
      trends,
      qualityMetrics,
      riskAssessment
    };
  }

  private async storeMetrics(result: TestExecutionResult, projectId: UUID): Promise<void> {
    const history = this.metricsHistory.get(projectId) || [];
    
    const metrics: TestMetricsHistory = {
      projectId,
      timestamp: new Date(),
      metrics: result.summary,
      coverage: result.coverage,
      duration: result.totalDuration,
      reliability: this.calculateReliability(result)
    };

    history.push(metrics);
    
    // Keep only last 30 entries
    if (history.length > 30) {
      history.splice(0, history.length - 30);
    }
    
    this.metricsHistory.set(projectId, history);
  }

  private async generateInsights(result: TestExecutionResult): Promise<TestInsight[]> {
    const insights: TestInsight[] = [];

    // Coverage insights
    if (result.coverage.lines < 80) {
      insights.push({
        type: InsightType.COVERAGE_IMPROVEMENT,
        title: 'Low Test Coverage Detected',
        description: `Current line coverage is ${result.coverage.lines}%, which is below the recommended 80% threshold.`,
        impact: result.coverage.lines < 60 ? 'high' : 'medium',
        data: {
          currentCoverage: result.coverage,
          targetCoverage: 80,
          gap: 80 - result.coverage.lines
        }
      });
    }

    // Flaky test detection
    const flakyTests = this.detectFlakyTests(result);
    if (flakyTests.length > 0) {
      insights.push({
        type: InsightType.FLAKY_TESTS,
        title: 'Flaky Tests Detected',
        description: `Found ${flakyTests.length} potentially flaky tests that may cause unreliable results.`,
        impact: 'high',
        data: {
          flakyTests,
          count: flakyTests.length
        }
      });
    }

    // Slow test detection
    const slowTests = this.detectSlowTests(result);
    if (slowTests.length > 0) {
      insights.push({
        type: InsightType.SLOW_TESTS,
        title: 'Slow Tests Identified',
        description: `${slowTests.length} tests are taking longer than expected and may benefit from optimization.`,
        impact: 'medium',
        data: {
          slowTests,
          count: slowTests.length,
          totalSlowTime: slowTests.reduce((sum, test) => sum + test.duration, 0)
        }
      });
    }

    // Failure pattern analysis
    const failurePatterns = this.analyzeFailurePatterns(result);
    if (failurePatterns.length > 0) {
      insights.push({
        type: InsightType.FAILING_PATTERNS,
        title: 'Test Failure Patterns',
        description: 'Identified common patterns in test failures that may indicate systemic issues.',
        impact: 'high',
        data: {
          patterns: failurePatterns
        }
      });
    }

    // Resource usage insights
    const resourceInsights = this.analyzeResourceUsage(result);
    if (resourceInsights) {
      insights.push({
        type: InsightType.RESOURCE_USAGE,
        title: 'Resource Usage Analysis',
        description: resourceInsights.description,
        impact: resourceInsights.impact,
        data: resourceInsights.data
      });
    }

    return insights;
  }

  private async generateRecommendations(
    result: TestExecutionResult,
    insights: TestInsight[]
  ): Promise<TestRecommendation[]> {
    const recommendations: TestRecommendation[] = [];

    // Coverage recommendations
    const coverageInsight = insights.find(i => i.type === InsightType.COVERAGE_IMPROVEMENT);
    if (coverageInsight) {
      recommendations.push({
        type: RecommendationType.INCREASE_COVERAGE,
        priority: coverageInsight.impact === 'high' ? 'high' : 'medium',
        title: 'Improve Test Coverage',
        description: 'Increase test coverage to meet quality standards and reduce risk of undetected bugs.',
        actionItems: [
          'Identify uncovered code paths using coverage reports',
          'Write unit tests for critical business logic',
          'Add integration tests for key user workflows',
          'Set up coverage gates in CI/CD pipeline'
        ],
        estimatedImpact: 'High - Reduces bug risk by 40-60%',
        estimatedEffort: '2-4 weeks depending on codebase size'
      });
    }

    // Flaky test recommendations
    const flakyInsight = insights.find(i => i.type === InsightType.FLAKY_TESTS);
    if (flakyInsight) {
      recommendations.push({
        type: RecommendationType.FIX_FLAKY_TESTS,
        priority: 'critical',
        title: 'Fix Flaky Tests',
        description: 'Address flaky tests to improve CI/CD reliability and developer confidence.',
        actionItems: [
          'Investigate root causes of test flakiness',
          'Add proper wait conditions and timeouts',
          'Improve test isolation and cleanup',
          'Consider test quarantine for persistent flaky tests'
        ],
        estimatedImpact: 'High - Improves CI reliability by 30-50%',
        estimatedEffort: '1-2 weeks per flaky test'
      });
    }

    // Performance recommendations
    const slowTestInsight = insights.find(i => i.type === InsightType.SLOW_TESTS);
    if (slowTestInsight) {
      recommendations.push({
        type: RecommendationType.OPTIMIZE_PERFORMANCE,
        priority: 'medium',
        title: 'Optimize Test Performance',
        description: 'Improve test execution speed to reduce feedback time and increase developer productivity.',
        actionItems: [
          'Profile slow tests to identify bottlenecks',
          'Optimize database operations and API calls',
          'Implement test data factories and fixtures',
          'Consider parallel test execution'
        ],
        estimatedImpact: 'Medium - Reduces test execution time by 20-40%',
        estimatedEffort: '1-3 weeks'
      });
    }

    // Test type recommendations
    if (this.shouldRecommendAdditionalTestTypes(result)) {
      recommendations.push({
        type: RecommendationType.ADD_TEST_TYPES,
        priority: 'medium',
        title: 'Add Missing Test Types',
        description: 'Implement additional test types to improve overall test coverage and quality.',
        actionItems: [
          'Add integration tests for API endpoints',
          'Implement end-to-end tests for critical user journeys',
          'Add performance tests for key operations',
          'Consider contract tests for service boundaries'
        ],
        estimatedImpact: 'Medium - Improves defect detection by 25-35%',
        estimatedEffort: '2-4 weeks'
      });
    }

    return recommendations;
  }

  private async calculateTrends(projectId: UUID, currentResult: TestExecutionResult): Promise<TestTrend[]> {
    const history = this.metricsHistory.get(projectId) || [];
    if (history.length < 2) {
      return []; // Need at least 2 data points for trends
    }

    const previous = history[history.length - 2];
    const current = {
      metrics: currentResult.summary,
      coverage: currentResult.coverage,
      duration: currentResult.totalDuration,
      reliability: this.calculateReliability(currentResult)
    };

    const trends: TestTrend[] = [];

    // Test pass rate trend
    const currentPassRate = (current.metrics.passed / current.metrics.total) * 100;
    const previousPassRate = (previous.metrics.passed / previous.metrics.total) * 100;
    trends.push(this.createTrend('Pass Rate (%)', currentPassRate, previousPassRate, true));

    // Coverage trends
    trends.push(this.createTrend('Line Coverage (%)', current.coverage.lines, previous.coverage.lines, true));
    trends.push(this.createTrend('Branch Coverage (%)', current.coverage.branches, previous.coverage.branches, true));

    // Duration trend
    trends.push(this.createTrend('Execution Duration (ms)', current.duration, previous.duration, false));

    // Reliability trend
    trends.push(this.createTrend('Test Reliability (%)', current.reliability, previous.reliability, true));

    return trends;
  }

  private createTrend(
    metric: string,
    current: number,
    previous: number,
    higherIsBetter: boolean
  ): TestTrend {
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;
    
    let direction: 'up' | 'down' | 'stable';
    if (Math.abs(changePercent) < 1) {
      direction = 'stable';
    } else {
      direction = change > 0 ? 'up' : 'down';
    }

    const isImprovement = higherIsBetter ? change > 0 : change < 0;

    return {
      metric,
      current,
      previous,
      change,
      changePercent,
      direction,
      isImprovement
    };
  }

  private calculateQualityMetrics(result: TestExecutionResult): QualityMetrics {
    // Test reliability (based on pass rate and flaky tests)
    const passRate = (result.summary.passed / result.summary.total) * 100;
    const flakyTests = this.detectFlakyTests(result);
    const flakyPenalty = (flakyTests.length / result.summary.total) * 20;
    const testReliability = Math.max(0, passRate - flakyPenalty);

    // Test maintainability (based on test structure and patterns)
    const testMaintainability = this.calculateMaintainability(result);

    // Test efficiency (based on execution time and resource usage)
    const testEfficiency = this.calculateEfficiency(result);

    // Overall quality (weighted average)
    const overallQuality = (testReliability * 0.4 + testMaintainability * 0.3 + testEfficiency * 0.3);

    return {
      testReliability: Math.round(testReliability),
      testMaintainability: Math.round(testMaintainability),
      testEfficiency: Math.round(testEfficiency),
      overallQuality: Math.round(overallQuality)
    };
  }

  private assessRisk(result: TestExecutionResult, insights: TestInsight[]): RiskAssessment {
    const riskFactors: RiskFactor[] = [];

    // Coverage risk
    if (result.coverage.lines < 60) {
      riskFactors.push({
        factor: 'Low Test Coverage',
        severity: 'high',
        description: 'Insufficient test coverage increases risk of undetected bugs in production',
        likelihood: 80,
        impact: 90
      });
    }

    // Flaky test risk
    const flakyInsight = insights.find(i => i.type === InsightType.FLAKY_TESTS);
    if (flakyInsight) {
      riskFactors.push({
        factor: 'Flaky Tests',
        severity: 'high',
        description: 'Unreliable tests can mask real issues and reduce confidence in CI/CD',
        likelihood: 70,
        impact: 80
      });
    }

    // Failure rate risk
    const failureRate = (result.summary.failed / result.summary.total) * 100;
    if (failureRate > 10) {
      riskFactors.push({
        factor: 'High Failure Rate',
        severity: failureRate > 20 ? 'critical' : 'high',
        description: 'High test failure rate indicates potential quality issues',
        likelihood: 90,
        impact: 85
      });
    }

    // Calculate overall risk
    const avgRiskScore = riskFactors.length > 0 
      ? riskFactors.reduce((sum, factor) => {
          const severityScore = { low: 25, medium: 50, high: 75, critical: 100 };
          return sum + severityScore[factor.severity];
        }, 0) / riskFactors.length
      : 0;

    let overallRisk: 'low' | 'medium' | 'high' | 'critical';
    if (avgRiskScore >= 80) overallRisk = 'critical';
    else if (avgRiskScore >= 60) overallRisk = 'high';
    else if (avgRiskScore >= 30) overallRisk = 'medium';
    else overallRisk = 'low';

    const mitigationStrategies = this.generateMitigationStrategies(riskFactors);

    return {
      overallRisk,
      riskFactors,
      mitigationStrategies
    };
  }

  private detectFlakyTests(result: TestExecutionResult): TestResult[] {
    const flakyTests: TestResult[] = [];
    
    for (const phase of result.phases) {
      for (const suite of phase.suites) {
        for (const test of suite.tests) {
          // Consider a test flaky if it was retried
          if (test.retries > 0) {
            flakyTests.push(test);
          }
        }
      }
    }
    
    return flakyTests;
  }

  private detectSlowTests(result: TestExecutionResult): TestResult[] {
    const slowTests: TestResult[] = [];
    const allTests: TestResult[] = [];
    
    // Collect all tests
    for (const phase of result.phases) {
      for (const suite of phase.suites) {
        allTests.push(...suite.tests);
      }
    }
    
    // Calculate average duration
    const avgDuration = allTests.reduce((sum, test) => sum + test.duration, 0) / allTests.length;
    const slowThreshold = avgDuration * 3; // 3x average is considered slow
    
    return allTests.filter(test => test.duration > slowThreshold);
  }

  private analyzeFailurePatterns(result: TestExecutionResult): string[] {
    const patterns: string[] = [];
    const failedTests: TestResult[] = [];
    
    // Collect failed tests
    for (const phase of result.phases) {
      for (const suite of phase.suites) {
        failedTests.push(...suite.tests.filter(test => test.status === 'failed'));
      }
    }
    
    if (failedTests.length === 0) return patterns;
    
    // Analyze error patterns
    const errorTypes = new Map<string, number>();
    
    for (const test of failedTests) {
      if (test.error) {
        const errorType = this.categorizeError(test.error);
        errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
      }
    }
    
    // Identify significant patterns (>20% of failures)
    const totalFailures = failedTests.length;
    for (const [errorType, count] of errorTypes) {
      if (count / totalFailures > 0.2) {
        patterns.push(`${errorType}: ${count} occurrences (${Math.round(count / totalFailures * 100)}%)`);
      }
    }
    
    return patterns;
  }

  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'Timeout';
    if (error.includes('network') || error.includes('connection')) return 'Network';
    if (error.includes('database') || error.includes('sql')) return 'Database';
    if (error.includes('assertion') || error.includes('expect')) return 'Assertion';
    if (error.includes('null') || error.includes('undefined')) return 'Null Reference';
    return 'Other';
  }

  private analyzeResourceUsage(result: TestExecutionResult): TestInsight | null {
    // Mock resource analysis - in real implementation, would analyze actual resource metrics
    const avgDuration = result.totalDuration / result.phases.length;
    
    if (avgDuration > 300000) { // 5 minutes
      return {
        type: InsightType.RESOURCE_USAGE,
        title: 'High Resource Usage',
        description: 'Tests are consuming significant resources and may benefit from optimization.',
        impact: 'medium',
        data: {
          avgDuration,
          recommendation: 'Consider parallel execution or resource optimization'
        }
      };
    }
    
    return null;
  }

  private calculateReliability(result: TestExecutionResult): number {
    const passRate = (result.summary.passed / result.summary.total) * 100;
    const flakyTests = this.detectFlakyTests(result);
    const flakyPenalty = (flakyTests.length / result.summary.total) * 10;
    
    return Math.max(0, Math.min(100, passRate - flakyPenalty));
  }

  private calculateMaintainability(result: TestExecutionResult): number {
    // Mock maintainability calculation based on test structure
    let score = 80; // Base score
    
    // Penalty for too many failed tests
    const failureRate = (result.summary.failed / result.summary.total) * 100;
    score -= failureRate * 0.5;
    
    // Bonus for good coverage
    if (result.coverage.lines > 80) score += 10;
    
    return Math.max(0, Math.min(100, score));
  }

  private calculateEfficiency(result: TestExecutionResult): number {
    // Mock efficiency calculation based on execution time
    const testsPerSecond = result.summary.total / (result.totalDuration / 1000);
    
    // Normalize to 0-100 scale (assuming 1 test/second is baseline)
    let score = Math.min(100, testsPerSecond * 50);
    
    // Bonus for parallel execution
    if (result.phases.some(phase => phase.suites.length > 1)) {
      score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private shouldRecommendAdditionalTestTypes(result: TestExecutionResult): boolean {
    const phaseTypes = result.phases.map(phase => phase.type);
    
    // Recommend if missing common test types
    const hasE2E = phaseTypes.includes(TestPhaseType.E2E);
    const hasPerformance = phaseTypes.includes(TestPhaseType.PERFORMANCE);
    
    return !hasE2E || !hasPerformance;
  }

  private generateMitigationStrategies(riskFactors: RiskFactor[]): string[] {
    const strategies: string[] = [];
    
    for (const factor of riskFactors) {
      switch (factor.factor) {
        case 'Low Test Coverage':
          strategies.push('Implement coverage gates in CI/CD pipeline');
          strategies.push('Prioritize testing of critical business logic');
          break;
        case 'Flaky Tests':
          strategies.push('Implement test quarantine for unreliable tests');
          strategies.push('Add proper wait conditions and test isolation');
          break;
        case 'High Failure Rate':
          strategies.push('Investigate and fix root causes of test failures');
          strategies.push('Improve test data management and cleanup');
          break;
      }
    }
    
    return [...new Set(strategies)]; // Remove duplicates
  }
}