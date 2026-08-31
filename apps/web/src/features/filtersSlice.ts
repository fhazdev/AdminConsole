import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  AuditAction,
  TenantPlan,
  TenantStatus,
  UserRole,
  UserStatus,
} from '@admin-console/shared-types';

/**
 * Table filter state lives in Redux rather than component state so a user can
 * open a tenant, come back, and find the list exactly as they left it.
 */
export interface TenantFilters {
  search: string;
  status: TenantStatus | '';
  plan: TenantPlan | '';
  page: number;
}

export interface UserFilters {
  search: string;
  role: UserRole | '';
  status: UserStatus | '';
  page: number;
}

export interface AuditFilters {
  tenantId: string;
  action: AuditAction | '';
  from: string;
  to: string;
  page: number;
}

export interface FiltersState {
  tenants: TenantFilters;
  users: UserFilters;
  audit: AuditFilters;
}

const initialState: FiltersState = {
  tenants: { search: '', status: '', plan: '', page: 1 },
  users: { search: '', role: '', status: '', page: 1 },
  audit: { tenantId: '', action: '', from: '', to: '', page: 1 },
};

const filtersSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    // Changing any filter resets to page 1: staying on page 4 of a now
    // two-page result is the classic empty-table bug.
    setTenantFilters(state, action: PayloadAction<Partial<TenantFilters>>) {
      state.tenants = { ...state.tenants, ...action.payload, page: action.payload.page ?? 1 };
    },
    setUserFilters(state, action: PayloadAction<Partial<UserFilters>>) {
      state.users = { ...state.users, ...action.payload, page: action.payload.page ?? 1 };
    },
    setAuditFilters(state, action: PayloadAction<Partial<AuditFilters>>) {
      state.audit = { ...state.audit, ...action.payload, page: action.payload.page ?? 1 };
    },
    resetUserFilters(state) {
      state.users = initialState.users;
    },
  },
});

export const { setTenantFilters, setUserFilters, setAuditFilters, resetUserFilters } =
  filtersSlice.actions;
export const filtersReducer = filtersSlice.reducer;
