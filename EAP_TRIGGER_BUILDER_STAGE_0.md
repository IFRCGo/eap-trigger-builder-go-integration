# EAP Trigger Builder Stage 0 baseline

Completed: 15 July 2026

## Recovery and branch state

- Original branch: `agent/trigger-builder-prototype-v1`
- Original commit: `ab5c4d195fbf077d6164c49ad330606374a13402`
- Upstream source: `https://github.com/IFRCGo/go-web-app.git`
- Personal archive: `https://github.com/arunissun/go-web-app.git`
- Safety branch: `safety/pre-go-integration-20260715`
- Safety commit: `5274fb459ef56dcb3df97522a3e277f68868a433`
- Integration repository: `https://github.com/IFRCGo/eap-trigger-builder-go-integration.git`

The safety commit preserves the three semantic working-tree changes present
before the rebase. Three other files reported Windows line-ending changes but
had no content diff.

## Rebased baseline

- Upstream `develop`: `986d42fa976e137593d352ba427fb9b0da30137c`
- Feature branch: `agent/eap-trigger-builder-go-integration`
- Standalone prototype replay: `21c625f566738528bbf637404e06d9fd3a35d24d`
- Preserved adjustments replay: `22ba3410311594341ca5e573d5c0004e0dd8047e`
- The pnpm 10.6.1 lockfile was regenerated and produced no content change.

## Baseline checks

- Main app typecheck: passed using generated types from the pinned schema submodules.
- Main app JavaScript lint: passed.
- Main app production build: passed with non-secret process-only validation settings.
- Prototype lint: passed.
- Prototype tests: 143 passed across 6 test files.
- Prototype typecheck and production build: passed.

Windows caveats to recheck in Linux/CI:

- CSS lint stops in existing tooling on a duplicated drive path such as
  `C:\C:\...\app\src\index.css`.
- Translation lint exits successfully but reports zero discovered files when
  invoked from this Windows checkout.
- The machine uses Node 24 while the latest upstream baseline requests Node 22.

No new GO route or integration feature code was added during Stage 0.
