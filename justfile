# justfile — CI gates for ezxomp
# Run `just` to list recipes. Run `just verify` before push/merge.

# Print available recipes
default:
    @just --list

# Type-check (tsc --noEmit)
check:
    bun run check

# Local test suite (bun test)
test:
    bun test test/

# Full pre-merge gate: check + test + fallow audit
verify: check test fallow-audit
    @echo "✓ all gates passed — ok to push/merge"

# Smoke tests only (faster subset)
smoke:
    bun test test/smoke-plugins.test.ts

# --- OMP plugin quick setup (dev/test) ---
# Interactive: asks clean-vs-backup, then local-vs-market.
setup:
    @bash scripts/setup-omp.sh

# Clean the plugin install (sweep symlinks/lock/cache) without reinstalling.
setup-clean:
    @bash scripts/setup-omp.sh --remove-only --yes

# Link every marketplace plugin from the repo working tree (test unpushed changes).
setup-local:
    @bash scripts/setup-omp.sh --clean --local --yes

# Install every marketplace plugin from the ezxomp marketplace (ships what origin has pushed).
setup-market:
    @bash scripts/setup-omp.sh --backup --market --yes

# Fallow codebase-intelligence gate (deterministic, no LLM).
# audit gates on findings introduced by the changeset (new-only vs base).
# Fallow auto-detects merge-base versus default branch.
fallow-audit:
    npx -y fallow@3.20.0 audit --gate new-only --quiet

# Full-repo scan (not a gate) — dead code, dupes, circular deps, complexity
fallow-scan:
    npx -y fallow@3.20.0

# Dead-code only
fallow-dead-code:
    npx -y fallow@3.20.0 dead-code

# Refresh baselines after fixing a batch (ratchet down)
fallow-baseline:
    #!/usr/bin/env bash
    set -uo pipefail
    mkdir -p fallow-baselines
    # fallow exits 1 when findings exist — expected during capture; we want the fingerprints regardless.
    npx -y fallow@3.20.0 dead-code --save-baseline fallow-baselines/dead-code.json || [ $? -eq 1 ]
    npx -y fallow@3.20.0 health --save-baseline fallow-baselines/health.json || [ $? -eq 1 ]
    npx -y fallow@3.20.0 dupes --save-baseline fallow-baselines/dupes.json || [ $? -eq 1 ]
    echo "baselines written to fallow-baselines/"
