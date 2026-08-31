import { Link } from 'react-router-dom';
import {
  TENANT_PLANS,
  TENANT_STATUSES,
  type Permission,
  type TenantSummary,
} from '@admin-console/shared-types';
import { errorMessage, useListTenantsQuery, useUpdateTenantMutation } from '../../api/adminApi.js';
import { useAppDispatch, useAppSelector } from '../../app/hooks.js';
import { Badge } from '../../components/Badge.js';
import { Pagination } from '../../components/Pagination.js';
import { TableState } from '../../components/TableStates.js';
import { setTenantFilters } from '../filtersSlice.js';

const COLUMNS = 6;

interface TenantListPageProps {
  permissions: Permission[];
}

export function TenantListPage({ permissions }: TenantListPageProps) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters.tenants);
  const canWrite = permissions.includes('tenants:write');

  const { data, isLoading, isFetching, isError, error } = useListTenantsQuery({
    page: filters.page,
    search: filters.search || undefined,
    status: filters.status || undefined,
    plan: filters.plan || undefined,
  });

  const [updateTenant, { isLoading: isUpdating, error: updateError }] = useUpdateTenantMutation();

  async function toggleStatus(tenant: TenantSummary) {
    await updateTenant({
      id: tenant.id,
      status: tenant.status === 'active' ? 'suspended' : 'active',
    });
  }

  return (
    <>
      <div className="page-header">
        <h1>Tenants</h1>
        <p>Every customer organisation on the platform.</p>
      </div>

      {updateError && (
        <div className="banner banner--error" role="alert">
          {errorMessage(updateError)}
        </div>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="tenant-search">Search</label>
          <input
            id="tenant-search"
            type="search"
            placeholder="Tenant name"
            value={filters.search}
            onChange={(e) => dispatch(setTenantFilters({ search: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="tenant-status">Status</label>
          <select
            id="tenant-status"
            value={filters.status}
            onChange={(e) =>
              dispatch(setTenantFilters({ status: e.target.value as typeof filters.status }))
            }
          >
            <option value="">All statuses</option>
            {TENANT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tenant-plan">Plan</label>
          <select
            id="tenant-plan"
            value={filters.plan}
            onChange={(e) =>
              dispatch(setTenantFilters({ plan: e.target.value as typeof filters.plan }))
            }
          >
            <option value="">All plans</option>
            {TENANT_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <caption className="visually-hidden">Tenants</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Plan</th>
                <th scope="col">Users</th>
                <th scope="col">Active</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableState colSpan={COLUMNS}>Loading tenants…</TableState>}

              {isError && (
                <TableState colSpan={COLUMNS} variant="error">
                  {errorMessage(error)}
                </TableState>
              )}

              {!isLoading && !isError && data?.items.length === 0 && (
                <TableState colSpan={COLUMNS}>No tenants match these filters.</TableState>
              )}

              {data?.items.map((tenant) => (
                <tr key={tenant.id}>
                  <td>
                    <Link to={`/tenants/${tenant.id}`}>{tenant.name}</Link>
                  </td>
                  <td>
                    <Badge value={tenant.plan} />
                  </td>
                  <td>{tenant.userCount}</td>
                  <td>{tenant.activeUserCount}</td>
                  <td>
                    <Badge value={tenant.status} />
                  </td>
                  <td>
                    {canWrite ? (
                      <button
                        type="button"
                        className={tenant.status === 'active' ? 'danger' : ''}
                        disabled={isUpdating}
                        onClick={() => void toggleStatus(tenant)}
                      >
                        {tenant.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    ) : (
                      <span className="muted">No permission</span>
                    )}
                  </td>
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
            onPageChange={(page) => dispatch(setTenantFilters({ page }))}
          />
        )}
      </div>

      {isFetching && !isLoading && <p className="muted">Refreshing…</p>}
    </>
  );
}
