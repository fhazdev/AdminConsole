terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

locals {
  # Container Apps secret names must be lowercase alphanumeric with dashes.
  secrets = {
    for name, uri in var.secret_env :
    lower(replace(name, "_", "-")) => uri
  }
}

resource "azurerm_container_app" "this" {
  name                         = var.name
  resource_group_name          = var.resource_group_name
  container_app_environment_id = var.container_app_environment_id
  # Single revision: a demo has no need for traffic splitting, and it keeps
  # "deploy" meaning "replace what is running".
  revision_mode = "Single"
  tags          = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  # Pulling from ACR with a managed identity avoids storing registry
  # credentials as secrets.
  dynamic "registry" {
    for_each = var.registry_server == "" ? [] : [var.registry_server]
    content {
      server   = registry.value
      identity = var.identity_id
    }
  }

  # Each secret is a Key Vault reference resolved by the same identity, so no
  # secret value is ever written into Terraform state.
  dynamic "secret" {
    for_each = local.secrets
    content {
      name                = secret.key
      key_vault_secret_id = secret.value
      identity            = var.identity_id
    }
  }

  dynamic "ingress" {
    for_each = var.ingress == "none" ? [] : [var.ingress]
    content {
      external_enabled = ingress.value == "external"
      target_port      = var.target_port
      transport        = "auto"

      traffic_weight {
        latest_revision = true
        percentage      = 100
      }
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = var.name
      image  = var.image
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name        = env.key
          secret_name = lower(replace(env.key, "_", "-"))
        }
      }

      dynamic "liveness_probe" {
        for_each = var.liveness_path == "" ? [] : [var.liveness_path]
        content {
          transport = "HTTP"
          port      = var.target_port
          path      = liveness_probe.value
        }
      }

      dynamic "readiness_probe" {
        for_each = var.readiness_path == "" ? [] : [var.readiness_path]
        content {
          transport = "HTTP"
          port      = var.target_port
          path      = readiness_probe.value
        }
      }
    }
  }

  lifecycle {
    # CI deploys new image tags out of band; Terraform owns the shape of the
    # app, not which build is currently running.
    ignore_changes = [template[0].container[0].image]
  }
}
