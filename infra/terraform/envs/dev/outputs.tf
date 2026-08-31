output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "container_registry_login_server" {
  description = "Push target for CI: <server>/admin-console-api:<sha>."
  value       = azurerm_container_registry.main.login_server
}

output "web_url" {
  description = "The admin console itself."
  value       = "https://${module.web.fqdn}"
}

output "kibana_url" {
  description = "Public and unauthenticated by design - see the note in main.tf."
  value       = "https://${module.kibana.fqdn}"
}

output "apim_gateway_url" {
  description = "Public entry point to the API."
  value       = azurerm_api_management.main.gateway_url
}

output "api_internal_url" {
  description = "Reachable only from inside the Container Apps environment."
  value       = module.api.internal_url
}

output "key_vault_name" {
  value = azurerm_key_vault.main.name
}

output "apps_identity_client_id" {
  value = azurerm_user_assigned_identity.apps.client_id
}
