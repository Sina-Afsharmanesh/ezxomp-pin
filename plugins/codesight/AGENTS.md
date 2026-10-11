# AGENTS.md: codesight

## Purpose

CodeSight repository-context tools for OMP. Gives the agent fast repo orientation from generated `.codesight/` artifacts — wiki pages, routes, schema, env config, hot files, blast radius, import graph, symbol index, and change impact — before moving to symbol-level tools. Reads prebuilt artifacts first; refresh/init is explicit, never hidden.

## Ownership

- Package: `@ezxomp/codesight` (workspace `plugins/codesight`), version `0.2.2-ezxomp.0`
- Upstream: `pi-codesight` (anh-chu/pi-codesight), pinned in `UPSTREAM.json`; analyzer CLI is the exact `codesight` npm package dependency (1.19.0), bundled into tracked `codesight.bundle.js`
- Extension entry: `src/index.ts` (registers tools, commands, session notice, watcher controller)
- `codesight.bundle.js` is the only runtime analyzer path; no npx strategy, package-name resolver, or `require.resolve` fallback is used at runtime.

## Local Contracts

- **Artifacts**: reads `.codesight/wiki/index.md`, `.codesight/wiki/*.md`, `.codesight/routes.md`, `.codesight/config.md`, `.codesight/CODESIGHT.md`. Missing/stale artifacts → `codesight_refresh` or `/codesight-init`.
- **CLI runner**: `src/codesight.ts` — `runCodesight(args, cwd)`, `resolveCodesightInvocation()`, `renderCodesightCommand()`. All invocations execute the tracked bundled CLI directly via its executable shebang and mode; `resolveCodesightInvocation()` returns the bundle path as `executable` and passes `args` unchanged.
- **Watcher**: `src/watcher.ts` — `CodesightWatcherController` runs the bundled CodeSight CLI in watch mode per session root; `reconcile()`, `refresh()`, `init()`, `stop()`, `dispose()`, `footerStatusText()`.
- **Settings** (declared in `package.json` `omp.settings`): `watchFiles`, `regenerateWiki`, `showFooter`, `notifyOnWatchError` (booleans, default true) and `showStartupModal` (boolean, default false — the session-start overlay is opt-in).
- **Overlay**: `src/overlay.ts` — `openCodesightOverlay()` TUI (status, settings, refresh); `formatHeadlessStatus()` for non-TUI.
- **Tools** (`src/tools.ts`): `codesight_get_wiki_index`, `codesight_get_wiki_article`, `codesight_get_summary`, `codesight_get_routes`, `codesight_get_schema`, `codesight_get_blast_radius`, `codesight_get_env`, `codesight_get_hot_files`, `codesight_get_import_graph`, `codesight_get_symbol_index`, `codesight_get_change_impact`, `codesight_refresh`. All return `{ content, details }` envelope.
- **Commands**: `/codesight` (overlay), `/codesight-refresh`, `/codesight-init`, `/wiki [article]`, `/blast <file>`.
- **Staleness**: `src/stale.ts` — artifact health detection drives the startup modal and footer.

## Work Guidance

- Artifacts are generated output — never hand-edit `.codesight/`; regenerate via the CLI.
- Keep the runner/watcher split: `codesight.ts` owns CLI invocation, `watcher.ts` owns lifecycle; overlay stays a view over the controller.
- Depends on `@ezxomp/experiences` (workspace) for overlay hosting — keep that dependency intact.
- **Security**:
  - Bundle runtime never loads project `codesight.config.*` code by dynamic import.
  - `scripts/build-bundle.mjs` rewrites config loading to JSON parsing + static `export default {...}` extraction for `.ts/.js/.mjs`, plus package.json `codesight` field.
  - `readWikiArticle()` enforces leaf-safe IDs (`^[A-Za-z0-9_-]+$`) before file resolution.

## Verification

- `npm run check` — import smoke: `bun -e "import('./src/index.ts')"` (must resolve cleanly).
- Root suite: `bun test test/codesight-runner.test.ts test/smoke-codesight-tui.test.ts` — bundled runner and TUI smoke coverage.
- Root security behavior: `bun test test/codesight-runner.test.ts` covers unsafe config non-execution and wiki article traversal rejection.
- Repo-wide: root `npm run check` (tsc) and `bun test test/` cover this plugin's types and integration.

## Child DOX Index

No child AGENTS.md files needed.
