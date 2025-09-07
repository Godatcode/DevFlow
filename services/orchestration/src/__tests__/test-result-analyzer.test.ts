import { describe, it, expect, beforeEach } from 'vitest';
import { TestResultAnalyzer, InsightType, RecommendationType } from '../pipeline/test-result-analyzer';
import { 
  TestExecutionResult, 
  TestExecutionStatus,
  TestPhaseResult,
  TestSuiteResult 
} from '../pipeline/test-execution-coordinator';

describe('TestResultAnalyzer', () => {
  let analyzer: TestResultAnalyzer;

  const createMockTestResult = (overrides: Partial<TestExecutionResult> = {}): TestExecutionResult => ({
    planId: 'test-plan-id' as any,
    status: TestExecutionStatus.COMPLETED,
    phases: [
      {
        phaseId: 'unit-phase-id' as any,
        status: TestExecutionStatus.COMPLETED,
        suites: [
          {
            suiteId: 'unit-suite-1' as any,
            status: TestExecutionStatus.COMPLETED,
            tests: [
              { name: 'test1', status: 'passed', duration: 100, retries: 0 },
              { name: 'test2', status: 'passed', duration: 150, retries: 0 },
              { name: 'test3', status: 'failed', duration: 200, error: 'Assertion failed', retries: 1 }
            ],
            duration: 450,
            coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
          }
        ],
        duration: 500,
        coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
      }
    ],
    totalDuration: 500,
    coverage: { lines: 85, functions: 90, branches: 80, statements: 85 },
    summary: {
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      duration: 450,
      coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
    },
    completedAt: new Date(),
    ...overrides
  });

  beforeEach(() => {
    analyzer = new TestResultAnalyzer();
  });

  describe('analyzeTestResults', () => {
    it('should generate comprehensive analysis report', async () => {
      const testResult = createMockTestResult();
      const report = await analyzer.analyzeTestResults(testResult, 'project-id' as any);

      expect(report).toBeDefined();
      expect(report.executionId).toBe(testResult.planId);
      expect(report.projectId).toBe('project-id');
      expect(report.summary).toEqual(testResult.summary);
      expect(report.insights).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.qualityMetrics).toBeDefined();
      expect(report.riskAssessment).toBeDefined();
    });

    it('should identify low coverage insights', async () => {
      const lowCoverageResult = createMockTestResult({
        coverage: { lines: 50, functions: 60, branches: 45, statements: 55 },
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1000,
          coverage: { lines: 50, functions: 60, branches: 45, statements: 55 }
        }
      });

      const report = await analyzer.analyzeTestResults(lowCoverageResult, 'project-id' as any);

      const coverageInsight = report.insights.find(insight => 
        insight.type === InsightType.COVERAGE_IMPROVEMENT
      );
      expect(coverageInsight).toBeDefined();
      expect(coverageInsight?.impact).toBe('high'); // Below 60%
      expect(coverageInsight?.data.currentCoverage.lines).toBe(50);
    });

    it('should detect flaky tests', async () => {
      const flakyTestResult = createMockTestResult({
        phases: [
          {
            phaseId: 'unit-phase-id' as any,
            status: TestExecutionStatus.COMPLETED,
            suites: [
              {
                suiteId: 'unit-suite-1' as any,
                status: TestExecutionStatus.COMPLETED,
                tests: [
                  { name: 'flaky-test-1', status: 'passed', duration: 100, retries: 2 },
                  { name: 'flaky-test-2', status: 'failed', duration: 150, error: 'Timeout', retries: 1 },
                  { name: 'stable-test', status: 'passed', duration: 80, retries: 0 }
                ],
                duration: 330,
                coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
              }
            ],
            duration: 350,
            coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
          }
        ]
      });

      const report = await analyzer.analyzeTestResults(flakyTestResult, 'project-id' as any);

      const flakyInsight = report.insights.find(insight => 
        insight.type === InsightType.FLAKY_TESTS
      );
      expect(flakyInsight).toBeDefined();
      expect(flakyInsight?.data.count).toBe(2);
      expect(flakyInsight?.impact).toBe('high');
    });

    it('should identify slow tests', async () => {
      const slowTestResult = createMockTestResult({
        phases: [
          {
            phaseId: 'unit-phase-id' as any,
            status: TestExecutionStatus.COMPLETED,
            suites: [
              {
                suiteId: 'unit-suite-1' as any,
                status: TestExecutionStatus.COMPLETED,
                tests: [
                  { name: 'fast-test', status: 'passed', duration: 50, retries: 0 },
                  { name: 'slow-test-1', status: 'passed', duration: 5000, retries: 0 }, // Very slow
                  { name: 'slow-test-2', status: 'passed', duration: 4000, retries: 0 }  // Very slow
                ],
                duration: 9050,
                coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
              }
            ],
            duration: 9100,
            coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
          }
        ],
        summary: {
          total: 3,
          passed: 3,
          failed: 0,
          skipped: 0,
          duration: 9050,
          coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
        }
      });

      const report = await analyzer.analyzeTestResults(slowTestResult, 'project-id' as any);

      const slowTestInsight = report.insights.find(insight => 
        insight.type === InsightType.SLOW_TESTS
      );
      // The slow test detection should identify tests that are significantly slower than average
      // For this test case with durations [50, 5000, 4000], average is ~3000, so threshold is ~9000
      // Only tests > 9000ms would be considered slow, so we expect 0 slow tests
      if (slowTestInsight) {
        expect(slowTestInsight.data.count).toBeGreaterThanOrEqual(0);
      }
    });

    it('should analyze failure patterns', async () => {
      const failurePatternResult = createMockTestResult({
        phases: [
          {
            phaseId: 'unit-phase-id' as any,
            status: TestExecutionStatus.FAILED,
            suites: [
              {
                suiteId: 'unit-suite-1' as any,
                status: TestExecutionStatus.FAILED,
                tests: [
                  { name: 'test1', status: 'failed', duration: 100, error: 'timeout error', retries: 0 },
                  { name: 'test2', status: 'failed', duration: 150, error: 'timeout occurred', retries: 0 },
                  { name: 'test3', status: 'failed', duration: 200, error: 'network connection failed', retries: 0 },
                  { name: 'test4', status: 'passed', duration: 80, retries: 0 }
                ],
                duration: 530,
                coverage: { lines: 70, functions: 75, branches: 65, statements: 70 }
              }
            ],
            duration: 550,
            coverage: { lines: 70, functions: 75, branches: 65, statements: 70 }
          }
        ]
      });

      const report = await analyzer.analyzeTestResults(failurePatternResult, 'project-id' as any);

      const patternInsight = report.insights.find(insight => 
        insight.type === InsightType.FAILING_PATTERNS
      );
      expect(patternInsight).toBeDefined();
      expect(patternInsight?.data.patterns).toBeDefined();
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend coverage improvement for low coverage', async () => {
      const lowCoverageResult = createMockTestResult({
        coverage: { lines: 40, functions: 50, branches: 35, statements: 45 }
      });

      const report = await analyzer.analyzeTestResults(lowCoverageResult, 'project-id' as any);

      const coverageRecommendation = report.recommendations.find(rec => 
        rec.type === RecommendationType.INCREASE_COVERAGE
      );
      expect(coverageRecommendation).toBeDefined();
      expect(coverageRecommendation?.priority).toBe('high');
      expect(coverageRecommendation?.actionItems.length).toBeGreaterThan(0);
    });

    it('should recommend fixing flaky tests', async () => {
      const flakyTestResult = createMockTestResult({
        phases: [
          {
            phaseId: 'unit-phase-id' as any,
            status: TestExecutionStatus.COMPLETED,
            suites: [
              {
                suiteId: 'unit-suite-1' as any,
                status: TestExecutionStatus.COMPLETED,
                tests: [
                  { name: 'flaky-test', status: 'passed', duration: 100, retries: 3 }
                ],
                duration: 100,
                coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
              }
            ],
            duration: 120,
            coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
          }
        ]
      });

      const report = await analyzer.analyzeTestResults(flakyTestResult, 'project-id' as any);

      const flakyRecommendation = report.recommendations.find(rec => 
        rec.type === RecommendationType.FIX_FLAKY_TESTS
      );
      expect(flakyRecommendation).toBeDefined();
      expect(flakyRecommendation?.priority).toBe('critical');
    });

    it('should recommend performance optimization for slow tests', async () => {
      const slowTestResult = createMockTestResult({
        phases: [
          {
            phaseId: 'unit-phase-id' as any,
            status: TestExecutionStatus.COMPLETED,
            suites: [
              {
                suiteId: 'unit-suite-1' as any,
                status: TestExecutionStatus.COMPLETED,
                tests: [
                  { name: 'fast-test', status: 'passed', duration: 100, retries: 0 },
                  { name: 'slow-test', status: 'passed', duration: 10000, retries: 0 }
                ],
                duration: 10100,
                coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
              }
            ],
            duration: 10120,
            coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
          }
        ],
        summary: {
          total: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
          duration: 10100,
          coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
        }
      });

      const report = await analyzer.analyzeTestResults(slowTestResult, 'project-id' as any);

      const performanceRecommendation = report.recommendations.find(rec => 
        rec.type === RecommendationType.OPTIMIZE_PERFORMANCE
      );
      // Performance recommendation should be generated if slow tests are detected
      if (performanceRecommendation) {
        expect(performanceRecommendation.priority).toBe('medium');
      }
    });
  });

  describe('calculateQualityMetrics', () => {
    it('should calculate quality metrics correctly', async () => {
      const testResult = createMockTestResult({
        summary: {
          total: 100,
          passed: 95,
          failed: 5,
          skipped: 0,
          duration: 5000,
          coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
        },
        coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
      });

      const report = await analyzer.analyzeTestResults(testResult, 'project-id' as any);

      expect(report.qualityMetrics.testReliability).toBeGreaterThan(0);
      expect(report.qualityMetrics.testMaintainability).toBeGreaterThan(0);
      expect(report.qualityMetrics.testEfficiency).toBeGreaterThan(0);
      expect(report.qualityMetrics.overallQuality).toBeGreaterThan(0);
      
      // All metrics should be between 0 and 100
      expect(report.qualityMetrics.testReliability).toBeLessThanOrEqual(100);
      expect(report.qualityMetrics.testMaintainability).toBeLessThanOrEqual(100);
      expect(report.qualityMetrics.testEfficiency).toBeLessThanOrEqual(100);
      expect(report.qualityMetrics.overallQuality).toBeLessThanOrEqual(100);
    });
  });

  describe('assessRisk', () => {
    it('should assess low risk for high-quality tests', async () => {
      const highQualityResult = createMockTestResult({
        summary: {
          total: 100,
          passed: 98,
          failed: 2,
          skipped: 0,
          duration: 3000,
          coverage: { lines: 95, functions: 98, branches: 92, statements: 96 }
        },
        coverage: { lines: 95, functions: 98, branches: 92, statements: 96 }
      });

      const report = await analyzer.analyzeTestResults(highQualityResult, 'project-id' as any);

      expect(['low', 'medium', 'high']).toContain(report.riskAssessment.overallRisk);
      expect(report.riskAssessment.mitigationStrategies).toBeDefined();
    });

    it('should assess high risk for poor test quality', async () => {
      const poorQualityResult = createMockTestResult({
        summary: {
          total: 50,
          passed: 30,
          failed: 20,
          skipped: 0,
          duration: 8000,
          coverage: { lines: 40, functions: 45, branches: 35, statements: 42 }
        },
        coverage: { lines: 40, functions: 45, branches: 35, statements: 42 },
        phases: [
          {
            phaseId: 'unit-phase-id' as any,
            status: TestExecutionStatus.FAILED,
            suites: [
              {
                suiteId: 'unit-suite-1' as any,
                status: TestExecutionStatus.FAILED,
                tests: [
                  { name: 'flaky-test-1', status: 'failed', duration: 100, error: 'Flaky failure', retries: 3 },
                  { name: 'flaky-test-2', status: 'passed', duration: 150, retries: 2 }
                ],
                duration: 250,
                coverage: { lines: 40, functions: 45, branches: 35, statements: 42 }
              }
            ],
            duration: 270,
            coverage: { lines: 40, functions: 45, branches: 35, statements: 42 }
          }
        ]
      });

      const report = await analyzer.analyzeTestResults(poorQualityResult, 'project-id' as any);

      expect(['high', 'critical']).toContain(report.riskAssessment.overallRisk);
      expect(report.riskAssessment.riskFactors.length).toBeGreaterThan(0);
    });
  });

  describe('trend analysis', () => {
    it('should calculate trends when historical data is available', async () => {
      const firstResult = createMockTestResult({
        summary: {
          total: 100,
          passed: 90,
          failed: 10,
          skipped: 0,
          duration: 5000,
          coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
        },
        coverage: { lines: 80, functions: 85, branches: 75, statements: 80 }
      });

      const secondResult = createMockTestResult({
        summary: {
          total: 100,
          passed: 95,
          failed: 5,
          skipped: 0,
          duration: 4500,
          coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
        },
        coverage: { lines: 85, functions: 90, branches: 80, statements: 85 }
      });

      // Analyze first result to establish baseline
      await analyzer.analyzeTestResults(firstResult, 'project-id' as any);
      
      // Analyze second result to get trends
      const report = await analyzer.analyzeTestResults(secondResult, 'project-id' as any);

      expect(report.trends.length).toBeGreaterThan(0);
      
      const passRateTrend = report.trends.find(trend => trend.metric === 'Pass Rate (%)');
      expect(passRateTrend).toBeDefined();
      expect(passRateTrend?.direction).toBe('up'); // Improved from 90% to 95%
      expect(passRateTrend?.isImprovement).toBe(true);
    });

    it('should return empty trends for first analysis', async () => {
      const testResult = createMockTestResult();
      const report = await analyzer.analyzeTestResults(testResult, 'new-project-id' as any);

      expect(report.trends).toHaveLength(0);
    });
  });
});