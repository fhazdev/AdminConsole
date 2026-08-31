import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// In Azure every value arrives as a real environment variable and both paths
// simply miss. Locally, one repo-root .env serves every workspace, whichever
// directory a script happens to run from.
loadDotenv({
  path: [resolve(process.cwd(), '.env'), fileURLToPath(new URL('../../../.env', import.meta.url))],
});

const booleanish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Neon requires TLS; the local docker-compose Postgres does not. */
  DATABASE_SSL: booleanish.default('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** When unset, logs go to stdout only and nothing is shipped. */
  ELASTICSEARCH_URL: z.string().url().optional(),
  ELASTICSEARCH_INDEX: z.string().default('admin-console-logs'),

  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /**
   * 'entra' validates a real Entra ID access token against JWKS.
   * 'dev' trusts an X-Dev-User header - local development only, and the app
   * refuses to boot in this mode when NODE_ENV is production.
   */
  AUTH_MODE: z.enum(['entra', 'dev']).default('dev'),
  ENTRA_TENANT_ID: z.string().optional(),
  /** The API app registration's client ID, matched against the token `aud`. */
  ENTRA_API_AUDIENCE: z.string().optional(),
  DEV_AUTH_EMAIL: z.string().email().default('dev.admin@example.com'),

  /**
   * When true, a valid Entra identity with no `users` row is created on first
   * login with the least-privileged role. When false, unknown identities 403.
   */
  AUTO_PROVISION_ENABLED: booleanish.default('true'),
});

export type AppConfig = z.infer<typeof schema> & {
  corsOrigins: string[];
  isProduction: boolean;
  isTest: boolean;
};

function parseConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;

  if (value.AUTH_MODE === 'entra' && (!value.ENTRA_TENANT_ID || !value.ENTRA_API_AUDIENCE)) {
    throw new Error(
      'AUTH_MODE=entra requires both ENTRA_TENANT_ID and ENTRA_API_AUDIENCE to be set.',
    );
  }
  if (value.AUTH_MODE === 'dev' && value.NODE_ENV === 'production') {
    throw new Error('AUTH_MODE=dev is not permitted when NODE_ENV=production.');
  }

  return {
    ...value,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    isProduction: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
  };
}

export const config: AppConfig = parseConfig();
export { parseConfig };
