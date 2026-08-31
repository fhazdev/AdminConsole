# Admin Console

A platform administration console: manage tenants, administer the users inside
them, and review an audit trail of every administrative action.

React + TypeScript frontend, Node.js + TypeScript API, Neon Postgres, Entra ID
sign-in with role-based access control, structured logs shipped to
Elasticsearch, and Terraform-provisioned Azure Container Apps behind API
Management.

## Quick start

Prerequisites: Node 20+, Docker.

```bash
npm install
cp .env.example .env

docker compose up -d                      # Postgres, Elasticsearch, Kibana
npm run db:migrate --workspace @admin-console/api
npm run db:migrate:test --workspace @admin-console/api
npm run db:seed --workspace @admin-console/api

npm run dev --workspace @admin-console/api   # http://localhost:8080
npm run dev --workspace @admin-console/web   # http://localhost:5173
```

Open http://localhost:5173 and press **Continue**. There is no Microsoft login
locally: `AUTH_MODE=dev` identifies you by an `X-Dev-User` header, seeded as
`dev.admin@example.com` (role `admin`). Sign in as `ops.viewer@example.com` by
changing `VITE_DEV_USER_EMAIL` to see the read-only experience.

Kibana is at http://localhost:5601. Import the dashboard with the command in
[infra/kibana/README.md](infra/kibana/README.md).

## What is where

```
apps/
  api/          Express API: routes, RBAC, repositories, migrations, seed
  web/          React SPA: three screens, Redux Toolkit + RTK Query
  e2e/          Playwright journey tests
packages/
  shared-types/ Domain types, API contracts and the RBAC table, shared by both apps
infra/
  terraform/    Azure infrastructure (modules + dev environment)
  kibana/       Dashboard saved-objects export
```

`packages/shared-types` is the contract. Both apps import the same enums, the
same request/response shapes and the same `ROLE_PERMISSIONS` table, so a change
to a role or a status value breaks the build on whichever side has not caught up.

## Screens

| Screen        | Route                | What it does                                                |
| ------------- | -------------------- | ----------------------------------------------------------- |
| Tenant list   | `/tenants`           | Plan, user counts, status; suspend and reactivate           |
| Tenant detail | `/tenants/:tenantId` | Users in one tenant; assign role, deactivate and reactivate |
| Audit log     | `/audit-log`         | Filter by tenant, action and date range                     |

## API

All endpoints require authentication. Mutations additionally require a
permission, checked in `middleware/rbac.ts`.

| Method  | Path                             | Permission      |
| ------- | -------------------------------- | --------------- |
| `GET`   | `/api/me`                        | authenticated   |
| `GET`   | `/api/tenants`                   | `tenants:read`  |
| `GET`   | `/api/tenants/:id`               | `tenants:read`  |
| `PATCH` | `/api/tenants/:id`               | `tenants:write` |
| `GET`   | `/api/tenants/:id/users`         | `users:read`    |
| `PATCH` | `/api/tenants/:id/users/:userId` | `users:write`   |
| `GET`   | `/api/audit-log`                 | `audit:read`    |
| `GET`   | `/healthz`, `/readyz`            | public          |

Every failure returns the same shape, with a `requestId` that matches the
structured log line for that request:

```json
{
  "error": {
    "code": "forbidden",
    "message": "This action requires the \"tenants:write\" permission.",
    "requestId": "421ab463-cc36-421e-b568-80fe94ef3ef1"
  }
}
```

## How authentication resolves a user

1. The SPA acquires an access token via MSAL and sends it as a bearer token.
2. The API validates it against Entra's JWKS (issuer and audience both checked).
3. The proven identity is mapped to a `users` row, in this order:
   - a row whose `entra_object_id` matches — used as-is;
   - otherwise a row whose email matches — claimed, and the object ID recorded,
     so operators can be seeded before they have ever signed in;
   - otherwise the identity is **auto-provisioned as `read_only`** and an
     audit entry is written. Set `AUTO_PROVISION_ENABLED=false` to reject
     unknown identities with a 403 instead.
