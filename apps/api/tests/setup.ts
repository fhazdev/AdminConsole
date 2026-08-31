/**
 * Integration tests run against a real Postgres (docker compose up postgres).
 * TEST_DATABASE_URL overrides DATABASE_URL so a stray run can never touch a
 * developer's working database.
 */
process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'dev';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://admin_console:local_dev_password@localhost:5432/admin_console_test';
delete process.env.ELASTICSEARCH_URL;
