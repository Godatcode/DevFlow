import { UUID } from '@devflow/shared-types';
import { RouteDefinition, HttpMethod } from '../interfaces';
import { GatewayRequest, GatewayResponse, ServiceEndpoint } from '../types';
import { RouteMatcher, RouteMatch } from './route-matcher';
import { LoadBalancer } from '../load-balancing/load-balancer';

export interface RoutingResult {
  endpoint: ServiceEndpoint;
  route: RouteDefinition;
  params: Record<string, string>;
}

export interface RequestRouterConfig {
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export class RequestRouter {
  private routeMatcher: RouteMatcher;
  private loadBalancers: Map<string, LoadBalancer> = new Map();
  private config: RequestRouterConfig;

  constructor(routes: RouteDefinition[], config: RequestRouterConfig) {
    this.routeMatcher = new RouteMatcher(routes);
    this.config = config;
  }

  /**
   * Route a request to the appropriate service endpoint
   */
  async routeRequest(request: GatewayRequest): Promise<RoutingResult | null> {
    const match = this.routeMatcher.findMatch(request.context.route, request.context.method as HttpMethod);
    
    if (!match) {
      return null;
    }

    const loadBalancer = this.loadBalancers.get(match.route.targetService);
    if (!loadBalancer) {
      throw new Error(`No load balancer configured for service: ${match.route.targetService}`);
    }

    const endpoint = loadBalancer.selectEndpoint();
    if (!endpoint) {
      throw new Error(`No healthy endpoints available for service: ${match.route.targetService}`);
    }

    return {
      endpoint,
      route: match.route,
      params: match.params
    };
  }

  /**
   * Forward request to the selected endpoint
   */
  async forwardRequest(
    request: GatewayRequest,
    routingResult: RoutingResult
  ): Promise<GatewayResponse> {
    const { endpoint, route, params } = routingResult;
    const startTime = Date.now();

    try {
      // Build target URL with path parameters
      const targetPath = this.buildTargetPath(request.context.route, params);
      const targetUrl = `${endpoint.url}${targetPath}`;

      // Add query parameters
      const url = new URL(targetUrl);
      Object.entries(request.query).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });

      // Prepare headers
      const headers = {
        ...request.headers,
        'X-Request-ID': request.context.requestId,
        'X-Forwarded-For': request.context.ipAddress,
        'X-User-Agent': request.context.userAgent
      };

      // Add user context if available
      if (request.context.userId) {
        headers['X-User-ID'] = request.context.userId;
      }
      if (request.context.teamId) {
        headers['X-Team-ID'] = request.context.teamId;
      }

      const timeout = route.timeout || this.config.defaultTimeout;
      const maxRetries = route.retries || this.config.maxRetries;

      const response = await this.executeWithRetry(
        () => this.makeRequest(url.toString(), request, headers, timeout),
        maxRetries
      );

      const duration = Date.now() - startTime;

      // Release connection for least connections strategy
      const loadBalancer = this.loadBalancers.get(route.targetService);
      if (loadBalancer) {
        loadBalancer.releaseConnection(endpoint.id);
      }

      return {
        statusCode: response.status,
        headers: this.extractResponseHeaders(response),
        body: await this.extractResponseBody(response),
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Release connection on error
      const loadBalancer = this.loadBalancers.get(route.targetService);
      if (loadBalancer) {
        loadBalancer.releaseConnection(endpoint.id);
      }

      throw error;
    }
  }

  /**
   * Register a load balancer for a service
   */
  registerLoadBalancer(serviceName: string, loadBalancer: LoadBalancer): void {
    this.loadBalancers.set(serviceName, loadBalancer);
  }

  /**
   * Update routes configuration
   */
  updateRoutes(routes: RouteDefinition[]): void {
    this.routeMatcher.updateRoutes(routes);
  }

  /**
   * Get load balancer for a service
   */
  getLoadBalancer(serviceName: string): LoadBalancer | undefined {
    return this.loadBalancers.get(serviceName);
  }

  /**
   * Build target path with parameters replaced
   */
  private buildTargetPath(originalPath: string, params: Record<string, string>): string {
    let targetPath = originalPath;
    
    Object.entries(params).forEach(([key, value]) => {
      targetPath = targetPath.replace(`:${key}`, value);
    });

    return targetPath;
  }

  /**
   * Make HTTP request to target service
   */
  private async makeRequest(
    url: string,
    request: GatewayRequest,
    headers: Record<string, string>,
    timeout: number
  ): Promise<Response> {
    const requestOptions: RequestInit = {
      method: request.context.method,
      headers,
      signal: AbortSignal.timeout(timeout)
    };

    // Add body for non-GET requests
    if (request.context.method !== 'GET' && request.context.method !== 'HEAD') {
      if (request.body) {
        requestOptions.body = typeof request.body === 'string' 
          ? request.body 
          : JSON.stringify(request.body);
        
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Extract response headers
   */
  private extractResponseHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return headers;
  }

  /**
   * Extract response body
   */
  private async extractResponseBody(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      return await response.json();
    } else if (contentType.includes('text/')) {
      return await response.text();
    } else {
      return await response.arrayBuffer();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.loadBalancers.forEach(loadBalancer => {
      loadBalancer.destroy();
    });
    this.loadBalancers.clear();
  }
}