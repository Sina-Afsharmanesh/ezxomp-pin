# OMP Marketplace Install / Update Protocol

Two-phase protocol for getting plugin changes from the repo working copy into the
user-scope OMP installation (`~/.omp/plugins`). Single source of truth for how OMP
plugin installs are verified and shipped.

## Invariant (shipping state)

The final user-scope install must be **marketplace installs**
(`~/.omp/plugins/node_modules/@ezxomp/<name>` -> `~/.omp/plugins/cache/plugins/ezxomp___<name>___<version>`).
`omp plugin link` (repo symlink) is a **development-phase test vehicle only** and must
be replaced by the matching marketplace install before work is complete.

**Exception rule:** a plugin that is not in the marketplace (`.omp-plugin/marketplace.json`)
cannot be installed from it and must stay link-local. As of TASK-47 (2026-08-28) every
plugin in the repo is registered — including `pstack-suite` — so no plugin is
exception-linked today; any future non-marketplace plugin must be documented here.

**Why:** a link and a marketplace copy can coexist for the same plugin (double
registration), and a link masks the shipped tree — load failures that only manifest
under the marketplace layout (e.g. the 2026-08-28 cook `js-yaml` cross-plugin import
failure) are invisible to link-local sessions and the coordinator.

## Phase 1 — develop, test via local link, commit + push

1. Make the change in the repo. `just verify` must be green.
2. Install the working tree as links:
   - `bun run install:local` (links the 9 script-managed plugins)
   - explicit link for the rest: `omp plugin link plugins/<name> --scope user`
     (evo, cook, backlog, pstack-suite, agent-learning — see `scripts/install-local.ts`).
   - `omp plugin doctor` -> 0 warnings / 0 errors.
3. **Commit + push to main** (`git commit -s` on the task branch; coordinator merges and
   runs `git push origin main`; confirm with `git ls-remote origin refs/heads/main`).
   **Rule:** verified work must be committed and pushed BEFORE Phase 2 — the
   marketplace installs from origin, not from the working tree.
4. **Verify with a fresh OMP agent** (mandatory, see Reporting contract):
   spin up a fresh `omp` agent (kind **omp**, never pi) in a Herdr pane —
   ```bash
   herdr pane split --current --direction right --cwd "$PWD" --no-focus
   herdr agent start <name> --kind omp --pane <pane-id> --timeout 60000
   herdr agent prompt <name> "<report-back contract + checks>"
   herdr agent wait <name> --until idle --timeout 120000
   herdr agent read <name> --lines 120
   ```
   The agent classifies its own install (LOCAL vs MKT per symlink target), probes the
   change (e.g. the vendored module import), and scans its own startup log for
   `Failed to load extension` / `Cannot find module`.
   **No Herdr available?** test in a separate terminal with a fresh `omp` session;
   the agent must still print the report and it must be captured.
   Pass condition: all checks PASS and the agent's verdict line is present.

## Phase 2 — cutover to the shipping state (marketplace install)

1. Refresh the marketplace cache from origin:
   `omp plugin marketplace update ezxomp`
   Verify: `git -C ~/.omp/plugins/cache/marketplaces/ezxomp log --oneline -1`
   matches the pushed main, and the cached `marketplace.json` carries the new version.
2. For every link-local plugin that exists in the marketplace:
   - `omp plugin uninstall <name>@ezxomp` (removes the link + lock entry)
   - `omp plugin install <name>@ezxomp` (fresh cache copy at the current version)
   (If a marketplace install of the current version already exists,
   `omp plugin upgrade <name>@ezxomp` is the equivalent move.)
   If any plugin has no marketplace entry it stays linked and is documented in the invariant section; as of TASK-47 none do.
3. `omp plugin doctor` -> 0 warnings / 0 errors.
4. **Verify with a fresh OMP agent** (mandatory, same Reporting contract).
   Pass condition: every marketplace plugin classifies as **MKT**, the pstack-suite
   exception classifies as LOCAL, all change-specific probes PASS, zero extension
   load errors in the agent's startup log.
5. **Leave everything as-is.** Do not re-link, do not uninstall, do not "tidy".
   The marketplace install IS the deliverable state.

## Reporting contract (mandatory for every fresh-agent verification)

Every fresh OMP agent prompt MUST contain, verbatim in substance:

1. **Scope:** READ-ONLY — do not edit, create, delete, install, or configure anything.
2. **Checks:** the specific probes for the change under test (install-source
   classification via `readlink -f` on each `~/.omp/plugins/node_modules/@ezxomp/*`
   entry; the change-specific probe; startup-log scan for load failures).
3. **Report format:** one line per check, exact prefix (e.g. `P1-CHECK: ...`),
   plus a final `verdict=<OK|FAIL>` line with the offending line on FAIL.
4. **Signal back:** after printing the report, run
   `herdr notification show "<agent-name> done" --body "<one-line verdict>"`.
   The printed report in the agent's own terminal is the authoritative channel;
   the notification only signals completion.
Coordinator: `herdr agent wait <name> --until idle --timeout 120000`
(give the surrounding eval a timeout >= 180 s), then
`herdr agent read <name> --lines 120`. Never start the next phase on a blind timer.

## Gotchas

- `omp plugin install <local-path>` **fails** — install only accepts
  `name@marketplace` targets; use `link` for local trees.
- `omp plugin uninstall <name>@ezxomp` is the uninstall form (name@marketplace),
  including for linked plugins.
- A running OMP session keeps its session-start plugin set; only a **fresh**
  session sees the new install state — which is exactly why verification uses
  a fresh agent, never the coordinator's own session.
- `bun` is NOT on the default node bin path in this environment:
  `export PATH=$HOME/.local/share/mise/installs/bun/1.3/bin:$PATH`.
- `omp` lives at `~/.local/share/mise/installs/github-can1357-oh-my-pi/latest/omp`.
