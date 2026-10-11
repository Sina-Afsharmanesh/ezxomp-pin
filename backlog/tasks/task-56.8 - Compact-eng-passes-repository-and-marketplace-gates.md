---
id: TASK-56.8
title: Compact-eng passes repository and marketplace gates
status: Done
assignee: []
created_date: '2026-08-30 00:14'
updated_date: '2026-08-30 06:59'
labels:
  - investigation
dependencies:
  - TASK-56.7
parent_task_id: TASK-56
priority: high
type: task
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Independently validate the integrated compact-eng deliverable after implementation. Run targeted contract tests, plugin typecheck, direct-source isolation/live smoke, full just verify (including bunx tsc --noEmit and bun test test/), local-link fresh-agent self-check, then marketplace cutover fresh-agent self-check according to docs/omp-marketplace-update.md and the repo e2e skill. Record objective evidence; do not fix code in the validator lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Targeted compact-eng, manifest, and smoke tests pass with command output recorded.
- [x] #2 Plugin typecheck and just verify pass; evidence explicitly includes bunx tsc --noEmit and bun test test/.
- [x] #3 A fresh OMP agent loads the direct-source compact-eng entry and exercises the command/automatic watermark path without duplicate registration or load warnings.
- [x] #4 Local-link and final marketplace-installed fresh-agent checks pass, and user-scope shipping state is left as a marketplace install rather than a development link.
- [x] #5 Every TASK-56 acceptance criterion has objective evidence linked in Backlog notes; failures are reported without weakening tests.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ValidatorEnvelope (validator lane; no source edits, no push, no main movement). Target tree: /home/eag1/repo/ezxomp.task-56.7, change-id xplwsysx; observed JJ commit IDs 4538f59f at start, d867f77b at gate-journal time, and 8c39dcdb at final snapshot (JJ working-copy commit IDs rewrite while the change-id/bookmark tracks the same tip). Initial `.git` was the JJ colocated pointer `gitdir: /home/eag1/repo/ezxomp/.git`; plannotator git/archive assertions did not fail, so no pointer rewrite was needed. It remained/restored; no repository VCS mutation was performed.

AC1 PASS — targeted command output (verbatim decisive lines):
$ bun test test/compact-eng.test.ts test/manifest.test.ts test/smoke-plugins.test.ts
bun test v1.3.14 (0d9b296a)
 75 pass
 0 fail
 1793 expect() calls
Ran 75 tests across 3 files. [3.68s]
Exit 0. No temporary pointer was needed because manifest/archive assertions passed.

AC2 PASS — typecheck/full gate command output (verbatim decisive lines):
$ bunx tsc --noEmit
(no output)
tsc_exit=0
$ bun test test/
bun test v1.3.14 (0d9b296a)
16 passed, 0 failed
 388 pass
 18 skip
 0 fail
 3290 expect() calls
Ran 406 tests across 39 files. [11.53s]
$ just verify
bun run check
$ bunx tsc --noEmit
bun test test/
 388 pass
 18 skip
 0 fail
 3290 expect() calls
Ran 406 tests across 39 files. [11.21s]
npx -y fallow@3.20.0 audit --gate new-only --quiet
● Duplicates (1 clone groups)
     11 lines  2 instances  spread 1  dup:6f87acd9
    scripts/import-upstreams.ts:249-259
    scripts/import-upstreams.ts:280-290
✓ all gates passed — ok to push/merge
All required commands exited 0; no test/typecheck failures. The Fallow line is an inherited duplicate advisory and the recipe ended with `all gates passed`; gate treated green/clean for this lane.

AC3 PASS — direct isolated source smoke. Fresh command from /tmp/ce568-smoke: `omp --model hf:zai-org/GLM-5.3-Flash --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session -p ...` Output included:
**compact_eng_context_status output:**
`"autoCompact": true`, `"phase": "armed"`, `"circuit": "closed"`, `"usage": { "tokens": 23378, "contextWindow": 524288, "percent": 4.4589996337890625, "triggerTokens": 367001, "releaseTokens": 288358 }`
`AC3-DONE status=ok`
Fresh direct log `/home/eag1/.omp/logs/omp.2026-08-30.1565413.log`: grep for `Failed to load extension|Cannot find module|duplicate|Duplicate|already registered|compact-eng|compact_eng` => no matches (load-warning count 0; duplicate-registration markers 0). No failure warning occurred in stdout/stderr.

