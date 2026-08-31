import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createStore, type AppStore, type RootState } from '../app/store.js';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
  /** Initial URL, so a route with params can be exercised directly. */
  route?: string;
  /** Route pattern to mount `ui` under, e.g. '/tenants/:tenantId'. */
  path?: string;
}

/**
 * Mounts a component with a real store and router. Tests drive RTK Query
 * through the mocked fetch rather than stubbing hooks, so cache invalidation
 * and refetch behaviour are covered too.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState,
    store = createStore(preloadedState),
    route = '/',
    path,
    ...options
  }: Options = {},
): RenderResult & { store: AppStore } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>
          {path ? (
            <Routes>
              <Route path={path} element={children} />
            </Routes>
          ) : (
            children
          )}
        </MemoryRouter>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}
