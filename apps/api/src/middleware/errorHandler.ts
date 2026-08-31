import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@admin-console/shared-types';
import { ApiError } from '../http/errors.js';
import { logger } from '../logging/logger.js';

function isBodyParseError(err: unknown): err is SyntaxError & { status: number } {
  return (
    err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400
  );
}

/**
 * The single exit point for every failure. Client-visible bodies are always the
 * same shape and never carry internals; the detail lives in the log line, tied
 * back by requestId.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const requestId = req.requestId ?? 'unknown';

  const apiError = isBodyParseError(err)
    ? ApiError.badRequest('Request body is not valid JSON.')
    : err;

  if (apiError instanceof ApiError) {
    const logPayload = {
      err: apiError,
      status: apiError.status,
      code: apiError.code,
      path: req.path,
      method: req.method,
      ...apiError.logContext,
    };
    // 4xx is the client's problem and expected traffic; 5xx is ours.
    if (apiError.status >= 500) logger.error(logPayload, apiError.message);
    else logger.warn(logPayload, apiError.message);

    const body: ApiErrorBody = {
      error: {
        code: apiError.code,
        message: apiError.message,
        requestId,
        ...(apiError.details ? { details: apiError.details } : {}),
      },
    };
    res.status(apiError.status).json(body);
    return;
  }

  logger.error(
    { err, path: req.path, method: req.method },
    'Unhandled error while processing request',
  );

  const body: ApiErrorBody = {
    error: {
      code: 'internal_error',
      // Never echo an unexpected error's message: it can carry SQL or secrets.
      message: 'An unexpected error occurred.',
      requestId,
    },
  };
  res.status(500).json(body);
}

/** Terminal 404 for unmatched routes, so misses share the standard error shape. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.path}`));
}
