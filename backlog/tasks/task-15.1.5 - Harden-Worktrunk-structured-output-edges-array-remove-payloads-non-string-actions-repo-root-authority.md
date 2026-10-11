---
id: TASK-15.1.5
title: >-
  Harden Worktrunk structured-output edges: array remove payloads, non-string
  actions, repo-root authority
status: Done
assignee: []
created_date: '2026-08-21 21:56'
updated_date: '2026-08-23 01:52'
labels:
  - workflowz-v2
  - hardening
  - worktrunk
dependencies: []
references:
  - plugins/extensible-workflows/src/worktree.ts
parent_task_id: TASK-15.1
priority: low
type: chore
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four verified residuals from the TASK-15.1.2 replacement validator at 8fa1c71c, all outside enumerated ACs but worth closing:
1. plugins/extensible-workflows/src/worktree.ts:259-260 — wt remove stdout shape check accepts any JSON value whose typeof is object, including arrays; stated contract was valid JSON-object.
2. worktree.ts:90-92 — non-string record.action coerces to undefined and bypasses the unknown-action fail-closed branch, degrading to the legacy no-action record instead of rejecting malformed typed output.
3. worktree.ts:54 — containmentError treats target===repoRoot as escaped (!rel), so branchExternalAuthority (line 99) can admit path===jjWorkspace root when a record claims branch===name with a valid action; legitimate wt output never does this and Worktrunk refuses main-worktree removal, but the identity gate should exclude the root explicitly.
4. worktree.ts:219/232-233/242/249 — a matched list row whose path is an empty string passes the typeof-string guard, gains branchExternalAuthority via resolve("")=cwd, and hits `if (!found)` with found="" so cleanup returns silent success with zero removes; the :227 matched-row fail-closed intent is defeated.
Origin: replacement independent validation of final nested branch-claimed parity (production 526238c5 -> 81247440 -> 8fa1c71c, planner tests 77730c78); parity itself confirmed green (gates 35/0/105 + tsc clean at tip; behavioral X1-X8 matrix zero breaks; static DCO/scope clean). Reviewed-acceptable design note: cleanWorktree stops scanning at the first identity-valid row (:243); later unrelated rows are intentionally out of scope for the named-isolation contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 wt remove stdout validation rejects non-object JSON payloads (arrays, primitives) with a structured error while accepting documented objects
- [x] #2 Structured switch/list records with non-string action values are rejected as malformed rather than silently treated as action-less legacy records
- [x] #3 containmentError or its callers refuse the repository root itself as an isolation location so branchExternalAuthority cannot admit path===repoRoot
- [x] #4 Focused regression cases for all three edges pass and the scoped 6-file suite plus scoped tsc stay green
- [x] #5 A schema-2/schema-1 list row naming the requested isolation with an empty-string or otherwise unusable path fails closed with a structured error instead of returning silent no-op success (worktree.ts:219/232-249 empty-path edge found by replacement validator)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WORKER IMPLEMENTATION (2026-08-22): All four residuals fixed in plugins/extensible-workflows/src/worktree.ts. R1 (:259 wt remove shape): guard now `!removed || Array.isArray(removed) || typeof removed !== 'object'` — arrays/null/primitives rejected with 'worktrunk clean returned an invalid structured result'; JSON objects accepted. R2 (:90 action coercion): new pre-coercion branch rejects non-string action values (`worktree switch returned a malformed action: <JSON>`) BEFORE the legacy no-action fallback; undefined stays legal for legacy bare `{path}` records. R3 (:54/:99 root admission): added named predicate `isStrictlyOutsideRepo(base,target)` = resolve(target)!==resolve(base) && containmentError!==undefined; gates BOTH validateSwitchRecord and cleanWorktree list-row authority, so path===repoRoot can never gain branchExternalAuthority while genuine sibling layouts (`${repo}.${name}` beside root) keep working. Also dropped dead `&& !escaped` from the matched-row identity condition so a matched row at ANY non-authoritative location (root included) fails closed with 'worktrunk list returned an invalid structured result' instead of silently skipping to zero-remove success. R4 (:219/232-249 empty path): rowPath extraction now uses usablePath() which requires non-empty strings; matched row with path:"" (schema-1 and schema-2) returns 'worktrunk list returned a matched isolation without a path'. Preserved reviewed design note: scan stops at first identity-valid row; later unrelated rows remain out of scope.

