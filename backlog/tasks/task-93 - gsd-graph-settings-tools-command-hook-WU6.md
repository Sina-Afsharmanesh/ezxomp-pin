---
id: TASK-93
title: 'gsd-graph: settings/tools/command/hook (WU6)'
status: Done
assignee: []
created_date: '2026-09-06 02:16'
updated_date: '2026-09-06 20:20'
labels:
  - feature
milestone: m-12
dependencies: []
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/{settings,tools,commands,index}.ts final wiring: autoRebuild resolver, gsd_graph + gsd_graph_run tools with every isError path, /gsd-graph subcommand table, session_start autoRebuild stale rebuild. Fake-pi harness bun:test helper. Smoke block.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 6 acceptance cases incl full tool lifecycle to milestone-complete, every validation failure isError, settings passthrough
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @JudgeGraph
created: 2026-09-06 07:18
---
[blocking] plugins/gsd-graph/src/index.ts:15-20 — extension registration only calls setLabel; it leaves TODO stubs for the /gsd-graph command, gsd_graph/gsd_graph_run tools, and auto-rebuild hook. The required registration smoke records CALLS=[["label","GSD Graph"]], and src/commands.ts/src/tools.ts do not exist in the plugin. Implement and register both tools, the table-driven command, and session_start autoRebuild (single false-default setting) before this AC can pass.
---

author: @JudgeGraph
created: 2026-09-06 07:22
---
[follow-up] plugins/gsd-graph/package.json:4,30-35 — manifest description still claims `.planning` artifacts and post-commit auto-rebuild, while the planned shipped behavior is `.gsd/` plus session_start stale rebuild. Update metadata/setting description with the final contract when WU6 lands so settings UI and docs do not promise an absent hook.
---

author: @JudgeGraphR2
created: 2026-09-06 14:22
---
[blocking] plugins/gsd-graph/src/tools.ts:68-73 — graphBuild only calls the pure buildGraph and returns counts; it never writes graph.json or builtAt, so gsd_graph mode=build reports success while status/query still see the old/missing graph. Fix by acquiring the required .gsd/.graph-build.lock and atomically writeGraph after build, returning built:true/nodeCount/edgeCount/builtAt. [blocking] plugins/gsd-graph/src/tools.ts:91-99 — lock acquisition is existsSync then writeFileSync (not exclusive), has no stale-owner takeover, and runs outside a catch; concurrent builds can pass the check and a crashed process leaves a permanent lock/throws instead of the required isError retry path. Reuse withFileLock (or equivalent wx/PID/stale policy) and envelope all failures. [blocking] plugins/gsd-graph/src/tools.ts:164-252 — gsd_graph_run has no outer error-to-envelope boundary; unknown definitions, malformed/escaping runIds, missing GRAPH.yaml, and reconcile failures escape as rejected execute promises instead of {isError:true}. Add the required catch while preserving usage text. [blocking] plugins/gsd-graph/src/tools.ts:53-63 — this resolver ignores extra slash segments and accepts '..' because the regex allows dots, then joins an escaped path; the existing validateRunId guard is unused. Route status/next/complete through validateRunId and enforce the workflow-runs containment. [blocking] plugins/gsd-graph/src/tools.ts:125-130 — query returns an ad-hoc count/list string instead of formatGraphContextBlock (including stale annotation/no-match literal), so the shipped query contract is not observable. [blocking] plugins/gsd-graph/src/tools.ts:241-246 — complete passes any requested step to reconcile without checking that it is the currently active step, allowing a pending/wrong step to be marked complete and violating the single-active invariant; reject with an isError naming the active step. Also return the next dispatch descriptor in complete details.
---

