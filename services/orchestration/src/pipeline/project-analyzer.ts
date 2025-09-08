import { UUID } from '@devflow/shared-types';
import { ProjectAnalyzer, CodebaseAnalysis } from './interfaces';
import { ProjectCharacteristics } from './types';

export class IntelligentProjectAnalyzer implements ProjectAnalyzer {
  constructor(
    private projectRepository: any, // Would be injected
    private codeAnalysisService: any // Would be injected
  ) {}

  async analyzeProject(projectId: UUID): Promise<ProjectCharacteristics> {
    // Get project data from repository
    const project = await this.getProjectData(projectId);
    
    // Analyze codebase for each repository
    const codebaseAnalyses = await Promise.all(
      project.repositories.map((repo: any) => this.analyzeCodebase(repo.url))
    );
    
    // Aggregate analysis results
    const aggregatedAnalysis = this.aggregateCodebaseAnalyses(codebaseAnalyses);
    
    // Get team and deployment metrics
    const teamMetrics = await this.getTeamMetrics(project.teamId);
    const deploymentMetrics = await this.getDeploymentMetrics(projectId);
    
    return {
      projectId,
      languages: aggregatedAnalysis.languages.map(l => l.language),
      frameworks: aggregatedAnalysis.frameworks.map(f => f.framework),
      dependencies: aggregatedAnalysis.dependencies.map(d => d.name),
      repositorySize: this.calculateRepositorySize(codebaseAnalyses),
      teamSize: teamMetrics.size,
      deploymentFrequency: deploymentMetrics.frequency,
      testCoverage: aggregatedAnalysis.testCoverage,
      complexity: await this.getProjectComplexity(projectId),
      criticality: await this.getProjectCriticality(projectId),
      complianceRequirements: project.complianceRequirements || []
    };
  }

  async getProjectComplexity(projectId: UUID): Promise<'low' | 'medium' | 'high'> {
    const project = await this.getProjectData(projectId);
    const codebaseAnalyses = await Promise.all(
      project.repositories.map((repo: any) => this.analyzeCodebase(repo.url))
    );
    
    let complexityScore = 0;
    
    // Factor in number of languages
    const uniqueLanguages = new Set();
    codebaseAnalyses.forEach(analysis => {
      analysis.languages.forEach((lang: any) => uniqueLanguages.add(lang.language));
    });
    complexityScore += uniqueLanguages.size * 2;
    
    // Factor in number of frameworks
    const uniqueFrameworks = new Set();
    codebaseAnalyses.forEach(analysis => {
      analysis.frameworks.forEach((fw: any) => uniqueFrameworks.add(fw.framework));
    });
    complexityScore += uniqueFrameworks.size * 1.5;
    
    // Factor in codebase size
    const totalLinesOfCode = codebaseAnalyses.reduce((sum, analysis) => 
      sum + analysis.languages.reduce((langSum: number, lang: any) => langSum + lang.linesOfCode, 0), 0
    );
    
    if (totalLinesOfCode > 100000) complexityScore += 10;
    else if (totalLinesOfCode > 50000) complexityScore += 5;
    else if (totalLinesOfCode > 10000) complexityScore += 2;
    
    // Factor in cyclomatic complexity
    const avgCyclomaticComplexity = codebaseAnalyses.reduce((sum, analysis) => 
      sum + analysis.codeQuality.cyclomaticComplexity, 0
    ) / codebaseAnalyses.length;
    
    if (avgCyclomaticComplexity > 15) complexityScore += 8;
    else if (avgCyclomaticComplexity > 10) complexityScore += 4;
    else if (avgCyclomaticComplexity > 5) complexityScore += 2;
    
    // Factor in number of dependencies
    const totalDependencies = codebaseAnalyses.reduce((sum, analysis) => 
      sum + analysis.dependencies.length, 0
    );
    
    if (totalDependencies > 200) complexityScore += 6;
    else if (totalDependencies > 100) complexityScore += 3;
    else if (totalDependencies > 50) complexityScore += 1;
    
    // Determine complexity level
    if (complexityScore >= 20) return 'high';
    if (complexityScore >= 10) return 'medium';
    return 'low';
  }

