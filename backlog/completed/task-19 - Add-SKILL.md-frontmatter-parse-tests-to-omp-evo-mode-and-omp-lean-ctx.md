---
id: TASK-19
title: Add SKILL.md frontmatter parse tests to omp-evo-mode and omp-lean-ctx
status: Done
assignee: []
created_date: '2026-08-22 03:08'
updated_date: '2026-08-22 03:39'
labels:
  - chore
  - testing
dependencies: []
type: task
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Judge finding #5 on TASK-17: invalid YAML frontmatter shipped because neither ~/.omp/omp-evo-mode nor ~/.omp/omp-lean-ctx has a test covering bundled SKILL.md frontmatter (tests/ only cover hook behavior). Add a small frontmatter-parse test per plugin that walks skills/*/SKILL.md and asserts a strict YAML parse of the frontmatter block. Evidence: PyYAML ScannerError reproduced on the two new skills before fix; 53/57 repo plugin skills parse clean.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 omp-evo-mode and omp-lean-ctx each have a test that fails when any bundled skills/*/SKILL.md has unparseable YAML frontmatter
- [x] #2 bun run test passes in both plugin dirs
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: tests/skill-frontmatter.test.ts added to BOTH plugins — walks skills/*/SKILL.md, asserts strict js-yaml load of the frontmatter block plus name kebab-case and non-empty string description. omp-evo-mode already had js-yaml ^4.1.0 (reused, no dep change). omp-lean-ctx gained js-yaml@^4 + @types as devDependencies via npm install (mirrors sibling plugin choice).

Gate proven to bite: mutation test injected a temp skill with unquoted colon-space description -> vitest reported 2 failed | 3 passed on that run; temp removed, suite green again.

Pre-existing isolation defect found and fixed in omp-lean-ctx tests/extension.test.ts: 3 conditional-blocking tests ('SHOULD block ... tui', 'enable blocking after ctx_* success', 'SHOULD still block read on filesystem paths') read the HOST ~/.omp/agent/config.yml when OMP_HOME is unset, so they failed on any machine running evo-mode main:true (block=undefined). Fix wraps each with the file's own established makeEvoConfig(false) try/finally pattern — zero assertion changes, isolation only. All assertions preserved verbatim.

Verification: omp-evo-mode `npm test` -> 2 files, 18/18 pass; omp-lean-ctx `npm test` -> 2 files, 21/21 pass (incl. new 5-test frontmatter gate). Side effect noted: first npm install in omp-lean-ctx pruned 144 extraneous packages installed outside its lockfile tree; both suites green post-prune.

ResidueJudge verdict REVIEW_PASSED, no blocking (findings in comments). Notable followup resolved in-place: dual-lockfile drift (bun.lock lacked js-yaml after npm-side addition) fixed via `bun install` in omp-lean-ctx — bun.lock now contains js-yaml, suite re-verified 21/21 green post-sync. Remaining non-blocking followups live in TASK-19/TASK-18 comments.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: ResidueJudge
created: 2026-08-22 03:37
---
[judge] Residue round PASS — no blocking findings. Verified empirically: (1) T19-AC1: injected temp skills/zz-mutant/SKILL.md (unquoted colon-space description) into BOTH plugins; targeted frontmatter vitest exited 1 in each (js-yaml YAMLException thrown at tests/skill-frontmatter.test.ts:51); mutant deleted after each run, residual scan clean. (2) T19-AC2: ran suites myself — evo-mode 18/18, lean-ctx 21/21 via npm test AND via literal `bun run test` per AC wording. TEST INTEGRITY: read all 398 lines of lean-ctx tests/extension.test.ts; exactly 3 wrapped tests (L78 tui-block, L117 print-after-ctx-success, L262 fs-path-block); wrappers purely additive (makeEvoConfig(false) @L317 + OMP_HOME + try/finally rmSync + env delete), zero assertion edits — all original expects present and strong (block===true + reason~ctx_read / before-falsy+after-true / block===true). extensions/index.ts confirms isEvoMainActive() consulted ONLY at tool_call L222, so briefing/URI/redirect tests are host-independent — 3-test scope is exactly right; suites green on THIS host which runs evo main:true (the exact defect condition). DEP HYGIENE: js-yaml as devDep correct (test-only; lean-ctx has no runtime deps); evo-mode reuses its pre-existing declared js-yaml ^4.1.0. 144-pkg prune risk LOW: 53 pkgs remain, live omp-lean-ctx MCP server + hooks serving this very review session from the pruned tree.
---

author: ResidueJudge
created: 2026-08-22 03:37
---
[judge] FOLLOW-UPs (non-blocking): (a) ~/.omp/omp-lean-ctx/bun.lock contains ZERO js-yaml entries while package.json/package-lock.json declare js-yaml@^4.3.1 devDep — future `bun install --frozen-lockfile` in that dir fails / fresh bun install won't link js-yaml; regenerate bun.lock or drop the dual-lockfile setup. (b) skill-frontmatter.test.ts walker scans only skills/*/SKILL.md one level deep (both plugins) — nested skills/x/y/SKILL.md escapes the gate; recurse if nesting ever lands. (c) cosmetic: wrapped-test bodies keep tab indent under col-0/2 wrappers in extension.test.ts. Note: implementation notes cite js-yaml@^4.1.0 but package.json recorded ^4.3.1 (satisfies the ^4 range; informational). Caveat: user-scope plugin dirs have no VCS history and no pre-patch baseline copy exists anywhere under ~/.omp, so integrity was judged structurally (full-file read) plus empirically (green on an evo-main:true host where the unwrapped tests would fail).
---
<!-- COMMENTS:END -->
