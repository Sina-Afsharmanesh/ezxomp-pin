---
name: ezxomp-plugin-e2e-test
description: "End-to-end test an ezxomp OMP plugin from working tree to verified install. Use when validating a plugin change: direct-source isolated live smoke with `omp --no-extensions -e`, just verify, local-link install, fresh OMP agent self-check, commit/push main, marketplace install, and fresh OMP agent re-check. Includes a detailed Herdr method, report sentinels, and observed lifecycle gotchas."
---

# End-to-End Plugin Testing (ezxomp)

How to validate an OMP plugin change in this repo, from working tree all the way to a
verified user-scope install. This is the operational runbook. The invariant (shipping
state = marketplace install) and the full rationale live in `docs/omp-marketplace-update.md`;
parallel work rules in `docs/parallel-agents.md`. Load this skill before running a plugin
e2e test so you do not rediscover the gotchas.

The release test has two install halves, each with its own fresh-OMP-agent self-check.
Before either install, run a third, **direct-source isolated live smoke**. It proves that
the current source registers and behaves correctly without accidentally loading the
marketplace copy:

    [repo] working tree
      |  1. just verify (type-check + full test suite)
      v
    [source] omp --no-extensions -e /absolute/path/to/extensions/index.ts
      |  2. fresh OMP live smoke: main tool + optional real subagent
      v
    [install A]  omp plugin link  (repo symlink)        <- Phase 1 dev test
      |  3. fresh OMP agent self-check #1  (report-back)
      v
    [git]    commit + push main
      v
    [install B]  marketplace install  (cache copy)      <- Phase 2 shipping state
      |  4. fresh OMP agent self-check #2  (report-back)
      v
    [done]   leave install as-is (marketplace)

**Why two installs:** a link-local install and a marketplace install are different on-disk
layouts. A bug that only appears under the marketplace flat-cache layout (for example a
cross-plugin relative import that escapes the package boundary) is invisible to a
link-local session. You must verify under BOTH layouts - that is the whole reason the e2e
test has two self-checks.

## 0. Environment (get these paths first)

    # bun is NOT on the default node bin path here
    export PATH="$HOME/.local/share/mise/installs/bun/1.3/bin:$PATH"
    OMP="$HOME/.local/share/mise/installs/github-can1357-oh-my-pi/latest/omp"
    # herdr (only if HERDR is available to you - see section 8)
    test "$HERDR_ENV" = 1 && echo "in a herdr pane" || echo "not in herdr"

- `bun` = `$HOME/.local/share/mise/installs/bun/1.3/bin/bun`
- `omp` = `$HOME/.local/share/mise/installs/github-can1357-oh-my-pi/latest/omp`
- Git is the repository workflow authority. Workers commit on `task/<slug>` branches;
  coordinator merges and pushes `git push origin main` (workers never push - see parallel-agents).
- `omp plugin doctor`, `omp plugin list`, `omp plugin marketplace ...` all need `$OMP` on PATH.

## 1. Pre-flight gate - the repo must be green

Before touching any install, the working tree must pass the repo gate:

    just verify          # = just check (bunx tsc --noEmit) + just test (bun test test/)

Both must pass. If `just verify` is red, fix the repo first - do not test an install of a
broken tree. (The only acceptable reds are the small set of documented intentional-RED
driver tests in `test/workflowz-p3-polish.test.ts` for OPEN tasks; everything else red
is a blocker.)

## 2. Direct-source isolated live smoke — test this working tree, not an install

Run this gate before changing user-scope plugin installs. It is the fastest way to prove
that the extension entrypoint in the current working tree loads, registers its tools, and
can drive real OMP behavior.

### What “isolated” means

Launch a fresh OMP process with:

```bash
omp --no-extensions -e /absolute/repo/path/plugins/<name>/extensions/index.ts
```

- `--no-extensions` disables normal plugin discovery, including the marketplace copy,
  user links, and unrelated plugins.
- `-e <absolute-entrypoint>` explicitly loads exactly the source extension under test.
- Use an **absolute** `-e` path. The smoke agent may run from a disposable cwd.
- This isolates **extension discovery**, not arbitrary extension side effects. A
  `session_start` hook may still write files, refresh profiles, or inspect `$OMP_HOME`.
  For Cook, startup can refresh Cook profiles. Decide whether that side effect is part of
  the test; otherwise launch with a disposable cwd and, when the agent can still
  authenticate, a disposable `OMP_HOME`.

