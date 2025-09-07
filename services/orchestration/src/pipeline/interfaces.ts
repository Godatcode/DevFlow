import { UUID } from '@devflow/shared-types';
import {
  ProjectCharacteristics,
  PipelineTemplate,
  GeneratedPipeline,
  PipelineGenerationRequest,
  TestingStrategy,
  PipelineOptimization
} from './types';

export interface PipelineGenerator {
  generatePipeline(request: PipelineGenerationRequest): Promise<GeneratedPipeline>;
  optimizePipeline(pipeline: GeneratedPipeline): Promise<GeneratedPipeline>;
  validatePipeline(pipeline: GeneratedPipeline): Promise<PipelineValidationResult>;
  estimateDuration(pipeline: GeneratedPipeline): Promise<number>;
}

export interface PipelineTemplateManager {
  getTemplates(): Promise<PipelineTemplate[]>;
  getTemplateById(id: UUID): Promise<PipelineTemplate | null>;
  createTemplate(template: Omit<PipelineTemplate, 'id'>): Promise<PipelineTemplate>;
  updateTemplate(id: UUID, template: Partial<PipelineTemplate>): Promise<PipelineTemplate>;
  deleteTemplate(id: UUID): Promise<void>;
  findMatchingTemplates(characteristics: ProjectCharacteristics): Promise<PipelineTemplate[]>;
}

export interface ProjectAnalyzer {
  analyzeProject(projectId: UUID): Promise<ProjectCharacteristics>;
  getProjectComplexity(projectId: UUID): Promise<'low' | 'medium' | 'high'>;
  getProjectCriticality(projectId: UUID): Promise<'low' | 'medium' | 'high'>;
  analyzeCodebase(repositoryUrl: string): Promise<CodebaseAnalysis>;
}

export interface TestingStrategySelector {
  selectStrategy(characteristics: ProjectCharacteristics): Promise<TestingStrategy>;
  getRecommendedTestTypes(characteristics: ProjectCharacteristics): Promise<string[]>;
  estimateTestDuration(strategy: TestingStrategy, characteristics: ProjectCharacteristics): Promise<number>;
}

export interface PipelineOptimizer {
  optimizeForSpeed(pipeline: GeneratedPipeline): Promise<PipelineOptimization[]>;
  optimizeForResources(pipeline: GeneratedPipeline): Promise<PipelineOptimization[]>;
  optimizeForReliability(pipeline: GeneratedPipeline): Promise<PipelineOptimization[]>;
  applyOptimizations(pipeline: GeneratedPipeline, optimizations: PipelineOptimization[]): Promise<GeneratedPipeline>;
}

export interface PipelineValidationResult {
  isValid: boolean;
  errors: PipelineValidationError[];
  warnings: PipelineValidationWarning[];
  suggestions: PipelineValidationSuggestion[];
}

export interface PipelineValidationError {
  stage: string;
  field: string;
  message: string;
  code: string;
}

export interface PipelineValidationWarning {
  stage: string;
  field: string;
  message: string;
  code: string;
}

export interface PipelineValidationSuggestion {
  stage: string;
  type: 'optimization' | 'best_practice' | 'security';
  message: string;
  impact: 'low' | 'medium' | 'high';
}

export interface CodebaseAnalysis {
  languages: LanguageAnalysis[];
  frameworks: FrameworkAnalysis[];
  dependencies: DependencyAnalysis[];
  testCoverage: number;
  codeQuality: CodeQualityMetrics;
  securityIssues: SecurityIssue[];
  complexity: ComplexityMetrics;
}

export interface LanguageAnalysis {
  language: string;
  percentage: number;
  linesOfCode: number;
  files: number;
}

export interface FrameworkAnalysis {
  framework: string;
  version: string;
  confidence: number;
}

export interface DependencyAnalysis {
  name: string;
  version: string;
  type: 'production' | 'development';
  vulnerabilities: number;
  outdated: boolean;
}

export interface CodeQualityMetrics {
  maintainabilityIndex: number;
  cyclomaticComplexity: number;
  technicalDebt: number;
  duplicatedLines: number;
}

export interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line: number;
  description: string;
}

export interface ComplexityMetrics {
  overall: 'low' | 'medium' | 'high';
  cognitive: number;
  cyclomatic: number;
  halstead: number;
}