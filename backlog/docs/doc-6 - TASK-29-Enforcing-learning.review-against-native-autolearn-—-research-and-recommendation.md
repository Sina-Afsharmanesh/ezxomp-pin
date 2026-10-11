---
id: doc-6
title: >-
  TASK-29: Enforcing learning.review against native autolearn — research and
  recommendation
type: other
created_date: '2026-08-23 08:54'
tags:
  - research
  - TASK-29
  - learning-review
  - autolearn
---
# TASK-29 — Enforcing `learning.review` Against Native Autolearn

**Decision: (a) Config guidance — document `autolearn.autoContinue:false` when `learning.review` is ON, with upstream feature request (b) tracked and deferred. Plugin-side `tool_call` block (c) feasible but NOT adopted this milestone.**

- Date: 2026-08-23
- Researcher: ResearchT29
- Scope: strictly read-only for user state (`~/.omp/agent/managed-skills` not mutated); grounded in `pi-coding-agent` 17.4.x source under `node_modules/@oh-my-pi/pi-coding-agent/src`

---

## 1. Grounding

**Native write paths (no review):**
- `src/tools/learn.ts:14-22` — `LearnTool.createIf(session)` requires `autolearn.enabled===true` && `memory.backend ∈ {hindsight,mnemopi,local}`; `execute()` persists lesson then optionally `sanitizeSkillName` + `writeManagedSkill`.
- `src/tools/manage-skill.ts:18` — `ManageSkillTool.createIf` requires only `autolearn.enabled`; `execute()` → `writeManagedSkill`/`deleteManagedSkill` to `~/.omp/agent/managed-skills/<name>/SKILL.md`.
- `src/autolearn/managed-skills.ts:12,30-70` — `getManagedSkillsDir() → ~/.omp/agent/managed-skills`, `writeManagedSkill`, 64 KB cap.
- `src/autolearn/controller.ts:98-128` — `AutoLearnController` on `agent_end` checks `autolearn.enabled`, `minToolCalls`, plan/goal; **only if `autolearn.autoContinue===true`** fires `AUTOLEARN_NUDGE_AUTOCONTINUE` synthetic turn that lets model call `learn`/`manage_skill`.

**Settings:**
- `src/config/settings-schema.ts:2645` — `"autolearn.enabled": boolean default false`
- `src/config/settings-schema.ts:2656` — `"autolearn.autoContinue": boolean default false condition:autolearnActive`
- `src/config/settings-schema.ts:2669` — `"autolearn.minToolCalls": number default 5`
- `src/config/settings-schema.ts: ~2580` — `"memory.backend": enum ["off","local","hindsight","mnemopi"] default "off"` — TASK-27 context: `mnemopi` + `autolearn.enabled=true` + `autoContinue=true`.

**Discovery:**
- `src/extensibility/skills.ts:52` — `isNameClaimedByAuthoredSkill(name)` checks `skill._source.provider !== MANAGED_SKILLS_PROVIDER_ID`; `loadSkills` discovers managed-skills dead-last so authored wins.

**Plugin advisory gate (D3):**
- `plugins/agent-learning/src/review-gate.ts:1-48` — `isReviewGateEnabled()` = `LEARNING_REVIEW=1|true|yes|on` env OR `~/.omp/agent/agent-learning.json {"review":true}` strict boolean; `registerReviewGate(pi)` → `pi.on("before_agent_start")` emits `LEARNING_GATE_GUIDANCE` (“facts→native memory, gotchas→skillforge_capture_memory, habits→/experience”). Header: *“Explicit non-goal: mutating native autolearn settings or intercepting the native learn/manage_skill tools — this gate is advisory wiring only.”*
- `plugins/agent-learning/src/procedures/extension.ts:110-220` — reviewed lane `skillforge_capture_memory` under `<agentDir>/agent-learning`, promotion threshold `confirmed+hits>=3+skills[]`.
- `backlog/docs/doc-5/doc-5 - Consolidated-agent-learning-plugin-skills-skillforge-experiences-module-spec.md: Edge cases` — “When ON: … No direct writes to managed-skills/ from autolearn; When off: legacy preserved.”
- `backlog/tasks/task-27:Plan D3` — `learning.review` default off, capture-classification + guidance, non-goal is intercepting `learn`.

