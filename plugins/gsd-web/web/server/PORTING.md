# PORTING.md — modules W3 must provide

Status after W2 (app import + import-surface rewiring + `bun install`).

The Next app source under `web/` now imports its server-side service layer via
the `@/server/*` path alias (tsconfig `paths: { "@/*": ["./*"] }`, so
`@/server/x.ts` resolves to `web/server/x.ts`). None of those files exist yet;
W3 populates `web/server/` from `/tmp/gsd-pi/src/web/*.ts` (colocation map
below). Until then `bunx tsc --noEmit` inside `web/` reports exactly the
missing-module errors enumerated here (plus errors that are downstream of
those unresolved imports — the fix for every one of them is the W3 file, not a
web/ change).

## 1. Service modules W3 must port (source: `/tmp/gsd-pi/src/web/`)

Every `@/server/*.ts` import error below maps to one upstream file. Copy the
file into `web/server/<name>.ts`; no import-site changes are needed (the
rewiring in W2 already points at these paths).

| Missing import site (`@/server/…`) | Upstream source (`src/web/…`) | Notes |
|---|---|---|
| `@/server/app-paths.ts` | `src/app-paths.ts` (repo root `src/`, not `src/web/`) | Path-base rewrite to `GSD_WEB_STATE_DIR` happens in W7 |
| `@/server/bridge/bridge-service.ts` | `src/web/bridge-service.ts` | Lands in `web/server/bridge/` (W4 owns the transport swap) |
| `@/server/captures-service.ts` | `src/web/captures-service.ts` | |
| `@/server/cleanup-service.ts` | `src/web/cleanup-service.ts` | |
| `@/server/doctor-service.ts` | `src/web/doctor-service.ts` | |
| `@/server/export-service.ts` | `src/web/export-service.ts` | |
| `@/server/forensics-service.ts` | `src/web/forensics-service.ts` | |
| `@/server/git-summary-service.ts` | `src/web/git-summary-service.ts` | |
| `@/server/history-service.ts` | `src/web/history-service.ts` | |
| `@/server/hooks-service.ts` | `src/web/hooks-service.ts` | |
| `@/server/inspect-service.ts` | `src/web/inspect-service.ts` | |
| `@/server/knowledge-service.ts` | `src/web/knowledge-service.ts` | |
| `@/server/mcp-management-service.ts` | `src/web/mcp-management-service.ts` | |
| `@/server/notifications-service.ts` | `src/web/notifications-service.ts` | |
| `@/server/onboarding-service.ts` | `src/web/onboarding-service.ts` | |
| `@/server/project-discovery-service.ts` | `src/web/project-discovery-service.ts` | |
| `@/server/recovery-diagnostics-service.ts` | `src/web/recovery-diagnostics-service.ts` | |
| `@/server/settings-service.ts` | `src/web/settings-service.ts` | |
| `@/server/skill-health-service.ts` | `src/web/skill-health-service.ts` | |
| `@/server/undo-service.ts` | `src/web/undo-service.ts` | |
| `@/server/update-service.ts` | `src/web/update-service.ts` | D6 behavior applies on port |
| `@/server/visualizer-service.ts` | `src/web/visualizer-service.ts` | |
| `@/server/shared/workspace-types.ts` | `src/shared/workspace-types.ts` (repo root `src/shared/`) | Vendored shared types |

Importers (verification aid): every `web/app/api/**/route.ts` listed by
`grep -rl '@/server/' web/app web/lib` — 40+ route files, plus `web/lib/*`
client stores listed in §2.

## 2. Vendored GSD core/contract surface W3 must vendor

Imported from already-copied web client code; W3 vendors these under
`web/server/vendor-gsd-core/` (pinned to UPSTREAM sha
`8e0a639aedc7e94ec67055cecfcb83aaa1283d3a`) and rewrites these four files'
imports to the vendored relative paths:

| Specifier | Upstream source | Imported by |
|---|---|---|
| `@gsd/agent-core/contextual-tips.js` | `packages/gsd-agent-core/src/contextual-tips.ts` | `lib/gsd-workspace-store.tsx` |
| `@gsd/agent-core/extension-ui-snapshot.js` | `packages/gsd-agent-core/src/extension-ui-snapshot.ts` | `lib/extension-ui-snapshot.ts`, `lib/transcript-store.ts` |
| `@gsd/agent-core/transcript-store.js` | `packages/gsd-agent-core/src/transcript-store.ts` | `lib/transcript-store.ts` |
| `@gsd/pi-coding-agent/core/slash-commands.js` | `packages/pi-coding-agent/src/core/slash-commands.ts` | `lib/browser-slash-command-dispatch.ts` |
| `@opengsd/contracts` (type-only: `RpcExtensionUIRequest`) | `packages/contracts/src/` (D8 ownership pending; vendor from gsd-pi clone) | `lib/gsd-workspace-store.tsx` |

Plus, transitively, whatever `web/server/**` (W3's ported service layer)
imports from `@gsd/agent-core` / `@opengsd/contracts` — derive that list from
the import graph of `web/server/**` after the copy, per plan W3.

## 3. Runtime deps added at the web-package level

- `yaml` — added to `web/package.json` (upstream got it via workspace hoisting;
  `onboarding-service`/`experimental` readers parse YAML preferences).
- `koffi` — retained as `serverExternalPackages` candidate pending W3's
  vendored-core import graph (upstream listed it; drop if unused after W3).

## 4. Not-a-W3-item reminders

- `lib/pty-manager.ts` already imports `@/server/bridge/omp-entry.ts` — W4
  provides that file in this unit (present in tree).
- `@gsd/native` webpack externals were kept verbatim in `next.config.mjs` so
  the upstream next-config contract test still passes; W3 decides whether the
  vendored core actually needs it.
