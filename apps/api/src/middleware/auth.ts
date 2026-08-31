import type { NextFunction, Request, Response } from 'express';
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';
import { type Permission, type User, permissionsForRole } from '@admin-console/shared-types';
import { config } from '../config.js';
import { ApiError } from '../http/errors.js';
import { enrichRequestContext, logger } from '../logging/logger.js';
import { pool } from '../db/pool.js';
import {
  findUserByEmail,
  findUserByEntraObjectId,
  linkEntraObjectId,
  provisionUser,
} from '../repositories/userRepository.js';
import { recordAudit } from '../services/auditService.js';

export interface AuthContext {
  user: User;
  permissions: Permission[];
  autoProvisioned: boolean;
}

/** The identity a token proves, before it is mapped to a `users` row. */
interface VerifiedIdentity {
  objectId: string;
  email: string;
  displayName: string;
}

// Entra's signing keys rotate; createRemoteJWKSet caches and refreshes them.
const jwks = config.ENTRA_TENANT_ID
  ? createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}/discovery/v2.0/keys`),
    )
  : null;

function bearerToken(req: Request): string {
  const header = req.header('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) {
    throw ApiError.unauthorized('Missing bearer token.');
  }
  const token = header.slice('bearer '.length).trim();
  if (!token) throw ApiError.unauthorized('Missing bearer token.');
  return token;
}

function claimString(payload: JWTPayload, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

async function verifyEntraToken(req: Request): Promise<VerifiedIdentity> {
  if (!jwks) throw new Error('Entra JWKS is not configured');

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(bearerToken(req), jwks, {
      issuer: `https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}/v2.0`,
      audience: config.ENTRA_API_AUDIENCE,
    }));
  } catch (err) {
    // The reason is logged but never returned: token validation failures must
    // not tell a caller which part of the token was wrong.
    throw ApiError.unauthorized('Invalid or expired token.', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  }

  const objectId = claimString(payload, 'oid', 'sub');
  const email = claimString(payload, 'preferred_username', 'upn', 'email');
  if (!objectId || !email) {
    throw ApiError.unauthorized('Token is missing the required identity claims.');
  }

  return { objectId, email, displayName: claimString(payload, 'name') ?? email };
}

/**
 * Local-development identity. Guarded twice: config refuses AUTH_MODE=dev in
 * production, and this function re-checks before trusting a plain header.
 */
function devIdentity(req: Request): VerifiedIdentity {
  if (config.isProduction) throw new Error('Dev auth reached in a production build');
  const email = req.header('x-dev-user') ?? config.DEV_AUTH_EMAIL;
  return {
    objectId: `dev-${email.toLowerCase()}`,
    email,
    displayName: email.split('@')[0] ?? email,
  };
}

/**
 * Maps a proven identity to a `users` row.
 *
 * 1. Known Entra object ID wins outright.
 * 2. A pre-seeded row matching on email is claimed and linked on first login.
 * 3. Otherwise the identity is auto-provisioned read_only, if enabled.
 */
async function resolveUser(
  identity: VerifiedIdentity,
): Promise<{ user: User; autoProvisioned: boolean }> {
  const byObjectId = await findUserByEntraObjectId(identity.objectId);
  if (byObjectId) return { user: byObjectId, autoProvisioned: false };

  const byEmail = await findUserByEmail(identity.email);
  if (byEmail) {
    const user = byEmail.entraObjectId
      ? byEmail
      : await linkEntraObjectId(byEmail.id, identity.objectId);
    if (!byEmail.entraObjectId) {
      logger.info(
        { userId: user.id, email: user.email },
        'Linked pre-seeded user to Entra identity',
      );
    }
    return { user, autoProvisioned: false };
  }

  if (!config.AUTO_PROVISION_ENABLED) {
    throw ApiError.forbidden('Your account is not provisioned for this console.');
  }

  // Deliberately outside a transaction: a failed insert would poison the
  // transaction and take the audit row down with it. Provisioning is
  // idempotent, so the follow-up audit write is safe on its own.
  const { user, created } = await provisionUser(pool, {
    email: identity.email,
    displayName: identity.displayName,
    entraObjectId: identity.objectId,
    role: 'read_only',
  });

  if (created) {
    await recordAudit(pool, {
      actorUserId: user.id,
      tenantId: null,
      action: 'user.provisioned',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email, role: user.role, source: 'first_login' },
    });
  }

  return { user, autoProvisioned: created };
}

/** Authenticates the caller and attaches the resolved user to the request. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const identity = config.AUTH_MODE === 'entra' ? await verifyEntraToken(req) : devIdentity(req);

    const { user, autoProvisioned } = await resolveUser(identity);

    if (user.status === 'deactivated') {
      throw ApiError.forbidden('This account has been deactivated.');
    }

    req.auth = { user, permissions: permissionsForRole(user.role), autoProvisioned };
    enrichRequestContext({ userId: user.id, userEmail: user.email, role: user.role });
    next();
  } catch (err) {
    next(err);
  }
}

/** Narrows `req.auth` for handlers that run behind requireAuth. */
export function authContext(req: Request): AuthContext {
  if (!req.auth) throw new Error('authContext called on a route without requireAuth');
  return req.auth;
}
