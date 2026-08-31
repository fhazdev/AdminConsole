import type { ApiErrorCode } from '@admin-console/shared-types';

export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * The only error type route handlers should throw. Anything else reaching the
 * error handler is treated as an unexpected 500 and logged at error level.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ErrorDetail[] | undefined;
  /** Extra structured fields attached to the log line, never to the response. */
  readonly logContext: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: {
      details?: ErrorDetail[];
      logContext?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.logContext = options.logContext;
  }

  static badRequest(message: string, details?: ErrorDetail[]): ApiError {
    return new ApiError(400, 'bad_request', message, details ? { details } : {});
  }

  static unauthorized(message = 'Authentication required.', logContext?: Record<string, unknown>) {
    return new ApiError(401, 'unauthorized', message, logContext ? { logContext } : {});
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, 'not_found', `${resource} was not found.`);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'conflict', message);
  }
}
