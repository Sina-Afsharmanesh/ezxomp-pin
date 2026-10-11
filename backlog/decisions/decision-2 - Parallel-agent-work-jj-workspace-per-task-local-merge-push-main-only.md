---
id: decision-2
title: 'Parallel agent work: jj workspace-per-task, local merge, push main only'
date: '2026-08-28 03:55'
status: accepted
---
## Context

ezxomp is a JJ-colocated repo (remote = Tangled knot, push only via `jj git push --bookmark main --remote origin`). We run parallel agents (cook dispatches, OMP tasks) that need isolated working directories. Two failure classes observed in past sessions:

1. **Cook's task-38 dirs were plain git clones** (no `.jj/`): agents ran `jj` there and mutated the parent repo, and their four bookmarks (`task-38-*`) all point at the same commit (divergent) — ~812MB of un-CoW'd copies, never merged.
2. **Agents pushed their own bookmarks to origin** (`feat/backlog-plugin-type-debt`, `fix/evo-protected-floor-cook-dispatch` still sit on the remote unmerged) instead of leaving integration to the coordinator.

JJ workspaces share one repo + one op log; concurrent agents that both move `main` or push produce op-head merges, stale working copies, and bookmark conflicts. `snapshot.auto-update-stale` was `false`, so every stale state was a hard error mid-agent-loop.

Remote PR flow (Tangled) is quirky and slower than local merge; the proven pattern across all prior successful sessions is: work on side commits, merge locally into `main`, push `main` once.

## Decision

**One `jj` workspace per concurrent task; workers never touch `main` and never push; the coordinator merges locally and pushes only `main`.**

### Source of truth

The full protocol, commands, and failure-mode rules live in ONE document: `docs/parallel-agents.md` (backlog decision-2 is this record; `docs/parallel-agents.md` is the operational reference). Plugins/skills/agents do NOT copy the protocol — they carry a short pointer line to that file. If the protocol changes (new tool, new rule), edit `docs/parallel-agents.md` only; every pointer stays valid with no plugin changes.

### Protocol summary (normative text in docs/parallel-agents.md)

1. Coordinator creates per-task workspaces: `jj workspace add ../ezxomp.<task> -r main --name <task>` (never plain git clones; CoW via FICLONE is free on this Btrfs `/home`).
2. Workers inside a task workspace: `jj new main`, work, `jj commit`/`jj describe -m`, then `jj bookmark create <task> -r @-`. That bookmark is the ONLY deliverable. Never `jj git push`; never `jj bookmark set main`; never `jj new` onto shared refs mid-task.
3. Coordinator integrates: `jj new main <bookmark>` (merge commit) or `jj rebase -d main`; run `just verify`; then `jj bookmark set main -r <tip>` and the only `jj git push --bookmark main --remote origin`.
4. Repo config: `snapshot.auto-update-stale = true` (kills the stale-WC interruption class).
5. Teardown after merge: `jj workspace forget <task> && rm -rf ../ezxomp.<task>`; delete the task bookmark.
6. Agent footguns (page hangs, interactive editors, colocated desync, git-worktree shadowing) are handled by the `jujutsu-workflow` skill (netresearch/jujutsu-workflow-skill, loaded via read_skills); it defers to `docs/parallel-agents.md` where they differ.

### Rejected alternatives

- **Plain git worktrees/clones per agent** (what cook did for task-38): no `.jj/`, agents mutate the parent repo, bookmarks diverge, 203MB+ non-CoW copies. Rejected.
- **PR branches to the remote**: Tangled PR merge is slow/quirky vs local merge; creates stale remote branches (observed twice). Rejected for internal workflow; acceptable only for external contributions.
- **anomalyco/rift / worktrunk / Priyash's rift**: no jj workspace support (rift refuses git worktrees and manages no refs; worktrunk is git-worktree-only, jj support still an open issue). Rejected for now; revisit if they add jj.
- **jjCoW (`jjw`)**: fits (colocated + Btrfs reflinks) but experimental; the protocol works with plain `jj workspace add`. Optional future adoption for instant CoW creation; not a dependency.

## Consequences

- Only one ref (`main`) ever moves on the remote; no branch litter, no remote races (colocated push concurrency is not fully lock-free — single-pusher makes that structurally impossible).
- Workers are restart-safe: their `@` lives in the shared op log, so any coordinator `jj log` shows their progress live.
- Stale-WC errors disappear (`auto-update-stale = true`); op-head merges still occur but are harmless when workers only create commits + their own bookmark.
- Cost: integration is serialized through the coordinator (intended — it owns `just verify` and the push). If coordinator throughput becomes the bottleneck, revisit with `jjCoW` + parallel local merges before considering remote PRs.
- Every plugin/skill that touches repos points at `docs/parallel-agents.md`; changing the protocol never requires plugin edits.
