import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RequestRouter, RequestRouterConfig } from '../request-router';
import { LoadBalancer } from '../../load-balancing/load-balancer';
import { RouteDefinition, HttpMethod, LoadBalancingConfig } from '../../interfaces';
import { GatewayRequest, ServiceEndpoint } from '../../types';

// Mock fetch
global.fetch = vi.fn();

describe('RequestRouter', () => {
  let router: RequestRouter;
  let routes: RouteDefinition[];
  let config: RequestRouterConfig;
  let mockRequest: GatewayRequest;

  beforeEach(() => {
    routes = [
      {
        path: '/api/users/:id',
        method: HttpMethod.GET,
        targetService: 'user-service',
        authRequired: true,
        timeout: 5000,
        retries: 2
      },
      {
        path: '/api/workflows',
        method: HttpMethod.POST,
        targetService: 'orchestration-service',
        authRequired: true
      }
    ];

    config = {
      defaultTimeout: 10000,
      maxRetries: 3,
      retryDelay: 1000
    };

    router = new RequestRouter(routes, config);

    mockRequest = {
      context: {
        requestId: 'req-123',
        userId: 'user-456',
        teamId: 'team-789',
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
        timestamp: new Date(),
        route: '/api/users/123',
        method: 'GET'
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      },
      query: {
        include: 'profile'
      },
      body: null,
      params: {}
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    router.destroy();
  });

  describe('routeRequest', () => {
    it('should route request to correct service', async () => {
      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };

      const endpoints: ServiceEndpoint[] = [
        {
          id: 'endpoint-1',
          name: 'User Service 1',
          url: 'http://user-service:3001',
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          responseTime: 100,
          weight: 1
        }
      ];

      const loadBalancer = new LoadBalancer(loadBalancerConfig, endpoints);
      router.registerLoadBalancer('user-service', loadBalancer);

      const result = await router.routeRequest(mockRequest);

      expect(result).toBeTruthy();
      expect(result!.endpoint.id).toBe('endpoint-1');
      expect(result!.route.targetService).toBe('user-service');
      expect(result!.params).toEqual({ id: '123' });
    });

    it('should return null for non-matching routes', async () => {
      mockRequest.context.route = '/api/nonexistent';
      
      const result = await router.routeRequest(mockRequest);
      expect(result).toBeNull();
    });

    it('should throw error when no load balancer configured', async () => {
      await expect(router.routeRequest(mockRequest)).rejects.toThrow(
        'No load balancer configured for service: user-service'
      );
    });

    it('should throw error when no healthy endpoints available', async () => {
      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };

      const loadBalancer = new LoadBalancer(loadBalancerConfig, []);
      router.registerLoadBalancer('user-service', loadBalancer);

      await expect(router.routeRequest(mockRequest)).rejects.toThrow(
        'No healthy endpoints available for service: user-service'
      );
    });
  });

  describe('forwardRequest', () => {
    let routingResult: any;
    let mockFetch: any;

    beforeEach(() => {
      routingResult = {
        endpoint: {
          id: 'endpoint-1',
          name: 'User Service 1',
          url: 'http://user-service:3001',
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          responseTime: 100,
          weight: 1
        },
        route: routes[0],
        params: { id: '123' }
      };

      mockFetch = vi.mocked(fetch);
    });

    it('should forward request successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: vi.fn().mockResolvedValue({ id: '123', name: 'John Doe' })
      };

      mockFetch.mockResolvedValue(mockResponse);

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      router.registerLoadBalancer('user-service', loadBalancer);

      const response = await router.forwardRequest(mockRequest, routingResult);

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({ id: '123', name: 'John Doe' });
      expect(response.duration).toBeGreaterThanOrEqual(0);

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        'http://user-service:3001/api/users/123?include=profile',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123',
            'X-Request-ID': 'req-123',
            'X-User-ID': 'user-456',
            'X-Team-ID': 'team-789'
          })
        })
      );
    });

    it('should handle POST requests with body', async () => {
      const postRequest = {
        ...mockRequest,
        context: {
          ...mockRequest.context,
          route: '/api/workflows',
          method: 'POST'
        },
        body: { name: 'Test Workflow', description: 'A test workflow' }
      };

      const postRoutingResult = {
        endpoint: routingResult.endpoint,
        route: routes[1],
        params: {}
      };

      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: vi.fn().mockResolvedValue({ id: 'wf-123', name: 'Test Workflow' })
      };

      mockFetch.mockResolvedValue(mockResponse);

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      router.registerLoadBalancer('orchestration-service', loadBalancer);

      const response = await router.forwardRequest(postRequest, postRoutingResult);

      expect(response.statusCode).toBe(201);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test Workflow', description: 'A test workflow' })
        })
      );
    });

    it('should handle different response content types', async () => {
      const textResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/plain']]),
        text: vi.fn().mockResolvedValue('Plain text response')
      };

      mockFetch.mockResolvedValue(textResponse);

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      router.registerLoadBalancer('user-service', loadBalancer);

      const response = await router.forwardRequest(mockRequest, routingResult);

      expect(response.body).toBe('Plain text response');
    });

    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: vi.fn().mockResolvedValue({ success: true })
        });

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      router.registerLoadBalancer('user-service', loadBalancer);

      const response = await router.forwardRequest(mockRequest, routingResult);

      expect(response.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    it('should throw error after max retries exceeded', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      router.registerLoadBalancer('user-service', loadBalancer);

      await expect(router.forwardRequest(mockRequest, routingResult)).rejects.toThrow(
        'Persistent network error'
      );

      expect(mockFetch).toHaveBeenCalledTimes(3); // maxRetries + 1
    });

    it('should release connection on completion', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: vi.fn().mockResolvedValue({ success: true })
      };

      mockFetch.mockResolvedValue(mockResponse);

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'least-connections',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      const releaseConnectionSpy = vi.spyOn(loadBalancer, 'releaseConnection');
      
      router.registerLoadBalancer('user-service', loadBalancer);

      await router.forwardRequest(mockRequest, routingResult);

      expect(releaseConnectionSpy).toHaveBeenCalledWith('endpoint-1');
    });

    it('should release connection on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'least-connections',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      const releaseConnectionSpy = vi.spyOn(loadBalancer, 'releaseConnection');
      
      router.registerLoadBalancer('user-service', loadBalancer);

      await expect(router.forwardRequest(mockRequest, routingResult)).rejects.toThrow();

      expect(releaseConnectionSpy).toHaveBeenCalledWith('endpoint-1');
    });
  });

  describe('configuration management', () => {
    it('should update routes', () => {
      const newRoutes: RouteDefinition[] = [
        {
          path: '/api/new-endpoint',
          method: HttpMethod.GET,
          targetService: 'new-service',
          authRequired: false
        }
      ];

      router.updateRoutes(newRoutes);

      // Test that new route is available (indirectly through routing)
      const newRequest = {
        ...mockRequest,
        context: {
          ...mockRequest.context,
          route: '/api/new-endpoint'
        }
      };

      // This would throw if route wasn't found, but we expect load balancer error instead
      expect(async () => {
        await router.routeRequest(newRequest);
      }).rejects.toThrow('No load balancer configured');
    });

    it('should register and retrieve load balancers', () => {
      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, []);

      router.registerLoadBalancer('test-service', loadBalancer);

      const retrieved = router.getLoadBalancer('test-service');
      expect(retrieved).toBe(loadBalancer);

      const nonExistent = router.getLoadBalancer('non-existent');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('path building', () => {
    it('should build target path with parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: vi.fn().mockResolvedValue({ success: true })
      };

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(mockResponse);

      const routingResult = {
        endpoint: {
          id: 'endpoint-1',
          name: 'User Service 1',
          url: 'http://user-service:3001',
          healthStatus: 'healthy' as const,
          lastHealthCheck: new Date(),
          responseTime: 100,
          weight: 1
        },
        route: routes[0],
        params: { id: '123' }
      };

      const loadBalancerConfig: LoadBalancingConfig = {
        strategy: 'round-robin',
        healthCheck: { enabled: false, interval: 30000, timeout: 5000, path: '/health' }
      };
      const loadBalancer = new LoadBalancer(loadBalancerConfig, [routingResult.endpoint]);
      router.registerLoadBalancer('user-service', loadBalancer);

      await router.forwardRequest(mockRequest, routingResult);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://user-service:3001/api/users/123?include=profile',
        expect.any(Object)
      );
    });
  });
});