TESTS ADDED (additive only, existing assertions untouched): 5 focused cases appended after the cleanup test in test/workflowz-p1-contracts.test.ts — (a) repo-root-as-isolation refused ('escapes the repository'); (b) non-string actions 7/true/{object}/[array] all rejected as 'malformed action'; (c) matched empty-path row fails closed in BOTH schema-2 ({items:[{branch,worktree:{path:""}}]}) and schema-1 ([{branch,path:""}]) variants; (d) wt remove payloads []/null/42/"gone" all rejected as 'invalid structured result'; (e) pinning case: matched row strictly outside repo keeps clean-side branchExternalAuthority (remove invoked, error undefined). Harness style matches existing block: inline async exec mocks, mkdtemp/rmSync try/finally, expect().toContain.

VERIFICATION: (1) bun test test/workflowz-p1-contracts.test.ts -> EXIT 0, 18 pass / 0 fail / 49 expects (13 pre-existing worktree+gate tests unchanged and green + 5 new). (2) Scoped 6-file packet (workflowz-lifecycle, v2-runtime, p0-tools, p0-runtime-guards, p1-contracts, smoke-workflowz) -> EXIT 0, 43 pass / 0 fail across 6 files, including concurrent ProvenancePlanner lifecycle provenance cases. (3) bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json -> EXIT 1 with exactly 5 diagnostics, NONE in owned files: 4x src/runtime.ts:1051/1082/1128/1129 (exactOptionalPropertyTypes in workflowActivityState region) + 1x plugins/skills/src/gate.ts:101. Attributed pre-existing/baseline: git diff HEAD shows runtime.ts hunks ONLY at ~737 and ~847-855 (ProvenancePlanner provenance fields); error lines 1047-1129 (HEAD-adjusted) are byte-identical to HEAD, and plugins/skills is untouched by all three stations (TS toolchain is typescript@7.0.2 via bun store). My two files produce zero tsc diagnostics. Per ownership contract (worktree.ts + additive tests only) these out-of-scope baseline errors were NOT touched — orchestrator decision needed on whether AC#4's 'scoped tsc stays green' clause accepts baseline-red-outside-ownership; behavioral clauses of AC#4 (new cases pass, 6-file suite green) verified objectively.

OTHER DECISIONS: CHANGELOG.md got one entry under ## [Unreleased] -> ### Changed describing all four hardenings (append-only; concurrent sibling entries preserved). No commits made. No jj/git mutations. Files touched: plugins/extensible-workflows/src/worktree.ts (+19/-6 net per diff stat incl. predicate + guards), test/workflowz-p1-contracts.test.ts (+97), CHANGELOG.md (+1).

Orchestrator post-expiry verification (2026-08-22): worker applied all four fail-closed fixes in src/worktree.ts (array remove-payload rejection incl. Array.isArray guard; non-string action rejected as malformed; repo-root isolation refused via strict-outside predicate replacing !rel identity admit; empty-string matched-row path fails closed with structured error) plus dropped dead `&& !escaped` condition and added 5 focused cases to test/workflowz-p1-contracts.test.ts. Focused run after revival: bun test test/workflowz-p1-contracts.test.ts -> 18 pass / 0 fail / 49 expect (13 pre-existing + 5 new edge/pinning cases). Scoped 6-file packet + scoped tsc deferred to integration verification wave because sibling stations hold concurrent uncommitted edits in adjacent files.

