import type { AuthContext } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the requestContext middleware on every request. */
      requestId: string;
      /** Set by requireAuth; absent on public routes such as /healthz. */
      auth?: AuthContext;
    }
  }
}

export {};