**Supported extension seam (proves (c) is not invasive):**
- `src/extensibility/extensions/runner.ts:265-330` — `async emitToolCall(event: ToolCallEvent, signal?): Promise<ToolCallEventResult>` iterates `tool_call` handlers under `extensionHandlers.toolCallTimeoutMs` (default 30s, fail-closed timeout→`{block:true}`), returns `{block,reason}` or `{input}`.
- `src/extensibility/extensions/wrapper.ts:65-230` — `class ExtensionToolWrapper` wraps **every** `AgentTool` (incl. learn/manage_skill) via `SessionTools`; `execute()` does `emitToolCall({type:"tool_call",toolName,input:normalizeToolEventInput(...)})` before approval/execution. All tools share path.
- `src/extensibility/extensions/types.ts:930 + src/extensibility/shared-events.ts` — `ToolCallEvent = … | CustomToolCallEvent {toolName:string,input:Record<string,unknown>}` (learn/manage_skill variant), `ExtensionAPI.on("tool_call", handler)`.

**Approval alternative:**
- `src/tools/approval.ts` + `src/config/settings-schema.ts:tools.approval` — per-tool `allow|prompt|deny`.

Verified via `node:fs` exact-byte reads (bypassing lean-ctx triage). Artifacts archived.

---

## 2. ADHD — divergent frames then focus

Economic: guidance 1 doc + 1 string; block ~25 LOC + tests; upstream PR weeks.
Security: guidance advisory; block hard; upstream strongest.
Performance: guidance zero; block O(1) `isReviewGateEnabled()` per call, short-circuit when off.
UX: guidance low surprise; block medium (explicit `manage_skill` suddenly throws); upstream low (native UI).
Maintainability: guidance low (one constant); block medium (couples to `learn` `params.skill` shape); upstream lowest long-term.
Scoring → guidance wins for m-0: `autoContinue:false` already severs autonomous path; remaining unreviewed path is intentional human calls where advisory is correct. Hard block is YAGNI (managed-skills isolated, dead-last, authored-wins, 64 KB cap — harm is bloat, not corruption).

---

## 3. Evaluation

| Option | Invasiveness | Maintenance | Surprise | Enforceability | Verdict |
|---|---|---|---|---|---|
| (a) Config guidance | None (no mutation, preserves D3) | Low | Low | Advisory (relies on `autoContinue:false`) — sufficient because autonomous path is solely that flag | **Recommend for TASK-29 apply wave** |
| (b) Upstream `autolearn.review` | None local | Low long-term | Low | Strong | Track + defer (correct long-term, not actionable now) |
| (c) Plugin `tool_call` block | Low-tech but high-UX (blocks intentional human calls) | Medium (param-shape coupling, fail-closed timeout) | Medium | Strong | Dismiss for m-0 — feasible per `runner.ts:emitToolCall`/`wrapper.ts:ExtensionToolWrapper` but surprise/maintenance outweigh gain |
| (d) Hybrid | Highest complexity | Medium-high | Medium | Strong | Dismiss — violates minimum correct change |

---

## 4. Recommendation — (a) with (b) tracked

**Autonomous unreviewed writes are solely `AutoLearnController#onAgentEnd` → `autoContinue` synthetic turn → `learn`/`manage_skill`. Source shows `src/autolearn/controller.ts:120-128` early-returns when `autoContinue===false`. Setting `autolearn.autoContinue:false` eliminates the invariant violation without touching `autolearn.enabled` (which must stay `true` for manual `learn` per `src/tools/learn.ts:createIf`). Intentional `learn` without `skill` (facts lane) is explicitly exempt per `review-gate.ts` (“facts → native memory (no review)”), so blocking all `learn` would break lane design. Harm of managed-skills is low (isolated dir, dead-last discovery, authored-wins, 64 KB cap). Supported `tool_call` seam exists but adds UX surprise + maintenance for marginal gain.**

---

## 5. Implementation shape (worker executes without further design)

### 5.1 Config to document

User config `~/.omp/agent/config.json` (or `/settings`):

```jsonc
{
  "autolearn.enabled": true,   // keep true so manual learn/retain stays
  "autolearn.autoContinue": false, // ← DISABLE when learning.review ON
  "autolearn.minToolCalls": 5,
  "memory.backend": "mnemopi"
}
```

