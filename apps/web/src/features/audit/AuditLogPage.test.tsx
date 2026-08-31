import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockApi, auditEntry, errorResponse, page, tenant } from '../../test/mockApi.js';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { AuditLogPage } from './AuditLogPage.js';

const ACME = tenant({ id: 'acme-id', name: 'Acme Corp' });

const SUSPENDED = auditEntry({
  id: 'a1',
  action: 'tenant.suspended',
  tenantId: 'acme-id',
  tenantName: 'Acme Corp',
  metadata: { from: 'active', to: 'suspended' },
  createdAt: '2025-02-01T12:30:00.000Z',
});

const PROVISIONED = auditEntry({
  id: 'a2',
  action: 'user.provisioned',
  targetType: 'user',
  tenantId: null,
  tenantName: null,
  actorDisplayName: 'Newcomer',
  actorEmail: 'newcomer@example.com',
  metadata: { email: 'newcomer@example.com', source: 'first_login' },
  createdAt: '2025-01-30T09:00:00.000Z',
});

let api: MockApi;

beforeEach(() => {
  api = new MockApi()
    .on('GET /api/tenants', () => page([ACME]))
    .on('GET /api/audit-log', () => page([SUSPENDED, PROVISIONED]))
    .install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function auditRequests() {
  return api.requests.filter((r) => r.url.pathname === '/api/audit-log');
}

describe('AuditLogPage', () => {
  it('renders each entry with actor, action and a readable change summary', async () => {
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByRole('cell', { name: 'tenant.suspended' })).toBeInTheDocument();

    const row = screen.getByRole('row', { name: /tenant\.suspended/ });
    expect(within(row).getByText('Dev Admin')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(within(row).getByText('active to suspended')).toBeInTheDocument();
  });

  it('labels a platform-level entry that has no tenant', async () => {
    renderWithProviders(<AuditLogPage />);
    await screen.findByRole('cell', { name: 'user.provisioned' });

    const row = screen.getByRole('row', { name: /user\.provisioned/ });
    expect(within(row).getByText('Platform')).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  });

  it('populates the tenant filter from the tenant list', async () => {
    renderWithProviders(<AuditLogPage />);

    const select = await screen.findByLabelText('Tenant');
    // The option appears only once the tenant list query resolves.
    expect(await within(select).findByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  it('filters by action', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);
    await screen.findByRole('cell', { name: 'tenant.suspended' });

    await user.selectOptions(screen.getByLabelText('Action'), 'user.provisioned');

    await waitFor(() => {
      expect(auditRequests().at(-1)!.url.searchParams.get('action')).toBe('user.provisioned');
    });
  });

  it('widens a from-date to the start of that UTC day', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);
    await screen.findByRole('cell', { name: 'tenant.suspended' });

    await user.type(screen.getByLabelText('From'), '2025-02-01');

    await waitFor(() => {
      expect(auditRequests().at(-1)!.url.searchParams.get('from')).toBe('2025-02-01T00:00:00.000Z');
    });
  });

  it('widens a to-date to the end of that UTC day so the day is included', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);
    await screen.findByRole('cell', { name: 'tenant.suspended' });

    await user.type(screen.getByLabelText('To'), '2025-02-01');

    await waitFor(() => {
      expect(auditRequests().at(-1)!.url.searchParams.get('to')).toBe('2025-02-01T23:59:59.999Z');
    });
  });

  it('clears every filter at once', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AuditLogPage />);
    await screen.findByRole('cell', { name: 'tenant.suspended' });

    await user.selectOptions(screen.getByLabelText('Action'), 'user.provisioned');
    await waitFor(() => {
      expect(auditRequests().at(-1)!.url.searchParams.get('action')).toBe('user.provisioned');
    });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByLabelText('Action')).toHaveValue('');
    expect(screen.getByLabelText('From')).toHaveValue('');
    // The unfiltered result is already cached, so the rows come straight back.
    await waitFor(() => {
      expect(screen.getByRole('cell', { name: 'user.provisioned' })).toBeInTheDocument();
    });
  });

  it('renders an empty state rather than a bare table', async () => {
    api.on('GET /api/audit-log', () => page([]));
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByText('No audit entries match these filters.')).toBeInTheDocument();
  });

  it('surfaces an API failure', async () => {
    api.on('GET /api/audit-log', () =>
      errorResponse(403, 'forbidden', 'This action requires the "audit:read" permission.'),
    );
    renderWithProviders(<AuditLogPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('audit:read');
  });
});