author: @JudgeGraphR2
created: 2026-09-06 14:23
---
[blocking] plugins/gsd-graph/src/commands.ts:75-86 — /gsd-graph build also calls buildGraph without writeGraph or the .graph-build.lock, so it advertises a graph path while persisting nothing and races tool/session builds. Route command builds through one locked build-and-write helper. [blocking] plugins/gsd-graph/src/commands.ts:49-56 — slash-command runId resolution duplicates the unsafe split/regex logic (extra segments ignored; '..' accepted) instead of validateRunId, so status/next/complete can read/write outside workflow-runs. [blocking] plugins/gsd-graph/src/commands.ts:147-164 — run create only creates and reports a run; the documented command contract requires create to resolve/print the first dispatch. [blocking] plugins/gsd-graph/src/commands.ts:96-123 — query emits a count/list summary rather than the required formatted context block, and diff lines 135-138 report edge counts instead of added/removed edge keys. [blocking] plugins/gsd-graph/src/index.ts:28-43 — session_start constructs PluginManager and rebuilds from process.cwd(), ignoring the event handler's ExtensionContext.cwd; an OMP session opened in another cwd reads settings/status and writes the wrong project. The stale path also calls pure buildGraph without lock/write, so autoRebuild never refreshes graph.json. Use the handler ctx, locked atomic build, and keep the existing swallow boundary.
---

