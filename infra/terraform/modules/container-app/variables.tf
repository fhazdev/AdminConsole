variable "name" {
  description = "Container app name."
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "container_app_environment_id" {
  type = string
}

variable "identity_id" {
  description = "User-assigned managed identity used for ACR pull and Key Vault access."
  type        = string
}

variable "image" {
  description = "Fully qualified image reference, e.g. myacr.azurecr.io/api:sha."
  type        = string
}

variable "registry_server" {
  description = "ACR login server. Empty for public images such as Elasticsearch."
  type        = string
  default     = ""
}

variable "cpu" {
  type    = number
  default = 0.5
}

variable "memory" {
  type    = string
  default = "1Gi"
}

variable "target_port" {
  type = number
}

variable "ingress" {
  description = "'external' is reachable from the internet, 'internal' only from inside the environment, 'none' disables ingress."
  type        = string
  default     = "internal"

  validation {
    condition     = contains(["external", "internal", "none"], var.ingress)
    error_message = "ingress must be one of: external, internal, none."
  }
}

variable "min_replicas" {
  description = "0 enables scale-to-zero, so an idle demo costs nothing."
  type        = number
  default     = 0
}

variable "max_replicas" {
  type    = number
  default = 2
}

variable "env" {
  description = "Plain (non-secret) environment variables."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Environment variables sourced from Key Vault: name => secret URI."
  type        = map(string)
  default     = {}
}

variable "liveness_path" {
  description = "HTTP liveness probe path. Empty disables the probe."
  type        = string
  default     = ""
}

variable "readiness_path" {
  description = "HTTP readiness probe path. Empty disables the probe."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
