import pg from 'pg';
import { config } from '../config.js';
import { logger } from '../logging/logger.js';

const { Pool } = pg;

export type DbClient = pg.PoolClient | pg.Pool;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  // Neon closes idle connections aggressively; keep the pool lean to match.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle Postgres client');
});

const SLOW_QUERY_MS = 500;

/** Thin wrapper adding timing and structured logging around every query. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  client: DbClient,
  text: string,
  params: readonly unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const startedAt = performance.now();
  try {
    const result = await client.query<T>(text, params as unknown[]);
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= SLOW_QUERY_MS) {
      logger.warn({ durationMs, rowCount: result.rowCount, sql: text }, 'Slow query');
    } else {
      logger.debug({ durationMs, rowCount: result.rowCount }, 'Query executed');
    }
    return result;
  } catch (err) {
    logger.error(
      { err, sql: text, durationMs: Math.round(performance.now() - startedAt) },
      'Query failed',
    );
    throw err;
  }
}

/**
 * Runs `fn` inside a transaction. Mutations and their audit_log row are always
 * written together through this helper, so an action can never be applied
 * without leaving a trail (or vice versa).
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, 'Failed to roll back transaction');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
