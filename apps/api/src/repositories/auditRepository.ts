import type { AuditLogEntry } from '@admin-console/shared-types';
import { type DbClient, pool, query } from '../db/pool.js';
import { type AuditLogRow, toAuditLogEntry } from '../db/mappers.js';
import { type PageRequest, SqlParams, offsetOf, whereClause } from './sqlParams.js';

export interface ListAuditLogFilters extends PageRequest {
  tenantId?: string | undefined;
  actorUserId?: string | undefined;
  action?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

function buildFilters(filters: ListAuditLogFilters, params: SqlParams): string[] {
  const conditions: string[] = [];
  if (filters.tenantId) conditions.push(`a.tenant_id = ${params.add(filters.tenantId)}`);
  if (filters.actorUserId) conditions.push(`a.actor_user_id = ${params.add(filters.actorUserId)}`);
  if (filters.action) conditions.push(`a.action = ${params.add(filters.action)}`);
  // Half-open range [from, to): a `to` of midnight excludes the next day cleanly.
  if (filters.from) conditions.push(`a.created_at >= ${params.add(filters.from)}::timestamptz`);
  if (filters.to) conditions.push(`a.created_at < ${params.add(filters.to)}::timestamptz`);
  return conditions;
}

export async function listAuditLog(
  filters: ListAuditLogFilters,
): Promise<{ items: AuditLogEntry[]; total: number }> {
  const countParams = new SqlParams();
  const countWhere = whereClause(buildFilters(filters, countParams));
  const countResult = await query<{ total: string }>(
    pool,
    `SELECT count(*)::text AS total FROM audit_log a ${countWhere}`,
    countParams.all(),
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const params = new SqlParams();
  const where = whereClause(buildFilters(filters, params));
  const limit = params.add(filters.pageSize);
  const offset = params.add(offsetOf(filters));

  // Actor and tenant are denormalized into the response so the viewer renders
  // names, not opaque UUIDs, without an N+1 fetch per row.
  const result = await query<AuditLogRow>(
    pool,
    `SELECT a.id, a.actor_user_id, a.tenant_id, a.action, a.target_type, a.target_id,
            a.metadata, a.created_at,
            actor.email        AS actor_email,
            actor.display_name AS actor_display_name,
            t.name             AS tenant_name
     FROM audit_log a
     LEFT JOIN users   actor ON actor.id = a.actor_user_id
     LEFT JOIN tenants t     ON t.id = a.tenant_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params.all(),
  );

  return { items: result.rows.map(toAuditLogEntry), total };
}

export interface AuditEntryInput {
  actorUserId: string | null;
  tenantId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes one audit row. Callers pass the transaction client for mutations, so
 * the record and the change it describes commit or roll back together.
 */
export async function insertAuditEntry(
  client: DbClient,
  entry: AuditEntryInput,
): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    client,
    `INSERT INTO audit_log (actor_user_id, tenant_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [
      entry.actorUserId,
      entry.tenantId,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.metadata ?? {}),
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Audit insert returned no row');
  return row;
}
