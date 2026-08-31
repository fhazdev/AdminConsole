/**
 * Seeds fake tenants, users and audit history for local development and demos.
 * Idempotent: safe to re-run. Never point this at anything but a demo database.
 */
import { config } from '../src/config.js';
import { closePool, pool, query, withTransaction } from '../src/db/pool.js';
import type { TenantPlan, TenantStatus, UserRole, UserStatus } from '@admin-console/shared-types';

interface SeedUser {
  email: string;
  displayName: string;
  role: UserRole;
  status?: UserStatus;
}

interface SeedTenant {
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  users: SeedUser[];
}

/** Console operators: platform staff, deliberately not scoped to a tenant. */
const PLATFORM_OPERATORS: SeedUser[] = [
  { email: config.DEV_AUTH_EMAIL, displayName: 'Dev Admin', role: 'admin' },
  { email: 'ops.viewer@example.com', displayName: 'Ops Viewer', role: 'read_only' },
];

const TENANTS: SeedTenant[] = [
  {
    name: 'Northwind Logistics',
    plan: 'enterprise',
    status: 'active',
    users: [
      { email: 'ava.chen@northwind.example', displayName: 'Ava Chen', role: 'admin' },
      { email: 'marcus.hale@northwind.example', displayName: 'Marcus Hale', role: 'member' },
      { email: 'priya.raman@northwind.example', displayName: 'Priya Raman', role: 'member' },
      {
        email: 'ex.employee@northwind.example',
        displayName: 'Jordan Vale',
        role: 'read_only',
        status: 'deactivated',
      },
    ],
  },
  {
    name: 'Beacon Health',
    plan: 'pro',
    status: 'active',
    users: [
      { email: 'sofia.ortiz@beacon.example', displayName: 'Sofia Ortiz', role: 'admin' },
      { email: 'liam.becker@beacon.example', displayName: 'Liam Becker', role: 'member' },
      { email: 'noor.rahman@beacon.example', displayName: 'Noor Rahman', role: 'read_only' },
    ],
  },
  {
    name: 'Cobalt Analytics',
    plan: 'pro',
    status: 'suspended',
    users: [
      { email: 'dana.iwu@cobalt.example', displayName: 'Dana Iwu', role: 'admin' },
      { email: 'ryu.tanaka@cobalt.example', displayName: 'Ryu Tanaka', role: 'member' },
    ],
  },
  {
    name: 'Fernway Studios',
    plan: 'trial',
    status: 'active',
    users: [{ email: 'kit.moreau@fernway.example', displayName: 'Kit Moreau', role: 'admin' }],
  },
  {
    name: 'Halcyon Freight',
    plan: 'trial',
    status: 'suspended',
    users: [
      { email: 'tomas.silva@halcyon.example', displayName: 'Tomas Silva', role: 'admin' },
      { email: 'gina.park@halcyon.example', displayName: 'Gina Park', role: 'read_only' },
    ],
  },
  {
    name: 'Orchid Retail Group',
    plan: 'enterprise',
    status: 'active',
    users: [
      { email: 'elena.duarte@orchid.example', displayName: 'Elena Duarte', role: 'admin' },
      { email: 'sam.whitfield@orchid.example', displayName: 'Sam Whitfield', role: 'member' },
      { email: 'iris.kovac@orchid.example', displayName: 'Iris Kovac', role: 'member' },
      { email: 'ben.adeyemi@orchid.example', displayName: 'Ben Adeyemi', role: 'read_only' },
    ],
  },
];

async function upsertOperator(user: SeedUser): Promise<string> {
  const result = await query<{ id: string }>(
    pool,
    `INSERT INTO users (tenant_id, email, display_name, role, status)
     VALUES (NULL, $1, $2, $3::user_role, $4::user_status)
     ON CONFLICT (lower(email)) DO UPDATE
       SET display_name = EXCLUDED.display_name, role = EXCLUDED.role
     RETURNING id`,
    [user.email, user.displayName, user.role, user.status ?? 'active'],
  );
  return result.rows[0]!.id;
}

async function upsertTenant(tenant: SeedTenant): Promise<string> {
  const result = await query<{ id: string }>(
    pool,
    `INSERT INTO tenants (name, plan, status)
     VALUES ($1, $2::tenant_plan, $3::tenant_status)
     ON CONFLICT (lower(name)) DO UPDATE
       SET plan = EXCLUDED.plan, status = EXCLUDED.status
     RETURNING id`,
    [tenant.name, tenant.plan, tenant.status],
  );
  return result.rows[0]!.id;
}

async function upsertTenantUser(tenantId: string, user: SeedUser): Promise<string> {
  const result = await query<{ id: string }>(
    pool,
    `INSERT INTO users (tenant_id, email, display_name, role, status)
     VALUES ($1, $2, $3, $4::user_role, $5::user_status)
     ON CONFLICT (lower(email)) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id,
           display_name = EXCLUDED.display_name,
           role = EXCLUDED.role,
           status = EXCLUDED.status
     RETURNING id`,
    [tenantId, user.email, user.displayName, user.role, user.status ?? 'active'],
  );
  return result.rows[0]!.id;
}

/** Backfills plausible history so the audit viewer has something to filter. */
async function seedAuditHistory(
  actorId: string,
  entries: { tenantId: string; tenantName: string; targetId: string }[],
): Promise<void> {
  const existing = await query<{ total: string }>(
    pool,
    `SELECT count(*)::text AS total FROM audit_log`,
  );
  if (Number(existing.rows[0]?.total ?? 0) > 0) {
    console.log('  audit_log already populated, skipping history backfill');
    return;
  }

  await withTransaction(async (client) => {
    let daysAgo = entries.length + 2;
    for (const entry of entries) {
      await query(
        client,
        `INSERT INTO audit_log (actor_user_id, tenant_id, action, target_type, target_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, now() - ($7 || ' days')::interval)`,
        [
          actorId,
          entry.tenantId,
          'tenant.plan_changed',
          'tenant',
          entry.targetId,
          JSON.stringify({ tenantName: entry.tenantName, from: 'trial', to: 'pro', seeded: true }),
          String(daysAgo),
        ],
      );
      daysAgo -= 1;
    }
  });
}

async function main(): Promise<void> {
  if (config.isProduction) {
    throw new Error('Refusing to seed a production database.');
  }
  console.log(`Seeding ${config.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const operatorIds: string[] = [];
  for (const operator of PLATFORM_OPERATORS) {
    operatorIds.push(await upsertOperator(operator));
    console.log(`  operator: ${operator.email} (${operator.role})`);
  }

  const auditSeeds: { tenantId: string; tenantName: string; targetId: string }[] = [];
  for (const tenant of TENANTS) {
    const tenantId = await upsertTenant(tenant);
    for (const user of tenant.users) {
      await upsertTenantUser(tenantId, user);
    }
    console.log(
      `  tenant: ${tenant.name} (${tenant.plan}/${tenant.status}, ${tenant.users.length} users)`,
    );
    auditSeeds.push({ tenantId, tenantName: tenant.name, targetId: tenantId });
  }

  await seedAuditHistory(operatorIds[0]!, auditSeeds);
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
