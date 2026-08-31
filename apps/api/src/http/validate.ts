import type { Request } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from './errors.js';

function toApiError(err: ZodError, source: string): ApiError {
  return ApiError.badRequest(
    `Invalid request ${source}.`,
    err.issues.map((issue) => ({
      path: issue.path.join('.') || source,
      message: issue.message,
    })),
  );
}

function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown, source: string): z.infer<S> {
  try {
    return schema.parse(value) as z.infer<S>;
  } catch (err) {
    if (err instanceof ZodError) throw toApiError(err, source);
    throw err;
  }
}

export function parseQuery<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return parseOrThrow(schema, req.query, 'query');
}

export function parseBody<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return parseOrThrow(schema, req.body, 'body');
}

export function parseParams<S extends ZodTypeAny>(schema: S, req: Request): z.infer<S> {
  return parseOrThrow(schema, req.params, 'path parameters');
}
