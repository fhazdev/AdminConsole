# Kibana dashboard

`admin-console-dashboard.ndjson` is a Kibana saved-objects export containing the
`admin-console-logs*` data view and six Lens panels:

| Panel                       | Question it answers                                  |
| --------------------------- | ---------------------------------------------------- |
| API requests by status code | Is traffic flowing, and what share of it is failing? |
| API latency (p95, ms)       | Is the API slow for the users who feel it worst?     |
| Admin actions by type       | What are operators actually doing?                   |
| Permission denials          | Is a role misconfigured, or is someone probing?      |
| Errors by code              | Which failure mode dominates right now?              |
| Most active operators       | Who has been changing things?                        |

## Import

Locally, with the compose stack running:

```bash
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" \
  -F "file=@infra/kibana/admin-console-dashboard.ndjson"
```

Against the deployed Kibana, swap in the `kibana_url` Terraform output. The
dashboard then lives at `/app/dashboards#/view/ac-operations-dashboard`.

The Elasticsearch Container App has no persistent volume, so once it scales to
zero the index is gone and the panels stay empty until new traffic arrives. The
saved objects live in Kibana's own storage and survive that.

## Re-exporting after a change

Edit the dashboard in the Kibana UI, then export it back over this file:

```bash
curl -X POST "http://localhost:5601/api/saved_objects/_export" \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d '{"objects":[{"type":"dashboard","id":"ac-operations-dashboard"}],"includeReferencesDeep":true,"excludeExportDetails":true}' \
  -o infra/kibana/admin-console-dashboard.ndjson
```

## Fields the panels rely on

These come from the API's pino logger (`apps/api/src/logging/logger.ts`) and its
audit service. Changing or removing one breaks the matching panel:

- `time`, `level`, `levelLabel`, `msg` — every log line
- `requestId`, `userId`, `role` — request correlation, added by the mixin
- `req.method`, `req.url`, `res.statusCode`, `responseTime` — pino-http
- `event: "audit"`, `action`, `actorEmail`, `tenantId`, `targetType` — audit events
- `permission`, `code` — RBAC denials and the centralized error handler
