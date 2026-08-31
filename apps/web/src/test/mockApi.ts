import { vi } from 'vitest';
import type {
  AuditLogEntry,
  ListAuditLogResponse,
  ListTenantUsersResponse,
  ListTenantsResponse,
  TenantSummary,
  User,
} from '@admin-console/shared-types';

export interface RecordedRequest {
  method: string;
  url: URL;
  body: unknown;
}

type Handler = (req: RecordedRequest) => unknown;

/**
 * A tiny fetch router. Handlers are keyed by "METHOD /path" with the last
 * matching prefix winning, which is enough to cover the console's seven
 * endpoints without pulling in a full mock-server dependency.
 */
export class MockApi {
  readonly requests: RecordedRequest[] = [];
  private readonly handlers = new Map<string, Handler>();

  on(key: string, handler: Handler): this {
    this.handlers.set(key, handler);
    return this;
  }

  /** Installs the mock as global.fetch and returns it for assertions. */
  install(): this {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        // RTK Query hands fetchFn a fully built Request, so the method and body
        // live on the Request rather than on an init argument.
        const isRequest = typeof Request !== 'undefined' && input instanceof Request;
        const href =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(href, 'http://localhost');
        const method = (isRequest ? input.method : (init?.method ?? 'GET')).toUpperCase();

        const rawBody = isRequest ? await input.clone().text() : init?.body;
        const body = rawBody ? JSON.parse(String(rawBody)) : undefined;

        const request: RecordedRequest = { method, url, body };
        this.requests.push(request);

        const handler = this.match(method, url.pathname);
        if (!handler) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'not_found',
                message: `No handler for ${method} ${url.pathname}`,
                requestId: 'test',
              },
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          );
        }

        const result = handler(request);
        if (result instanceof Response) return result;
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    return this;
  }

  private match(method: string, pathname: string): Handler | undefined {
    let best: { key: string; handler: Handler } | undefined;
    for (const [key, handler] of this.handlers) {
      const [handlerMethod, pattern] = key.split(' ');
      if (handlerMethod !== method || !pattern) continue;
      if (!matchesPattern(pattern, pathname)) continue;
      if (!best || pattern.length > (best.key.split(' ')[1]?.length ?? 0)) {
        best = { key, handler };
      }
    }
    return best?.handler;
  }
}

/** Supports ':param' segments and an exact segment count. */
function matchesPattern(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, i) => part.startsWith(':') || part === pathParts[i]);
}

export function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message, requestId: 'test' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Fixtures ---

export function tenant(overrides: Partial<TenantSummary> = {}): TenantSummary {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Northwind Logistics',
    plan: 'enterprise',
    status: 'active',
    createdAt: '2025-01-15T10:00:00.000Z',
    userCount: 4,
    activeUserCount: 3,
    ...overrides,
  };
}

export function user(overrides: Partial<User> = {}): User {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    tenantId: '11111111-1111-1111-1111-111111111111',
    email: 'ava.chen@northwind.example',
    displayName: 'Ava Chen',
    role: 'member',
    status: 'active',
    entraObjectId: null,
    createdAt: '2025-01-16T10:00:00.000Z',
    ...overrides,
  };
}

export function auditEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    actorUserId: '44444444-4444-4444-4444-444444444444',
    actorEmail: 'dev.admin@example.com',
    actorDisplayName: 'Dev Admin',
    tenantId: '11111111-1111-1111-1111-111111111111',
    tenantName: 'Northwind Logistics',
    action: 'tenant.suspended',
    targetType: 'tenant',
    targetId: '11111111-1111-1111-1111-111111111111',
    metadata: { from: 'active', to: 'suspended' },
    createdAt: '2025-02-01T12:30:00.000Z',
    ...overrides,
  };
}

export function page<T>(
  items: T[],
  overrides: Partial<{ page: number; pageSize: number; total: number }> = {},
) {
  const pageSize = overrides.pageSize ?? 25;
  const total = overrides.total ?? items.length;
  return {
    items,
    page: overrides.page ?? 1,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export type TenantsPage = ListTenantsResponse;
export type UsersPage = ListTenantUsersResponse;
export type AuditPage = ListAuditLogResponse;
