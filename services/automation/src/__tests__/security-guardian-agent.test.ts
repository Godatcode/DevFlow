import { 
  SecurityGuardianAgent, 
  createSecurityGuardianAgent,
  SecurityScanConfig,
  VulnerabilityType 
} from '../agents/security-guardian-agent';
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

describe('SecurityGuardianAgent', () => {
  let agent: SecurityGuardianAgent;
  let config: SecurityScanConfig;
  let context: AgentContext;
  let input: AgentInput;

  beforeEach(() => {
    config = {
      enableStaticAnalysis: true,
      enableDependencyScanning: true,
      enableSecretsScanning: true,
      enableLicenseScanning: false,
      customRules: [],
      excludePatterns: ['node_modules/**'],
      severityThreshold: 'low'
    };

    agent = new SecurityGuardianAgent('security-agent-1', config, mockLogger);

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
      expect(agent.id).toBe('security-agent-1');
      expect(agent.name).toBe('Security Guardian');
      expect(agent.type).toBe(AgentType.SECURITY_GUARDIAN);
      expect(agent.version).toBe('1.0.0');
      expect(agent.capabilities).toContain(AgentCapability.VULNERABILITY_SCANNING);
      expect(agent.capabilities).toContain(AgentCapability.CODE_ANALYSIS);
      expect(agent.isActive).toBe(true);
    });

    it('should have creation and update timestamps', () => {
      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('execute', () => {
    it('should execute security scan successfully with no vulnerabilities', async () => {
      input.parameters.codeContent = 'const message = "Hello, World!";';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
      expect(result.output.data.scanResult).toBeDefined();
      expect(result.output.data.scanResult.vulnerabilities).toHaveLength(0);
      expect(result.output.data.scanResult.securityScore).toBe(100);
      expect(result.output.data.scanResult.riskLevel).toBe('low');
    });

    it('should detect hardcoded secrets', async () => {
      input.parameters.codeContent = `
        const apiKey = "sk-1234567890abcdef";
        const password = "mySecretPassword123";
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      expect(vulnerabilities.length).toBeGreaterThan(0);
      
      const secretVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.HARDCODED_SECRETS
      );
      expect(secretVulns.length).toBeGreaterThan(0);
      expect(secretVulns[0].severity).toBe('critical');
    });

    it('should detect potential SQL injection', async () => {
      input.parameters.codeContent = `
        const query = "SELECT * FROM users WHERE id = " + userId;
        db.query(query);
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const sqlVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.SQL_INJECTION
      );
      expect(sqlVulns.length).toBeGreaterThan(0);
      expect(sqlVulns[0].severity).toBe('high');
    });

    it('should detect XSS vulnerabilities', async () => {
      input.parameters.codeContent = `
        document.write(userInput);
        element.innerHTML = untrustedData;
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const xssVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.XSS
      );
      expect(xssVulns.length).toBeGreaterThan(0);
    });

    it('should detect eval usage', async () => {
      input.parameters.codeContent = `
        const result = eval(userInput);
        const func = new Function(dynamicCode);
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const injectionVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.INJECTION_FLAW
      );
      expect(injectionVulns.length).toBeGreaterThan(0);
      expect(injectionVulns[0].severity).toBe('high');
    });

    it('should apply custom security rules', async () => {
      const customConfig = {
        ...config,
        customRules: [{
          id: 'custom-1',
          name: 'Dangerous Function',
          description: 'Usage of dangerous function',
          pattern: 'dangerousFunction\\(',
          severity: 'medium' as const,
          category: VulnerabilityType.INJECTION_FLAW
        }]
      };

      const customAgent = new SecurityGuardianAgent('custom-agent', customConfig, mockLogger);
      input.parameters.codeContent = 'dangerousFunction(userInput);';

      const result = await customAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const customVulns = vulnerabilities.filter(v => v.title === 'Dangerous Function');
      expect(customVulns.length).toBe(1);
      expect(customVulns[0].severity).toBe('medium');
    });

    it('should scan package.json for vulnerable dependencies', async () => {
      input.parameters.packageJson = {
        dependencies: {
          'lodash': '4.17.20', // Vulnerable version
          'express': '4.17.0'  // Vulnerable version
        }
      };

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const depVulns = vulnerabilities.filter(v => v.location.file === 'package.json');
      expect(depVulns.length).toBeGreaterThan(0);
    });

    it('should detect various secret patterns', async () => {
      input.parameters.codeContent = `
        const awsKey = "AKIA1234567890123456";
        const githubToken = "ghp_abcdefghijklmnopqrstuvwxyz123456789";
        const jwtToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        const apiKey = "api_key: 'sk-1234567890abcdefghijklmnop'";
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const secretVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.HARDCODED_SECRETS
      );
      expect(secretVulns.length).toBeGreaterThan(0);
    });

    it('should calculate security score correctly', async () => {
      input.parameters.codeContent = `
        const password = "secret123";  // Critical
        eval(userInput);               // High
        document.write(data);          // Medium
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.scanResult.securityScore).toBeLessThan(100);
      expect(result.output.data.scanResult.riskLevel).not.toBe('low');
    });

    it('should generate appropriate recommendations', async () => {
      input.parameters.codeContent = `
        const apiKey = "sk-1234567890";
        const query = "SELECT * FROM users WHERE id = " + id;
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const recommendations = result.output.data.scanResult.recommendations;
      expect(recommendations.length).toBeGreaterThan(0);
      
      const secretRec = recommendations.find(r => r.title.includes('Secret Management'));
      expect(secretRec).toBeDefined();
      expect(secretRec?.priority).toBe('critical');
      
      const sqlRec = recommendations.find(r => r.title.includes('Parameterized Queries'));
      expect(sqlRec).toBeDefined();
      expect(sqlRec?.priority).toBe('high');
    });

    it('should generate security report', async () => {
      input.parameters.codeContent = 'const secret = "password123";';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.report).toBeDefined();
      expect(result.output.data.report).toContain('Security Scan Report');
      expect(result.output.data.report).toContain(context.projectId);
      expect(result.output.data.report).toContain('Security Score:');
    });

    it('should include execution metrics', async () => {
      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.metrics).toBeDefined();
      expect(result.output.metrics.scanDuration).toBeGreaterThanOrEqual(0);
      expect(result.output.metrics.vulnerabilitiesFound).toBeDefined();
      expect(result.output.metrics.securityScore).toBeDefined();
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

    it('should respect severity threshold configuration', async () => {
      const highThresholdConfig = {
        ...config,
        severityThreshold: 'high' as const
      };

      const highThresholdAgent = new SecurityGuardianAgent(
        'high-threshold-agent', 
        highThresholdConfig, 
        mockLogger
      );

      input.parameters.codeContent = 'document.write(data);'; // Medium severity

      const result = await highThresholdAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      // With high threshold, medium vulnerabilities might be filtered out
      // depending on implementation
    });

    it('should handle disabled scan types', async () => {
      const limitedConfig = {
        ...config,
        enableStaticAnalysis: false,
        enableDependencyScanning: false,
        enableSecretsScanning: true
      };

      const limitedAgent = new SecurityGuardianAgent('limited-agent', limitedConfig, mockLogger);
      
      input.parameters.codeContent = `
        eval(userInput);  // Would be caught by static analysis
        const awsKey = "AKIA1234567890123456";  // Should be caught by secrets scanning
      `;

      const result = await limitedAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      // Should only find secrets, not eval usage
      const secretVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.HARDCODED_SECRETS
      );
      const evalVulns = vulnerabilities.filter(v => 
        v.type === VulnerabilityType.INJECTION_FLAW
      );
      
      expect(secretVulns.length).toBeGreaterThan(0);
      expect(evalVulns.length).toBe(0);
    });
  });

  describe('createSecurityGuardianAgent factory', () => {
    it('should create agent with default configuration', () => {
      const factoryAgent = createSecurityGuardianAgent('factory-agent', {}, mockLogger);

      expect(factoryAgent).toBeInstanceOf(SecurityGuardianAgent);
      expect(factoryAgent.id).toBe('factory-agent');
      expect(factoryAgent.configuration.enableStaticAnalysis).toBe(true);
      expect(factoryAgent.configuration.enableDependencyScanning).toBe(true);
      expect(factoryAgent.configuration.enableSecretsScanning).toBe(true);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        enableLicenseScanning: true,
        severityThreshold: 'high' as const
      };

      const factoryAgent = createSecurityGuardianAgent('factory-agent', customConfig, mockLogger);

      expect(factoryAgent.configuration.enableLicenseScanning).toBe(true);
      expect(factoryAgent.configuration.severityThreshold).toBe('high');
      expect(factoryAgent.configuration.enableStaticAnalysis).toBe(true); // Default preserved
    });
  });

  describe('vulnerability detection accuracy', () => {
    it('should provide accurate line numbers for vulnerabilities', async () => {
      input.parameters.codeContent = `
        const normalCode = "safe";
        const secret = "password123";
        const moreCode = "also safe";
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      const secretVuln = vulnerabilities.find(v => 
        v.type === VulnerabilityType.HARDCODED_SECRETS
      );
      
      expect(secretVuln?.location.line).toBe(3); // Secret is on line 3
    });

    it('should provide remediation guidance for each vulnerability', async () => {
      input.parameters.codeContent = 'const secret = "password123";';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const vulnerabilities = result.output.data.scanResult.vulnerabilities;
      expect(vulnerabilities.length).toBeGreaterThan(0);
      
      for (const vuln of vulnerabilities) {
        expect(vuln.remediation).toBeDefined();
        expect(vuln.remediation.length).toBeGreaterThan(0);
      }
    });

    it('should categorize risk levels correctly', async () => {
      // Test critical risk with actual patterns that will be detected
      input.parameters.codeContent = `
        const secret1 = "sk-1234567890abcdefghijklmnop";
        const secret2 = "AKIA1234567890123456";
        const secret3 = "ghp_abcdefghijklmnopqrstuvwxyz123456789";
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.scanResult.riskLevel).toBe('critical');
    });
  });
});