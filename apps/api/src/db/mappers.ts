import type {
  AuditAction,
  AuditLogEntry,
  AuditTargetType,
  Tenant,
  TenantPlan,
  TenantStatus,
  TenantSummary,
  User,
  UserRole,
  UserStatus,
} from '@admin-console/shared-types';

/** Raw shapes as they come back from `pg`, before camel-casing. */
export interface TenantRow {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  created_at: Date;
}

export interface TenantSummaryRow extends TenantRow {
  user_count: string;
  active_user_count: string;
}

export interface UserRow {
  id: string;
  tenant_id: string | null;
  email: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  entra_object_id: string | null;
  created_at: Date;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_display_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export function toTenantSummary(row: TenantSummaryRow): TenantSummary {
  return {
    ...toTenant(row),
    // count(*) arrives as a string because Postgres bigint exceeds JS number.
    // Tenant user counts are far below that ceiling, so narrowing is safe here.
    userCount: Number(row.user_count),
    activeUserCount: Number(row.active_user_count),
  };
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    entraObjectId: row.entra_object_id,
    createdAt: row.created_at.toISOString(),
  };
}

export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorDisplayName: row.actor_display_name,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}
