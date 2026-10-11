---
name: gsd-web
description: ezxomp GSD-Pi Web UI port — full Next.js 16 App Router dashboard served by a committed standalone Node host, driven through an omp --mode rpc bridge. Use when explaining, configuring, or debugging the /gsd-web command, gsd_web_* tools, bridge lifecycle (ready/no_models/unsupported_command), or the web/settings/hooks/mcp child-service layer.
---
# gsd-web (ezxomp)

OMP-native port of the GSD-Pi Web UI. One plugin, four jobs:

| Job | How it shows up |
|-----|-----------------|
| command | `/gsd-web` launches the standalone host detached and registers the project |
| tools | `gsd_web_*` tool surface for bridge status and workspace ops |
| bridge | `omp --mode rpc` child lifecycle: ready handshake, no_models typed phase, unsupported_command 400 mapping, graceful EOF teardown |
| web host | committed Next standalone tree (`plugins/gsd-web/web`), services-dist bundles, settings/hooks/notifications/mcp-management child services rooted at the selected project |

## How to use

- The shipping state is marketplace install; the standalone web tree is committed and gitignore-negated (`!plugins/gsd-web/server/`).
- Web-side type gate: `cd plugins/gsd-web/web && bunx tsc --noEmit` (excluded from the root tsconfig; it is a standalone Next host).
- Tests: `node --experimental-strip-types --test "lib/__tests__/*.test.ts"` from `plugins/gsd-web/web` (2 pre-existing @/server alias failures are documented, not regressions).

### DO

- DO preserve the typed no_models phase through startup failure paths (read via `livePhase()`; direct field reads are flow-narrowed).
- DO classify unsupported bridge commands client-side before dispatch so the route's 400 mapping stays reachable.
- DON'T treat upstream gsd-pi modules as editable — feature-frozen port; fix at the web/service boundary.
