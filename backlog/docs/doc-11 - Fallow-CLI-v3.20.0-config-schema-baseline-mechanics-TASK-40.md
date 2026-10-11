---
id: doc-11
title: Fallow CLI v3.20.0 config schema + baseline mechanics (TASK-40)
type: other
created_date: '2026-08-28 16:47'
updated_date: '2026-08-28 16:47'
---
# Fallow CLI v3.20.0 — config schema + baseline mechanics

Evidence-grounded (docs.fallow.tools + github.com/fallow-rs/fallow README + schema.json + npm registry). No CLI was run during planning. All claims cite a primary source.

## Config file
- Formats: `.fallowrc.json` (JSONC, comments ok), `.fallowrc.jsonc`, `fallow.toml`, `.fallow.toml`. Discovery is first-match-wins per directory, walking up to workspace root. Per-package configs supported. (docs.fallow.tools/configuration/overview)
- Config MAY also be authored under the `fallow` key of `package.json`.
- **`additionalProperties: false`** — unknown keys are REJECTED at load ("typos fail loud"). Every key we commit must be a documented schema key. (schema.json)
- `fallow init` generates `.fallowrc.json` = `{ "$schema": "...", "rules": {} }`, auto-detects TS/monorepo/frameworks, and **adds `.fallow/` to `.gitignore`**. `--agents` scaffolds AGENTS.md, `--hooks` a pre-commit hook. (docs.fallow.tools/cli/init)

## Top-level documented keys (subset relevant here)
`$schema`, `extends`, `entry`, `ignorePatterns`, `ignoreFindings`, `framework`, `workspaces`, `ignoreDependencies`, `ignoreExports`, `duplicates`, `similarCode`, `health`, `typeAware`, `rules`, `production`, `dynamicallyLoaded`, `overrides`, `publicPackages`, `regression`, `audit`, `sealed`, `cache`, ... (full list in schema.json `properties`).

### `ignorePatterns` (THE exclusion key — not `ignore`/`exclude`)
- Array of project-root-relative glob patterns; **unioned with built-in defaults**, not replacing them.
- Built-in defaults already exclude: `**/node_modules/**`, `**/dist/**`, `build/**`, `**/.git/**`, `**/coverage/**`, `**/*.min.js`, `**/*.min.mjs`, `**/*.min.cjs`, `**/*.bundle.js`.
- `!`-negation is documented for `ignoreFindings` and `--workspace` but **UNDOCUMENTED for `ignorePatterns`** — do not rely on it.
- So we only ADD non-obvious generated/vendored dirs (e.g. `plugins/plannotator/generated/**`, `.codesight/**`).

### `production`
- boolean or per-analysis object `{ deadCode, health, dupes }`. Excludes test/spec/story/dev files from discovery and forces `unused-dev-dependencies`/`unused-optional-dependencies` to off. TASK-40 asks for production mode → `production: true`.

### `entry`
- Additional entry-point globs. Fallow auto-detects entries from `package.json` main/module/bin/exports + framework plugins. TUNING KNOB: if the initial scan flags real plugin entry exports as dead, add explicit `entry` globs for those packages.

## `audit` object (exact keys)
| key | type | default | meaning |
| --- | --- | --- | --- |
| `gate` | `"new-only"`\|"all" | `"new-only"` | which findings drive the verdict |
| `css` | boolean | `true` | include styling analytics in audit (`false` = `--no-css`) |
| `cssDeep` | boolean | `true` | project-wide CSS reachability pass |
| `deadCodeBaseline` | path | — | dead-code baseline file |
| `healthBaseline` | path | — | health/complexity baseline file |
| `dupesBaseline` | path | — | duplication baseline file |
| `cacheMaxAgeDays` | number | 30 | base-snapshot worktree GC window |
| `typeAware` | boolean\|null | — | type-aware analysis |

- **There is NO `base` key** — the base ref is set ONLY via the `--base` CLI flag or `FALLOW_AUDIT_BASE` env (the justfile already does this).
- **No global "disable all CSS" key** — the only CSS toggles are `audit.css`/`audit.cssDeep`. "CSS off" = `audit.css: false` (+ `cssDeep: false`). Dead-code CSS-module class tracking is automatic with no documented disable.

## Baseline mechanics (CRITICAL)
- Captured with the **`--save-baseline <PATH>`** flag on the standalone commands:
  `fallow dead-code --save-baseline fallow-baselines/dead-code.json`, `fallow health --save-baseline .../health.json`, `fallow dupes --save-baseline .../dupes.json`. (docs.fallow.tools/cli/audit)
