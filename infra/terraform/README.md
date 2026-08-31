# Infrastructure

Terraform for the Azure side of the admin console.

```
modules/container-app/   One reusable module, used four times
envs/dev/                The dev environment
```

The plan sketched a separate module per container app. One parameterised module
used four times says the same thing with a quarter of the code, and it is the
reason web, api, elasticsearch and kibana cannot drift apart in how they handle
identity, secrets, probes and scaling.

## What gets created

| Resource                | Notes                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| Resource group          | One per environment                                               |
| User-assigned identity  | Shared by all four apps: pulls from ACR, reads Key Vault          |
| Container registry      | Basic tier, admin user disabled                                   |
| Key Vault               | RBAC authorization; holds the Neon connection string              |
| Log Analytics workspace | Backs Container Apps diagnostics                                  |
| Container Apps env      | Gives all four apps internal DNS for free                         |
| `ca-*-api`              | **Internal** ingress; reachable only through APIM                 |
| `ca-*-web`              | External ingress; nginx serves the SPA and proxies `/api` to APIM |
| `ca-*-elasticsearch`    | **Internal** ingress, no volume, `xpack.security` off             |
| `ca-*-kibana`           | External ingress, no IP restriction — see the warning below       |
| API Management          | Consumption tier, catch-all route to the API                      |

Everything runs with `min_replicas = 0`, so an idle environment costs
essentially nothing between demos.

> **Kibana is deliberately public and unauthenticated.** That is the trade this
> project makes so a dashboard link can be shared without provisioning
> accounts. Keep the Elastic image versions current, and never seed anything
> into the demo data that you would not publish.

## Neon

Neon is **not** provisioned by Terraform. Create the project in the Neon console,
then pass its connection string in as a variable:

```bash
export TF_VAR_neon_connection_string='postgres://user:pass@host/db?sslmode=require'
```

Terraform writes it to Key Vault as `database-url`, and the API container app
references that secret through the managed identity. The value never lands in
Terraform state as a container app setting, and never enters an image.

## First run

1. Create the state storage account once, by hand or with a bootstrap script,
   then copy `backend.hcl.example` to `backend.hcl` and fill it in.
2. Register two Entra ID applications: one for the API (its Application ID URI
   becomes `entra_api_audience`) and one for the SPA (`entra_web_client_id`,
   with a redirect URI of the web app's URL and delegated access to the API).
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill it in. Secrets
   do **not** go in this file.

```bash
cd envs/dev
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

The first apply is a chicken-and-egg: the SPA's redirect URI needs the web app's
URL, which does not exist until after the apply. Apply once, read the `web_url`
output, then add it as a redirect URI on the SPA app registration.

## Images

`api_image` and `web_image` default to a Microsoft quickstart image so the first
apply succeeds before CI has ever pushed anything. The container-app module sets
`ignore_changes = [image]`: CI owns which build is running, Terraform owns the
shape of the app. Deploys are an explicit `az containerapp update` in
`.github/workflows/deploy.yml`.

## Outputs

| Output                            | Use                    |
| --------------------------------- | ---------------------- |
| `web_url`                         | The console itself     |
| `kibana_url`                      | The dashboard          |
| `apim_gateway_url`                | Public API entry point |
| `container_registry_login_server` | CI push target         |
| `resource_group_name`             | CI deploy target       |

## Validating without credentials

```bash
terraform fmt -check -recursive
cd envs/dev && terraform init -backend=false && terraform validate
```

That is exactly what the `terraform` job in CI runs.
