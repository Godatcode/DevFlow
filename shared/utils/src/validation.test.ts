import { describe, it, expect } from 'vitest';
import { ValidationUtils } from './validation';

describe('ValidationUtils', () => {
  describe('isValidUUID', () => {
    it('should validate correct UUIDs', () => {
      expect(ValidationUtils.isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(ValidationUtils.isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(ValidationUtils.isValidUUID('invalid-uuid')).toBe(false);
      expect(ValidationUtils.isValidUUID('123e4567-e89b-12d3-a456')).toBe(false);
      expect(ValidationUtils.isValidUUID('')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(ValidationUtils.isValidEmail('test@example.com')).toBe(true);
      expect(ValidationUtils.isValidEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(ValidationUtils.isValidEmail('invalid-email')).toBe(false);
      expect(ValidationUtils.isValidEmail('test@')).toBe(false);
      expect(ValidationUtils.isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('validateRequired', () => {
    it('should return value when not null/undefined', () => {
      expect(ValidationUtils.validateRequired('test', 'field')).toBe('test');
      expect(ValidationUtils.validateRequired(0, 'field')).toBe(0);
      expect(ValidationUtils.validateRequired(false, 'field')).toBe(false);
    });

    it('should throw error when null/undefined', () => {
      expect(() => ValidationUtils.validateRequired(null, 'field')).toThrow('field is required');
      expect(() => ValidationUtils.validateRequired(undefined, 'field')).toThrow('field is required');
    });
  });

  describe('validateStringLength', () => {
    it('should not throw for valid lengths', () => {
      expect(() => ValidationUtils.validateStringLength('test', 'field', 1, 10)).not.toThrow();
      expect(() => ValidationUtils.validateStringLength('', 'field', 0, 10)).not.toThrow();
    });

    it('should throw for invalid lengths', () => {
      expect(() => ValidationUtils.validateStringLength('', 'field', 1, 10)).toThrow();
      expect(() => ValidationUtils.validateStringLength('toolongstring', 'field', 1, 5)).toThrow();
    });
  });
});