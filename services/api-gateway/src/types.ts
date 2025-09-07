import { UUID } from '@devflow/shared-types';

export interface RequestContext {
  requestId: UUID;
  userId?: UUID;
  teamId?: UUID;
  userAgent: string;
  ipAddress: string;
  timestamp: Date;
  route: string;
  method: string;
}

export interface GatewayRequest {
  context: RequestContext;
  headers: Record<string, string>;
  query: Record<string, any>;
  body: any;
  params: Record<string, string>;
}

export interface GatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  duration: number;
}

export interface ServiceEndpoint {
  id: UUID;
  name: string;
  url: string;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  responseTime: number;
  weight: number;
}

export interface LoadBalancerState {
  endpoints: ServiceEndpoint[];
  currentIndex: number;
  connectionCounts: Map<UUID, number>;
}