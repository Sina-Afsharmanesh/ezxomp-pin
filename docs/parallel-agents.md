# Parallel Agent Work Protocol — Git Worktrees, Local Integration, Push `main` Only

**Status:** normative. This file is the single source of truth for parallel agent work. Plugins, skills, and agent profiles point here; they do not copy this protocol.

## Roles

- **Coordinator:** creates worktrees, integrates branches, runs `just verify`, and is the only actor that pushes `origin/main`.
- **Worker:** works in one task worktree, commits there, and reports branch plus immutable commit OID. Workers never push or mutate `main`.

## Coordinator protocol

Run from repository root. Start from current `main`; do not reuse a worktree or branch name.

```bash
# 1. Create isolated worktree and task branch from main
git fetch origin main
git worktree add -b task/<slug> ../ezxomp.<slug> main

# 2. Inspect worker deliverable after it reports branch + commit OID
git show --stat --oneline <commit-oid>
git branch --contains <commit-oid>

# 3. Integrate locally, serialized by coordinator
git switch main
git merge --no-ff task/<slug> -m "merge: <slug> into main"

# 4. Gate, then perform the only push
just verify
git push origin main

# 5. Teardown after successful integration
git worktree remove ../ezxomp.<slug>
git branch -d task/<slug>
```

Workers may be integrated with a fast-forward when policy requires linear history:

```bash
git switch main
git merge --ff-only task/<slug>
```

Never run two coordinator merges or pushes concurrently. Coordinator inspects merge result and reruns `just verify` after each integration batch.

## Worker rules

Inside assigned worktree (`../ezxomp.<slug>`):

1. Verify location and branch before editing:
   ```bash
   git rev-parse --show-toplevel
   git branch --show-current
   git status --short --branch
   ```
2. Branch must be `task/<slug>`, based on `main`. Do not switch branches or touch another worktree.
3. If `node_modules/` is absent, run `bun install --frozen-lockfile`. Never symlink dependencies from another worktree.
4. Edit only scoped files. Inspect changes with `git diff`.
5. Commit with conventional message and DCO sign-off:
   ```bash
   git add <scoped-files>
   git commit -s -m "<type>(<scope>): <imperative summary>"
   ```
6. Deliver branch plus immutable commit OID:
   ```bash
   git rev-parse --verify HEAD
   git status --short --branch
   ```
7. **NEVER:** `git push`, `git switch main`, `git checkout main`, force operations, or edits in another worktree.
8. Report task slug, branch name, commit OID, changed files, and targeted checks. Coordinator owns merge, gate, push, and teardown.

## Worktree lifecycle and safety

- Worktree path and branch must be unique per task. `git worktree list --porcelain` is authoritative for active paths.
- Worker must not remove its own worktree. Coordinator removes it only after integration or explicit abandonment.
- Before removal, coordinator checks `git status --short --branch` and preserves uncommitted work; `git worktree remove` is never cleanup for unknown changes.
- Do not use `git reset --hard`, `git clean -fd`, or force branch deletion to repair conflicts. Resolve or stop and report.

## Repository checks

Git state checks record repository root, porcelain status, current branch, and immutable `HEAD` OID. Missing task branch, dirty unexpected worktree, detached `HEAD`, or branch outside `task/<slug>` fails worker gate. Coordinator push is allowed only from clean `main` after `just verify` passes.

## Single source rule

Change this file when protocol changes. Update pointers in parent docs and profiles, but do not duplicate protocol text elsewhere.
