---
id: TASK-56.7
title: Compact-eng ships as a native-composing auto-compaction plugin
status: Done
assignee: []
created_date: '2026-08-30 00:14'
updated_date: '2026-08-30 06:16'
labels:
  - feature
  - architecture
  - refactor
dependencies: []
parent_task_id: TASK-56
priority: high
type: feature
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the approved spec and ADR as one atomic clean cutover because plugin behavior and identity surfaces are not independently shippable. Rename plugins/ultra-compact to plugins/compact-eng; migrate all callers and identity surfaces; implement the per-turn governor against verified public OMP APIs; retain only cohesive engine behavior that does not replace native Shake/snapcompact. Make planner-authored test/compact-eng.test.ts and existing manifest/smoke contracts green. Update required plugin/root docs and CHANGELOG [Unreleased]. Worker uses its own jj task workspace/bookmark, never pushes or moves main.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Only plugins/compact-eng and @ezxomp/compact-eng remain; no active ultra-compact package, command, skill, registry entry, alias, deprecated export, or stale current-state documentation remains.
- [x] #2 The /compact-eng command and automatic turn-boundary behavior request OMP-native compaction without registering replacement session_before_compact or tool_result transformations.
- [x] #3 At and above the configured watermark, one native compaction request is made per in-flight cycle; below it no request is made; concurrent checks coalesce and pending/active work does not recurse.
- [x] #4 The implementation composes the research-verified Shake/snapcompact method path, preserves artifact:// recovery and snapcompact preserveData/budget/fallback behavior by delegating to native OMP, and handles text-only/no-progress/error paths from the approved spec.
- [x] #5 test/compact-eng.test.ts, updated root manifest/smoke tests, and a direct-source isolated plugin smoke demonstrate the renamed identity and observable governor behavior.
- [x] #6 Package runtime imports and files obey docs/authoring-extensions.md; package/marketplace/test versions are byte-identical; AGENTS.md, README, plugin docs/provenance, root CHANGELOG [Unreleased], marketplace catalog, and generated CodeSight artifacts are current.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the planner RED contract plus OMP 18.0.6 public `agent_end`, lifecycle-event, command, `registerTool`, and handler-context types before selecting only supported extension seams.
2. Move `plugins/ultra-compact/` to `plugins/compact-eng/`, remove the replacement engine/types, and implement the doc-18 governor, `/compact-eng` command, lifecycle observation, configuration, receipts, and only publicly supported bounded tools.
3. Migrate the clean-cutover identity across package/marketplace/root/plugin docs, scripts, manifest/smoke expectations, provenance, import-upstream version map, skill, and regenerated lockfile; retain old terms only in historical changelog/backlog provenance.
4. Run the planner test first, then manifest/smoke contracts and required workspace gates (`bunx tsc --noEmit`, `bun test test/`), followed by an isolated direct-source OMP smoke of the renamed entrypoint.
5. Append objective AC evidence and gate results, check only proven ACs, record the final summary, describe the finished jj change, and create bookmark `task-56.7` at the finished commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation evidence (worker, workspace `/home/eag1/repo/ezxomp.task-56.7`):
- Public seam verification: installed OMP 18.0.6 types declare `ExtensionAPI.on("agent_end", ...)` at `node_modules/.bun/@oh-my-pi+pi-coding-agent@18.0.6+1d12b1b75ff4b2d3/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:1264-1276`; agent-session emits the public notification after maintenance routing at `src/session/agent-session.ts:2900-2910`. `ToolDefinition.execute(..., ctx: ExtensionContext)` and `registerTool` are public at `extensions/types.ts:612-667,1298-1299`, so the two bounded tools use the same verified `ExtensionContext` actions.
- Atomic cutover moved the package to `plugins/compact-eng`, removed the old engine/types/package/skill surfaces, added the native-composing governor, `/compact-eng`, two bounded tools, lifecycle observation, config validation, receipts, recovery skill, and migrated marketplace/root/scripts/tests/provenance/current CodeSight profiles. Active-identity scan across root contexts, scripts, tests, plugin registry, .omp, .codesight, and bun.lock found no old package/path/skill/registry literal; historical changelog/provenance and the planner's negative assertion retain necessary old terms.
- `bun test test/compact-eng.test.ts`: 3 pass, 0 fail, 9 assertions. Proves renamed command/no alias, absence of replacement hooks, watermark native undefined-argument request, below-watermark no-op, and concurrent coalescing.
- `bunx tsc --noEmit`: exit 0.
- `bun test test/manifest.test.ts test/smoke-plugins.test.ts`: 67 pass, 2 fail. All compact-eng/manifest/smoke assertions passed; the two failures are existing plannotator git-tracked/archive checks (`generated/**` absent from `git ls-files` and `git archive` exit 128) unrelated to this cutover.
- Required `bun test test/`: 350 pass, 12 fail. Failures are outside compact-eng: incomplete local OMP dependency subpaths (`pi-coding-agent/extensibility/plugins/loader`, `omptype/src/type`, `modes/workflow`, plugin-local coding-agent), one existing overlay-host assertion, and the same two plannotator git/archive assertions. No compact-eng test failed.
- Direct-source isolation: launched `omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session`. `/compact-eng status` rendered config/defaults, armed/closed/no-flight state, and measured usage. `/compact-eng snapcompact` exercised the native explicit bitmap route; native OMP returned `Compaction failed: Nothing to compact (session too small)` and the plugin honestly reported `Compact-eng snapcompact native request: no-progress`, without replacement output. No extension-load/module error occurred.
- CodeSight refresh detected `@ezxomp/compact-eng`; because `init` does not overwrite existing profile files, regenerated `CLAUDE.md`, `.cursorrules`, and `codex.md` using CodeSight profile generation. Lockfile contains only `@ezxomp/compact-eng@workspace:plugins/compact-eng` at `2.0.0-ezxomp.0`.

Worker handoff: workspace `/home/eag1/repo/ezxomp.task-56.7`; finished bookmark `task-56.7`; commit `5f8e21b2c707 feat(compact-eng): replace ultra-compact with native governor (TASK-56.7)`. The worker did not push or move `main`.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-56.7
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-56.7 via backlog_task_edit.

VALIDATOR — stable change id pvyookro, bookmark task-56.7, feat workspace /home/eag1/repo/ezxomp.task-56.7. Trusted setup: ran `bun install --frozen-lockfile`; because stale dependency subpaths remained, refreshed ignored dependencies with `bun install --frozen-lockfile --force --ignore-scripts` before the trusted gate. Exact feat workspace: `bunx tsc --noEmit` exited 0; `bun test test/` exited 1 with 383 pass / 18 skip / 2 fail / 3176 expect across 403 tests. Both failures are `test/manifest.test.ts:289` (all plannotator generated/runtime assets reported untracked) and `test/manifest.test.ts:324` (`git archive` status 128). A detached JJ baseline workspace at main tip 2dd9bb4c with complete deps reproduced exactly 380 pass / 2 fail on those same two checks, proving they are pre-existing JJ-workspace/git-metadata artifacts; a detached git baseline at 2dd9bb4c ran 382 pass / 18 skip / 0 fail across 400 tests, and `just verify` was green. The same feat content in a disposable detached git checkout ran `bun test test/` 385 pass / 18 skip / 0 fail and `just verify` tsc+tests passed, but the repo's actual `just verify` then failed the Fallow audit (exit 1): structured audit base_ref main 2dd9bb4c, verdict fail, 11 complexity findings introduced=true and one scripts/import-upstreams duplicate introduced=false. New Fallow findings are plugins/compact-eng/extensions/governor.ts:40 observeTurnEnd CRITICAL cyclomatic16/cognitive19/CRAP272; :63 requestCompaction HIGH cyclomatic8/cognitive8/CRAP72; :81 observeAutoStart HIGH cyclomatic7/cognitive4/CRAP56; :97 observeAutoEnd CRITICAL cyclomatic10/cognitive10/CRAP110; :156 runCycle CRITICAL cyclomatic12/cognitive6/CRAP156; :173 performAttempt CRITICAL cyclomatic13/cognitive14/CRAP182; :213 finish MODERATE cyclomatic6/cognitive6/CRAP42; :235 sample HIGH cyclomatic8/cognitive4/CRAP72; plugins/compact-eng/extensions/types/index.ts:116 resolveConfig CRITICAL cyclomatic11/cognitive11/CRAP132; plugins/compact-eng/extensions/index.ts:13 receiptLevel MODERATE cyclomatic6/cognitive3/CRAP42; :19 handleCompactEngCommand HIGH cyclomatic7/cognitive6/CRAP56. Existing duplicate in scripts/import-upstreams.ts:249-259 and :280-290 is explicitly inherited (introduced=false). Direct-source isolated smoke command `omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session`: `/compact-eng status` loaded and rendered armed/closed state plus usage; `/compact-eng snapcompact` invoked native path and rendered `Error: Compaction failed: Nothing to compact (session too small)` followed by `Warning: Compact-eng snapcompact native request: no-progress`; no extension-load/module error appeared. `bun test test/compact-eng.test.ts` = 3 pass / 0 fail / 9 assertions; `bun test test/compact-eng.test.ts test/smoke-plugins.test.ts` = 10 pass / 0 fail / 33 assertions; `bun test test/manifest.test.ts -t compact-eng` = 5 pass / 0 fail; marketplace metadata test = 1 pass. Behavioral probes via source module: explicit snapcompact calls [{mode:"snapcompact"}] and settles; snapcompact no-progress falls back to calls [{mode:"snapcompact"},undefined] with fallback:"text"; text error returns result:"error"; text no-progress returns result:"no-progress". Package/marketplace/UPSTREAM versions all print 2.0.0-ezxomp.0; bun.lock contains plugins/compact-eng and @ezxomp/compact-eng entries; generated CodeSight files contain @ezxomp/compact-eng and plugins/compact-eng. `cook` journal appendGate recorded stage verify, hash pvyookro, green=false; evidence records clean=false for the exact task workspace and Fallow clean gate. AC1–AC5 have objective evidence above. AC6 is not proven because actual just verify/Fallow is red; uncheck AC6 pending implementation repair. Overall VERIFY_FAILED. Typed blocking findings: {source:"validator", file:"plugins/compact-eng/extensions/governor.ts", line:40, what:"Fallow new-only CRITICAL complexity: observeTurnEnd cyclomatic 16, cognitive 19, CRAP 272", kickTo:"implement"}; same shape lines 63,81,97,156,173,213,235 with their metrics; {source:"validator", file:"plugins/compact-eng/extensions/types/index.ts", line:116, what:"Fallow new-only CRITICAL complexity: resolveConfig cyclomatic 11, cognitive 11, CRAP 132", kickTo:"implement"}; {source:"validator", file:"plugins/compact-eng/extensions/index.ts", line:13, what:"Fallow new-only MODERATE complexity: receiptLevel cyclomatic 6, cognitive 3, CRAP 42", kickTo:"implement"}; {source:"validator", file:"plugins/compact-eng/extensions/index.ts", line:19, what:"Fallow new-only HIGH complexity: handleCompactEngCommand cyclomatic 7, cognitive 6, CRAP 56", kickTo:"implement"}. Source tree remained clean (`jj st`).

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-56.7
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: SCOPED REPAIR — resolve the 11 Fallow new-only complexity/CRAP findings flagged at pvyookro (bookmark task-56.7). Do NOT re-implement the feature; do NOT change public behavior of the deliverable.