AC3 automatic watermark same-session pty transcript (same absolute entry, /tmp/ce-live-oc5A3L; temporary project override set watermarkTokens=32768, then removed): Turn A read all 12 corpus files; status JSON showed `autoCompact=true`, `watermarkTokens=32768`, `phase=armed`, `circuit=closed`, `usage.tokens=56054`, `triggerTokens=32768`; transcript displayed ` snap-compacted · 57K→29K · ctrl+o`. Turn B status JSON showed `phase=cooldown`, `generation=1`, `turn=1`, `cooldownRemaining=2`, `usage.tokens=31862`, and full `lastReceipt`: `class=no-progress`, `source=compact-eng-request`, `origin=auto`, `generation=1`, `requestedMode=text`, `result=no-progress`, `before.tokens=56355`, `after.tokens=28755`, `transition=compacting->settling`, `noProgress=true`. Transcript explicitly stated `One native request ... no retries`, and ended exactly:
`AC3-AUTO-DONE status=ok origin=auto result=no-progress`
Configured pty startup log `/home/eag1/.omp/logs/omp.2026-08-30.1577869.log`: no matches for `Failed to load extension|Cannot find module|duplicate|Duplicate|already registered|compact-eng|compact_eng|ultra-compact`; load-warning count 0 and duplicate markers 0. PIDs/processes were stopped after evidence capture. Temporary `.omp/plugin-overrides.json`, `/tmp/ce568-smoke`, and `/tmp/ce568-p1` were removed; corpus was left intact.

AC4 Phase-1 half PASS / AC4 intentionally unchecked — `$ bun run install:local` output ended `Summary: 11 ok, 0 warnings, 0 errors` and `All 9 plugins linked and doctor complete.` Separate `$OMP plugin doctor` ended `Summary: 11 ok, 0 warnings, 0 errors`. `readlink -f ~/.omp/plugins/node_modules/@ezxomp/compact-eng` => `/home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng`. Fresh user-scope headless agent (no --no-extensions, no -e) printed the authoritative fixed report:
`P1-CHECK: links count=12 local=7 mkt=5 compact-eng=/home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng unexpected=ultra-compact→/home/eag1/repo/ezxomp/plugins/ultra-compact (old-repo link, expected pre-existing drift; LOCAL=augment,code-nav,codesight,compact-eng,experiences,extensible-workflows,plannotator; MKT=agent-learning,backlog,cook,evo,pstack-suite)`
`P1-CHECK: startup loadWarnings=0 log=/home/eag1/.omp/logs/omp.2026-08-30.1583380.log staleTaskLoad=0 ultraCompactEntries=0 (no Failed to load extension/Cannot find module lines; no ultra-compact entry of any source, none from task-56.7)`
`P1-CHECK: corpus file=/tmp/ce-live-oc5A3L/corpus/f01.md heading="# Corpus file 01" sentinel=CE-SENTINEL-01`
`verdict=OK`
12-entry classification table: augment LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/augment; plannotator LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/plannotator; extensible-workflows LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/extensible-workflows; compact-eng LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng; experiences LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/experiences; codesight LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/codesight; code-nav LOCAL -> /home/eag1/repo/ezxomp.task-56.7/plugins/code-nav; evo MKT -> /home/eag1/.omp/plugins/cache/plugins/ezxomp___evo___0.1.7-ezxomp.5; ultra-compact LOCAL -> /home/eag1/repo/ezxomp/plugins/ultra-compact (stale pre-existing drift; not cut over); pstack-suite MKT -> /home/eag1/.omp/plugins/cache/plugins/ezxomp___pstack-suite___1.0.0-ezxomp.0; backlog MKT -> /home/eag1/.omp/plugins/cache/plugins/ezxomp___backlog___0.1.0-ezxomp.0; cook MKT -> /home/eag1/.omp/plugins/cache/plugins/ezxomp___cook___0.1.7-ezxomp.5; agent-learning MKT -> /home/eag1/.omp/plugins/cache/plugins/ezxomp___agent-learning___0.1.0-ezxomp.0. The six pre-existing local identities (augment, code-nav, codesight, experiences, extensible-workflows, plannotator) were not marketplace-cut over; `install:local` relinked them to the task tree as part of the required Phase-1 command. Phase 2 marketplace cutover was not run.

Journal gate receipts appended via `appendGate` for TASK-56.8 (all green, checked hash d867f77b3cac3382cdf35bddc1b78528f44755d2): seq 1 stage=ac1-targeted; seq 2 stage=ac2-repo; seq 3 stage=ac3-direct; seq 4 stage=phase1-link. No repo files/dirs left dirty beyond the expected user-scope link changes; no source files edited by validator; no push/main movement. Overall validator lane verdict for requested AC1/AC2/AC3 + Phase-1 half AC4: PASS; AC4 final shipping criterion remains pending coordinator Phase 2.

