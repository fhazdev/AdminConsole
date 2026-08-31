import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ListTenantUsersResponse } from '@admin-console/shared-types';
import { closePool } from '../src/db/pool.js';
import { ADMIN, VIEWER, type Fixtures, as, resetFixtures } from './helpers.js';

let fx: Fixtures;

beforeEach(async () => {
  fx = await resetFixtures();
});

afterAll(async () => {
  await closePool();
});

describe('GET /api/tenants/:id/users', () => {
  it('lists only the users in that tenant', async () => {
    const res = await as(ADMIN).get(`/api/tenants/${fx.tenantId}/users`).expect(200);
    const body = res.body as ListTenantUsersResponse;

    expect(body.total).toBe(2);
    expect(body.items.map((u) => u.email).sort()).toEqual([
      'gone@acme.example',
      'member@acme.example',
    ]);
    // Platform operators have no tenant and must never leak into a tenant view.
    expect(body.items.every((u) => u.tenantId === fx.tenantId)).toBe(true);
  });

  it('filters by role and status', async () => {
    const active = await as(ADMIN)
      .get(`/api/tenants/${fx.tenantId}/users?status=active`)
      .expect(200);
    expect((active.body as ListTenantUsersResponse).items.map((u) => u.email)).toEqual([
      'member@acme.example',
    ]);

    const byRole = await as(ADMIN)
      .get(`/api/tenants/${fx.tenantId}/users?role=read_only`)
      .expect(200);
    expect((byRole.body as ListTenantUsersResponse).items.map((u) => u.email)).toEqual([
      'gone@acme.example',
    ]);
  });

  it('404s for an unknown tenant instead of returning an empty page', async () => {
    const res = await as(ADMIN)
      .get('/api/tenants/00000000-0000-0000-0000-000000000000/users')
      .expect(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('PATCH /api/tenants/:id/users/:userId', () => {
  it('changes a role and audits it against the tenant', async () => {
    const res = await as(ADMIN)
      .patch(`/api/tenants/${fx.tenantId}/users/${fx.memberUserId}`)
      .send({ role: 'admin' })
      .expect(200);
    expect(res.body.role).toBe('admin');

    const audit = await as(ADMIN).get('/api/audit-log').expect(200);
    expect(audit.body.items[0]).toMatchObject({
      action: 'user.role_changed',
      targetType: 'user',
      targetId: fx.memberUserId,
      tenantId: fx.tenantId,
      metadata: { from: 'member', to: 'admin' },
    });
  });

  it('deactivates a user', async () => {
    await as(ADMIN)
      .patch(`/api/tenants/${fx.tenantId}/users/${fx.memberUserId}`)
      .send({ status: 'deactivated' })
      .expect(200);

    const audit = await as(ADMIN).get('/api/audit-log?action=user.deactivated').expect(200);
    expect(audit.body.total).toBe(1);
  });

  it('refuses to update a user through the wrong tenant', async () => {
    const res = await as(ADMIN)
      .patch(`/api/tenants/${fx.otherTenantId}/users/${fx.memberUserId}`)
      .send({ role: 'admin' })
      .expect(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('stops an admin from changing their own role', async () => {
    const res = await as(ADMIN)
      .patch(`/api/tenants/${fx.tenantId}/users/${fx.adminId}`)
      .send({ role: 'read_only' })
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('denies a read_only operator', async () => {
    await as(VIEWER)
      .patch(`/api/tenants/${fx.tenantId}/users/${fx.memberUserId}`)
      .send({ role: 'admin' })
      .expect(403);
  });
});