**Host-package import rule (isolation):** under `-e` isolation the entrypoint is loaded
from a path outside the installed plugin layout, so a **top-level value import** of a
host package specifier (e.g. `import { PluginManager } from
"@oh-my-pi/pi-coding-agent/extensibility/plugins"`) can fail to resolve even when the
same entry works in an installed layout — and the failure **silently unregisters the
whole extension** (OMP logs `Failed to load extension ... Cannot find package ...`, the
session still starts, and every tool/command/hook the plugin registers is simply
absent). Reproduced 2026-08-30 on the compact-eng live smoke: the failure was
cwd-independent and only visible in the startup log, not in the agent's tool surface.
Keep host imports lazy: `import type` at top level is fine; for values use
`await import(...)` / `import(...).then(...)` at first use inside a `catch` fallback so
registration never depends on it. Treat "the plugin's tools are missing" in an isolated
smoke as a load failure to grep for in the startup output FIRST, not a registration bug.

Do **not** use this form:

```bash
omp --no-extensions --plugin-dir /path/to/plugins/<name>
```

Observed behavior: `--no-extensions` suppresses directory discovery, so `--plugin-dir`
does not prove that the local plugin loaded. OMP starts successfully but the expected
`cook_*` tools are absent. Explicit `-e` remains active under `--no-extensions` and is
the correct isolation mechanism.

This direct-source gate does **not** replace link-local and marketplace verification.
It does not reproduce either installed layout, especially marketplace flat-cache module
resolution.

### Choose a clean working directory

If the probe calls only read-only tools, the repo cwd is acceptable. If the plugin tool
writes journals or state as part of normal operation, use a disposable cwd:

```bash
REPO="$(pwd -P)"
SMOKE_ROOT="$(mktemp -d)"
mkdir -p "$SMOKE_ROOT"
ENTRY="$REPO/plugins/<name>/extensions/index.ts"
```

Cook dispatch tools append `.cook-journal` lifecycle evidence even when the spawned
specialist itself is read-only. Run Cook dispatch/subagent probes from `SMOKE_ROOT`, or
delete only the exact smoke artifacts you created afterward. Never leave
`SMOKE-*` journal files or a smoke-generated `.dagr/run.json.tmp` in the repository.

### Required live probes

Tailor names to the plugin, but preserve these layers:

1. **Main extension call:** invoke one registered plugin tool directly. For Cook,
   `cook_status` must return valid state rather than “tool not found”.
2. **Tool registration:** verify every new/changed tool is present. Prefer invoking a
   harmless tool. If no harmless call exists, inspect the fresh agent's registered tool
   surface.
3. **Changed behavior:** exercise the exact contract changed, not merely source text.
4. **Optional real subagent path:** for orchestration changes, call the plugin's dispatch
   tool, execute the returned native `task` payload, wait for the child result, and verify
   that the child terminates through its required `yield` call.
5. **Version/source proof:** read a version constant or another deterministic value from
   the absolute repo source and include it in the report.

For Cook, a good prompt body is:

```text
Live read-only verification. Do not edit source files, install plugins, change
configuration, or update Backlog task status/ACs.

This session was launched with:
  --no-extensions -e <absolute Cook extensions/index.ts>

1. Call cook_status. Do not substitute bash.
2. Verify the changed cook tools are registered.
3. Call cook_dispatch_scout for one exact read-only fact using a unique SMOKE task id
   and the absolute repo file path as scope (the agent cwd may be disposable).
4. Execute the returned native task payload. Wait for the cook-scout result and verify
   that it terminated normally through yield.
5. Read COOK_AGENTS_VERSION from the absolute repo agents.ts.

Print one final line whose prefix is formed by concatenating `E2E_` and `DONE:`:
  E2E_DONE: MAIN=<PASS|FAIL> TOOLS=<PASS|FAIL>
  SUBAGENT=<PASS|FAIL> VERSION=<value>
```

The split-token wording is intentional: the literal `E2E_DONE:` is absent from the
prompt shown in terminal scrollback, so `herdr pane wait-output --match "E2E_DONE:"`
cannot immediately match the prompt itself.

**Pass =** the main call succeeds, changed tools exist, the changed path behaves as
specified, any required child reaches terminal `yield`, and the version/source proof
matches the working tree.

### Herdr execution — exact live method

Herdr may be used only when the coordinator is already inside Herdr:

```bash
test "${HERDR_ENV:-}" = 1
printf '%s\n' "$HERDR_WORKSPACE_ID" "$HERDR_TAB_ID" "$HERDR_PANE_ID"
```

Prefer a sibling pane in the current tab:

```bash
herdr pane split --current --direction right --cwd "$SMOKE_ROOT" --no-focus
# Parse .result.pane.pane_id; do not guess it.
PANE='<returned pane id>'
NAME='cooksrcsmoke'  # lowercase, unique, <=32 chars
```

