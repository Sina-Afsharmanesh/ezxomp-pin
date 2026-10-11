# ezxomp

## Purpose

ezxomp is a TypeScript monorepo of OMP (Oh My Pi) plugins. Each plugin under `plugins/` extends the agent harness with domain-specific capabilities: code navigation, experiences, workflows, skills, planning, and more.

## Ownership

This project is maintained by the ezxomp team. Each plugin under `plugins/` owns its own subtree and may have a child `AGENTS.md` with plugin-specific contracts.

## Local Contracts

**Stack:** raw-http | none | typescript
**Monorepo:** @ezxomp/augment, @ezxomp/code-nav, @ezxomp/codesight, @ezxomp/experiences, @ezxomp/extensible-workflows, @ezxomp/agent-learning, @ezxomp/plannotator, @ezxomp/compact-eng, @ezxomp/better-custom, @ezxomp/pstack-suite, @ezxomp/backlog

67 routes | 0 models | 57 env vars | 881 import links

**API areas:** /api/ai, /uploads/, /api/plan, /api/share-html, /api/config, /api/image, /api/upload, /api/open-in, /api/draft, /api/doc

**High-impact files** (change carefully):
- plugins/experiences/extensions/agent-experience/src/storage/private-root.ts (imported by 35 files)
- plugins/experiences/extensions/agent-experience/src/storage/checksum.ts (imported by 28 files)
- plugins/experiences/extensions/agent-experience/src/storage/sqlite.ts (imported by 24 files)
- plugins/experiences/extensions/agent-experience/src/storage/redaction.ts (imported by 18 files)
- plugins/code-nav/src/types.ts (imported by 17 files)

**Required env vars:** AX_BUILD_OUTFILE, AX_SELECTOR_MODE, AX_SELECTOR_MODEL_SOURCE_ROOT, AX_STATE_ROOT, BROWSER, C, CHOKIDAR_INTERVAL, CHOKIDAR_USEPOLLING, CLAUDE_CONFIG_DIR, CODESIGHT_NATIVE_AST, CODESIGHT_PLUGIN_DIR, CODEX_HOME, JEFF_SECURITY_ENGINE_FIXTURES, JINA_API_KEY, PI_CODING_AGENT_DIR, PI_TODO_PATH, PLANNOTATOR_AGENT_TERMINAL_REMOTE, PLANNOTATOR_AI, PLANNOTATOR_ANNOTATE_HISTORY, PLANNOTATOR_BROWSER, PLANNOTATOR_CURSOR_SANDBOX, PLANNOTATOR_DATA_DIR, PLANNOTATOR_DEBUG, PLANNOTATOR_GLIMPSE, PLANNOTATOR_GUIDE_HISTORY, PLANNOTATOR_JINA, PLANNOTATOR_PASTE_URL, PLANNOTATOR_PORT, PLANNOTATOR_REMOTE, PLANNOTATOR_SEM_PATH, PLANNOTATOR_SHARE, PLANNOTATOR_SHARE_URL, PLANNOTATOR_TODO_PROVIDER, SSH_CONNECTION, VSCODE_TEXTMATE_DEBUG, XDG_CACHE_HOME, XDG_CONFIG_HOME

### Agent Instructions

This project uses codesight for structured AI context. Follow these steps before implementing:
1. Read `.codesight/wiki/index.md` for project orientation (~200 tokens)
2. Read `.codesight/wiki/overview.md` for architecture overview (~500 tokens)
3. Read the relevant domain article, then open the source files listed in it
4. Read `.codesight/CODESIGHT.md` for the full context map

**Do not explore the file tree blindly.** The codesight context map already contains:
routes, schema, components, libraries, config, middleware, and dependency graph.

**Before modifying any file:** check `.codesight/graph.md` for blast radius.
Files with high import counts affect many downstream modules — change carefully.

Routes marked `[inferred]` were detected via regex and may have lower precision.
If any source file shows ⚠ in a wiki article, re-run `npx codesight --wiki` before proceeding.

### DOX Framework

#### Core Contract

- `AGENTS.md` files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable `AGENTS.md` plus every parent `AGENTS.md` above it

#### Read Before Editing

1. Read the root `AGENTS.md`
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every `AGENTS.md` found along each route
5. If a parent `AGENTS.md` lists a child `AGENTS.md` whose scope contains the path, read that child and continue from there
6. Use the nearest `AGENTS.md` as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

#### Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning `AGENTS.md` when a change affects:
- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- `AGENTS.md` creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

#### Hierarchy

- Root `AGENTS.md` is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child `AGENTS.md` files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

#### Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history

## Work Guidance

