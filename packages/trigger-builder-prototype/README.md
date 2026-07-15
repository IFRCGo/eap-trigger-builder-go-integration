# Trigger Builder Prototype

Standalone, single-screen GO-aligned EAP Trigger Builder. Phase 1 adds a
country-aware geography workflow, a temporary access barrier for billable AI
calls, explicit AI export approval, and reproducible Cloud Run delivery.

## Architecture and data flow

The Vite application uses the local `@ifrc-go/ui` package. It reads the
structured country list from GO `/api/v2/country/`, stores the selected GO ID,
ISO/ISO3, centroid, and bounding box, and passes that country context to one
lazy-loaded Mapbox selector.

National geography is derived from the selected country. Admin-1/Admin-2,
Mapbox Search, and reverse-geocoded pins provide non-national selections. An
imported pilot label is marked unverified until a user confirms a returned map
result. Typed search text alone is never stored as geography, and a Mapbox
failure blocks confirmation rather than substituting a fallback country.

The browser always builds a deterministic draft. When an API URL is configured,
Generate/Regenerate call the standalone Django service and attach the temporary
prototype code from `sessionStorage`. Gemini output remains editable, but it can
be included in export only after **Approve AI version for export**. Editing or
regenerating it resets approval. Deterministic exports remain available.

## Local configuration

Copy `.env.example` to `.env.local` and set:

- `VITE_MAPBOX_TOKEN` - a Mapbox public token restricted to the local origins,
  with access to IFRC styles/tilesets and Mapbox Search.
- `VITE_API_BASE_URL` - standalone Django URL, for example
  `http://localhost:8000`.
- `VITE_GO_API_BASE_URL` - optional GO API override; defaults to
  `https://goadmin.ifrc.org/api/v2`.

Start and verify from this directory:

```powershell
corepack pnpm dev -- --host 127.0.0.1
corepack pnpm typecheck
corepack pnpm lint:js
corepack pnpm test
corepack pnpm build
```

For Docker, build from the workspace root and provide runtime values when the
container starts. The token is not baked into the JavaScript bundle:

```powershell
docker build -f go-web-app/packages/trigger-builder-prototype/nginx-serve/Dockerfile -t trigger-builder-frontend:local .
docker run --rm -p 3101:80 -e MAPBOX_TOKEN=pk.example -e API_BASE_URL=http://host.docker.internal:8000 -e GO_API_BASE_URL=https://goadmin.ifrc.org/api/v2 trigger-builder-frontend:local
```

When `MAPBOX_TOKEN` is empty or rejected, the application deliberately shows a
Mapbox-unavailable state and prevents non-national geography confirmation.

## Backend and temporary access code

The API lives at `go-api/trigger_builder`; the minimal Django 5.2 runtime is
`go-api/trigger_builder_standalone`. Configure:

- `DJANGO_SECRET_KEY` - required; startup fails without it.
- `PROTOTYPE_ACCESS_REQUIRED=true|false` - rollout switch.
- `PROTOTYPE_ACCESS_CODE` - required when the switch is true.
- `CORS_ALLOWED_ORIGINS` - comma-separated deployed frontend and documented
  localhost origins.
- `GCP_PROJECT_ID`, `GCP_LOCATION`, `GEMINI_MODEL_ID=gemini-3.5-flash`, and
  `GEMINI_PROMPT_VERSION=phase1-v1`.

Schema, example, and validation endpoints are public. Only Generate and
Regenerate require `X-Prototype-Access-Code`. The configured code stays on the
backend; the entered value stays in browser session storage and is cleared after
rejection or when the browser session ends.

Normal backend tests mock Gemini. Billable probes are explicit integration
scripts under `trigger_builder_standalone/scripts/integration`.

## Cloud Run deployment and rollback

Container dependencies and base images are pinned. Cloud Build requires an
immutable `_IMAGE_TAG` derived from the source Git SHA. Runtime config is
JSON-escaped at container startup; hashed assets are cached immutably while
`index.html` and `env-config.js` are `no-store`.

The versioned service manifests, required secrets/service accounts, test-first
build commands, verification checklist, and rollback commands are in
`deployment/phase1/README.md` at the workspace root. Never deploy `latest`.

## Known Phase 1 limitations

- The access code is a temporary barrier, not user authentication.
- Search/pin locations for gauges and basins are prototype reference points,
  not authoritative station records or watershed polygons.
- Mapbox verification depends on a supplied, deployed-origin-restricted public
  token and access to the IFRC-owned tilesets.
- Gemini wording is reviewer-approved, but automated deterministic
  fact-preservation validation is not implemented in Phase 1.

## Phase 2 / before production use

Before GO production integration, add automated fact-token preservation and
response validation, mandatory server validation before Gemini, structured
observability without narrative logging, GO authentication and record-level
permissions, versioned persistence, and a private Cloud Run AI service invoked
through the authenticated GO API.
