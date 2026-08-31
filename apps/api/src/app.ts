import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireAuth } from './middleware/auth.js';
import { auditLogRouter } from './routes/auditLog.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { tenantsRouter } from './routes/tenants.js';

export function buildApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind APIM and Container Apps ingress, so the client IP is in
  // X-Forwarded-For rather than on the socket.
  app.set('trust proxy', true);

  // Correlation ID first: everything after it, including the request log and
  // any thrown error, is attributable to one request.
  app.use(requestContext);
  app.use(requestLogger);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'X-Dev-User'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  // Unauthenticated: probes must answer before auth or a token outage looks
  // like an outright outage to the platform.
  app.use(healthRouter);

  app.use('/api/me', requireAuth, meRouter);
  app.use('/api/tenants', requireAuth, tenantsRouter);
  app.use('/api/audit-log', requireAuth, auditLogRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
