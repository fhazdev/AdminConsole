import { Router } from 'express';
import { z } from 'zod';
import { AUDIT_ACTIONS, type ListAuditLogResponse } from '@admin-console/shared-types';
import { paginate, paginationSchema } from '../http/pagination.js';
import { parseQuery } from '../http/validate.js';
import { requirePermission } from '../middleware/rbac.js';
import { listAuditLog } from '../repositories/auditRepository.js';

const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.coerce.date().transform((d) => d.toISOString()));

const listAuditLogQuery = paginationSchema
  .extend({
    tenantId: z.string().uuid().optional(),
    actorUserId: z.string().uuid().optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((q) => !q.from || !q.to || new Date(q.from) < new Date(q.to), {
    message: '"from" must be earlier than "to".',
    path: ['from'],
  });

export const auditLogRouter = Router();

auditLogRouter.get('/', requirePermission('audit:read'), async (req, res) => {
  const query = parseQuery(listAuditLogQuery, req);
  const { items, total } = await listAuditLog(query);
  const body: ListAuditLogResponse = paginate(items, total, query);
  res.json(body);
});
