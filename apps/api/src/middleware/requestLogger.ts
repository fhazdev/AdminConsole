import type { Request } from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from '../logging/logger.js';

/** One structured line per request, shaped for the Kibana traffic dashboard. */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).requestId,
  // Health probes fire constantly and would drown out real traffic.
  autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