Findings (file:line, all Fallow severity/CRAP complexity, all NEW vs baseline):
- plugins/compact-eng/extensions/governor.ts:40
- plugins/compact-eng/extensions/governor.ts:63
- plugins/compact-eng/extensions/governor.ts:81
- plugins/compact-eng/extensions/governor.ts:97
- plugins/compact-eng/extensions/governor.ts:156
- plugins/compact-eng/extensions/governor.ts:173
- plugins/compact-eng/extensions/governor.ts:213
- plugins/compact-eng/extensions/governor.ts:235
- plugins/compact-eng/extensions/types/index.ts:116
- plugins/compact-eng/extensions/index.ts:13
- plugins/compact-eng/extensions/index.ts:19
Out of scope (inherited, not new): scripts/import-upstreams.ts:249-259, 280-290 duplication — leave it.

For EACH finding, pick and apply the mechanism with justification (record which, per line, in notes):
1. DECOMPOSE/EXTRACT (preferred if the code is genuinely over-complex): split the function, extract a helper, or narrow scope so complexity/CRAP drops below threshold. This is the default.
2. JUSTIFIED SUPPRESSION (only if the complexity is inherent and unavoidable): add a targeted fallow-ignore with a concrete reason, or a scope-limited threshold

SCOPED REPAIR (worker, original validator line references; repair commit `5a5ee4da`, bookmark `task-56.7`):

Density diagnosis: governor findings were classified as mechanism case (a), over-broad orchestration functions spanning multiple governor stages. The eight sites model distinct state bands rather than one duplicated algorithm, so no behavior was unified and no suppression/threshold override was added. Each original finding used DECOMPOSE/EXTRACT:
- `governor.ts:40 observeTurnEnd` → extracted pending-turn guards and usage/state evaluation (`turnDeferral`, `evaluateTurnUsage`, `turnUsageDeferral`) so coalescing/turn increment remain at the public boundary while circuit/cooldown/watermark stages are separate.
- `governor.ts:63 requestCompaction` → extracted request guards, open-circuit handling, sample selection, and cycle construction (`requestDeferral`, `openCircuitDeferral`, `requestSample`, `startCycle`) because those stages have separate state effects.
- `governor.ts:81 observeAutoStart` → extracted in-flight request metadata and observed-start class selection (`requestMetadata`, `observedStartClass`) because receipt projection was independent of lifecycle mutation.
- `governor.ts:97 observeAutoEnd` → extracted request metadata, native result classification, and bounded error projection (`requestMetadata`, `observedEndResult`, `boundedError`) because outcome mapping was independent of observation epoch handling.
- `governor.ts:156 runCycle` → extracted fallback eligibility/pressure/safety and completion (`fallbackSample`, `isSnapcompactFailure`, `hasFallbackPressure`, `canFallback`, `completeCycle`) while preserving the snapcompact-to-text sequence.
- `governor.ts:173 performAttempt` → extracted preflight, native call selection, failed/successful outcome construction, no-progress calculation, and receipt construction (`attemptDeferral`, `requestNativeCompaction`, `failedAttempt`, `successfulAttempt`, `madeNoProgress`, `recordOutcome`).
- `governor.ts:213 finish` → extracted counter transition, failure-limit, circuit-open, and cooldown operations (`updateOutcomeCounts`, `failureLimitReached`, `openCircuit`, `startCooldown`).
- `governor.ts:235 sample` → extracted host-usage read, validity predicates, and trigger selection (`readUsage`, `isValidUsage`, `isValidTokenCount`, `isValidContextWindow`, `triggerTokens`).
- `types/index.ts:116 resolveConfig` → extracted per-field watermark/token/release/mode validators while retaining the original validation order and error text.
- `extensions/index.ts:13 receiptLevel` → replaced the four-way warning disjunction with module-level warning-result set membership; error still has precedence.
- `extensions/index.ts:19 handleCompactEngCommand` → extracted action normalization, supported-request membership, mode selection, and receipt display fallback.

Objective repair evidence:
- `npx -y fallow@3.20.0 health --complexity --report-only --format json --quiet`, filtered to `plugins/compact-eng/extensions/`, returned zero findings after decomposition. Before the final split it reported four residual CRAP 30 sites; those were further decomposed and the repeated scan returned none.
- The definitive `audit --gate new-only` could not run inside this JJ task workspace: auto-base exited 2 (`could not detect base branch`), and explicit baseline `2dd9bb4c` exited 2 (`not a git repository` / unable to determine changed files). No full `just verify` was run, per repair brief; validator owns the definitive gate.
- `bunx tsc --noEmit`: exit 0 after final edits.
- `bun test test/compact-eng.test.ts`: 3 pass, 0 fail, 9 assertions.
- `bun test test/smoke-plugins.test.ts`: 7 pass, 0 fail, 24 assertions; combined compact contract + plugin smoke: 10 pass, 0 fail, 33 assertions.
- Direct-source isolated live smoke launched `omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session`; `/compact-eng status` rendered, and `/compact-eng snapcompact` reached the native path, which printed `Compaction failed: Nothing to compact (session too small)` followed by `Compact-eng snapcompact native request: no-progress`; process exited 0. The 3/3 contract also objectively confirms this extension registers `compact-eng`, not the old command, and does not register replacement hooks.
- No tests were authored or changed. Source changes are limited to the three listed compact-eng extension files; `scripts/import-upstreams.ts` was untouched.
- JJ workspace was closed onto an empty working copy with parent repair commit `5a5ee4da`; bookmark `task-56.7` points at that repair. No push or `main` move was performed.

No acceptance criterion was newly checked: AC1–AC5 were already checked before this repair; AC6 remains unchecked pending the validator-owned full gate.

POST-REPAIR VALIDATOR PASS at bookmark task-56.7 commit 5a5ee4da29b81d6511deb26270a6ce1d47babe7c (parent feat 486c5da1, docs 6921be5b, main baseline 2dd9bb4c). Canonical detached-git `just verify` at exact commit: `bunx tsc --noEmit` GREEN; `bun test test/` GREEN (385 pass, 18 skip, 0 fail, 3272 expect, 403 tests); Fallow audit `--gate new-only` GREEN with base_ref 2dd9bb4c/head_sha 5a5ee4d, complexity_findings=0, complexity_introduced=0, dead_code_issues=0, dead_code_introduced=0, duplication_introduced=0, one inherited scripts/import-upstreams duplicate only. Assigned JJ workspace `bun test test/` re-confirmed only known environmental manifest.test.ts:289/:324 failures (383 pass, 18 skip, 2 fail); non-blocking present-at-baseline. Direct-source isolated smoke (`omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session`): `/compact-eng status` loaded and rendered armed/closed state plus usage; `/compact-eng snapcompact` reached native route and rendered `Compaction failed: Nothing to compact (session too small)` then `Compact-eng snapcompact native request: no-progress`; no extension-load/module error. Repair commit diff is only governor.ts, extensions/index.ts, types/index.ts and decomposes/extracts helpers; additions contain no fallow-ignore, thresholdOverride, threshold override, or ignore-pattern suppression. `jj st` clean; worker bookmark remains 5a5ee4da, no push/main move. Gate record: hash=5a5ee4da; tsc=true; tests=true (canonical detached exact commit); Fallow=true; clean=true.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-56.7
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-56.7 via backlog_task_edit.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
REFUTE (source-bound, single finding) -> TASK-56.7
You are bound to EXACTLY this finding; you are blind to all others.
Finding: source=main-live-e2e file=plugins/compact-eng/extensions/governor.ts:257
  what: L4 — Live OMP TUI measurement (herdr, OMP 18.0.6, GLM-5.3-Flash, 524288 window): with watermarkTokens=32768, at the agent_end boundary the governor sampled usage=56220/524288 but ctx.isIdle()=false / hasPendingMessages()=false / isSafe()=false, so observeTurnEnd deferred (receipt deferred-pending) and never reached the watermark check. Above-watermark auto-trigger therefore never fires in live interactive sessions; manual /compact-eng and compact_eng_request share the same isSafe gate via requestDeferral. Full evidence: /tmp/ce-live-oc5A3L/LIVE-E2E-FINDING.md + governor-celog.txt (prototype probe) + per-turn status readings (RUN1 no-trigger 21K->89K; RUN2 3 boundaries deferred-pending).

