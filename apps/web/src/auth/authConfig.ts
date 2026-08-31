import type { Configuration, PopupRequest } from '@azure/msal-browser';

/**
 * Two auth modes, matching the API:
 *  - 'dev'   : no Entra dependency, an X-Dev-User header identifies the caller.
 *  - 'entra' : real MSAL redirect flow against the app registration.
 * The mode is baked in at build time, so a production bundle cannot fall back
 * to the dev path.
 */
export type AuthMode = 'dev' | 'entra';

export const authMode: AuthMode = import.meta.env.VITE_AUTH_MODE === 'entra' ? 'entra' : 'dev';

export const devUserEmail: string = import.meta.env.VITE_DEV_USER_EMAIL ?? 'dev.admin@example.com';

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? '';
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? '';

/** Scope the API expects in the access token's `aud`/`scp`. */
export const apiScopes: string[] = [
  import.meta.env.VITE_ENTRA_API_SCOPE ?? `api://${clientId}/access_as_user`,
];

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    // sessionStorage keeps the token out of other tabs and clears on close,
    // which suits an admin console better than localStorage.
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest: PopupRequest = { scopes: apiScopes };
