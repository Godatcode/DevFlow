import { 
  AIAgent, 
  AgentType, 
  AgentCapability, 
  AgentContext, 
  AgentInput, 
  AgentResult,
  ExecutionStatus,
  UUID 
} from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

export interface TestGenerationResult {
  generatedTests: GeneratedTest[];
  coverageAnalysis: CoverageAnalysis;
  testSuites: TestSuite[];
  recommendations: TestRecommendation[];
  generationDuration: number;
}

export interface GeneratedTest {
  id: string;
  name: string;
  description: string;
  type: TestType;
  targetFunction: string;
  targetFile: string;
  testCode: string;
  framework: TestFramework;
  assertions: TestAssertion[];
  setup?: string;
  teardown?: string;
  confidence: number; // 0-1, how confident we are in the test quality
}

export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  ACCESSIBILITY = 'accessibility',
  SNAPSHOT = 'snapshot',
  PROPERTY_BASED = 'property_based'
}

export enum TestFramework {
  JEST = 'jest',
  VITEST = 'vitest',
  MOCHA = 'mocha',
  JASMINE = 'jasmine',
  CYPRESS = 'cypress',
  PLAYWRIGHT = 'playwright',
  TESTING_LIBRARY = 'testing_library'
}

export interface TestAssertion {
  type: AssertionType;
  description: string;
  code: string;
}

export enum AssertionType {
  EQUALITY = 'equality',
  TRUTHINESS = 'truthiness',
  TYPE_CHECK = 'type_check',
  EXCEPTION = 'exception',
  MOCK_CALL = 'mock_call',
  DOM_STATE = 'dom_state',
  ASYNC_RESULT = 'async_result'
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: GeneratedTest[];
  setup?: string;
  teardown?: string;
  framework: TestFramework;
  coverageTarget: number;
}

export interface CoverageAnalysis {
  currentCoverage: CoverageMetrics;
  expectedCoverage: CoverageMetrics;
  improvementPotential: number;
  uncoveredFunctions: string[];
  uncoveredBranches: string[];
  criticalPaths: string[];
}

export interface CoverageMetrics {
  lines: number;
  functions: number;
  branches: number;
  statements: number;
}

export interface TestRecommendation {
  id: string;
  category: 'coverage' | 'quality' | 'performance' | 'maintainability';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  actionItems: string[];
  examples?: {
    before?: string;
    after: string;
  };
  references: string[];
}

export interface TestGeneratorConfig {
  enableUnitTests: boolean;
  enableIntegrationTests: boolean;
  enableE2ETests: boolean;
  preferredFramework: TestFramework;
  coverageTarget: number;
  generateMocks: boolean;
  generateSnapshots: boolean;
  includeEdgeCases: boolean;
  includeErrorCases: boolean;
  maxTestsPerFunction: number;
  testNamingConvention: 'describe_it' | 'test_function' | 'should_when';
}

export class TestGeneratorAgent implements AIAgent {
  public readonly id: UUID;
  public readonly name: string = 'Test Generator';
  public readonly type: AgentType = AgentType.TEST_GENERATOR;
  public readonly version: string = '1.0.0';
  public readonly capabilities: AgentCapability[] = [
    AgentCapability.TEST_GENERATION,
    AgentCapability.CODE_ANALYSIS
  ];
  public readonly configuration: TestGeneratorConfig;
  public isActive: boolean = true;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private logger: Logger;
  private generators: Map<TestFramework, TestCodeGenerator> = new Map();

  constructor(
    id: UUID,
    config: TestGeneratorConfig,
    logger: Logger
  ) {
    this.id = id;
    this.configuration = config;
    this.logger = logger;
    this.createdAt = new Date();
    this.updatedAt = new Date();

    this.initializeGenerators();
  }

