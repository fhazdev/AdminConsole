# syntax=docker/dockerfile:1

# Built from the repo root so the workspace root manifests and the
# shared-types package are both in context:
#   docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS base
WORKDIR /app
# Only the manifests, so a dependency install is cached until they change.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/

FROM base AS build
RUN npm ci --workspace @admin-console/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN npm run build --workspace @admin-console/shared-types \
 && npm run build --workspace @admin-console/api

FROM base AS prod-deps
RUN npm ci --omit=dev --workspace @admin-console/api --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# dumb-init reaps zombies and forwards SIGTERM, which the graceful shutdown
# handler in src/index.ts depends on during a Container Apps revision swap.
RUN apk add --no-cache dumb-init

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# Shipped so the image can also run the migration job in CI.
COPY apps/api/migrations ./apps/api/migrations

USER node
EXPOSE 8080

# Container Apps health probes hit these; see routes/health.ts.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/index.js"]
