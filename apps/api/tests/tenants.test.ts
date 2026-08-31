import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ListTenantsResponse, TenantSummary } from '@admin-console/shared-types';
import { closePool } from '../src/db/pool.js';
import { ADMIN, VIEWER, type Fixtures, as, resetFixtures } from './helpers.js';

let fx: Fixtures;

beforeEach(async () => {
  fx = await resetFixtures();
});

afterAll(async () => {
  await closePool();
});

describe('GET /api/tenants', () => {
  it('returns a paginated list with per-tenant user counts', async () => {
    const res = await as(ADMIN).get('/api/tenants').expect(200);
    const body = res.body as ListTenantsResponse;

    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(1);
    expect(body.items.map((t) => t.name)).toEqual(['Acme Corp', 'Zenith Ltd']);

    const acme = body.items.find((t) => t.name === 'Acme Corp') as TenantSummary;
    expect(acme.userCount).toBe(2);
    // One of Acme's two users is deactivated.
    expect(acme.activeUserCount).toBe(1);
  });

  it('filters by status, plan and name search', async () => {
    const byStatus = await as(ADMIN).get('/api/tenants?status=suspended').expect(200);
    expect((byStatus.body as ListTenantsResponse).items.map((t) => t.name)).toEqual(['Zenith Ltd']);

    const byPlan = await as(ADMIN).get('/api/tenants?plan=pro').expect(200);
    expect((byPlan.body as ListTenantsResponse).items.map((t) => t.name)).toEqual(['Acme Corp']);

    const bySearch = await as(ADMIN).get('/api/tenants?search=zen').expect(200);
    expect((bySearch.body as ListTenantsResponse).items.map((t) => t.name)).toEqual(['Zenith Ltd']);
  });

  it('paginates and reports the unpaged total', async () => {
    const res = await as(ADMIN).get('/api/tenants?page=2&pageSize=1').expect(200);
    const body = res.body as ListTenantsResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.name).toBe('Zenith Ltd');
    expect(body.total).toBe(2);
    expect(body.totalPages).toBe(2);
  });

  it('rejects a page size above the cap', async () => {
    const res = await as(ADMIN).get('/api/tenants?pageSize=1000').expect(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(res.body.error.details[0].path).toBe('pageSize');
  });
});

describe('GET /api/tenants/:id', () => {
  it('returns one tenant', async () => {
    const res = await as(ADMIN).get(`/api/tenants/${fx.tenantId}`).expect(200);
    expect(res.body).toMatchObject({ name: 'Acme Corp', plan: 'pro', status: 'active' });
  });

  it('404s for an unknown tenant', async () => {
    const res = await as(ADMIN)
      .get('/api/tenants/00000000-0000-0000-0000-000000000000')
      .expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('400s for a malformed id rather than reaching the database', async () => {
    const res = await as(ADMIN).get('/api/tenants/not-a-uuid').expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });
});

describe('PATCH /api/tenants/:id', () => {
  it('suspends a tenant and writes a matching audit entry', async () => {
    const res = await as(ADMIN)
      .patch(`/api/tenants/${fx.tenantId}`)
      .send({ status: 'suspended' })
      .expect(200);
    expect(res.body.status).toBe('suspended');

    const audit = await as(ADMIN).get('/api/audit-log').expect(200);
    expect(audit.body.items[0]).toMatchObject({
      action: 'tenant.suspended',
      targetType: 'tenant',
      targetId: fx.tenantId,
      actorEmail: ADMIN,
      tenantName: 'Acme Corp',
      metadata: { from: 'active', to: 'suspended' },
    });
  });

  it('records plan and status changes as two separate entries', async () => {
    await as(ADMIN)
      .patch(`/api/tenants/${fx.tenantId}`)
      .send({ status: 'suspended', plan: 'enterprise' })
      .expect(200);

    const audit = await as(ADMIN).get('/api/audit-log').expect(200);
    expect(audit.body.total).toBe(2);
    expect(audit.body.items.map((e: { action: string }) => e.action).sort()).toEqual([
      'tenant.plan_changed',
      'tenant.suspended',
    ]);
  });

  it('does not write an audit entry when the value is unchanged', async () => {
    await as(ADMIN).patch(`/api/tenants/${fx.tenantId}`).send({ status: 'active' }).expect(200);
    const audit = await as(ADMIN).get('/api/audit-log').expect(200);
    expect(audit.body.total).toBe(0);
  });

  it('rejects an empty patch', async () => {
    const res = await as(ADMIN).patch(`/api/tenants/${fx.tenantId}`).send({}).expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('rejects a plan outside the enum', async () => {
    const res = await as(ADMIN)
      .patch(`/api/tenants/${fx.tenantId}`)
      .send({ plan: 'platinum' })
      .expect(400);
    expect(res.body.error.details[0].path).toBe('plan');
  });

  it('denies a read_only operator and leaves the tenant untouched', async () => {
    const res = await as(VIEWER)
      .patch(`/api/tenants/${fx.tenantId}`)
      .send({ status: 'suspended' })
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');

    const after = await as(VIEWER).get(`/api/tenants/${fx.tenantId}`).expect(200);
    expect(after.body.status).toBe('active');
  });
});
