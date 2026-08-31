import type { AuditAction, AuditTargetType } from '@admin-console/shared-types';
import type { DbClient } from '../db/pool.js';
import { insertAuditEntry } from '../repositories/auditRepository.js';
import { getRequestContext, logger } from '../logging/logger.js';

export interface RecordAuditInput {
  actorUserId: string | null;
  tenantId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists an audit row and emits a matching structured log line. The database
 * row is the queryable system of record for the audit viewer; the log line is
 * what lands in Elasticsearch for the Kibana dashboard. Both are written from
 * one place so the two can never drift.
 */
export async function recordAudit(client: DbClient, input: RecordAuditInput): Promise<string> {
  const { id } = await insertAuditEntry(client, input);

  logger.info(
    {
      event: 'audit',
      auditId: id,
      action: input.action,
      actorUserId: input.actorUserId,
      // Denormalized onto the log line so Kibana can group by a human-readable
      // actor without joining back to Postgres.
      actorEmail: getRequestContext()?.userEmail ?? null,
      tenantId: input.tenantId,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
    `Admin action: ${input.action}`,
  );

  return id;
}
