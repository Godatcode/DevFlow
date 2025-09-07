// Common types used across the platform

export type UUID = string;
export type Timestamp = Date;

export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface BaseEntity {
  id: UUID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ErrorContext {
  service: string;
  operation: string;
  userId?: UUID;
  requestId?: string;
  metadata?: Record<string, any>;
}

export enum ErrorType {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  INTERNAL_SERVER = 'internal_server',
  EXTERNAL_SERVICE = 'external_service',
  RATE_LIMIT = 'rate_limit'
}

export interface CustomError extends Error {
  type: ErrorType;
  code: string;
  context?: ErrorContext;
  statusCode?: number;
}