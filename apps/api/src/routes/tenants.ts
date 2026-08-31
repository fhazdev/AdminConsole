import { Router } from 'express';
import { z } from 'zod';
import {
  TENANT_PLANS,
  TENANT_STATUSES,
  USER_ROLES,
  USER_STATUSES,
  type GetTenantResponse,
  type ListTenantUsersResponse,
  type ListTenantsResponse,
  type UpdateTenantResponse,
  type UpdateUserResponse,
} from '@admin-console/shared-types';
import { withTransaction } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { paginate, paginationSchema } from '../http/pagination.js';
import { parseBody, parseParams, parseQuery } from '../http/validate.js';
import { authContext } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  findTenantById,
  listTenants,
  lockTenant,
  updateTenant,
} from '../repositories/tenantRepository.js';
import { listTenantUsers, lockUser, updateUser } from '../repositories/userRepository.js';
import { recordAudit } from '../services/auditService.js';

const tenantIdParams = z.object({ id: z.string().uuid('Tenant ID must be a UUID.') });
const tenantUserParams = tenantIdParams.extend({
  userId: z.string().uuid('User ID must be a UUID.'),
});

const listTenantsQuery = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  plan: z.enum(TENANT_PLANS).optional(),
});

const updateTenantBody = z
  .object({
    plan: z.enum(TENANT_PLANS).optional(),
    status: z.enum(TENANT_STATUSES).optional(),
  })
  .refine((body) => body.plan !== undefined || body.status !== undefined, {
    message: 'Provide at least one of "plan" or "status".',
  });

const listTenantUsersQuery = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

const updateUserBody = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((body) => body.role !== undefined || body.status !== undefined, {
    message: 'Provide at least one of "role" or "status".',
  });

export const tenantsRouter = Router();

tenantsRouter.get('/', requirePermission('tenants:read'), async (req, res) => {
  const query = parseQuery(listTenantsQuery, req);
  const { items, total } = await listTenants(query);
  const body: ListTenantsResponse = paginate(items, total, query);
  res.json(body);
});

tenantsRouter.get('/:id', requirePermission('tenants:read'), async (req, res) => {
  const { id } = parseParams(tenantIdParams, req);
  const tenant = await findTenantById(id);
  if (!tenant) throw ApiError.notFound('Tenant');
  const body: GetTenantResponse = tenant;
  res.json(body);
});

tenantsRouter.patch('/:id', requirePermission('tenants:write'), async (req, res) => {
  const { id } = parseParams(tenantIdParams, req);
  const patch = parseBody(updateTenantBody, req);
  const { user: actor } = authContext(req);

  const updated = await withTransaction(async (client) => {
    const before = await lockTenant(client, id);
    if (!before) throw ApiError.notFound('Tenant');

    const after = await updateTenant(client, id, patch);

    // One audit entry per semantic change, not one per request, so the viewer
    // can filter on "tenant.suspended" without parsing a diff blob.
    if (patch.status !== undefined && patch.status !== before.status) {
      await recordAudit(client, {
        actorUserId: actor.id,
        tenantId: id,
        action: patch.status === 'suspended' ? 'tenant.suspended' : 'tenant.reactivated',
        targetType: 'tenant',
        targetId: id,
        metadata: { tenantName: before.name, from: before.status, to: patch.status },
      });
    }
    if (patch.plan !== undefined && patch.plan !== before.plan) {
      await recordAudit(client, {
        actorUserId: actor.id,
        tenantId: id,
        action: 'tenant.plan_changed',
        targetType: 'tenant',
        targetId: id,
        metadata: { tenantName: before.name, from: before.plan, to: patch.plan },
      });
    }

    return after;
  });

  const body: UpdateTenantResponse = updated;
  res.json(body);
});

tenantsRouter.get('/:id/users', requirePermission('users:read'), async (req, res) => {
  const { id } = parseParams(tenantIdParams, req);
  const query = parseQuery(listTenantUsersQuery, req);

  // Distinguish "tenant does not exist" from "tenant has no users".
  const tenant = await findTenantById(id);
  if (!tenant) throw ApiError.notFound('Tenant');

  const { items, total } = await listTenantUsers({ ...query, tenantId: id });
  const body: ListTenantUsersResponse = paginate(items, total, query);
  res.json(body);
});

tenantsRouter.patch('/:id/users/:userId', requirePermission('users:write'), async (req, res) => {
  const { id, userId } = parseParams(tenantUserParams, req);
  const patch = parseBody(updateUserBody, req);
  const { user: actor } = authContext(req);

  if (userId === actor.id) {
    throw ApiError.conflict('You cannot change your own role or status.');
  }

  const updated = await withTransaction(async (client) => {
    const before = await lockUser(client, id, userId);
    if (!before) throw ApiError.notFound('User');

    const after = await updateUser(client, userId, patch);

    if (patch.role !== undefined && patch.role !== before.role) {
      await recordAudit(client, {
        actorUserId: actor.id,
        tenantId: id,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: userId,
        metadata: { email: before.email, from: before.role, to: patch.role },
      });
    }
    if (patch.status !== undefined && patch.status !== before.status) {
      await recordAudit(client, {
        actorUserId: actor.id,
        tenantId: id,
        action: patch.status === 'deactivated' ? 'user.deactivated' : 'user.reactivated',
        targetType: 'user',
        targetId: userId,
        metadata: { email: before.email, from: before.status, to: patch.status },
      });
    }

    return after;
  });

  const body: UpdateUserResponse = updated;
  res.json(body);
});
