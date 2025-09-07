import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthMiddleware, AuthMiddlewareConfig } from '../auth-middleware';
import { GatewayRequest } from '../../types';

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let config: AuthMiddlewareConfig;
  let mockRequest: GatewayRequest;

  beforeEach(() => {
    config = {
      jwt: {
        secret: 'test-secret',
        issuer: 'devflow.ai',
        audience: 'api.devflow.ai',
        expiresIn: '1h',
        refreshExpiresIn: '7d'
      },
      mfa: {
        enabled: true,
        methods: ['totp', 'backup-codes'],
        gracePeriod: 300,
        backupCodes: {
          enabled: true,
          count: 10
        }
      },
      publicPaths: ['/api/public/*', '/api/health'],
      skipAuthPaths: ['/api/auth/*']
    };

    authMiddleware = new AuthMiddleware(config);

    mockRequest = {
      context: {
        requestId: 'req-123',
        userId: 'user-456',
        teamId: 'team-789',
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        timestamp: new Date(),
        route: '/api/projects',
        method: 'GET'
      },
      headers: {
        'Content-Type': 'application/json'
      },
      query: {},
      body: null,
      params: {}
    };
  });

  describe('processAuthentication', () => {
    it('should allow access to public paths without authentication', async () => {
      const publicRequest = {
        ...mockRequest,
        context: { ...mockRequest.context, route: '/api/public/status' }
      };

      const result = await authMiddleware.processAuthentication(publicRequest);

      expect(result.success).toBe(true);
      expect(result.request.isAuthenticated).toBe(false);
      expect(result.response).toBeUndefined();
    });

    it('should skip authentication for configured paths', async () => {
      const skipAuthRequest = {
        ...mockRequest,
        context: { ...mockRequest.context, route: '/api/auth/login' }
      };

      const result = await authMiddleware.processAuthentication(skipAuthRequest);

      expect(result.success).toBe(true);
      expect(result.request.isAuthenticated).toBe(false);
      expect(result.response).toBeUndefined();
    });

    it('should return error for missing authorization header', async () => {
      const result = await authMiddleware.processAuthentication(mockRequest);

      expect(result.success).toBe(false);
      expect(result.request.isAuthenticated).toBe(false);
      expect(result.response?.statusCode).toBe(401);
      expect(result.error).toContain('authorization header');
    });

    it('should return error for invalid authorization header format', async () => {
      const requestWithInvalidAuth = {
        ...mockRequest,
        headers: { ...mockRequest.headers, authorization: 'InvalidFormat' }
      };

      const result = await authMiddleware.processAuthentication(requestWithInvalidAuth);

      expect(result.success).toBe(false);
      expect(result.response?.statusCode).toBe(401);
      expect(result.error).toContain('Invalid authorization header format');
    });

    it('should authenticate valid JWT token', async () => {
      // Generate a valid token first
      const userPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        roles: ['developer'],
        permissions: ['projects:read']
      };

      const token = await authMiddleware.generateAccessToken(userPayload);
      const requestWithValidAuth = {
        ...mockRequest,
        headers: { ...mockRequest.headers, authorization: `Bearer ${token}` }
      };

      const result = await authMiddleware.processAuthentication(requestWithValidAuth);

      expect(result.success).toBe(true);
      expect(result.request.isAuthenticated).toBe(true);
      expect(result.request.user).toBeTruthy();
      expect(result.request.user!.sub).toBe('user-123');
    });

    it('should return error for invalid JWT token', async () => {
      const requestWithInvalidToken = {
        ...mockRequest,
        headers: { ...mockRequest.headers, authorization: 'Bearer invalid-token' }
      };

      const result = await authMiddleware.processAuthentication(requestWithInvalidToken);

      expect(result.success).toBe(false);
      expect(result.response?.statusCode).toBe(401);
      expect(result.error).toBeTruthy();
    });

    it('should require MFA for admin users', async () => {
      const adminPayload = {
        sub: 'admin-123',
        email: 'admin@example.com',
        roles: ['super-admin'],
        permissions: ['*:*']
      };

      const token = await authMiddleware.generateAccessToken(adminPayload);
      const requestWithAdminToken = {
        ...mockRequest,
        headers: { ...mockRequest.headers, authorization: `Bearer ${token}` }
      };

      const result = await authMiddleware.processAuthentication(requestWithAdminToken);

      expect(result.success).toBe(false);
      expect(result.response?.statusCode).toBe(428); // MFA Required
      expect(result.error).toContain('MFA');
    });

    it('should allow MFA-verified admin users', async () => {
      const adminPayload = {
        sub: 'admin-123',
        email: 'admin@example.com',
        roles: ['super-admin'],
        permissions: ['*:*']
      };

      const token = await authMiddleware.generateAccessToken(adminPayload);
      const requestWithMFAVerified = {
        ...mockRequest,
        headers: { 
          ...mockRequest.headers, 
          authorization: `Bearer ${token}`,
          'x-mfa-verified': 'true'
        }
      };

      const result = await authMiddleware.processAuthentication(requestWithMFAVerified);

      expect(result.success).toBe(true);
      expect(result.request.isAuthenticated).toBe(true);
      expect(result.request.user!.roles).toContain('super-admin');
    });
  });

  describe('processAuthorization', () => {
    let authenticatedRequest: any;

    beforeEach(async () => {
      const userPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        teamId: 'team-456',
        roles: ['developer'],
        permissions: ['projects:read']
      };

      const token = await authMiddleware.generateAccessToken(userPayload);
      const requestWithAuth = {
        ...mockRequest,
        headers: { ...mockRequest.headers, authorization: `Bearer ${token}` }
      };

      const authResult = await authMiddleware.processAuthentication(requestWithAuth);
      authenticatedRequest = authResult.request;
    });

    it('should allow authorized access', async () => {
      const result = await authMiddleware.processAuthorization(
        authenticatedRequest,
        'projects',
        'read'
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeUndefined();
    });

    it('should deny unauthorized access', async () => {
      const result = await authMiddleware.processAuthorization(
        authenticatedRequest,
        'admin-panel',
        'write'
      );

      expect(result.success).toBe(false);
      expect(result.response?.statusCode).toBe(403);
      expect(result.error).toBeTruthy();
    });

    it('should require authentication for authorization', async () => {
      const unauthenticatedRequest = {
        ...mockRequest,
        isAuthenticated: false
      };

      const result = await authMiddleware.processAuthorization(
        unauthenticatedRequest,
        'projects',
        'read'
      );

      expect(result.success).toBe(false);
      expect(result.response?.statusCode).toBe(401);
    });

    it('should allow public path access without authentication', async () => {
      const publicRequest = {
        ...mockRequest,
        context: { ...mockRequest.context, route: '/api/public/status' },
        isAuthenticated: false
      };

      const result = await authMiddleware.processAuthorization(
        publicRequest,
        'public',
        'read'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('token management', () => {
    it('should generate access token', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        roles: ['developer'],
        permissions: ['projects:read']
      };

      const token = await authMiddleware.generateAccessToken(payload);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should generate refresh token', async () => {
      const userId = 'user-123';
      const refreshToken = await authMiddleware.generateRefreshToken(userId);

      expect(refreshToken).toBeTruthy();
      expect(typeof refreshToken).toBe('string');
    });

    it('should refresh access token', async () => {
      const userId = 'user-123';
      const userPayload = {
        sub: userId,
        email: 'test@example.com',
        roles: ['developer'],
        permissions: ['projects:read']
      };

      const refreshToken = await authMiddleware.generateRefreshToken(userId);
      const result = await authMiddleware.refreshAccessToken(refreshToken, userPayload);

      expect(result).toBeTruthy();
      expect(result!.accessToken).toBeTruthy();
      expect(result!.refreshToken).toBeTruthy();
    });
  });

  describe('path matching', () => {
    it('should match exact public paths', async () => {
      const exactPathRequest = {
        ...mockRequest,
        context: { ...mockRequest.context, route: '/api/health' }
      };

      const result = await authMiddleware.processAuthentication(exactPathRequest);

      expect(result.success).toBe(true);
      expect(result.request.isAuthenticated).toBe(false);
    });

    it('should match wildcard public paths', async () => {
      const wildcardPathRequest = {
        ...mockRequest,
        context: { ...mockRequest.context, route: '/api/public/anything/here' }
      };

      const result = await authMiddleware.processAuthentication(wildcardPathRequest);

      expect(result.success).toBe(true);
      expect(result.request.isAuthenticated).toBe(false);
    });

    it('should not match non-public paths', async () => {
      const privatePathRequest = {
        ...mockRequest,
        context: { ...mockRequest.context, route: '/api/private/data' }
      };

      const result = await authMiddleware.processAuthentication(privatePathRequest);

      expect(result.success).toBe(false);
      expect(result.response?.statusCode).toBe(401);
    });
  });

  describe('component access', () => {
    it('should provide access to RBAC authorizer', () => {
      const rbac = authMiddleware.getRBACAuthorizer();
      expect(rbac).toBeTruthy();
    });

    it('should provide access to MFA manager', () => {
      const mfa = authMiddleware.getMFAManager();
      expect(mfa).toBeTruthy();
    });
  });

  describe('error responses', () => {
    it('should create proper unauthorized response', async () => {
      const result = await authMiddleware.processAuthentication(mockRequest);

      expect(result.response?.statusCode).toBe(401);
      expect(result.response?.headers['Content-Type']).toBe('application/json');
      expect(result.response?.headers['WWW-Authenticate']).toBe('Bearer');
      expect(result.response?.body.error).toBe('Unauthorized');
    });

    it('should create proper forbidden response', async () => {
      const userPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        roles: ['viewer'],
        permissions: ['projects:read']
      };

      const token = await authMiddleware.generateAccessToken(userPayload);
      const requestWithAuth = {
        ...mockRequest,
        headers: { ...mockRequest.headers, authorization: `Bearer ${token}` }
      };

      const authResult = await authMiddleware.processAuthentication(requestWithAuth);
      const authzResult = await authMiddleware.processAuthorization(
        authResult.request,
        'admin-panel',
        'write'
      );

      expect(authzResult.response?.statusCode).toBe(403);
      expect(authzResult.response?.body.error).toBe('Forbidden');
    });
  });
});