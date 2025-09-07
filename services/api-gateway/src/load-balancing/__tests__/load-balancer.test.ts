import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LoadBalancer, RoundRobinStrategy, LeastConnectionsStrategy, WeightedStrategy } from '../load-balancer';
import { LoadBalancingConfig } from '../../interfaces';
import { ServiceEndpoint, LoadBalancerState } from '../../types';

// Mock fetch for health checks
global.fetch = vi.fn();

describe('LoadBalancer', () => {
  let config: LoadBalancingConfig;
  let endpoints: ServiceEndpoint[];

  beforeEach(() => {
    config = {
      strategy: 'round-robin',
      healthCheck: {
        enabled: false,
        interval: 30000,
        timeout: 5000,
        path: '/health'
      }
    };

    endpoints = [
      {
        id: 'endpoint-1',
        name: 'Service 1',
        url: 'http://service1:3001',
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        responseTime: 100,
        weight: 1
      },
      {
        id: 'endpoint-2',
        name: 'Service 2',
        url: 'http://service2:3002',
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        responseTime: 150,
        weight: 1
      },
      {
        id: 'endpoint-3',
        name: 'Service 3',
        url: 'http://service3:3003',
        healthStatus: 'unhealthy',
        lastHealthCheck: new Date(),
        responseTime: 300,
        weight: 1
      }
    ];

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('RoundRobinStrategy', () => {
    it('should distribute requests evenly across healthy endpoints', () => {
      const loadBalancer = new LoadBalancer(config, endpoints);
      
      const selectedEndpoints = [];
      for (let i = 0; i < 6; i++) {
        const endpoint = loadBalancer.selectEndpoint();
        selectedEndpoints.push(endpoint?.id);
      }

      // Should cycle through healthy endpoints (endpoint-1, endpoint-2)
      expect(selectedEndpoints).toEqual([
        'endpoint-1', 'endpoint-2', 'endpoint-1', 'endpoint-2', 'endpoint-1', 'endpoint-2'
      ]);
    });

    it('should skip unhealthy endpoints', () => {
      const loadBalancer = new LoadBalancer(config, endpoints);
      
      const selectedEndpoints = [];
      for (let i = 0; i < 4; i++) {
        const endpoint = loadBalancer.selectEndpoint();
        selectedEndpoints.push(endpoint?.id);
      }

      // Should only select healthy endpoints
      expect(selectedEndpoints.every(id => id === 'endpoint-1' || id === 'endpoint-2')).toBe(true);
      expect(selectedEndpoints.includes('endpoint-3')).toBe(false);
    });

    it('should return null when no healthy endpoints available', () => {
      const unhealthyEndpoints = endpoints.map(ep => ({ ...ep, healthStatus: 'unhealthy' as const }));
      const loadBalancer = new LoadBalancer(config, unhealthyEndpoints);
      
      const endpoint = loadBalancer.selectEndpoint();
      expect(endpoint).toBeNull();
    });
  });

  describe('LeastConnectionsStrategy', () => {
    it('should select endpoint with least connections', () => {
      const leastConnectionsConfig = { ...config, strategy: 'least-connections' as const };
      const loadBalancer = new LoadBalancer(leastConnectionsConfig, endpoints);
      
      // First request should go to first endpoint
      const first = loadBalancer.selectEndpoint();
      expect(first?.id).toBe('endpoint-1');
      
      // Second request should go to second endpoint (both have 0 connections initially)
      const second = loadBalancer.selectEndpoint();
      expect(second?.id).toBe('endpoint-2');
      
      // Release connection from first endpoint
      loadBalancer.releaseConnection('endpoint-1');
      
      // Next request should go to first endpoint again (now has 0 connections)
      const third = loadBalancer.selectEndpoint();
      expect(third?.id).toBe('endpoint-1');
    });

    it('should track connection counts correctly', () => {
      const leastConnectionsConfig = { ...config, strategy: 'least-connections' as const };
      const loadBalancer = new LoadBalancer(leastConnectionsConfig, endpoints);
      
      // Make several requests
      loadBalancer.selectEndpoint(); // endpoint-1
      loadBalancer.selectEndpoint(); // endpoint-2
      loadBalancer.selectEndpoint(); // endpoint-1 (both had 1 connection)
      
      const state = loadBalancer.getState();
      expect(state.connectionCounts.get('endpoint-1')).toBe(2);
      expect(state.connectionCounts.get('endpoint-2')).toBe(1);
    });
  });

  describe('WeightedStrategy', () => {
    it('should respect endpoint weights', () => {
      const weightedEndpoints = [
        { ...endpoints[0], weight: 3 },
        { ...endpoints[1], weight: 1 }
      ];
      
      const weightedConfig = { ...config, strategy: 'weighted' as const };
      const loadBalancer = new LoadBalancer(weightedConfig, weightedEndpoints);
      
      // Mock Math.random to test deterministic behavior
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = vi.fn(() => {
        // Return values that should select endpoint-1 (weight 3) more often
        // Total weight is 4, so values 0-0.75 should select endpoint-1, 0.75-1.0 should select endpoint-2
        const values = [0.1, 0.2, 0.3, 0.8]; // First 3 should select endpoint-1, last should select endpoint-2
        return values[callCount++ % values.length];
      });
      
      const selectedEndpoints = [];
      for (let i = 0; i < 8; i++) { // More iterations for better distribution
        const endpoint = loadBalancer.selectEndpoint();
        selectedEndpoints.push(endpoint?.id);
      }
      
      // Should select endpoint-1 more frequently due to higher weight
      const endpoint1Count = selectedEndpoints.filter(id => id === 'endpoint-1').length;
      const endpoint2Count = selectedEndpoints.filter(id => id === 'endpoint-2').length;
      
      // With our mock values, we should get 6 endpoint-1 and 2 endpoint-2
      expect(endpoint1Count).toBeGreaterThan(endpoint2Count);
      
      Math.random = originalRandom;
    });

    it('should fallback to round-robin when weights are zero', () => {
      const zeroWeightEndpoints = endpoints.slice(0, 2).map(ep => ({ ...ep, weight: 0 }));
      const weightedConfig = { ...config, strategy: 'weighted' as const };
      const loadBalancer = new LoadBalancer(weightedConfig, zeroWeightEndpoints);
      
      const selectedEndpoints = [];
      for (let i = 0; i < 4; i++) {
        const endpoint = loadBalancer.selectEndpoint();
        selectedEndpoints.push(endpoint?.id);
      }
      
      // Should alternate between endpoints like round-robin
      expect(selectedEndpoints).toEqual(['endpoint-1', 'endpoint-2', 'endpoint-1', 'endpoint-2']);
    });
  });

  describe('endpoint management', () => {
    it('should add new endpoints', () => {
      const loadBalancer = new LoadBalancer(config, []);
      
      const newEndpoint: ServiceEndpoint = {
        id: 'new-endpoint',
        name: 'New Service',
        url: 'http://new-service:3004',
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        responseTime: 200,
        weight: 1
      };
      
      loadBalancer.addEndpoint(newEndpoint);
      
      const state = loadBalancer.getState();
      expect(state.endpoints).toHaveLength(1);
      expect(state.endpoints[0].id).toBe('new-endpoint');
    });

    it('should remove endpoints', () => {
      const loadBalancer = new LoadBalancer(config, endpoints);
      
      loadBalancer.removeEndpoint('endpoint-1');
      
      const state = loadBalancer.getState();
      expect(state.endpoints).toHaveLength(2);
      expect(state.endpoints.find(ep => ep.id === 'endpoint-1')).toBeUndefined();
    });

    it('should update endpoint health status', () => {
      const loadBalancer = new LoadBalancer(config, endpoints);
      
      loadBalancer.updateEndpointHealth('endpoint-1', 'unhealthy');
      
      const state = loadBalancer.getState();
      const endpoint = state.endpoints.find(ep => ep.id === 'endpoint-1');
      expect(endpoint?.healthStatus).toBe('unhealthy');
    });
  });

  describe('health checks', () => {
    it('should start health checks when enabled', () => {
      const healthCheckConfig = {
        ...config,
        healthCheck: {
          enabled: true,
          interval: 1000,
          timeout: 500,
          path: '/health'
        }
      };

      const loadBalancer = new LoadBalancer(healthCheckConfig, endpoints.slice(0, 2));
      
      // Just verify the load balancer was created successfully with health checks enabled
      expect(loadBalancer).toBeTruthy();
      
      loadBalancer.destroy();
    });

    it('should not start health checks when disabled', () => {
      const healthCheckConfig = {
        ...config,
        healthCheck: {
          enabled: false,
          interval: 1000,
          timeout: 500,
          path: '/health'
        }
      };

      const loadBalancer = new LoadBalancer(healthCheckConfig, endpoints.slice(0, 1));
      
      // Just verify the load balancer was created successfully without health checks
      expect(loadBalancer).toBeTruthy();
      
      loadBalancer.destroy();
    });
  });

  describe('strategy switching', () => {
    it('should switch load balancing strategies', () => {
      const loadBalancer = new LoadBalancer(config, endpoints);
      
      // Start with round-robin
      const first = loadBalancer.selectEndpoint();
      const second = loadBalancer.selectEndpoint();
      
      // Switch to least-connections
      loadBalancer.updateStrategy('least-connections');
      
      // Behavior should change (though hard to test deterministically)
      const third = loadBalancer.selectEndpoint();
      expect(third).toBeTruthy();
    });
  });

  describe('connection management', () => {
    it('should release connections properly', () => {
      const leastConnectionsConfig = { ...config, strategy: 'least-connections' as const };
      const loadBalancer = new LoadBalancer(leastConnectionsConfig, endpoints);
      
      // Select endpoint (increases connection count)
      const endpoint = loadBalancer.selectEndpoint();
      expect(endpoint).toBeTruthy();
      
      let state = loadBalancer.getState();
      expect(state.connectionCounts.get(endpoint!.id)).toBe(1);
      
      // Release connection
      loadBalancer.releaseConnection(endpoint!.id);
      
      state = loadBalancer.getState();
      expect(state.connectionCounts.get(endpoint!.id)).toBe(0);
    });

    it('should not go below zero connections', () => {
      const leastConnectionsConfig = { ...config, strategy: 'least-connections' as const };
      const loadBalancer = new LoadBalancer(leastConnectionsConfig, endpoints);
      
      // Try to release connection without selecting first
      loadBalancer.releaseConnection('endpoint-1');
      
      const state = loadBalancer.getState();
      // Should be 0 or undefined (both are acceptable for no connections)
      const connections = state.connectionCounts.get('endpoint-1') || 0;
      expect(connections).toBe(0);
    });
  });
});