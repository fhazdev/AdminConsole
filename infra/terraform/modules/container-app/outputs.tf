output "id" {
  value = azurerm_container_app.this.id
}

output "name" {
  value = azurerm_container_app.this.name
}

output "fqdn" {
  description = "Public FQDN for external ingress, internal FQDN otherwise. Null when ingress is disabled."
  value       = try(azurerm_container_app.this.ingress[0].fqdn, null)
}

output "internal_url" {
  description = "How other apps in the same environment reach this one."
  value       = try("http://${azurerm_container_app.this.ingress[0].fqdn}", null)
}
