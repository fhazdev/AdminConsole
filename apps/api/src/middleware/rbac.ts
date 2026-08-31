import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@admin-console/shared-types';
import { ApiError } from '../http/errors.js';
import { logger } from '../logging/logger.js';
import { authContext } from './auth.js';

/**
 * Enforces a permission on a route. The frontend hides controls the caller
 * cannot use, but this is the only place that actually decides.
 */
export function requirePermission(permission: Permission) {
  return function permissionGuard(req: Request, _res: Response, next: NextFunction): void {
    try {
      const { user, permissions } = authContext(req);
      if (!permissions.includes(permission)) {
        // Denials are logged at warn: a spike here is worth alerting on.
        logger.warn(
          { userId: user.id, role: user.role, permission, path: req.path, method: req.method },
          'Permission denied',
        );
        throw ApiError.forbidden(`This action requires the "${permission}" permission.`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
