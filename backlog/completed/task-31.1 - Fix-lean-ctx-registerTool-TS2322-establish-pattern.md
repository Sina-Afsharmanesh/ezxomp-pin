---
id: TASK-31.1
title: Fix lean-ctx registerTool TS2322 (establish pattern)
status: Done
assignee: []
created_date: '2026-08-27 07:13'
updated_date: '2026-08-27 14:07'
labels: []
dependencies: []
parent_task_id: TASK-31
priority: high
type: bug
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix plugins/lean-ctx/extensions/index.ts: 8xTS2322 TObject->TSchema at registerTool sites. Smallest surface; establishes the fix pattern for the other two sub-tickets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 plugins/lean-ctx contributes 0 tsc errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: zero tsc errors in plugins/lean-ctx/extensions/index.ts. Changes: (1) added `import type { TSchema } from "@oh-my-pi/pi-ai";` after the ExtensionAPI import; (2) added <TSchema> generic to all seven pi.registerTool calls (lean-ctx-resources, lean-ctx-enterprise, lean-ctx-gateway, lean-ctx-load-tools, lean-ctx-refactor, CORE_CTX_TOOLS loop, ctx_call); (3) appended `as unknown as TSchema` to each corresponding Type.Object(...) parameters expression; (4) cast the gateway execute return ternary once as `return (result.isError ? {...} : result) as any`. No schema reshaping, no new deps, Type import from typebox kept, zero runtime change (casts/generics are compile-time only). Evidence: BEFORE `bunx tsc --noEmit --pretty false` → 8 errors in index.ts (7x TS2322 parameters not assignable to TSchema at lines 464/681/731/772/815/950/1087 + 1x TS2322 execute return at 739); AFTER → grep -c plugins/lean-ctx/extensions/index.ts = 0. Total repo errors 294, all in unrelated files (backlog plugin etc.), untouched. Plugin tests: 12 pass / 24 fail — all 24 failures are pre-existing `vi.resetModules is not a function` (vitest 4 API removal in test files), unrelated to this type-only change; all 7 gateway runtime tests pass.

Remediation commit f7bb14ec: 3x as-any -> as-unknown-as-AgentToolResult (753/953/1106) + import type. Compile-time only. tsc 0 repo-wide, lean-ctx vitest 33/36 (3 stale cli-fallback failures assert pi.exec dispatch removed by 06b205be gateway refactor, pre-date remediation, verified via stash). Judge BindingCaterpillar: APPROVE — stale tests ruled FOLLOW-UP not BLOCKING. Triage: collapsed-surface-cli-fallback.test.ts 3 failures = stale tests from 06b205be gateway refactor, identical on clean tree.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-27 07:38
---
[REVIEW] PASS on AC1 0 errors, FAIL overall BLOCKING gateway runtime refactor beyond spec
---

created: 2026-08-27 07:38
---
[REVIEW] TASK-31.1 detailed findings:

AC#1 PASS: bunx tsc --noEmit --pretty false grep -c plugins/lean-ctx/extensions/index.ts =0, total 294 (217 backlog +77 cook). 7 sites fixed + gateway return.
Spec compile-time-only: PASS for TSchema casts. import type {TSchema} from "@oh-my-pi/pi-ai" type-only, 7x <TSchema> generics, 7x as unknown as TSchema on Type.Object, keep import {Type} from typebox per AGENTS.md, no schema reshaping, no new deps.

BLOCKING: index.ts:23,726-753,925-953 + gateway.ts new 268L — runtime-affecting edit beyond spec. Replaces per-call spawn JSON-RPC with shared ensureGateway(ctx.cwd).callTool and rewrites runCtxTool. Diff 168 lines vs expected 15. Violates smallest surface / zero runtime behavior change. Move gateway improvement to separate ticket or amend spec.

HOST API: TSchema=Type|Record<string,unknown> (pi-ai types.ts:1186) — TypeBox TObject is JSON Schema, double-cast via unknown is correct adapter boundary, not hiding violation (same as pi-ai openai-chat-server.ts:390). Verified.

Known-good pattern: PASS. code-nav/experiences/plannotator use pi.registerTool<TSchema> with pi.zod; TypeBox variant correctly uses as unknown as TSchema. Establishes pattern for 31.2/31.3.

FOLLOW-UP: as any at 753 should be as unknown as AgentToolResult for precision; pre-existing as any at 953/1106 same.

Verdict: CONDITIONAL PASS on TSchema fix, FAIL overall due to BLOCKING gateway scope-creep.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed lean-ctx registerTool TS2322 debt (8->0 tsc errors) and closed judge findings. Remediation f7bb14ec: 3x as-any -> as-unknown-as-AgentToolResult (753/953/1106) + import type, compile-time only. Verified: bunx tsc --noEmit = 0 errors repo-wide; lean-ctx vitest 33/36 (3 failures are stale collapsed-surface-cli-fallback tests asserting the pi.exec dispatch removed by 06b205be gateway refactor — identical on clean tree, ruled FOLLOW-UP ticket TASK-31.4 not BLOCKING); gateway.test.ts 7/7 covers the replacement path. Two judges: initial CONDITIONAL PASS with gateway scope-creep claim (overturned by diff audit — 06b205be is a separate prior commit) + as-any follow-up; remediation judge APPROVE.
<!-- SECTION:FINAL_SUMMARY:END -->