  async execute(context: AgentContext, input: AgentInput): Promise<AgentResult> {
    const executionId = this.generateExecutionId();
    const startTime = new Date();

    this.logger.info('Starting test generation', { 
      executionId, 
      agentId: this.id,
      workflowId: context.workflowId,
      projectId: context.projectId 
    });

    try {
      const generationResult = await this.performTestGeneration(context, input);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Generate test report
      const report = await this.generateTestReport(generationResult, context);

      const result: AgentResult = {
        executionId,
        status: ExecutionStatus.COMPLETED,
        output: {
          success: true,
          data: {
            generationResult,
            report,
            summary: {
              totalTests: generationResult.generatedTests.length,
              testSuites: generationResult.testSuites.length,
              coverageImprovement: generationResult.coverageAnalysis.improvementPotential,
              framework: this.configuration.preferredFramework,
              averageConfidence: this.calculateAverageConfidence(generationResult.generatedTests)
            }
          },
          metrics: {
            generationDuration: duration,
            testsGenerated: generationResult.generatedTests.length,
            coverageImprovement: generationResult.coverageAnalysis.improvementPotential,
            averageConfidence: this.calculateAverageConfidence(generationResult.generatedTests)
          },
          recommendations: generationResult.recommendations.map(r => r.description)
        },
        duration,
        startTime,
        endTime
      };

      this.logger.info('Test generation completed', { 
        executionId,
        testsGenerated: generationResult.generatedTests.length,
        coverageImprovement: generationResult.coverageAnalysis.improvementPotential,
        duration 
      });

      return result;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error('Test generation failed', { 
        executionId,
        error: error instanceof Error ? error.message : String(error),
        duration 
      });

      return {
        executionId,
        status: ExecutionStatus.FAILED,
        output: {
          success: false,
          data: null,
          metrics: {
            generationDuration: duration,
            testsGenerated: 0,
            coverageImprovement: 0,
            averageConfidence: 0
          },
          error: error instanceof Error ? error.message : String(error)
        },
        duration,
        startTime,
        endTime
      };
    }
  }

  private async performTestGeneration(
    context: AgentContext, 
    input: AgentInput
  ): Promise<TestGenerationResult> {
    const generationStartTime = Date.now();
    const generatedTests: GeneratedTest[] = [];
    const testSuites: TestSuite[] = [];
    const recommendations: TestRecommendation[] = [];

    const codeContent = input.parameters.codeContent as string || '';
    const filePath = input.parameters.filePath as string || 'unknown';
    const existingTests = input.parameters.existingTests as string || '';

    // Analyze code structure
    const codeAnalysis = this.analyzeCodeStructure(codeContent, filePath);
    
    // Generate unit tests
    if (this.configuration.enableUnitTests) {
      const unitTests = await this.generateUnitTests(codeAnalysis, codeContent);
      generatedTests.push(...unitTests);
    }

    // Generate integration tests
    if (this.configuration.enableIntegrationTests) {
      const integrationTests = await this.generateIntegrationTests(codeAnalysis, codeContent);
      generatedTests.push(...integrationTests);
    }

    // Generate E2E tests
    if (this.configuration.enableE2ETests && this.isWebApplication(codeContent)) {
      const e2eTests = await this.generateE2ETests(codeAnalysis, codeContent);
      generatedTests.push(...e2eTests);
    }

    // Organize tests into suites
    testSuites.push(...this.organizeTestsIntoSuites(generatedTests));

    // Analyze coverage
    const coverageAnalysis = this.analyzeCoverage(codeAnalysis, generatedTests, existingTests);

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(generatedTests, coverageAnalysis));

    const generationDuration = Date.now() - generationStartTime;

