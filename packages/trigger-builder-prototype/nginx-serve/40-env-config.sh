#!/bin/sh
set -eu

# JSON-safe runtime configuration. MAPBOX_TOKEN is a public, origin-restricted
# browser token; secrets such as the prototype access code never enter this file.
runtime_config="$(jq -cn \
    --arg mapboxToken "${MAPBOX_TOKEN:-}" \
    --arg apiBaseUrl "${API_BASE_URL:-}" \
    --arg goApiBaseUrl "${GO_API_BASE_URL:-https://goadmin.ifrc.org/api/v2}" \
    '{mapboxToken: $mapboxToken, apiBaseUrl: $apiBaseUrl, goApiBaseUrl: $goApiBaseUrl}')"

printf '%s\n' \
    "window.__runtimeConfig = ${runtime_config};" \
    'window.__mapboxToken = window.__runtimeConfig.mapboxToken;' \
    'window.__apiBaseUrl = window.__runtimeConfig.apiBaseUrl;' \
    'window.__goApiBaseUrl = window.__runtimeConfig.goApiBaseUrl;' \
    > /usr/share/nginx/html/env-config.js
