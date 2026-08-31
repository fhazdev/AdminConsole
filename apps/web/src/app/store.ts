import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { adminApi } from '../api/adminApi.js';
import { filtersReducer } from '../features/filtersSlice.js';

const rootReducer = combineReducers({
  [adminApi.reducerPath]: adminApi.reducer,
  filters: filtersReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Factory rather than a bare store so tests can mount a component with seeded
 * filter state and a fresh RTK Query cache each time.
 */
export function createStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(adminApi.middleware),
    preloadedState,
  });
  // Enables the refetchOnFocus / refetchOnReconnect behaviour.
  setupListeners(store.dispatch);
  return store;
}

export const store = createStore();

export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore['dispatch'];