  async getProjectCriticality(projectId: UUID): Promise<'low' | 'medium' | 'high'> {
    const project = await this.getProjectData(projectId);
    const deploymentMetrics = await this.getDeploymentMetrics(projectId);
    
    let criticalityScore = 0;
    
    // Factor in deployment frequency (higher = more critical)
    if (deploymentMetrics.frequency > 10) criticalityScore += 8; // Daily deployments
    else if (deploymentMetrics.frequency > 2) criticalityScore += 5; // Weekly deployments
    else if (deploymentMetrics.frequency > 0.5) criticalityScore += 2; // Monthly deployments
    
    // Factor in team size (larger teams = more critical)
    const teamMetrics = await this.getTeamMetrics(project.teamId);
    if (teamMetrics.size > 20) criticalityScore += 6;
    else if (teamMetrics.size > 10) criticalityScore += 4;
    else if (teamMetrics.size > 5) criticalityScore += 2;
    
    // Factor in compliance requirements
    const complianceRequirements = project.complianceRequirements || [];
    criticalityScore += complianceRequirements.length * 3;
    
    // Factor in production usage indicators
    if (project.metadata?.productionUsers > 10000) criticalityScore += 10;
    else if (project.metadata?.productionUsers > 1000) criticalityScore += 6;
    else if (project.metadata?.productionUsers > 100) criticalityScore += 3;
    
    // Factor in revenue impact
    if (project.metadata?.revenueImpact === 'high') criticalityScore += 8;
    else if (project.metadata?.revenueImpact === 'medium') criticalityScore += 4;
    
    // Determine criticality level
    if (criticalityScore >= 20) return 'high';
    if (criticalityScore >= 10) return 'medium';
    return 'low';
  }

  async analyzeCodebase(repositoryUrl: string): Promise<CodebaseAnalysis> {
    // This would integrate with actual code analysis tools
    // For now, returning mock data based on common patterns
    
    const mockAnalysis: CodebaseAnalysis = {
      languages: [
        { language: 'TypeScript', percentage: 70, linesOfCode: 15000, files: 150 },
        { language: 'JavaScript', percentage: 25, linesOfCode: 5000, files: 50 },
        { language: 'JSON', percentage: 5, linesOfCode: 1000, files: 20 }
      ],
      frameworks: [
        { framework: 'Express.js', version: '4.18.0', confidence: 0.95 },
        { framework: 'React', version: '18.2.0', confidence: 0.90 }
      ],
      dependencies: [
        { name: 'express', version: '4.18.0', type: 'production', vulnerabilities: 0, outdated: false },
        { name: 'react', version: '18.2.0', type: 'production', vulnerabilities: 0, outdated: false },
        { name: 'jest', version: '29.0.0', type: 'development', vulnerabilities: 0, outdated: true }
      ],
      testCoverage: 85,
      codeQuality: {
        maintainabilityIndex: 75,
        cyclomaticComplexity: 8,
        technicalDebt: 2.5,
        duplicatedLines: 150
      },
      securityIssues: [
        {
          type: 'dependency_vulnerability',
          severity: 'medium',
          file: 'package.json',
          line: 1,
          description: 'Outdated dependency with known vulnerabilities'
        }
      ],
      complexity: {
        overall: 'medium',
        cognitive: 12,
        cyclomatic: 8,
        halstead: 1200
      }
    };
    
    return mockAnalysis;
  }

  private async getProjectData(projectId: UUID): Promise<any> {
    // Mock project data - would come from actual project repository
    return {
      id: projectId,
      name: 'Sample Project',
      teamId: 'team-123' as UUID,
      repositories: [
        {
          id: 'repo-1' as UUID,
          url: 'https://github.com/example/repo',
          provider: 'github'
        }
      ],
      complianceRequirements: ['SOC2', 'GDPR'],
      metadata: {
        productionUsers: 5000,
        revenueImpact: 'medium'
      }
    };
  }

  private async getTeamMetrics(teamId: UUID): Promise<{ size: number }> {
    // Mock team metrics - would come from team service
    return { size: 8 };
  }

  private async getDeploymentMetrics(projectId: UUID): Promise<{ frequency: number }> {
    // Mock deployment metrics - would come from analytics service
    return { frequency: 3.5 }; // deployments per week
  }

