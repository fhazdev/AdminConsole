import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Permission } from '@admin-console/shared-types';
import { MockApi, errorResponse, page, tenant, user as makeUser } from '../../test/mockApi.js';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { TenantDetailPage } from './TenantDetailPage.js';

const ADMIN_PERMISSIONS: Permission[] = [
  'tenants:read',
  'tenants:write',
  'users:read',
  'users:write',
  'audit:read',
];
const READ_ONLY_PERMISSIONS: Permission[] = ['tenants:read', 'users:read', 'audit:read'];

const TENANT_ID = 'acme-id';
const ACME = tenant({
  id: TENANT_ID,
  name: 'Acme Corp',
  plan: 'pro',
  userCount: 3,
  activeUserCount: 2,
});

const AVA = makeUser({
  id: 'ava-id',
  tenantId: TENANT_ID,
  displayName: 'Ava Chen',
  email: 'ava@acme.example',
  role: 'member',
});
const JORDAN = makeUser({
  id: 'jordan-id',
  tenantId: TENANT_ID,
  displayName: 'Jordan Vale',
  email: 'jordan@acme.example',
  role: 'read_only',
  status: 'deactivated',
});
const SELF = makeUser({
  id: 'self-id',
  tenantId: TENANT_ID,
  displayName: 'Dev Admin',
  email: 'dev.admin@example.com',
  role: 'admin',
});

let api: MockApi;

beforeEach(() => {
  api = new MockApi()
    .on('GET /api/tenants/:id', () => ACME)
    .on('GET /api/tenants/:id/users', () => page([AVA, JORDAN, SELF]))
    .install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(permissions: Permission[] = ADMIN_PERMISSIONS, currentUserId = 'other-id') {
  return renderWithProviders(
    <TenantDetailPage permissions={permissions} currentUserId={currentUserId} />,
    { route: `/tenants/${TENANT_ID}`, path: '/tenants/:tenantId' },
  );
}

function rowFor(name: string) {
  return screen.getByRole('row', { name: new RegExp(name, 'i') });
}

describe('TenantDetailPage', () => {
  it('shows the tenant header and its users', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByText('2 of 3 users active')).toBeInTheDocument();

    expect(await screen.findByText('ava@acme.example')).toBeInTheDocument();
    expect(within(rowFor('Jordan Vale')).getByText('deactivated')).toBeInTheDocument();
  });

  it('changes a role and sends only the changed field', async () => {
    const user = userEvent.setup();
    api.on('PATCH /api/tenants/:id/users/:userId', (req) => ({ ...AVA, ...(req.body as object) }));

    renderPage();
    await screen.findByText('ava@acme.example');

    await user.selectOptions(screen.getByLabelText('Role for Ava Chen'), 'admin');

    await waitFor(() => {
      const patch = api.requests.find((r) => r.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.url.pathname).toBe(`/api/tenants/${TENANT_ID}/users/ava-id`);
      expect(patch!.body).toEqual({ role: 'admin' });
    });
  });

  it('deactivates an active user', async () => {
    const user = userEvent.setup();
    api.on('PATCH /api/tenants/:id/users/:userId', (req) => ({ ...AVA, ...(req.body as object) }));

    renderPage();
    await screen.findByText('ava@acme.example');

    await user.click(within(rowFor('Ava Chen')).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(api.requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        status: 'deactivated',
      });
    });
  });

  it('offers Reactivate for a deactivated user', async () => {
    renderPage();
    await screen.findByText('jordan@acme.example');

    expect(
      within(rowFor('Jordan Vale')).getByRole('button', { name: 'Reactivate' }),
    ).toBeInTheDocument();
  });

  it('locks the signed-in operator out of editing their own row', async () => {
    renderPage(ADMIN_PERMISSIONS, SELF.id);
    await screen.findByText('dev.admin@example.com');

    const selfRow = rowFor('Dev Admin');
    expect(within(selfRow).getByText('You')).toBeInTheDocument();
    expect(within(selfRow).queryByRole('combobox')).not.toBeInTheDocument();
    // Other rows stay editable.
    expect(within(rowFor('Ava Chen')).getByRole('combobox')).toBeInTheDocument();
  });

  it('renders roles as read-only text without users:write', async () => {
    renderPage(READ_ONLY_PERMISSIONS);
    await screen.findByText('ava@acme.example');

    expect(screen.queryByRole('combobox', { name: /Role for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(within(rowFor('Ava Chen')).getByText('No permission')).toBeInTheDocument();
  });

  it('filters users by status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ava@acme.example');

    await user.selectOptions(screen.getByLabelText('Status'), 'active');

    await waitFor(() => {
      const last = api.requests.filter((r) => r.url.pathname.endsWith('/users')).at(-1)!;
      expect(last.url.searchParams.get('status')).toBe('active');
    });
  });

  it('shows a recoverable error when the tenant is gone', async () => {
    api.on('GET /api/tenants/:id', () => errorResponse(404, 'not_found', 'Tenant was not found.'));

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tenant was not found.');
    expect(screen.getByRole('link', { name: 'Back to tenants' })).toBeInTheDocument();
  });

  it('reports a rejected role change', async () => {
    const user = userEvent.setup();
    api.on('PATCH /api/tenants/:id/users/:userId', () =>
      errorResponse(409, 'conflict', 'You cannot change your own role or status.'),
    );

    renderPage();
    await screen.findByText('ava@acme.example');

    await user.selectOptions(screen.getByLabelText('Role for Ava Chen'), 'admin');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot change your own role or status.',
    );
  });
});
