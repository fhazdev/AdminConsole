# Admin Console — Build Plan

## Purpose

Portfolio project targeting a Software Engineer II (Platform Admin UX) posting.
The project demonstrates: full-stack ownership (React UI through Node.js backend
services), operational maturity (auth/session boundaries, structured logging,
observability), and testing discipline (component + E2E). Feature flag
management is explicitly out of scope for this project.

## Tech stack

- **Frontend**: React + TypeScript, Redux Toolkit for state
- **Backend**: Node.js + TypeScript API using Express
- **Database**: Neon Postgres (serverless Postgres, external to Azure)
- **Auth**: Azure Entra ID (OAuth 2.0 / OIDC) — admins sign in with their Microsoft account
- **Logging/observability**: Elasticsearch + Kibana dashboard for structured logs. Elasticsearch runs as a Container App in the same environment as the frontend and backend, with no persistent volume — data is ephemeral by design since this is a demo project. Kibana runs as its own Container App alongside it, for building and viewing dashboards
- **Infrastructure**: Terraform, deployed to Azure
- **Compute**: Azure Container Apps (frontend, backend, Elasticsearch, and Kibana, all in one Container Apps environment)
- **API gateway**: Azure API Management (APIM) in front of the backend Container App
- **CI/CD**: GitHub Actions
- **Testing**: React Testing Library (frontend), Playwright (E2E/synthetics)
- **Repo structure**: Monorepo

## Scope (in / out)

**In scope:**

- Tenant management (list, view, suspend/reactivate, change plan)
- User administration within a tenant (list, assign role, deactivate)
- Audit log viewer (searchable/filterable list of admin actions)
- Entra ID login and role-based access control (RBAC) for admin actions
- Structured logging shipped to Elasticsearch with a basic Kibana dashboard
- Terraform-provisioned Azure infrastructure
- CI pipeline (lint, test, build) and a deploy step

**Out of scope:**

- Feature flag management
- Real payment/billing integration
- Real customer data — seed with fake tenants/users

## Monorepo structure

```
admin-console/
├── apps/
│   ├── web/                 # React + TypeScript frontend
│   └── api/                 # Node.js + TypeScript backend
├── packages/
│   └── shared-types/        # Shared TS types/interfaces between web and api
├── infra/
│   └── terraform/           # Terraform modules and environment configs
├── .github/
│   └── workflows/           # CI/CD pipeline definitions
├── package.json              # Root workspace config (npm/pnpm workspaces or Turborepo)
└── README.md
```

Recommend npm workspaces or pnpm workspaces to start — Turborepo can be added later
if build orchestration becomes a pain point, but isn't required for a project this size.

## Data model (Neon Postgres)

Minimum viable schema:

- **tenants**: id, name, plan (enum: trial/pro/enterprise), status (enum: active/suspended), created_at
- **users**: id, tenant_id (FK), email, display_name, role (enum: admin/member/read_only), status (enum: active/deactivated), entra_object_id, created_at
- **audit_log**: id, actor_user_id (FK), tenant_id (FK, nullable for platform-level actions), action, target_type, target_id, metadata (jsonb), created_at

Use a migration tool (e.g. `node-pg-migrate` or `drizzle-orm` migrations) rather than
hand-rolled SQL scripts, so schema changes are tracked and repeatable.

## Backend API (apps/api)

Core endpoints to build first:

- `GET /api/tenants` — list tenants (paginated)
- `GET /api/tenants/:id` — tenant detail
- `PATCH /api/tenants/:id` — update plan/status
- `GET /api/tenants/:id/users` — list users in a tenant
- `PATCH /api/tenants/:id/users/:userId` — update role/status
- `GET /api/audit-log` — list audit entries, filterable by tenant/actor/action/date range
- `GET /api/me` — current authenticated admin's profile and permissions

Cross-cutting concerns to implement early, not bolted on later:

- Auth middleware validating the Entra ID token on every request
- RBAC middleware checking the caller's role before mutating endpoints
- A structured logger (e.g. `pino`) that writes JSON logs, shipped to Elasticsearch
- Centralized error handling that returns consistent error shapes

## Frontend (apps/web)

Three screens, matching the wireframes already discussed:

1. **Tenant list** — table with plan, user count, status, and a "suspend/reactivate" action
2. **Tenant detail / user list** — same table shape, scoped to one tenant, with role assignment
3. **Audit log** — filterable table of admin actions

