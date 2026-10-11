# docs

## Purpose

Durable project documentation: architecture docs, ADRs, runbooks, and guides. Not for transient notes or diary entries.

## Ownership

Documentation is maintained by the ezxomp team. Each doc should be current and actionable.

## Local Contracts

- Docs use Markdown format
- ADRs follow the standard title/status/context/decision/consequences structure
- Runbooks include exact commands and verification steps
- Keep docs concise — delete stale content instead of explaining history

## Work Guidance

- Update docs when architecture, decisions, or operational procedures change
- Prefer updating existing docs over creating new ones for the same topic
- Link to codesight wiki articles for code-level documentation

## Verification

- Docs are reviewed as part of the PR process
- `just verify` does not include doc checks (manual review)

## Child DOX Index

- [`omp-marketplace-update.md`](omp-marketplace-update.md) — **OMP install/update protocol (single source of truth)**: two-phase link-local dev test -> commit+push -> marketplace install cutover, fresh OMP agent self-check (report-back contract) at each phase; shipping state is marketplace install (all 17 plugins registered; a future non-marketplace plugin would be the only link-local exception).

- [`parallel-agents.md`](parallel-agents.md) — **single source of truth for parallel agent work**: Git worktree-per-task protocol, local merge + push `origin main` only, worker non-negotiables, teardown hygiene. All plugins/skills/agents point here instead of copying the protocol.


- [`omp-agent-v1-2026-08-21.md`](omp-agent-v1-2026-08-21.md) — System prompt evaluation: OMP agent architecture, plugin registration patterns, session issue analysis, and upgrade proposal.

- [`authoring-extensions.md`](authoring-extensions.md) — **authoring contract for OMP marketplace plugins**: dependency resolution model (no `npm install` post-symlink; third-party runtime deps must be vendored or bundled; use standalone `typebox` for `Type` imports, not peer-only `@oh-my-pi/omptype/typebox`). Required reading before creating or modifying any plugin under `plugins/`. (Backlog record: doc-8.)