If the current tab cannot be split cleanly, create a dedicated background tab and parse
its `.result.root_pane.pane_id`:

```bash
herdr tab create \
  --workspace "$HERDR_WORKSPACE_ID" \
  --label "cook-source-smoke" \
  --cwd "$SMOKE_ROOT" \
  --no-focus
```

Verify that the returned pane is an available shell before starting the agent:

```bash
herdr pane get "$PANE"
herdr pane process-info --pane "$PANE"
```

Start a fresh OMP agent with the direct source entrypoint:

```bash
herdr agent start "$NAME" \
  --kind omp \
  --pane "$PANE" \
  --timeout 60000 \
  -- \
  --no-extensions \
  -e "$ENTRY"
```

Native OMP arguments belong after `--`. `agent start` does not create a pane.

Write the prompt to a file so shell quoting cannot corrupt it:

```bash
cat >"$SMOKE_ROOT/prompt.txt" <<'PROMPT'
<the probe prompt above, with absolute paths substituted>
PROMPT

herdr agent prompt "$NAME" \
  "$(cat "$SMOKE_ROOT/prompt.txt")" \
  --wait \
  --timeout 600000
```

Then wait on the output sentinel and read the full report:

```bash
herdr pane wait-output "$PANE" \
  --match "E2E_DONE:" \
  --source recent-unwrapped \
  --lines 400 \
  --timeout 600000

herdr agent read "$NAME" --source recent-unwrapped --lines 240
```

Do not infer completion from Herdr's state label alone. Observed with OMP:

- `herdr agent prompt ... --wait` can return `agent_prompt_stalled` after five seconds
  even though the prompt landed and OMP is visibly working.
- `herdr agent wait` can return immediately with `agent_status:"idle"` while the pane
  still shows `Working…`.
- The terminal title/state classifier may lag OMP's active turn.

On either condition, read the agent/pane. If the prompt is visible and OMP is working,
continue waiting for the unique output sentinel. Treat only the printed fixed-format
report as the gate.

If `pane wait-output` times out, inspect before retrying:

```bash
herdr agent get "$NAME"
herdr agent read "$NAME" --source recent-unwrapped --lines 240
herdr pane read "$PANE" --source recent-unwrapped --lines 400
```

Never resend the prompt blindly: that can start a duplicate dispatch/subagent. If output
is trapped on an alternate screen and cannot be recovered, ask the smoke agent to write
its complete report to a temporary Markdown file and reply only with the path.

After capturing evidence, exit only the smoke agent and close only the pane/tab you
created:

```bash
herdr agent send-keys "$NAME" ctrl+d
herdr agent wait "$NAME" --timeout 30000
```

Inspect generated files before deleting anything. Remove only `SMOKE-*` journals, temp
prompt files, and other artifacts proven to belong to this run.

### Non-Herdr direct-source execution

Use a second terminal/TTY with cwd `SMOKE_ROOT`:

```bash
omp --no-extensions -e "$ENTRY"
```

Paste the same probe prompt and capture the complete fixed-format report. A separate
terminal is equally valid evidence; Herdr is a coordination channel, not part of the
plugin contract.

## 3. Phase 1 install - local link (dev test vehicle)

Install the working tree as symlinks so a fresh OMP session loads your in-progress code
directly from the repo:

    bun run install:local                      # links the 9 script-managed plugins
    # explicit link for the rest:
    $OMP plugin link plugins/<name> --scope user   # e.g. evo, cook, backlog, pstack-suite, agent-learning
    $OMP plugin doctor                          # expect 0 warnings / 0 errors

Confirm every `@ezxomp/*` entry is a LOCAL link (target under the repo):

    for n in $(ls ~/.omp/plugins/node_modules/@ezxomp/); do
      t=$(readlink -f ~/.omp/plugins/node_modules/@ezxomp/$n)
      case $t in *repo/ezxomp*) echo "$n LOCAL";; *) echo "$n MKT";; esac
    done

**Rename gotcha:** if you renamed a package (changed `package.json` name), the OLD identity
link + lock entry do NOT disappear on their own, and `omp plugin uninstall <old>@ezxomp` can
report success while the symlink and lock entry survive. Clean it manually: remove the
symlink, then edit `~/.omp/plugins/omp-plugins.lock.json` and `installed_plugins.json` to
drop the old key. Verify with `readlink -f` + a lock-key grep before proceeding.

## 4. Fresh OMP agent self-check #1 (the heart of the test)

