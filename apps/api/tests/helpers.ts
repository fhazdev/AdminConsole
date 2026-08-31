import type { Express } from 'express';
import request from 'supertest';
import { buildApp } from '../src/app.js';
import { pool, query } from '../src/db/pool.js';

export const app: Express = buildApp();

/** Signs in as a seeded platform admin (AUTH_MODE=dev trusts this header). */
export const ADMIN = 'test.admin@example.com';
/** Signs in as a seeded read_only operator, used to prove RBAC denies writes. */
export const VIEWER = 'test.viewer@example.com';

export function as(email: string) {
  return {
    get: (url: string) => request(app).get(url).set('X-Dev-User', email),
    patch: (url: string) => request(app).patch(url).set('X-Dev-User', email),
  };
}

export interface Fixtures {
  adminId: string;
  viewerId: string;
  tenantId: string;
  otherTenantId: string;
  memberUserId: string;
}

/**
 * Rebuilds a known-good dataset. Truncating rather than reusing seed data keeps
 * assertions on counts and audit history deterministic.
 */
export async function resetFixtures(): Promise<Fixtures> {
  await query(pool, 'TRUNCATE audit_log, users, tenants RESTART IDENTITY CASCADE');

  const operators = await query<{ id: string; email: string }>(
    pool,
    `INSERT INTO users (tenant_id, email, display_name, role, entra_object_id)
     VALUES (NULL, $1, 'Test Admin', 'admin', $3),
            (NULL, $2, 'Test Viewer', 'read_only', $4)
     RETURNING id, email`,
    [ADMIN, VIEWER, `dev-${ADMIN}`, `dev-${VIEWER}`],
  );
  const adminId = operators.rows.find((r) => r.email === ADMIN)!.id;
  const viewerId = operators.rows.find((r) => r.email === VIEWER)!.id;

  const tenants = await query<{ id: string; name: string }>(
    pool,
    `INSERT INTO tenants (name, plan, status)
     VALUES ('Acme Corp', 'pro', 'active'),
            ('Zenith Ltd', 'trial', 'suspended')
     RETURNING id, name`,
  );
  const tenantId = tenants.rows.find((r) => r.name === 'Acme Corp')!.id;
  const otherTenantId = tenants.rows.find((r) => r.name === 'Zenith Ltd')!.id;

  const members = await query<{ id: string }>(
    pool,
    `INSERT INTO users (tenant_id, email, display_name, role, status)
     VALUES ($1, 'member@acme.example', 'Acme Member', 'member', 'active'),
            ($1, 'gone@acme.example', 'Former Staff', 'read_only', 'deactivated'),
            ($2, 'lead@zenith.example', 'Zenith Lead', 'admin', 'active')
     RETURNING id`,
    [tenantId, otherTenantId],
  );

  return { adminId, viewerId, tenantId, otherTenantId, memberUserId: members.rows[0]!.id };
}
