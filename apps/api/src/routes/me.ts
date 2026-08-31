import { Router } from 'express';
import type { MeResponse } from '@admin-console/shared-types';
import { authContext } from '../middleware/auth.js';

export const meRouter = Router();

/**
 * The frontend calls this immediately after sign-in to learn who it is talking
 * to and which controls to render. No permission guard: any authenticated
 * caller is allowed to read their own profile.
 */
meRouter.get('/', (req, res) => {
  const { user, permissions, autoProvisioned } = authContext(req);
  const body: MeResponse = { user, permissions, autoProvisioned };
  res.json(body);
});