The coordinator's own session is NOT valid evidence - a running OMP session keeps its
session-start plugin set and cannot see the install you just changed. You MUST spin up a
**fresh** OMP agent, have it inspect its own install, and report back. HERDR is only one
way to do this - see section 8 for the non-HERDR path.

What the fresh agent must check (tailor the probes to the change under test):

1. **Classify every `@ezxomp` symlink** LOCAL vs MKT (the `readlink -f` loop above).
2. **The change-specific probe** - exercise the thing you changed through the installed
   tree. Examples: a vendored/renamed module (`bun -e "await import('<installed>/vendor/x.mjs'); console.log('OK')"`)
   or a renamed package (read its `package.json` name via bun import with `withTypes`),
   or confirm a command/agent the plugin registers is present in the fresh agent tool surface.
3. **Startup-log scan** for load failures in the fresh agent OWN log - list
   `~/.omp/logs/omp.*`, read the newest, grep for `Failed to load extension` and
   `Cannot find module`, print the count and up to 3 offending lines.

**Pass =** sources classify as expected, the change probe PASSes, and 0 extension load
errors in the agent startup log.

### The report-back contract (mandatory in the prompt)

Whatever channel you use, the fresh agent prompt MUST end with an explicit delivery
contract so the agent *tells you* it is done instead of you guessing:

1. **Scope:** READ-ONLY - do not edit, create, delete, install, or configure anything.
2. **Checks:** the numbered probes above.
3. **Report format:** one line per check with a fixed prefix (e.g. `P1-CHECK: ...`) and a
   final `verdict=<OK|FAIL>` line; on FAIL include the offending line.
4. **Signal back:** after printing the report, run `herdr notification show "<name> done"
   --body "<one-line verdict>"` **if you are in HERDR** (section 8). If not in HERDR, the
   printed report in a separate terminal / captured session IS the channel - capture it.

The printed report with the verdict line is the authoritative gate. Never advance a phase
on a blind timer alone.
## 5. Commit + push (only after self-check #1 passes)

Verified work MUST be pushed before Phase 2 - the marketplace installs from origin, not
from your working tree.

    git add <scoped-files>
    git commit -s -F /tmp/commit-msg.txt
    git switch main
    git merge --no-ff task/<slug>
    git push origin main
    git ls-remote origin refs/heads/main            # confirm it advanced

## 6. Phase 2 install - marketplace (the shipping state)

    $OMP plugin marketplace update ezxomp
    # verify cache commit == pushed main and the cached marketplace.json has the new version:
    git -C ~/.omp/plugins/cache/marketplaces/ezxomp log --oneline -1
    grep -c '<name>' ~/.omp/plugins/cache/marketplaces/ezxomp/marketplace.json

    # for each plugin under test: drop the link, install from the marketplace
    $OMP plugin uninstall <name>@ezxomp
    $OMP plugin install <name>@ezxomp
    # (or $OMP plugin upgrade <name>@ezxomp if the current version is already installed)

    $OMP plugin doctor        # 0 warnings / 0 errors

**Stale-link gotcha (recurring):** `omp plugin uninstall <name>@ezxomp` can report
success while the repo symlink + lock entry survive (observed for `@ezxomp/skills` and
for a renamed identity). After every uninstall, `ls -la node_modules/@ezxomp/` and grep
the lock; if the link survived, `omp plugin install <name>@ezxomp --force` replaces it
with the cache copy (this is the working path).

**Doctor count gotcha:** `omp plugin doctor` only deep-inspects local/npm plugins, so
after a full marketplace cutover the Summary count drops (e.g. to ~4 ok) even though all
plugins load fine. Judge by **0 warnings / 0 errors** + the fresh-agent check, not by
the ok count.

## 7. Fresh OMP agent self-check #2

Repeat section 4 against the marketplace install. Pass = every installed `@ezxomp` plugin
classifies **MKT**, the change probe PASSes through the marketplace tree, 0 load errors,
verdict present. Then **leave everything as-is** - no re-linking, no tidy-up. The
marketplace install IS the deliverable state.

## 8. HERDR is optional - only when you are inside HERDR

Use HERDR to host the fresh agents ONLY if the coordinator is itself in a HERDR pane or
workspace (`test "$HERDR_ENV" = 1`). Otherwise, run the fresh OMP agent in a **separate
terminal** (or a second TTY/session) and capture its printed report. The report-back
contract (section 4) is identical either way; only the *channel* differs.

