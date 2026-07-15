# syntax=docker/dockerfile:1-labs

FROM node:20.19.4-bookworm-slim@sha256:6db5e436948af8f0244488a1f658c2c8e55a3ae51ca2e1686ed042be8f25f70a AS dev

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /code/go-web-app

FROM dev AS nginx-build

# NOTE: The prototype build needs the repository-root implementation_inputs bundle.
COPY --parents ./go-web-app/package.json ./go-web-app/pnpm-lock.yaml ./go-web-app/pnpm-workspace.yaml ./go-web-app/**/package.json ./go-web-app/patches/ /code/

RUN corepack prepare --activate

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY ./go-web-app/packages/ui /code/go-web-app/packages/ui
COPY ./go-web-app/packages/trigger-builder-prototype /code/go-web-app/packages/trigger-builder-prototype
COPY ./implementation_inputs /code/implementation_inputs

RUN pnpm build:trigger-builder-prototype

FROM nginx:1.28.0-alpine3.21@sha256:30f1c0d78e0ad60901648be663a710bdadf19e4c10ac6782c235200619158284 AS nginx-serve

LABEL maintainer="IFRC"
LABEL org.opencontainers.image.source="https://github.com/IFRCGo/go-web-app/tree/develop/packages/trigger-builder-prototype"

COPY ./go-web-app/packages/trigger-builder-prototype/nginx-serve/nginx.conf.template /etc/nginx/templates/default.conf.template
# Startup script: writes /env-config.js from MAPBOX_TOKEN env var so the token
# can be injected at `docker run` time without rebuilding the image.
COPY ./go-web-app/packages/trigger-builder-prototype/nginx-serve/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
RUN apk add --no-cache jq \
    && chmod +x /docker-entrypoint.d/40-env-config.sh
COPY --from=nginx-build /code/go-web-app/packages/trigger-builder-prototype/dist /usr/share/nginx/html
