---
id: TASK-58.7
title: Document and validate the durable Augment release
status: Done
assignee: []
created_date: '2026-08-31 01:01'
updated_date: '2026-08-31 04:35'
labels:
  - docs
dependencies:
  - TASK-58.2
  - TASK-58.4
  - TASK-58.5
  - TASK-58.6
parent_task_id: TASK-58
priority: high
type: chore
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the completed artifacts into user-facing documentation and release evidence: update Augment README/AGENTS contracts as needed, add CHANGELOG.md Unreleased entry, run targeted tests and just verify, then execute the ezxomp plugin e2e protocol through direct-source, local-link, and marketplace-installed fresh OMP sessions. This gate consumes all preceding deliverables.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CHANGELOG.md under Unreleased describes SMOL routing, /aug, failure handling, and research-backed durability outcome
- [x] #2 Relevant Augment documentation accurately describes /augment, /aug, smol routing, and actionable missing-model behavior
- [x] #3 bun test test/augment.test.ts test/augment-routing.test.ts and just verify pass
- [x] #4 Direct-source, local-link, and marketplace fresh-session reports prove command registration and configured-SMOL behavior with zero extension load errors; evidence is recorded on the task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
E2E evidence (ezxomp-plugin-e2e-test protocol, 2026-08-31):
1) Direct-source isolated smoke (omp --no-extensions -e plugins/augment/src/index.ts, disposable cwd /tmp/aug-e2e.6VyE8b): E2E_DONE: SMOKE=PASS — MAIN=PASS, LOAD_ERRORS=0 (newest log), VERSION=1.0.9-ezxomp.0, ROUTING=PASS, TOOLS=PASS (/augment + /aug + /augment-settings).
2) Phase 1 local-link (just install:local; augment=LOCAL repo link, 11 others MKT; plugin doctor 3 ok/0 warn/0 err): fresh-agent self-check verdict=OK — CLASSIFY local=1 mkt=11, AUG-VERSION 1.0.9-ezxomp.0, AUG-COMMANDS PASS, AUG-ROUTING PASS (@smol resolve + fail-closed notice), LOAD-ERRORS 0.
3) Phase 2 marketplace cutover (plugin uninstall augment@ezxomp + install from updated cache @7db1a99; installed copy = cache/plugins/ezxomp___augment___1.0.9-ezxomp.0; lock + doctor clean): fresh-agent self-check verdict=OK — CLASSIFY local=0 (all MKT), AUG-VERSION 1.0.9-ezxomp.0 (cache copy), AUG-COMMANDS PASS, AUG-ROUTING PASS, CACHE-TIP 7db1a99 == pushed main, LOAD-ERRORS 0.
Note: initial P1 prompt was swallowed by an auto-opened codesight status overlay in the disposable cwd (missing AGENTS.md) and a shell-metacharacter mangling of inline heredoc probes; fixed by closing the overlay and driving checks from a pre-written script with a metacharacter-free prompt. Both self-check prompts are deterministic and read-only.

AC evidence: #1 CHANGELOG Unreleased entry reviewed in docs diff (SMOL routing, /aug, fail-closed, research outcome); #2 augment README/AGENTS.md diff verified against source (exact fail-closed notice text, @smol via ctx.models.resolve, /aug alias, verification suite); #3 just verify on main @7db1a99d: 391 pass/0 fail (409 tests/40 files incl. test/augment.test.ts + test/augment-routing.test.ts), tsc clean, fallow pass; #4 above (three fresh-session reports, zero load errors).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the durable Augment release at v1.0.9-ezxomp.0: docs (README /aug + @smol routing + fail-closed contracts, AGENTS verification suite, CHANGELOG Unreleased) verified accurate against source; version bump consistent across 5 pin files. Release gate: main = 7db1a99d (local + pushed to origin), just verify green (391 pass/0 fail, tsc clean, fallow pass). E2E per ezxomp-plugin-e2e-test: direct-source smoke PASS, local-link fresh-agent self-check verdict=OK (augment LOCAL, 1.0.9, /augment+/aug+/augment-settings, @smol routing, 0 load errors), marketplace cutover fresh-agent self-check verdict=OK (all MKT, cache tip == pushed main). All 4 ACs evidenced on the task.
<!-- SECTION:FINAL_SUMMARY:END -->
