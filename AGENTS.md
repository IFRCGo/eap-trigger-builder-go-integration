# EAP Trigger Builder GO integration guide

## Sources of truth

Use these sources in order:

1. `../implementation_inputs/planning/EAP_TRIGGER_BUILDER_GO_INTEGRATION_PLAN.md`
2. The supplied Trigger Model wireframe
3. Existing main-app patterns in `app/src/`
4. The preserved prototype in `packages/trigger-builder-prototype/`
5. The existing backend in `../go-api/trigger_builder/`

The approved integration plan overrides older prototype plans where they differ.

## Repository map

- `app/`: main GO React application and the target for the new public page.
- `packages/ui/`: shared GO UI components and design tokens.
- `packages/trigger-builder-prototype/`: preserved standalone frontend; use it as behavior reference only.
- `../go-api/trigger_builder/`: existing schema, examples, validation, Generate, and Regenerate API.
- `../go-api/trigger_builder_standalone/`: standalone backend runtime and deployment files.

The target is a public `eapTriggerBuilder` route at `/eap-trigger-builder`, rendered by
`app/src/views/EapTriggerBuilder/` under the existing `rootLayout`. Use
`visibility: 'anything'` and no route-specific authentication wrapper. The root layout
provides the real GO navigation and footer.

## Protected areas and scope

- Do not change the behavior of `packages/trigger-builder-prototype/`.
- Do not change `app/src/views/EapFullForm/` or its Trigger Model section.
- Do not add GO authentication, database persistence, draft, or share endpoints.
- Keep the new page activation-only: no complexity, pre-activation, stop, title-preview,
  or old AI review workspace.
- Keep structured form data authoritative. The Trigger statement is generated through AI,
  remains editable, and is included in browser save/share data.
- Never store or share the prototype access code.

## Runtime configuration

- `APP_API_ENDPOINT`: existing GO API; keep unchanged.
- `APP_TRIGGER_BUILDER_API_ENDPOINT`: planned standalone Trigger Builder API base URL.
- `APP_MAPBOX_ACCESS_TOKEN`: existing public Mapbox browser token.
- `APP_TINY_API_KEY`: existing TinyMCE key; unrelated to Trigger Builder unless a shared
  rich-text component is introduced.

Add `APP_TRIGGER_BUILDER_API_ENDPOINT` through `app/env.ts`, `app/src/config.ts`, Docker,
Helm, and `nginx-serve/apply-config.sh` using the current runtime substitution pattern.
Generate sends `X-Prototype-Access-Code` from `sessionStorage` only. The preserved
standalone prototype may still use Regenerate; the new GO page does not.

## Primary commands

Run from this repository root with pnpm through Corepack:

```powershell
corepack pnpm lint:unused
corepack pnpm -F go-web-app generate:type
corepack pnpm -F go-web-app typecheck
corepack pnpm -F go-web-app lint:js
corepack pnpm -F go-web-app lint:css
corepack pnpm -F go-web-app test
corepack pnpm -F go-web-app build
corepack pnpm -F @ifrc-go/trigger-builder-prototype test
corepack pnpm -F @ifrc-go/trigger-builder-prototype build
docker compose up --build -d
```

Do not make live Gemini calls in normal automated tests.

After every implementation stage, rebuild all three Docker services and use
Playwright to inspect the integrated route at `http://127.0.0.1:3000/eap-trigger-builder`,
the backend at `http://127.0.0.1:8000`, and the unchanged prototype at
`http://127.0.0.1:3101`. Do not deploy `trigger-builder-go-frontend` to Google
Cloud until every planned stage and the local Docker acceptance gate are complete.

## Graphify workflow

The generated local graph lives in `.graphify/`. Before broad codebase scans, use:

```powershell
graphify summary --graph .graphify/graph.json
graphify query "<question>"
graphify path "<source>" "<target>"
```

After major route, view, or API-client changes, run `graphify update --all .`, then
`graphify review-delta` and `graphify portable-check .graphify`. The entire `.graphify/`
directory is generated local state and must not be committed.

## Git delivery rule

Never push to `IFRCGo/go-web-app`. Its `origin` push URL is intentionally disabled.
Commit and push integration work only to the `integration` remote on the current feature
branch and keep draft PR #5 targeted at `develop`.
