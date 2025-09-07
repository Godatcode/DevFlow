import { GatewayRequest, GatewayResponse } from '../types';
import { SecurityPolicy, SecurityRule } from '../interfaces';
import { RateLimiter, RateLimitResult, RateLimitConfig } from './rate-limiter';

export interface SecurityMiddlewareConfig {
  rateLimiter: RateLimiter;
  defaultRateLimit: RateLimitConfig;
  cors: CORSConfig;
  security: SecurityHeadersConfig;
  validation: ValidationConfig;
}

export interface CORSConfig {
  enabled: boolean;
  origin: string | string[] | ((origin: string) => boolean);
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
  preflightContinue: boolean;
}

export interface SecurityHeadersConfig {
  contentSecurityPolicy: string;
  xFrameOptions: string;
  xContentTypeOptions: boolean;
  referrerPolicy: string;
  permissionsPolicy: string;
  strictTransportSecurity: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
}

export interface ValidationConfig {
  maxBodySize: number;
  allowedContentTypes: string[];
  sanitizeInput: boolean;
  validateHeaders: boolean;
}

export interface SecurityMiddlewareResult {
  allowed: boolean;
  response?: GatewayResponse;
  headers?: Record<string, string>;
  rateLimitInfo?: RateLimitResult;
  error?: string;
}

export class SecurityMiddleware {
  private config: SecurityMiddlewareConfig;
  private rateLimiter: RateLimiter;

  constructor(config: SecurityMiddlewareConfig) {
    this.config = config;
    this.rateLimiter = config.rateLimiter;
  }

  /**
   * Process security middleware
   */
  async processRequest(request: GatewayRequest, policies: SecurityPolicy[] = []): Promise<SecurityMiddlewareResult> {
    const securityHeaders: Record<string, string> = {};

    // Apply CORS
    const corsResult = this.applyCORS(request, securityHeaders);
    if (!corsResult.allowed) {
      return corsResult;
    }

    // Apply rate limiting
    const rateLimitResult = await this.applyRateLimit(request);
    if (!rateLimitResult.allowed) {
      return {
        allowed: false,
        response: this.createRateLimitResponse(rateLimitResult.rateLimitInfo!),
        error: 'Rate limit exceeded'
      };
    }

    // Apply security headers
    this.applySecurityHeaders(securityHeaders);

    // Apply input validation
    const validationResult = this.validateRequest(request);
    if (!validationResult.allowed) {
      return validationResult;
    }

    // Apply custom security policies
    for (const policy of policies) {
      if (!policy.enabled) continue;

      const policyResult = await this.applySecurityPolicy(request, policy);
      if (!policyResult.allowed) {
        return policyResult;
      }
    }

    return {
      allowed: true,
      headers: securityHeaders,
      rateLimitInfo: rateLimitResult.rateLimitInfo
    };
  }

  /**
   * Handle preflight CORS requests
   */
  handlePreflight(request: GatewayRequest): GatewayResponse | null {
    if (request.context.method !== 'OPTIONS') {
      return null;
    }

    const headers: Record<string, string> = {};
    this.applyCORS(request, headers);

    return {
      statusCode: 204,
      headers,
      body: null,
      duration: 0
    };
  }

