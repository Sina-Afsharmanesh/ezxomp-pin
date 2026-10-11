# ezxomp

A curated OMP plugin marketplace — 17 plugins (9 forked/ported from upstream, 8 in-house) ported to OMP 18.0.6, installable as a single marketplace.

## Quick start

```bash
# From the git remote (tangled):
omp plugin marketplace add https://tangled.org/expi.tngl.sh/ezxomp

# Or from a local clone:
omp plugin marketplace add ~/repo/ezxomp

# Install all 17 plugins (user scope):
omp plugin install code-nav@ezxomp codesight@ezxomp experiences@ezxomp \
  agent-learning@ezxomp compact-eng@ezxomp extensible-workflows@ezxomp \
  plannotator@ezxomp augment@ezxomp evo@ezxomp cook@ezxomp backlog@ezxomp \
  pstack-suite@ezxomp gsd-web@ezxomp gsd-browser@ezxomp gsd-loop@ezxomp \
  gsd-graph@ezxomp better-custom@ezxomp --scope user

# Or, from a repo checkout, reset the whole set (with backup + local/market
# choice) — see "Quick setup (dev / test)" below:
just setup

# Or install individually:
omp plugin install code-nav@ezxomp --scope user

# Verify:
omp plugin list
```

> **Don't** use `omp plugin install git:<url>` — it treats the URL as a single tarball and fails with `ZlibError`. This repo is a **marketplace**, not a single plugin. Add it with `omp plugin marketplace add` first, then install plugins by `name@marketplace`.

## Quick setup (dev / test)

Reset the full ezxomp plugin set (all 17 plugins from the catalog) in one shot, with an interactive clean/backup choice and a local-link vs marketplace install choice. Everything runs through `scripts/setup-omp.sh` (bash; needs only `git`, `python3`, `omp`) and is exposed as `just` recipes:

```bash
just setup          # interactive: (1) clean vs backup config, (2) local vs marketplace
just setup-local    # non-interactive: clean + link all 17 from the working tree
just setup-market   # non-interactive: backup + install all 17 from the ezxomp marketplace
just setup-clean    # non-interactive: remove all 17 (no reinstall)
```

| Recipe | Flags passed | What it does |
|--------|--------------|--------------|
| `just setup` | none | Interactive prompts: **1)** `backup` (default) or `clean`, **2)** `local` or `market`, then a confirmation. |
| `just setup-local` | `--clean --local --yes` | Remove installed plugins, then `omp plugin link` every plugin from the repo working tree. Use to **test unpushed changes**. |
| `just setup-market` | `--backup --market --yes` | Back up config/state, remove installed plugins, then `omp plugin install` every plugin from the marketplace. This is the **shipping state**. |
| `just setup-clean` | `--remove-only --yes` | Remove all 17 plugins without reinstalling (symlink + lock + cache sweep). |

### Script CLI (`scripts/setup-omp.sh`)

```bash
bash scripts/setup-omp.sh [flags]

  --clean | --backup   config policy
                       clean  — remove all installed ezxomp plugins, keep config/state as-is
                       backup — tar config/state to ~/ezxomp-omp-backups/ first, then clean
  --local | --market   install mode
                       local  — link every plugin from the repo working tree
                       market — install every plugin from the ezxomp marketplace
                                (registers/clones the marketplace from origin if unregistered)
  --remove-only        clean only; skip the install step
  --yes, -y            skip confirmations (implied when non-interactive)
  -h, --help           show help
```

Behavior notes:

- **Safe by default.** With a TTY you are asked both questions (policy default: `backup`). Without a TTY, missing flags fall back to `backup` + `local` with a warning — a bare run never deletes config/state.
- **What clean touches:** installed-plugin state only — `~/.omp/plugins/node_modules/@ezxomp/*`, `~/.omp/plugins/omp-plugins.lock.json` entries, `~/.omp/plugins/cache/plugins`. Config/state dirs (`agent`, `agents`, `profiles`, `logs`, ids) are never modified; `backup` archives them to `~/ezxomp-omp-backups/omp-backup-<timestamp>.tar.gz` first.
- **The sweep is idempotent.** The removal handles the OMP CLI's asymmetry — `omp plugin uninstall <name>@ezxomp` does not remove *linked* plugins — by removing node_modules entries, scrubbing the lock, and clearing the plugin cache. Re-running any recipe converges to the requested state.
- **Verified end state.** The script finishes with `omp plugin doctor` (0 errors) and classifies every plugin as `LOCAL` (repo link) or `MKT` (marketplace cache), exiting non-zero on any mismatch.
- **Isolatable.** It honors `$OMP_HOME` (defaults to `~/.omp`), so e2e runs work in a temp HOME: `HOME=$(mktemp -d) bash scripts/setup-omp.sh --clean --market --yes`.
- Start a **fresh OMP session** after any setup run to pick up the new plugin set.

