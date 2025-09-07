import { UUID } from '@devflow/shared-types';

export class ValidationUtils {
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static validateRequired<T>(value: T | null | undefined, fieldName: string): T {
    if (value === null || value === undefined) {
      throw new Error(`${fieldName} is required`);
    }
    return value;
  }

  static validateStringLength(
    value: string,
    fieldName: string,
    minLength: number = 0,
    maxLength: number = Infinity
  ): void {
    if (value.length < minLength) {
      throw new Error(`${fieldName} must be at least ${minLength} characters long`);
    }
    if (value.length > maxLength) {
      throw new Error(`${fieldName} must be no more than ${maxLength} characters long`);
    }
  }

  static validateArrayLength<T>(
    array: T[],
    fieldName: string,
    minLength: number = 0,
    maxLength: number = Infinity
  ): void {
    if (array.length < minLength) {
      throw new Error(`${fieldName} must contain at least ${minLength} items`);
    }
    if (array.length > maxLength) {
      throw new Error(`${fieldName} must contain no more than ${maxLength} items`);
    }
  }

  static validateRange(
    value: number,
    fieldName: string,
    min: number = -Infinity,
    max: number = Infinity
  ): void {
    if (value < min) {
      throw new Error(`${fieldName} must be at least ${min}`);
    }
    if (value > max) {
      throw new Error(`${fieldName} must be no more than ${max}`);
    }
  }
}