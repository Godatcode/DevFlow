import { UUID } from '@devflow/shared-types';
import { GatewayRequest, GatewayResponse } from '../types';
import { JWTAuthenticator, JWTPayload } from './jwt-auth';
import { RBACAuthorizer, AuthorizationContext } from './rbac';
import { MFAManager, MFAConfig } from './mfa';

export interface AuthMiddlewareConfig {
  jwt: {
    secret: string;
    issuer: string;
    audience: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  mfa: MFAConfig;
  publicPaths: string[];
  skipAuthPaths: string[];
}

export interface AuthenticatedRequest extends GatewayRequest {
  user?: JWTPayload;
  isAuthenticated: boolean;
  authError?: string;
}

export interface AuthMiddlewareResult {
  success: boolean;
  request: AuthenticatedRequest;
  response?: GatewayResponse;
  error?: string;
}

export class AuthMiddleware {
  private jwtAuth: JWTAuthenticator;
  private rbac: RBACAuthorizer;
  private mfa: MFAManager;
  private config: AuthMiddlewareConfig;

  constructor(config: AuthMiddlewareConfig) {
    this.config = config;
    this.jwtAuth = new JWTAuthenticator(config.jwt);
    this.rbac = new RBACAuthorizer();
    this.mfa = new MFAManager(config.mfa);
  }

  /**
   * Process authentication middleware
   */
  async processAuthentication(request: GatewayRequest): Promise<AuthMiddlewareResult> {
    const authenticatedRequest: AuthenticatedRequest = {
      ...request,
      isAuthenticated: false
    };

    // Check if path requires authentication
    if (this.isPublicPath(request.context.route)) {
      return {
        success: true,
        request: authenticatedRequest
      };
    }

    // Skip authentication for certain paths
    if (this.shouldSkipAuth(request.context.route)) {
      return {
        success: true,
        request: authenticatedRequest
      };
    }

    // Extract token from Authorization header
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];
    if (!authHeader) {
      return {
        success: false,
        request: authenticatedRequest,
        response: this.createUnauthorizedResponse('Missing authorization header'),
        error: 'Missing authorization header'
      };
    }

    const token = this.jwtAuth.extractTokenFromHeader(authHeader);
    if (!token) {
      return {
        success: false,
        request: authenticatedRequest,
        response: this.createUnauthorizedResponse('Invalid authorization header format'),
        error: 'Invalid authorization header format'
      };
    }

    // Verify JWT token
    const authResult = await this.jwtAuth.verifyToken(token);
    if (!authResult.success || !authResult.payload) {
      return {
        success: false,
        request: authenticatedRequest,
        response: this.createUnauthorizedResponse(authResult.error || 'Invalid token'),
        error: authResult.error
      };
    }

    // Check MFA if required
    const mfaRequired = this.mfa.isMFARequired(authResult.payload.sub, authResult.payload.roles);
    if (mfaRequired && !this.isMFAVerified(request)) {
      return {
        success: false,
        request: authenticatedRequest,
        response: this.createMFARequiredResponse(),
        error: 'MFA verification required'
      };
    }

    // Set authenticated user
    authenticatedRequest.user = authResult.payload;
    authenticatedRequest.isAuthenticated = true;

    return {
      success: true,
      request: authenticatedRequest
    };
  }

  /**
   * Process authorization middleware
   */
  async processAuthorization(
    request: AuthenticatedRequest, 
    resource: string, 
    action: string,
    resourceId?: UUID
  ): Promise<AuthMiddlewareResult> {
    // Skip authorization for unauthenticated requests on public paths
    if (!request.isAuthenticated && this.isPublicPath(request.context.route)) {
      return {
        success: true,
        request
      };
    }

    // Require authentication for authorization
    if (!request.isAuthenticated || !request.user) {
      return {
        success: false,
        request,
        response: this.createUnauthorizedResponse('Authentication required'),
        error: 'Authentication required'
      };
    }

    // Create authorization context
    const authContext: AuthorizationContext = {
      user: request.user,
      resource,
      action,
      resourceId,
      teamId: request.user.teamId,
      metadata: {
        path: request.context.route,
        method: request.context.method,
        ip: request.context.ipAddress
      }
    };

    // Check authorization
    const authzResult = this.rbac.authorize(authContext);
    if (!authzResult.allowed) {
      return {
        success: false,
        request,
        response: this.createForbiddenResponse(authzResult.reason || 'Access denied'),
        error: authzResult.reason
      };
    }

    return {
      success: true,
      request
    };
  }

  /**
   * Generate access token
   */
  async generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
    return this.jwtAuth.generateToken(payload);
  }

  /**
   * Generate refresh token
   */
  async generateRefreshToken(userId: UUID): Promise<string> {
    return this.jwtAuth.generateRefreshToken(userId);
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    refreshToken: string, 
    userPayload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    return this.jwtAuth.refreshAccessToken(refreshToken, userPayload);
  }

  /**
   * Get RBAC authorizer
   */
  getRBACAuthorizer(): RBACAuthorizer {
    return this.rbac;
  }

  /**
   * Get MFA manager
   */
  getMFAManager(): MFAManager {
    return this.mfa;
  }

  /**
   * Check if path is public (no authentication required)
   */
  private isPublicPath(path: string): boolean {
    return this.config.publicPaths.some(publicPath => {
      if (publicPath.endsWith('*')) {
        return path.startsWith(publicPath.slice(0, -1));
      }
      return path === publicPath;
    });
  }

  /**
   * Check if authentication should be skipped for path
   */
  private shouldSkipAuth(path: string): boolean {
    return this.config.skipAuthPaths.some(skipPath => {
      if (skipPath.endsWith('*')) {
        return path.startsWith(skipPath.slice(0, -1));
      }
      return path === skipPath;
    });
  }

  /**
   * Check if MFA is verified (simplified check)
   */
  private isMFAVerified(request: GatewayRequest): boolean {
    // In a real implementation, check for MFA session or token
    const mfaHeader = request.headers['x-mfa-verified'] || request.headers['X-MFA-Verified'];
    return mfaHeader === 'true';
  }

  /**
   * Create unauthorized response
   */
  private createUnauthorizedResponse(message: string): GatewayResponse {
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer'
      },
      body: {
        error: 'Unauthorized',
        message,
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
   * Create MFA required response
   */
  private createMFARequiredResponse(): GatewayResponse {
    return {
      statusCode: 428,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        error: 'MFA Required',
        message: 'Multi-factor authentication is required',
        timestamp: new Date().toISOString()
      },
      duration: 0
    };
  }
}