1. Re-read the exact source location and its context.
2. Refute or confirm with evidence (file:line).
3. Return strict JSON: {"verdict":"upheld"|"refuted","evidence":"<file:line + what>","note":"<optional>"}
Do not judge anything beyond this finding.

Record all results on task TASK-56.7 via backlog_task_edit.

REFUTE (Refute567l4) — finding governor.ts:257 (L4 live auto-trigger never fires): UPHELD. Evidence: (1) Source: governor.ts:40-45 observeTurnEnd calls turnDeferral BEFORE evaluateTurnUsage; :257-262 turnDeferral returns deferred-pending when !isSafe(ctx) so the watermark check (isBelowWatermark:55) is unreachable whenever isSafe is false; :289-293 requestDeferral (used by requestCompaction:64, covering /compact-eng:37-42 and compact_eng_request:75-79) gates the manual path with the same isSafe; :448-450 isSafe = ctx.isIdle() && !ctx.hasPendingMessages(). (2) Installed OMP 18.0.6 semantics: agent-session.ts:6052 binds isIdle: () => !this.isStreaming; agent-session.ts:4571-4573 isStreaming = agent.state.isStreaming || #promptInFlightCount > 0. In #runLoop (agent-core agent.ts:1296) resolveRun and isStreaming=false run in the finally AFTER the event stream ends, while the agent_end event is consumed DURING the stream (agent.ts:1522-1574) and OMP's public agent_end extension notification is emitted from maintenance routing inside #processAgentEvent (agent-session.ts:2896-2907), i.e. while the original prompt() is still unwinding — so ctx.isIdle() is false at the moment agent_end handlers run, matching the live probe (governor-celog.txt: isIdle=false, pending=false, isSafe=false, receipt deferred-pending at usage=56220/524288 > 32768). (3) Both paths share the gate: auto (observeTurnEnd→turnDeferral:259) and manual (requestDeferral:290) — plus attempt re-check at :350 — so during agent_end dispatch neither can pass; a live TUI session can only satisfy isSafe between turns (genuinely idle), which is exactly where the auto path never fires. No production path reaches the watermark check at the turn boundary; the finding's live measurement is consistent with the installed source. Verdict JSON: {"verdict":"upheld","evidence":"plugins/compact-eng/extensions/governor.ts:257-262 + :289-293 + :448-450 gate BOTH auto and manual paths on ctx.isIdle()&&hasPendingMessages; installed OMP 18.0.6 binds isIdle=()=>!isStreaming (agent-session.ts:6052) and isStreaming stays true through agent_end handler dispatch because the public agent_end is emitted from maintenance routing while the prompt is still in flight (agent-session.ts:2896-2907, 4571-4573, #promptInFlightCount) — live probe /tmp/ce-live-oc5A3L/governor-celog.txt confirms isIdle=false/isSafe=false at the boundary with usage 56220 > trigger 32768, so observeTurnEnd defers at :259 and never reaches the watermark check","note":"Refutation attempt failed: no path in the deliverable tree bypasses the isSafe gate at agent_end; the only reachable native trigger is manual invocation while the session is genuinely idle (between turns), which matches the finding's own caveat. Design decision + boundary-appropriate predicate (e.g. treat agent_end-with-terminal-settle as safe, or wait for idle before evaluateTurnUsage) is required for the auto path to ever fire."}

## implement completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-worker", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-worker's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
WORKER → TASK-56.7
1. Read spec + failing tests
2. Minimal change to pass AC
3. May NOT author/weaken tests
4. --append-notes, --check-ac
Return WorkerEnvelope.

Plan: SCOPED REPAIR -> TASK-56.7 (kickback from red review gate, all 5 findings refuted-UPHELD by source-bound judges at 5a5ee4da). Work in the task-56.7 workspace (bookmark task-56.7; main baseline 2dd9bb4c). Do NOT re-implement the feature, do NOT change public behavior of green items, do NOT weaken any existing test, do NOT push/move main, do NOT touch other plugins. Five blocking fixes (smallest correct change each): B1 upstreams.lock.json:36 rename lock key 'ultra-compact' -> 'compact-eng' keeping package pi-ultra-compact, url, version 1.2.1, integrity byte-identical (decision-4 provenance); verify scripts/import-upstreams.ts import+verify now resolve the compact-eng key (no other code consumes the slug). B2 docs/authoring-extensions.md:128 replace 'ultra-compact' with 'compact-eng' in the active-plugins roster (living spec; do NOT touch dated historical reports). B3 add a registration+invocation test to test/compact-eng.test.ts: extend the pi double with registerTool + pi.typebox.Type (or a parallel suite) so registerCompactEngTools actually registers both tools; invoke compact_eng_context_status (expect bounded status content) and compact_eng_request (expect receipt delegating to governor.requestCompaction) and assert execute paths run; satisfies doc-18 §2 checkpoint. BB1 wire persisted settings: at first command/tool invocation (async-safe)

SCOPED REVIEW REPAIR (worker `Worker567r2`, task workspace `/home/eag1/repo/ezxomp.task-56.7`, bookmark `task-56.7`, change `szkwpxkp`, commit `379f49f6`):

Per-finding resolutions (facts verified in this repair):
- B1 → `upstreams.lock.json`: renamed only the source slug `ultra-compact` to `compact-eng`; package `pi-ultra-compact`, URL, version `1.2.1`, and integrity remained unchanged. `bun scripts/import-upstreams.ts stage compact-eng --out /tmp/compact-eng-upstream-stage-567r2` resolved/downloaded the renamed source; `bun scripts/import-upstreams.ts verify` reported all 7 sources OK, including `[verify] compact-eng: OK (integrity + metadata match)`. Search found slug consumption only through `scripts/import-upstreams.ts` lock iteration/direct lookup plus the augment test's augment-only lock read.
- B2 → `docs/authoring-extensions.md`: replaced the active roster entry with `compact-eng`; dated historical reports were untouched. AC1's current-state roster is now aligned.
- B3 → `test/compact-eng.test.ts`: the PI double now supplies `registerTool`, injected `pi.typebox.Type` from the coding-agent TypeBox shim, and logger capture. The test registers both tools, invokes `compact_eng_context_status` and asserts bounded status, then invokes `compact_eng_request`, observes one native text call and its settled receipt, and verifies bounded reason logging. Targeted result: 6 pass / 0 fail / 23 expectations.
- BB1 → `plugins/compact-eng/extensions/index.ts`, `plugins/compact-eng/README.md`: added one async-safe lazy cached governor provider. Its first context-bearing invocation reads `PluginManager(ctx.cwd).getPluginSettings('@ezxomp/compact-eng')`, merges persisted settings over the optional factory configuration, and passes the merged object through `resolveConfig`. Registration remains synchronous; command/tool/agent/native lifecycle invocations share the cache. Direct-source status from a disposable cwd with project overrides rendered persisted `watermark: 0.81` and `watermarkTokens: 12345`. README states persisted settings are loaded lazily and runtime-validated.
- L4 → `plugins/compact-eng/extensions/governor.ts`, `plugins/compact-eng/README.md`, `test/compact-eng.test.ts`: the automatic `agent_end` boundary gates continuation, pending messages, and native in-flight work without requiring `isIdle`; automatic request deferral likewise checks pending work, while manual requests retain full `isSafe`. The perform-attempt full idle/pending re-check, fallback safety, native-in-flight gate, and coalescing remain. Regression starts the boundary with `isIdle=false`, models prompt unwind before the deferred attempt, observes one native request, and separately proves `hasPendingMessages=true` returns `deferred-pending` with no extra call.
- F1 → `scripts/verify-omp.ts`: compact-eng now expects skill `compact-eng`. `OPENAI_API_KEY=rpc-verification-placeholder bun scripts/verify-omp.ts --plugin-dirs` passed on-disk validation for all listed plugins and live plugin-dir skill discovery with 0 extension errors.
- F2 → `plugins/compact-eng/extensions/types/index.ts`, `plugins/compact-eng/extensions/governor.ts`, `test/compact-eng.test.ts`: disabled automatic compaction now records `auto-disabled`; `below-watermark` remains exclusive to genuine below-trigger usage. Regression proves both distinct results and zero disabled-case calls.
- F3 → task note only: decision-4 consequence 9 says 14 plugins, while the accepted registry cardinality is 12. The historical ADR was not edited and no registry entry was added.
- FB1 → `plugins/compact-eng/extensions/governor.ts`: removed the unreachable observation-epoch guard and its now-unused state/assignments.
- FB2 → `plugins/compact-eng/extensions/governor.ts`: renamed mutating `defer` to `recordDefer`; last-receipt semantics are unchanged.
- FB3 → `plugins/compact-eng/extensions/index.ts`: removed dead `moduleGovernor` and `__resetModuleState` runtime scaffolding; repository search found no live caller.
- FB4 → `plugins/compact-eng/extensions/index.ts`, `test/compact-eng.test.ts`: `compact_eng_request` logs a debug event containing requested mode and reason sliced to 240 characters; the invocation test verifies the record.
- FB5 → `plugins/compact-eng/extensions/governor.ts`, `test/compact-eng.test.ts`: cooldown now returns `cooldown` only while a positive remainder remains; the boundary that decrements to zero rearms and immediately reevaluates the watermark. Regression observes exactly one request on each of two boundaries (2 total), with no extra deferral or same-boundary loop.

