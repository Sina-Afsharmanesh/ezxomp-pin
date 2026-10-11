---
name: git-tangled-workflow
description: Commit, push, and create PRs on the Tangled knot using native Git. Use when committing changes, handing off worker branches from git worktrees, integrating to main, pushing to the tangled remote, signing commits (DCO), debugging SSH/push failures, or creating PRs with the tngl CLI.
---

# Git + Tangled Workflow

Commit, push, and create PRs on the [Tangled](https://tangled.org) knot with native Git. `main` is the integration branch and **only the coordinator pushes it**.

## Official documentation

- [Tangled docs — quick start](https://docs.tangled.org/quick-start-guide) — SSH setup, repository creation, migration
- [Tangled contribution guide](https://docs.tangled.org/contribution-guide) — commit guidelines, DCO, formatting

## Conventional commits

This repo uses conventional commit messages. Every commit summary must follow:

```
type(scope): imperative summary

Optional body explaining what and why. Wrap at 72 chars.
```

### Types

| Type | When |
|------|------|
| `fix` | bug fix |
| `feat` | new feature |
| `docs` | documentation only |
| `refactor` | code restructure, no behavior change |
| `test` | test additions or fixes |
| `chore` | tooling, config, CI |
| `fixup` | address review feedback on an existing change |

### Rules

- **imperative mood**: "fix bug" not "fixed bug" or "fixes bug"
- **lowercase summary**, no trailing period
- **summary under 72 chars**
- **atomic commits**: one logical change per commit
- **no "wip" or "final fix"** — amend or redo the commit before it reaches `main`
- **scope** = top-level directory or package (e.g. `marketplace`, `plugins/codesight`, `scripts`)

### Verification

```bash
bun run scripts/verify-commits.ts [base]
```

Validates every commit from `<base>` (default `main`) to HEAD: conventional type, imperative mood, summary length, no trailing period, DCO sign-off.

## DCO sign-off

Tangled requires [Developer Certificate of Origin](https://developercertificate.org/) sign-off on all commits. Sign every commit with `-s`:

```bash
git commit -s -m "fix(marketplace): rename entries to plugins"
```

`-s` appends `Signed-off-by: <user.name> <user.email>` from your git identity. Set it first (per worktree if needed):

```bash
git config user.name "Erik"
git config user.email "egarcia@myncu.com"
```

Verify a commit is signed:

```bash
git log -1 --format='%(trailers:key=Signed-off-by,valueonly)'
```

Missing sign-off after committing: `git commit --amend --no-edit -s` (only before the commit is pushed).

## SSH configuration (verified on this machine)

- Remote — use the existing `origin`, do not re-add:
  ```
  origin ssh://git@tangled.org/did:plc:amke2ghys4cssdzwsjm4syoa/ezxomp
  ```
- SSH key: `~/.ssh/tang` (the default `id_ed25519` does not work).
- `~/.ssh/config`:
  ```
  Host tangled.org
      HostName tangled.org
      IdentityFile ~/.ssh/tang
      IdentitiesOnly yes
  ```
- Handshake check: `ssh -T git@tangled.org` → `Hi @expi.tngl.sh! You're authenticated to knot1.tangled.sh knot.`
- Smoke test: `git ls-remote origin refs/heads/main` prints the current `main` SHA.

### Gotchas

- The remote user is `git` with the repo DID as the path; the knot authenticates the key published to your handle (`expi.tngl.sh`).
- Do NOT point remotes at `knot1.tangled.sh` directly — connect through `tangled.org` as `origin` does.
- An HTTPS remote URL fails with `unable to read askpass response` / `could not read Username` — keep SSH.
- `knot: this ssh key doesn't match any key published by the accounts` → publish `~/.ssh/tang.pub` at tangled.org → Settings → Keys.
- The DID-based remote cannot be auto-resolved by tooling that wants `owner/repo` — pass `--repo expi.tngl.sh/ezxomp` explicitly (see tngl section).

## Worker: commit in an assigned worktree

The coordinator assigns each worker an isolated `git worktree` and a branch named `task/<slug>`. Workers commit locally and **never push**.

```bash
# Coordinator creates the workspace from main:
git worktree add -b task/<slug> ../ezxomp.<slug> main

# Worker, inside the worktree:
git status                                  # confirm branch: task/<slug>
git config user.name; git config user.email # verify identity BEFORE committing
git add -A
git commit -s -m "fix(scope): imperative summary

Body explaining what and why.

TASK-123"
bun run scripts/verify-commits.ts           # commit-message gate
# Report back: branch name + git rev-parse HEAD
```

- Report the exact HEAD SHA — the coordinator integrates that commit, not your working tree.
- prek hooks (when installed) run `just verify` on every commit.

## Coordinator: serial integration to main

Integrate one worker branch at a time, in dependency order. `git push origin main` is the authoritative publish.

```bash
git fetch origin
git checkout main
git merge --ff-only origin/main        # sync to the remote tip
just verify                            # full gate: tsc + bun test
git merge --ff-only task/<slug>        # integrate one worker
just verify
git push origin main
git ls-remote origin refs/heads/main   # must show the pushed SHA
```

- `--ff-only` keeps history linear; Tangled merges PRs as fast-forward, so author commits as they should appear on `main`.
- If `main` advanced past the branch, rebase first, re-run `just verify`, then merge: `git rebase origin/main task/<slug>`.
- Never force-push `main`. Backlog/cook state files self-mutate — commit or stash unrelated dirt before `--ff-only`.

## PR operations (tngl CLI)

This machine's CLI is `tngl` (Go, v0.1.0) — NOT `tang` (not installed). Install/upgrade:

```bash
go install tangled.org/ijadux2.tngl.sh/Tngl-cli/cmd/tngl@latest
```

No `--version` flag — use `tngl version`.

### Auth (two tiers)

- **Read-only** (whoami, repo view, pr list): `tngl auth login --handle expi.tngl.sh --pds https://tngl.sh` — no password.
- **Write ops** (pr create/merge/comment): requires an app password from tangled.org → Settings → App Passwords:
  ```bash
  tngl auth login --handle expi.tngl.sh --pds https://tngl.sh --password xxxx-xxxx-xxxx-xxxx
  ```
  Without it, writes fail with `401 Unauthorized - {"error":"AuthMissing"}`. Verify with `tngl whoami`, `tngl auth status`.

### Coordinator: create a PR after pushing a worker branch

```bash
# Workers never push. Coordinator publishes the branch only when a PR is needed:
git push origin task/<slug>
tngl pr create \
  --repo expi.tngl.sh/ezxomp \
  --source task/<slug> \
  --target main \
  --title "fix(scope): imperative summary" \
  --body "Description of the change."
```

Verified flag surface (v0.1.0):

| Command | Purpose | Notes |
|---------|---------|-------|
| `tngl pr list --repo owner/repo` | List PRs with [open]/[merged] | No `--id`/detail flags |
| `tngl pr create --repo ... --source <branch> --target main --title ... --body ...` | Create PR | `--target` defaults to `main` |
| `tngl pr view --id N --repo ...` | View PR | Mostly useless ("PR details not yet available"); no `--json` |
| `tngl pr review --id N --repo ...` | Approve | Empty body prints a warning; harmless |
| `tngl pr merge --id N --repo ...` | Merge AppView state | **Does NOT advance the knot's git `main` ref** — see below |
| `tngl repo view <owner/repo>` | Repo info | Repo is POSITIONAL here (only pr-create uses `--repo`) |

No diff command — get PR content via git: `git fetch origin 'refs/heads/*:refs/remotes/origin/*'`, then `git log/diff origin/main...origin/task/<slug>`.

### Merging: git main is authoritative

`tngl pr merge --id N --repo expi.tngl.sh/ezxomp` marks the PR merged in the AppView but does **not** advance the knot's git `main` ref. The authoritative merge is the coordinator's local fast-forward plus `git push origin main` (section above). Run `tngl pr merge` only afterwards so the AppView shows merged; re-running on an already-merged PR is a no-op success.

## Common failures and fixes

### `Permission denied (publickey)`

**Cause:** Wrong SSH key. **Fix:** Keep the `ssh://git@tangled.org/did:...` origin and let `~/.ssh/config` select `~/.ssh/tang`; verify with the handshake check above.

### `knot: this ssh key doesn't match any key published by the accounts`

**Cause:** The SSH key isn't published to the Tangled handle. **Fix:** Add `~/.ssh/tang.pub` at tangled.org → Settings → Keys; keep the `git` user + DID-path remote.

### `Connection timed out` to `knot1.tangled.sh`

**Cause:** The knot's direct host is unreachable; only `tangled.org` proxies. **Fix:** Use the existing `origin` URL, never `knot1.tangled.sh` directly.

### `unable to read askpass response` / `could not read Username`

**Cause:** Remote URL is HTTPS. **Fix:** `git remote set-url origin ssh://git@tangled.org/did:plc:amke2ghys4cssdzwsjm4syoa/ezxomp`.

### `commit is not marked as verified` / verify-commits DCO error

**Cause:** Missing DCO sign-off. **Fix:** `git commit --amend --no-edit -s` (before push), and check `git config user.name` / `user.email` are real values.

### prek rejects a large file on commit

**Cause:** `check-added-large-files` hook. **Fix:** Add the file to `.gitignore` or deliver it out-of-band.

### `tngl pr create` reports "not in a Tangled repository"

**Cause:** The DID-based SSH remote cannot be auto-resolved by the CLI. **Fix:** Pass `--repo expi.tngl.sh/ezxomp` explicitly. (`tngl repo view` takes the repo positionally instead.)

### `401 Unauthorized - {"error":"AuthMissing"}`

**Cause:** Not authenticated with an app password (read-only login doesn't cover writes). **Fix:** `tngl auth login --handle expi.tngl.sh --pds https://tngl.sh --password <app-password>`.

### `tngl pr merge` says merged but `git ls-remote origin refs/heads/main` is stale

**Cause:** Expected — the AppView merge does not move the knot's git `main`. Do not poll waiting for it. **Fix:** Use the coordinator fast-forward + `git push origin main` procedure; then run `tngl pr merge` for AppView bookkeeping.

### PR shows "conflicted"

**Cause:** Tangled merges PRs as fast-forward (no squash, no merge commit); `main` advanced after the branch was created. **Fix:** Coordinator rebases and updates the worker branch; workers never push or mutate `main`:

```bash
git fetch origin
git rebase origin/main task/<slug>
just verify
git push --force-with-lease origin task/<slug>
```
