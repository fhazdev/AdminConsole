import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  ApiErrorBody,
  GetTenantResponse,
  ListAuditLogQuery,
  ListAuditLogResponse,
  ListTenantUsersQuery,
  ListTenantUsersResponse,
  ListTenantsQuery,
  ListTenantsResponse,
  MeResponse,
  UpdateTenantBody,
  UpdateTenantResponse,
  UpdateUserBody,
  UpdateUserResponse,
} from '@admin-console/shared-types';
import { getAuthHeaders } from '../auth/tokenProvider.js';

/** Drops undefined/empty filters so they never reach the URL as `?status=`. */
function cleanParams(params: Record<string, unknown>): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  ) as Record<string, string | number>;
}

/** Pulls the API's structured message out of an RTK Query error for display. */
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as ApiErrorBody).error?.message === 'string'
    ) {
      return (data as ApiErrorBody).error.message;
    }
    const status = (error as { status?: unknown }).status;
    if (status === 'FETCH_ERROR') return 'Could not reach the API. Is it running?';
  }
  return 'Something went wrong. Please try again.';
}

export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
    // Resolved per call rather than captured at module load, so tests can swap
    // in a mock and so a polyfill loaded later is still picked up.
    fetchFn: (...args) => globalThis.fetch(...args),
    prepareHeaders: async (headers) => {
      for (const [key, value] of Object.entries(await getAuthHeaders())) {
        headers.set(key, value);
      }
      return headers;
    },
  }),
  // A mutation invalidates the lists it can change, so the table a user is
  // looking at refetches itself rather than showing a stale row.
  tagTypes: ['Tenant', 'TenantList', 'User', 'AuditLog', 'Me'],
  endpoints: (builder) => ({
    getMe: builder.query<MeResponse, void>({
      query: () => 'me',
      providesTags: ['Me'],
    }),

    listTenants: builder.query<ListTenantsResponse, ListTenantsQuery>({
      query: (params) => ({ url: 'tenants', params: cleanParams({ ...params }) }),
      providesTags: ['TenantList'],
    }),

    getTenant: builder.query<GetTenantResponse, string>({
      query: (id) => `tenants/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Tenant' as const, id }],
    }),

    updateTenant: builder.mutation<UpdateTenantResponse, { id: string } & UpdateTenantBody>({
      query: ({ id, ...body }) => ({ url: `tenants/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Tenant', id },
        'TenantList',
        'AuditLog',
      ],
    }),

    listTenantUsers: builder.query<
      ListTenantUsersResponse,
      { tenantId: string } & ListTenantUsersQuery
    >({
      query: ({ tenantId, ...params }) => ({
        url: `tenants/${tenantId}/users`,
        params: cleanParams({ ...params }),
      }),
      providesTags: ['User'],
    }),

    updateTenantUser: builder.mutation<
      UpdateUserResponse,
      { tenantId: string; userId: string } & UpdateUserBody
    >({
      query: ({ tenantId, userId, ...body }) => ({
        url: `tenants/${tenantId}/users/${userId}`,
        method: 'PATCH',
        body,
      }),
      // A role or status change moves the tenant's active-user count too.
      invalidatesTags: (_result, _error, { tenantId }) => [
        'User',
        'AuditLog',
        'TenantList',
        { type: 'Tenant', id: tenantId },
      ],
    }),

    listAuditLog: builder.query<ListAuditLogResponse, ListAuditLogQuery>({
      query: (params) => ({ url: 'audit-log', params: cleanParams({ ...params }) }),
      providesTags: ['AuditLog'],
    }),
  }),
});

export const {
  useGetMeQuery,
  useListTenantsQuery,
  useGetTenantQuery,
  useUpdateTenantMutation,
  useListTenantUsersQuery,
  useUpdateTenantUserMutation,
  useListAuditLogQuery,
} = adminApi;