Objective gates on the repaired content:
- `bunx tsc --noEmit`: exit 0.
- `bun test test/compact-eng.test.ts`: 6 pass, 0 fail, 23 expectations.
- `bun test test/`: 388 pass, 18 skip, 0 fail, 3286 expectations across 406 tests. Because a JJ task workspace intentionally has no `.git`, the full-gate invocation used a temporary read-only `.git` gitdir pointer to the colocated repository so the two manifest tests could execute `git ls-files`/`git archive`; the pointer was removed immediately afterward and the JJ workspace was restored to the bookmarked commit. No tests were weakened or skipped.
- `bun scripts/import-upstreams.ts verify`: all 7 sources verified successfully; compact-eng integrity and metadata match.
- `OPENAI_API_KEY=rpc-verification-placeholder bun scripts/verify-omp.ts --plugin-dirs`: Verification PASSED; compact-eng manifest/tool/command/skill expectations green; 67 plugin-dir commands and 0 extension errors. The placeholder only satisfies RPC startup model discovery; no provider request occurs.
- Direct source smoke: actual OMP 18.0.6 launched with `omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session` from `/tmp/ce-smoke-567r2`. `/compact-eng status` rendered armed/closed status plus the persisted 0.81/12345 configuration. `/ultracompact` was not parsed as a registered command and entered the ordinary prompt path. Smoke PID log contains no `Failed to load extension`, `Cannot find module`, or `ultra-compact` match.
- Final JJ state: bookmark `task-56.7` points to `szkwpxkp` / `379f49f6`; working copy is an empty child and `jj status` reports no changes. No push and no `main` move were performed.

L4 FINAL CORRECTION (supersedes the earlier L4 attempt-time sentence and prior commit hash in these notes): installed `ExtensionRunner.emit` awaits `agent_end` handlers, so a full `isSafe` re-check inside the initial automatic cycle would remain unreachable. With coordinator approval, `RequestCycle` now records truthful origin `auto | manual | fallback`. Auto-origin boundary and initial `performAttempt` gates require no continuation, no pending messages, no native compaction in flight, and preserve single-flight coalescing; they do not require `isIdle`. Manual-origin requests and fallback attempts retain full `isSafe` (`isIdle && !hasPendingMessages`) and the native-in-flight gate. README and the governor class comment document this origin-based predicate. Regression evidence uses constant `isIdle=false`: above-watermark `observeTurnEnd` executes through `performAttempt`, makes one native call, and returns `origin: auto`; a manual request against the same non-idle context returns `deferred-pending`, `origin: manual`, and makes no extra call. `bun test test/compact-eng.test.ts`: 6 pass / 0 fail / 27 expectations. `bunx tsc --noEmit`: exit 0. Final full `bun test test/`: 388 pass / 18 skip / 0 fail / 3290 expectations across 406 tests. Final task bookmark is change `szkwpxkp`, commit `1c2732fe`; empty child `uooskoop`, and `jj status` is clean. No push/main move.

## verify completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-validator", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-validator's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
VALIDATOR → TASK-56.7
1. Full test suite (the gate ALWAYS re-runs after any repair)
2. Check AC — verify each with objective evidence
3. Record gate evidence (hash, green, clean) via cook_journal gate
4. --append-notes
On failure: return a typed finding {source:"validator", file, line, what, kickTo:"implement"} for the worker.

Record all results on task TASK-56.7 via backlog_task_edit.

VALIDATOR RE-RUN @ task-56.7 bookmark szkwpxkp / commit 1c2732fe (main baseline 2dd9bb4c). Worker deliverable confirmed in /home/eag1/repo/ezxomp.task-56.7; jj status clean, task bookmark present, no push and no main move.

Gate outputs (exact):
- `bunx tsc --noEmit`: exit 0, no output.
- `bun test test/` in the JJ workspace without Git metadata: 386 pass, 2 fail (manifest.test.ts:289 generated plannotator assets and :324 git archive metadata); this is the known workspace metadata artifact. Re-run with a temporary `.git` pointer to the colocated repository, removed immediately afterward: `388 pass`, `18 skip`, `0 fail`, `3290 expect() calls`, `Ran 406 tests across 39 files.`
- Fallow (`npx -y fallow@3.20.0 audit --gate new-only --format json --quiet --no-cache`, baseline config active): `verdict=fail`, `base_ref=2dd9bb4c51f3b35283282812099356014f624599`, `head_sha=1c2732f`, `dead_code_issues=0`, `complexity_introduced=4`, `duplication_introduced=0`, `duplication_inherited=1`. Four introduced complexity/CRAP findings remain in repaired governor.ts: line 54 evaluateTurnUsage (cyclomatic 5, cognitive 4, CRAP 30); line 75 requestCompaction (5,4,30); line 297 requestDeferral (6,5,42); line 357 attemptDeferral (5,4,30). Inherited scripts/import-upstreams duplicate is not new. These are typed validator kickbacks to implement; no judge review dispatched after red mechanical gate.
- `bun scripts/import-upstreams.ts verify`: all 7 sources verified; compact-eng integrity + metadata match.
- `OPENAI_API_KEY=rpc-verification-placeholder bun scripts/verify-omp.ts`: on-disk manifests pass, default live RPC fails because source tree is not installed (missing installed tools/commands). Source-correct `--plugin-dirs` mode passes: 67 commands, 0 extension errors, compact-eng skill discovered; on-disk compact-eng expects compact_eng_context_status + compact_eng_request and skill compact-eng.
- Direct-source isolated OMP 18.0.6 smoke (`--no-extensions --no-skills -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session`): `/compact-eng status` rendered; RPC exposed compact-eng command and no extension errors; no ambient legacy skill under `--no-skills`. Disposable `.omp/plugin-overrides.json` with watermark 0.81 and watermarkTokens 12345 reached the governor; status rendered both persisted values. Legacy `/ultracompact` was not registered. Process stopped with SIGTERM after evidence capture.

Per-AC determinations:
- AC1 PASS: full-tree legacy scan leaves only allowed historical/provenance surfaces (root/plugin changelogs, immutable pi-ultra-compact provenance in README/marketplace/UPSTREAM/lock, backlog/dated report/baseline records, test negative assertion); no plugins/ultra-compact directory or active @ezxomp/ultra-compact. Previously stale surfaces fixed: upstreams.lock.json key is compact-eng with package pi-ultra-compact, version 1.2.1, URL and integrity preserved; docs/authoring-extensions.md active roster lists compact-eng.
- AC2 PASS: source registers only session_start, session_shutdown, agent_end, auto_compaction_start, auto_compaction_end plus compact-eng command/tools; no session_before_compact/tool_result/context. Native calls are ctx.compact() for text and ctx.compact({mode:'snapcompact'}) for bitmap; lifecycle hooks return no compaction result. compact-eng test passes 6/6 (27 expectations).
- AC3 PASS by compact-eng contract suite/source: watermark request, below-watermark no-op, single-flight coalescing, pending/native-in-flight/continuation deferrals, no same-turn recursion, and cooldown rearm boundary test gives exactly two requests over two consecutive above-watermark boundaries. Native request path is guarded by generation/in-flight state.
- AC4 PASS by disposable source probe: snapcompact no-progress => one ordinary text fallback as new generation; snapcompact error => at most one ordinary fallback; text error => no plugin fallback. Source delegates only to native compact and preserves bounded receipt/fallback semantics; no direct Shake/snapcompact import, replacement result, artifact archive, or preserveData mutation.
- AC5 PASS: full suite green under exact-commit Git metadata (388/18/0); compact-eng targeted suite 6/6/27 and combined compact-eng+smoke 13/13/51; registration/invocation test exercises both bounded tools; L4 tests cover auto isIdle=false request/origin auto, manual isIdle=false deferred/origin manual, pending=true deferral.
- AC6 FAIL pending repair: version/peer/files checks pass (2.0.0-ezxomp.0 and exact pi-coding-agent 18.0.6 across package/marketplace/manifest/FORK_VERSIONS/UPSTREAM/bun.lock; files exist; lock resolver is @ezxomp/compact-eng@workspace:plugins/compact-eng), but definitive Fallow new-only gate is red on four NEW complexity findings above. gate.green=false; gate.clean=true. AC6 unchecked pending worker repair and mandatory full re-run.
- NEW BB1 PASS: lazy cached PluginManager.getPluginSettings('@ezxomp/compact-eng') merges persisted settings before resolveConfig; disposable persisted override rendered watermark 0.81 and watermarkTokens 12345 through /compact-eng status.
- NEW L4 PASS: governor class comment documents boundary predicate; auto observeTurnEnd/initial attempt omit isIdle but retain continuationScheduled, pending messages, nativeInFlight and coalescing; manual and fallback retain full isSafe; receipts expose origin auto/manual/fallback; targeted regression passes.

