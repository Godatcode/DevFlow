import { ErrorType, ErrorContext, CustomError } from '@devflow/shared-types';

export class DevFlowError extends Error implements CustomError {
  public readonly type: ErrorType;
  public readonly code: string;
  public readonly context?: ErrorContext;
  public readonly statusCode?: number;

  constructor(
    type: ErrorType,
    code: string,
    message: string,
    context?: ErrorContext,
    statusCode?: number
  ) {
    super(message);
    this.name = 'DevFlowError';
    this.type = type;
    this.code = code;
    this.context = context;
    this.statusCode = statusCode;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DevFlowError);
    }
  }

  static validation(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.VALIDATION, code, message, context, 400);
  }

  static authentication(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.AUTHENTICATION, code, message, context, 401);
  }

  static authorization(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.AUTHORIZATION, code, message, context, 403);
  }

  static notFound(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.NOT_FOUND, code, message, context, 404);
  }

  static conflict(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.CONFLICT, code, message, context, 409);
  }

  static internalServer(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.INTERNAL_SERVER, code, message, context, 500);
  }

  static externalService(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.EXTERNAL_SERVICE, code, message, context, 502);
  }

  static rateLimit(code: string, message: string, context?: ErrorContext): DevFlowError {
    return new DevFlowError(ErrorType.RATE_LIMIT, code, message, context, 429);
  }

  toJSON(): object {
    return {
      name: this.name,
      type: this.type,
      code: this.code,
      message: this.message,
      context: this.context,
      statusCode: this.statusCode,
      stack: this.stack
    };
  }
}