  /**
   * Apply CORS policy
   */
  private applyCORS(request: GatewayRequest, headers: Record<string, string>): SecurityMiddlewareResult {
    if (!this.config.cors.enabled) {
      return { allowed: true };
    }

    const origin = request.headers['origin'] || request.headers['Origin'];
    
    // Check origin
    if (origin && !this.isOriginAllowed(origin)) {
      return {
        allowed: false,
        response: this.createForbiddenResponse('CORS: Origin not allowed'),
        error: 'CORS: Origin not allowed'
      };
    }

    // Set CORS headers
    if (origin && this.isOriginAllowed(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    } else if (typeof this.config.cors.origin === 'string') {
      headers['Access-Control-Allow-Origin'] = this.config.cors.origin;
    }

    headers['Access-Control-Allow-Methods'] = this.config.cors.methods.join(', ');
    headers['Access-Control-Allow-Headers'] = this.config.cors.allowedHeaders.join(', ');
    
    if (this.config.cors.exposedHeaders.length > 0) {
      headers['Access-Control-Expose-Headers'] = this.config.cors.exposedHeaders.join(', ');
    }

    if (this.config.cors.credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    if (this.config.cors.maxAge > 0) {
      headers['Access-Control-Max-Age'] = this.config.cors.maxAge.toString();
    }

    return { allowed: true };
  }

  /**
   * Apply rate limiting
   */
  private async applyRateLimit(request: GatewayRequest): Promise<SecurityMiddlewareResult> {
    const rateLimitInfo = await this.rateLimiter.checkLimit(request, this.config.defaultRateLimit);

    return {
      allowed: rateLimitInfo.allowed,
      rateLimitInfo
    };
  }

  /**
   * Apply security headers
   */
  private applySecurityHeaders(headers: Record<string, string>): void {
    const securityConfig = this.config.security;

    // Content Security Policy
    if (securityConfig.contentSecurityPolicy) {
      headers['Content-Security-Policy'] = securityConfig.contentSecurityPolicy;
    }

    // X-Frame-Options
    if (securityConfig.xFrameOptions) {
      headers['X-Frame-Options'] = securityConfig.xFrameOptions;
    }

    // X-Content-Type-Options
    if (securityConfig.xContentTypeOptions) {
      headers['X-Content-Type-Options'] = 'nosniff';
    }

    // Referrer Policy
    if (securityConfig.referrerPolicy) {
      headers['Referrer-Policy'] = securityConfig.referrerPolicy;
    }

    // Permissions Policy
    if (securityConfig.permissionsPolicy) {
      headers['Permissions-Policy'] = securityConfig.permissionsPolicy;
    }

    // Strict Transport Security
    if (securityConfig.strictTransportSecurity.enabled) {
      let hstsValue = `max-age=${securityConfig.strictTransportSecurity.maxAge}`;
      
      if (securityConfig.strictTransportSecurity.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      
      if (securityConfig.strictTransportSecurity.preload) {
        hstsValue += '; preload';
      }
      
      headers['Strict-Transport-Security'] = hstsValue;
    }

    // Additional security headers
    headers['X-XSS-Protection'] = '1; mode=block';
    headers['X-DNS-Prefetch-Control'] = 'off';
    headers['X-Download-Options'] = 'noopen';
    headers['X-Permitted-Cross-Domain-Policies'] = 'none';
  }

  /**
   * Validate request
   */
  private validateRequest(request: GatewayRequest): SecurityMiddlewareResult {
    const validation = this.config.validation;

    // Check content type
    const contentType = request.headers['content-type'] || request.headers['Content-Type'];
    if (contentType && validation.allowedContentTypes.length > 0) {
      const isAllowed = validation.allowedContentTypes.some(allowed => 
        contentType.toLowerCase().includes(allowed.toLowerCase())
      );
      
      if (!isAllowed) {
        return {
          allowed: false,
          response: this.createBadRequestResponse('Invalid content type'),
          error: 'Invalid content type'
        };
      }
    }

    // Check body size
    if (request.body && validation.maxBodySize > 0) {
      const bodySize = typeof request.body === 'string' 
        ? request.body.length 
        : JSON.stringify(request.body).length;
      
      if (bodySize > validation.maxBodySize) {
        return {
          allowed: false,
          response: this.createBadRequestResponse('Request body too large'),
          error: 'Request body too large'
        };
      }
    }

    // Validate headers
    if (validation.validateHeaders) {
      const headerValidation = this.validateHeaders(request.headers);
      if (!headerValidation.valid) {
        return {
          allowed: false,
          response: this.createBadRequestResponse(headerValidation.error!),
          error: headerValidation.error
        };
      }
    }

    // Sanitize input
    if (validation.sanitizeInput) {
      this.sanitizeRequestInput(request);
    }

    return { allowed: true };
  }

  /**
   * Apply custom security policy
   */
  private async applySecurityPolicy(request: GatewayRequest, policy: SecurityPolicy): Promise<SecurityMiddlewareResult> {
    for (const rule of policy.rules) {
      const ruleResult = await this.applySecurityRule(request, rule);
      if (!ruleResult.allowed) {
        return ruleResult;
      }
    }

    return { allowed: true };
  }

  /**
   * Apply individual security rule
   */
  private async applySecurityRule(request: GatewayRequest, rule: SecurityRule): Promise<SecurityMiddlewareResult> {
    switch (rule.type) {
      case 'rate-limit':
        const customRateLimit = rule.config as RateLimitConfig;
        const rateLimitInfo = await this.rateLimiter.checkLimit(request, customRateLimit);
        return {
          allowed: rateLimitInfo.allowed,
          rateLimitInfo
        };

      case 'ip-whitelist':
        const allowedIPs = rule.config.allowedIPs as string[];
        if (!allowedIPs.includes(request.context.ipAddress)) {
          return {
            allowed: false,
            response: this.createForbiddenResponse('IP address not allowed'),
            error: 'IP address not allowed'
          };
        }
        break;

      case 'csrf':
        const csrfResult = this.validateCSRF(request, rule.config);
        if (!csrfResult.valid) {
          return {
            allowed: false,
            response: this.createForbiddenResponse('CSRF validation failed'),
            error: 'CSRF validation failed'
          };
        }
        break;

      case 'xss':
        const xssResult = this.validateXSS(request);
        if (!xssResult.valid) {
          return {
            allowed: false,
            response: this.createBadRequestResponse('XSS attempt detected'),
            error: 'XSS attempt detected'
          };
        }
        break;
    }

    return { allowed: true };
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    const allowedOrigin = this.config.cors.origin;

    if (typeof allowedOrigin === 'string') {
      return allowedOrigin === '*' || allowedOrigin === origin;
    }

    if (Array.isArray(allowedOrigin)) {
      return allowedOrigin.includes(origin);
    }

    if (typeof allowedOrigin === 'function') {
      return allowedOrigin(origin);
    }

    return false;
  }

  /**
   * Validate headers
   */
  private validateHeaders(headers: Record<string, string>): { valid: boolean; error?: string } {
    // Check for suspicious headers
    const suspiciousHeaders = ['x-forwarded-host', 'x-original-url', 'x-rewrite-url'];
    
    for (const header of suspiciousHeaders) {
      if (headers[header] || headers[header.toUpperCase()]) {
        return {
          valid: false,
          error: `Suspicious header detected: ${header}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Sanitize request input
   */
  private sanitizeRequestInput(request: GatewayRequest): void {
    // Sanitize query parameters
    for (const [key, value] of Object.entries(request.query)) {
      if (typeof value === 'string') {
        request.query[key] = this.sanitizeString(value);
      }
    }

    // Sanitize body if it's an object
    if (request.body && typeof request.body === 'object') {
      this.sanitizeObject(request.body);
    }
  }

  /**
   * Sanitize string input
   */
  private sanitizeString(input: string): string {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[<>]/g, ''); // Remove angle brackets
  }

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        obj[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        this.sanitizeObject(value);
      }
    }
  }

  /**
   * Validate CSRF token
   */
  private validateCSRF(request: GatewayRequest, config: any): { valid: boolean } {
    // Simplified CSRF validation
    const csrfToken = request.headers['x-csrf-token'] || request.headers['X-CSRF-Token'];
    const expectedToken = config.expectedToken;

    return {
      valid: !expectedToken || csrfToken === expectedToken
    };
  }

  /**
   * Validate for XSS attempts
   */
  private validateXSS(request: GatewayRequest): { valid: boolean } {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi
    ];

    const checkString = (str: string): boolean => {
      return !xssPatterns.some(pattern => pattern.test(str));
    };

    const checkObject = (obj: any): boolean => {
      for (const value of Object.values(obj)) {
        if (typeof value === 'string' && !checkString(value)) {
          return false;
        } else if (typeof value === 'object' && value !== null && !checkObject(value)) {
          return false;
        }
      }
      return true;
    };

    // Check query parameters
    for (const value of Object.values(request.query)) {
      if (typeof value === 'string' && !checkString(value)) {
        return { valid: false };
      }
    }

    // Check body
    if (request.body) {
      if (typeof request.body === 'string' && !checkString(request.body)) {
        return { valid: false };
      } else if (typeof request.body === 'object' && !checkObject(request.body)) {
        return { valid: false };
      }
    }

    return { valid: true };
  }

  /**
   * Create rate limit exceeded response
   */
  private createRateLimitResponse(rateLimitInfo: RateLimitResult): GatewayResponse {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': rateLimitInfo.limit.toString(),
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': rateLimitInfo.resetTime.toISOString()
    };

    if (rateLimitInfo.retryAfter) {
      headers['Retry-After'] = rateLimitInfo.retryAfter.toString();
    }

    return {
      statusCode: 429,
      headers,
      body: {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: rateLimitInfo.retryAfter,
        resetTime: rateLimitInfo.resetTime.toISOString(),
        timestamp: new Date().toISOString()
      },
      duration: 0
    };
  }

  /**
   * Create forbidden response
   */
  private createForbiddenResponse(message: string): GatewayResponse {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        error: 'Forbidden',
        message,
        timestamp: new Date().toISOString()
      },
      duration: 0
    };
  }

  /**
   * Create bad request response
   */
  private createBadRequestResponse(message: string): GatewayResponse {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        error: 'Bad Request',
        message,
        timestamp: new Date().toISOString()
      },
      duration: 0
    };
  }
}