Plus:

- Login screen backed by Entra ID (MSAL library for React — `@azure/msal-react`)
- A shared layout component (sidebar nav + top bar) reused across all three screens

## Auth flow (Entra ID)

1. Register an app in Entra ID (App registration) — this gives you a client ID/tenant ID
2. Frontend uses `@azure/msal-react` to redirect to Microsoft login, receives an ID token
3. Frontend attaches the access token to API requests (`Authorization: Bearer <token>`)
4. Backend validates the token against Entra ID's public keys (JWKS) and extracts the user's identity
5. Backend maps the Entra object ID to a row in the `users` table to resolve role/permissions

Note: this means "logging in" to the admin console requires the person to also exist as
a row in the `users` table — decide during scaffolding whether the first login
auto-provisions a user record or requires pre-seeding.

## Infrastructure (infra/terraform)

Suggested modules:

- `resource-group` — one resource group per environment (dev/prod)
- `container-apps-environment` — the shared Container Apps environment
- `container-app-web` — frontend container app
- `container-app-api` — backend container app
- `container-app-elasticsearch` — Elasticsearch container app, **internal-only ingress** (not exposed outside the Container Apps environment), no persistent volume, `discovery.type=single-node` and `xpack.security.enabled=false` set as environment variables, scale-to-zero enabled so it costs nothing between demos
- `container-app-kibana` — Kibana container app, **external ingress with no IP restriction** (open to the internet, for easy sharing with hiring managers), pointed at Elasticsearch's internal hostname via `ELASTICSEARCH_HOSTS`, scale-to-zero enabled. Since `xpack.security` stays disabled, keep the Elasticsearch/Kibana image versions current and treat the URL as effectively public — don't put anything sensitive in the seeded demo data
- `api-management` — APIM instance in front of the backend, with a policy routing to the api container app
- `key-vault` — stores Neon connection string, Entra ID client secret
- `log-analytics` — backing workspace for Container Apps diagnostics

Note: Neon Postgres is an external/managed service (not an Azure-native
resource) — Terraform can still manage it via the Neon Terraform provider, or
you can treat its connection string as a variable sourced from Key Vault if
provisioning the Neon project manually. Decide which approach you want before
scaffolding the `infra/` folder. Elasticsearch, since it now runs as a
Container App alongside the other two, uses the same Terraform Container Apps
module pattern as `container-app-web` and `container-app-api` — no separate
provider needed. Because the backend, frontend, and Elasticsearch all share
one Container Apps environment, they get internal DNS resolution for free
(the backend reaches Elasticsearch at its Container Apps internal hostname,
no VNet peering or public IP required).

## CI/CD (.github/workflows)

Minimum pipeline:

1. **On PR**: lint, typecheck, unit tests (RTL for web, standard test runner for api)
2. **On merge to main**: build both containers, push to Azure Container Registry, run Terraform plan
3. **Manual or auto-approve step**: Terraform apply, then deploy new container revisions
4. **Post-deploy**: run Playwright E2E smoke tests against the deployed environment

## Testing plan

- **Unit/component**: React Testing Library for the three main screens (tenant list, user list, audit log) — test rendering, filtering, and the suspend/reactivate action
- **E2E/synthetic**: Playwright covering login → view tenants → suspend a tenant → verify it appears suspended → check the audit log recorded it
- **API**: basic integration tests hitting the Node.js API against a test Postgres instance

## Suggested build order

1. Scaffold monorepo structure and shared TypeScript types
2. Backend: Postgres schema/migrations, core CRUD endpoints, structured logging to Elasticsearch
3. Backend: Entra ID auth middleware and RBAC
4. Frontend: three screens against the API (can start with mock auth, wire up MSAL last)
5. Frontend: MSAL/Entra ID login flow
6. Terraform: provision dev environment (resource group, Container Apps env, APIM, Key Vault)
7. CI/CD: lint/test/build pipeline, then deploy pipeline
8. Testing: RTL for the three screens, Playwright E2E smoke test
9. Kibana dashboard on top of the shipped logs

## Open decisions for Claude Code to flag if ambiguous

- `node-pg-migrate` vs `drizzle-orm` for migrations/ORM
- npm workspaces vs pnpm workspaces for the monorepo
- Whether Entra ID login auto-provisions a `users` row on first login or requires pre-seeding
- Whether Neon is provisioned via its Terraform provider or manually with the connection string pulled from Key Vault
