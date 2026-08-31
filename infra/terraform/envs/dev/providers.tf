terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state. Create the storage account once by hand (or with a bootstrap
  # script), then `terraform init -backend-config=backend.hcl`.
  backend "azurerm" {}
}

provider "azurerm" {
  features {
    key_vault {
      # Soft-delete recovery is what you want in production; for a demo that is
      # torn down and rebuilt, purge protection just blocks the next apply.
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
  }
  subscription_id = var.subscription_id
}

data "azurerm_client_config" "current" {}
