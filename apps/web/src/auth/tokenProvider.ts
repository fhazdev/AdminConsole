import {
  type IPublicClientApplication,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser';
import { apiScopes, authMode, devUserEmail, msalConfig } from './authConfig.js';

/**
 * The single place the API client asks "how do I authenticate this request?".
 * Keeping it outside React lets the RTK Query base query reach it without
 * threading hooks through every call site.
 */
export interface AuthHeaders {
  [header: string]: string;
}

let msalInstance: PublicClientApplication | null = null;

export function getMsalInstance(): PublicClientApplication {
  if (authMode !== 'entra') {
    throw new Error('MSAL is not available in dev auth mode');
  }
  msalInstance ??= new PublicClientApplication(msalConfig);
  return msalInstance;
}

/** Set once MsalProvider is mounted, so token acquisition uses the same instance. */
let activeInstance: IPublicClientApplication | null = null;
export function setActiveMsalInstance(instance: IPublicClientApplication): void {
  activeInstance = instance;
}

export async function getAuthHeaders(): Promise<AuthHeaders> {
  if (authMode === 'dev') {
    return { 'X-Dev-User': devUserEmail };
  }

  const instance = activeInstance ?? getMsalInstance();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  if (!account) return {};

  try {
    // Silent first: MSAL serves from cache and refreshes in the background,
    // so a live session never bounces the user to Microsoft mid-task.
    const result = await instance.acquireTokenSilent({ scopes: apiScopes, account });
    return { Authorization: `Bearer ${result.accessToken}` };
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect({ scopes: apiScopes, account });
      return {};
    }
    throw err;
  }
}
