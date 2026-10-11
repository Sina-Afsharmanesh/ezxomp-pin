# scripts

## Purpose

Build, import, and utility scripts for the ezxomp monorepo. These are developer-facing tools, not runtime code.

## Ownership

Scripts are maintained by the ezxomp team. Changes to scripts that affect the build or import pipeline should be reviewed carefully.

## Local Contracts

- Scripts use Bun runtime (`bun run scripts/<name>.ts`)
- Import scripts (`import-upstreams.ts`) manage upstream dependency syncing
- Install scripts (`install-local.ts`) handle local plugin installation
- Verification scripts (`verify-omp.ts`) validate OMP plugin structure
- Setup script (`setup-omp.sh`) is a bash entry point (not Bun) for resetting the user-scope ezxomp OMP plugin set: clean-vs-backup, then local-link-vs-marketplace, plus end-state verification. Exposed via the `just setup*` recipes and non-interactive flags (`--clean/--backup --local/--market --remove-only --yes`). It drives the `omp` CLI only (git only for marketplace clone) and is idempotent.

## Work Guidance

- Keep scripts idempotent — safe to re-run
- Use `--dry-run` flags where possible for destructive operations
- Log actions clearly for debugging
- `setup-omp.sh` is the only script that mutates the user's `~/.omp` install. It never touches config/state dirs (agent, agents, profiles, logs, ids); the backup path archives them to `~/ezxomp-omp-backups/` first.

## Verification

- Run `bun run scripts/<name>.ts` to test individual scripts
- `just verify` includes scripts in the type-check gate

## Child DOX Index

No child docs yet.
