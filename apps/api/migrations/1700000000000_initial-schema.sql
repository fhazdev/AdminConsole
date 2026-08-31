-- Up Migration

CREATE TYPE tenant_plan AS ENUM ('trial', 'pro', 'enterprise');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended');
CREATE TYPE user_role AS ENUM ('admin', 'member', 'read_only');
CREATE TYPE user_status AS ENUM ('active', 'deactivated');

CREATE TABLE tenants (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    plan        tenant_plan NOT NULL DEFAULT 'trial',
    status      tenant_status NOT NULL DEFAULT 'active',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tenants_name_key ON tenants (lower(name));
CREATE INDEX tenants_status_idx ON tenants (status);
CREATE INDEX tenants_plan_idx ON tenants (plan);

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Null means a platform operator: console staff not scoped to a customer
    -- tenant. Customer users always carry a tenant_id.
    tenant_id        uuid REFERENCES tenants (id) ON DELETE CASCADE,
    email            text NOT NULL,
    display_name     text NOT NULL,
    role             user_role NOT NULL DEFAULT 'read_only',
    status           user_status NOT NULL DEFAULT 'active',
    entra_object_id  text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_entra_object_id_key ON users (entra_object_id)
    WHERE entra_object_id IS NOT NULL;
CREATE INDEX users_tenant_id_idx ON users (tenant_id);
CREATE INDEX users_tenant_status_idx ON users (tenant_id, status);

CREATE TABLE audit_log (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ON DELETE SET NULL: an audit trail must outlive the actor's user row.
    actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
    tenant_id      uuid REFERENCES tenants (id) ON DELETE SET NULL,
    action         text NOT NULL,
    target_type    text NOT NULL,
    target_id      uuid NOT NULL,
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- The audit viewer is ordered newest-first and filtered by tenant, actor,
-- action and date range; these indexes cover those access paths.
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_tenant_created_idx ON audit_log (tenant_id, created_at DESC);
CREATE INDEX audit_log_actor_created_idx ON audit_log (actor_user_id, created_at DESC);
CREATE INDEX audit_log_action_created_idx ON audit_log (action, created_at DESC);

-- Down Migration

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tenants;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS tenant_status;
DROP TYPE IF EXISTS tenant_plan;
