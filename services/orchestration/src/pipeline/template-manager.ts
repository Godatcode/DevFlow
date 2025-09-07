import { UUID } from '@devflow/shared-types';
import { v4 as uuidv4 } from 'uuid';
import { PipelineTemplateManager } from './interfaces';
import {
  PipelineTemplate,
  ProjectCharacteristics,
  PipelineType,
  PipelineStage,
  PipelineStageConfig
} from './types';

export class DefaultPipelineTemplateManager implements PipelineTemplateManager {
  private templates: Map<UUID, PipelineTemplate> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
  }

  async getTemplates(): Promise<PipelineTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getTemplateById(id: UUID): Promise<PipelineTemplate | null> {
    return this.templates.get(id) || null;
  }

  async createTemplate(template: Omit<PipelineTemplate, 'id'>): Promise<PipelineTemplate> {
    const newTemplate: PipelineTemplate = {
      ...template,
      id: uuidv4() as UUID
    };
    
    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  async updateTemplate(id: UUID, template: Partial<PipelineTemplate>): Promise<PipelineTemplate> {
    const existing = this.templates.get(id);
    if (!existing) {
      throw new Error(`Template with id ${id} not found`);
    }
    
    const updated = { ...existing, ...template };
    this.templates.set(id, updated);
    return updated;
  }

  async deleteTemplate(id: UUID): Promise<void> {
    this.templates.delete(id);
  }

  async findMatchingTemplates(characteristics: ProjectCharacteristics): Promise<PipelineTemplate[]> {
    const templates = Array.from(this.templates.values());
    
    return templates.filter(template => 
      this.isTemplateCompatible(template, characteristics)
    ).sort((a, b) => 
      this.calculateCompatibilityScore(b, characteristics) - 
      this.calculateCompatibilityScore(a, characteristics)
    );
  }

  private initializeDefaultTemplates(): void {
    // Node.js/TypeScript template
    this.templates.set(uuidv4() as UUID, {
      id: uuidv4() as UUID,
      name: 'Node.js CI/CD Pipeline',
      description: 'Standard CI/CD pipeline for Node.js/TypeScript projects',
      type: PipelineType.FULL_CICD,
      stages: [
        {
          stage: PipelineStage.BUILD,
          name: 'Build Application',
          commands: ['npm ci', 'npm run build'],
          environment: { NODE_ENV: 'production' },
          timeout: 600,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: false,
          required: true
        },
        {
          stage: PipelineStage.UNIT_TEST,
          name: 'Unit Tests',
          commands: ['npm run test:unit'],
          environment: { NODE_ENV: 'test' },
          timeout: 300,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        },
        {
          stage: PipelineStage.SECURITY_SCAN,
          name: 'Security Audit',
          commands: ['npm audit --audit-level=moderate', 'npx snyk test'],
          environment: {},
          timeout: 180,
          retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        },
        {
          stage: PipelineStage.INTEGRATION_TEST,
          name: 'Integration Tests',
          commands: ['npm run test:integration'],
          environment: { NODE_ENV: 'test' },
          timeout: 600,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'exponential' },
          conditions: [],
          parallelizable: false,
          required: true
        },
        {
          stage: PipelineStage.QUALITY_GATE,
          name: 'Quality Gate',
          commands: ['npm run lint', 'npm run test:coverage'],
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
          commands: ['npm run deploy:staging'],
          environment: { ENVIRONMENT: 'staging' },
          timeout: 900,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'exponential' },
          conditions: [
            { type: 'branch', condition: 'equals', value: 'develop' }
          ],
          parallelizable: false,
          required: true
        },
        {
          stage: PipelineStage.E2E_TEST,
          name: 'End-to-End Tests',
          commands: ['npm run test:e2e'],
          environment: { TEST_ENV: 'staging' },
          timeout: 1200,
          retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: false,
          required: false
        },
        {
          stage: PipelineStage.DEPLOY_PRODUCTION,
          name: 'Deploy to Production',
          commands: ['npm run deploy:production'],
          environment: { ENVIRONMENT: 'production' },
          timeout: 1200,
          retryConfig: { maxAttempts: 3, backoffStrategy: 'exponential' },
          conditions: [
            { type: 'branch', condition: 'equals', value: 'main' }
          ],
          parallelizable: false,
          required: true
        }
      ],
      applicableCharacteristics: {
        projectId: '' as UUID,
        languages: ['javascript', 'typescript'],
        frameworks: ['express', 'nestjs', 'react', 'vue', 'angular'],
        dependencies: ['package.json'],
        repositorySize: 0,
        teamSize: 0,
        deploymentFrequency: 0,
        testCoverage: 0,
        complexity: 'medium',
        criticality: 'medium',
        complianceRequirements: []
      },
      metadata: {
        category: 'web-application',
        popularity: 95,
        maintainer: 'devflow-ai'
      }
    });

    // Python template
    this.templates.set(uuidv4() as UUID, {
      id: uuidv4() as UUID,
      name: 'Python CI/CD Pipeline',
      description: 'Standard CI/CD pipeline for Python projects',
      type: PipelineType.FULL_CICD,
      stages: [
        {
          stage: PipelineStage.BUILD,
          name: 'Setup Environment',
          commands: ['python -m pip install --upgrade pip', 'pip install -r requirements.txt'],
          environment: { PYTHON_VERSION: '3.9' },
          timeout: 600,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: false,
          required: true
        },
        {
          stage: PipelineStage.UNIT_TEST,
          name: 'Unit Tests',
          commands: ['pytest tests/unit/ -v --cov=src'],
          environment: { PYTHONPATH: 'src' },
          timeout: 300,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        },
        {
          stage: PipelineStage.SECURITY_SCAN,
          name: 'Security Scan',
          commands: ['safety check', 'bandit -r src/'],
          environment: {},
          timeout: 180,
          retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        },
        {
          stage: PipelineStage.QUALITY_GATE,
          name: 'Code Quality',
          commands: ['flake8 src/', 'pylint src/', 'mypy src/'],
          environment: {},
          timeout: 300,
          retryConfig: { maxAttempts: 1, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        }
      ],
      applicableCharacteristics: {
        projectId: '' as UUID,
        languages: ['python'],
        frameworks: ['django', 'flask', 'fastapi'],
        dependencies: ['requirements.txt', 'pyproject.toml'],
        repositorySize: 0,
        teamSize: 0,
        deploymentFrequency: 0,
        testCoverage: 0,
        complexity: 'medium',
        criticality: 'medium',
        complianceRequirements: []
      },
      metadata: {
        category: 'python-application',
        popularity: 85,
        maintainer: 'devflow-ai'
      }
    });

    // Microservice template
    this.templates.set(uuidv4() as UUID, {
      id: uuidv4() as UUID,
      name: 'Microservice Pipeline',
      description: 'Optimized pipeline for microservice architectures',
      type: PipelineType.FULL_CICD,
      stages: [
        {
          stage: PipelineStage.BUILD,
          name: 'Build Service',
          commands: ['docker build -t service:latest .'],
          environment: {},
          timeout: 900,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: false,
          required: true
        },
        {
          stage: PipelineStage.UNIT_TEST,
          name: 'Unit Tests',
          commands: ['docker run --rm service:latest npm test'],
          environment: {},
          timeout: 300,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'linear' },
          conditions: [],
          parallelizable: true,
          required: true
        },
        {
          stage: PipelineStage.SECURITY_SCAN,
          name: 'Container Security Scan',
          commands: ['trivy image service:latest', 'docker scout cves service:latest'],
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
          commands: ['kubectl apply -f k8s/staging/', 'kubectl rollout status deployment/service-staging'],
          environment: { KUBECONFIG: '/staging/kubeconfig' },
          timeout: 600,
          retryConfig: { maxAttempts: 2, backoffStrategy: 'exponential' },
          conditions: [],
          parallelizable: false,
          required: true
        }
      ],
      applicableCharacteristics: {
        projectId: '' as UUID,
        languages: ['javascript', 'typescript', 'python', 'java'],
        frameworks: ['express', 'spring-boot', 'fastapi'],
        dependencies: ['Dockerfile', 'docker-compose.yml'],
        repositorySize: 0,
        teamSize: 0,
        deploymentFrequency: 0,
        testCoverage: 0,
        complexity: 'high',
        criticality: 'high',
        complianceRequirements: []
      },
      metadata: {
        category: 'microservice',
        popularity: 75,
        maintainer: 'devflow-ai'
      }
    });
  }

  private isTemplateCompatible(template: PipelineTemplate, characteristics: ProjectCharacteristics): boolean {
    // Check language compatibility
    const hasCompatibleLanguage = template.applicableCharacteristics.languages.some(lang =>
      characteristics.languages.includes(lang)
    );
    
    if (!hasCompatibleLanguage) return false;

    // Check framework compatibility
    if (template.applicableCharacteristics.frameworks.length > 0) {
      const hasCompatibleFramework = template.applicableCharacteristics.frameworks.some(framework =>
        characteristics.frameworks.includes(framework)
      );
      
      if (!hasCompatibleFramework) return false;
    }

    // Check complexity compatibility
    const complexityMatch = this.isComplexityCompatible(
      template.applicableCharacteristics.complexity,
      characteristics.complexity
    );
    
    return complexityMatch;
  }

  private calculateCompatibilityScore(template: PipelineTemplate, characteristics: ProjectCharacteristics): number {
    let score = 0;

    // Language match score
    const languageMatches = template.applicableCharacteristics.languages.filter(lang =>
      characteristics.languages.includes(lang)
    ).length;
    score += languageMatches * 10;

    // Framework match score
    const frameworkMatches = template.applicableCharacteristics.frameworks.filter(framework =>
      characteristics.frameworks.includes(framework)
    ).length;
    score += frameworkMatches * 5;

    // Complexity match score
    if (template.applicableCharacteristics.complexity === characteristics.complexity) {
      score += 15;
    }

    // Criticality match score
    if (template.applicableCharacteristics.criticality === characteristics.criticality) {
      score += 10;
    }

    // Popularity bonus
    score += (template.metadata.popularity || 0) * 0.1;

    return score;
  }

  private isComplexityCompatible(templateComplexity: string, projectComplexity: string): boolean {
    const complexityLevels = { low: 1, medium: 2, high: 3 };
    const templateLevel = complexityLevels[templateComplexity as keyof typeof complexityLevels];
    const projectLevel = complexityLevels[projectComplexity as keyof typeof complexityLevels];
    
    // Template can handle same or lower complexity
    return templateLevel >= projectLevel;
  }
}