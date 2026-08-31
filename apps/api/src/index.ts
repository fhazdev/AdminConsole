import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';
import { logger } from './logging/logger.js';

const app = buildApp();

const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      authMode: config.AUTH_MODE,
      autoProvision: config.AUTO_PROVISION_ENABLED,
      elasticsearch: config.ELASTICSEARCH_URL ? 'enabled' : 'stdout-only',
    },
    'Admin console API listening',
  );
});

/**
 * Container Apps sends SIGTERM before pulling a revision. Stop accepting new
 * connections, let in-flight requests finish, then close the pool, so a deploy
 * never severs a transaction mid-write.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (err) => {
    if (err) logger.error({ err }, 'Error while closing HTTP server');
    try {
      await closePool();
    } catch (poolErr) {
      logger.error({ err: poolErr }, 'Error while closing the database pool');
    }
    logger.info('Shutdown complete');
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException');
});
