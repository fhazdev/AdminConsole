import type { Tenant, TenantSummary, UpdateTenantBody } from '@admin-console/shared-types';
import { type DbClient, pool, query } from '../db/pool.js';
import { type TenantRow, type TenantSummaryRow, toTenant, toTenantSummary } from '../db/mappers.js';
import { type PageRequest, SqlParams, offsetOf, whereClause } from './sqlParams.js';

export interface ListTenantsFilters extends PageRequest {
  search?: string | undefined;
  status?: string | undefined;
  plan?: string | undefined;
}

/**
 * Per-tenant user counts, pre-aggregated once rather than correlated per row so
 * the tenant list stays a single index-friendly scan as the table grows.
 */
const USER_COUNTS_CTE = `
  user_counts AS (
    SELECT tenant_id,
           count(*)                                   AS user_count,
           count(*) FILTER (WHERE status = 'active')  AS active_user_count
    FROM users
    WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id
  )
`;

function buildFilters(filters: ListTenantsFilters, params: SqlParams): string[] {
  const conditions: string[] = [];
  if (filters.search) {
    conditions.push(`t.name ILIKE '%' || ${params.add(filters.search)} || '%'`);
  }
  if (filters.status) {
    conditions.push(`t.status = ${params.add(filters.status)}::tenant_status`);
  }
  if (filters.plan) {
    conditions.push(`t.plan = ${params.add(filters.plan)}::tenant_plan`);
  }
  return conditions;
}

export async function listTenants(
  filters: ListTenantsFilters,
): Promise<{ items: TenantSummary[]; total: number }> {
  const countParams = new SqlParams();
  const countWhere = whereClause(buildFilters(filters, countParams));
  const countResult = await query<{ total: string }>(
    pool,
    `SELECT count(*)::text AS total FROM tenants t ${countWhere}`,
    countParams.all(),
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const params = new SqlParams();
  const where = whereClause(buildFilters(filters, params));
  const limit = params.add(filters.pageSize);
  const offset = params.add(offsetOf(filters));

  const result = await query<TenantSummaryRow>(
    pool,
    `WITH ${USER_COUNTS_CTE}
     SELECT t.id, t.name, t.plan, t.status, t.created_at,
            coalesce(uc.user_count, 0)::text        AS user_count,
            coalesce(uc.active_user_count, 0)::text AS active_user_count
     FROM tenants t
     LEFT JOIN user_counts uc ON uc.tenant_id = t.id
     ${where}
     ORDER BY t.name ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params.all(),
  );

  return { items: result.rows.map(toTenantSummary), total };
}

export async function findTenantById(id: string): Promise<TenantSummary | null> {
  const result = await query<TenantSummaryRow>(
    pool,
    `WITH ${USER_COUNTS_CTE}
     SELECT t.id, t.name, t.plan, t.status, t.created_at,
            coalesce(uc.user_count, 0)::text        AS user_count,
            coalesce(uc.active_user_count, 0)::text AS active_user_count
     FROM tenants t
     LEFT JOIN user_counts uc ON uc.tenant_id = t.id
     WHERE t.id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? toTenantSummary(row) : null;
}

/** Row-level lock so concurrent suspend/reactivate calls serialize cleanly. */
export async function lockTenant(client: DbClient, id: string): Promise<Tenant | null> {
  const result = await query<TenantRow>(
    client,
    `SELECT id, name, plan, status, created_at FROM tenants WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  return row ? toTenant(row) : null;
}

export async function updateTenant(
  client: DbClient,
  id: string,
  patch: UpdateTenantBody,
): Promise<Tenant> {
  const params = new SqlParams();
  const assignments: string[] = [];
  if (patch.plan !== undefined) {
    assignments.push(`plan = ${params.add(patch.plan)}::tenant_plan`);
  }
  if (patch.status !== undefined) {
    assignments.push(`status = ${params.add(patch.status)}::tenant_status`);
  }

  const result = await query<TenantRow>(
    client,
    `UPDATE tenants SET ${assignments.join(', ')}
     WHERE id = ${params.add(id)}
     RETURNING id, name, plan, status, created_at`,
    params.all(),
  );
  // The caller locks the row first, so a missing row here is a real invariant break.
  const row = result.rows[0];
  if (!row) throw new Error(`Tenant ${id} disappeared during update`);
  return toTenant(row);
}
