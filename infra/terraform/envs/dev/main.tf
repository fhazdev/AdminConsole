locals {
  prefix = "${var.name_prefix}-${var.environment}"
  tags   = merge(var.tags, { environment = var.environment })

  # ACR and Key Vault names are globally unique and disallow dashes, so they
  # get a deterministic suffix rather than a random one that would churn.
  compact_prefix = replace(local.prefix, "-", "")
}

resource "random_string" "suffix" {
  length  = 5
  special = false
  upper   = false
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.prefix}"
  location = var.location
  tags     = local.tags
}

# --- Identity -----------------------------------------------------------
# One user-assigned identity shared by all four container apps: it pulls from
# ACR and reads Key Vault, so no credential is ever stored in a secret.
resource "azurerm_user_assigned_identity" "apps" {
  name                = "id-${local.prefix}-apps"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.tags
}

# --- Container registry -------------------------------------------------
resource "azurerm_container_registry" "main" {
  name                = "acr${local.compact_prefix}${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

# --- Key Vault ----------------------------------------------------------
resource "azurerm_key_vault" "main" {
  name                = "kv-${local.compact_prefix}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"
  # RBAC rather than access policies: one authorization model for the whole
  # subscription, and it works with the container apps' managed identity.
  rbac_authorization_enabled = true
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  tags                       = local.tags
}

# The operator running Terraform must be able to write the secrets below.
resource "azurerm_role_assignment" "kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "kv_apps_read" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  value        = var.neon_connection_string
  key_vault_id = azurerm_key_vault.main.id
  content_type = "Neon Postgres connection string"
  tags         = local.tags

  # The role assignment is eventually consistent; without this the first apply
  # usually fails with a 403 writing the secret.
  depends_on = [azurerm_role_assignment.kv_admin]
}

# --- Observability ------------------------------------------------------
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.prefix}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  tags                = local.tags
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.prefix}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = local.tags
}

# --- Elasticsearch ------------------------------------------------------
# Internal ingress only: reachable from the API and Kibana inside the
# environment, never from the internet. No volume, so data is ephemeral by
# design, and it scales to zero between demos.
module "elasticsearch" {
  source = "../../modules/container-app"

  name                         = "ca-${local.prefix}-elasticsearch"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  identity_id                  = azurerm_user_assigned_identity.apps.id
  image                        = var.elasticsearch_image
  target_port                  = 9200
  ingress                      = "internal"
  cpu                          = 1.0
  memory                       = "2Gi"
  min_replicas                 = 0
  max_replicas                 = 1
  tags                         = local.tags

  env = {
    "discovery.type"                    = "single-node"
    "xpack.security.enabled"            = "false"
    "xpack.security.enrollment.enabled" = "false"
    "bootstrap.memory_lock"             = "false"
    "ES_JAVA_OPTS"                      = "-Xms1g -Xmx1g"
  }
}

# Deliberately open to the internet so a dashboard link can be shared. Because
# xpack.security stays disabled, treat this URL as public: nothing sensitive
# may be seeded into the demo data, and the image versions must stay current.
module "kibana" {
  source = "../../modules/container-app"

  name                         = "ca-${local.prefix}-kibana"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  identity_id                  = azurerm_user_assigned_identity.apps.id
  image                        = var.kibana_image
  target_port                  = 5601
  ingress                      = "external"
  cpu                          = 1.0
  memory                       = "2Gi"
  min_replicas                 = 0
  max_replicas                 = 1
  tags                         = local.tags

  env = {
    ELASTICSEARCH_HOSTS    = module.elasticsearch.internal_url
    XPACK_SECURITY_ENABLED = "false"
  }
}

# --- API ----------------------------------------------------------------
module "api" {
  source = "../../modules/container-app"

  name                         = "ca-${local.prefix}-api"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  identity_id                  = azurerm_user_assigned_identity.apps.id
  registry_server              = azurerm_container_registry.main.login_server
  image                        = var.api_image
  target_port                  = 8080
  # Internal: the only public route to the API is through APIM.
  ingress        = "internal"
  min_replicas   = 0
  max_replicas   = 3
  liveness_path  = "/healthz"
  readiness_path = "/readyz"
  tags           = local.tags

