import { 
  StyleEnforcerAgent, 
  createStyleEnforcerAgent,
  StyleEnforcerConfig,
  StyleCategory 
} from '../agents/style-enforcer-agent';
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

describe('StyleEnforcerAgent', () => {
  let agent: StyleEnforcerAgent;
  let config: StyleEnforcerConfig;
  let context: AgentContext;
  let input: AgentInput;

  beforeEach(() => {
    config = {
      enableAutoFormatting: true,
      enableLinting: true,
      enableAccessibilityChecks: true,
      styleGuide: {
        name: 'default',
        version: '1.0.0',
        rules: {}
      },
      customRules: [],
      excludePatterns: ['node_modules/**'],
      maxLineLength: 100,
      indentSize: 2,
      indentType: 'spaces',
      semicolons: true,
      quotes: 'single',
      trailingCommas: true
    };

    agent = new StyleEnforcerAgent('style-agent-1', config, mockLogger);

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
      expect(agent.id).toBe('style-agent-1');
      expect(agent.name).toBe('Style Enforcer');
      expect(agent.type).toBe(AgentType.STYLE_ENFORCER);
      expect(agent.version).toBe('1.0.0');
      expect(agent.capabilities).toContain(AgentCapability.CODE_ANALYSIS);
      expect(agent.isActive).toBe(true);
    });

    it('should have creation and update timestamps', () => {
      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('execute', () => {
    it('should execute style enforcement successfully with no violations', async () => {
      input.parameters.codeContent = 'const message = \'Hello, World!\';';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
      expect(result.output.data.enforcementResult).toBeDefined();
      expect(result.output.data.enforcementResult.violations).toHaveLength(0);
      expect(result.output.data.enforcementResult.styleScore).toBe(100);
    });

    it('should detect trailing whitespace', async () => {
      input.parameters.codeContent = 'const message = \'hello\';   \nconst other = \'world\';';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.success).toBe(true);
      
      const violations = result.output.data.enforcementResult.violations;
      expect(violations.length).toBeGreaterThan(0);
      
      const trailingWhitespaceViolation = violations.find(v => 
        v.rule === 'trailing-whitespace'
      );
      expect(trailingWhitespaceViolation).toBeDefined();
      expect(trailingWhitespaceViolation?.severity).toBe('error');
      expect(trailingWhitespaceViolation?.fixable).toBe(true);
    });

    it('should detect multiple empty lines', async () => {
      input.parameters.codeContent = 'const first = 1;\n\n\n\nconst second = 2;';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const multipleEmptyLinesViolation = violations.find(v => 
        v.rule === 'no-multiple-empty-lines'
      );
      expect(multipleEmptyLinesViolation).toBeDefined();
      expect(multipleEmptyLinesViolation?.severity).toBe('warning');
      expect(multipleEmptyLinesViolation?.fixable).toBe(true);
    });

    it('should detect line length violations', async () => {
      const longLine = 'const veryLongVariableName = \'this is a very long string that exceeds the maximum line length limit\';';
      input.parameters.codeContent = longLine;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const lineLengthViolation = violations.find(v => 
        v.rule === 'max-line-length'
      );
      expect(lineLengthViolation).toBeDefined();
      expect(lineLengthViolation?.severity).toBe('warning');
    });

    it('should detect var usage', async () => {
      input.parameters.codeContent = 'var oldStyle = \'should use let or const\';';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const varViolation = violations.find(v => 
        v.rule === 'no-var'
      );
      expect(varViolation).toBeDefined();
      expect(varViolation?.severity).toBe('error');
      expect(varViolation?.fixable).toBe(true);
      expect(varViolation?.category).toBe(StyleCategory.BEST_PRACTICES);
    });

    it('should detect quote style violations', async () => {
      input.parameters.codeContent = 'const message = "should use single quotes";';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const quoteViolation = violations.find(v => 
        v.rule === 'quote-style'
      );
      expect(quoteViolation).toBeDefined();
      expect(quoteViolation?.severity).toBe('warning');
      expect(quoteViolation?.fixable).toBe(true);
    });

    it('should detect camelCase naming violations', async () => {
      input.parameters.codeContent = 'const user_name = \'john\'; const first_name = \'jane\';';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const namingViolations = violations.filter(v => 
        v.rule === 'camelcase-naming'
      );
      expect(namingViolations.length).toBeGreaterThan(0);
      expect(namingViolations[0].category).toBe(StyleCategory.NAMING);
    });

    it('should apply custom style rules', async () => {
      const customConfig = {
        ...config,
        customRules: [{
          id: 'no-console',
          name: 'No Console Statements',
          description: 'Console statements should not be used in production',
          category: StyleCategory.BEST_PRACTICES,
          pattern: 'console\\.',
          severity: 'warning' as const,
          fixable: false,
          message: 'Avoid using console statements'
        }]
      };

      const customAgent = new StyleEnforcerAgent('custom-agent', customConfig, mockLogger);
      input.parameters.codeContent = 'console.log("debug message");';

      const result = await customAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const consoleViolation = violations.find(v => v.rule === 'no-console');
      expect(consoleViolation).toBeDefined();
      expect(consoleViolation?.severity).toBe('warning');
    });

    it('should detect accessibility violations in HTML', async () => {
      input.parameters.codeContent = `
        <img src="photo.jpg">
        <button>Click me</button>
        <input type="text">
      `;
      input.parameters.filePath = 'test.html';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const accessibilityViolations = violations.filter(v => 
        v.category === StyleCategory.ACCESSIBILITY
      );
      expect(accessibilityViolations.length).toBeGreaterThan(0);
      
      const imgAltViolation = violations.find(v => v.rule === 'img-alt');
      expect(imgAltViolation).toBeDefined();
    });

    it('should generate fixes for fixable violations', async () => {
      input.parameters.codeContent = 'var message = "hello world";   ';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const fixes = result.output.data.enforcementResult.fixes;
      expect(fixes.length).toBeGreaterThan(0);
      
      const trailingWhitespaceFix = fixes.find(f => 
        f.description.includes('trailing whitespace')
      );
      expect(trailingWhitespaceFix).toBeDefined();
      expect(trailingWhitespaceFix?.confidence).toBeGreaterThan(0);
    });

    it('should format code when auto-formatting is enabled', async () => {
      input.parameters.codeContent = 'function test(){return"hello";}';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.enforcementResult.formattedCode).toBeDefined();
      expect(result.output.data.enforcementResult.formattedCode).not.toBe(input.parameters.codeContent);
    });

    it('should calculate style score correctly', async () => {
      input.parameters.codeContent = `
        var badVar = "double quotes";   
        const snake_case = 'value';
        
        
        
        const another = 'test';
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.enforcementResult.styleScore).toBeLessThan(100);
      expect(result.output.data.enforcementResult.styleScore).toBeGreaterThanOrEqual(0);
    });

    it('should generate appropriate recommendations', async () => {
      input.parameters.codeContent = `
        var message = "hello";   
        const user_name = 'john';
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const recommendations = result.output.data.enforcementResult.recommendations;
      expect(recommendations.length).toBeGreaterThan(0);
      
      const formattingRec = recommendations.find(r => 
        r.category === StyleCategory.FORMATTING
      );
      expect(formattingRec).toBeDefined();
      expect(formattingRec?.priority).toBe('high');
    });

    it('should generate style report', async () => {
      input.parameters.codeContent = 'var message = "hello world";';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.report).toBeDefined();
      expect(result.output.data.report).toContain('Style Enforcement Report');
      expect(result.output.data.report).toContain(context.projectId);
      expect(result.output.data.report).toContain('Style Score:');
    });

    it('should include execution metrics', async () => {
      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.metrics).toBeDefined();
      expect(result.output.metrics.enforcementDuration).toBeGreaterThanOrEqual(0);
      expect(result.output.metrics.violationsFound).toBeDefined();
      expect(result.output.metrics.fixesApplied).toBeDefined();
      expect(result.output.metrics.styleScore).toBeDefined();
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

    it('should handle different file types correctly', async () => {
      // Test CSS file
      input.parameters.codeContent = 'body{margin:0;padding:0;}';
      input.parameters.filePath = 'styles.css';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.enforcementResult.formattedCode).toBeDefined();
    });

    it('should respect configuration settings', async () => {
      const customConfig = {
        ...config,
        semicolons: false,
        quotes: 'double',
        maxLineLength: 50
      };

      const customAgent = new StyleEnforcerAgent('custom-agent', customConfig, mockLogger);
      input.parameters.codeContent = 'const message = \'this is a longer line that exceeds fifty characters\';';

      const result = await customAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const lineLengthViolation = violations.find(v => v.rule === 'max-line-length');
      expect(lineLengthViolation).toBeDefined();
      
      const quoteViolation = violations.find(v => v.rule === 'quote-style');
      expect(quoteViolation).toBeDefined();
    });

    it('should handle disabled features', async () => {
      const limitedConfig = {
        ...config,
        enableLinting: false,
        enableAutoFormatting: false,
        enableAccessibilityChecks: false
      };

      const limitedAgent = new StyleEnforcerAgent('limited-agent', limitedConfig, mockLogger);
      input.parameters.codeContent = 'var message = "hello world";   ';

      const result = await limitedAgent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.output.data.enforcementResult.violations).toHaveLength(0);
      expect(result.output.data.enforcementResult.formattedCode).toBeUndefined();
    });
  });

  describe('createStyleEnforcerAgent factory', () => {
    it('should create agent with default configuration', () => {
      const factoryAgent = createStyleEnforcerAgent('factory-agent', {}, mockLogger);

      expect(factoryAgent).toBeInstanceOf(StyleEnforcerAgent);
      expect(factoryAgent.id).toBe('factory-agent');
      expect(factoryAgent.configuration.enableLinting).toBe(true);
      expect(factoryAgent.configuration.enableAutoFormatting).toBe(true);
      expect(factoryAgent.configuration.maxLineLength).toBe(100);
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = {
        maxLineLength: 120,
        indentSize: 4,
        quotes: 'double' as const,
        semicolons: false
      };

      const factoryAgent = createStyleEnforcerAgent('factory-agent', customConfig, mockLogger);

      expect(factoryAgent.configuration.maxLineLength).toBe(120);
      expect(factoryAgent.configuration.indentSize).toBe(4);
      expect(factoryAgent.configuration.quotes).toBe('double');
      expect(factoryAgent.configuration.semicolons).toBe(false);
      expect(factoryAgent.configuration.enableLinting).toBe(true); // Default preserved
    });
  });

  describe('code formatting', () => {
    it('should format JavaScript code correctly', async () => {
      input.parameters.codeContent = 'function test(){const x=1;if(x>0){return x;}}';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      const formattedCode = result.output.data.enforcementResult.formattedCode;
      expect(formattedCode).toBeDefined();
      expect(formattedCode).toContain(' = ');
      expect(formattedCode).toContain('if (');
    });

    it('should format HTML code with proper indentation', async () => {
      input.parameters.codeContent = '<div><p>Hello</p></div>';
      input.parameters.filePath = 'test.html';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      const formattedCode = result.output.data.enforcementResult.formattedCode;
      expect(formattedCode).toBeDefined();
    });

    it('should format CSS code correctly', async () => {
      input.parameters.codeContent = 'body{margin:0;padding:0;}';
      input.parameters.filePath = 'styles.css';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      const formattedCode = result.output.data.enforcementResult.formattedCode;
      expect(formattedCode).toBeDefined();
      expect(formattedCode).toContain(': ');
    });
  });

  describe('violation categorization', () => {
    it('should categorize violations correctly', async () => {
      input.parameters.codeContent = `
        var oldVar = "double quotes";   
        const snake_case_name = 'value';
      `;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const categories = new Set(violations.map(v => v.category));
      
      expect(categories.has(StyleCategory.FORMATTING)).toBe(true);
      expect(categories.has(StyleCategory.BEST_PRACTICES)).toBe(true);
      expect(categories.has(StyleCategory.NAMING)).toBe(true);
    });

    it('should provide accurate location information', async () => {
      input.parameters.codeContent = `line 1
line 2 with trailing space   
line 3`;

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const violations = result.output.data.enforcementResult.violations;
      const trailingWhitespaceViolation = violations.find(v => 
        v.rule === 'trailing-whitespace'
      );
      
      expect(trailingWhitespaceViolation?.location.line).toBe(2);
      expect(trailingWhitespaceViolation?.location.column).toBeGreaterThan(0);
    });
  });

  describe('fix generation', () => {
    it('should generate high-confidence fixes', async () => {
      input.parameters.codeContent = 'var message = "hello";   ';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const fixes = result.output.data.enforcementResult.fixes;
      expect(fixes.length).toBeGreaterThan(0);
      
      for (const fix of fixes) {
        expect(fix.confidence).toBeGreaterThan(0);
        expect(fix.confidence).toBeLessThanOrEqual(1);
        expect(fix.originalCode).not.toBe(fix.fixedCode);
      }
    });

    it('should provide clear fix descriptions', async () => {
      input.parameters.codeContent = 'var test = 1;';

      const result = await agent.execute(context, input);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      
      const fixes = result.output.data.enforcementResult.fixes;
      const varFix = fixes.find(f => f.description.includes('var'));
      
      if (varFix) {
        expect(varFix.description).toBeDefined();
        expect(varFix.description.length).toBeGreaterThan(0);
      }
    });
  });
});