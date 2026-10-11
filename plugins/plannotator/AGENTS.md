# AGENTS.md: plannotator

## Purpose

Plannotator for OMP — interactive plan review with a browser UI. Adds file-based plan mode (idle → planning → executing), markdown plan files with checklists, human review/annotate/approve in the browser, code/PR review, and markdown annotation. State machine persists across session restarts via `appendEntry`.

## Ownership

- Package: `@ezxomp/plannotator` (workspace `plugins/plannotator`), version `0.25.1-ezxomp.2`
- Upstream: `backnotprop/plannotator` (apps/pi-extension), pinned commit in `UPSTREAM.json`
- Extension entry: `index.ts` (dev source, registers `plannotator(pi)`); the `omp.extensions` manifest points at the bundled `index.bundle.js`; server: `server.ts` + `server/`

## Local Contracts

- **Runtime artifacts are tracked, not gitignored.** `generated/*.ts`, `generated/ai/*.ts`, `plannotator.html`, `review-editor.html`, and `index.bundle.js` are committed so a remote marketplace clone installs a working extension without an upstream build step or `bun install`. The `index.bundle.js` is the OMP-loaded entry and inlines every runtime npm dependency (`parse5`, `turndown`, `@joplin/turndown-plugin-gfm`, `chokidar`, `diff`, `@pierre/diffs`, `@plannotator/webtui`); `@oh-my-pi/*` peers and the lazy AI SDKs (`@anthropic-ai/claude-agent-sdk`, `@opencode-ai/sdk`) stay external. The import script's plannotator entry excludes `.gitignore` to keep the upstream runtime-ignore rules from being re-imported. The import script's `stage plannotator --out <dir>` rebuilds the upstream `generated/` + HTML (see Work Guidance); every file in `generated/` carries a `// @generated — DO NOT EDIT` header.
- **`server/`**: HTTP server + review flows — `handlers.ts` (image/upload/draft/favicon/save-notes), `serverPlan.ts`, `serverReview.ts`, `serverAnnotate.ts`, `annotations.ts`, `pr.ts`, `vcs.ts`, `network.ts`, `ai-runtime.ts`, `agent-terminal.ts`, `file-browser-watch.ts`, `integrations.ts`, `ide.ts`, `project.ts`, `reference.ts`, `helpers.ts`, `open-in-apps.ts`, `agent-jobs.ts`, `external-annotations.ts`.
- **Config** (`config.ts` + `plannotator.json`): three layers — built-in `plannotator.json` → `~/.pi/agent/plannotator.json` → `<cwd>/.pi/plannotator.json`; later layers overwrite, `null`/empty clears. `executionMode` `automatic`|`external`; per-phase `model`, `thinking`, `activeTools` (replaces, not merges), `statusLabel`, `systemPrompt` with `${planFilePath}`, `${todoList}`, `${completedCount}`, `${totalCount}`, `${remainingCount}`, `${phase}` variables.
- **Events** (`plannotator-events.ts`): `PLANNOTATOR_REQUEST_CHANNEL` (`plan-review`, `review-status`, `code-review`, `annotate`, `annotate-last`, `archive`), `PLANNOTATOR_PLAN_APPROVED_CHANNEL` (external execution handoff), `plannotator:review-result`.
- **Commands**: `/plannotator` (toggle plan mode, `Ctrl+Alt+P`), `/plannotator-review` (VCS code review; `--git`/`--gitbutler` force provider), `/plannotator-annotate <file>`, `/plannotator-last`. Flag `--plan` starts in plan mode.
- **Todo providers** (`todo-providers/`): `pi-todos.ts` syncs native todo state (`PI_TODO_PATH`, `.pi/todos`).
- **Tool scope** (`tool-scope.ts`): planning restricts writes/edits to the plan file; `plannotator_submit_plan` always enabled during planning.
- **Env vars**: `PI_CODING_AGENT_DIR` (phase-tools runtime), `PI_TODO_PATH` (pi-todos), `BROWSER` (port-startup-compat test).

## Work Guidance

- Tests are colocated `*.test.ts` next to sources (e.g. `server/network.test.ts`, `config.test.ts`, `annotate-outcome.test.ts`, `phase-tools-runtime.test.ts`, `todo-providers/pi-todos.test.ts`) — run with `bun test`.
- Refresh runtime artifacts via the locked upstream import. Stage the
  upstream tarball + build into an explicit out directory:
  `bun run scripts/import-upstreams.ts stage plannotator --out /tmp/plannotator-stage`
  (`stage` does NOT copy into the plugin — it only writes to `--out`).
  Then manually copy the refreshed `generated/`, `plannotator.html`, and
  `review-editor.html` from `/tmp/plannotator-stage` into
  `plugins/plannotator/` (the upstream layout under `importRoot` is
  `apps/pi-extension`, so paths are at the stage root, not under a
  `plugins/plannotator/` prefix). Re-bundle the extension entry so
  `index.bundle.js` reflects the refreshed source:
  `bun --filter @ezxomp/plannotator run build:bundle` (or
  `cd plugins/plannotator && bun run build:bundle`). Commit the changed
  files in `plugins/plannotator/`. Do NOT run `vendor.sh` in this repo —
  it expects the upstream monorepo (`packages/core`, `packages/shared`,
  etc.) which is not checked out here. `vendor.sh` is only valid inside
  an upstream `backnotprop/plannotator` checkout.

## Verification

- `bun test` on the plugin's `*.test.ts` files (colocated suites: server,
  config, tool-scope, todo-providers, startup, stale-ctx, external-execution,
  import-specifiers, plannotator-browser, serverReview-pr-action);
  `bun run verify:bundle` rebuilds to a temp file and verifies SHA-256
  content equality with the tracked bundle.
- **Package notices.** `THIRD_PARTY_NOTICES.md` ships in the npm package
  and records bundled-runtime licenses; root `THIRD_PARTY_NOTICES.md`
  links here.

## Child DOX Index

No child AGENTS.md files needed.