4. A deactivated user is rejected regardless of how they were found.

Platform operators carry a null `tenant_id`: they administer the console, they
are not customers of it.

## Roles

| Role        | Read tenants, users, audit | Change tenants and users |
| ----------- | -------------------------- | ------------------------ |
| `admin`     | yes                        | yes                      |
| `member`    | yes                        | no                       |
| `read_only` | yes                        | no                       |

The UI hides controls the caller cannot use, but the API is the enforcement
point. `apps/api/tests/tenants.test.ts` asserts a read-only operator gets a 403
and that the tenant is genuinely unchanged afterwards.

## Auditing

Every mutation writes its `audit_log` row **inside the same transaction** as the
change itself, so an action can never be applied without leaving a trail. One
entry is written per semantic change, not one per request: a request that
changes both plan and status produces `tenant.plan_changed` _and_
`tenant.suspended`, which is what makes the audit viewer's action filter useful.

The same event is emitted as a structured log line, so it lands in
Elasticsearch too. The database row is the queryable system of record; the log
line is what the Kibana dashboard charts.

## Observability

`pino` writes JSON to stdout (captured by Container Apps into Log Analytics) and,
when `ELASTICSEARCH_URL` is set, ships the same lines to Elasticsearch. An
`AsyncLocalStorage` request context stitches `requestId`, `userId` and `role`
onto every line, so one request is traceable across middleware, repositories and
the audit writer.

Authorization headers, cookies and anything named `password` or
`connectionString` are redacted before a line leaves the process.

## Testing

```bash
npm run lint
npm run typecheck
npm test                                    # API + web
npm test --workspace @admin-console/e2e     # Playwright, starts its own servers
```

- **API** (37 tests) — integration tests against a real Postgres. They cover
  pagination and filtering, the audit trail each mutation produces, RBAC
  denials, first-login provisioning and the error contract.
- **Web** (27 tests) — React Testing Library against a mocked `fetch`, driving
  real RTK Query so cache invalidation and refetch-after-mutation are covered.
- **E2E** (4 tests) — Playwright: sign in, suspend a tenant, confirm it survives
  a reload, and confirm the audit log recorded it.

The API tests use `TEST_DATABASE_URL` and truncate between tests, so they never
touch your working database.

## Deploying

Infrastructure lives in [infra/terraform](infra/terraform). Neon is provisioned
manually; Terraform stores its connection string in Key Vault and the API reads
it through a managed identity, so the secret never enters Terraform state or a
container image.

```
Browser → Web Container App (nginx)
             ├─ static assets
             └─ /api/* → APIM → API Container App (internal ingress)
                                    ├→ Neon Postgres
                                    └→ Elasticsearch Container App (internal) → Kibana
```

The API container app has **internal ingress only**: the sole public route to it
is through API Management. The web container's nginx proxies `/api` server-side,
so the browser only ever calls its own origin and there is no CORS preflight.

See [infra/terraform/README.md](infra/terraform/README.md) for the first-run
steps and required secrets.

> **Note on Kibana.** It is deployed with external ingress and
> `xpack.security` disabled, so the dashboard can be shared without handing out
> credentials. Treat that URL as public: the seed data is deliberately fake, and
> nothing sensitive should ever be put in it.

## Decisions worth knowing

- **npm workspaces**, not pnpm or Turborepo. Four packages do not need build
  orchestration; adding it later is easy, and it is one less thing to explain.
- **`node-pg-migrate` with hand-written SQL**, not an ORM. The queries are the
  interesting part of this project, and raw SQL keeps them visible.
- **RTK Query** rather than hand-rolled thunks. Cache invalidation after a
  mutation is the entire reason the tables stay correct without manual refetch
  plumbing.
- **Scale-to-zero everywhere** (`min_replicas = 0`). An idle demo costs nothing;
  the trade is a cold start on the first request after a quiet period.
- **APIM Consumption tier**, which provisions in minutes rather than the hours a
  Developer-tier instance takes, and bills per call.