Learning-review flag (choose ONE per `plugins/agent-learning/src/review-gate.ts:isReviewGateEnabled`):
- Env `LEARNING_REVIEW=1|true|yes|on` ( `0` forces off, env wins)
- File `~/.omp/agent/agent-learning.json` → `{"review": true}` (strict `=== true`)

Optional hard freeze (document as opt-in, not default):
```jsonc
{ "tools.approval": { "manage_skill": "deny" } }
```
`learn:deny` too strong (blocks facts lane) — advise against.

No programmatic mutation of user config (preserve D3).

### 5.2 Doc-5 edge-case text to add (apply wave only; this wave read-only)

Append under `## Edge cases` in `backlog/docs/doc-5/doc-5 - Consolidated-agent-learning-plugin-skills-skillforge-experiences-module-spec.md`:

> #### Learning-review enforcement (TASK-29, 2026-08-23)
> - Source: native `autolearn` (`src/autolearn/controller.ts` synthetic turn + `src/tools/learn.ts`/`src/tools/manage-skill.ts` → `src/autolearn/managed-skills.ts:writeManagedSkill` to `~/.omp/agent/managed-skills`) has no review gate. Plugin `learning.review` (`plugins/agent-learning/src/review-gate.ts` — env `LEARNING_REVIEW` or `agent-learning.json`, `before_agent_start` guidance, D3 advisory-only) routes plugin captures but does not mutate `autolearn.*` or intercept `learn`/`manage_skill`.
> - Enforcement by config (adopted): when `learning.review` ON, set `autolearn.autoContinue:false` (keep `autolearn.enabled:true`). Severs autonomous path (`AutoLearnController#onAgentEnd` early-return). Alternative `tools.approval.manage_skill:deny` is stronger but blocks intentional maintenance — not recommended.
> - Why not `tool_call` block in m-0: supported seam exists (`src/extensibility/extensions/runner.ts:emitToolCall` + `src/extensibility/extensions/wrapper.ts:ExtensionToolWrapper` → `pi.on("tool_call", …)=>{block}` fail-closed), so hard-blocking is feasible. Rejected for m-0 on UX (blocks explicit human `manage_skill`/`learn {skill}`) and maintenance (couples to `learn` param shape) — `autoContinue:false` already covers autonomous path (only true bypass). Re-examine only if `managed-skills` grows while gate ON; upstream `autolearn.review` is preferred long-term (tracked issue).
> - Invariant after triage: no `unclassified` entries per TASK-29 AC3; `learning.review`-ON sessions produce zero autonomous managed-skill writes.

### 5.3 Code worker MUST write

1. `plugins/agent-learning/src/review-gate.ts` — enhance guidance (no `tool_call` handler):
```ts
export const LEARNING_GATE_CONFIG_NOTE =
  "Config when this gate is ON: set autolearn.autoContinue:false in ~/.omp/agent/config.json (or /settings → memory·Auto-Learn → Auto-run capture at stop OFF). Keep autolearn.enabled:true so manual learn/retain stays available. Optional hard freeze: tools.approval.manage_skill: deny.";
// in registerReviewGate → before_agent_start handler:
return { message: { customType: "omp-agent-learning-gate", content: LEARNING_GATE_GUIDANCE + "\n" + LEARNING_GATE_CONFIG_NOTE, display: false, details: { gate: "learning.review", enabled: true } } };
```
2. `plugins/agent-learning/README.md` — add “Learning-review enforcement” section with snippet from §5.1 + link to doc-5.
3. `CHANGELOG.md` — Unreleased: `agent-learning: document learning.review ↔ autolearn.autoContinue enforcement; guidance enhanced; upstream autolearn.review issue filed (deferred).`

No edits to `src/autolearn/*`, `src/tools/*`, user `managed-skills`, or doc-5 in this wave (doc-5 in apply wave per constraint).

### 5.4 Tests (apply wave, targeted only)