author: @JudgeGraphR2
created: 2026-09-06 14:23
---
[blocking] plugins/gsd-graph/src/tools.ts:180-248 — structured details do not match the declared tool contract: list exposes raw RunMetadata (`name/timestamp/status/steps`) instead of runId/createdAt/workflow/phase/completed/total; status exposes only runStatus metadata and omits per-step timestamps/parent IDs/blockedReason; next returns `{action:...}` rather than `{kind:
---

author: @JudgeGraphR2
created: 2026-09-06 14:23
---
[blocking] plugins/gsd-graph/src/tools.ts:180-248 — structured details do not match the declared tool contract: list exposes raw RunMetadata (name/timestamp/status/steps) instead of runId/createdAt/workflow/phase/completed/total; status exposes only runStatus metadata and omits per-step timestamps/parent IDs/blockedReason; next returns an action field instead of kind=dispatch|stop; complete returns only outcome and never includes the next dispatch descriptor. Normalize these payloads before claiming the tool surface is closed.
---

author: @JudgeGraphR2
created: 2026-09-06 14:23
---
[blocking] plugins/gsd-graph/src/tools.ts:88-101 — projectDir is accepted as any string and build resolves a missing .gsd root then writes the lock before entering the try/finally; a nonexistent project therefore throws ENOENT out of execute rather than returning the required isError envelope. Validate that projectDir exists/is a directory and put lock/build setup inside the common error boundary.
---

author: @JudgeGraphR2
created: 2026-09-06 14:26
---
[blocking] plugins/gsd-graph/src/tools.ts:137-145 — gsd_graph mode=diff prints only edge counts, while the contract requires the exact added/removed/changed edge keys in text/details; a model cannot identify which relationships changed. Emit the diff key sets consistently with the command surface.
---

author: @JudgeGraphR2
created: 2026-09-06 14:26
---
[blocking] plugins/gsd-graph/src/commands.ts:223-236 — run complete only notifies the outcome and never prints the next dispatch/stop descriptor; slash-command consumers cannot advance from the documented single call. After validating the active step, print the same next descriptor used by run next (or the final completion message). [blocking] plugins/gsd-graph/src/commands.ts:192-220 — run status prints only aggregate phase/progress/current text and omits timestamps, parent/dependency detail, and a blocked reason when no step is dispatchable; implement the documented status surface rather than exposing a lossy summary.
---

author: @JudgeGraphR3
created: 2026-09-06 16:08
---
[blocking] plugins/gsd-graph/src/tools.ts:69 — gsd_graph mode=build still only calls pure buildGraph; it never writeGraph/persists builtAt, and lines 91-104 use existsSync→writeFileSync instead of acquireBuildLock. The tool reports success while status/query read stale or missing data and concurrent tool/session builds race. Fix tool build through the shared lock + atomic write and return built/nodeCount/edgeCount/builtAt.
[blocking] plugins/gsd-graph/src/knowledge/build-lock.ts:14 — acquireBuildLock catches ENOENT from a missing .gsd parent as if an existing lock, then read/unlink/retries forever. A first build on a project without .gsd therefore hangs (command and session users). Create the parent or rethrow non-EEXIST.
[blocking] plugins/gsd-graph/src/tools.ts:87 — gsd_graph accepts any projectDir without validating an existing directory and has no outer error envelope for graph modes; a typo path can be created by build or thrown lock/write errors escape as rejected tool calls. Add common directory validation and isError wrapping.
[blocking] plugins/gsd-graph/src/tools.ts:115 — empty/absent query term is returned as isError, but the tool contract requires the empty GraphQueryResult/content path for empty terms (command is the usage-error surface).
[blocking] plugins/gsd-graph/src/commands.ts:123 — /gsd-graph query emits a count/label summary instead of formatGraphContextBlock (and never emits the required literal no-match line); malformed/missing budget parsing at 111-114 also accepts parseInt prefixes and silently defaults when the value is missing. Route through the formatter and strict numeric validation.
[blocking] plugins/gsd-graph/src/tools.ts:151 — gsd_graph diff collapses missing graph and missing snapshot to “No differences found” rather than the required build/snapshot hints, misleading callers even though edge keys are now printed exactly.
[blocking] plugins/gsd-graph/src/commands.ts:142 — /gsd-graph diff still prints edge counts, not +/− from->to:type keys, and line 145 also hides missing graph/snapshot as “No differences found.”
[blocking] plugins/gsd-graph/src/tools.ts:224 — gsd_graph_run list exposes raw RunMetadata (name/timestamp/steps/status) instead of the required runs[{runId,createdAt,workflow,phase,completed,total}] shape; line 250 similarly nests dispatch under action/step instead of details.kind + unitId/prompt, and status at 240 omits title/timestamps/parentStepId/blockedReason. These are model-visible contract failures.
[blocking] plugins/gsd-graph/src/commands.ts:156 — run list/status/next/complete output remains lossy: no created timestamp/Step N/M phase in list, no per-step timestamps or blocked reason in status, no unitType dispatch descriptor, and milestone completion omits final Step M/M (status starts at 200; next at 218; complete at 242). Restore the exact command contract.
[blocking] plugins/gsd-graph/src/engine/engine.ts:270 — reconcile permits a pending step when it is the next eligible step, so complete can mark a never-dispatched step complete; the contract requires only the currently active step and an isError naming that active step.
[blocking] plugins/gsd-graph/src/engine/run-manager.ts:184 — listRuns joins an unvalidated caller workflow directly under .gsd/workflow-runs; ../../ traversal can enumerate arbitrary directories outside the run root. Apply the same workflow-name/containment validation to list filters.
[blocking] plugins/gsd-graph/REGISTRATION.patch:36 — the smoke sketch reads only src/index.ts but asserts literal tool names that live in tools.ts, so applying the patch makes the host-registration smoke test fail. Assert the real registration surface (or inspect the registered fake host) as promised.
[blocking] test/gsd-graph.test.ts:1 — the claimed 64 tests contain no fake-Pi harness or WU6 surface calls (no registerGsdGraphTools/registerGsdGraphCommand/session_start/gsd_graph references); 64/64 therefore does not evidence the required tool lifecycle, command, or hook acceptance cases.
[follow-up] plugins/gsd-graph/package.json:4,30-35 — manifest/setting copy still says .planning artifacts and post-git/default-branch rebuild, while shipped behavior is .gsd plus session_start stale rebuild; update user-facing metadata.
[follow-up] plugins/gsd-graph/src/tools.ts:101 and src/commands.ts:85 — build responses never report the +K AMBIGUOUS parser-error count required by the command contract.
---

author: @JudgeGraphR4
created: 2026-09-06 17:06
---
[blocking] plugins/gsd-graph/src/index.ts:30 — session_start ignores the provided ExtensionContext and resolves settings/projectDir from process.cwd(); other extension hooks receive (_event, ctx), so autoRebuild can inspect/rebuild the wrong session. Use ctx.cwd (and ctx-scoped settings) throughout.\n[blocking] plugins/gsd-graph/src/tools.ts:110,129 — resolveProjectDir is applied only to build; status/query/diff (and run list via line 211) consume raw projectDir, so invalid/nonexistent project paths can return successful empty/status envelopes instead of invalid_project_dir. Apply the common validation before every mode.\n[blocking] plugins/gsd-graph/src/tools.ts:140 — the gsd_graph tool checks only Number.isFinite via isFiniteBudget; negative and fractional budgets remain accepted. Enforce a finite non-negative integer at the tool boundary.\n[blocking] plugins/gsd-graph/src/knowledge/format.ts:44 — empty query results render only Nodes (0), with no explicit no-match line; the required consumer-visible no-match message is still absent from both tool and command query output.\n[blocking] plugins/gsd-graph/src/tools.ts:166 and plugins/gsd-graph/src/commands.ts:152 — diff collapses missing graph, missing snapshot, and a genuinely empty diff into No differences found; callers cannot tell that a build/snapshot is required. Add the required state-specific hints.\n[blocking] plugins/gsd-graph/src/tools.ts:222-225 — run create initializes an all-pending graph and returns only runId/stepCount; it never calls resolveDispatch or returns/activates the first dispatch, unlike the command path.\n[blocking] plugins/gsd-graph/src/tools.ts:237-293 and plugins/gsd-graph/src/commands.ts:193-253 — run list/status/next/complete surfaces remain lossy/reshaped: list lacks createdAt/workflow/phase/completed/total, status omits step title/timestamps/parentStepId/blockedReason, next nests the descriptor under action/step instead of the contract fields, and command completion omits the required final progress/descriptor shape. Restore the full schema on every consumer surface.\n[blocking] test/gsd-graph.test.ts:2 — the target still has only WU2/WU4 knowledge/engine tests and no WU6 fake-host registration, tool/command lifecycle, settings passthrough, or all-isError coverage; 64/64 therefore does not evidence the required acceptance surface.\n[follow-up] plugins/gsd-graph/package.json:34 — description now mentions session-start rebuild but claims source-mtime staleness while graphStatus implements the 24-hour age rule; align the setting copy (and the stale WU1/WU6 README/settings comments) with runtime behavior.
---

author: JudgeGraphR5
created: 2026-09-06 19:25
---
[blocking] plugins/gsd-graph/src/tools.ts:120-123 — mode=query still turns an absent/blank term into isError reason=missing_term, but the declared gsd_graph contract and WU2 behavior require an empty GraphQueryResult with formatted no-match content; only the slash command is the usage-error surface. Restore empty-result tool behavior or update the contract and tests.
[blocking] plugins/gsd-graph/src/tools.ts:286-312 — status details expose currentPhase/progressSummary/stepCount plus progress as an object, not required phase and progress:"Step N/M"; next/create/complete stop payloads use stopReason instead of required reason, and complete omits the required next dispatch descriptor. These remain consumer-visible schema mismatches.
[blocking] plugins/gsd-graph/src/commands.ts:211-253 — run list has created timestamp but not the required `Step N/M` progress form, and milestone completion prints `All steps done (N/N)` rather than final `Step M/M`; command status/complete behavior remains unproven by WU6 tests.
[blocking] test/gsd-graph.registration.test.ts:69-147 — WU6 fake-project test stops after completing step-1 and never completes step-2 to milestone-complete; it also does not exercise command run list/status/next/complete or validation rules, so the single WU6 AC is not fully evidenced despite 5/5 registration tests.
---

author: JudgeGraphR5
created: 2026-09-06 19:32
---
[review-passed] f9304a33 (bookmark gsd-graph-wu3wu5) closes all R5 blockers: query empty/absent term now returns no-match result; run list/status/next/complete details match phase/progress/completed/total/dispatch/reason contracts; command list/status/complete parity and full milestone lifecycle are covered by 7 WU6 tests. Evidence: bunx tsc --noEmit exit 0; test/gsd-graph.registration.test.ts 7/7; test/gsd-graph.test.ts 64/64; orchestrator full suite 480/0. Remaining observations are non-blocking docs consistency follow-ups only.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settings/tools/command/hook shipped at gsd-graph-wu3wu5 f9304a33: contract-exact run engine (progress 'Step N/M', reason not stopReason, complete composes full next descriptor), flat completed/total in list+status details, resolveProjectDir gating, writeGraph+acquireBuildLock with parent mkdir, snapshot after graph persist, WU6 registration tests 7/7. REVIEW_PASSED JudgeGraphR4 round 4. Follow-ups (non-blocking): docs still say .planning vs runtime .gsd; tool snapshot param doc vs commands pre-build. Gates: tsc 0, vitest 64/64, registration 7/7. Integrated on gsd-integration 9cd9092.
<!-- SECTION:FINAL_SUMMARY:END -->
