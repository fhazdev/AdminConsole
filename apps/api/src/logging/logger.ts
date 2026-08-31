import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type Logger, type LoggerOptions, type TransportTargetOptions } from 'pino';
import { config } from '../config.js';

/**
 * Request-scoped context stitched into every log line, so a single request can
 * be traced across middleware, repositories and the audit writer in Kibana.
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  userEmail?: string;
  role?: string;
}

const contextStore = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return contextStore.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return contextStore.getStore();
}

/** Mutate the active context once auth has resolved the caller. */
export function enrichRequestContext(patch: Partial<RequestContext>): void {
  const ctx = contextStore.getStore();
  if (ctx) Object.assign(ctx, patch);
}

function buildTransport(): LoggerOptions['transport'] {
  const targets: TransportTargetOptions[] = [];

  if (config.ELASTICSEARCH_URL) {
    targets.push({
      target: 'pino-elasticsearch',
      level: config.LOG_LEVEL,
      options: {
        node: config.ELASTICSEARCH_URL,
        index: config.ELASTICSEARCH_INDEX,
        esVersion: 8,
        flushBytes: 1000,
        flushInterval: 2000,
      },
    });
  }

  // Always keep a stdout stream: Container Apps captures it into Log Analytics
  // even when Elasticsearch has scaled to zero.
  targets.push({
    target: 'pino/file',
    level: config.LOG_LEVEL,
    options: { destination: 1 },
  });

  return targets.length > 0 ? { targets } : undefined;
}

export const logger: Logger = pino({
  level: config.LOG_LEVEL,
  base: {
    service: 'admin-console-api',
    env: config.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Structured logs are shipped verbatim to Elasticsearch; scrub anything that
  // could carry a bearer token or secret before it leaves the process.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-dev-user"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.connectionString',
    ],
    censor: '[redacted]',
  },
  // pino rejects a custom level formatter when transport targets are in play,
  // so the human-readable label is added here instead. Kibana filters on
  // levelLabel; the numeric `level` stays for range queries.
  mixin(_mergeObject, level) {
    const ctx = getRequestContext();
    return {
      levelLabel: pino.levels.labels[level] ?? String(level),
      ...(ctx ? { requestId: ctx.requestId, userId: ctx.userId, role: ctx.role } : {}),
    };
  },
  transport: config.isTest ? undefined : buildTransport(),
});

export type { Logger };
