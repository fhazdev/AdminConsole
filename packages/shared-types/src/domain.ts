/**
 * Core domain enums and entities. These mirror the Postgres schema in
 * apps/api/migrations and are the single source of truth shared by web and api.
 */

export const TENANT_PLANS = ['trial', 'pro', 'enterprise'] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const TENANT_STATUSES = ['active', 'suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const USER_ROLES = ['admin', 'member', 'read_only'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'deactivated'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt: string;
}

/** Tenant plus derived counts, used by the tenant list and detail screens. */
export interface TenantSummary extends Tenant {
  userCount: number;
  activeUserCount: number;
}

export interface User {
  id: string;
  /** Null for platform operators - console staff who are not scoped to a customer tenant. */
  tenantId: string | null;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  entraObjectId: string | null;
  createdAt: string;
}

export const AUDIT_ACTIONS = [
  'tenant.suspended',
  'tenant.reactivated',
  'tenant.plan_changed',
  'user.role_changed',
  'user.deactivated',
  'user.reactivated',
  'user.provisioned',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = ['tenant', 'user'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorDisplayName: string | null;
  tenantId: string | null;
  tenantName: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