Typed findings: {source:"validator",file:"plugins/compact-eng/extensions/governor.ts",line:54,what:"Fallow new-only complexity/CRAP: evaluateTurnUsage cyclomatic 5, cognitive 4, CRAP 30",kickTo:"implement"}; {source:"validator",file:"plugins/compact-eng/extensions/governor.ts",line:75,what:"Fallow new-only complexity/CRAP: requestCompaction cyclomatic 5, cognitive 4, CRAP 30",kickTo:"implement"}; {source:"validator",file:"plugins/compact-eng/extensions/governor.ts",line:297,what:"Fallow new-only complexity/CRAP: requestDeferral cyclomatic 6, cognitive 5, CRAP 42",kickTo:"implement"}; {source:"validator",file:"plugins/compact-eng/extensions/governor.ts",line:357,what:"Fallow new-only complexity/CRAP: attemptDeferral cyclomatic 5, cognitive 4, CRAP 30",kickTo:"implement"}.

SECOND COMPLEXITY-ONLY REPAIR (worker `Worker567r3`, workspace `/home/eag1/repo/ezxomp.task-56.7`, bookmark `task-56.7`, change `szkwpxkp`, commit `d5f91d1a83b32ea2fa9529cf84243759f540f062`):

Facts verified in this repair:
- Only `plugins/compact-eng/extensions/governor.ts` changed (27 insertions, 10 deletions); no tests were edited and no `fallow-ignore`, `thresholdOverride`, threshold override, or `ignorePatterns` text was added.
- `evaluateTurnUsage` 5/4/30 -> 4/3/20 (CC/cognitive/CRAP): extracted `automaticUsageDeferral`, preserving sample -> open-circuit/cooldown -> auto-disabled/below-watermark -> request order. `advanceCooldown` still rearms and returns undefined at zero, so the same boundary falls through to pressure reevaluation.
- `requestCompaction` 5/4/30 -> 4/3/20: extracted `requestOrigin`; existing `requestDeferral` and `requestSample` remain ordered before `startCycle`, preserving supplied-sample and usage-unavailable receipts.
- `requestDeferral` 6/5/42 -> 3/2/12: extracted `requestGateUnsafe`; auto origin checks pending messages without `isIdle`, manual origin retains `isSafe`, native-in-flight remains the next gate, and open-circuit handling remains last.
- `attemptDeferral` 5/4/30 -> 3/2/12: extracted `attemptGateUnsafe`; native-in-flight still short-circuits first, auto retains pending-only gating, and manual/fallback retain full `isSafe`. Receipt result/origin/before/deferred fields are unchanged.
- The after values are the direct decision-point counts under Fallow's reported scoring model (CRAP with no coverage = CC^2 + CC); the definitive audit reports zero complexity findings and zero introduced complexity.

Objective gate evidence at the amended commit:
- `bun test test/compact-eng.test.ts`: 6 pass, 0 fail, 27 expectations.
- `bunx tsc --noEmit`: exit 0, no diagnostics.
- `bun test test/`: 388 pass, 18 skip, 0 fail, 3290 expectations across 406 tests. The exact-commit JJ workspace used the approved temporary `.git` pointer for Git-metadata tests; the pointer was removed after the run and shared Git HEAD remained `d5f91d1a`.
- `npx -y fallow@3.20.0 audit --base 2dd9bb4c --gate new-only --no-cache --format json --quiet`: exit 0, verdict pass, base_ref `2dd9bb4c`, head_sha `d5f91d1`, complexity_findings=0, complexity_introduced=0, dead_code_introduced=0, duplication_introduced=0; the single import-upstreams clone is inherited (`introduced=false`).
- `bun scripts/import-upstreams.ts verify`: all 7 sources verified; compact-eng integrity and metadata match.
- `OPENAI_API_KEY=rpc-verification-placeholder bun scripts/verify-omp.ts --plugin-dirs`: Verification PASSED; on-disk plugins all OK, live plugin-dir RPC reported 67 commands and 0 extension errors.
- Direct-source actual OMP 18.0.6 smoke from disposable cwd: `omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session`; `/compact-eng status` rendered `watermark: 0.81`, `watermarkTokens: 12345`, and phase `armed` from persisted project settings. Logs contained no legacy identity, extension-load failure, or missing-module text.
- Final JJ state: clean empty child `xplwsysx` over bookmark `task-56.7` at `szkwpxkp` / `d5f91d1a`; `main` was not moved and nothing was pushed.

Direct-source smoke finalization: repeated the actual OMP 18.0.6 run after all gates, observed `/compact-eng status` with persisted `watermark: 0.81`, `watermarkTokens: 12345`, phase `armed`, no legacy/load-error matches, then exited through `/exit`; supervised process exit code was 0. Disposable smoke settings were removed.

INDEPENDENT VALIDATOR GATE — d5f91d1a (bookmark task-56.7), base main 2dd9bb4c. Exact checks: `bunx tsc --noEmit` exited 0 with no output. Full `bun test test/` re-run with temporary exact-commit `.git` pointer (`gitdir: /home/eag1/repo/ezxomp/.git`; removed by EXIT trap) passed: 388 pass / 18 skip / 0 fail / 3290 expect, 406 tests across 39 files. Fallow `npx -y fallow@3.20.0 audit --gate new-only --no-cache --base 2dd9bb4c --format json --summary --quiet`: verdict=pass, base_ref=2dd9bb4c, head_sha=d5f91d1, changed_files_count=63, dead_code_issues=0, complexity_findings=0, complexity_introduced=0, duplication_introduced=0, duplication_inherited=1; inherited clone is scripts/import-upstreams.ts with introduced=false. `bun scripts/import-upstreams.ts verify`: all 7 sources (augment, code-nav, codesight, experiences, compact-eng, extensible-workflows, plannotator) integrity+metadata OK. `OPENAI_API_KEY=rpc-verification-placeholder bun scripts/verify-omp.ts --plugin-dirs`: on-disk validation passed; Live RPC 0 tools/67 commands/0 extension errors; verification PASSED; static compact-eng manifest expects skills=[compact-eng] and tools=[compact_eng_context_status, compact_eng_request]. Direct-source isolated live smoke used `omp --no-extensions -e /home/eag1/repo/ezxomp.task-56.7/plugins/compact-eng/extensions/index.ts --no-session` from disposable cwd with persisted-format `.omp/plugin-overrides.json`; `/compact-eng status` rendered watermark=0.81, watermarkTokens=12345, triggerTokens=12345, phase=armed/circuit=closed; OMP process log had no `Failed to load extension`, `Cannot find module`, `extension error`, or legacy `ultra-compact` markers. Suppression scan over plugins/compact-eng for exact `fallow-ignore|thresholdOverride|ignorePatterns` returned no matches. `jj diff --from 1c2732fe --to d5f91d1a --summary` and `--stat` show only plugins/compact-eng/extensions/governor.ts (27 insertions/10 deletions); test/compact-eng.test.ts unchanged. `bun test test/compact-eng.test.ts`: 6 pass / 0 fail / 27 expect. Receipt origin is `CompactionOrigin = "auto" | "manual" | "fallback"` in types and is threaded through governor requests/fallback. Workspace hygiene: `jj status` clean; task-56.7=d5f91d1a; main=2dd9bb4c; remote_bookmarks intersection shows main at 2dd9bb4c and no task bookmark published; no push/main move. Per-AC: AC1 PASS (renamed compact-eng identity/registry/docs and no active old package; repair diff only governor); AC2 PASS (full compact-eng contract and direct source command; no replacement hooks); AC3 PASS (27 expectations incl single-flight/watermark); AC4 PASS (native delegation/receipt behavior retained; full suite); AC5 PASS (compact-eng 6/27 + full 388/18/0 + isolated status); AC6 PASS (all gates, 7 upstreams, verify-omp, clean identity/version surfaces). BB1 settings wiring PASS (live status read persisted 0.81/12345). L4 origin-aware safety PASS (auto boundary with isIdle=false, manual/pending deferral expectations unchanged and test file untouched). Gate receipt appended with appendGate(TASK-56.7, verify, d5f91d1a, true): journal seq=38; gate.green=true, gate.clean=true.

## review completed
DISPATCH (execute now — this is the exact call):
  task({ agent: "cook-judge", task: <brief below> })

