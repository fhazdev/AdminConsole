import type { Permission } from './api.js';
import type { UserRole } from './domain.js';

/**
 * Single source of truth for RBAC, shared so the UI hides exactly what the API
 * would reject. The API is still the enforcement point - the UI copy is a
 * convenience, never a control.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ['tenants:read', 'tenants:write', 'users:read', 'users:write', 'audit:read'],
  member: ['tenants:read', 'users:read', 'audit:read'],
  read_only: ['tenants:read', 'users:read', 'audit:read'],
};

export function permissionsForRole(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
