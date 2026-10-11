---
id: doc-12
title: EVO one-tool EVAL gateway feasibility
type: other
created_date: '2026-08-29 08:42'
updated_date: '2026-08-29 08:42'
tags:
  - evo
  - eval
  - architecture
  - research
---
# EVO one-tool EVAL gateway feasibility

Date: 2026-08-29
Task: TASK-53

## Decision

Do not build a second EVAL gateway in EVO. OMP 18.0.6 already provides it: native `eval` can invoke enabled native and plugin tools as `tool.<name>(args)`. Use OMP Code Mode to collapse model-visible schemas while retaining the full enabled registry behind eval.

The missing capability is a public, provider-neutral API separating **enabled** tools from **directly model-visible** tools.

## Evidence

- `omp://tools/eval.md` documents `tool.<name>(args)`, parallel calls, structured returns, and the checkpoint/rewind exception.
- OMP `src/eval/agent-bridge.ts` creates arbitrary named bridge calls. `src/eval/executor-base.ts` forwards them with the current abort signal and progress callback. `src/eval/py/tool-bridge.ts` resolves them through `session.getToolForEvalBridge(name)` and executes with the live session context.
- `src/session/session-tools.ts` restricts bridge lookup to enabled tools and applies ACP permission wrapping.
- `src/session/code-mode.ts` keeps `eval` plus lifecycle/state tools direct and leaves other enabled tools bridge-only.
- `src/tools/eval.ts` dynamically generates eval declarations from the live bridge tool set, including plugin schemas.
- OMP `docs/settings.md` exposes `providers.openai-codex.codeMode`: `on`, `auto`, or default `off`, plus `codeModeDirectTools`.
- `plugins/evo/extensions/evo/tools.ts` currently removes native write/bash/edit/glob/grep from the enabled set; `evoMain.ts` applies one undifferentiated set through public `setActiveTools()`.
- Public `ExtensionAPI` exposes `getAllTools`, `getActiveTools`, and `setActiveTools`, but no enabled-versus-direct presentation API.
- Live proof: one eval cell successfully invoked native `tool.read(...)` and plugin `tool.backlog_task_view(...)`; the latter returned TASK-53's structured record.

## Boundaries and risks

Facts:

- Bridged extension/plugin tools still pass through `ExtensionToolWrapper`; inner `tool_call`/`tool_result` hooks and blocking decisions run.
- Abort and progress propagate to the inner tool.
- ACP permissions are wrapped at bridge lookup.
- Lookup cannot bypass the enabled-name set.
- Eval is direct in Code Mode and therefore not normally exposed recursively through its own declarations.
- Checkpoint and rewind throw control-flow sentinels and must remain direct.

Risks:

1. Literal eval-only mode breaks lifecycle semantics. Keep OMP's direct floor: `ask`, `todo`, `yield`, `think`, `checkpoint`, and `rewind` as applicable.
2. Enabling all natives broadens capability. Schema hiding is not authorization; EVO must explicitly choose whether its policy permits them.
3. Code Mode is currently provider-configured for OpenAI Codex. Do not emulate it by temporarily swapping `setActiveTools()` around nested calls; concurrent eval cells and restoration create session-global races.
4. A custom name/args dispatcher would duplicate discovery, hooks, approvals, cancellation, progress, results, and telemetry while weakening auditability.

## Options

- New EVO dispatcher: reject; duplicates the host.
- Temporary active-tool swapping: reject; race-prone global state.
- Current EVO filter: does not meet goal; direct schemas remain and denied natives cannot bridge.
- Native Code Mode plus EVO enabled-tool policy: recommended now for Codex.
- Provider-neutral host presentation API: recommended long-term.

## Recommended architecture

Immediate Codex path:

1. Configure `providers.openai-codex.codeMode: on` (or `auto` for marked models).
2. EVO passes the full policy-approved callable registry to `setActiveTools()`.
3. Remove native tools from EVO's denylist only if “all native tools” is the intended permission policy.
4. Keep `codeModeDirectTools` empty unless a lifecycle tool needs direct exposure.
5. Keep approvals and protocol restrictions in owning tools/hooks.

Upstream portable API:

```ts
setToolPresentation({ enabled: string[], direct: string[] })
```

Invariants: `direct ⊆ enabled`; eval lookup uses enabled; provider schemas use direct; eval declarations use `enabled - direct`; host lifecycle tools may be floor-protected; hooks, permissions, abort, progress, and structured results stay on the host execution path.

## Conclusion

The requested capability is feasible and mostly shipped. Pivot EVO onto native Eval Code Mode; do not create another plugin gateway. The justified work is a small Codex policy integration and, for all-provider support, an upstream public direct-versus-enabled presentation API.
