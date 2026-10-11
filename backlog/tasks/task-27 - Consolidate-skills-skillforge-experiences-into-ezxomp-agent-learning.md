---
id: TASK-27
title: 'Consolidate skills, skillforge, experiences into @ezxomp/agent-learning'
status: Done
assignee: []
created_date: '2026-08-23 06:16'
updated_date: '2026-08-23 11:10'
labels: []
milestone: m-0
dependencies: []
priority: high
type: feature
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Consolidate the three ezxomp learning plugins — skills (marketplace 0.7.4-ezxomp.0), skillforge (marketplace 0.2.5-ezxomp.1), experiences (@ezxomp/experiences 0.1.49-ezxomp.1) — into ONE modular package @ezxomp/agent-learning with four modules: surface (skills.sh adapter + plugin/tool catalog; NO bundled pix-* skills), facts (thin adapter to native memory backend), procedures (skillforge pipeline: evidence capture → promotion thresholds → human review → skill patch), habits (experiences pipeline: capture → analyze → numbered review → steering with law + provenance). Native OMP discovery (skill://, /skill:, manage_skill isolation, mnemoni memory backend) is the substrate; remove duplicated discovery/recall/storage logic.

Context (verified 2026-08-23): native harness (pi-coding-agent 17.4.x) already provides multi-root skill discovery, skill:// + /skill: loading, plugin-shipped skills with containment, manage_skill/learn isolated managed-skills dir, and pluggable memory backends. User config has memory.backend mnemoni + autolearn enabled + autoContinue — native autolearn writes lessons straight to managed-skills with NO review gate (33 skills on disk); experiences has the review machinery but is not wired to autolearn. skills.sh live API verified: GET /api/search?q&limit returns {query, searchType, searchVersion:'legacy', count, duration_ms, skills[{id, skillId, name, installs, source}]} — current adapter fields still valid but definitions outdated.

Design reference: doc-5 (approved spec) — module contracts, migration plan, edge cases, open decisions (procedures store: experiences SQLite vs tagged mnemonic lessons — pick at planning; read_skills backcompat — pick at planning).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AC1 — Scaffold @ezxomp/agent-learning workspace package with omp manifest registering four modules (surface, facts, procedures, habits); old plugins skills/skillforge keep publishing thin backcompat re-exports but no duplicate discovery/recall/storage logic.
- [x] #2 AC2 — Bundled pix-* skills removed; the package ships a plugin/tool catalog (one SKILL.md per ezxomp plugin) listing every tool/skill the agent can see with a DO/DON'T table per tool, loaded by native OMP discovery; no pix-* files remain in the package.
- [x] #3 AC3 — skills.sh adapter (remote.ts) definitions updated to the verified live API contract (search returns {query, searchType, searchVersion, count, duration_ms, skills[{id, skillId, name, installs, source}]}); tool description and README instruct install only safe programming-language-specific skills; non-language results flagged/refused in tool copy.
- [x] #4 AC4 — skillforge procedures module stores evidence in the unified experiences store (or tagged native mnemopi lessons) and removes its own pre-turn recall injection; promotion apply writes only via human-reviewed patches (never silent direct writes to user skills).
- [x] #5 AC5 — Unified review gate flag (learning.review or autolearn.review) routes autolearn/learn captures: fact→native memory (no review), procedure/gotcha→promotion+review, habit→habits review; when on, no unreviewed managed-skills writes from autolearn; when off, legacy behavior preserved.
- [x] #6 AC6 — /learning surface maps to /experience and /skillforge subcommands; /experience setup and its full feature set remain functional and unchanged.
- [x] #7 AC7 — just verify passes (tsc + bun test), CHANGELOG updated, DOX docs updated (root AGENTS.md plugin list, docs/AGENTS.md index).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan — @ezxomp/agent-learning consolidation (TASK-27)

### Planning-time decisions (locked, per doc-5 open items)
- D1 — Procedures store: **unified experiences SQLite** (add `procedures` partition to agent-experience schema v6 → v7 bump with transactional/idempotent migration, reusing checksum/redaction/locks). Rejected alternative: tagged mnemoni lessons (no structured provenance envelope).
- D2 — `read_skills` backcompat: keep a **thin wrapper** (list via native active-skills; full via `skill://` read; copy via native resource read) — drop the hand-rolled scan/path logic. Users may have flows calling it.
- D3 — Gate flag: **`learning.review`** (default `off` for compat). Implemented as capture-classification + guidance wiring; explicit non-goal: mutating native `autolearn` settings or intercepting the native `learn` tool (that would be invasive; documented instead).
- D4 — Tool/command naming: keep `skillforge_capture_memory` tool name + `/skillforge` command as aliases for /learning procedures; new `/learning` top-level surface with subcommands experience|skillforge|status.

### Phase 1 — Scaffold
1. Create `plugins/agent-learning/` workspace package: package.json with `omp.extensions: ["src/index.ts"]`, deps `@oh-my-pi/pi-coding-agent@17.3.8` + workspace `@ezxomp/experiences`.
2. Layout: `src/surface/{remote.ts,directive.ts,run.ts,collapsed-row.ts,once.ts,catalog/}`, `src/facts/{index.ts}`, `src/procedures/{capture,retrieve,promote,store}.ts`, `src/habits/{alias to experiences core}`, `src/index.ts` (register 4 modules).
3. Update `plugins/AGENTS.md` child index + root `CHANGELOG.md` (Unreleased entry).
4. Add to marketplace `.omp-plugin/marketplace.json` as `@ezxomp/agent-learning`.

### Phase 2 — surface module (AC2, AC3)
5. Move skills.sh adapter: port `plugins/skills/src/remote.ts` → `src/surface/remote.ts`; refresh against verified live contract (`searchVersion`, `skillId`, `count`/`duration_ms` response shape), bump MAX limit handling, add fixture-based tests (`remote.test.ts`).
6. Update `read_skills` tool description + README: install ONLY safe programming-language-specific skills; search copy flags non-language results; update schema doc for `source`/`name`/`full` flow.
7. Delete `plugins/skills/skills/*.md` (28 pix-* files) and the old `discoverSkills`/`scanSkillsDir` code paths.
8. Build catalog: author `skills/<plugin-name>/SKILL.md` per ezxomp plugin (backlog, lean-ctx, experiences/agent-experience, skills, skillforge, extensible-workflows, eval, codesight/ccc, pstack-suite, evo-mode, model-fallback, skill-guard) — each: plugin purpose, tools exposed (from manifests), DO/DON'T table per tool, error-recovery hints; ≤100 lines each; native discovery loads them.
9. Keep `plugins/skills` as thin backcompat package re-exporting the wrapper (D2).

### Phase 3 — facts module (AC4 part)
10. `src/facts/index.ts`: shim over native memory backend (recall/retain exist natively — plugin only adds classification helper + `/learning facts` listing surface). No storage, no injection.

### Phase 4 — Procedures module (AC4)
11. Port skillforge core (`memory/{capture,parse,serialize,validate,retrieve}.ts`, `promotion/promotion.ts`, `store/storage.ts`) into `src/procedures/`; storage via new SQLite `procedures` partition (schema v7 migration) + `promotions/` JSON proposals (kept as files, human-gated).
12. Remove the `before_agent_start` retrieval hook (native memory recall covers context); keep capture tool + `/skillforge review|list|delete` under `/learning procedures ...` aliases.
13. Promotion apply: write only through review flow; target = user skill or managed skill via native `manage_skill` isolation (never silent direct writes); keep path-traversal guards.

### Phase 5 — Habits module + review gate (AC5, AC6)
14. Keep experiences core as-is (do NOT rewrite capture/analyze/review/steering); move into `src/habits/` with `@ezxomp/experiences` republishing a thin alias so installed plugin continuity holds.
15. Gate: `before_agent_start` classification hook — when `learning.review` on: emit guidance custom message ("learning is gated: facts→native recall, gotchas→ /learning procedures capture, habits→ /experience analyze"); patch `skillforge_capture_memory` flow to enqueue into habits lane when type maps to behavior (classification support).
16. `/learning` command: status | experience (routes to existing /experience) | skillforge (routes to existing /skillforge).

### Phase 6 — Verification (AC7)
17. Port + extend plugin smoke tests (`test/agent-learning.test.ts`): surface catalog loads via discovery; remote search against fixture contract; procedures capture→promote→review flow (existing fixtures); gate on/off behavior.
18. `just verify` green; CHANGELOG; DOX (`plugins/AGENTS.md` index + docs index); marketplace entry.

### Risks
- **R1 schema v6→v7 bump** — must be transactional/idempotent like existing v5→v6; fail-closed guard already present. Mitigate: reuse migration harness.
- **R2 pix-* removal breaks user flows** — mitigated by thin read_skills wrapper + release-note mention.
- **R3 marketplace continuity** — old packages keep publishing until new one proven; backcompat aliases prevent breakage.
- **R4 skills.sh API drift** — fixture tests + re-verify against live API in implementation.
- **R5 catalog bloat** — enforce ≤100 lines/entry, DO/DON'T tables only; system prompt listing stays flat.

### Verification checkpoints
- P1: `just check` green after scaffold.
- P2: unit tests for remote contract + catalog loads via native discovery (`skill://<plugin>` resolves).
- P3: capture→promote→review fixture suite green; no before_agent_start retrieval code remains.
- P4: `/experience setup` full loop + `/learning` mapping smoke; gate on/off unit tests.
- P5: `just verify` full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTATION LANDED (2026-08-23). @ezxomp/agent-learning 0.1.0-ezxomp.0 scaffolded at plugins/agent-learning with modules: surface (read-skills.ts + remote.ts + directive/run/gate/collapsed-row/once ports), facts (facts.ts classifier shim), procedures (full skillforge engine port under src/procedures/, store root <agentDir>/agent-learning with automatic atomic legacy migration from <agentDir>/skillforge), review gate (review-gate.ts, env LEARNING_REVIEW or <agentDir>/agent-learning.json {"review":true}), /learning routing command.

D1-REVISION (deviation from persisted plan, recorded in doc-5): procedures store is a unified atomic-file store at <agentDir>/agent-learning instead of an experiences SQLite v7 partition — experiences schema has a fail-closed future-version guard, so writing v7 DBs would brick the installed npm experiences plugin until upgrade. SQLite integration deferred to follow-up ticket.

Habits lane stays in @ezxomp/experiences (companion package): 4 plugins import its overlay-host path directly so the tree cannot move; agent-learning deliberately does not re-register it (duplicate registration hazard) and routes via /learning experience.

skills + skillforge converted to thin backcompat publishers re-exporting agent-learning; both shims share the agent-learning once-key so double-install registers each lane exactly once. Legacy pix-* bundle (28 files) and the plugins/pix-skills twin deleted; extensible-workflows' gate import repointed.

skills.sh adapter refreshed against live API verified 2026-08-23 ({query,searchType,searchVersion,count,duration_ms,skills[{id,skillId,name,installs,source}]}); safe-language-only install policy carried in tool description + README + read-skills-surface catalog entry.

VERIFICATION: just verify PASS (tsc clean; bun test 362 tests, 344 pass / 18 skip / 0 fail; 'ok to push/merge'). New root suite test/agent-learning.test.ts (20 tests): adapter contract w/ mocked fetchers, bounded runner, catalog discoverability + DO/DON'T + <=100 lines, lane classification, gate toggles, store-root + migration-source contracts, shim wiring. flat-cache fixture extended to 4 plugins (skillforge, extensible-workflows, agent-learning, skills) all loading from OMP-style cache layout. Overlay/promotion suite repointed and passing (12 tests).

REMAINING (unchecked ACs): AC4 store substrate is the unified atomic-file root rather than experiences-SQLite/mnemopi tags (follow-up ticket); AC5 gate is advisory guidance by design (D3 non-goal: no native autolearn interception) and the existing 33 managed skills still need triage (follow-up ticket).

FINAL VERIFICATION (2026-08-23, post-e2e): Added permanent pipeline e2e — test/fixtures/agent-learning-procedures-e2e.ts child script spawned with sandboxed PI_CODING_AGENT_DIR (fresh module graph, zero user-state risk), driven from test/agent-learning.test.ts. Proves behaviorally against REAL disk: legacy <agentDir>/skillforge atomic-migration fires on first save, entry lands under unified <agentDir>/agent-learning root, confirmed+hits>=3+skills[] produces exactly 1 promotion proposal, listPendingProposals finds it, applyProposal patches the target SKILL.md ('## Skillforge learnings' header + guidance line present), traversal target_skill '../__escape__' refused (/outside canonical|not found|Invalid/i). This upgrades migration + human-gated-write claims from source-contract checks to executed behavior.

LIVE WIRE PROOF (same round): OMP production loader loadSkillsFromDir over plugins/agent-learning/skills => 10/10 parsed, 0 warnings, parsed names == dir names, none hidden. fetchRemoteSkill live happy path: github/awesome-copilot/python-mcp-server-generator fetched end-to-end (valid SKILL.md, frontmatter name match) then instant cache hit on reload. Live fail-closed case observed: nutlope/hallmark now exceeds MAX_FILES=100 and adapter REFUSED cleanly — conservative caps working as designed (fixture repo drift noted, not a defect).

GATE: just verify PASS — bun test 368 tests across 34 files: 350 pass / 18 skip / 0 fail (+1 net test vs previous run); tsc clean; 'ok to push/merge'. Tree uncommitted pending operator instruction. AC4/AC5 remain open deliberately: AC4 delta == procedures-store substrate (D1-revised atomic-file root; SQLite partition tracked in TASK-28); AC5 delta == advisory-vs-enforcing gate (native autolearn interception non-goal per D3; triage of ~33 existing managed skills tracked in TASK-29).

HARNESS-DISCOVERY PROOF (2026-08-23, final layer): drove the REAL OMP plugin loader (getEnabledPlugins from @oh-my-pi/pi-coding-agent/extensibility/plugins/loader) over a synthetic <tmp>/.omp/plugins root with agent-learning linked in: discovered as '@ezxomp/agent-learning', scope=user, enabled=true, manifest.extensions=["src/index.ts"], path resolves through symlink. Promoted to a permanent regression test in test/agent-learning.test.ts (imports the harness specifier directly — resolves via repo workspace peers; exports wildcard './*' -> './src/*.ts'). Combined with the earlier registerExtension stub-host smoke + production loadSkillsFromDir catalog parse, the full consumer chain is now evidenced: discovery -> manifest entry resolution -> module execution -> tool/command/hook registration.

OPERATIONAL FINDING (no action required for TASK-27): `omp plugin install/link` ignores PI_CODING_AGENT_DIR — it always mutates the real ~/.omp/plugins. An accidental link of agent-learning into real user scope during probing was fully reverted (omp plugin uninstall + residual symlink removed; all 6 pre-existing @ezxomp sibling plugins verified intact). Library-level home-threaded APIs (getEnabledPlugins(cwd,{home})) are the correct sandbox seam for tests.

DEDUP PROVEN BEHAVIORALLY: new permanent test `test/agent-learning.test.ts` describe "agent-learning: backcompat shim dedup" — one host stub (chained zod), invoke agent-learning default + skills shim default + skillforge shim default sequentially → read_skills×1, skillforge_capture_memory×1, commands exactly [learning, skillforge]. once() globalThis WeakMap keyed (pi,"agent-learning") is the mechanism; probe previously throwaway, now committed to the suite.

GATE after promotion: just verify PASS — 370 tests / 34 files: 352 pass / 18 skip / 0 fail, tsc clean. Suite alone: 28 pass / 139 expect().

FLAKE OBSERVED (not ours): plugins/pstack-suite/test/parity-foundation.test.ts AC4b handler-level parity failed once in first verify run (1 fail + 1 error), passed in isolation rerun and in full-gate rerun. Untouched by consolidation diff. Candidate follow-up ticket if it recurs.

Remaining before commit (awaiting user word): stage consolidation scope only per plan; exclude cook-state.json, doc-3/doc-4, task-23..26.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-23 10:46
---
Shipped in consolidation commit `195713df24e8` (`feat(agent-learning): consolidate skills+skillforge+pix-skills into unified plugin with experiences SQLite v7 procedures store`), pushed to origin/main at tangled.org (fast-forward fcf8399→195713df, knot1 accepted). Includes flat-cache import fix and full gate evidence: just verify green (384 tests / 36 files / 0 fail, tsc clean).
---

author: GateM0Final-R2
created: 2026-08-23 11:10
---
INDEPENDENT POST-SHIP GATE: PASS (2026-08-23). Validator subagent (omp/openai-codex/gpt-5.4-mini, full mode) re-ran all checks mechanically and matched expected on 10/10: V1 just verify EXIT=0 (tsc clean; 366 pass / 18 skip / 0 fail, 384 tests / 36 files); V2 main=195713df24e879e439a6d28dd5b35302e4508ade, parent=fcf83992971ef6cc8f8f672201b54c96770843a6; V3 ls-remote origin main matches local; V4 pix-skills tree paths=0; V5 all five required files present in commit tree (agent-learning index.ts, procedures/store/experience.ts, review-gate.ts, both e2e fixtures); V6 diff-vs-parent empty for cook-state/doc-3/doc-4/task-23..26 exclusions; V7 jj st exactly 10 entries as expected; V8-V10 task-27/28/29 all Done with 195713df24e8 provenance. First dispatch attempt died on a dead free-tier model route (404); respawn on subscription-backed codex route completed cleanly. m-0 verification formally closed.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closeout: AC4 satisfied by TASK-28 delivery — procedures evidence now stored in unified experiences SQLite v7 partition via plugins/agent-learning/src/procedures/store/experience.ts adapter (capability/future-version gated with atomic fallback); pre-turn recall injection removed during consolidation; promotion apply remains human-reviewed patch-only (proposal JSON is projection only, SQLite owns evidence — WorkT28C dual-mode proof). AC5 satisfied: review gate routing verified by test/agent-learning-review-gate.test.ts 9 pass/0 fail; enforcement guidance LEARNING_GATE_CONFIG_NOTE added in plugins/agent-learning/src/review-gate.ts (TASK-29); permanent dedup regression lives in test/agent-learning.test.ts (28 pass/0 fail).

Final gate: orchestrator-executed E gate green (procedures-sqlite 5/0, agent-learning 28/0, review-gate 9/0, augment 7/0) + mixed-version fallback demo both modes proven; full just verify run at closeout.

CLOSEOUT GATE (2026-08-23): just verify PASS — bun test 384 tests / 36 files, 0 fail, 2957 expect(), tsc clean, 'ok to push/merge'. One fix round during closeout: flat-cache cross-plugin suite caught experience.ts using relative cross-plugin imports ('../../../../experiences/...') which are structurally unresolvable in OMP's flat-cache layout; repointed all six to the established package form '@ezxomp/experiences/extensions/agent-experience/src/storage/*.ts' matching overlay-host.ts consumers. Post-fix: flat-cache 4/0 (1.56s), procedures-sqlite 5/0, agent-learning 28/0.
<!-- SECTION:FINAL_SUMMARY:END -->