  private aggregateCodebaseAnalyses(analyses: CodebaseAnalysis[]): CodebaseAnalysis {
    if (analyses.length === 0) {
      throw new Error('No codebase analyses provided');
    }
    
    if (analyses.length === 1) {
      return analyses[0];
    }
    
    // Aggregate languages
    const languageMap = new Map<string, { percentage: number; linesOfCode: number; files: number }>();
    let totalLinesOfCode = 0;
    let totalFiles = 0;
    
    analyses.forEach(analysis => {
      analysis.languages.forEach(lang => {
        const existing = languageMap.get(lang.language) || { percentage: 0, linesOfCode: 0, files: 0 };
        languageMap.set(lang.language, {
          percentage: 0, // Will calculate after
          linesOfCode: existing.linesOfCode + lang.linesOfCode,
          files: existing.files + lang.files
        });
        totalLinesOfCode += lang.linesOfCode;
        totalFiles += lang.files;
      });
    });
    
    // Calculate percentages
    const languages = Array.from(languageMap.entries()).map(([language, data]) => ({
      language,
      percentage: (data.linesOfCode / totalLinesOfCode) * 100,
      linesOfCode: data.linesOfCode,
      files: data.files
    }));
    
    // Aggregate frameworks (unique)
    const frameworkMap = new Map<string, { version: string; confidence: number }>();
    analyses.forEach(analysis => {
      analysis.frameworks.forEach(fw => {
        const existing = frameworkMap.get(fw.framework);
        if (!existing || fw.confidence > existing.confidence) {
          frameworkMap.set(fw.framework, { version: fw.version, confidence: fw.confidence });
        }
      });
    });
    
    const frameworks = Array.from(frameworkMap.entries()).map(([framework, data]) => ({
      framework,
      version: data.version,
      confidence: data.confidence
    }));
    
    // Aggregate dependencies (unique by name, highest version)
    const dependencyMap = new Map<string, any>();
    analyses.forEach(analysis => {
      analysis.dependencies.forEach(dep => {
        const existing = dependencyMap.get(dep.name);
        if (!existing || this.compareVersions(dep.version, existing.version) > 0) {
          dependencyMap.set(dep.name, dep);
        }
      });
    });
    
    const dependencies = Array.from(dependencyMap.values());
    
    // Average test coverage
    const avgTestCoverage = analyses.reduce((sum, analysis) => sum + analysis.testCoverage, 0) / analyses.length;
    
    // Aggregate code quality metrics
    const avgCodeQuality = {
      maintainabilityIndex: analyses.reduce((sum, a) => sum + a.codeQuality.maintainabilityIndex, 0) / analyses.length,
      cyclomaticComplexity: analyses.reduce((sum, a) => sum + a.codeQuality.cyclomaticComplexity, 0) / analyses.length,
      technicalDebt: analyses.reduce((sum, a) => sum + a.codeQuality.technicalDebt, 0) / analyses.length,
      duplicatedLines: analyses.reduce((sum, a) => sum + a.codeQuality.duplicatedLines, 0)
    };
    
    // Aggregate security issues
    const allSecurityIssues = analyses.flatMap(analysis => analysis.securityIssues);
    
    // Aggregate complexity
    const avgComplexity = {
      overall: this.determineOverallComplexity(analyses.map(a => a.complexity.overall)),
      cognitive: analyses.reduce((sum, a) => sum + a.complexity.cognitive, 0) / analyses.length,
      cyclomatic: analyses.reduce((sum, a) => sum + a.complexity.cyclomatic, 0) / analyses.length,
      halstead: analyses.reduce((sum, a) => sum + a.complexity.halstead, 0) / analyses.length
    };
    
    return {
      languages,
      frameworks,
      dependencies,
      testCoverage: avgTestCoverage,
      codeQuality: avgCodeQuality,
      securityIssues: allSecurityIssues,
      complexity: avgComplexity
    };
  }

  private calculateRepositorySize(analyses: CodebaseAnalysis[]): number {
    return analyses.reduce((sum, analysis) => 
      sum + analysis.languages.reduce((langSum, lang) => langSum + lang.linesOfCode, 0), 0
    );
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }

  private determineOverallComplexity(complexities: string[]): 'low' | 'medium' | 'high' {
    const complexityScores = complexities.map(c => {
      switch (c) {
        case 'low': return 1;
        case 'medium': return 2;
        case 'high': return 3;
        default: return 2;
      }
    });
    
    const avgScore = complexityScores.reduce((sum, score) => sum + score, 0) / complexityScores.length;
    
    if (avgScore >= 2.5) return 'high';
    if (avgScore >= 1.5) return 'medium';
    return 'low';
  }
}