AC#4 scoped-tsc clause resolution (2026-08-22): the 5 pre-existing exactOptionalPropertyTypes diagnostics blocking 'scoped tsc green' were mechanically cleared by a later station in the same session (runtime.ts activity-state optionals widened; plugins/skills/src/gate.ts config optionals widened — behavior-preserving, no API change). Post-cleanup: bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json exits 0 AND root bun run check exits 0. Combined with the already-green scoped 6-file packet (43 pass / 0 fail), AC#4 is objectively satisfied.

REWORK for comment #3/#5 BLOCKING (2026-08-23): MECHANISM - worktree.ts:267-279 R1 guard replaced. New acceptance: parse remove stdout; normalize `removed` to a record list (`Array.isArray(removed) ? removed : [removed]`); require non-empty list where EVERY element is a plain object (`!!record && typeof === 'object' && !Array.isArray(record)`). Accepts: single object (documented shape) AND pretty-printed array-of-objects (installed v0.74.0 shape). Rejects: null/undefined/scalars/primitive-element arrays/empty arrays, error now reads 'worktrunk clean returned an invalid structured result; the removal may have been performed - verify with wt list' because wt remove has already executed at validation time (destructive-then-error window closed; no undo attempted per spec). Both the wellFormed branch and JSON.parse catch return that message. wt-binary-absent environments unaffected (guard only runs after successful remove exec). TESTS - one additive golden case in test/workflowz-p1-contracts.test.ts: 'accepts the real Worktrunk v0.74.0 pretty-printed array remove payload' pins the VERBATIM captured stdout (multi-line array with branch/branch_checked_out_at:null/branch_outcome:not_attempted/kind/path fields) asserting error undefined + exactly one wt remove invocation; existing [] /null/42/'gone' rejection cases remain valid under the widened contract (they are empty-array/null/scalar payloads) so NO existing expectation was modified - zero test edits to prior assertions.

REWORK VERIFICATION (2026-08-23): (1) bun test test/workflowz-p1-contracts.test.ts -> EXIT 0, 19 pass / 0 fail / 51 expects (18 prior incl. all rejection fixtures unchanged + new golden case). (2) bun test workflowz-lifecycle + v2-runtime + p0-tools + p0-runtime-guards + smoke-workflowz -> EXIT 0, 25 pass / 0 fail / 84 expects across 5 files. (3) bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json -> EXIT 0 clean. (4) Live-binary empirical re-check: independently reproduced the payload against /home/linuxbrew/.linuxbrew/bin/wt v0.74.0 in a scratch git repo (wt switch --create p1-isolation then wt remove --no-delete-branch --foreground --format json p1-isolation; rc 0; stdout = pretty-printed single-element array) BEFORE implementing, so the golden fixture is byte-grounded in observed reality, not doc claims. Status left In Progress for re-judge. Ownership respected: only plugins/extensible-workflows/src/worktree.ts (+8/-2 net region swap) and additive test block touched; CHANGELOG.md:33 wording amendment flagged to orchestrator in comment #7 instead of edited (outside ownership); no commits.

ReJudge round-2 rework verified: R1 widened to object-or-object-array matching live wt v0.74.0 (golden fixture pins captured pretty-printed payload); null/scalars/primitive-element arrays still rejected; unrecognized-shape error warns removal may have occurred. Contract correction rationale in comment #7; focused suite 19 pass / 0 fail / 51 expect.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-22 22:13
---
AC#4 left unchecked deliberately: its 'scoped tsc stays green' clause fails objectively (bunx tsc --noEmit -p plugins/extensible-workflows/tsconfig.json -> exit 1) but every diagnostic sits OUTSIDE the worker ownership contract: 4x src/runtime.ts:1051/1082/1128/1129 (exactOptionalPropertyTypes in workflowActivityState region, byte-identical to HEAD lines 1043/1074/1120/1121 after subtracting concurrent sibling hunks) + 1x plugins/skills/src/gate.ts:101 (empty git diff vs HEAD — untouched by all stations). Zero diagnostics in worktree.ts or the added tests. Worker is contractually barred from editing other source files while ProvenancePlanner/P3PolishWorker hold live edits nearby, so baseline debt needs an orchestrator decision: dedicated cleanup ticket, or fold into the owning station's scope. Behavioral clauses of AC#4 ARE verified: 18 pass/0 fail p1-contracts incl. 5 new focused cases; 43 pass/0 fail scoped 6-file packet.
---