- **The current justfile `fallow-baseline` recipe is WRONG**: it uses `npx fallow <cmd> --format json > file` (stdout redirect of the report), which is NOT the `--save-baseline` fingerprint format. This must be fixed to `--save-baseline` or the baselines will not suppress anything.
- Committed baselines MUST be stored **outside `.fallow/`** (`fallow init` gitignores `.fallow/` for machine-local cache). `fallow-baselines/` is outside it. ✔
- Consumption: findings present in the baseline are EXCLUDED from the audit verdict (suppression list). Baselines are a no-op if unset; any subset allowed; CLI flags override config.
- **`fallow audit` REJECTS global `--baseline`/`--save-baseline` (exit 2)** — the three sub-analyses use incompatible formats. Audit consumes baselines via the per-analysis config keys or `--dead-code-baseline`/`--health-baseline`/`--dupes-baseline` flags. Since the justfile passes no baseline flags, the config keys are the ONLY path.
- **Ratchet semantics are safe**: a baseline entry that is later FIXED (no longer a finding) is just an unused suppression entry — it does not turn the gate red. The gate fails only on NEW findings absent from the baseline. So capturing baselines from current main (AC2-literal) and then fixing findings is safe; optionally re-run `just fallow-baseline` to ratchet the frozen set down.

## audit / gate
- `fallow audit --base <REF>`: REF is a git ref; alias for `--changed-since`. Changed files = `git diff --name-only <base>...HEAD` (three-dot). "New" = findings whose structural key did not exist at the base ref (audit re-runs analyses at base via a temp git worktree and compares structural issue keys).
- `--gate new-only` (default): fail only on findings introduced by the changeset; inherited findings reported with `introduced: false`. `--gate all`: fail on every finding in changed files. Precedence: CLI flag > config > MCP > default.
- **Requires a git repo** (exit 2 "not a git repo"). jj colocates with git so a git repo exists — BUT `--base main` requires `main` to resolve as a **git ref** in the jj workspace. If `main` is only a jj bookmark without a git ref, `git diff main...HEAD` hard-errors. TOP RISK — worker must verify base-ref resolution in the jj workspace.
- Exit codes: 0 = clean or verdict pass/warn; 1 = findings/verdict fail (normal); 2 = validation/runtime error. `--quiet` is real (`-q`, suppresses stderr progress).
- Verdict: pass→0, warn→0, fail→1, error→2.

## Monorepo (bun workspaces)
- Workspaces auto-detected from `package.json` `workspaces` field (ezxomp = `["plugins/*"]` → all 15 plugins auto-covered by one root config). `workspaces.patterns` is additive (not needed).
- Cross-package imports resolve through node_modules symlinks (canonicalized to real source); tsconfig path aliases per workspace honored.
- Gotcha: unused-dependency findings can carry `used_in_workspaces` (unused in declaring workspace but imported elsewhere = placement issue, not auto-remove).

## Which command finds what
- `fallow dead-code` (alias `check`): unused files/exports/types/deps, unresolved imports, **circular dependencies + re-export cycles** (NOT health), boundary/policy violations, stale suppressions. Flags: `--circular-deps`, `--production`, `--baseline/--save-baseline`, `--fail-on-issues`.
- `fallow dupes`: cross-file copy-paste via suffix-array; modes strict/mild(default)/weak/semantic. Skips framework output + test/mock by default.
- `fallow health`: complexity (cyclomatic/cognitive/CRAP), per-file scores, churn hotspots, refactoring targets. **Circular deps are NOT here** (they're in dead-code). `--css` opt-in.
- `fallow` (bare): full pipeline (dead code + duplication + health). The justfile `fallow-scan` uses this (not a gate).

## Engine / runtime
- npm `fallow` v3.20.0, MIT, `engines.node >= 22`. The analyzer is a native binary (no TS compiler/Node needed for analysis; Node only for the npx launcher). Platform binaries via optionalDependencies.
- Zero-install path = `npx fallow`. **RISK**: npx requires a Node >= 22 binary on PATH and network on first fetch. The repo is bun-managed (`engines.bun >= 1.3.14`) — verify a Node >= 22 is available for `npx fallow`.
- Caching: xxh3 incremental parse cache (default `.fallow/cache.bin`, 256MB cap), dupes token cache, audit base-snapshot worktree cache (30d GC). Deterministic: same input → same output/stable fingerprints.
- `fallow` is NOT in package.json deps/devDeps — invoked via `npx` (no manifest change needed).

## Proposed `.fallowrc.json` (all keys documented; additionalProperties:false-safe)
```json
{
  "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
  "production": true,
  "ignorePatterns": ["plugins/plannotator/generated/**", ".codesight/**"],
  "audit": {
    "gate": "new-only",
    "css": false,
    "cssDeep": false
  }
}
```
NOTE: ship WITHOUT the three `audit.*Baseline` keys first (slice a, gate green with no baseline files), then ADD them once `fallow-baselines/` exists (slice b). A config pointing at a missing baseline file may hard-error (UNDOCUMENTED) — do not reference baselines before they exist. `ignorePatterns` list is a starting point; the worker confirms the full generated/vendored set during triage.
