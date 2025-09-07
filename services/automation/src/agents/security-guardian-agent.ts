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

export interface SecurityScanResult {
  vulnerabilities: Vulnerability[];
  securityScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: SecurityRecommendation[];
  scanDuration: number;
}

export interface Vulnerability {
  id: string;
  type: VulnerabilityType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location: {
    file: string;
    line?: number;
    column?: number;
  };
  cwe?: string; // Common Weakness Enumeration
  cvss?: number; // Common Vulnerability Scoring System
  remediation: string;
}

export enum VulnerabilityType {
  SQL_INJECTION = 'sql_injection',
  XSS = 'xss',
  CSRF = 'csrf',
  INSECURE_CRYPTO = 'insecure_crypto',
  HARDCODED_SECRETS = 'hardcoded_secrets',
  INSECURE_DEPENDENCIES = 'insecure_dependencies',
  AUTHENTICATION_BYPASS = 'authentication_bypass',
  AUTHORIZATION_FLAW = 'authorization_flaw',
  DATA_EXPOSURE = 'data_exposure',
  INJECTION_FLAW = 'injection_flaw'
}

export interface SecurityRecommendation {
  id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'code' | 'dependency' | 'configuration' | 'architecture';
  title: string;
  description: string;
  actionItems: string[];
  estimatedEffort: string;
  references: string[];
}

export interface SecurityScanConfig {
  enableStaticAnalysis: boolean;
  enableDependencyScanning: boolean;
  enableSecretsScanning: boolean;
  enableLicenseScanning: boolean;
  customRules: SecurityRule[];
  excludePatterns: string[];
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: VulnerabilityType;
}

export class SecurityGuardianAgent implements AIAgent {
  public readonly id: UUID;
  public readonly name: string = 'Security Guardian';
  public readonly type: AgentType = AgentType.SECURITY_GUARDIAN;
  public readonly version: string = '1.0.0';
  public readonly capabilities: AgentCapability[] = [
    AgentCapability.VULNERABILITY_SCANNING,
    AgentCapability.CODE_ANALYSIS
  ];
  public readonly configuration: SecurityScanConfig;
  public isActive: boolean = true;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private logger: Logger;
  private scanners: Map<string, SecurityScanner> = new Map();

  constructor(
    id: UUID,
    config: SecurityScanConfig,
    logger: Logger
  ) {
    this.id = id;
    this.configuration = config;
    this.logger = logger;
    this.createdAt = new Date();
    this.updatedAt = new Date();

    this.initializeScanners();
  }

  async execute(context: AgentContext, input: AgentInput): Promise<AgentResult> {
    const executionId = this.generateExecutionId();
    const startTime = new Date();

    this.logger.info('Starting security scan', { 
      executionId, 
      agentId: this.id,
      workflowId: context.workflowId,
      projectId: context.projectId 
    });

    try {
      const scanResult = await this.performSecurityScan(context, input);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Generate security report
      const report = await this.generateSecurityReport(scanResult, context);

      const result: AgentResult = {
        executionId,
        status: ExecutionStatus.COMPLETED,
        output: {
          success: true,
          data: {
            scanResult,
            report,
            summary: {
              totalVulnerabilities: scanResult.vulnerabilities.length,
              criticalVulnerabilities: scanResult.vulnerabilities.filter(v => v.severity === 'critical').length,
              highVulnerabilities: scanResult.vulnerabilities.filter(v => v.severity === 'high').length,
              securityScore: scanResult.securityScore,
              riskLevel: scanResult.riskLevel
            }
          },
          metrics: {
            scanDuration: duration,
            vulnerabilitiesFound: scanResult.vulnerabilities.length,
            securityScore: scanResult.securityScore
          },
          recommendations: scanResult.recommendations.map(r => r.description)
        },
        duration,
        startTime,
        endTime
      };

      this.logger.info('Security scan completed', { 
        executionId,
        vulnerabilitiesFound: scanResult.vulnerabilities.length,
        securityScore: scanResult.securityScore,
        duration 
      });

      return result;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error('Security scan failed', { 
        executionId,
        error: error.message,
        duration 
      });

      return {
        executionId,
        status: ExecutionStatus.FAILED,
        output: {
          success: false,
          data: null,
          metrics: {
            scanDuration: duration,
            vulnerabilitiesFound: 0,
            securityScore: 0
          },
          error: error.message
        },
        duration,
        startTime,
        endTime
      };
    }
  }

  private async performSecurityScan(
    context: AgentContext, 
    input: AgentInput
  ): Promise<SecurityScanResult> {
    const scanStartTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];
    const recommendations: SecurityRecommendation[] = [];

