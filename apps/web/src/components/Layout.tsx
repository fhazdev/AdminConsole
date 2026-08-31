import { NavLink, Outlet } from 'react-router-dom';
import type { MeResponse } from '@admin-console/shared-types';
import { authMode } from '../auth/authConfig.js';

interface LayoutProps {
  me: MeResponse;
  onSignOut: () => void;
}

const NAV = [
  { to: '/tenants', label: 'Tenants' },
  { to: '/audit-log', label: 'Audit log' },
];

/** Sidebar + top bar chrome shared by all three screens. */
export function Layout({ me, onSignOut }: LayoutProps) {
  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Main">
        <div className="sidebar__brand">Admin Console</div>
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className="sidebar__link">
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          <span className="muted">
            {authMode === 'dev' ? 'Development sign-in' : 'Signed in with Microsoft'}
          </span>
          <div className="topbar__user">
            <span>{me.user.displayName}</span>
            <span className="topbar__email">{me.user.email}</span>
            <span className={`badge badge--${me.user.role.replace(/_/g, '-')}`}>
              {me.user.role.replace(/_/g, ' ')}
            </span>
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          {me.autoProvisioned && (
            <div className="banner" role="status">
              Your account was created on first sign-in with read-only access. An existing admin
              must grant you write permissions.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