    return {
      generatedTests,
      coverageAnalysis,
      testSuites,
      recommendations,
      generationDuration
    };
  }

  private analyzeCodeStructure(codeContent: string, filePath: string): CodeAnalysis {
    const functions = this.extractFunctions(codeContent);
    const classes = this.extractClasses(codeContent);
    const imports = this.extractImports(codeContent);
    const exports = this.extractExports(codeContent);

    return {
      filePath,
      functions,
      classes,
      imports,
      exports,
      complexity: this.calculateComplexity(codeContent),
      dependencies: this.extractDependencies(imports)
    };
  }

  private extractFunctions(codeContent: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    
    // Regular function declarations
    const functionRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*{/g;
    let match: RegExpExecArray | null;
    while ((match = functionRegex.exec(codeContent)) !== null) {
      functions.push({
        name: match[1],
        parameters: this.parseParameters(match[2]),
        type: 'function',
        isAsync: false,
        isExported: this.isExported(match[1], codeContent),
        lineNumber: this.getLineNumber(codeContent, match.index)
      });
    }

    // Arrow functions
    const arrowFunctionRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    while ((match = arrowFunctionRegex.exec(codeContent)) !== null) {
      functions.push({
        name: match[1],
        parameters: [],
        type: 'arrow',
        isAsync: match[0].includes('async'),
        isExported: this.isExported(match[1], codeContent),
        lineNumber: this.getLineNumber(codeContent, match.index)
      });
    }

    // Method definitions in classes
    const methodRegex = /(\w+)\s*\([^)]*\)\s*{/g;
    while ((match = methodRegex.exec(codeContent)) !== null) {
      if (match && match[1] && !functions.some(f => f.name === match![1])) {
        functions.push({
          name: match[1],
          parameters: [],
          type: 'method',
          isAsync: false,
          isExported: false,
          lineNumber: this.getLineNumber(codeContent, match.index)
        });
      }
    }

    return functions;
  }

  private extractClasses(codeContent: string): ClassInfo[] {
    const classes: ClassInfo[] = [];
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g;
    
    let match;
    while ((match = classRegex.exec(codeContent)) !== null) {
      classes.push({
        name: match[1],
        extends: match[2] || null,
        methods: [],
        isExported: this.isExported(match[1], codeContent),
        lineNumber: this.getLineNumber(codeContent, match.index)
      });
    }

    return classes;
  }

  private extractImports(codeContent: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const importRegex = /import\s+(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(codeContent)) !== null) {
      imports.push({
        module: match[4],
        imports: match[1] ? match[1].split(',').map(s => s.trim()) : [match[2] || match[3]],
        type: match[1] ? 'named' : match[2] ? 'namespace' : 'default'
      });
    }

    return imports;
  }

  private extractExports(codeContent: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+))/g;
    
    let match;
    while ((match = exportRegex.exec(codeContent)) !== null) {
      const exportName = match[1] || match[2] || match[3] || match[4] || match[5];
      if (exportName) {
        exports.push(exportName);
      }
    }

    return exports;
  }

  private async generateUnitTests(
    codeAnalysis: CodeAnalysis, 
    codeContent: string
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];

    for (const func of codeAnalysis.functions) {
      if (func.isExported || func.type === 'method') {
        const functionTests = await this.generateTestsForFunction(func, codeAnalysis);
        tests.push(...functionTests.slice(0, this.configuration.maxTestsPerFunction));
      }
    }

    return tests;
  }

  private async generateTestsForFunction(
    func: FunctionInfo, 
    codeAnalysis: CodeAnalysis
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];

    // Happy path test
    tests.push(this.generateHappyPathTest(func, codeAnalysis));

    // Edge cases
    if (this.configuration.includeEdgeCases) {
      tests.push(...this.generateEdgeCaseTests(func, codeAnalysis));
    }

    // Error cases
    if (this.configuration.includeErrorCases) {
      tests.push(...this.generateErrorCaseTests(func, codeAnalysis));
    }

    return tests;
  }

  private generateHappyPathTest(func: FunctionInfo, codeAnalysis: CodeAnalysis): GeneratedTest {
    const testName = this.generateTestName(func.name, 'should work correctly with valid input');
    const testCode = this.generateTestCode(func, 'happy_path', codeAnalysis);

    return {
      id: this.generateTestId(),
      name: testName,
      description: `Test the happy path for ${func.name}`,
      type: TestType.UNIT,
      targetFunction: func.name,
      targetFile: codeAnalysis.filePath,
      testCode,
      framework: this.configuration.preferredFramework,
      assertions: [
        {
          type: AssertionType.EQUALITY,
          description: 'Should return expected result',
          code: 'expect(result).toBe(expectedValue)'
        }
      ],
      confidence: 0.8
    };
  }

  private generateEdgeCaseTests(func: FunctionInfo, codeAnalysis: CodeAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Empty input test
    tests.push({
      id: this.generateTestId(),
      name: this.generateTestName(func.name, 'should handle empty input'),
      description: `Test ${func.name} with empty input`,
      type: TestType.UNIT,
      targetFunction: func.name,
      targetFile: codeAnalysis.filePath,
      testCode: this.generateTestCode(func, 'empty_input', codeAnalysis),
      framework: this.configuration.preferredFramework,
      assertions: [
        {
          type: AssertionType.TRUTHINESS,
          description: 'Should handle empty input gracefully',
          code: 'expect(result).toBeDefined()'
        }
      ],
      confidence: 0.7
    });

    // Null/undefined input test
    tests.push({
      id: this.generateTestId(),
      name: this.generateTestName(func.name, 'should handle null input'),
      description: `Test ${func.name} with null input`,
      type: TestType.UNIT,
      targetFunction: func.name,
      targetFile: codeAnalysis.filePath,
      testCode: this.generateTestCode(func, 'null_input', codeAnalysis),
      framework: this.configuration.preferredFramework,
      assertions: [
        {
          type: AssertionType.EXCEPTION,
          description: 'Should handle null input appropriately',
          code: 'expect(() => func(null)).not.toThrow()'
        }
      ],
      confidence: 0.6
    });

    return tests;
  }

  private generateErrorCaseTests(func: FunctionInfo, codeAnalysis: CodeAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Invalid input test
    tests.push({
      id: this.generateTestId(),
      name: this.generateTestName(func.name, 'should throw error with invalid input'),
      description: `Test ${func.name} error handling`,
      type: TestType.UNIT,
      targetFunction: func.name,
      targetFile: codeAnalysis.filePath,
      testCode: this.generateTestCode(func, 'invalid_input', codeAnalysis),
      framework: this.configuration.preferredFramework,
      assertions: [
        {
          type: AssertionType.EXCEPTION,
          description: 'Should throw appropriate error',
          code: 'expect(() => func(invalidInput)).toThrow()'
        }
      ],
      confidence: 0.7
    });

    return tests;
  }

  private async generateIntegrationTests(
    codeAnalysis: CodeAnalysis, 
    codeContent: string
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];

    // Generate tests for exported functions that interact with dependencies
    for (const func of codeAnalysis.functions.filter(f => f.isExported)) {
      if (codeAnalysis.dependencies.length > 0) {
        tests.push({
          id: this.generateTestId(),
          name: this.generateTestName(func.name, 'integration test'),
          description: `Integration test for ${func.name}`,
          type: TestType.INTEGRATION,
          targetFunction: func.name,
          targetFile: codeAnalysis.filePath,
          testCode: this.generateIntegrationTestCode(func, codeAnalysis),
          framework: this.configuration.preferredFramework,
          assertions: [
            {
              type: AssertionType.MOCK_CALL,
              description: 'Should call dependencies correctly',
              code: 'expect(mockDependency).toHaveBeenCalledWith(expectedArgs)'
            }
          ],
          confidence: 0.6
        });
      }
    }

    return tests;
  }

  private async generateE2ETests(
    codeAnalysis: CodeAnalysis, 
    codeContent: string
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];

    // Generate E2E tests for web components
    if (this.isReactComponent(codeContent) || this.isVueComponent(codeContent)) {
      tests.push({
        id: this.generateTestId(),
        name: 'should render component correctly',
        description: 'E2E test for component rendering',
        type: TestType.E2E,
        targetFunction: 'component',
        targetFile: codeAnalysis.filePath,
        testCode: this.generateE2ETestCode(codeAnalysis),
        framework: TestFramework.CYPRESS,
        assertions: [
          {
            type: AssertionType.DOM_STATE,
            description: 'Should render expected elements',
            code: 'cy.get("[data-testid=component]").should("be.visible")'
          }
        ],
        confidence: 0.5
      });
    }

    return tests;
  }

  private generateTestCode(
    func: FunctionInfo, 
    scenario: string, 
    codeAnalysis: CodeAnalysis
  ): string {
    const framework = this.configuration.preferredFramework;
    const imports = this.generateTestImports(codeAnalysis, framework);
    const setup = this.generateTestSetup(func, scenario);
    const testBody = this.generateTestBody(func, scenario, framework);

    return `${imports}

${setup}

${testBody}`;
  }

  private generateTestImports(codeAnalysis: CodeAnalysis, framework: TestFramework): string {
    const targetImport = `import { ${codeAnalysis.functions.map(f => f.name).join(', ')} } from './${codeAnalysis.filePath.replace('.ts', '').replace('.js', '')}';`;
    
    switch (framework) {
      case TestFramework.JEST:
        return `${targetImport}`;
      case TestFramework.VITEST:
        return `import { describe, it, expect } from 'vitest';\n${targetImport}`;
      case TestFramework.MOCHA:
        return `import { describe, it } from 'mocha';\nimport { expect } from 'chai';\n${targetImport}`;
      default:
        return targetImport;
    }
  }

  private generateTestSetup(func: FunctionInfo, scenario: string): string {
    switch (scenario) {
      case 'happy_path':
        return `// Test setup for happy path scenario`;
      case 'empty_input':
        return `// Test setup for empty input scenario`;
      case 'null_input':
        return `// Test setup for null input scenario`;
      case 'invalid_input':
        return `// Test setup for invalid input scenario`;
      default:
        return `// Test setup`;
    }
  }

  private generateTestBody(func: FunctionInfo, scenario: string, framework: TestFramework): string {
    const testName = this.generateTestName(func.name, this.getScenarioDescription(scenario));
    
    switch (framework) {
      case TestFramework.JEST:
      case TestFramework.VITEST:
        return `describe('${func.name}', () => {
  it('${testName}', () => {
    ${this.generateTestLogic(func, scenario)}
  });
});`;
      
      case TestFramework.MOCHA:
        return `describe('${func.name}', () => {
  it('${testName}', () => {
    ${this.generateTestLogic(func, scenario)}
  });
});`;
      
      default:
        return `test('${testName}', () => {
  ${this.generateTestLogic(func, scenario)}
});`;
    }
  }

  private generateTestLogic(func: FunctionInfo, scenario: string): string {
    switch (scenario) {
      case 'happy_path':
        return `// Arrange
    const input = 'test input';
    const expected = 'expected output';
    
    // Act
    const result = ${func.name}(input);
    
    // Assert
    expect(result).toBe(expected);`;
      
      case 'empty_input':
        return `// Arrange
    const input = '';
    
    // Act
    const result = ${func.name}(input);
    
    // Assert
    expect(result).toBeDefined();`;
      
      case 'null_input':
        return `// Arrange
    const input = null;
    
    // Act & Assert
    expect(() => ${func.name}(input)).not.toThrow();`;
      
      case 'invalid_input':
        return `// Arrange
    const input = 'invalid';
    
    // Act & Assert
    expect(() => ${func.name}(input)).toThrow();`;
      
      default:
        return `// Test logic for ${func.name}
    const result = ${func.name}();
    expect(result).toBeDefined();`;
    }
  }

  private generateIntegrationTestCode(func: FunctionInfo, codeAnalysis: CodeAnalysis): string {
    return `import { ${func.name} } from './${codeAnalysis.filePath.replace('.ts', '').replace('.js', '')}';

describe('${func.name} integration', () => {
  it('should work with real dependencies', async () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const result = await ${func.name}(input);
    
    // Assert
    expect(result).toBeDefined();
  });
});`;
  }

  private generateE2ETestCode(codeAnalysis: CodeAnalysis): string {
    return `describe('Component E2E', () => {
  it('should render and interact correctly', () => {
    cy.visit('/');
    cy.get('[data-testid="component"]').should('be.visible');
    cy.get('[data-testid="button"]').click();
    cy.get('[data-testid="result"]').should('contain', 'expected text');
  });
});`;
  }

  private organizeTestsIntoSuites(tests: GeneratedTest[]): TestSuite[] {
    const suiteMap = new Map<string, GeneratedTest[]>();
    
    // Group tests by target file
    for (const test of tests) {
      const key = test.targetFile;
      if (!suiteMap.has(key)) {
        suiteMap.set(key, []);
      }
      suiteMap.get(key)!.push(test);
    }

    return Array.from(suiteMap.entries()).map(([file, tests]) => ({
      id: this.generateSuiteId(),
      name: `${file} Test Suite`,
      description: `Test suite for ${file}`,
      tests,
      framework: this.configuration.preferredFramework,
      coverageTarget: this.configuration.coverageTarget
    }));
  }

  private analyzeCoverage(
    codeAnalysis: CodeAnalysis, 
    generatedTests: GeneratedTest[], 
    existingTests: string
  ): CoverageAnalysis {
    const totalFunctions = codeAnalysis.functions.length;
    const testedFunctions = new Set(generatedTests.map(t => t.targetFunction)).size;
    
    const currentCoverage: CoverageMetrics = {
      lines: 0,
      functions: existingTests ? Math.floor(totalFunctions * 0.6) : 0,
      branches: 0,
      statements: 0
    };

    const expectedCoverage: CoverageMetrics = {
      lines: Math.floor(totalFunctions * 0.9),
      functions: Math.min(totalFunctions, testedFunctions + currentCoverage.functions),
      branches: Math.floor(totalFunctions * 0.8),
      statements: Math.floor(totalFunctions * 0.85)
    };

    const improvementPotential = expectedCoverage.functions - currentCoverage.functions;

    return {
      currentCoverage,
      expectedCoverage,
      improvementPotential,
      uncoveredFunctions: codeAnalysis.functions
        .filter(f => !generatedTests.some(t => t.targetFunction === f.name))
        .map(f => f.name),
      uncoveredBranches: [],
      criticalPaths: codeAnalysis.functions
        .filter(f => f.isExported)
        .map(f => f.name)
    };
  }

  private generateRecommendations(
    tests: GeneratedTest[], 
    coverage: CoverageAnalysis
  ): TestRecommendation[] {
    const recommendations: TestRecommendation[] = [];

    // Coverage recommendations
    if (coverage.improvementPotential > 0) {
      recommendations.push({
        id: this.generateRecommendationId(),
        category: 'coverage',
        priority: 'high',
        title: 'Improve Test Coverage',
        description: 'Add tests for uncovered functions to improve overall coverage',
        actionItems: [
          `Add tests for ${coverage.uncoveredFunctions.length} uncovered functions`,
          'Focus on critical paths and exported functions',
          'Consider edge cases and error scenarios'
        ],
        examples: {
          after: `describe('uncoveredFunction', () => {
  it('should handle valid input', () => {
    expect(uncoveredFunction('input')).toBe('output');
  });
});`
        },
        references: [
          'https://jestjs.io/docs/getting-started',
          'https://testing-library.com/docs/'
        ]
      });
    }

    // Quality recommendations
    const lowConfidenceTests = tests.filter(t => t.confidence < 0.7);
    if (lowConfidenceTests.length > 0) {
      recommendations.push({
        id: this.generateRecommendationId(),
        category: 'quality',
        priority: 'medium',
        title: 'Improve Test Quality',
        description: 'Review and enhance tests with low confidence scores',
        actionItems: [
          'Add more specific assertions',
          'Include better test data',
          'Add setup and teardown where needed'
        ],
        references: [
          'https://kentcdodds.com/blog/write-tests'
        ]
      });
    }

    return recommendations;
  }

  private calculateAverageConfidence(tests: GeneratedTest[]): number {
    if (tests.length === 0) return 0;
    return tests.reduce((sum, test) => sum + test.confidence, 0) / tests.length;
  }

  private async generateTestReport(
    generationResult: TestGenerationResult, 
    context: AgentContext
  ): Promise<string> {
    const report = `
# Test Generation Report

**Project:** ${context.projectId}
**Generation Date:** ${new Date().toISOString()}
**Framework:** ${this.configuration.preferredFramework}

## Summary

- **Total Tests Generated:** ${generationResult.generatedTests.length}
- **Test Suites:** ${generationResult.testSuites.length}
- **Coverage Improvement:** ${generationResult.coverageAnalysis.improvementPotential} functions
- **Average Confidence:** ${(this.calculateAverageConfidence(generationResult.generatedTests) * 100).toFixed(1)}%

## Test Breakdown

### By Type
${Object.values(TestType).map(type => {
  const count = generationResult.generatedTests.filter(t => t.type === type).length;
  return count > 0 ? `- **${type.toUpperCase()}:** ${count}` : '';
}).filter(Boolean).join('\n')}

### By Confidence Level
- **High (>80%):** ${generationResult.generatedTests.filter(t => t.confidence > 0.8).length}
- **Medium (60-80%):** ${generationResult.generatedTests.filter(t => t.confidence >= 0.6 && t.confidence <= 0.8).length}
- **Low (<60%):** ${generationResult.generatedTests.filter(t => t.confidence < 0.6).length}

## Coverage Analysis

### Current vs Expected Coverage
- **Functions:** ${generationResult.coverageAnalysis.currentCoverage.functions} → ${generationResult.coverageAnalysis.expectedCoverage.functions}
- **Improvement Potential:** ${generationResult.coverageAnalysis.improvementPotential} functions

### Uncovered Functions
${generationResult.coverageAnalysis.uncoveredFunctions.length > 0 ? 
  generationResult.coverageAnalysis.uncoveredFunctions.map(f => `- ${f}`).join('\n') : 
  'All functions are covered!'}

## Generated Tests

${generationResult.generatedTests.map(test => `
### ${test.name}

**Type:** ${test.type}
**Target:** ${test.targetFunction}
**Confidence:** ${(test.confidence * 100).toFixed(0)}%
**Description:** ${test.description}

\`\`\`${this.getLanguageForFramework(test.framework)}
${test.testCode}
\`\`\`
`).join('\n')}