New `test/agent-learning-review-gate.test.ts` (or extend `test/agent-learning.test.ts`):
- `isReviewGateEnabled` truth table (env 1/true/yes/on→true, 0→false, file `{"review":true}`→true, malformed→false, env wins)
- `registerReviewGate` stub `pi {on: vi.fn()}` — gate ON returns message containing `LEARNING_GATE_GUIDANCE` + `LEARNING_GATE_CONFIG_NOTE` mentioning `autolearn.autoContinue:false`; gate OFF returns undefined
- No `tool_call` registration

Run `bun test test/agent-learning*.test.ts` only (skip `just verify` per this wave constraint).

### 5.5 Verification

- New gate tests green, isolated via `PI_CODING_AGENT_DIR` temp dir harness
- `LEARNING_REVIEW=1` smoke shows appended note; `0` shows none
- `grep -n "autolearn.autoContinue" plugins/agent-learning/README.md` hits

### 5.6 Risks

- Config drift (gate ON but user forgets `autoContinue:false`) — mitigation: every-turn guidance surfaces remediation; follow-up can add `managed-skills` growth check while gate ON.
- Env vs file precedence confusion — document table.
- Future pi rename of `autolearn.autoContinue` — cite file path for grep.

---

## 6. Alternatives dismissed

- **(c) `tool_call` block** — dismissed not for lack of seam (proved via `runner.ts:emitToolCall` + `wrapper.ts:ExtensionToolWrapper` + `types.ts:CustomToolCallEvent`) but for UX surprise, param-shape coupling, and redundancy vs `autoContinue:false`.
- **(b) as sole answer** — ideal long-term, not actionable now; file issue `upstream: add autolearn.review routing (fact→memory, procedure→promotion, habit→experience) when learning.review true` citing `controller.ts:120`, `learn.ts:14`, `runner.ts:emitToolCall`, D3; mark deferred.
- **(d) Hybrid** — over-engineering for m-0; prefer (a)+(b), revisit (c) only on evidence.
- **`tools.approval.manage_skill:deny` default** — too strong, blocks intentional maintenance.

---

## 7. Evidence — exact file citations

- `node_modules/@oh-my-pi/pi-coding-agent/src/tools/learn.ts:14` — `if (!session.settings.get("autolearn.enabled")) return null; … memory.backend ∈ {hindsight,mnemopi,local}`
- `node_modules/@oh-my-pi/pi-coding-agent/src/tools/manage-skill.ts:18` — `if (!session.settings.get("autolearn.enabled")) return null;`
- `node_modules/@oh-my-pi/pi-coding-agent/src/autolearn/managed-skills.ts:12` — `getManagedSkillsDir() → join(getAgentDir(), "managed-skills")`
- `node_modules/@oh-my-pi/pi-coding-agent/src/autolearn/controller.ts:98,120` — `if (!settings.get("autolearn.enabled")) return; const autoContinue = settings.get("autolearn.autoContinue")===true; if (!autoContinue) return;`
- `node_modules/@oh-my-pi/pi-coding-agent/src/config/settings-schema.ts:2645` — `"autolearn.enabled": {type:"boolean",default:false,…}`
- `node_modules/@oh-my-pi/pi-coding-agent/src/config/settings-schema.ts:2656` — `"autolearn.autoContinue": {type:"boolean",default:false,…}`
- `plugins/agent-learning/src/review-gate.ts:1` — `Explicit non-goal: mutating native autolearn settings or intercepting… advisory wiring only.`
- `plugins/agent-learning/src/review-gate.ts:12` — `isReviewGateEnabled()` env/file logic
- `plugins/agent-learning/src/review-gate.ts:24` — `LEARNING_GATE_GUIDANCE`
- `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/runner.ts:265` — `async emitToolCall … for (ext.handlers.get("tool_call")) … if (result.block) return result;` + fail-closed docblock
- `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/wrapper.ts:65` — `class ExtensionToolWrapper … emitToolCall({type:"tool_call",toolName,…}) … if (callResult?.block) throw`
- `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:930` — `ToolCallEvent = … | CustomToolCallEvent`
- `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/skills.ts:52` — `isNameClaimedByAuthoredSkill` authored-wins
- `backlog/tasks/task-27:Plan D3` — `learning.review` non-goal documented
- `backlog/tasks/task-29:AC2` — requirement for this recommendation

---

*No user state mutated this wave. Ready for TASK-29 apply wave.*
