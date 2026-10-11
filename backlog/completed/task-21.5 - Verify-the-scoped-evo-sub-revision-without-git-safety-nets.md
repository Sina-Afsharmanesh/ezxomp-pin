---
id: TASK-21.5
title: Verify the scoped evo-sub revision without git safety nets
status: Done
assignee: []
created_date: '2026-08-22 13:07'
updated_date: '2026-08-22 15:00'
labels:
  - feature
  - refactor
dependencies:
  - TASK-21.4
parent_task_id: TASK-21
priority: high
type: task
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The plugin directory is not git-tracked, so prove the change with manual restore points, deterministic package scripts, and an isolated command cycle rather than relying on git status.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Before the first production edit, timestamped byte-for-byte backups and a manifest exist outside the plugin tree for every file that will be touched, including each of the six cook profiles
- [x] #2 The manifest comparison proves only approved /evo-sub surfaces and the six target profiles changed; the /evo registration, evoMain implementation, config main-path behavior, and native block hook match their backups
- [x] #3 The plugin-owned test and typecheck scripts both pass
- [x] #4 An isolated OMP_HOME command cycle exercises on, status or debug, and off, proving tools are eval plus hub, the marked brief appears once, and originals restore byte-for-byte
- [x] #5 Verification evidence records commands and results so it remains auditable despite the non-git tree
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
[validator EvoVal] VERIFY_PASSED gate evidence (2026-08-22). gate_hash=762a0ccd8f758089ea39bcda500768c3616f1f00dfb365c97ab3e0e4ac44899d; gate.green=true; gate.clean=true. Full package command `cd /home/egsox/.omp/omp-evo-mode && bun run test`: exit 0, 2 test files passed, 23 tests passed, 0 failed, no warning/error lines. Corrected typecheck `bunx tsc --noEmit --typeRoots ./node_modules/@types,./tests/__mocks__`: exit 0, stdout/stderr empty; bare tsconfig typeRoots remains the documented /root environment prerequisite.

[validator EvoVal] Source guard PASS: evoSub.ts has zero buildEvoMainTools refs; sanctioned buildEvoMainTools refs remain in tools.ts/evoMain.ts and unchanged /evo index import/status boundary; evo-sub handler region has no buildEvoMainTools/mainCtl refs and uses subCtl. Boundary witness baselines written and re-read at `/home/egsox/.omp/agent/evo-mode/worker-backups/TASK-21.5/witness-hashes.txt` with index.ts=74f39a7e4bb9777bbddf2ddc4e961991124614801078d8bbae449b227b9faacc, evoMain.ts=849000770a6188710c9123cf01fde5ca2e23cb576559d16b3dd097d0db02cbf1, config.ts=b047732fc1923db1fc933a7388cfbadae1ffbd56ff3d7a7e83affa76573ef200; witness file sha256=c53406083935e380f19b2a4892beeccf6c6b3386e7ca7797fafabd654fe3bfa9.

[validator EvoVal] Manifest audit PASS: every recorded worker-backup hash matches its backup bytes; immutable TASK-21.4 index.ts/substate.ts match current files. Evolution chain is continuous and scoped: TASK-21.2 tools.ts append-only builder; TASK-21.2→21.3 evoSub allowlist swap; TASK-21.3→21.4 six-profile filter + brief injection; TASK-21.4→current hydrate/deactivate recovery; extension.test.ts delta is only seedProfiles helper. Live smoke PASS via full suite command-surface coverage (on/status/debug/off); no /evo-sub invocation against live profiles.

