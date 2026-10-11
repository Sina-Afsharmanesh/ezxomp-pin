---
id: TASK-57
title: >-
  Repo-level OMP setup script: clean/backup config choice + local vs marketplace
  install
status: Done
assignee:
  - '@omp-agent'
created_date: '2026-08-30 14:27'
updated_date: '2026-08-30 15:08'
labels:
  - feature
  - tooling
dependencies: []
references:
  - docs/omp-marketplace-update.md
  - docs/parallel-agents.md
priority: high
type: feature
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dev user runs a repo-level script that interactively (1) asks whether to clean-install the ezxomp OMP plugins or back up their config first, (2) after completion asks whether to install plugins locally (link) or via the ezxomp marketplace. Validate via bash, then add just recipes that reach the same goal using omp CLI surfaces only (just is the orchestrator, omp is the executor) so users have multiple ways to do quick setup of testing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 scripts/setup-omp.sh is executable, interactive (clean-install vs back-up-config question, then local-link vs marketplace question), and idempotent
- [x] #2 Clean path: backs up nothing, removes all @ezxomp plugin installs (marketplace entries + links) and ends with doctor-clean state
- [x] #3 Backup path: copies config/state dirs out of \$HOME/.omp before removing installs, backup is listed and preserved
- [x] #4 Local path links all 12 marketplace-registered plugins from the repo working tree (user scope); marketplace path installs all 12 from the ezxomp marketplace at current versions
- [x] #5 Script verifies end state: omp plugin doctor 0 errors, and every @ezxomp plugin classifies as LOCAL (link) or MKT (marketplace cache) matching the chosen mode
- [x] #6 E2E: both install paths verified in an isolated HOME (temp OMP_HOME), plus one real clean+marketplace run on the dev install
- [x] #7 just recipes (just setup / just setup-clean / just setup-local / just setup-market) expose the same goal using only omp CLI surfaces (plus git for marketplace clone); no new npm deps
- [x] #8 Non-interactive flags exist (--clean/--backup, --local/--market, --yes) so just recipes and CI can drive the script without a TTY
- [x] #9 CHANGELOG.md updated and just verify passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Author scripts/setup-omp.sh: interactive (config policy: clean vs backup-then-clean; install mode: local links vs marketplace) + flags --clean/--backup --local/--market --yes; plugin list sourced from .omp-plugin/marketplace.json via python3; uninstall via omp plugin uninstall <name>@ezxomp (works for links per docs gotcha); clean wipes ~/.omp/plugins/cache (+stale node_modules/@ezxomp); backup tars protected dirs (agent, agents, profiles, logs, marketplaces.json, install-id, autoqa.db, sssf-overlay.yml, wt) to ~/ezxomp-omp-backup-<ts>.tar.gz excluding re-downloadable caches (plugins/cache, natives, puppeteer, run). 2. Verify end state: doctor + classify all 12 (MKT expected for market mode, LOCAL for local mode). 3. E2E both paths in temp HOME + real clean+market run on dev install. 4. Just recipes setup/setup-clean/setup-local/setup-market as thin wrappers over the script (just orchestrates, omp executes; no bun/npm). 5. CHANGELOG + scripts/AGENTS.md note + just verify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: scripts/setup-omp.sh (bash, no deps beyond git/python3/omp). Interactive: prompt_choice for config policy (clean vs backup) then install mode (local vs market); non-interactive flags --clean/--backup --local/--market --remove-only --yes. Plugin list sourced from .omp-plugin/marketplace.json (12 entries).
Key discoveries during verification:
- 'omp plugin uninstall <name>@ezxomp' only clears MARKETPLACE installs; linked plugins survive (lock entry + node_modules symlink remain). Correct removal for links is 'uninstall @ezxomp/<name>' (scope-prefixed), but it can leave the symlink — so the script sweeps: CLI uninstall + symlink rm + lock scrub (python3) + plugins/cache/plugins rm.
- Plugin cache lives at ~/.omp/plugins/cache/plugins (not ~/.omp/cache/plugins).
- doctor error glyph is U+2718 (✘); summary line 'errors: N' is the reliable machine marker.
- Link state: node_modules/@ezxomp/<n> symlink + lock key @ezxomp/<n> (no deps). Mkt state: symlink + lock key + plugins/cache/plugins/ezxomp_marketplace cache.
- E2E matrix in isolated HOMEs: clean->local (12 LOCAL), local->market (sweep removed links, 12 MKT, 0 stale lock keys), market->local (12 LOCAL), backup created tarball preserving config/state.
- Interactive prompt path verified via pty with paced input: 1) policy 2) mode y confirm; abort path verified.
- Real dev install: backup to ~/ezxomp-omp-backups/ (agent 133M, agents 14M, marketplaces.json, install-id, sssf-overlay.yml), all 12 reinstalled as MKT, doctor 0 errors, 0 stale cache copies.
- just recipes: setup (interactive), setup-clean (--remove-only), setup-local (--clean --local), setup-market (--backup --market). Validated in isolated HOMEs.
- Fallow gate failure during verify was a broken git worktree registration (stale core.worktree pointing at removed /home/eag1/repo/ezxomp.task-56.7) — repaired by 'git config --unset core.worktree' + 'git worktree prune' (pre-existing, unrelated to this change). After repair: 'just verify' fully green (388 pass / 0 fail, all fallow gates passed).
- Stale plugins/ultra-compact/ tree (untracked, only gitignored node_modules, TASK-56 residue) removed.

Post-Done follow-up (README/commit): added README 'Quick setup (dev / test)' section with full CLI (just recipes table, script flags, behavior notes) and fixed the stale quick-start (was 'all 7 plugins'). Fixed two script defects found while documenting: (1) non-interactive default was clean+local (destructive) despite help claiming backup — now backup is the default policy (first option) and help says so; (2) warn() printed to stdout, which corrupted the captured prompt_choice answer in non-interactive mode — now stderr. Verified: bare non-interactive run in temp HOME -> backup (config content preserved in tarball) + 12 local links, exit 0. just verify green (388 pass, fallow gates passed).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added scripts/setup-omp.sh (interactive clean/backup + local/market quick setup, idempotent, verified end state via doctor + per-plugin classification) and just recipes setup/setup-clean/setup-local/setup-market wrapping it with omp CLI surfaces only. Verified: full E2E matrix in isolated HOMEs (clean->local, local->market, market->local, backup), interactive prompt path via PTY, real dev install now clean+marketplace (12/12 MKT, doctor 0 errors, backup preserved in ~/ezxomp-omp-backups/), just verify green (388 pass, all fallow gates passed).
<!-- SECTION:FINAL_SUMMARY:END -->
