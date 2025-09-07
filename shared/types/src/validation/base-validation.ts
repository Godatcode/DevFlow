import { UUID, BaseEntity, CustomError, ErrorType } from '../common';

export class ValidationError extends Error implements CustomError {
  type: ErrorType = ErrorType.VALIDATION;
  code: string;
  statusCode: number = 400;

  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

export class BaseValidator {
  protected static validateUUID(value: string, fieldName: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid UUID`, 'INVALID_UUID');
    }
  }

  protected static validateRequired<T>(value: T | null | undefined, fieldName: string): T {
    if (value === null || value === undefined) {
      throw new ValidationError(`${fieldName} is required`, 'REQUIRED_FIELD');
    }
    return value;
  }

  protected static validateString(
    value: string,
    fieldName: string,
    minLength: number = 1,
    maxLength: number = 255
  ): void {
    this.validateRequired(value, fieldName);
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`, 'INVALID_TYPE');
    }
    if (value.trim().length < minLength) {
      throw new ValidationError(
        `${fieldName} must be at least ${minLength} characters long`,
        'MIN_LENGTH'
      );
    }
    if (value.length > maxLength) {
      throw new ValidationError(
        `${fieldName} must be no more than ${maxLength} characters long`,
        'MAX_LENGTH'
      );
    }
  }

  protected static validateEmail(email: string, fieldName: string = 'email'): void {
    this.validateRequired(email, fieldName);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError(`${fieldName} must be a valid email address`, 'INVALID_EMAIL');
    }
  }

  protected static validateUrl(url: string, fieldName: string = 'url'): void {
    this.validateRequired(url, fieldName);
    try {
      new URL(url);
    } catch {
      throw new ValidationError(`${fieldName} must be a valid URL`, 'INVALID_URL');
    }
  }

  protected static validateArray<T>(
    array: T[],
    fieldName: string,
    minLength: number = 0,
    maxLength: number = Infinity
  ): void {
    this.validateRequired(array, fieldName);
    if (!Array.isArray(array)) {
      throw new ValidationError(`${fieldName} must be an array`, 'INVALID_TYPE');
    }
    if (array.length < minLength) {
      throw new ValidationError(
        `${fieldName} must contain at least ${minLength} items`,
        'MIN_ARRAY_LENGTH'
      );
    }
    if (array.length > maxLength) {
      throw new ValidationError(
        `${fieldName} must contain no more than ${maxLength} items`,
        'MAX_ARRAY_LENGTH'
      );
    }
  }

  protected static validateNumber(
    value: number,
    fieldName: string,
    min: number = -Infinity,
    max: number = Infinity
  ): void {
    this.validateRequired(value, fieldName);
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(`${fieldName} must be a valid number`, 'INVALID_NUMBER');
    }
    if (value < min) {
      throw new ValidationError(`${fieldName} must be at least ${min}`, 'MIN_VALUE');
    }
    if (value > max) {
      throw new ValidationError(`${fieldName} must be no more than ${max}`, 'MAX_VALUE');
    }
  }

  protected static validateDate(date: Date, fieldName: string): void {
    this.validateRequired(date, fieldName);
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date`, 'INVALID_DATE');
    }
  }

  protected static validateEnum<T>(
    value: T,
    enumObject: Record<string, T>,
    fieldName: string
  ): void {
    this.validateRequired(value, fieldName);
    const validValues = Object.values(enumObject);
    if (!validValues.includes(value)) {
      throw new ValidationError(
        `${fieldName} must be one of: ${validValues.join(', ')}`,
        'INVALID_ENUM_VALUE'
      );
    }
  }

  protected static validateBaseEntity(entity: BaseEntity): void {
    this.validateUUID(entity.id, 'id');
    this.validateDate(entity.createdAt, 'createdAt');
    this.validateDate(entity.updatedAt, 'updatedAt');
    
    // Ensure updatedAt is not before createdAt
    if (entity.updatedAt < entity.createdAt) {
      throw new ValidationError(
        'updatedAt cannot be before createdAt',
        'INVALID_DATE_RANGE'
      );
    }
  }

  protected static validateObject(
    obj: Record<string, any>,
    fieldName: string,
    allowEmpty: boolean = true
  ): void {
    this.validateRequired(obj, fieldName);
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      throw new ValidationError(`${fieldName} must be an object`, 'INVALID_TYPE');
    }
    if (!allowEmpty && Object.keys(obj).length === 0) {
      throw new ValidationError(`${fieldName} cannot be empty`, 'EMPTY_OBJECT');
    }
  }
}