Rules: no model parameter (the agent's frontmatter selects it); wait for the result; do not do the cook-judge's work yourself. If the work mutates the repo, give the agent its own jj workspace per the project's docs/parallel-agents.md (single source of truth: workspace per task, task bookmark as deliverable, workers never push or move main).

Brief (verbatim):
JUDGE → TASK-56.7
1. Independent — did NOT write code
2. Judge vs AC + standards
3. BLOCKING / FOLLOW-UP with typed findings {source,file,line,what,kickTo}
4. file:line + reason + fix
Return ReviewerEnvelope.

Record all results on task TASK-56.7 via backlog_task_edit.

Round-2 smoke-fidelity repair committed as `0b24693e21e68f7d8ffec2e82fa73ef6980a8d18` (`compact-eng: lazy settings import keeps isolated -e entry loadable`). Removed the top-level PluginManager value import; `createGovernorProvider.get` now dynamically imports the host settings module inside the existing cached promise and retains the `{ ...config, ...persisted }` merge and catch-to-default fallback. Added the README configuration clarification. Verification: `bunx tsc --noEmit` exit 0; `bun test test/compact-eng.test.ts` 6 pass / 0 fail / 27 expectations; Fallow 3.20.0 new-only exit 0 with `complexity_findings: 0` and `introduced: 0`; isolated `/tmp/ce-live-oc5A3L` smoke loaded with no `Failed to load extension`, invoked `compact_eng_context_status`, and returned `autoCompact: true`, `contextWindow: 524288`, `circuit: closed`; `bun test test/` 388 pass / 18 skip / 0 fail / 3290 expectations. Correct JJ range stat (`jj diff --stat --from d5f91d1a --to @`) shows only `plugins/compact-eng/extensions/index.ts` and `plugins/compact-eng/README.md` (3 insertions, 3 deletions). The requested positional form `jj diff --stat d5f91d1a --` is not a revision selector in jj 0.44 and reported `No matching entries for paths: d5f91d1a`; `--from/--to` was used for the intended sanity check.

LIVE RE-TEST (post-review, post micro-fix, commit 0b24693e, herdr ce-run7, model zai-org/GLM-5.3-Flash, wrapper ce-run6.ts prototype-probed):
TURN 1: T0=25657/armed/closed -> 12 corpus reads -> T1=56777 -> T2=58059 (58059 > 32768 trigger). At agent_end (isIdle=false, pending=false, cont=false) governor issued origin=auto request; TUI rendered "snap-compacted 59K->32K". Receipt no-progress class=no-progress origin=auto phase=cooldown gen=1 (no-progress from a small live session is the honest native outcome; the cycle ran to completion).
TURN 2: U0=34519/cooldown/closed, U1=35028 (below 32768+; cooldown respected, no re-request), LASTRECEIPT=no-progress ORIGIN=auto COMPACTED=yes.
Proof: auto path fires at agent_end with isIdle=false (the exact live failure mode from RUN 5 is gone), one native request per boundary, origin carried, cooldown + below-watermark hysteresis hold.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @Validator567
created: 2026-08-30 02:46
---
VALIDATOR BLOCKING — Fallow `audit --gate new-only` at the same feat content reports 11 introduced complexity findings (Fallow JSON `introduced:true`), so clean gate is red. Findings to implement: plugins/compact-eng/extensions/governor.ts:40 observeTurnEnd (critical; cyclomatic 16, cognitive 19, CRAP 272); :63 requestCompaction (high; 8/8/72); :81 observeAutoStart (high; 7/4/56); :97 observeAutoEnd (critical; 10/10/110); :156 runCycle (critical; 12/6/156); :173 performAttempt (critical; 13/14/182); :213 finish (moderate; 6/6/42); :235 sample (high; 8/4/72); plugins/compact-eng/extensions/types/index.ts:116 resolveConfig (critical; 11/11/132); plugins/compact-eng/extensions/index.ts:13 receiptLevel (moderate; 6/3/42); :19 handleCompactEngCommand (high; 7/6/56). Typed route for each is {source:"validator", file, line, what:"Fallow new-only complexity", kickTo:"implement"}. Repair by reducing new complexity while preserving the proven native governor contract, then rerun the full gate; do not suppress findings without evidence.
---

author: @Validator567
created: 2026-08-30 02:46
---
VALIDATOR CLASSIFICATION — Exact feat JJ workspace test failures at test/manifest.test.ts:289 (derived plannotator runtime assets absent from `git ls-files`) and :324 (`git archive` status 128) are present-at-baseline under an equivalent JJ workspace: main tip 2dd9bb4c with complete dependencies produced the same two failures (380 pass / 2 fail). A detached git baseline at 2dd9bb4c produced 382 pass / 18 skip / 0 fail and green `just verify`; the same feat content in detached git produced 385 pass / 18 skip / 0 fail before Fallow. These two are workspace/git-metadata artifacts, not feature-introduced findings and are non-blocking for implementation.
---

author: @Judge567a
created: 2026-08-30 03:47
---
JUDGE A VERDICT (Judge567a, correctness-vs-AC + contract integrity, workspace /home/eag1/repo/ezxomp.task-56.7 @ 5a5ee4da): REVIEW_FAILED — 3 BLOCKING findings; AC2–AC6 verified pass, AC1 fails on two independently-found stale identity surfaces; repair commit 5a5ee4da confirmed behavior-preserving.

REPAIR PRESERVATION (5a5ee4da, diff /tmp/task-56.7-repair.diff, 535 lines, only governor.ts + extensions/index.ts + types/index.ts): every extraction traced to its pre-repair inline form — observeTurnEnd guard order (inFlight→turn++→continuation/unsafe/nativeInFlight) identical; evaluateTurnUsage sample→circuit→cooldown→watermark order identical; requestCompaction manual half-open probe identical; runCycle fallback predicate conjunction (snapcompact ∧ noProgress/failed ∧ after ∧ pressure ∧ current ∧ safe ∧ ¬nativeInFlight) and generation++/mode=text transition identical; finish counter→failureLimit→openCircuit/startCooldown identical; sample math and validity identical; resolveConfig order and error strings identical; receiptLevel set-membership ≡ 4-way disjunction. No state-transition order changed; no fallow-ignore/threshold overrides in additions. DECOMPOSE/EXTRACT confirmed.

PER-AC: AC1 FAIL — blocking findings B1/B2 below. AC2 PASS — registration is session_start/shutdown, agent_end, auto_compaction_start/end only (extensions/index.ts:86-93); no session_before_compact/tool_result/context; command+governor delegate via ctx.compact()/ctx.compact({mode:"snapcompact"}) (governor.ts:359-365) and never return a compaction result; negative asserted at test/compact-eng.test.ts:50-52. AC3 PASS — single-flight coalescing (governor.ts:40-41,68-69), one request per cycle, below-watermark no-op, no recursion (single fallback; cooldown suppression; stale-completion epoch guard), planner test green. AC4 PASS — native-only composition, no preserveData writes, no snapcompact import, artifact:// recovery taught in skill without second archive, fallback order matches doc-18 §4, no-progress definition (missing after / delta<minProgress / !headroom) matches, error/aborted/skipped/retry recorded exactly. AC5 PASS with caveat — 3/3 planner contract intact (not weakened), manifest/smoke expect compact-eng and engine.ts absence, direct-source smoke evidence from worker+validator; caveat = blocking B3. AC6 PASS — version 2.0.0-ezxomp.0 byte-identical across package.json/marketplace.json/manifest test/FORK_VERSIONS/UPSTREAM.json/bun.lock; peers exactly pi-coding-agent 18.0.6; no third-party runtime imports; files list clean; CodeSight artifacts current.

BLOCKING:
B1 {source:"judge", file:"upstreams.lock.json", line:36, what:"Lock key 'ultra-compact' remains while scripts/import-upstreams.ts FORK_VERSIONS was migrated to 'compact-eng' (scripts/import-upstreams.ts:70) — import --all iterates lock.sources keyed by slug and would recreate plugins/ultra-compact from pi-ultra-compact@1.2.1 (import-upstreams.ts:346-353), and verify reports MISSING for the stale slug while compact-eng is never checked; violates AC1 'no active ultra-compact ... registry entry' and contradicts the worker's clean-scan note (scan list omitted upstreams.lock.json)", kickTo:"implement"} — fix: rename lock key to compact-eng (same locked source package pi-ultra-compact@1.2.1, url, integrity preserved per provenance policy).
B2 {source:"judge", file:"docs/authoring-extensions.md", line:128, what:"Current-state authoring contract (living doc, updated 2026-08-27, required reading per plugins/AGENTS.md:20) still lists 'ultra-compact' in the active-plugins audit list; violates AC1 'stale current-state documentation' — it is neither historical changelog nor backlog provenance", kickTo:"implement"} — fix: replace with compact-eng in the plugin list.
B3 {source:"judge", file:"plugins/compact-eng/extensions/index.ts", line:52, what:"doc-18 §2 UNVERIFIED checkpoint: before implementing the two bounded tools, TASK-56.7 MUST add a targeted registration/invocation test; no test anywhere exercises compact_eng_context_status/compact_eng_request (grep: zero hits in test/), and test doubles lack registerTool/typebox so registerCompactEngTools silently no-ops in every test — the tool registration/execute path has never been registered or invoked under test; public-type citation exists (registerTool extensions/types.ts:1298, typebox :1220) but the required test is missing", kickTo:"implement"} — fix: add registration+invocation test with a pi double exposing registerTool/typebox, or omit the tools per doc-18's alternative.

FOLLOW-UP: F1 scripts/verify-omp.ts:64-69 compact-eng entry has skills: [] though the plugin ships skills/compact-eng/SKILL.md — decision-4 consequence 6 wanted a skill:compact-eng expectation. F2 governor.ts:280 autoCompact=false is reported as receipt result "below-watermark" (misleading label; doc-18: observation stays active) — pre-existing from feat commit, preserved by repair. F3 decision-4 says 'preserve marketplace registry cardinality at 14 plugins' but the registry has 12 entries at both main and 5a5ee4da; invariant 'renamed, not added' holds (12→12); stale count lives in the pre-committed ADR, flagging to prevent future confusion. Allowed-historical (not findings): plugin CHANGELOG history, UPSTREAM.json/originalName, marketplace attribution, README provenance line, backlog docs/tasks, dated docs/omp-agent-v1-2026-08-21.md report, fallow-baselines/*.json baseline captures, .jj internal state.
---

created: 2026-08-30 03:58
---
JUDGE B (standards/simplification/boundary, commit 5a5ee4da) — REVIEW_FAILED, 2 blocking, 5 follow-up.

BLOCKING:
1. {source:"judge", file:"plugins/compact-eng/package.json", line:13, what:"omp.settings schema is inert: OMP 18.0.6 invokes extension factories as factory(api) (loader.ts runExtensionFactory; ExtensionFactory type is single-arg), so the second `config` param of compactEng (extensions/index.ts:83) is never populated in production, and the plugin never reads persisted settings back (no PluginManager.getPluginSettings call, unlike plugins/augment). `omp plugin settings compact-eng watermark 0.9` persists and displays but the governor forever runs defaults — declared config surface silently ignored. Fix: read getPluginSettings at command/tool time or registration and pass through resolveConfig (augment precedent), or drop the omp.settings block and document factory-arg-only config. Note: once wired, static schema maxes (watermark 0.01–0.99, releaseWatermark ≤0.98) cannot express releaseWatermark<watermark; resolveConfig stays the authority — acceptable as UI hint.", kickTo:"implement"}
2. {source:"judge", file:"docs/authoring-extensions.md", line:128, what:"Current-state normative doc still lists `ultra-compact` in the 'All other plugins' audit list — contradicts AC1 (no stale current-state documentation) whose evidence claimed a clean active-identity scan. Fix: replace `ultra-compact` with `compact-eng` in that list. (docs/omp-agent-v1-2026-08-21.md:71 is a dated 2026-08-21 report and may stand as history.)", kickTo:"implement"}

FOLLOW-UP (post-merge):
3. governor.ts:110-112 — stale-observation guard is unreachable: epoch only changes in reset(), which also clears nativeObservationEpoch, so `nativeObservationEpoch !== this.epoch` can never be true. Remove the guard, or preserve nativeObservationEpoch across reset if cross-reset suppression was intended.
4. governor.ts:460-466 — defer() hides state coupling: default param `before = this.lastUsage` reads mutable state at call time AND record() writes lastReceipt, so every predicate-shaped helper (turnDeferral/advanceCooldown/advanceOpenCircuit) mutates observable state. Rename (recordDefer) or make receipt-recording explicit.
5. extensions/index.ts:6,98-101 — moduleGovernor + __resetModuleState are unused test scaffolding shipped in the runtime entry (no test or production caller; doc-18 removed module-level state). Remove both or wire tests to them.
6. extensions/index.ts:72 — compact_eng_request declares `reason` (maxLength 240) but execute drops it silently. Thread it into a debug log or remove the param.
7. governor.ts:272-276 — advanceCooldown emits a "cooldown" receipt on the very turn it rearms to armed, so the watermark check is skipped one extra turn. Confirm this one-boundary delay is intended or rearm before the below-watermark check.

BOUNDARY VERIFICATION (no action): single-flight/coalescing correct — inFlight set synchronously in startCycle before any microtask; observeTurnEnd+requestCompaction coalesce; native auto in flight defers via nativeInFlight (set in observeAutoStart before agent_end emission since OMP routes maintenance before the public agent_end notification, agent-session.ts:2900-2910); manual while open circuit = one half-open probe; stale completions return receipts, none dropped. Bounded outputs verified: boundedJson 4000 cap on both tools+command, error/eventMessage sliced 500, receipt fields are internal enums/numbers — no unbounded string escapes. Decomposition is genuine (stage helpers own one state band each), except defer()/advanceOpenCircuit named above.
---

created: 2026-08-30 04:02
---
REFUTE verdict (Refute567b2, single finding: judgeA+judgeB docs/authoring-extensions.md:128) — UPHELD. Verified at deliverable tree 5a5ee4da (jj workspace /home/eag1/repo/ezxomp.task-56.7): docs/authoring-extensions.md:128 reads "- **All other plugins** (`agent-learning`, `ultra-compact`, `extensible-workflows`, `plannotator`, `augment`, `experiences`, `better-custom`, `pstack-suite`):" followed by current-tense audit imperatives ("Audit each extensions/index.ts ... must have the host package in peerDependencies"). This is a current-state/normative plugin roster, not history: doc header is "Date: 2026-08-26 / Type: Specification" with no snapshot disclaimer; plugins/AGENTS.md:20 designates the doc as the cross-cutting contract required reading first; docs/AGENTS.md:36 designates it the authoring contract required reading before modifying any plugin; docs/AGENTS.md Local Contracts require "Each doc should be current and actionable" and "delete stale content instead of explaining history". plugins/ contains compact-eng/ and no ultra-compact/ at 5a5ee4da, so the line-128 reference is stale. Contrast: docs/omp-agent-v1-2026-08-21.md:71 also names ultra-compact but is a dated 2026-08-21 evaluation report (historical, allowed) — confirming the finding's classification distinction. AC1 text ("no ... stale current-state documentation remains") is therefore violated by this line. Packet correction: the finding said the doc is "dated 2026-08-27"; actual header date is 2026-08-26 — immaterial to the verdict. Fix as claimed: replace `ultra-compact` with `compact-eng` in the line-128 list. Typed finding stands: {source:"judge", file:"docs/authoring-extensions.md", line:128, what:"Current-state authoring contract still lists ultra-compact in active-plugins audit list (AC1 stale current-state doc)", kickTo:"implement"}.
---

created: 2026-08-30 04:02
---
REFUTE verdict (Refute567b3, finding B3 from Judge567a, workspace /home/eag1/repo/ezxomp.task-56.7 @ 5a5ee4da): {"verdict":"upheld","evidence":"plugins/compact-eng/extensions/index.ts:52 — registerCompactEngTools guards `if (typeof pi.registerTool !== \"function\" || !pi.typebox?.Type) return;` and silently no-ops; test/compact-eng.test.ts:28-38 pi double exposes only on()+registerCommand() (no registerTool, no typebox), so neither tool is registered or invoked in any of the 3 tests; tree-wide grep for compact_eng_request|compact_eng_context_status at 5a5ee4da has ZERO hits in test/ — hits only at index.ts:56,67 (implementation), README.md:22-23, SKILL.md:16-17 (docs), scripts/verify-omp.ts:68 (static name expectation only, no registration/invocation), doc-18 (spec); doc-18 §2 line 75 states 'Before implementing either tool, TASK-56.7 MUST cite installed 18.0.6 public types/loader and add a targeted registration/invocation test' and doc-18 §8 'Conditional tools' row plus §10 checkpoint 2 reiterate it; public-type citation exists (worker note: registerTool extensions/types.ts:612-667,1298-1299) but the required registration/invocation test is absent","note":"The direct-source live smoke exercised only /compact-eng status and /compact-eng snapcompact commands (ctx.ui.notify path), never the tool execute functions — so the guard→registerTool→execute→governor.requestCompaction→receipt-content path for both tools has never been exercised under test or smoke. doc-18's alternative (omit both tools) remains valid. Fix stays as claimed: add a registration+invocation test with a pi double exposing registerTool and pi.typebox.Type, or omit the tools."}
---

author: @Refute567bb1
created: 2026-08-30 04:02
---
[refute-judgeB-BB1] UPHELD — verified against deliverable tree 5a5ee4da and installed OMP 18.0.6. (1) plugins/compact-eng/package.json:13-24 declares omp.settings (10 keys incl. watermark). (2) Installed ExtensionFactory is single-arg: node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:1606 `(pi: ExtensionAPI) => void | Promise<void>`. (3) loader.ts:362-376 runExtensionFactory calls only `await factory(api)` (line 370); both call sites (422, 443) pass no settings; no other factory( call site in installed src passes a config second arg. (4) plugins/compact-eng/extensions/index.ts:83 `compactEng(pi, config = {})` — second param never populated in production; grep of whole plugin dir for getPluginSettings/PluginManager/settings finds zero reads; governor.ts:20,36-38 holds readonly config set once at construction, never reconfigured. (5) getPluginSettings exists (manager.ts:893) and `omp plugin settings` persists via CLI (plugin-cli.ts:777,812,832); settings UI renders manifest.settings with persisted values (plugin-settings.ts:89-92). (6) Augment precedent reads persisted settings at invocation: plugins/augment/src/enhance.ts:63-65. Net: settings persist and render but governor runs DEFAULT_CONFIG forever. Fix direction confirmed valid: fetch PluginManager.getPluginSettings('@ezxomp/compact-eng') at first command/tool invocation and merge through resolveConfig, or delete omp.settings block and document as test-only.
---

created: 2026-08-30 04:03
---
[REFUTE verdict=upheld] judgeA/B1 (upstreams.lock.json:36 stale 'ultra-compact' lock key): CONFIRMED at task-56.7 tree. Evidence: upstreams.lock.json:36 still keys 'ultra-compact' (package pi-ultra-compact@1.2.1, url+integrity unchanged); scripts/import-upstreams.ts:64-75 FORK_VERSIONS migrated to 'compact-eng' only (2.0.0-ezxomp.0, no ultra-compact entry); importAll:346-347 derives plugins/<slug> from Object.entries(lock.sources) so a re-import would recreate plugins/ultra-compact (dir absent at tree — plugins/ has compact-eng, no ultra-compact); verifyAll:366-372 iterates lock.sources, reports 'MISSING UPSTREAM.json' for the stale slug and never checks compact-eng, so `verify` mode is red at the deliverable tree. Key is consumed by no other active code path (only test/augment.test.ts:211-233 reads the lock and only checks .sources.augment). plugins/compact-eng/UPSTREAM.json already carries the provenance (originalName pi-ultra-compact, url/version 1.2.1/integrity unchanged, localForkVersion 2.0.0-ezxomp.0), so the claimed fix (rename lock key to compact-eng, keep package/url/version/integrity) makes verify metadata-match deterministically and complies with decision-4 provenance policy (pi-ultra-compact stays as upstream package identity, not local slug) and decision-4 item 6 (import-upstreams.ts is a caller that must be migrated). AC1 violated: active stale ultra-compact identity surface remains in a current-state record (README.md:119).
---

created: 2026-08-30 06:05
---
JUDGE FINAL VERDICT (Judge567c, post-repair, independent) @ bookmark task-56.7 = 0b24693e21e68f7d8ffec2e82fa73ef6980a8d18 (d5f91d1a + micro-fix): REVIEW_PASSED — 0 blocking. Round-2 verified behavior-preserving: jj diff 1c2732fe→d5f91d1a = governor.ts ONLY (4 pure helper extractions, Main read-only diff evidence); micro-fix d5f91d1a→0b24693e = index.ts lazy dynamic PluginManager import + 1 README line, tests/governor untouched; full gate re-run green (tsc 0; compact-eng 6/6; Fallow new-only introduced=0; suite 388/18/0/3290).

FOCUS 1 — L4 SAFE (verified against installed OMP 18.0.6 source, not packet claims): (a) mid-stream impossible — agent_end fires after the agent loop settled the turn (agent-session.ts:664-668 internal hooks fire on original schedule while #promptInFlightCount>0; :4571-4573 isStreaming=agent.isStreaming||#promptInFlightCount>0; :6052 isIdle binding), so ctx.compact() at agent_end never aborts in-progress generation; native compact additionally disconnects+aborts with preserveCompaction and awaits waitForIdle before compacting (session-maintenance.ts:754-756, abort path agent-session.ts:6947-6962). (b) pending messages guarded on auto path at boundary (governor.ts:275), pre-request recheck (:306 via :312 hasPendingMessages branch), and attempt recheck (:378). (c) concurrent compaction double-guarded: plugin nativeInFlight (:276,:307,:377) + single-flight coalescing (:47,:80); host hard backstop — native compact throws "Compaction already in progress" (session-maintenance.ts:712-715) and cancels speculation (:753). (d) continuationScheduled (event.willContinue, shared-events.ts:196-202 "not a user-visible terminal settle") checked FIRST at :274; retry turn's terminal agent_end re-evaluates. Manual path unchanged full isSafe (:312 origin=manual → !isSafe(:475-477 isIdle&&!hasPendingMessages)); fallback origin keeps full isSafe (:362-365,:378). L4 regression test asserts all three (auto isIdle=false→native once origin=auto; manual isIdle=false→deferred-pending origin=manual; pending=true→deferred). Live evidence: refute-round herdr e2e + Main's post-fix isolated smoke (extension loads, tool registered, persisted 0.7/32768 rendered).

FOCUS 2 — PURE REFACTOR: automaticUsageDeferral (:64-71), requestOrigin (:89-91), requestGateUnsafe (:311-313), attemptGateUnsafe (:376-379) traced to call sites (:60-61,:81,:306,:370); order sample→circuit→cooldown→autoCompact/watermark preserved; no receipt-field, state-transition, or deferral-precedence change.

PER-AC: AC1 PASS — upstreams.lock.json:36 key=compact-eng (pi-ultra-compact@1.2.1 url/integrity preserved); docs/authoring-extensions.md:128 compact-eng; FORK_VERSIONS import-upstreams.ts:70; repo-wide stale scan clean (remaining hits = allowed CHANGELOG history, UPSTREAM/marketplace/README provenance, backlog docs, dated omp-agent-v1 report, fallow baselines, .jj state). AC2 PASS — registration exactly session_start/shutdown/agent_end/auto_compaction_start/end (index.ts:129-147), no session_before_compact/tool_result/context anywhere in source; compaction only via ctx.compact()/ctx.compact({mode:"snapcompact"}) (:384-389 region); agent_end handler returns void, no compaction result to any hook; negative asserted test/compact-eng.test.ts:50-52. AC3 PASS — coalescing (:47,:80), below-watermark no-op (:64-68), deferral classes, max one fallback, cooldown rearm-then-reevaluate same boundary (advanceCooldown + rearm test). AC4 PASS — text plain ctx.compact() with NO plugin fallback; snapcompact failure/no-progress → at most one text fallback as new generation origin=fallback (runCycle :150-157); no preserveData writes/snapcompact import; skill artifact:// narrow recovery. AC5 PASS — 3 RED contracts intact (not weakened; watermark test still asserts compactCalls===[undefined]), +B3 tool registration/invocation test with typebox/registerTool double and reason debug-log assertion, +L4 regression. AC6 PASS — 2.0.0-ezxomp.0 byte-identical across package.json:2/marketplace.json:39/manifest.test.ts:36/FORK_VERSIONS:70/UPSTREAM.json/bun.lock:88-92; peers exactly pi-coding-agent 18.0.6; files list matches tree; Fallow new-only introduced=0; verify-omp skills:["compact-eng"] (former F1 fixed). BB1 PASS — lazy dynamic import (:99-102), resolveConfig remains validation authority (invalid persisted settings reject loudly per doc-18; unavailable settings system → factory defaults, README:50), persisted values reach governor (isolated smoke).

Round-1 follow-up dispositions verified fixed: nativeObservationEpoch removed; defer→recordDefer; moduleGovernor/__resetModuleState removed; reason now debug-logged (tested); cooldown rearm same-boundary; auto-disabled label; verify-omp skills entry; upstreams lock key; authoring doc roster.

FOLLOW-UP (non-blocking, 2): F1 {source:"judge", file:"backlog/docs/compact-eng/compact-eng-native-composition-architecture/doc-18", line:161, what:"§8 file/symbol map still names __resetModuleState, recordReceipt, settle; implementation removed module-level state (per doc-18 §7 rejection + Judge B FU#5) and uses record/finish/completeCycle — spec doc drift only, no runtime impact, AC text binds behavior not symbol names", kickTo:"plan"} F2 {source:"judge", file:"backlog/decisions/decision-4", line:9 (Consequence 9), what:"ADR says preserve marketplace registry cardinality at 14 plugins; registry has 12 entries at both main baseline and deliverable — renamed-not-added invariant holds (12→12); stale count lives in pre-committed ADR (carried from Judge A F3)", kickTo:"plan"}. No pushes, no main moves performed; read-only review.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped @ezxomp/compact-eng 2.0.0-ezxomp.0: native-composing auto-compaction plugin (governor over OMP-native text/snapcompact) with clean identity cutover from ultra-compact. Deliverable: jj bookmark task-56.7 at 554c6052 (workspace /home/eag1/repo/ezxomp.task-56.7); no push, main untouched.

Verification: dual-judge review (REVIEW_PASSED at final tip) with 5 source-bound refutations (all blocking findings upheld then repaired), independent validator gates green: tsc exit 0; full suite 388 pass/18 skip/0 fail/3290; Fallow new-only introduced=0; import-upstreams 7/7; verify-omp green; direct-source isolated smoke green (extension loads, persisted settings rendered, tools registered).

Key repair (L4): installed OMP 18.0.6 emits agent_end during the prompt unwind while isIdle() is false by construction, so the pre-repair isSafe gate made auto-compaction unreachable live. The AUTO path now treats agent_end as the boundary signal with pending/in-flight/coalescing/continuation guards retained; manual/fallback keep the full idle predicate; receipts carry origin. LIVE retest (herdr ce-run7, post-fix tree): turn 1 pressure 25657→58059 tokens crossed the 32768 trigger, governor issued origin=auto request at agent_end (isIdle=false), TUI rendered "snap-compacted 59K->32K"; turn 2 below-watermark + cooldown respected (no re-request). One native request per boundary, honest no-progress receipt.

Follow-ups (non-blocking, kicked to plan): (1) doc-18 §8 file/symbol map names removed symbols (moduleGovernor/__resetModuleState/recordReceipt/settle) — spec-doc drift only; (2) decision-4 Consequence 9 states 14-plugin cardinality, registry has 12 (invariant holds: renamed not added).
<!-- SECTION:FINAL_SUMMARY:END -->
