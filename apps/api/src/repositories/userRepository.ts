import type { UpdateUserBody, User, UserRole } from '@admin-console/shared-types';
import { type DbClient, pool, query } from '../db/pool.js';
import { type UserRow, toUser } from '../db/mappers.js';
import { type PageRequest, SqlParams, offsetOf, whereClause } from './sqlParams.js';

const USER_COLUMNS = `id, tenant_id, email, display_name, role, status, entra_object_id, created_at`;

export interface ListTenantUsersFilters extends PageRequest {
  tenantId: string;
  search?: string | undefined;
  role?: string | undefined;
  status?: string | undefined;
}

function buildFilters(filters: ListTenantUsersFilters, params: SqlParams): string[] {
  const conditions = [`tenant_id = ${params.add(filters.tenantId)}`];
  if (filters.search) {
    const term = params.add(filters.search);
    conditions.push(
      `(email ILIKE '%' || ${term} || '%' OR display_name ILIKE '%' || ${term} || '%')`,
    );
  }
  if (filters.role) {
    conditions.push(`role = ${params.add(filters.role)}::user_role`);
  }
  if (filters.status) {
    conditions.push(`status = ${params.add(filters.status)}::user_status`);
  }
  return conditions;
}

export async function listTenantUsers(
  filters: ListTenantUsersFilters,
): Promise<{ items: User[]; total: number }> {
  const countParams = new SqlParams();
  const countWhere = whereClause(buildFilters(filters, countParams));
  const countResult = await query<{ total: string }>(
    pool,
    `SELECT count(*)::text AS total FROM users ${countWhere}`,
    countParams.all(),
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const params = new SqlParams();
  const where = whereClause(buildFilters(filters, params));
  const limit = params.add(filters.pageSize);
  const offset = params.add(offsetOf(filters));

  const result = await query<UserRow>(
    pool,
    `SELECT ${USER_COLUMNS} FROM users ${where}
     ORDER BY display_name ASC
     LIMIT ${limit} OFFSET ${offset}`,
    params.all(),
  );

  return { items: result.rows.map(toUser), total };
}

export async function findUserByEntraObjectId(objectId: string): Promise<User | null> {
  const result = await query<UserRow>(
    pool,
    `SELECT ${USER_COLUMNS} FROM users WHERE entra_object_id = $1`,
    [objectId],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await query<UserRow>(
    pool,
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

/**
 * Binds a pre-seeded user row to the Entra identity that just signed in.
 * Seeding only knows the email; the object ID is learned at first login.
 */
export async function linkEntraObjectId(userId: string, objectId: string): Promise<User> {
  const result = await query<UserRow>(
    pool,
    `UPDATE users SET entra_object_id = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [userId, objectId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`User ${userId} disappeared while linking Entra object ID`);
  return toUser(row);
}

export interface ProvisionUserInput {
  email: string;
  displayName: string;
  entraObjectId: string;
  role: UserRole;
}

/**
 * First-login auto-provisioning. Platform operators carry a null tenant_id.
 * Concurrent first requests from the same person are safe: whichever insert
 * loses the unique race falls back to reading the row the winner wrote.
 */
export async function provisionUser(
  client: DbClient,
  input: ProvisionUserInput,
): Promise<{ user: User; created: boolean }> {
  try {
    const inserted = await query<UserRow>(
      client,
      `INSERT INTO users (tenant_id, email, display_name, role, status, entra_object_id)
       VALUES (NULL, $1, $2, $3::user_role, 'active', $4)
       RETURNING ${USER_COLUMNS}`,
      [input.email, input.displayName, input.role, input.entraObjectId],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('Provisioning insert returned no row');
    return { user: toUser(row), created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Lost the race against either users_entra_object_id_key or users_email_key.
    const existing =
      (await findUserByEntraObjectId(input.entraObjectId)) ?? (await findUserByEmail(input.email));
    if (!existing) throw err;
    return { user: existing, created: false };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

export async function lockUser(
  client: DbClient,
  tenantId: string,
  userId: string,
): Promise<User | null> {
  const result = await query<UserRow>(
    client,
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [userId, tenantId],
  );
  const row = result.rows[0];
  return row ? toUser(row) : null;
}

export async function updateUser(
  client: DbClient,
  userId: string,
  patch: UpdateUserBody,
): Promise<User> {
  const params = new SqlParams();
  const assignments: string[] = [];
  if (patch.role !== undefined) {
    assignments.push(`role = ${params.add(patch.role)}::user_role`);
  }
  if (patch.status !== undefined) {
    assignments.push(`status = ${params.add(patch.status)}::user_status`);
  }

  const result = await query<UserRow>(
    client,
    `UPDATE users SET ${assignments.join(', ')}
     WHERE id = ${params.add(userId)}
     RETURNING ${USER_COLUMNS}`,
    params.all(),
  );
  const row = result.rows[0];
  if (!row) throw new Error(`User ${userId} disappeared during update`);
  return toUser(row);
}
