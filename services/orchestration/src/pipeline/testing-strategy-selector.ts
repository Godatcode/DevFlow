import { TestingStrategySelector } from './interfaces';
import { ProjectCharacteristics, TestingStrategy } from './types';

export class IntelligentTestingStrategySelector implements TestingStrategySelector {
  async selectStrategy(characteristics: ProjectCharacteristics): Promise<TestingStrategy> {
    let strategyScore = {
      [TestingStrategy.UNIT_ONLY]: 0,
      [TestingStrategy.INTEGRATION_FOCUSED]: 0,
      [TestingStrategy.E2E_HEAVY]: 0,
      [TestingStrategy.BALANCED]: 0,
      [TestingStrategy.PERFORMANCE_FOCUSED]: 0
    };

    // Factor in project complexity
    switch (characteristics.complexity) {
      case 'low':
        strategyScore[TestingStrategy.UNIT_ONLY] += 15;
        strategyScore[TestingStrategy.BALANCED] += 10;
        break;
      case 'medium':
        strategyScore[TestingStrategy.BALANCED] += 20;
        strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 15;
        break;
      case 'high':
        strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 20;
        strategyScore[TestingStrategy.E2E_HEAVY] += 15;
        break;
    }

    // Factor in project criticality
    switch (characteristics.criticality) {
      case 'low':
        strategyScore[TestingStrategy.UNIT_ONLY] += 10;
        strategyScore[TestingStrategy.BALANCED] += 5;
        break;
      case 'medium':
        strategyScore[TestingStrategy.BALANCED] += 15;
        strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 10;
        break;
      case 'high':
        strategyScore[TestingStrategy.E2E_HEAVY] += 20;
        strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 15;
        break;
    }

    // Factor in team size
    if (characteristics.teamSize > 15) {
      // Large teams benefit from comprehensive testing
      strategyScore[TestingStrategy.E2E_HEAVY] += 10;
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 8;
    } else if (characteristics.teamSize > 8) {
      // Medium teams benefit from balanced approach
      strategyScore[TestingStrategy.BALANCED] += 12;
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 8;
    } else {
      // Small teams may prefer simpler strategies
      strategyScore[TestingStrategy.UNIT_ONLY] += 8;
      strategyScore[TestingStrategy.BALANCED] += 6;
    }

    // Factor in deployment frequency
    if (characteristics.deploymentFrequency > 5) {
      // High deployment frequency needs fast feedback
      strategyScore[TestingStrategy.UNIT_ONLY] += 12;
      strategyScore[TestingStrategy.BALANCED] += 8;
    } else if (characteristics.deploymentFrequency > 1) {
      // Regular deployments benefit from balanced testing
      strategyScore[TestingStrategy.BALANCED] += 15;
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 10;
    } else {
      // Infrequent deployments can afford comprehensive testing
      strategyScore[TestingStrategy.E2E_HEAVY] += 12;
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 10;
    }

    // Factor in current test coverage
    if (characteristics.testCoverage > 80) {
      // High coverage suggests mature testing practices
      strategyScore[TestingStrategy.BALANCED] += 10;
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 8;
    } else if (characteristics.testCoverage > 60) {
      // Medium coverage suggests room for improvement
      strategyScore[TestingStrategy.BALANCED] += 12;
      strategyScore[TestingStrategy.UNIT_ONLY] += 8;
    } else {
      // Low coverage suggests starting with unit tests
      strategyScore[TestingStrategy.UNIT_ONLY] += 15;
      strategyScore[TestingStrategy.BALANCED] += 5;
    }

    // Factor in languages and frameworks
    const hasWebFramework = characteristics.frameworks.some(fw => 
      ['react', 'vue', 'angular', 'express', 'nestjs', 'django', 'flask'].includes(fw.toLowerCase())
    );
    
    if (hasWebFramework) {
      // Web applications benefit from E2E testing
      strategyScore[TestingStrategy.E2E_HEAVY] += 8;
      strategyScore[TestingStrategy.BALANCED] += 6;
    }

    const hasMicroserviceIndicators = characteristics.frameworks.some(fw =>
      ['express', 'nestjs', 'spring-boot', 'fastapi'].includes(fw.toLowerCase())
    ) || characteristics.dependencies.includes('docker');

    if (hasMicroserviceIndicators) {
      // Microservices benefit from integration testing
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 12;
      strategyScore[TestingStrategy.BALANCED] += 8;
    }

    // Factor in compliance requirements
    if (characteristics.complianceRequirements.length > 0) {
      // Compliance requires comprehensive testing
      strategyScore[TestingStrategy.E2E_HEAVY] += 10;
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 8;
    }

    // Performance-focused strategy for specific indicators
    const hasPerformanceIndicators = characteristics.languages.includes('java') ||
      characteristics.languages.includes('c++') ||
      characteristics.frameworks.some(fw => fw.toLowerCase().includes('performance'));

    if (hasPerformanceIndicators && characteristics.criticality === 'high') {
      strategyScore[TestingStrategy.PERFORMANCE_FOCUSED] += 15;
    }

    // Repository size factor
    if (characteristics.repositorySize > 100000) {
      // Large codebases need comprehensive testing
      strategyScore[TestingStrategy.INTEGRATION_FOCUSED] += 8;
      strategyScore[TestingStrategy.E2E_HEAVY] += 6;
    } else if (characteristics.repositorySize < 10000) {
      // Small codebases can start simple
      strategyScore[TestingStrategy.UNIT_ONLY] += 8;
      strategyScore[TestingStrategy.BALANCED] += 6;
    }

    // Find the strategy with the highest score
    const selectedStrategy = Object.entries(strategyScore).reduce((max, [strategy, score]) => 
      score > max.score ? { strategy: strategy as TestingStrategy, score } : max,
      { strategy: TestingStrategy.BALANCED, score: 0 }
    ).strategy;

    return selectedStrategy;
  }

