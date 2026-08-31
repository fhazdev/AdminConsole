import { Link } from 'react-router-dom';
import { AUDIT_ACTIONS, type AuditLogEntry } from '@admin-console/shared-types';
import { errorMessage, useListAuditLogQuery, useListTenantsQuery } from '../../api/adminApi.js';
import { useAppDispatch, useAppSelector } from '../../app/hooks.js';
import { Pagination } from '../../components/Pagination.js';
import { TableState } from '../../components/TableStates.js';
import { setAuditFilters } from '../filtersSlice.js';

const COLUMNS = 5;

/** Turns the metadata jsonb into a short human summary of what changed. */
function describeChange(entry: AuditLogEntry): string {
  const { from, to } = entry.metadata as { from?: unknown; to?: unknown };
  if (typeof from === 'string' && typeof to === 'string') {
    return `${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}`;
  }
  const email = entry.metadata.email;
  return typeof email === 'string' ? email : '';
}

/** The API stores timestamps as UTC ISO strings; render them in local time. */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** `<input type="date">` gives a bare date; widen it to a UTC instant. */
function dateToIso(value: string, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  return endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
}

export function AuditLogPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters.audit);

  // Reused to turn the tenant filter into a name dropdown rather than a UUID box.
  const tenantsQuery = useListTenantsQuery({ pageSize: 100 });

  const { data, isLoading, isError, error } = useListAuditLogQuery({
    page: filters.page,
    tenantId: filters.tenantId || undefined,
    action: filters.action || undefined,
    from: dateToIso(filters.from, false),
    to: dateToIso(filters.to, true),
  });

  return (
    <>
      <div className="page-header">
        <h1>Audit log</h1>
        <p>Every administrative action taken in this console.</p>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="audit-tenant">Tenant</label>
          <select
            id="audit-tenant"
            value={filters.tenantId}
            onChange={(e) => dispatch(setAuditFilters({ tenantId: e.target.value }))}
          >
            <option value="">All tenants</option>
            {tenantsQuery.data?.items.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audit-action">Action</label>
          <select
            id="audit-action"
            value={filters.action}
            onChange={(e) =>
              dispatch(setAuditFilters({ action: e.target.value as typeof filters.action }))
            }
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="audit-from">From</label>
          <input
            id="audit-from"
            type="date"
            value={filters.from}
            onChange={(e) => dispatch(setAuditFilters({ from: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="audit-to">To</label>
          <input
            id="audit-to"
            type="date"
            value={filters.to}
            onChange={(e) => dispatch(setAuditFilters({ to: e.target.value }))}
          />
        </div>
        <button
          type="button"
          onClick={() =>
            dispatch(setAuditFilters({ tenantId: '', action: '', from: '', to: '', page: 1 }))
          }
        >
          Clear filters
        </button>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Tenant</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableState colSpan={COLUMNS}>Loading audit entries...</TableState>}

              {isError && (
                <TableState colSpan={COLUMNS} variant="error">
                  {errorMessage(error)}
                </TableState>
              )}

              {!isLoading && !isError && data?.items.length === 0 && (
                <TableState colSpan={COLUMNS}>No audit entries match these filters.</TableState>
              )}

              {data?.items.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
                  </td>
                  <td>
                    {entry.actorDisplayName ?? <span className="muted">Deleted user</span>}
                    {entry.actorEmail && <div className="mono muted">{entry.actorEmail}</div>}
                  </td>
                  <td className="mono">{entry.action}</td>
                  <td>
                    {entry.tenantId && entry.tenantName ? (
                      <Link to={`/tenants/${entry.tenantId}`}>{entry.tenantName}</Link>
                    ) : (
                      <span className="muted">Platform</span>
                    )}
                  </td>
                  <td className="wrap">{describeChange(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
            onPageChange={(page) => dispatch(setAuditFilters({ page }))}
          />
        )}
      </div>
    </>
  );
}