    // Static code analysis
    if (this.configuration.enableStaticAnalysis) {
      const staticVulns = await this.performStaticAnalysis(input);
      vulnerabilities.push(...staticVulns);
    }

    // Dependency scanning
    if (this.configuration.enableDependencyScanning) {
      const depVulns = await this.performDependencyScanning(input);
      vulnerabilities.push(...depVulns);
    }

    // Secrets scanning
    if (this.configuration.enableSecretsScanning) {
      const secretVulns = await this.performSecretsScanning(input);
      vulnerabilities.push(...secretVulns);
    }

    // Generate recommendations based on findings
    recommendations.push(...this.generateRecommendations(vulnerabilities));

    // Calculate security score and risk level
    const securityScore = this.calculateSecurityScore(vulnerabilities);
    const riskLevel = this.determineRiskLevel(vulnerabilities, securityScore);

    const scanDuration = Date.now() - scanStartTime;

    return {
      vulnerabilities,
      securityScore,
      riskLevel,
      recommendations,
      scanDuration
    };
  }

  private async performStaticAnalysis(input: AgentInput): Promise<Vulnerability[]> {
    this.logger.debug('Performing static code analysis');
    
    const vulnerabilities: Vulnerability[] = [];
    const codeContent = input.parameters.codeContent as string || '';
    const filePath = input.parameters.filePath as string || 'unknown';

    // Simulate static analysis patterns
    const patterns = [
      {
        pattern: /eval\s*\(/gi,
        type: VulnerabilityType.INJECTION_FLAW,
        severity: 'high' as const,
        title: 'Use of eval() function',
        description: 'The eval() function can execute arbitrary code and is a security risk'
      },
      {
        pattern: /document\.write\s*\(/gi,
        type: VulnerabilityType.XSS,
        severity: 'medium' as const,
        title: 'Use of document.write()',
        description: 'document.write() can lead to XSS vulnerabilities'
      },
      {
        pattern: /(password|secret|key|token)\s*=\s*["'][^"']+["']/gi,
        type: VulnerabilityType.HARDCODED_SECRETS,
        severity: 'critical' as const,
        title: 'Hardcoded secrets detected',
        description: 'Hardcoded secrets should not be stored in source code'
      },
      {
        pattern: /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*\+/gi,
        type: VulnerabilityType.SQL_INJECTION,
        severity: 'high' as const,
        title: 'Potential SQL injection',
        description: 'SQL queries should use parameterized statements'
      }
    ];

    for (const rule of patterns) {
      const matches = Array.from(codeContent.matchAll(rule.pattern));
      for (const match of matches) {
        vulnerabilities.push({
          id: this.generateVulnerabilityId(),
          type: rule.type,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          location: {
            file: filePath,
            line: this.getLineNumber(codeContent, match.index || 0)
          },
          remediation: this.getRemediation(rule.type)
        });
      }
    }

    // Apply custom rules
    for (const customRule of this.configuration.customRules) {
      const pattern = new RegExp(customRule.pattern, 'gi');
      const matches = Array.from(codeContent.matchAll(pattern));
      for (const match of matches) {
        vulnerabilities.push({
          id: this.generateVulnerabilityId(),
          type: customRule.category,
          severity: customRule.severity,
          title: customRule.name,
          description: customRule.description,
          location: {
            file: filePath,
            line: this.getLineNumber(codeContent, match.index || 0)
          },
          remediation: this.getRemediation(customRule.category)
        });
      }
    }

    return vulnerabilities;
  }

  private async performDependencyScanning(input: AgentInput): Promise<Vulnerability[]> {
    this.logger.debug('Performing dependency scanning');
    
    const vulnerabilities: Vulnerability[] = [];
    const packageJson = input.parameters.packageJson as any;

    if (!packageJson) {
      return vulnerabilities;
    }

    // Simulate known vulnerable packages
    const knownVulnerablePackages = [
      {
        name: 'lodash',
        version: '<4.17.21',
        vulnerability: {
          type: VulnerabilityType.INJECTION_FLAW,
          severity: 'high' as const,
          title: 'Prototype Pollution in lodash',
          description: 'Versions of lodash prior to 4.17.21 are vulnerable to prototype pollution'
        }
      },
      {
        name: 'express',
        version: '<4.18.0',
        vulnerability: {
          type: VulnerabilityType.DATA_EXPOSURE,
          severity: 'medium' as const,
          title: 'Information disclosure in express',
          description: 'Express versions prior to 4.18.0 may expose sensitive information'
        }
      }
    ];

    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const [packageName, version] of Object.entries(dependencies)) {
      const vulnerablePackage = knownVulnerablePackages.find(p => p.name === packageName);
      if (vulnerablePackage) {
        vulnerabilities.push({
          id: this.generateVulnerabilityId(),
          type: vulnerablePackage.vulnerability.type,
          severity: vulnerablePackage.vulnerability.severity,
          title: vulnerablePackage.vulnerability.title,
          description: vulnerablePackage.vulnerability.description,
          location: {
            file: 'package.json'
          },
          remediation: `Update ${packageName} to a version >= ${vulnerablePackage.version.replace('<', '')}`
        });
      }
    }

    return vulnerabilities;
  }

  private async performSecretsScanning(input: AgentInput): Promise<Vulnerability[]> {
    this.logger.debug('Performing secrets scanning');
    
    const vulnerabilities: Vulnerability[] = [];
    const codeContent = input.parameters.codeContent as string || '';
    const filePath = input.parameters.filePath as string || 'unknown';

    // Common secret patterns
    const secretPatterns = [
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: 'critical' as const
      },
      {
        name: 'GitHub Token',
        pattern: /ghp_[a-zA-Z0-9]{36}/g,
        severity: 'critical' as const
      },
      {
        name: 'JWT Token',
        pattern: /eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
        severity: 'high' as const
      },
      {
        name: 'API Key',
        pattern: /[aA][pP][iI][_]?[kK][eE][yY].*['"]\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/g,
        severity: 'high' as const
      }
    ];

    for (const secretPattern of secretPatterns) {
      const matches = Array.from(codeContent.matchAll(secretPattern.pattern));
      for (const match of matches) {
        vulnerabilities.push({
          id: this.generateVulnerabilityId(),
          type: VulnerabilityType.HARDCODED_SECRETS,
          severity: secretPattern.severity,
          title: `${secretPattern.name} detected`,
          description: `A ${secretPattern.name} was found hardcoded in the source code`,
          location: {
            file: filePath,
            line: this.getLineNumber(codeContent, match.index || 0)
          },
          remediation: `Remove the hardcoded ${secretPattern.name} and use environment variables or a secure secret management system`
        });
      }
    }

    return vulnerabilities;
  }

  private generateRecommendations(vulnerabilities: Vulnerability[]): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = [];
    const vulnerabilityTypes = new Set(vulnerabilities.map(v => v.type));

    // Generate recommendations based on vulnerability types found
    if (vulnerabilityTypes.has(VulnerabilityType.HARDCODED_SECRETS)) {
      recommendations.push({
        id: this.generateRecommendationId(),
        priority: 'critical',
        category: 'code',
        title: 'Implement Secret Management',
        description: 'Use environment variables or a dedicated secret management service',
        actionItems: [
          'Move all secrets to environment variables',
          'Implement a secret management service (e.g., AWS Secrets Manager, HashiCorp Vault)',
          'Add secret scanning to CI/CD pipeline',
          'Rotate any exposed secrets immediately'
        ],
        estimatedEffort: '2-4 hours',
        references: [
          'https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure'
        ]
      });
    }

    if (vulnerabilityTypes.has(VulnerabilityType.SQL_INJECTION)) {
      recommendations.push({
        id: this.generateRecommendationId(),
        priority: 'high',
        category: 'code',
        title: 'Use Parameterized Queries',
        description: 'Replace dynamic SQL construction with parameterized queries',
        actionItems: [
          'Replace string concatenation with parameterized queries',
          'Use ORM frameworks with built-in SQL injection protection',
          'Implement input validation and sanitization',
          'Add SQL injection testing to security test suite'
        ],
        estimatedEffort: '4-8 hours',
        references: [
          'https://owasp.org/www-project-top-ten/2017/A1_2017-Injection'
        ]
      });
    }

    if (vulnerabilityTypes.has(VulnerabilityType.INSECURE_DEPENDENCIES)) {
      recommendations.push({
        id: this.generateRecommendationId(),
        priority: 'medium',
        category: 'dependency',
        title: 'Update Dependencies',
        description: 'Keep dependencies up to date and monitor for vulnerabilities',
        actionItems: [
          'Update all vulnerable dependencies to secure versions',
          'Implement automated dependency scanning',
          'Set up dependency update automation (e.g., Dependabot)',
          'Regular security audits of dependencies'
        ],
        estimatedEffort: '1-2 hours',
        references: [
          'https://owasp.org/www-project-top-ten/2017/A9_2017-Using_Components_with_Known_Vulnerabilities'
        ]
      });
    }

    return recommendations;
  }

  private calculateSecurityScore(vulnerabilities: Vulnerability[]): number {
    if (vulnerabilities.length === 0) {
      return 100;
    }

    const severityWeights = {
      low: 1,
      medium: 3,
      high: 7,
      critical: 15
    };

    const totalWeight = vulnerabilities.reduce((sum, vuln) => {
      return sum + severityWeights[vuln.severity];
    }, 0);

    // Score decreases based on weighted vulnerabilities
    const score = Math.max(0, 100 - (totalWeight * 2));
    return Math.round(score);
  }

  private determineRiskLevel(
    vulnerabilities: Vulnerability[], 
    securityScore: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;

    if (criticalCount > 0 || securityScore < 30) {
      return 'critical';
    } else if (highCount > 2 || securityScore < 60) {
      return 'high';
    } else if (vulnerabilities.length > 5 || securityScore < 80) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private async generateSecurityReport(
    scanResult: SecurityScanResult, 
    context: AgentContext
  ): Promise<string> {
    const report = `
# Security Scan Report

**Project:** ${context.projectId}
**Scan Date:** ${new Date().toISOString()}
**Security Score:** ${scanResult.securityScore}/100
**Risk Level:** ${scanResult.riskLevel.toUpperCase()}

## Summary

- **Total Vulnerabilities:** ${scanResult.vulnerabilities.length}
- **Critical:** ${scanResult.vulnerabilities.filter(v => v.severity === 'critical').length}
- **High:** ${scanResult.vulnerabilities.filter(v => v.severity === 'high').length}
- **Medium:** ${scanResult.vulnerabilities.filter(v => v.severity === 'medium').length}
- **Low:** ${scanResult.vulnerabilities.filter(v => v.severity === 'low').length}

## Vulnerabilities

${scanResult.vulnerabilities.map(vuln => `
### ${vuln.title} (${vuln.severity.toUpperCase()})

**Location:** ${vuln.location.file}${vuln.location.line ? `:${vuln.location.line}` : ''}
**Type:** ${vuln.type}
**Description:** ${vuln.description}
**Remediation:** ${vuln.remediation}
`).join('\n')}

## Recommendations

${scanResult.recommendations.map(rec => `
### ${rec.title} (${rec.priority.toUpperCase()})

**Category:** ${rec.category}
**Description:** ${rec.description}
**Estimated Effort:** ${rec.estimatedEffort}

**Action Items:**
${rec.actionItems.map(item => `- ${item}`).join('\n')}
`).join('\n')}

---
*Generated by Security Guardian Agent v${this.version}*
    `.trim();

    return report;
  }

  private getRemediation(vulnerabilityType: VulnerabilityType): string {
    const remediations = {
      [VulnerabilityType.SQL_INJECTION]: 'Use parameterized queries or prepared statements',
      [VulnerabilityType.XSS]: 'Sanitize and validate all user inputs, use Content Security Policy',
      [VulnerabilityType.CSRF]: 'Implement CSRF tokens and validate referrer headers',
      [VulnerabilityType.INSECURE_CRYPTO]: 'Use strong, up-to-date cryptographic algorithms',
      [VulnerabilityType.HARDCODED_SECRETS]: 'Move secrets to environment variables or secret management system',
      [VulnerabilityType.INSECURE_DEPENDENCIES]: 'Update to secure versions of dependencies',
      [VulnerabilityType.AUTHENTICATION_BYPASS]: 'Implement proper authentication checks',
      [VulnerabilityType.AUTHORIZATION_FLAW]: 'Implement proper authorization controls',
      [VulnerabilityType.DATA_EXPOSURE]: 'Implement proper data access controls and encryption',
      [VulnerabilityType.INJECTION_FLAW]: 'Validate and sanitize all inputs, use safe APIs'
    };

    return remediations[vulnerabilityType] || 'Review and fix the identified security issue';
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private generateExecutionId(): string {
    return `sec_exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateVulnerabilityId(): string {
    return `vuln_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecommendationId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeScanners(): void {
    // Initialize different types of security scanners
    // This would typically integrate with external security tools
    this.logger.info('Security Guardian agent initialized', { 
      agentId: this.id,
      capabilities: this.capabilities 
    });
  }
}

// Interface for external security scanner integration
export interface SecurityScanner {
  name: string;
  version: string;
  scan(input: AgentInput): Promise<Vulnerability[]>;
}

// Factory function to create Security Guardian agent
export function createSecurityGuardianAgent(
  id: UUID,
  config: Partial<SecurityScanConfig> = {},
  logger: Logger
): SecurityGuardianAgent {
  const defaultConfig: SecurityScanConfig = {
    enableStaticAnalysis: true,
    enableDependencyScanning: true,
    enableSecretsScanning: true,
    enableLicenseScanning: false,
    customRules: [],
    excludePatterns: ['node_modules/**', 'dist/**', '*.min.js'],
    severityThreshold: 'low'
  };

  const finalConfig = { ...defaultConfig, ...config };
  
  return new SecurityGuardianAgent(id, finalConfig, logger);
}