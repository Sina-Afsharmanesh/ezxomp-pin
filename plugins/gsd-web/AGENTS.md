# AGENTS.md — gsd-web

## Purpose
OMP-native port of the GSD-Pi Web UI: the full Next.js 16 App Router dashboard plus its server-side service layer, shipped as a committed standalone Node server tree and spawned detached by the plugin launcher.

## Ownership
- Package: `@ezxomp/gsd-web` (port of `open-gsd/gsd-pi` web UI, pinned in `UPSTREAM.json`)
- Entry: `extensions/index.ts` — `pi.setLabel("GSD Web")`, `/gsd-web` command, three `gsd_web_*` tools
- `web/` — Next app source (feature-frozen port); `web/server/` — colocated service layer
- `web/.next/standalone` — produced runtime (gitignored; built on first start by the launcher, or manually via `cd web && npm run build`)
- `scripts/` — build + stage pipeline
- `host-launcher.ts` — spawns `web/.next/standalone` detached with `GSD_WEB_*` env; tailnet-first bind with `--localhost` override; builds the standalone on first start if absent

## Local Contracts
- Settings (declared in `package.json` `omp.settings`): `host` (enum, default 127.0.0.1), `port` (number, 0 = random free port), `noAuth`, `allowUnauthenticatedLAN`, `daemonMode`, `openBrowser` (booleans)
- Freeform settings (`allowedOrigins`, `nodeBinary`, `ompBinary`, `devRoot`) live in PluginManager-persisted settings only
- State root: `$OMP_HOME|~/.omp/gsd-web` (`instances.json`, `logs/`, `preferences.json`)
- Auth: 64-hex bearer token via URL fragment; proxy gate + `?_token=` fallback (upstream semantics kept)
- Platforms: Linux + macOS only; win32 fails with a clear message
- First-start bootstrap: a marketplace install ships `web/` source only (no install-time build hook per the authoring contract); `launchWebServer` materializes `web/node_modules` (bun install, npm install fallback — no package-lock committed) and the standalone build (`npm run build`, which stages `.next/static` into the standalone tree) on the first start, then caches it.
- OMP launch project: `GSD_WEB_PROJECT_CWD` is the first active project when supplied. Project selection remains only for launches without it or explicit switching through the Projects panel; onboarding never repeats project selection.
- `Type` imports from standalone `typebox` (never `@oh-my-pi/omptype/typebox`); `TSchema` from `@oh-my-pi/pi-ai`
- Command: `/gsd-web` with subcommands `start`, `stop`, `status`, `open`, `url`, `logs`, `set`, `unset`, and `--localhost` override
- Tools: `gsd_web_start`, `gsd_web_stop`, `gsd_web_status` — typebox schemas; `start` requires exec approval, `status` requires read approval
- Server runtime: the standalone server runs under **Node** (`nodeBinary` setting → `node` on PATH → host runtime fallback with warning). node-pty's native module spawns children that die instantly under Bun — never let the server run under bun or the terminal panel 404s.
- Instances registry: `~/.omp/gsd-web/instances.json`
- Tailnet-first bind with `--localhost` override

## Work Guidance
- Shared repo registration files (`.omp-plugin/marketplace.json`, `test/manifest.test.ts`, `test/smoke-plugins.test.ts`, root `AGENTS.md`) are NOT edited directly during parallel waves — intended hunks live in `REGISTRATION.patch` for the serialized integration wave.

## Verification
- Plugin unit: `bun test plugins/gsd-web/tests`; web suites: `cd plugins/gsd-web/web && npm test` (node --test). Repo gate is `just verify`.

## Child DOX Index
No child AGENTS.md files needed.