## Recommendations

${generationResult.recommendations.map(rec => `
### ${rec.title} (${rec.priority.toUpperCase()})

**Category:** ${rec.category}
**Description:** ${rec.description}

**Action Items:**
${rec.actionItems.map(item => `- ${item}`).join('\n')}

${rec.examples?.after ? `**Example:**
\`\`\`javascript
${rec.examples.after}
\`\`\`` : ''}
`).join('\n')}

---
*Generated by Test Generator Agent v${this.version}*
    `.trim();

    return report;
  }

  // Helper methods
  private parseParameters(paramString: string): string[] {
    return paramString.split(',').map(p => p.trim()).filter(p => p.length > 0);
  }

  private isExported(name: string, codeContent: string): boolean {
    return codeContent.includes(`export { ${name}`) || 
           codeContent.includes(`export const ${name}`) ||
           codeContent.includes(`export function ${name}`) ||
           codeContent.includes(`export default ${name}`);
  }

  private calculateComplexity(codeContent: string): number {
    // Simple complexity calculation based on control structures
    const complexityPatterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /switch\s*\(/g,
      /catch\s*\(/g,
      /\?\s*.*\s*:/g // ternary operator
    ];

    return complexityPatterns.reduce((complexity, pattern) => {
      const matches = codeContent.match(pattern);
      return complexity + (matches ? matches.length : 0);
    }, 1); // Base complexity of 1
  }

  private extractDependencies(imports: ImportInfo[]): string[] {
    return imports.map(imp => imp.module);
  }

  private isWebApplication(codeContent: string): boolean {
    return codeContent.includes('React') || 
           codeContent.includes('Vue') || 
           codeContent.includes('document.') ||
           codeContent.includes('window.');
  }

  private isReactComponent(codeContent: string): boolean {
    return codeContent.includes('React') || codeContent.includes('jsx') || codeContent.includes('tsx');
  }

  private isVueComponent(codeContent: string): boolean {
    return codeContent.includes('Vue') || codeContent.includes('<template>');
  }

  private generateTestName(functionName: string, scenario: string): string {
    switch (this.configuration.testNamingConvention) {
      case 'should_when':
        return `should ${scenario} when called`;
      case 'test_function':
        return `test ${functionName} ${scenario}`;
      default:
        return scenario;
    }
  }

  private getScenarioDescription(scenario: string): string {
    const descriptions: Record<string, string> = {
      'happy_path': 'work correctly with valid input',
      'empty_input': 'handle empty input',
      'null_input': 'handle null input',
      'invalid_input': 'throw error with invalid input'
    };
    return descriptions[scenario] || scenario;
  }

  private getLanguageForFramework(framework: TestFramework): string {
    return 'javascript'; // Could be enhanced to return 'typescript' based on file extension
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private generateExecutionId(): string {
    return `test_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTestId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSuiteId(): string {
    return `suite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecommendationId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeGenerators(): void {
    // Initialize different test code generators
    // This would typically integrate with external test generation tools
    this.logger.info('Test Generator agent initialized', { 
      agentId: this.id,
      capabilities: this.capabilities 
    });
  }
}

// Supporting interfaces
interface CodeAnalysis {
  filePath: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: string[];
  complexity: number;
  dependencies: string[];
}

interface FunctionInfo {
  name: string;
  parameters: string[];
  type: 'function' | 'arrow' | 'method';
  isAsync: boolean;
  isExported: boolean;
  lineNumber: number;
}

interface ClassInfo {
  name: string;
  extends: string | null;
  methods: string[];
  isExported: boolean;
  lineNumber: number;
}

interface ImportInfo {
  module: string;
  imports: string[];
  type: 'named' | 'default' | 'namespace';
}

// Interface for external test code generator integration
export interface TestCodeGenerator {
  framework: TestFramework;
  generateTest(func: FunctionInfo, scenario: string): Promise<string>;
}

// Factory function to create Test Generator agent
export function createTestGeneratorAgent(
  id: UUID,
  config: Partial<TestGeneratorConfig> = {},
  logger: Logger
): TestGeneratorAgent {
  const defaultConfig: TestGeneratorConfig = {
    enableUnitTests: true,
    enableIntegrationTests: true,
    enableE2ETests: false,
    preferredFramework: TestFramework.JEST,
    coverageTarget: 80,
    generateMocks: true,
    generateSnapshots: false,
    includeEdgeCases: true,
    includeErrorCases: true,
    maxTestsPerFunction: 5,
    testNamingConvention: 'describe_it'
  };

  const finalConfig = { ...defaultConfig, ...config };
  
  return new TestGeneratorAgent(id, finalConfig, logger);
}