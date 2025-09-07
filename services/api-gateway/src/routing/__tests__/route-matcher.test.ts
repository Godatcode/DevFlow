import { describe, it, expect, beforeEach } from 'vitest';
import { RouteMatcher } from '../route-matcher';
import { RouteDefinition, HttpMethod } from '../../interfaces';

describe('RouteMatcher', () => {
  let routeMatcher: RouteMatcher;
  let routes: RouteDefinition[];

  beforeEach(() => {
    routes = [
      {
        path: '/api/users/:id',
        method: HttpMethod.GET,
        targetService: 'user-service',
        authRequired: true
      },
      {
        path: '/api/users',
        method: HttpMethod.GET,
        targetService: 'user-service',
        authRequired: true
      },
      {
        path: '/api/users',
        method: HttpMethod.POST,
        targetService: 'user-service',
        authRequired: true
      },
      {
        path: '/api/projects/:projectId/workflows/:workflowId',
        method: HttpMethod.GET,
        targetService: 'orchestration-service',
        authRequired: true
      },
      {
        path: '/api/health/*',
        method: HttpMethod.GET,
        targetService: 'health-service',
        authRequired: false
      },
      {
        path: '/api/public/status',
        method: HttpMethod.GET,
        targetService: 'status-service',
        authRequired: false
      }
    ];

    routeMatcher = new RouteMatcher(routes);
  });

  describe('findMatch', () => {
    it('should match exact paths', () => {
      const match = routeMatcher.findMatch('/api/users', HttpMethod.GET);
      
      expect(match).toBeTruthy();
      expect(match!.route.path).toBe('/api/users');
      expect(match!.route.method).toBe(HttpMethod.GET);
      expect(match!.params).toEqual({});
    });

    it('should match paths with parameters', () => {
      const match = routeMatcher.findMatch('/api/users/123', HttpMethod.GET);
      
      expect(match).toBeTruthy();
      expect(match!.route.path).toBe('/api/users/:id');
      expect(match!.params).toEqual({ id: '123' });
    });

    it('should match paths with multiple parameters', () => {
      const match = routeMatcher.findMatch('/api/projects/proj-123/workflows/wf-456', HttpMethod.GET);
      
      expect(match).toBeTruthy();
      expect(match!.route.path).toBe('/api/projects/:projectId/workflows/:workflowId');
      expect(match!.params).toEqual({ 
        projectId: 'proj-123', 
        workflowId: 'wf-456' 
      });
    });

    it('should match wildcard paths', () => {
      const match = routeMatcher.findMatch('/api/health/check', HttpMethod.GET);
      
      expect(match).toBeTruthy();
      expect(match!.route.path).toBe('/api/health/*');
      expect(match!.params).toEqual({});
    });

    it('should distinguish between HTTP methods', () => {
      const getMatch = routeMatcher.findMatch('/api/users', HttpMethod.GET);
      const postMatch = routeMatcher.findMatch('/api/users', HttpMethod.POST);
      
      expect(getMatch).toBeTruthy();
      expect(postMatch).toBeTruthy();
      expect(getMatch!.route.method).toBe(HttpMethod.GET);
      expect(postMatch!.route.method).toBe(HttpMethod.POST);
    });

    it('should return null for non-matching paths', () => {
      const match = routeMatcher.findMatch('/api/nonexistent', HttpMethod.GET);
      expect(match).toBeNull();
    });

    it('should return null for non-matching methods', () => {
      const match = routeMatcher.findMatch('/api/users', HttpMethod.DELETE);
      expect(match).toBeNull();
    });

    it('should prioritize more specific routes', () => {
      // Both /api/users and /api/users/:id could match, but exact match should win
      const exactMatch = routeMatcher.findMatch('/api/users', HttpMethod.GET);
      expect(exactMatch!.route.path).toBe('/api/users');
      
      const paramMatch = routeMatcher.findMatch('/api/users/123', HttpMethod.GET);
      expect(paramMatch!.route.path).toBe('/api/users/:id');
    });
  });

  describe('updateRoutes', () => {
    it('should update routes configuration', () => {
      const newRoutes: RouteDefinition[] = [
        {
          path: '/api/new-endpoint',
          method: HttpMethod.GET,
          targetService: 'new-service',
          authRequired: false
        }
      ];

      routeMatcher.updateRoutes(newRoutes);
      
      const match = routeMatcher.findMatch('/api/new-endpoint', HttpMethod.GET);
      expect(match).toBeTruthy();
      expect(match!.route.targetService).toBe('new-service');
      
      // Old routes should no longer match
      const oldMatch = routeMatcher.findMatch('/api/users', HttpMethod.GET);
      expect(oldMatch).toBeNull();
    });
  });

  describe('route specificity', () => {
    it('should calculate correct specificity scores', () => {
      const specificRoutes: RouteDefinition[] = [
        {
          path: '/api/users/:id/profile',
          method: HttpMethod.GET,
          targetService: 'service1',
          authRequired: true
        },
        {
          path: '/api/users/*/profile',
          method: HttpMethod.GET,
          targetService: 'service2',
          authRequired: true
        },
        {
          path: '/api/users/current/profile',
          method: HttpMethod.GET,
          targetService: 'service3',
          authRequired: true
        }
      ];

      const matcher = new RouteMatcher(specificRoutes);
      
      // Most specific (exact match) should win
      const exactMatch = matcher.findMatch('/api/users/current/profile', HttpMethod.GET);
      expect(exactMatch!.route.targetService).toBe('service3');
      
      // Parameter match should be next
      const paramMatch = matcher.findMatch('/api/users/123/profile', HttpMethod.GET);
      expect(paramMatch!.route.targetService).toBe('service1');
    });
  });

  describe('edge cases', () => {
    it('should handle empty path segments', () => {
      const match = routeMatcher.findMatch('/api//users', HttpMethod.GET);
      // Empty segments are filtered out, so this should match /api/users
      expect(match).toBeTruthy();
      expect(match!.route.path).toBe('/api/users');
    });

    it('should handle trailing slashes', () => {
      const match = routeMatcher.findMatch('/api/users/', HttpMethod.GET);
      // Trailing slashes are filtered out, so this should match /api/users
      expect(match).toBeTruthy();
      expect(match!.route.path).toBe('/api/users');
    });

    it('should handle root path', () => {
      const rootRoutes: RouteDefinition[] = [
        {
          path: '/',
          method: HttpMethod.GET,
          targetService: 'root-service',
          authRequired: false
        }
      ];

      const matcher = new RouteMatcher(rootRoutes);
      const match = matcher.findMatch('/', HttpMethod.GET);
      
      expect(match).toBeTruthy();
      expect(match!.route.targetService).toBe('root-service');
    });

    it('should handle complex parameter names', () => {
      const complexRoutes: RouteDefinition[] = [
        {
          path: '/api/users/:userId/teams/:teamId',
          method: HttpMethod.GET,
          targetService: 'team-service',
          authRequired: true
        }
      ];

      const matcher = new RouteMatcher(complexRoutes);
      const match = matcher.findMatch('/api/users/user-123/teams/team-456', HttpMethod.GET);
      
      expect(match).toBeTruthy();
      expect(match!.params).toEqual({
        userId: 'user-123',
        teamId: 'team-456'
      });
    });
  });
});