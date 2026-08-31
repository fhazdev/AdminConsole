# syntax=docker/dockerfile:1

# Built from the repo root:
#   docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @admin-console/web --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web

# Vite inlines VITE_* values at build time, so the auth mode and Entra IDs are
# baked into the bundle. A production image must be built with AUTH_MODE=entra.
ARG VITE_AUTH_MODE=entra
ARG VITE_ENTRA_TENANT_ID=""
ARG VITE_ENTRA_CLIENT_ID=""
ARG VITE_ENTRA_API_SCOPE=""
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_ENTRA_TENANT_ID=$VITE_ENTRA_TENANT_ID \
    VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID \
    VITE_ENTRA_API_SCOPE=$VITE_ENTRA_API_SCOPE

RUN npm run build --workspace @admin-console/shared-types \
 && npm run build --workspace @admin-console/web

FROM nginx:1.27-alpine AS runtime
# API_ORIGIN is substituted into the template at container start, so one image
# works against dev and prod APIM instances.
ENV API_ORIGIN=http://localhost:8080
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
