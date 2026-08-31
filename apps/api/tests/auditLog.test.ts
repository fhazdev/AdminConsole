import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ListAuditLogResponse } from '@admin-console/shared-types';
import { closePool, pool, query } from '../src/db/pool.js';
import { ADMIN, type Fixtures, as, resetFixtures } from './helpers.js';

let fx: Fixtures;

beforeEach(async () => {
  fx = await resetFixtures();

  // Backdated history so date-range filtering has something to bite on.
  await query(
    pool,
    `INSERT INTO audit_log (actor_user_id, tenant_id, action, target_type, target_id, metadata, created_at)
     VALUES ($1, $2, 'tenant.plan_changed', 'tenant', $2, '{"from":"trial","to":"pro"}'::jsonb, now() - interval '10 days'),
            ($1, $2, 'tenant.suspended', 'tenant', $2, '{}'::jsonb, now() - interval '3 days'),
            ($3, $4, 'user.role_changed', 'user', $5, '{"from":"member","to":"admin"}'::jsonb, now() - interval '1 day')`,
    [fx.adminId, fx.tenantId, fx.viewerId, fx.otherTenantId, fx.memberUserId],
  );
});

afterAll(async () => {
  await closePool();
});

describe('GET /api/audit-log', () => {
  it('returns entries newest first with actor and tenant names resolved', async () => {
    const res = await as(ADMIN).get('/api/audit-log').expect(200);
    const body = res.body as ListAuditLogResponse;

    expect(body.total).toBe(3);
    expect(body.items.map((e) => e.action)).toEqual([
      'user.role_changed',
      'tenant.suspended',
      'tenant.plan_changed',
    ]);
    expect(body.items[0]?.actorEmail).toBeTruthy();
    expect(body.items[1]?.tenantName).toBe('Acme Corp');
  });

  it('filters by tenant, actor and action', async () => {
    const byTenant = await as(ADMIN).get(`/api/audit-log?tenantId=${fx.tenantId}`).expect(200);
    expect((byTenant.body as ListAuditLogResponse).total).toBe(2);

    const byActor = await as(ADMIN).get(`/api/audit-log?actorUserId=${fx.viewerId}`).expect(200);
    expect((byActor.body as ListAuditLogResponse).total).toBe(1);

    const byAction = await as(ADMIN).get('/api/audit-log?action=tenant.suspended').expect(200);
    expect((byAction.body as ListAuditLogResponse).total).toBe(1);
  });

  it('filters by date range using a half-open interval', async () => {
    const from = new Date(Date.now() - 5 * 86400000).toISOString();
    const res = await as(ADMIN)
      .get(`/api/audit-log?from=${encodeURIComponent(from)}`)
      .expect(200);
    expect((res.body as ListAuditLogResponse).total).toBe(2);
  });

  it('rejects a reversed date range', async () => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() - 86400000).toISOString();
    const res = await as(ADMIN)
      .get(`/api/audit-log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .expect(400);
    expect(res.body.error.details[0].path).toBe('from');
  });

  it('rejects an unknown action rather than silently returning nothing', async () => {
    const res = await as(ADMIN).get('/api/audit-log?action=tenant.exploded').expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });
});
