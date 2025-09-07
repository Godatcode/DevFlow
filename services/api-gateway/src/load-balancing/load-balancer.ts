import { UUID } from '@devflow/shared-types';
import { ServiceEndpoint, LoadBalancerState } from '../types';
import { LoadBalancingConfig } from '../interfaces';

export interface LoadBalancingStrategy {
  selectEndpoint(endpoints: ServiceEndpoint[], state: LoadBalancerState): ServiceEndpoint | null;
  updateState(endpoint: ServiceEndpoint, state: LoadBalancerState): void;
}

export class RoundRobinStrategy implements LoadBalancingStrategy {
  selectEndpoint(endpoints: ServiceEndpoint[], state: LoadBalancerState): ServiceEndpoint | null {
    const healthyEndpoints = endpoints.filter(ep => ep.healthStatus === 'healthy');
    
    if (healthyEndpoints.length === 0) {
      return null;
    }

    const selectedEndpoint = healthyEndpoints[state.currentIndex % healthyEndpoints.length];
    state.currentIndex = (state.currentIndex + 1) % healthyEndpoints.length;
    
    return selectedEndpoint;
  }

  updateState(endpoint: ServiceEndpoint, state: LoadBalancerState): void {
    // Round robin doesn't need to track additional state
  }
}

export class LeastConnectionsStrategy implements LoadBalancingStrategy {
  selectEndpoint(endpoints: ServiceEndpoint[], state: LoadBalancerState): ServiceEndpoint | null {
    const healthyEndpoints = endpoints.filter(ep => ep.healthStatus === 'healthy');
    
    if (healthyEndpoints.length === 0) {
      return null;
    }

    // Find endpoint with least connections
    let selectedEndpoint = healthyEndpoints[0];
    let minConnections = state.connectionCounts.get(selectedEndpoint.id) || 0;

    for (const endpoint of healthyEndpoints) {
      const connections = state.connectionCounts.get(endpoint.id) || 0;
      if (connections < minConnections) {
        selectedEndpoint = endpoint;
        minConnections = connections;
      }
    }

    return selectedEndpoint;
  }

  updateState(endpoint: ServiceEndpoint, state: LoadBalancerState): void {
    const currentCount = state.connectionCounts.get(endpoint.id) || 0;
    state.connectionCounts.set(endpoint.id, currentCount + 1);
  }
}

export class WeightedStrategy implements LoadBalancingStrategy {
  selectEndpoint(endpoints: ServiceEndpoint[], state: LoadBalancerState): ServiceEndpoint | null {
    const healthyEndpoints = endpoints.filter(ep => ep.healthStatus === 'healthy');
    
    if (healthyEndpoints.length === 0) {
      return null;
    }

    // Calculate total weight
    const totalWeight = healthyEndpoints.reduce((sum, ep) => sum + ep.weight, 0);
    
    if (totalWeight === 0) {
      // Fallback to round robin if no weights
      return new RoundRobinStrategy().selectEndpoint(endpoints, state);
    }

    // Generate random number and select based on weight
    const random = Math.random() * totalWeight;
    let currentWeight = 0;

    for (const endpoint of healthyEndpoints) {
      currentWeight += endpoint.weight;
      if (random <= currentWeight) {
        return endpoint;
      }
    }

    // Fallback to last endpoint
    return healthyEndpoints[healthyEndpoints.length - 1];
  }

  updateState(endpoint: ServiceEndpoint, state: LoadBalancerState): void {
    // Weighted strategy doesn't need to track additional state
  }
}

export class LoadBalancer {
  private strategy: LoadBalancingStrategy;
  private state: LoadBalancerState;
  private config: LoadBalancingConfig;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: LoadBalancingConfig, endpoints: ServiceEndpoint[] = []) {
    this.config = config;
    this.state = {
      endpoints,
      currentIndex: 0,
      connectionCounts: new Map()
    };

    this.strategy = this.createStrategy(config.strategy);
    
    if (config.healthCheck.enabled) {
      this.startHealthChecks();
    }
  }

  /**
   * Select the next endpoint for load balancing
   */
  selectEndpoint(): ServiceEndpoint | null {
    const endpoint = this.strategy.selectEndpoint(this.state.endpoints, this.state);
    
    if (endpoint) {
      this.strategy.updateState(endpoint, this.state);
    }

    return endpoint;
  }

  /**
   * Add a new endpoint to the load balancer
   */
  addEndpoint(endpoint: ServiceEndpoint): void {
    this.state.endpoints.push(endpoint);
  }

  /**
   * Remove an endpoint from the load balancer
   */
  removeEndpoint(endpointId: UUID): void {
    this.state.endpoints = this.state.endpoints.filter(ep => ep.id !== endpointId);
    this.state.connectionCounts.delete(endpointId);
  }

  /**
   * Update endpoint health status
   */
  updateEndpointHealth(endpointId: UUID, status: 'healthy' | 'unhealthy' | 'unknown'): void {
    const endpoint = this.state.endpoints.find(ep => ep.id === endpointId);
    if (endpoint) {
      endpoint.healthStatus = status;
      endpoint.lastHealthCheck = new Date();
    }
  }

  /**
   * Release a connection (for least connections strategy)
   */
  releaseConnection(endpointId: UUID): void {
    const currentCount = this.state.connectionCounts.get(endpointId) || 0;
    if (currentCount > 0) {
      this.state.connectionCounts.set(endpointId, currentCount - 1);
    }
  }

  /**
   * Get current load balancer state
   */
  getState(): LoadBalancerState {
    return { ...this.state };
  }

  /**
   * Update load balancing strategy
   */
  updateStrategy(strategy: 'round-robin' | 'least-connections' | 'weighted'): void {
    this.strategy = this.createStrategy(strategy);
    this.config.strategy = strategy;
  }

  /**
   * Start health checks for endpoints
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheck.interval);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Perform health checks on all endpoints
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = this.state.endpoints.map(async (endpoint) => {
      try {
        const startTime = Date.now();
        const response = await fetch(`${endpoint.url}${this.config.healthCheck.path}`, {
          method: 'GET',
          signal: AbortSignal.timeout(this.config.healthCheck.timeout)
        });

        const responseTime = Date.now() - startTime;
        endpoint.responseTime = responseTime;
        endpoint.healthStatus = response.ok ? 'healthy' : 'unhealthy';
        endpoint.lastHealthCheck = new Date();
      } catch (error) {
        endpoint.healthStatus = 'unhealthy';
        endpoint.lastHealthCheck = new Date();
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Create load balancing strategy instance
   */
  private createStrategy(strategyType: 'round-robin' | 'least-connections' | 'weighted'): LoadBalancingStrategy {
    switch (strategyType) {
      case 'round-robin':
        return new RoundRobinStrategy();
      case 'least-connections':
        return new LeastConnectionsStrategy();
      case 'weighted':
        return new WeightedStrategy();
      default:
        throw new Error(`Unknown load balancing strategy: ${strategyType}`);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthChecks();
  }
}