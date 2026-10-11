---
id: TASK-46
title: >-
  Record two-phase marketplace install protocol + cut user OMP install to
  marketplace
status: Done
assignee: []
created_date: '2026-08-28 21:38'
updated_date: '2026-08-28 21:49'
labels:
  - architecture
dependencies: []
type: docs
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-45 (cook js-yaml load failure, which only manifested because the user OMP install was link-local and masked the shipped tree). Deliverables: (1) docs/omp-marketplace-update.md — two-phase protocol (Phase 1: develop + test via omp plugin link + fresh OMP agent self-check with herdr report-back contract + commit/push main; Phase 2: marketplace update + uninstall links + reinstall from marketplace + second fresh-agent self-check + leave as-is), invariant = shipping state is marketplace install, exception = non-marketplace omp-pstack-suite stays linked. (2) DOX links: root AGENTS.md Work Guidance, docs/AGENTS.md Child DOX Index, README local-development note. (3) Managed skill ezxomp-marketplace-sync updated to the two-phase protocol. (4) One-time cutover: all 13 marketplace plugins installed from the ezxomp marketplace at the pushed versions, pstack-suite stays linked, verified by a fresh OMP agent self-check at each phase. Verified: Phase 1 fresh-agent report P1-CHECK all PASS (verdict LINK-LOCAL-OK, 2026-08-28).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/omp-marketplace-update.md exists with the two-phase protocol + fresh-agent report-back contract + pstack-suite exception
- [x] #2 Root AGENTS.md Work Guidance, docs/AGENTS.md index, and README reference the protocol doc
- [x] #3 CHANGELOG.md [Unreleased] records the doc
- [x] #4 User OMP install cut over: all 13 marketplace plugins are marketplace installs (symlink -> cache/plugins), pstack-suite stays link-local, doctor 0 warnings/0 errors
- [x] #5 Each phase verified by a fresh OMP agent that prints a P1/P2-CHECK report + verdict and signals back via herdr notification (Phase 1 evidence in task notes)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cutover executed 2026-08-28 (commit b2c9645d, pushed; marketplace cache at same commit):
- Phase 1: 14/14 link-local (install:local + explicit links), doctor 16 ok/0w/0e. Fresh OMP agent p1-check-omp (herdr pane w3:p15) report: P1-CHECK sources=14 local/0 marketplace, vendor=PASS (cook vendor js-yaml import+parse OK via symlink), startup-load-errors=0 across all 8 session logs, vendor-file=PASS, verdict=LINK-LOCAL-OK. (This agent ran before the report-back contract existed; its report was retrieved via herdr agent read.)
- Phase 2: marketplace update to b2c9645, uninstalled 13 links, reinstalled 13 from marketplace. Quirk: @ezxomp/skills link survived repeated `omp plugin uninstall skills@ezxomp` (reported success, link+lock entry persisted — its lock entry looked marketplace-shaped); resolved via `omp plugin install skills@ezxomp --force` (link now -> cache). doctor: 0 warnings/0 errors (Summary count drops to 4 ok after marketplace cutover — doctor only deep-inspects local/npm plugins; harness quirk, plugins load fine per fresh-agent check).
- Phase 2 fresh agent p2-check-omp (pane w3:p16, full report-back contract incl. herdr notification show — channel returned shown:false reason:disabled, command exit 0): P2-CHECK sources=13 marketplace/1 local (omp-pstack-suite documented exception), vendor=PASS through the marketplace tree (cook 0.1.7-ezxomp.5), startup-load-errors=0, repo-links=omp-pstack-suite only, verdict=MARKETPLACE-OK.
- Install left as-is per user instruction: 13 marketplace installs + pstack-suite link-local.
- Managed skill ezxomp-marketplace-sync rewritten to the two-phase protocol with the observed gotchas (stale-link uninstall, doctor count, notification-disabled, wait-until-working).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two-phase OMP marketplace install protocol recorded and the user OMP install cut over to the shipping state. (1) docs/omp-marketplace-update.md created (two-phase protocol, fresh-OMP-agent report-back contract, pstack-suite exception, observed gotchas) + DOX links in root AGENTS.md Work Guidance, docs/AGENTS.md Child DOX Index, README local-development note; CHANGELOG [Unreleased] entry; managed skill ezxomp-marketplace-sync rewritten to match; managed skill herdr-omp-validation-agent gained the mandatory report-back contract. (2) Cutover: 13 marketplace plugins unlinked and reinstalled from the ezxomp marketplace at pushed commit b2c9645d; omp-pstack-suite stays link-local (not in marketplace); skills link needed --force install after a stale-link uninstall quirk. Verified by two fresh OMP agents under herdr: p1-check-omp verdict=LINK-LOCAL-OK (Phase 1: 14 local, vendor PASS, 0 load errors) and p2-check-omp verdict=MARKETPLACE-OK (Phase 2: 13 marketplace + 1 documented local, vendor PASS through the marketplace tree, 0 load errors, only repo link omp-pstack-suite); doctor 0 warnings/0 errors at both phases. Install left as-is per instruction.
<!-- SECTION:FINAL_SUMMARY:END -->