**In HERDR** (from inside a HERDR-managed pane; never run bare `herdr`):

    herdr pane split --current --direction right --cwd "$PWD" --no-focus   # -> .result.pane.pane_id
    # VERIFY the pane is clean first (a split pane can host a running agent that hijacks the prompt):
    herdr pane list    # read the new pane terminal_title / agent_status
    herdr agent start <unique> --kind omp --pane <pane-id> --timeout 60000
    herdr agent prompt <unique> "$(cat /tmp/prompt.txt)"    # file-based for multi-line
    # wait/poll, then read the report:
    herdr agent wait <unique> --timeout 120000   # settled idle/done/blocked
    herdr pane read <pane-id> --lines 60 --source recent-unwrapped

Report-back signal inside HERDR: `herdr notification show "<name> done" --body "<verdict>"`.
HERDR gotchas:

- Multi-line prompts via `herdr agent prompt <n> "$LONG"` mangle into literal `\n` - pass
  `"(cat /tmp/prompt.txt)"` instead.
- The notification subject must be **quoted**; an unquoted multi-word subject parses a word
  as a CLI option.
- `herdr notification show` may return `{"shown": false, "reason": "disabled"}` with exit 0
  when the server has notifications off - the printed report is still authoritative; the
  signal just did not surface.
- `herdr agent wait --until working` can time out if the agent already finished -
  best-effort only; the idle wait is the gate.
- `herdr pane read` takes the pane ID as a **positional** arg, not `--pane`.

**Not in HERDR:** open a second terminal/TTY, run a fresh `omp` there, paste the same
report-back prompt (minus the `herdr notification show` line), and copy the printed report
block. That is a fully valid self-check.

## 9. Recording the result

Per repo convention, log the evidence in Backlog.md when the plugin work is tracked there:
the direct-source report, both installed-layout self-check reports (verbatim verdict
lines), the commit(s), the pushed main hash, and any gotchas hit. Update `CHANGELOG.md`
`[Unreleased]` for the plugin change. The release is not done until the direct-source
smoke and both installed-layout self-checks have recorded PASS verdicts.

## Quick reference - the gotchas

| Symptom | Cause / fix |
|---|---|
| Extension `Cannot find module ../../other-plugin/vendor/...` | Cross-plugin relative import escaping the package - invisible under link, breaks under marketplace flat-cache. Vendor the file in-package; verify under BOTH layouts. |
| Isolated `-e` smoke: session starts but ALL plugin tools/commands are missing | A top-level **value** import of a host package fails to resolve outside the installed layout; OMP logs `Failed to load extension ... Cannot find package ...` and silently unregisters the extension. Grep startup output for `Failed to load extension`; make the import a lazy `import(...)` at first use with a `catch` fallback (top-level `import type` is fine). |
| `omp --no-extensions --plugin-dir ...` starts but plugin tools are absent | `--no-extensions` suppressed directory discovery. Use an absolute explicit entrypoint: `omp --no-extensions -e /repo/plugins/<name>/extensions/index.ts`. |
| Direct-source smoke unexpectedly loads the marketplace behavior | The session was not launched with `--no-extensions`, or `-e` did not target the absolute working-tree entrypoint. Restart fresh with both flags and prove a source version constant. |
| `agent_prompt_stalled` while OMP visibly works | Herdr did not observe a lifecycle-state change within five seconds. Do not resend. Read the pane and wait for the unique report sentinel. |
| `agent wait` reports idle while pane says `Working…` | OMP/Herdr state-classifier drift. State is not the gate; wait for the fixed-format sentinel and then read the report. |
| `pane wait-output` matches immediately before work runs | The literal sentinel appeared in the prompt scrollback. Instruct the agent using split-token wording so the completed sentinel is absent from the prompt. |
| `backlog/.cook-journal/SMOKE-*.jsonl` appears | Cook dispatch itself journals lifecycle evidence. Run from a disposable cwd or remove only the exact smoke artifacts after capturing evidence. |
| `uninstall <name>@ezxomp` says OK but link/lock survive | Recurring harness quirk. `ls -la` + grep lock; fix with `install <name>@ezxomp --force` or manual `rm` + lock edit. |
| Package renamed, old identity lingers | Old link + lock key do not auto-clear; remove manually (`rm` symlink + edit lock/installed_plugins.json). |
| Doctor ok count drops after cutover | Doctor only deep-inspects local/npm plugins; marketplace plugins load fine. Judge on 0w/0e + fresh agent, not the count. |
| Fresh agent report is actually a different agent | A split HERDR pane hosted a running agent that took the prompt. Verify the pane is clean before prompting; verify the report identity. |
| Multi-line prompt becomes literal `\n` | Nested shell quoting. Pass the prompt via `"$(cat /tmp/prompt.txt)"`. |
| `bun` / `omp` not found | Set PATH to the mise install paths (section 0). |