[validator EvoVal] AC#4 final round PASS: literal isolated `OMP_HOME` cycle executed with actual exported `evoModeExtension` command seam, actual filesystem/atomic writes, and no Vitest mocks. Script: `/home/egsox/.omp/agent/evo-mode/worker-backups/TASK-21.5/omp-home-cycle/cycle.ts` (sha256 fcc5c6df2f1d6a90e451a718b24f48c94ce017e8f8dcd8142a0a36998d1a057e); raw output: `/home/egsox/.omp/agent/evo-mode/worker-backups/TASK-21.5/omp-home-cycle/raw-output.txt` (sha256 1567f527fb3c8dbed919def298d66149fadd27cc1805046192697c69bf7cffe1). Temp OMP_HOME resolved to a temp agents dir. `on` rewrote 6/6 cook profiles; each active file had exactly `tools: eval, hub` and one `<!-- evo-sub:brief:start -->` marker; custom-agent.md stayed byte-identical; state captured 6 files. `status` reported ON and allowlist size 2 across 7 profiles. `off` restored all 6 profiles byte-for-byte, left custom-agent.md unchanged, and removed state. Output ends `ASSERTIONS=PASS`, exit 0. Updated gate hash=02d80e27acaa60d3ff01f143ced6cab9d976a4523fe2a90f7280bf6a146c88d4; gate.green=true; gate.clean=true.

[validator EvoLive] REHEARSAL_PASS (2026-08-22). Pre-snapshot `/home/egsox/.omp/agent/evo-mode/live-rehearsal-pre/20260822T145723Z/`; 6 cook profiles copied byte-for-byte; custom-agent.md absent; manifest SHA256 `b3dd28c90256512240473f4b0d7c30fb117d91d6e0d301b72943c2826813a079`. Recorded config evo-mode `{main:true, sub:false}` and no pre-existing sub-state. Ran `bun /home/egsox/.omp/agent/evo-mode/live-rehearsal-pre/20260822T145723Z/live-rehearsal-cycle.ts` against real `/home/egsox/.omp` via exported `evoModeExtension` seam (no mocks); output `ASSERTIONS=PASS`: on rewrote 6/6 with tools eval,hub and one brief marker each; state captured 6; status ON/allowlist 2; off restored 6. Post-verify SHA256 equality passed for all six, state removed, config restored byte-exact. Script SHA256 `ac1a07e6d72ccad2c2d6300c072a025bf6bee982d5ec5db6d6d7c6c0ca616ce0`; raw output archived with SHA256 `7b150475cfc8f481fe7da8b949d342e1512fa60b7bee15bbe1b3af2ce23d95fd`.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: EvoLive
created: 2026-08-22 15:00
---
Live dress rehearsal completed against real profiles; no residual profile/config/state diff. Evidence and raw output archived under live-rehearsal-pre/20260822T145723Z.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Independent verification battery VERIFIED. (1) Full plugin suite bun run test -> exit 0, 23 tests / 0 fail across 2 files. (2) Typecheck -> exit 0 with corrected --typeRoots (pre-existing tsconfig /root hardcode documented as environment prerequisite). (3) /evo isolation guard: evoSub.ts has ZERO buildEvoMainTools refs; refs in tools.ts/evoMain.ts/index.ts are sanctioned boundary witnesses - recorded in worker-backups/TASK-21.5/witness-hashes.txt (index.ts, evoMain.ts, config.ts baselines; manifest sha c5340608...f4fe3bfa9). (4) AC#4 literal isolated OMP_HOME command cycle executed via the exported evoModeExtension command seam with NO mocks: on -> 6/6 cook profiles tools "eval, hub" + exactly one brief marker each + custom-agent.md byte-identical; status -> ON, allowlist size 2; off -> 6/6 byte-exact restore + sub-state removed; ASSERTIONS=PASS, exit 0. Script+raw output archived worker-backups/TASK-21.5/omp-home-cycle/ (script sha fcc5c6df..., raw sha 1567f527...). (5) Manifest chain continuity audit PASS across TASK-21.2->21.4 evolutions; gate hash 02d80e27...46c88d4 recorded, gate.green/clean true. All evidence auditable despite non-git tree.
<!-- SECTION:FINAL_SUMMARY:END -->
