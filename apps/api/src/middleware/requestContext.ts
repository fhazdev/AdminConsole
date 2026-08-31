import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../logging/logger.js';

/**
 * Assigns a request ID and opens an AsyncLocalStorage scope for it, so every
 * downstream log line carries the same correlation ID without threading it
 * through function signatures. An inbound X-Request-Id is honoured, which lets
 * APIM stitch its own trace ID to ours.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  runWithRequestContext({ requestId }, () => next());
}
