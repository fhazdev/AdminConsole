import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { MeResponse } from '@admin-console/shared-types';
import { closePool, pool, query } from '../src/db/pool.js';
import { ADMIN, VIEWER, app, as, resetFixtures } from './helpers.js';

beforeEach(async () => {
  await resetFixtures();
});

afterAll(async () => {
  await closePool();
});

describe('GET /api/me', () => {
  it('returns the seeded admin with full permissions', async () => {
    const res = await as(ADMIN).get('/api/me').expect(200);
    const body = res.body as MeResponse;

    expect(body.user.email).toBe(ADMIN);
    expect(body.user.role).toBe('admin');
    expect(body.user.tenantId).toBeNull();
    expect(body.autoProvisioned).toBe(false);
    expect(body.permissions).toContain('tenants:write');
  });

  it('returns a read_only operator without write permissions', async () => {
    const res = await as(VIEWER).get('/api/me').expect(200);
    const body = res.body as MeResponse;

    expect(body.user.role).toBe('read_only');
    expect(body.permissions).not.toContain('tenants:write');
    expect(body.permissions).not.toContain('users:write');
    expect(body.permissions).toContain('audit:read');
  });
});

describe('first-login provisioning', () => {
  it('auto-provisions an unknown identity as a read_only operator', async () => {
    const email = 'newcomer@example.com';
    const res = await as(email).get('/api/me').expect(200);
    const body = res.body as MeResponse;

    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe('read_only');
    expect(body.user.tenantId).toBeNull();
    expect(body.autoProvisioned).toBe(true);

    const audit = await as(ADMIN).get('/api/audit-log?action=user.provisioned').expect(200);
    expect(audit.body.total).toBe(1);
    expect(audit.body.items[0].metadata).toMatchObject({ source: 'first_login' });
  });

  it('is idempotent: a second request reuses the same row', async () => {
    const email = 'repeat@example.com';
    const first = await as(email).get('/api/me').expect(200);
    const second = await as(email).get('/api/me').expect(200);

    expect(second.body.user.id).toBe(first.body.user.id);
    expect(second.body.autoProvisioned).toBe(false);

    const audit = await as(ADMIN).get('/api/audit-log?action=user.provisioned').expect(200);
    expect(audit.body.total).toBe(1);
  });

  it('claims a pre-seeded row by email and links the Entra object ID', async () => {
    const email = 'preseeded@example.com';
    await query(
      pool,
      `INSERT INTO users (tenant_id, email, display_name, role) VALUES (NULL, $1, 'Pre Seeded', 'admin')`,
      [email],
    );

    const res = await as(email).get('/api/me').expect(200);
    // The role comes from the seeded row, not from auto-provisioning defaults.
    expect(res.body.user.role).toBe('admin');
    expect(res.body.autoProvisioned).toBe(false);
    expect(res.body.user.entraObjectId).toBe(`dev-${email}`);
  });

  it('rejects a deactivated operator', async () => {
    const email = 'suspended.op@example.com';
    await query(
      pool,
      `INSERT INTO users (tenant_id, email, display_name, role, status)
       VALUES (NULL, $1, 'Suspended Op', 'admin', 'deactivated')`,
      [email],
    );

    const res = await as(email).get('/api/me').expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });
});

describe('error contract', () => {
  it('returns the standard shape with a correlating request id', async () => {
    const res = await as(ADMIN).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('echoes an inbound X-Request-Id so a gateway trace stays intact', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('X-Dev-User', ADMIN)
      .set('X-Request-Id', 'trace-from-apim')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('trace-from-apim');
  });

  it('rejects malformed JSON with a 400, not a 500', async () => {
    const res = await request(app)
      .patch('/api/tenants/00000000-0000-0000-0000-000000000000')
      .set('X-Dev-User', ADMIN)
      .set('Content-Type', 'application/json')
      .send('{"status":')
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });
});

describe('health probes', () => {
  it('answers liveness without authentication', async () => {
    await request(app).get('/healthz').expect(200, { status: 'ok', service: 'admin-console-api' });
  });

  it('reports readiness once the database answers', async () => {
    const res = await request(app).get('/readyz').expect(200);
    expect(res.body.checks.database).toBe('ok');
  });
});
