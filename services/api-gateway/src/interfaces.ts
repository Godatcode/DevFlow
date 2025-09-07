import { UUID } from '@devflow/shared-types';

export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
  HEAD = 'HEAD'
}

export interface RouteDefinition {
  path: string;
  method: HttpMethod;
  targetService: string;
  authRequired: boolean;
  rateLimit?: RateLimitConfig;
  timeout?: number;
  retries?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface AuthProvider {
  name: string;
  type: 'jwt' | 'oauth2' | 'api-key';
  config: Record<string, any>;
}

export interface SecurityPolicy {
  name: string;
  rules: SecurityRule[];
  enabled: boolean;
}

export interface SecurityRule {
  type: 'cors' | 'csrf' | 'xss' | 'rate-limit' | 'ip-whitelist';
  config: Record<string, any>;
}

export interface APIGatewayConfig {
  routes: RouteDefinition[];
  authProviders: AuthProvider[];
  rateLimits: RateLimitConfig[];
  securityPolicies: SecurityPolicy[];
  loadBalancing: LoadBalancingConfig;
}

export interface LoadBalancingConfig {
  strategy: 'round-robin' | 'least-connections' | 'weighted';
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    path: string;
  };
}