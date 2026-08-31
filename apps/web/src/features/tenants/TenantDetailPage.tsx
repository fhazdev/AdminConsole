import { Link, useParams } from 'react-router-dom';
import {
  USER_ROLES,
  USER_STATUSES,
  type Permission,
  type User,
  type UserRole,
} from '@admin-console/shared-types';
import {
  errorMessage,
  useGetTenantQuery,
  useListTenantUsersQuery,
  useUpdateTenantUserMutation,
} from '../../api/adminApi.js';
import { useAppDispatch, useAppSelector } from '../../app/hooks.js';
import { Badge } from '../../components/Badge.js';
import { Pagination } from '../../components/Pagination.js';
import { TableState } from '../../components/TableStates.js';
import { setUserFilters } from '../filtersSlice.js';

const COLUMNS = 5;

interface TenantDetailPageProps {
  permissions: Permission[];
  /** The signed-in operator, who must not be able to edit their own row. */
  currentUserId: string;
}

export function TenantDetailPage({ permissions, currentUserId }: TenantDetailPageProps) {
  const { tenantId = '' } = useParams();
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.filters.users);
  const canWrite = permissions.includes('users:write');

  const tenantQuery = useGetTenantQuery(tenantId, { skip: !tenantId });
  const usersQuery = useListTenantUsersQuery(
    {
      tenantId,
      page: filters.page,
      search: filters.search || undefined,
      role: filters.role || undefined,
      status: filters.status || undefined,
    },
    { skip: !tenantId },
  );

  const [updateUser, { isLoading: isUpdating, error: updateError }] = useUpdateTenantUserMutation();

  async function changeRole(user: User, role: UserRole) {
    await updateUser({ tenantId, userId: user.id, role });
  }

  async function toggleStatus(user: User) {
    await updateUser({
      tenantId,
      userId: user.id,
      status: user.status === 'active' ? 'deactivated' : 'active',
    });
  }

  if (tenantQuery.isError) {
    return (
      <div className="banner banner--error" role="alert">
        {errorMessage(tenantQuery.error)} <Link to="/tenants">Back to tenants</Link>
      </div>
    );
  }

  const tenant = tenantQuery.data;

  return (
    <>
      <div className="page-header">
        <p>
          <Link to="/tenants">Back to tenants</Link>
        </p>
        <h1>{tenant?.name ?? 'Loading...'}</h1>
        {tenant && (
          <p>
            <Badge value={tenant.plan} /> <Badge value={tenant.status} />{' '}
            <span className="muted">
              {tenant.activeUserCount} of {tenant.userCount} users active
            </span>
          </p>
        )}
      </div>

      {updateError && (
        <div className="banner banner--error" role="alert">
          {errorMessage(updateError)}
        </div>
      )}

      <div className="filters">
        <div className="field">
          <label htmlFor="user-search">Search</label>
          <input
            id="user-search"
            type="search"
            placeholder="Name or email"
            value={filters.search}
            onChange={(e) => dispatch(setUserFilters({ search: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="user-role">Role</label>
          <select
            id="user-role"
            value={filters.role}
            onChange={(e) =>
              dispatch(setUserFilters({ role: e.target.value as typeof filters.role }))
            }
          >
            <option value="">All roles</option>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {role.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="user-status">Status</label>
          <select
            id="user-status"
            value={filters.status}
            onChange={(e) =>
              dispatch(setUserFilters({ status: e.target.value as typeof filters.status }))
            }
          >
            <option value="">All statuses</option>
            {USER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading && <TableState colSpan={COLUMNS}>Loading users...</TableState>}

              {usersQuery.isError && (
                <TableState colSpan={COLUMNS} variant="error">
                  {errorMessage(usersQuery.error)}
                </TableState>
              )}

              {!usersQuery.isLoading &&
                !usersQuery.isError &&
                usersQuery.data?.items.length === 0 && (
                  <TableState colSpan={COLUMNS}>No users match these filters.</TableState>
                )}

              {usersQuery.data?.items.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id}>
                    <td>{user.displayName}</td>
                    <td className="mono">{user.email}</td>
                    <td>
                      {canWrite && !isSelf ? (
                        <select
                          aria-label={`Role for ${user.displayName}`}
                          value={user.role}
                          disabled={isUpdating}
                          onChange={(e) => void changeRole(user, e.target.value as UserRole)}
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge value={user.role} tone="neutral" />
                      )}
                    </td>
                    <td>
                      <Badge value={user.status} />
                    </td>
                    <td>
                      {canWrite && !isSelf ? (
                        <button
                          type="button"
                          className={user.status === 'active' ? 'danger' : ''}
                          disabled={isUpdating}
                          onClick={() => void toggleStatus(user)}
                        >
                          {user.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                      ) : (
                        <span className="muted">{isSelf ? 'You' : 'No permission'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {usersQuery.data && (
          <Pagination
            page={usersQuery.data.page}
            pageSize={usersQuery.data.pageSize}
            total={usersQuery.data.total}
            totalPages={usersQuery.data.totalPages}
            onPageChange={(page) => dispatch(setUserFilters({ page }))}
          />
        )}
      </div>
    </>
  );
}
