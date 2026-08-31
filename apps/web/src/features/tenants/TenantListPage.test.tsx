import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Permission } from '@admin-console/shared-types';
import { MockApi, errorResponse, page, tenant } from '../../test/mockApi.js';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { TenantListPage } from './TenantListPage.js';

const ADMIN_PERMISSIONS: Permission[] = [
  'tenants:read',
  'tenants:write',
  'users:read',
  'users:write',
  'audit:read',
];
const READ_ONLY_PERMISSIONS: Permission[] = ['tenants:read', 'users:read', 'audit:read'];

const ACME = tenant({
  id: 'acme-id',
  name: 'Acme Corp',
  plan: 'pro',
  status: 'active',
  userCount: 3,
  activeUserCount: 2,
});
const ZENITH = tenant({
  id: 'zenith-id',
  name: 'Zenith Ltd',
  plan: 'trial',
  status: 'suspended',
  userCount: 1,
  activeUserCount: 0,
});

let api: MockApi;

beforeEach(() => {
  api = new MockApi().on('GET /api/tenants', () => page([ACME, ZENITH])).install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function rowFor(name: string) {
  return screen.getByRole('row', { name: new RegExp(name, 'i') });
}

describe('TenantListPage', () => {
  it('renders a row per tenant with plan, counts and status', async () => {
    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);

    expect(await screen.findByRole('link', { name: 'Acme Corp' })).toBeInTheDocument();

    const acme = rowFor('Acme Corp');
    expect(within(acme).getByText('pro')).toBeInTheDocument();
    expect(within(acme).getByText('active')).toBeInTheDocument();
    // userCount then activeUserCount.
    expect(within(acme).getByRole('cell', { name: '3' })).toBeInTheDocument();
    expect(within(acme).getByRole('cell', { name: '2' })).toBeInTheDocument();

    expect(within(rowFor('Zenith Ltd')).getByText('suspended')).toBeInTheDocument();
  });

  it('shows Suspend for an active tenant and Reactivate for a suspended one', async () => {
    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);
    await screen.findByRole('link', { name: 'Acme Corp' });

    expect(
      within(rowFor('Acme Corp')).getByRole('button', { name: 'Suspend' }),
    ).toBeInTheDocument();
    expect(
      within(rowFor('Zenith Ltd')).getByRole('button', { name: 'Reactivate' }),
    ).toBeInTheDocument();
  });

  it('suspends a tenant and reflects the new status after refetch', async () => {
    const user = userEvent.setup();
    let suspended = false;

    api
      .on('GET /api/tenants', () =>
        page([suspended ? { ...ACME, status: 'suspended' as const } : ACME, ZENITH]),
      )
      .on('PATCH /api/tenants/:id', (req) => {
        suspended = true;
        return { ...ACME, status: req.body as string };
      });

    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);
    await screen.findByRole('link', { name: 'Acme Corp' });

    await user.click(within(rowFor('Acme Corp')).getByRole('button', { name: 'Suspend' }));

    const patch = await waitFor(() => {
      const request = api.requests.find((r) => r.method === 'PATCH');
      expect(request).toBeDefined();
      return request!;
    });
    expect(patch.url.pathname).toBe('/api/tenants/acme-id');
    expect(patch.body).toEqual({ status: 'suspended' });

    // The mutation invalidates TenantList, so the row updates without a reload.
    await waitFor(() => {
      expect(
        within(rowFor('Acme Corp')).getByRole('button', { name: 'Reactivate' }),
      ).toBeInTheDocument();
    });
  });

  it('hides the action from an operator without tenants:write', async () => {
    renderWithProviders(<TenantListPage permissions={READ_ONLY_PERMISSIONS} />);
    await screen.findByRole('link', { name: 'Acme Corp' });

    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(within(rowFor('Acme Corp')).getByText('No permission')).toBeInTheDocument();
  });

  it('sends the status filter to the API and resets to page 1', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />, {
      preloadedState: {
        filters: {
          tenants: { search: '', status: '', plan: '', page: 3 },
          users: { search: '', role: '', status: '', page: 1 },
          audit: { tenantId: '', action: '', from: '', to: '', page: 1 },
        },
      },
    });
    await screen.findByRole('link', { name: 'Acme Corp' });

    await user.selectOptions(screen.getByLabelText('Status'), 'suspended');

    await waitFor(() => {
      const last = api.requests.at(-1)!;
      expect(last.url.searchParams.get('status')).toBe('suspended');
      expect(last.url.searchParams.get('page')).toBe('1');
    });
  });

  it('debounce-free search reaches the API as a query parameter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);
    await screen.findByRole('link', { name: 'Acme Corp' });

    await user.type(screen.getByLabelText('Search'), 'zen');

    await waitFor(() => {
      expect(api.requests.at(-1)!.url.searchParams.get('search')).toBe('zen');
    });
  });

  it('renders an empty state when nothing matches', async () => {
    api.on('GET /api/tenants', () => page([]));
    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);

    expect(await screen.findByText('No tenants match these filters.')).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('surfaces the API error message instead of an empty table', async () => {
    api.on('GET /api/tenants', () =>
      errorResponse(403, 'forbidden', 'This action requires the "tenants:read" permission.'),
    );
    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This action requires the "tenants:read" permission.');
  });

  it('reports a failed suspend without changing the row', async () => {
    const user = userEvent.setup();
    api.on('PATCH /api/tenants/:id', () =>
      errorResponse(403, 'forbidden', 'This action requires the "tenants:write" permission.'),
    );

    renderWithProviders(<TenantListPage permissions={ADMIN_PERMISSIONS} />);
    await screen.findByRole('link', { name: 'Acme Corp' });

    await user.click(within(rowFor('Acme Corp')).getByRole('button', { name: 'Suspend' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('tenants:write');
    expect(
      within(rowFor('Acme Corp')).getByRole('button', { name: 'Suspend' }),
    ).toBeInTheDocument();
  });
});