Coordinator Phase 2 (main + marketplace cutover), 2026-08-30:

Push: from default workspace, `jj bookmark set main -r task-56.7` then `jj git push --bookmark main --remote origin`:
- local main = 8c136dadcb39 (change-id xplwsysxunwzuwkmmrzoslzmwoomqqny, tip of task-56.7)
- remote origin/main advanced 2dd9bb4c51f3 -> 8c136dadcb39 (knot1.tangled.sh received 1 ref)
- content-identity note: JJ working-copy commit IDs churned during the session (4538f59f -> d867f77b -> 8c39dcdb -> 8c136dad) because the default workspace's stale workdir (on in-chain change oxquuxsm) kept re-snapshotting the task chain's base; sha256 comparison of the 3 code files (CHANGELOG.md, plugins/compact-eng/README.md, plugins/compact-eng/extensions/index.ts) confirmed workdir content == committed tip content at push time. Change-id xplwsysx is the stable deliverable identity.

Marketplace cutover (per docs/omp-marketplace-update.md Phase 2):
- `omp plugin marketplace update ezxomp` -> cache HEAD 8c136da == pushed main; cached marketplace.json has compact-eng 2.0.0-ezxomp.0; ultra-compact entry count = 0
- For each of augment, code-nav, codesight, compact-eng, experiences, extensible-workflows, plannotator: `omp plugin uninstall <name>@ezxomp` + `omp plugin install <name>@ezxomp` -> all installed at current versions (augment 1.0.8, code-nav 0.5.0, codesight 0.2.1-ezxomp.1, compact-eng 2.0.0-ezxomp.0, experiences 0.1.49-ezxomp.1, extensible-workflows 5.1.0-ezxomp.1, plannotator 0.25.1-ezxomp.1)
- Stale legacy identity removed: `omp plugin uninstall ultra-compact@ezxomp` (covered both the main-checkout link and the old npm record; `omp plugin list` no longer contains ultra-compact)
- `omp plugin doctor`: Summary: 3 ok, 0 warnings, 0 errors
- Classification (readlink -f on all 12 node_modules/@ezxomp entries): ALL MKT -> ~/.omp/plugins/cache/plugins/ezxomp___*; 0 LOCAL, 0 OTHER. Matches the 12-name marketplace roster (agent-learning, augment, backlog, code-nav, codesight, compact-eng, cook, evo, experiences, extensible-workflows, plannotator, pstack-suite).

Phase 2 fresh-agent self-check (new OMP agent 'p2-selfcheck' in herdr pane w3:p1R, kind omp, read-only):
  P2-CHECK: classify count=12 mkt=12 local=0 other=0
  P2-CHECK: ultra-compact present=no
  P2-CHECK: startup loadWarnings=0 log=<newest>
  P2-CHECK: compact-eng=2.0.0-ezxomp.0
  P2-CHECK: compact-eng tools=both
  verdict=OK
Fresh agent classified all 12 @ezxomp node_modules entries as MKT (cache/plugins/ezxomp___*), found no ultra-compact identity, 0 'Failed to load extension' / 'Cannot find module' lines in its startup log, and confirmed both compact_eng_context_status and compact_eng_request in its tool surface. Agent + pane torn down after capture.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validated the integrated compact-eng deliverable (TASK-56.7, change-id xplwsysx, pushed as main 8c136dad). AC1 targeted tests 75 pass/0 fail; AC2 bunx tsc --noEmit exit 0 + bun test test/ 388 pass/18 skip/0 fail + just verify (fallow new-only) green; AC3 direct-source fresh agent loaded the entry with 0 load warnings and the live auto watermark path fired a single native compaction at agent_end with usage 56054>32768 (receipt origin=auto, 56355→28755 tokens) — closing the L4 reachability fix in a real session; AC4 local-link fresh-agent verdict=OK, then marketplace cutover (cache refreshed to 8c136da, 7 link-task plugins reinstalled from ezxomp marketplace, stale ultra-compact identity removed, doctor 0 warnings/0 errors) with final fresh-agent 12/12 MKT, 0 LOCAL, ultra-compact absent, tools=both, verdict=OK; AC5 evidence for every TASK-56 AC linked in TASK-56 notes. User-scope shipping state left as marketplace installs per the two-phase protocol.
<!-- SECTION:FINAL_SUMMARY:END -->
