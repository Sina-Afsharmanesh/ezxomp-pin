# AGENTS.md — backlog

## Purpose
Backlog.md integration plugin for OMP. Registers the `backlog_*` tool suite over the `backlog` CLI, shared task helpers, and injects the canonical Backlog.md workflow instructions as the default system-prompt overlay before every agent start.

## Ownership
- Package: `@ezxomp/backlog` (born in ezxomp; tools/helpers extracted verbatim from `@ezxomp/cook`)
- Entry: `extensions/index.ts` — registers all `backlog_*` tools and the default `before_agent_start` instruction overlay

## Local Contracts
- Imports `Type` from `typebox` (not `@oh-my-pi/omptype/typebox`). OMP's marketplace install does not run npm/bun install, so peer packages are not on the plugin's module resolution path; the host ships the original `typebox` in the plugin node_modules.
- Peer dep: `@oh-my-pi/pi-coding-agent` 17.3.8.
- `registerBacklogTools(pi, sc)` takes a `BacklogToolsContext` (`{ currentCwd: string }`). Cook passes its full `StoreContext`; the standalone entry passes `{ currentCwd: process.cwd() }`.
- Instruction strings in `extensions/instructions.ts` MUST stay verbatim output of `backlog instructions overview|task-creation|task-execution|task-finalization` (backlog.md 1.50.1). Regenerate from the CLI when upgrading backlog.md; never paraphrase.
- The overlay hook is unconditional — this plugin is the default instruction source for general model work.

## Work Guidance
- Sub-modules under `extensions/`: `types.ts`, `helpers.ts`, `tools.ts`, `instructions.ts`, `index.ts`.
- Tool additions belong in `tools.ts` wrapping `backlog <command>` flags 1:1; keep descriptions aligned with `backlog <command> --help`.

## Verification
- `bun test plugins/backlog` (vitest, see `tests/`) from repo root; type-check via root `just check`.

## Child DOX Index
No child AGENTS.md files needed.