## Plugins

| Plugin | Version | Upstream | Description |
|--------|---------|----------|-------------|
| `code-nav` | 0.5.0-ezxomp.0 | `pi-code-nav` | Code navigation, definition, reference, implementation, AST-grep |
| `codesight` | 0.2.2-ezxomp.0 | `pi-codesight` | CodeSight artifact reader, session-owned watcher, overlay |
| `experiences` | 0.1.49-ezxomp.1 | `pi-experiences` | Experience capture, retrieval, consolidation, scheduling, CLI |
| `agent-learning` | 0.1.0-ezxomp.0 | in-house | Unified agent learning: skills catalog + skills.sh surface, native-memory facts shim, skillforge evidence pipeline |
| `compact-eng` | 2.0.0-ezxomp.0 | `pi-ultra-compact` | OMP-native compaction governor, Shake observer, and guarded text/snapcompact requests |
| `extensible-workflows` | 5.1.0-ezxomp.3 | `vekexasia/pi-extensible-workflows` | Saved-recipe persistence and authoring for OMP Workflowz |
| `augment` | 1.0.9-ezxomp.0 | `pi-augment` | Augment-style prompt rewriting with persisted OMP settings and editor review |
| `plannotator` | 0.25.1-ezxomp.2 | `backnotprop/plannotator` | Planning, annotation, code/PR review, browser server |
| `evo` | 0.1.7-ezxomp.5 | `pi-evo-mode` | evo mode toggle: marketplace-plugin tool profile for main agent and subagents |
| `cook` | 0.1.7-ezxomp.8 | `pi-backlog-cook` | Backlog.md cookbook workflow: atomic sub-tickets, scout/planner/worker/validator/judge dispatch, Done-gate |
| `backlog` | 0.1.0-ezxomp.0 | in-house | Backlog.md integration: `backlog_*` tool suite + canonical workflow instructions overlay |
| `pstack-suite` | 1.0.0-ezxomp.0 | in-house | Unified workflow command suite: code quality, PR review, docs, CI, team ops |
| `gsd-web` | 5.2.0-ezxomp.1 | `open-gsd/gsd-pi` | GSD-Pi Web UI port: Next.js dashboard served by a standalone Node host via an `omp --mode rpc` bridge |
| `gsd-browser` | 0.1.0-ezxomp.0 | `@opengsd/gsd-core` | Browser tool surface: page fetch, Brave search, DOM snapshot, navigation, screenshots |
| `gsd-loop` | 0.1.0-ezxomp.0 | `open-gsd/gsd-pi` | Autonomous loop kernel: iteration contract, guard catalog, persisted crash-safe state machine |
| `gsd-graph` | 0.1.0-ezxomp.0 | `open-gsd/gsd-pi` | Workflow execution graph (`GRAPH.yaml` engine) + TS-native knowledge graph |
| `better-custom` | 0.1.3-ezxomp.0 | in-house | `/custom-provider` wizard, native `/model` registry registration, `/better-models` unified browser |

## Local development

```bash
# Scaffold a new plugin:
bun run scripts/scaffold-plugin.ts my-plugin --description "What it does" \
  --with-skills --with-tools --with-commands

# Verify a plugin scaffold:
bun run scripts/verify-scaffold.ts my-plugin

# Symlink all plugins from the working tree — Phase 1 dev-test vehicle ONLY;
# the shipping state must be a marketplace install (docs/omp-marketplace-update.md):
bun run install:local

# Verify on-disk manifests + live RPC:
bun run verify:omp

# Run plugin smoke tests:
bun run smoke:plugins

# Type-check:
bun run check
```

