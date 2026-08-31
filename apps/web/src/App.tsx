import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { errorMessage, useGetMeQuery } from './api/adminApi.js';
import { LoginScreen } from './auth/LoginScreen.js';
import { Layout } from './components/Layout.js';
import { AuditLogPage } from './features/audit/AuditLogPage.js';
import { TenantDetailPage } from './features/tenants/TenantDetailPage.js';
import { TenantListPage } from './features/tenants/TenantListPage.js';

interface AppProps {
  /** True once MSAL reports an account, or immediately in dev auth mode. */
  isAuthenticated: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

/**
 * Routing and the authenticated/unauthenticated split. `GET /api/me` is the
 * gate: a token alone is not access, the API must also recognise the identity
 * and tell us what it may do.
 */
export function App({ isAuthenticated, onSignIn, onSignOut }: AppProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  const meQuery = useGetMeQuery(undefined, { skip: !isAuthenticated });

  function handleSignIn() {
    setIsSigningIn(true);
    onSignIn();
  }

  if (!isAuthenticated) {
    return <LoginScreen onSignIn={handleSignIn} isBusy={isSigningIn} />;
  }

  if (meQuery.isLoading) {
    return (
      <div className="login">
        <div className="login__card">
          <p role="status">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // A signed-in identity the API refuses (deactivated, or not provisioned when
  // auto-provisioning is off) must not land on an empty console.
  if (meQuery.isError || !meQuery.data) {
    return (
      <LoginScreen
        onSignIn={onSignOut}
        error={meQuery.isError ? errorMessage(meQuery.error) : 'Could not load your profile.'}
      />
    );
  }

  const me = meQuery.data;

  return (
    <Routes>
      <Route element={<Layout me={me} onSignOut={onSignOut} />}>
        <Route index element={<Navigate to="/tenants" replace />} />
        <Route path="/tenants" element={<TenantListPage permissions={me.permissions} />} />
        <Route
          path="/tenants/:tenantId"
          element={<TenantDetailPage permissions={me.permissions} currentUserId={me.user.id} />}
        />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route
          path="*"
          element={
            <div className="banner" role="status">
              That page does not exist.
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
