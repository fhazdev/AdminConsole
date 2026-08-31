import { Router } from 'express';
import { pool, query } from '../db/pool.js';
import { logger } from '../logging/logger.js';

export const healthRouter = Router();

/** Liveness: the process is up. Deliberately does not touch dependencies. */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'admin-console-api' });
});

/**
 * Readiness: can this replica actually serve traffic? Container Apps uses this
 * to hold traffic back from a revision whose database is unreachable.
 */
healthRouter.get('/readyz', async (_req, res) => {
  try {
    await query(pool, 'SELECT 1');
    res.json({ status: 'ready', checks: { database: 'ok' } });
  } catch (err) {
    logger.error({ err }, 'Readiness check failed');
    res.status(503).json({ status: 'not_ready', checks: { database: 'unreachable' } });
  }
});
