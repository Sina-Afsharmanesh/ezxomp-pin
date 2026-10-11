# pstack-suite

## Purpose

- Own the unified `/pstack` OMP command suite: single-entry subcommand router, model-facing playbook dispatch, bundled playbook skills, run receipts, event stream, and optional TUI overlays.

## Ownership

- `src/index.ts` owns the ONLY `registerCommand` call (`"pstack"`) and its in-handler subcommand router (info/help/menu, setup, mode, bare resume, 16 workflow commands, direct-playbook fallback, unknown-input error menu).
- `src/playbook-dispatch.ts` owns bundled-skill loading (`loadSkillBody`), heading extraction (`extractSection`), and prompt composition (`composePlaybookPrompt`); skills resolve plugin-relatively from `../skills`.
- `src/commands/mode.ts` owns `parseModeArgs`, token-only playbook resolution, and the explicit-task LLM dispatch path (receipt phase=`dispatched`, emitEvent, overlay skipped there only); `send`/`loadSkillBody` are injectable for tests.
- `skills/<slug>/SKILL.md` are the bundled playbook skills OMP auto-discovers. They are plugin-relative ONLY — NEVER create or mirror them in `~/.omp/agent/skills` or project `.omp/skills`. The `## Core Principles` heading in `skills/mode/SKILL.md` is load-bearing: dispatch extracts that section verbatim. The heading must stay a `## Core Principles` line (annotation suffixes like `(10)` are tolerated by `extractSection`, but the bare form is canonical); a missing section silently drops principles from dispatched prompts.

- `src/runner.ts` owns safe process execution, AbortSignal cancellation, bounded output, and run-scoped command events.
- `src/run.ts` owns run IDs, preflight/receipt persistence, and receipt events.
- `src/overlay/` owns headless-safe TUI consumers; UI bridges must retain overlay handles and restore focus on every close path.
- `test/` and adjacent `src/*.test.ts` own deterministic command, event, runner, and overlay contract coverage.

## Local Contracts

- Slash-command names MUST be single-token: OMP dispatches by first whitespace-delimited token with an exact map lookup — space-containing registered names are unreachable.
- Every long-running command that creates a progress overlay MUST pass the same `runId` to the overlay, runner, phase events, and final receipt.
- `runProcess` MUST receive the command AbortSignal and emit terminal `cancelled`/`timed_out` flags before resolving.
- Progress rendering MUST bound event-driven flushes and MUST NOT treat an individual check update as a terminal receipt.
- TUI imports remain lazy behind `ctx.hasUI`; headless command behavior stays on the same run/receipt path.

## Work Guidance

- Preserve direct executable-plus-argv invocation; do not introduce shell execution.
- Run targeted pstack tests and `bunx tsc --noEmit` after source changes. Use `just verify` for the pre-merge gate.
- Update `CHANGELOG.md` for meaningful behavior changes.

## Verification

- `cd plugins/pstack-suite && bun run test` — deterministic vitest suite (the gate; also wired as `just verify`'s `pstack-test` recipe)
- `RUN_LIVE=1 bun run test:live` / `RUN_SMOKE=1 bun run test:smoke` — opt-in process-spawning/smoke coverage
- `bunx tsc --noEmit` at repo root

## Child DOX Index

- None.
