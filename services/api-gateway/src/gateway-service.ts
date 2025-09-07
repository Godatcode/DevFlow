import { UUID } from '@devflow/shared-types';
import { APIGatewayConfig, RouteDefinition } from './interfaces';
import { GatewayRequest, GatewayResponse, ServiceEndpoint } from './types';
import { RequestRouter, RequestRouterConfig } from './routing/request-router';
import { LoadBalancer } from './load-balancing/load-balancer';

export interface GatewayServiceConfig {
  port: number;
  host: string;
  requestTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export class GatewayService {
  private config: APIGatewayConfig;
  private serviceConfig: GatewayServiceConfig;
  private requestRouter: RequestRouter;
  private serviceEndpoints: Map<string, ServiceEndpoint[]> = new Map();

  constructor(config: APIGatewayConfig, serviceConfig: GatewayServiceConfig) {
    this.config = config;
    this.serviceConfig = serviceConfig;

    const routerConfig: RequestRouterConfig = {
      defaultTimeout: serviceConfig.requestTimeout,
      maxRetries: serviceConfig.maxRetries,
      retryDelay: serviceConfig.retryDelay
    };

    this.requestRouter = new RequestRouter(config.routes, routerConfig);
    this.initializeLoadBalancers();
  }

  /**
   * Process incoming gateway request
   */
  async processRequest(request: GatewayRequest): Promise<GatewayResponse> {
    try {
      // Route the request
      const routingResult = await this.requestRouter.routeRequest(request);
      
      if (!routingResult) {
        return this.createErrorResponse(404, 'Route not found');
      }

      // Forward the request
      const response = await this.requestRouter.forwardRequest(request, routingResult);
      
      return response;

    } catch (error) {
      console.error('Gateway request processing error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('No healthy endpoints')) {
          return this.createErrorResponse(503, 'Service unavailable');
        }
        if (error.message.includes('timeout')) {
          return this.createErrorResponse(504, 'Gateway timeout');
        }
      }

      return this.createErrorResponse(500, 'Internal server error');
    }
  }

  /**
   * Register service endpoints for load balancing
   */
  registerServiceEndpoints(serviceName: string, endpoints: ServiceEndpoint[]): void {
    this.serviceEndpoints.set(serviceName, endpoints);
    
    const loadBalancer = this.requestRouter.getLoadBalancer(serviceName);
    if (loadBalancer) {
      // Clear existing endpoints and add new ones
      const currentState = loadBalancer.getState();
      currentState.endpoints.forEach(ep => loadBalancer.removeEndpoint(ep.id));
      
      endpoints.forEach(endpoint => loadBalancer.addEndpoint(endpoint));
    }
  }

  /**
   * Add a single service endpoint
   */
  addServiceEndpoint(serviceName: string, endpoint: ServiceEndpoint): void {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    endpoints.push(endpoint);
    this.serviceEndpoints.set(serviceName, endpoints);

    const loadBalancer = this.requestRouter.getLoadBalancer(serviceName);
    if (loadBalancer) {
      loadBalancer.addEndpoint(endpoint);
    }
  }

  /**
   * Remove a service endpoint
   */
  removeServiceEndpoint(serviceName: string, endpointId: UUID): void {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    const filteredEndpoints = endpoints.filter(ep => ep.id !== endpointId);
    this.serviceEndpoints.set(serviceName, filteredEndpoints);

    const loadBalancer = this.requestRouter.getLoadBalancer(serviceName);
    if (loadBalancer) {
      loadBalancer.removeEndpoint(endpointId);
    }
  }

  /**
   * Update endpoint health status
   */
  updateEndpointHealth(serviceName: string, endpointId: UUID, status: 'healthy' | 'unhealthy' | 'unknown'): void {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    const endpoint = endpoints.find(ep => ep.id === endpointId);
    
    if (endpoint) {
      endpoint.healthStatus = status;
      endpoint.lastHealthCheck = new Date();
    }

    const loadBalancer = this.requestRouter.getLoadBalancer(serviceName);
    if (loadBalancer) {
      loadBalancer.updateEndpointHealth(endpointId, status);
    }
  }

  /**
   * Update gateway configuration
   */
  updateConfiguration(config: APIGatewayConfig): void {
    this.config = config;
    this.requestRouter.updateRoutes(config.routes);
    
    // Reinitialize load balancers with new configuration
    this.initializeLoadBalancers();
  }

  /**
   * Get current gateway configuration
   */
  getConfiguration(): APIGatewayConfig {
    return { ...this.config };
  }

  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): { healthy: number; unhealthy: number; unknown: number } {
    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    
    return endpoints.reduce(
      (acc, endpoint) => {
        acc[endpoint.healthStatus]++;
        return acc;
      },
      { healthy: 0, unhealthy: 0, unknown: 0 }
    );
  }

  /**
   * Get all registered services
   */
  getRegisteredServices(): string[] {
    return Array.from(this.serviceEndpoints.keys());
  }

  /**
   * Get load balancer statistics
   */
  getLoadBalancerStats(serviceName: string): any {
    const loadBalancer = this.requestRouter.getLoadBalancer(serviceName);
    if (!loadBalancer) {
      return null;
    }

    const state = loadBalancer.getState();
    return {
      totalEndpoints: state.endpoints.length,
      healthyEndpoints: state.endpoints.filter(ep => ep.healthStatus === 'healthy').length,
      currentIndex: state.currentIndex,
      connectionCounts: Object.fromEntries(state.connectionCounts)
    };
  }

  /**
   * Initialize load balancers for all services mentioned in routes
   */
  private initializeLoadBalancers(): void {
    const services = new Set(this.config.routes.map(route => route.targetService));
    
    services.forEach(serviceName => {
      const endpoints = this.serviceEndpoints.get(serviceName) || [];
      const loadBalancer = new LoadBalancer(this.config.loadBalancing, endpoints);
      this.requestRouter.registerLoadBalancer(serviceName, loadBalancer);
    });
  }

  /**
   * Create error response
   */
  private createErrorResponse(statusCode: number, message: string): GatewayResponse {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'X-Error': 'true'
      },
      body: {
        error: message,
        timestamp: new Date().toISOString()
      },
      duration: 0
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.requestRouter.destroy();
  }
}