author: JudgeW2.verifyV3-worktree-attack
created: 2026-08-23 00:13
---
[follow-up] plugins/extensible-workflows/src/worktree.ts:250 — `if (rowPath === undefined)` inside the identityValid block is unreachable dead code: :234 already returns unless `typeof rowPath === "string"` and rowPath is a const binding, so it is narrowed to string from :234 onward. Defensive redundancy only, zero runtime effect; may be deleted or kept as belt-and-braces. Adversarial verification of TASK-15.1.5 found NO blocking issues: R1 (:269 array/null/primitive rejection matches upstream worktrunk remove payload `{kind,branch,path,branch_outcome,...}` — object, never array); R2 (:95-97 non-string action rejected, undefined legacy-legal — upstream SwitchJsonOutput.action is a &'static str of exactly created/existing/already_at); R3 (isStrictlyOutsideRepo :58-61 excludes root at BOTH :107 and :242, sibling layout :76 preserved, dead `&& !escaped` removed :243, no path===root reaches wt remove :265); R4 (usablePath :227-228 makes empty-string paths unusable, matched row → structured error :236; previously "" slipped to containmentError(resolve(""))=process.cwd() and could nondeterministically gain authority). Targeted suite green: 18 pass / 0 fail.
---

author: JudgeW2.verifyV3-worktree-attack-2
created: 2026-08-23 00:31
---
[BLOCKING] plugins/extensible-workflows/src/worktree.ts:269 — R1 guard rejects the ACTUAL output of the installed Worktrunk binary, regressing the happy path vs HEAD. Empirical ground truth (wt v0.74.0, /home/linuxbrew/.linuxbrew/bin/wt): `wt remove --no-delete-branch --foreground --format json <name>` emits a PRETTY-PRINTED JSON ARRAY [{kind,branch,path,branch_outcome,branch_checked_out_at}] — captured verbatim in a scratch repo. End-to-end harness feeding real schema-1 list rows + the real remove payload through cleanWorktree: remove IS invoked (worktree deleted) then returns {error:'worktrunk clean returned an invalid structured result'}; caller p0-tools.ts:486 maps that to fail('Worktree clean failed') — every genuine cleanup now reports failure after succeeding. HEAD old guard (:259-260 `removed===null||typeof!=='object'`) ACCEPTED arrays and returned ok. The prior judge claim 'upstream payload {kind,...} — object, never array' is empirically false for the installed binary (upstream docs describe one-object-per-removal NDJSON; local binary wraps in array). The post-remove shape check buys zero security (removal already executed, content unused) while breaking every real call — false-positive class, attack angle 1 confirmed. FIX: accept Array.isArray(removed) when every element is a non-null object (or normalize NDJSON), keep rejecting null/scalars/garbage; add a golden test pinning the REAL captured v0.74.0 payload as accepted; amend CHANGELOG.md:33 wording. Re-verify against the live binary.
---

author: JudgeW2.verifyV3-worktree-attack-2
created: 2026-08-23 00:31
---
[verified-nonblocking] Remaining attack angles closed with evidence: (2) unrelated-malformed-row fail-closed predates this delta byte-for-byte (old :225-227 identical); real wt list rows always carry paths (empirical schema-1 probe; branch-without-worktree emits NO row); main-worktree row whose path===repoRoot correctly skipped (harness reached remove). (3) Root refusal complete: matched row/record at repoRoot errors before directory validation and never reaches wt remove (isStrictlyOutsideRepo :59-61 gating :107/:242). (4) :250 `if (rowPath===undefined)` unreachable after :234 — follow-up, already on record. (5) resolveWorktree parity intact; positive pinning case proves external-sibling authority end-to-end (remove invoked, error undefined). R2 sound: non-string action incl. null rejected pre-fallback, undefined legacy-legal; real switch output captured as string action.
---

author: cook-judge
created: 2026-08-23 00:36
---
[blocking] JUDGE VERDICT (JudgeW2): REVIEW_FAILED — one blocking finding (discovered by adversarial verification with empirical ground truth), everything else verified sound. BLOCKING (AC#1-vs-installed-reality): worktree.ts:269 R1 guard `!removed || Array.isArray(removed) || typeof removed !== 'object'` rejects arrays, but the INSTALLED Worktrunk binary (v0.74.0) emits `wt remove --format json` payloads as a JSON ARRAY — captured empirically with the exact argv the code uses; upstream docs describe NDJSON objects, so docs and installed binary disagree. End-to-end proof through the real cleanWorktree module with the real captured payload: the worktree IS removed, then the function returns {error:'worktrunk clean returned an invalid structured result'} — i.e., every real successful clean now deletes-and-then-reports-failure on this machine, a functional regression vs HEAD (which accepted arrays). omp_workflow_worktree clean surfaces that fail() to callers (p0-tools.ts:486-505 region). Note AC#1's literal text ('rejects non-object JSON payloads (arrays, primitives)... while accepting documented objects') encodes the same wrong assumption — code matches the ticket but breaks the feature against the primary toolchain; 'documented objects' is ambiguous between upstream docs and the pinned binary. Fix options: normalize shape (accept a JSON object OR an array wrapping object rows; keep rejecting null/primitives/scalars), add a fixture from the captured v0.74.0 payload, and reconcile AC#1 wording or pin/document a supported worktrunk version range.
---

author: cook-judge
created: 2026-08-23 00:36
---
JUDGE VERDICT (JudgeW2) verified-sound surfaces + follow-ups: R2 non-string action rejection before legacy fallback with undefined still legal for bare legacy records (worktree.ts:95-97) ✓; R3 isStrictlyOutsideRepo predicate (:59-61 = resolve-inequality AND containmentError) correctly excludes path===repoRoot from branchExternalAuthority at BOTH validateSwitchRecord (:107 → escaped-error fail-closed :108-110) and cleanWorktree rows (:242 → matched-root row fails closed via isolationIdentityError :244-247), while genuine sibling layouts ${repo}.${name} keep working (isolationIdentityError :76) ✓; dead `&& !escaped` removed from the matched-row condition (:243) so matched rows at ANY non-authoritative location fail closed instead of silent zero-remove success ✓; R4 usablePath (:237-238) forces non-empty strings and matched empty-path rows return the structured 'matched isolation without a path' error in BOTH schema-2 and schema-1 shapes (:240-243) ✓; first-identity-valid-row scan-stop design note preserved (:253) ✓; wt remove null/primitives rejection correct per contract (:269). Tests strictly additive (+97/-0, 5 focused cases incl. the pinning case proving strictly-outside authority still removes); focused suite 18 pass/0 fail reproduced; scoped packet 54 pass/0 fail/202 expect; plugin tsc + root bun run check exit 0 (the 5 prior exactOptionalPropertyTypes diagnostics were cleared by sibling type-widening in runtime.ts activity-state block and plugins/skills/src/gate.ts — the latter verified purely type-level, behavior-preserving ✓). FOLLOW-UPs: (1) worktree.ts:250 `if (rowPath === undefined)` inside identityValid block is unreachable dead code after :234 guarantees rowPath is a string (also flagged by verifier); (2) given docs-vs-binary shape drift, consider a tiny shape-normalization helper shared by switch/remove parsing so future Worktrunk version bumps have one place to adapt.
---

created: 2026-08-23 00:39
---
CONTRACT CORRECTION (worker rework, 2026-08-23): AC#1's original text ('rejects non-object payloads (arrays, primitives)') was written against the assumption that wt remove emits a single JSON object. Empirical ground truth refutes that for the installed binary: `wt remove --no-delete-branch --foreground --format json <name>` on worktrunk v0.74.0 (/home/linuxbrew/.linuxbrew/bin/wt) emits a PRETTY-PRINTED JSON ARRAY of record objects — independently reproduced by this worker in a scratch repo (created via `wt switch --create p1-isolation`, then removed; verbatim stdout captured: [ { branch, branch_checked_out_at: null, branch_outcome: "not_attempted", kind: "worktree", path } ]). The R1 guard therefore accepts the union of real shapes: single JSON object OR non-empty array whose elements are all plain objects; null/scalars/primitive-element arrays/empty arrays still fail closed as 'invalid structured result'. Unrecognized shapes now report 'the removal may have been performed - verify with wt list' because wt remove has already executed destructively at validation time (closing the destructive-then-error window from comment #3). Existing rejection fixtures ([]/null/42/\"gone\") remain valid under the widened contract - no existing expectation required updating; the golden fixture pinning the verbatim v0.74.0 payload was ADDED. Note for orchestrator: CHANGELOG.md line 33 still reads 'wt remove output must be a valid JSON object (arrays and primitives rejected)' - factually superseded by this correction but outside this station's file ownership; wording should be amended by the owner of CHANGELOG.md.
---

author: cook-judge
created: 2026-08-23 01:36
---
JUDGE VERDICT (ReJudge, final repair verification): REVIEW_PASSED — R1 rework genuinely closed on end-state bytes.

R1 CLOSED: worktree.ts:267-279 remove-shape guard now parses stdout and normalizes `removed` to a record list (`Array.isArray(removed) ? removed : [removed]`, :274), then requires a NON-EMPTY list whose EVERY element is a plain non-array object (:275). Accepts the documented single object AND the installed v0.74.0 pretty-printed array-of-objects; rejects null/undefined, scalars, primitive-element arrays, and empty arrays. BOTH the wellFormed branch and the JSON.parse catch return the destructive-window warning 'worktrunk clean returned an invalid structured result; the removal may have been performed - verify with wt list' (:276/:278) — honest now that removal has already executed. Guard still runs only after a successful remove exec, so wt-binary-absent environments are unaffected.

Golden test present: 'accepts the real Worktrunk v0.74.0 pretty-printed array remove payload' (test/workflowz-p1-contracts.test.ts:376-409) pins the verbatim multi-line captured payload (branch / branch_checked_out_at:null / branch_outcome:'not_attempted' / kind:'worktree' / path) and asserts error undefined plus EXACTLY ONE wt remove invocation. Existing rejection fixtures intact at :362 — '[]', 'null', '42', '"gone"' all still expect 'invalid structured result', which remains correct under the widened contract (empty array / null / scalar payloads); zero prior assertions modified (git numstat p1-contracts = +132/-0 pure insertions). All first-wave focused cases still present and green (root refusal :302, non-string action :317, empty matched-row path :335, remove shape :356, strictly-outside pinning :411).

Spot-run: p1-contracts included in 60 pass / 0 fail / 308 expect across p3-polish+governance+p1-contracts+lifecycle; repo gate already green per orchestrator context (just verify exit 0, RUN_SMOKE=1 smoke twice).

FOLLOW-UPs (non-blocking, carried): (1) worktree.ts:250 `if (rowPath === undefined)` unreachable after :234 narrowing (belt-and-braces); (2) no fixture yet for a NON-empty primitive-element array (e.g. '[1]') — rejected by the same records.every clause as scalars, but untested directly; (3) test title :356 wording stale vs widened contract; (4) CHANGELOG.md line 33 wording amendment still owed by its owner per comment #7.
---

author: cook-judge
created: 2026-08-23 01:36
---
Evidence: end-state read of worktree.ts cleanWorktree tail (236-281) and full p1-contracts test map; git numstat audit (+132/-0); suite spot-run exit 0.
---
<!-- COMMENTS:END -->
