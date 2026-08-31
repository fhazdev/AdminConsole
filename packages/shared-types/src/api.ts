import type {
  AuditAction,
  AuditLogEntry,
  Tenant,
  TenantPlan,
  TenantStatus,
  TenantSummary,
  User,
  UserRole,
  UserStatus,
} from './domain.js';

/** Envelope returned by every list endpoint. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

/**
 * Consistent error shape returned by the centralized error handler.
 * `code` is machine-readable and stable; `message` is for humans.
 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level detail for validation failures. */
    details?: { path: string; message: string }[];
    /** Correlates a client-visible error with the structured server log. */
    requestId: string;
  };
}

export const API_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Permissions the frontend uses to show/hide destructive controls. */
export const PERMISSIONS = [
  'tenants:read',
  'tenants:write',
  'users:read',
  'users:write',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// GET /api/me
export interface MeResponse {
  user: User;
  permissions: Permission[];
  /** True when the record was created by first-login auto-provisioning. */
  autoProvisioned: boolean;
}

// GET /api/tenants
export interface ListTenantsQuery extends PaginationQuery {
  search?: string;
  status?: TenantStatus;
  plan?: TenantPlan;
}
export type ListTenantsResponse = Paginated<TenantSummary>;

// GET /api/tenants/:id
export type GetTenantResponse = TenantSummary;

// PATCH /api/tenants/:id
export interface UpdateTenantBody {
  plan?: TenantPlan;
  status?: TenantStatus;
}
export type UpdateTenantResponse = Tenant;

// GET /api/tenants/:id/users
export interface ListTenantUsersQuery extends PaginationQuery {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
}
export type ListTenantUsersResponse = Paginated<User>;

// PATCH /api/tenants/:id/users/:userId
export interface UpdateUserBody {
  role?: UserRole;
  status?: UserStatus;
}
export type UpdateUserResponse = User;

// GET /api/audit-log
export interface ListAuditLogQuery extends PaginationQuery {
  tenantId?: string;
  actorUserId?: string;
  action?: AuditAction;
  /** ISO-8601 timestamps, inclusive lower / exclusive upper bound. */
  from?: string;
  to?: string;
}
export type ListAuditLogResponse = Paginated<AuditLogEntry>;