  env = {
    NODE_ENV               = "production"
    PORT                   = "8080"
    LOG_LEVEL              = "info"
    DATABASE_SSL           = "true"
    AUTH_MODE              = "entra"
    ENTRA_TENANT_ID        = var.entra_tenant_id
    ENTRA_API_AUDIENCE     = var.entra_api_audience
    ELASTICSEARCH_URL      = module.elasticsearch.internal_url
    ELASTICSEARCH_INDEX    = "admin-console-logs"
    AUTO_PROVISION_ENABLED = "true"
    CORS_ORIGINS           = "https://${module.web.fqdn}"
  }

  secret_env = {
    DATABASE_URL = azurerm_key_vault_secret.database_url.versionless_id
  }

  depends_on = [azurerm_role_assignment.acr_pull, azurerm_role_assignment.kv_apps_read]
}

# --- Web ----------------------------------------------------------------
module "web" {
  source = "../../modules/container-app"

  name                         = "ca-${local.prefix}-web"
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  identity_id                  = azurerm_user_assigned_identity.apps.id
  registry_server              = azurerm_container_registry.main.login_server
  image                        = var.web_image
  target_port                  = 8080
  ingress                      = "external"
  min_replicas                 = 0
  max_replicas                 = 2
  liveness_path                = "/healthz"
  tags                         = local.tags

  env = {
    # nginx proxies /api here, so the browser only ever calls its own origin.
    API_ORIGIN = azurerm_api_management.main.gateway_url
  }

  depends_on = [azurerm_role_assignment.acr_pull]
}

# --- API Management -----------------------------------------------------
# Consumption SKU: provisions in minutes rather than hours and costs per call,
# which suits a demo that is idle most of the time.
resource "azurerm_api_management" "main" {
  name                = "apim-${local.prefix}-${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  publisher_name      = "Admin Console"
  publisher_email     = "noreply@example.com"
  sku_name            = "Consumption_0"
  tags                = local.tags
}

resource "azurerm_api_management_api" "admin_console" {
  name                = "admin-console-api"
  resource_group_name = azurerm_resource_group.main.name
  api_management_name = azurerm_api_management.main.name
  revision            = "1"
  display_name        = "Admin Console API"
  path                = "api"
  protocols           = ["https"]

  service_url = module.api.internal_url

  subscription_required = false
}

# APIM only forwards requests that match an operation, so the console's two
# verbs each get a catch-all. Adding a verb to the API means adding it here.
resource "azurerm_api_management_api_operation" "proxy" {
  for_each = toset(["GET", "PATCH", "OPTIONS"])

  operation_id        = "proxy-${lower(each.value)}"
  api_name            = azurerm_api_management_api.admin_console.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name
  display_name        = "Proxy ${each.value}"
  method              = each.value
  url_template        = "/*"
  description         = "Catch-all forward to the API container app."
}

# Gateway-level policy. Authentication stays in the API - APIM handles
# transport concerns: correlation IDs, rate limiting and CORS.
resource "azurerm_api_management_api_policy" "admin_console" {
  api_name            = azurerm_api_management_api.admin_console.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name

  xml_content = <<XML
<policies>
  <inbound>
    <base />
    <set-backend-service base-url="${module.api.internal_url}" />
    <!-- Give every request a correlation ID if the caller did not, so an APIM
         trace and an Elasticsearch log line can be tied together. -->
    <choose>
      <when condition="@(!context.Request.Headers.ContainsKey(&quot;X-Request-Id&quot;))">
        <set-header name="X-Request-Id" exists-action="override">
          <value>@(context.RequestId.ToString())</value>
        </set-header>
      </when>
    </choose>
    <rate-limit-by-key calls="300" renewal-period="60"
                       counter-key="@(context.Request.IpAddress)" />
  </inbound>
  <backend><base /></backend>
  <outbound>
    <base />
    <set-header name="X-Powered-By" exists-action="delete" />
  </outbound>
  <on-error><base /></on-error>
</policies>
XML

  depends_on = [azurerm_api_management_api_operation.proxy]
}