> **Plannotator caveat.** Plannotator loads its tracked `index.bundle.js`
> (see `plugins/plannotator/AGENTS.md`); source edits to its `index.ts`,
> `server/`, `todo-providers/`, or `generated/` only take effect after
> `bun --filter @ezxomp/plannotator run build:bundle` and an OMP restart.
> `verify:bundle` runs SHA-256 content-hash equivalence against a temp
> rebuild, not a freshness check.

## Refreshing upstream sources
```bash
# Pull the pinned tarball, run upstream build:pi, stage into a fresh temp dir.
# The stage dir mirrors the upstream `apps/pi-extension` layout directly
# (no `plugins/plannotator/` prefix).
STAGE=$(mktemp -d)
bun run scripts/import-upstreams.ts stage plannotator --out "$STAGE"

# Replace the plugin source artifacts wholesale so changed files refresh.
rm -rf plugins/plannotator/generated
cp -R "$STAGE/generated" plugins/plannotator/
cp "$STAGE"/plannotator.html "$STAGE"/review-editor.html plugins/plannotator/
rm -rf "$STAGE"

# Re-bundle the extension entry so index.bundle.js reflects the refreshed source.
( cd plugins/plannotator && bun run build:bundle )

# Review the diff with `git status`; then follow the repository's
# documented Git + Tangled workflow to commit and push
# (see `.omp/skills/git-tangled-workflow` and `AGENTS.md` § Version Control).
# Scope the commit to the refreshed artifacts only.
```

> Do not run `vendor.sh` in this repo — it expects the upstream monorepo
> (`packages/core`, `packages/shared`, etc.) which is not checked out
> here. The locked `stage` command reproduces its effect against the
> pinned commit.


## Marketplace catalog

The catalog lives at [`.omp-plugin/marketplace.json`](.omp-plugin/marketplace.json). It uses the OMP marketplace schema:

- `name` — marketplace name (must match `/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/`, max 64 chars)
- `owner.name` — owner name
- `plugins` — array of plugin entries (`{ name, source, description?, version?, attribution? }`)
  - `source` must start with `./` (relative to repo root) for local-directory plugins

OMP discovers the catalog at `.omp-plugin/marketplace.json` (or `.claude-plugin/marketplace.json` as fallback). The array field is `plugins`, **not** `entries`.

## Repository structure

```
.
├── .omp/skills/                    # Project-local workflows and marketplace skills
├── .omp-plugin/marketplace.json   # OMP marketplace catalog (17 plugins)
├── plugins/                       # Plugin source (one dir per plugin)
│   └── ...
├── upstreams.lock.json             # Pinned upstream versions + integrity hashes
├── scripts/
│   ├── import-upstreams.ts         # Lock-driven importer (download, verify, copy)
│   ├── install-local.ts            # Symlink installer (omp plugin link)
│   ├── scaffold-plugin.ts          # New plugin scaffolder
│   ├── verify-scaffold.ts          # Plugin structure validator
│   └── verify-omp.ts               # Manifest + RPC verification
├── test/                           # Smoke + integration tests
└── package.json                    # Workspace root (plugins/*)
```

## Project-local skills

`.omp/skills/` contains five skills for working in this repo:

- **`git-tangled-workflow`** — Commit, push, and open Tangled pull requests with native Git: conventional commits, DCO sign-off, worker branches, and coordinator `git push origin main`
- **`omp-plugin-authoring`** — Create and structure OMP-native plugins; manifest fields, auto-discovered capabilities (skills, hooks, commands, tools, MCP), feature gating, validation
- **`omp-native-package`** — Publish and install OMP plugins via npm; `package.json` setup, `files` array, version strategy, lock file management
- **`ezxomp-marketplace`** — Manage this marketplace catalog; add/remove plugins, install workflows, source resolution, debug install failures
- **`ezxomp-plugin-e2e-test`** — End-to-end test a plugin change: `just verify`, local-link + marketplace install, fresh OMP agent self-checks per phase (HERDR optional)


## License

Forked plugins retain their upstream licenses (see `plugins/*/LICENSE`). Repository orchestration and newly scaffolded plugins are licensed under Apache-2.0; see [`LICENSE`](LICENSE).
