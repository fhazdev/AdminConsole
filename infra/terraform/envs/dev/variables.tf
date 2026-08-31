variable "subscription_id" {
  description = "Azure subscription to deploy into."
  type        = string
}

variable "environment" {
  description = "Environment name, used in resource names and tags."
  type        = string
  default     = "dev"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "name_prefix" {
  description = "Short prefix for resource names. Must be globally unique enough for ACR and Key Vault."
  type        = string
  default     = "admincon"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{2,11}$", var.name_prefix))
    error_message = "name_prefix must be 3-12 lowercase alphanumeric characters starting with a letter."
  }
}

variable "neon_connection_string" {
  description = <<-EOT
    Neon Postgres connection string. Neon is provisioned manually in the Neon
    console; Terraform only stores the value in Key Vault and references it
    from the API container app. Supply it via TF_VAR_neon_connection_string,
    never in a committed tfvars file.
  EOT
  type        = string
  sensitive   = true
}

variable "entra_tenant_id" {
  description = "Entra ID tenant the admin console authenticates against."
  type        = string
}

variable "entra_api_audience" {
  description = "Application ID URI of the API app registration, matched against the token audience."
  type        = string
}

variable "entra_web_client_id" {
  description = "Client ID of the SPA app registration, baked into the web bundle at build time."
  type        = string
}

variable "api_image" {
  description = "API image reference. Overwritten by CI on each deploy."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "web_image" {
  description = "Web image reference. Overwritten by CI on each deploy."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "elasticsearch_image" {
  type    = string
  default = "docker.elastic.co/elasticsearch/elasticsearch:8.17.1"
}

variable "kibana_image" {
  type    = string
  default = "docker.elastic.co/kibana/kibana:8.17.1"
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "tags" {
  type = map(string)
  default = {
    project    = "admin-console"
    managed_by = "terraform"
  }
}
