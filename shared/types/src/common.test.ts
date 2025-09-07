import { describe, it, expect } from 'vitest';
import { Status, ErrorType } from './common';

describe('Common Types', () => {
  it('should have correct Status enum values', () => {
    expect(Status.ACTIVE).toBe('active');
    expect(Status.INACTIVE).toBe('inactive');
    expect(Status.PENDING).toBe('pending');
    expect(Status.COMPLETED).toBe('completed');
    expect(Status.FAILED).toBe('failed');
    expect(Status.CANCELLED).toBe('cancelled');
  });

  it('should have correct ErrorType enum values', () => {
    expect(ErrorType.VALIDATION).toBe('validation');
    expect(ErrorType.AUTHENTICATION).toBe('authentication');
    expect(ErrorType.AUTHORIZATION).toBe('authorization');
    expect(ErrorType.NOT_FOUND).toBe('not_found');
    expect(ErrorType.CONFLICT).toBe('conflict');
    expect(ErrorType.INTERNAL_SERVER).toBe('internal_server');
    expect(ErrorType.EXTERNAL_SERVICE).toBe('external_service');
    expect(ErrorType.RATE_LIMIT).toBe('rate_limit');
  });
});