- Follow codesight wiki for architecture understanding before modifying code
- Check blast radius in `.codesight/graph.md` before changing high-import files
- **Parallel agent work: one Git worktree per task on branch `task/<slug>`, branch plus immutable commit OID as deliverable, coordinator integrates locally to `main` and pushes `origin/main` only.** Workers never push or mutate `main`. Full protocol (single source of truth): [`docs/parallel-agents.md`](docs/parallel-agents.md).
- **OMP plugin install/update:** the shipping state is **marketplace install**; `omp plugin link` is a development test vehicle only (all 17 plugins are marketplace-registered; a non-marketplace plugin would be the only link-local exception). Two-phase protocol with mandatory fresh-OMP-agent self-check per phase: [`docs/omp-marketplace-update.md`](docs/omp-marketplace-update.md).
- **Plugin e2e testing:** validate any plugin change end-to-end with the project-local skill [`.omp/skills/ezxomp-plugin-e2e-test`](.omp/skills/ezxomp-plugin-e2e-test/SKILL.md) — `just verify`, a fresh direct-source isolation smoke (`omp --no-extensions -e <absolute entrypoint>`), local-link install + fresh-agent self-check, commit + push, then marketplace install + fresh-agent re-check (the installed-layout phases remain the two-phase protocol from [`docs/omp-marketplace-update.md`](docs/omp-marketplace-update.md)). The skill documents the exact Herdr pane/agent flow, unique completion sentinel, OMP/Herdr lifecycle-classifier drift, disposable-cwd cleanup, and non-Herdr terminal fallback. HERDR is optional: only host fresh agents there when the coordinator is itself inside a HERDR pane/workspace.
**Use `just verify` as the pre-merge gate — all checks must pass**
- Run `prek install` after cloning to enable pre-commit hooks
- **Quick setup for testing:** `just setup` (interactive: clean/backup config choice, then local-link vs marketplace install) or the non-interactive recipes `just setup-local` / `just setup-market` / `just setup-clean`. All driven by `scripts/setup-omp.sh`; the marketplace install is the shipping state, the local link is for testing unpushed working-tree changes.
- Tool-teaching skills ship with the plugins: `evo-mode` (omp-evo-mode).
- **Every meaningful change must update `CHANGELOG.md`** (Keep a Changelog format) before commit — new entries under `## [Unreleased]`

## Verification

Before claiming "all good, ok to push to main or merge to local main," run `just verify`:

```
just verify
```

This runs the full pre-merge gate:
1. **`just check`** — `bunx tsc --noEmit` type-check
2. **`just test`** — `bun test test/` full local suite

Both must pass. If any gate fails, the change is not ready.

### Tooling

| Tool | Role | Config | Committed |
| --- | --- | --- | --- |
| **mise** | Runtime pinning (bun 1.3, node 24) | `.mise.toml` | yes |
| **just** | CI gate recipes | `justfile` | yes |
| **prek** | Pre-commit hooks (runs `just verify` on commit) | `prek.toml` | yes |
| **bun test** | Local test suite | `test/*.test.ts` | yes |

### pre-commit hooks

`prek` runs on every `git commit`:
- trailing-whitespace, end-of-file-fixer, check-added-large-files (builtin)
- `just verify` (local gate — type-check + tests)

Install hooks after cloning: `prek install`

### Local-only artifacts (gitignored)

- `.prek-env/` — prek hook environment
- `node_modules/`, `dist/`, `.env`, `.test-tmp/`, `.smoke-tmp/` — build/test ephemerals

## Child DOX Index

- [`plugins/AGENTS.md`](plugins/AGENTS.md) — plugin subtree contracts, workspace rules, and per-plugin child docs.
- [`scripts/AGENTS.md`](scripts/AGENTS.md) — build, import, and utility scripts.
- [`test/AGENTS.md`](test/AGENTS.md) — test suite conventions and fixtures.
- [`docs/AGENTS.md`](docs/AGENTS.md) — durable project documentation and ADRs.
- [`docs/parallel-agents.md`](docs/parallel-agents.md) — **parallel agent work protocol** (single source of truth): one Git worktree per task branch, branch plus immutable commit OID as deliverable, coordinator-only local integration to `main` and push `origin/main`.
- [`docs/authoring-extensions.md`](docs/authoring-extensions.md) — **authoring contract** for OMP marketplace plugins: dependency resolution model, `peerDependencies` vs `dependencies` vs `devDependencies` rules, and the codesight bundling pattern. **Read before creating or modifying any plugin under `plugins/`.** (Backlog record: doc-8.)
- [`plugins/gsd-web/AGENTS.md`](plugins/gsd-web/AGENTS.md) — GSD-Pi Web UI port: standalone Next host, launcher/registry contracts, settings surface, rpc bridge.
- [`plugins/gsd-browser/AGENTS.md`](plugins/gsd-browser/AGENTS.md) — gsd-browser tool suite: reason vocabulary, settings ownership, `.gitignore` gate.
- [`plugins/gsd-loop/AGENTS.md`](plugins/gsd-loop/AGENTS.md) — autonomous GSD loop kernel: per-cwd `.gsd-loop/` state, pure kernel guard pipeline, `gsd_loop_*` tools + `/gsd-loop` command.
- [`plugins/gsd-graph/AGENTS.md`](plugins/gsd-graph/AGENTS.md) — GSD graph plugin contracts (GRAPH.yaml engine + knowledge graph, `.gsd/` persistence, naming rules).
- Global system prompt overlay is deployed at `~/.omp/agent/APPEND_SYSTEM.md` (single append channel — a discovered `SYSTEM.md` would replace, not append, the default prompt) — see `docs/omp-agent-v1-2026-08-21.md` for the evaluation and rationale.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