  async getRecommendedTestTypes(characteristics: ProjectCharacteristics): Promise<string[]> {
    const testTypes: string[] = ['unit'];
    
    // Always recommend unit tests as baseline
    
    // Add integration tests for complex or critical projects
    if (characteristics.complexity !== 'low' || characteristics.criticality !== 'low') {
      testTypes.push('integration');
    }
    
    // Add E2E tests for web applications or high criticality
    const hasWebFramework = characteristics.frameworks.some(fw => 
      ['react', 'vue', 'angular', 'express', 'nestjs', 'django', 'flask'].includes(fw.toLowerCase())
    );
    
    if (hasWebFramework || characteristics.criticality === 'high') {
      testTypes.push('e2e');
    }
    
    // Add performance tests for performance-critical applications
    const hasPerformanceIndicators = characteristics.languages.includes('java') ||
      characteristics.languages.includes('c++') ||
      characteristics.criticality === 'high';
      
    if (hasPerformanceIndicators) {
      testTypes.push('performance');
    }
    
    // Add security tests for compliance requirements
    if (characteristics.complianceRequirements.length > 0) {
      testTypes.push('security');
    }
    
    // Add contract tests for microservices
    const hasMicroserviceIndicators = characteristics.frameworks.some(fw =>
      ['express', 'nestjs', 'spring-boot', 'fastapi'].includes(fw.toLowerCase())
    );
    
    if (hasMicroserviceIndicators) {
      testTypes.push('contract');
    }
    
    return testTypes;
  }

  async estimateTestDuration(
    strategy: TestingStrategy, 
    characteristics: ProjectCharacteristics
  ): Promise<number> {
    let baseDuration = 0;
    
    // Base duration by strategy
    switch (strategy) {
      case TestingStrategy.UNIT_ONLY:
        baseDuration = 300; // 5 minutes
        break;
      case TestingStrategy.BALANCED:
        baseDuration = 900; // 15 minutes
        break;
      case TestingStrategy.INTEGRATION_FOCUSED:
        baseDuration = 1200; // 20 minutes
        break;
      case TestingStrategy.E2E_HEAVY:
        baseDuration = 1800; // 30 minutes
        break;
      case TestingStrategy.PERFORMANCE_FOCUSED:
        baseDuration = 2400; // 40 minutes
        break;
    }
    
    // Adjust for project size
    const sizeMultiplier = this.getSizeMultiplier(characteristics.repositorySize);
    baseDuration *= sizeMultiplier;
    
    // Adjust for complexity
    const complexityMultiplier = this.getComplexityMultiplier(characteristics.complexity);
    baseDuration *= complexityMultiplier;
    
    // Adjust for test coverage (higher coverage = more tests = longer duration)
    const coverageMultiplier = 1 + (characteristics.testCoverage / 100) * 0.5;
    baseDuration *= coverageMultiplier;
    
    // Adjust for team size (larger teams may have more comprehensive tests)
    const teamMultiplier = Math.min(1 + (characteristics.teamSize / 20), 1.5);
    baseDuration *= teamMultiplier;
    
    return Math.round(baseDuration);
  }

  private getSizeMultiplier(repositorySize: number): number {
    if (repositorySize > 500000) return 2.0;
    if (repositorySize > 100000) return 1.5;
    if (repositorySize > 50000) return 1.3;
    if (repositorySize > 10000) return 1.1;
    return 1.0;
  }

  private getComplexityMultiplier(complexity: 'low' | 'medium' | 'high'): number {
    switch (complexity) {
      case 'low': return 0.8;
      case 'medium': return 1.0;
      case 'high': return 1.4;
      default: return 1.0;
    }
  }
}