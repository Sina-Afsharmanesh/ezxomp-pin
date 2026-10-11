# Cook Skill & Workflow Sync: Upstream jeff 6.0.0 → 6.6.1

**Constraint (binding):** Backlog.md remains the artifact surface and task management system. Nothing in this plan adopts the upstream `.jeff/` task ledger. Upstream semantics are adopted; upstream storage is adapted to Backlog + `.omp/` state.

**Baseline:** local `@ezxomp/cook` `0.1.7-ezxomp.4` (pre-fork method) vs upstream `johanthoren/jeff` `6.6.1` (2026-08-27). Our fork predates the entire 6.0 "Graph Engineering" slate and all post-6.0 hardening.

---

## Part 1 — Upstream delta analysis (every update, adopt/adapt/skip)

### 6.0 Graph Engineering slate (docs/specs/graph-slate-6.0.md, 8 items)

| # | Upstream item | Local gap today | Decision | Adaptation for ezxomp |
|---|---|---|---|---|
| 1 | **Parallel refute fan-out** — when >1 blocking finding survives a judgment round, dispatch one fresh source-bound refute specialist per finding, concurrently, blind to each other; recording order irrelevant | No refute pass at all; a blocking finding goes straight to re-implementation | **ADOPT** | Add refute stage semantics to `COOK_PROTOCOL` + a `cook_dispatch_refute`-shaped brief (reuse `cook_dispatch_judge` with refute mode or a new tool). Parallelism = one `tasks[]` batch. Test: N refutes for N blockers record in arbitrary order with identical final state |
| 2 | **Context packets** — plan creates a facts-only `context.md` (files+roles, symbols with file:line, exact test commands, mechanical constraints). Forbidden: hypotheses, root-cause claims, fixes, verdicts. Six consumers; fixed caveat: "a map, not an authority: use it to skip discovery; verify only entries you rely on; correct stale facts if writable, otherwise report them." Optional everywhere; never a gate | Every specialist re-explores the repo cold each stage | **ADAPT** | Packet lives as a structured `## Context Packet (facts only)` section in the Backlog task via `backlog_task_edit --append-notes` (Backlog stays the artifact surface). Planner owns + refreshes it on re-entry; worker/validator maintain facts they directly touch; judge/refute/council read-only. The exact caveat is baked into every consumer brief |
| 3 | **Journal with write-ahead intents** — per-task append-only `journal.jsonl`, closed event vocab `{intent, record, gate, external}`, monotonic `seq`, write intent **before** every dispatch and external side effect; dangling intent on resume ⇒ fresh dispatch, never counted against cycles; external intent ⇒ query the external system first | `CookState.agentLog` records returns only; a died dispatch is indistinguishable from "never ran"; resume is ambiguous | **ADOPT (storage moved)** | New `extensions/journal.ts`: `backlog/.cook-journal/<TASKID>.jsonl` (same dir family as `STATE_FILE = backlog/cook-state.json`), store-lock serialized seq. Auto-append `record` on successful dispatch return, `gate` on validator run. `COOK_PROTOCOL` gains the two resume rules verbatim. Add optional `pipelineVersion` to `CookState` (our package version at state creation). **The journal is also the provenance feed for the herdr-dagr pane (see Part 2.5): every intent/record/gate event projects into the run file the pane renders** |
| 4 | **Typed kickback contracts + scoped repair** — judgment kickbacks carry optional `findings: [{source, file, line, what, kickTo}]`. Repair is *scoped* iff findings present+nonempty, all `kickTo ∈ {implement, refactor}`, recorded fix `files ⊆ findings[*].file`, code task, no council pending. Scoped ⇒ archive judgment entry, reset **only the raising source**, retain passing sibling judgment. Full-suite gate **always** re-runs (the anchor). INV-12: unproven retention is a violation (fail-closed) | Any kickback resets the full judgment layer (`reviewCycles` counter only; `lastFindings` recorded but not actionable); sibling work is re-bought every cycle | **ADOPT** | `Finding` type gains `source/file/line/what/kickTo`. `cook_dispatch_judge` returns typed findings. New scoped-repair logic in the dispatch/record path: judge kickback with confined findings + worker fix file-set confined ⇒ retain validator pass, re-dispatch judge only. `cook_validate` gains the INV-12 equivalent (retained judgment valid only when contract + file confinement + retained-verdict-pass all hold; else full reset practice). Validator re-run stays unconditional |
| 5 | **Evidence-scaled escalation** — (A) one convergent **bonus cycle**: at cap, if `bonusGranted` unset, all surviving blockers confined to implement/refactor, and this round strictly smaller than last ⇒ one extra cycle, counter held at cap, council unarmed. Next surviving round convenes council unconditionally. (B) **Follow-up ledger** — follow-ups cost one line in `.jeff/FOLLOWUPS.md`, not a task; graduate on operator demand; council demotions may point at `"ledger"` | Fixed cap (`maxReviewCycles`, default 3) with no bonus, no council at all, and every follow-up finding costs a full Backlog ticket | **ADOPT both, storage adapted** | (A) `convergence: Record<source, {cycles, bonusGranted}>` in `CookState`. (B) Follow-up ledger = a single Backlog doc (`backlog_doc_create -t report`, title "Cook Follow-ups", one `- [ ] task <id> · <file>:<line> · <what> (<source>, <date>)` line per finding). Graduation = promote the line to a real task recording `discoveredFrom`. Council demotion `followupTaskId: "ledger"` maps to "recorded in the Cook Follow-ups doc" |
| 6 | **Capture decomposition + `discoveredFrom` + lite cycle check** — fake-edge test at capture (independently shippable outcomes become separate tasks; `deps` only for genuine consumption); plan escalation returns a fork proposing the split; `discoveredFrom` records provenance (never scheduling); lite Kahn cycle check over local edges, ignoring unresolvable refs | `COOK_PROTOCOL` already says "decompose into atomic sub-tickets" but has no fake-edge test, no provenance, no cycle check (`cook_dag_ready` trusts Backlog deps) | **ADAPT** | Fake-edge guidance + plan-split escalation into `COOK_PROTOCOL` capture/plan steps and cook-planner profile. `discoveredFrom` = Backlog task description convention `discoveredFrom: TASK-XX` (we don't own the Backlog schema). Cycle check: `cook_validate` runs a Kahn pass over Backlog dependency edges, ignoring ids that don't resolve |
| 7 | **`cook all` parallel DAG drain** — `cook ready` (JSON lines, priority-then-id), `cook claim <id>` (atomic mkdir-based claim), `cook release`, `cook claims`; `maxParallelTasks` config (default 1 = legacy); drain loop: fresh read of ready set, claim → journal intent → open lane; **worktree per claimed task when ≥2 claimed**; integration serialized at trunk in completion order: capture old trunk OID `O`, private checkpoint, gate + judge that exact hash, hold terminal return, verify `merge-base --is-ancestor O G`, atomic `update-ref <trunk> G O` compare-and-swap, then record + release + cleanup; conflicts on landing = discovered hidden edge routed as scoped kickback; lane-local stops don't stop the drain; stale claims (>24h, no record) reported, never auto-broken | `cook_next` claims one task at a time into a single-lane chain; no concurrency, no worktrees, no integration protocol | **ADOPT — the headline item** | New tools: `cook_claim`, `cook_release`, `cook_claims`, `cook_ready` (extends `cook_dag_ready` with claim filtering + priority ordering); atomic claim = lock-protected state write + journal intent (our lock discipline replaces mkdir race). Worktrees follow **our own existing protocol**: `docs/parallel-agents.md` — jj workspace per task, task bookmark as deliverable, coordinator-only trunk integration. `maxParallelTasks` in `backlog/cook-config.json` via `configSchemaViolations`-style validation. Drain loop written into `COOK_PROTOCOL` §Drain (upstream steps 1–8, adapted to jj + Backlog) |
| 8 | **`cook snapshot --json`** — additive, versioned (`schemaVersion`), read-only machine projection; invalid store still snapshots; per-task `claim`/top-level `maxParallelTasks` appear only when present | No machine projection; TUI widget + state file only | **ADOPT** | New `cook_snapshot` tool: projects Backlog task states + cook state (chain, stage, claims, convergence, journal tails) as one JSON doc, `schemaVersion: 1`, additive-only, never mutates. Documented as the boundary for external consumers (our TUI/watch already benefits) |

### Post-6.0 hardening (6.1.0 → 6.6.1, commit-verified)

| Change (commit) | Decision | Adaptation |
|---|---|---|
| **Red-gate kickback** (e9ceb940, bd65b4fd): refuse audit/judgment on a red gate; add cook return after red gate | **ADOPT** | Validator failure (gate red) routes as a typed kickback to worker; judge is never dispatched on a red gate |
| **Reject pass when AC ok=false** (daec1d29): a specialist return claiming pass with unverified acceptance criteria is rejected | **ADOPT** | Dispatch layer rejects judge/validator `pass` verdicts whose AC checklist isn't fully verified; forces honest returns |
| **Always-probe checkpoint** (04022bb6) + **`--trunk-ref` binding, drifted-checkpoint rejection** (db4dab6a series): verify binds cwd/trunk ref; reject a checkpoint that drifted from the judged hash | **ADAPT** | Our integration step records the judged jj commit id; gate re-check rejects if workspace tip drifted |
| **INV-12 council slicing** (79f894f2, 8c155bb8): skip retention validation during council recovery; council-to-plan slices | **ADOPT** | Scoped-retention invariant skipped while a council episode is active (prevents false violations) |
| **Leftover-checkout resume/discard** (1d23a58e, 954cb3ed): resume or discard leftover checkouts; discard dirty leftovers; pin layout | **ADAPT** | Drain resume reconciles jj workspaces from claims + journals; dirty leftover workspace ⇒ report, discard on operator confirmation |
| **Skip forged interrupt recording** (c42c9309): interrupts that never dispatched are not recorded as cycles | **ADAPT** | Journal-based: no matching `record` after `intent` ⇒ orphan, not a cycle |
| **Wait on busy exclusive host resources** (57f3e8a5): plumbing waits instead of blocked-to-operator | **ADAPT** | Claim/store-lock contention retries with backoff; only genuine decisions surface to the operator |
| **Optional language-skill dispatch** (4a43e1bd): brief carries language skill path only when it resolves; absence is not a stop | **ADOPT** | `resolveDispatchSkills`-style path resolution in dispatch briefs; mandatory floor paths fail closed, language skills optional |
| **Chef-facing grounder + assess→fork entry gate** + **plain/kitchen flavor toggle** + **lite-mode profile** | **SKIP (for now)** | Kitchen persona/flavor and the standalone grounder are upstream voice, not mechanism; our `/cook` UX is already established. Lite-mode split doesn't apply — we have one mode. Park as follow-ups in the ledger |
| **Dual review on complex tasks** (in SKILL.md §Dispatch): two decorrelated concurrent reviewers on `complexity: complex`; pass requires both; blocking set = union (dedupe, stricter class) | **ADOPT** | cook-planner marks task `complexity` in the plan; dispatch layer fans two cook-judge instances with decorrelated briefs; both ids recorded in `agentLog` |
| **Council** (3 fresh mutually-blind inquiry specialists + 1 synthesis specialist; per-finding vote; one typed recovery route; lineage-preserving single recovery episode) | **ADOPT** | New agent profiles `cook-council.md` + `cook-council-synthesis.md`; dispatched only at cap (post-bonus). Spawn authority: orchestrator only (consistent with our current roster rules) |

---

## Part 2 — Adopted contracts (shared interfaces — declared once, consumed by all workers)

These are declared **now** so parallel workers code against them without negotiation.

### New/changed state (`extensions/types.ts` — owner W1)

```ts
interface TypedFinding { source: "judge" | "validator"; file: string; line: number; what: string; kickTo: "plan" | "implement" | "verify"; }
interface ConvergenceStage { cycles: number; bonusGranted?: boolean; }   // absent ⇒ false (legacy semantics)
interface CookState {  // additive only; absent fields ⇒ exact legacy behavior
  // existing fields unchanged...
  claims: Record<string, { by: string; at: string }>;   // REPURPOSED: atomic task claims (was free-form)
  convergence: Record<string, Record<string, ConvergenceStage>>;  // taskId → source → stage
  complexity: Record<string, "simple" | "complex">;
  pipelineVersion?: string;
  maxParallelTasks: number;                              // default 1
}
```

### Journal (`extensions/journal.ts` — owner W1)

- Path: `backlog/.cook-journal/<TASKID>.jsonl`; append-only; `{"seq":N,"at":ISO,"event":"intent|record|gate|external","stage?":str,"note?":str,"hash?":str}`.
- Closed vocab (4 events). Seq monotonic under the existing store lock. Writes fail-closed; reads fail-open (skip + warn on malformed line).
- API: `appendIntent(cwd, taskId, stage, note?)`, `appendRecord(...)`, `appendGate(...)`, `appendExternal(...)`, `readTail(cwd, taskId)`, `findDanglingIntent(tail)`.
- `COOK_PROTOCOL` resume rules (verbatim from upstream Item 3): dangling specialist intent ⇒ fresh dispatch, never counted; dangling external intent ⇒ query external system first, act only if genuinely absent.

### New tools (`extensions/cook-tools.ts` — owner W4)

| Tool | Signature | Semantics |
|---|---|---|
| `cook_ready` | `{}` | JSON lines `{id, title, priority, deps}`; ready = todo/In Progress, unclaimed, deps satisfied; order priority→id |
| `cook_claim` | `{task_id, by?}` | Atomic (store-lock + journal intent); refuses terminal/blocked/claimed (error names holder) |
| `cook_release` | `{task_id}` | Removes claim; errors if unclaimed |
| `cook_claims` | `{}` | Active claims with age |
| `cook_snapshot` | `{}` | `{schemaVersion:1, generatedAt, tasks:[{id,title,status,stage,claim?,convergence?,complexity?}], maxParallelTasks}`; read-only, additive-only |
| `cook_journal` | `{task_id, event, stage?, note?}` | Manual intent/external appends |
| `cook_dispatch_refute` | `{task_id, finding}` | One fresh source-bound refute per finding; designed for batched parallel dispatch |

`cook_dag_ready` is superseded by `cook_ready` (kept as alias during transition, removed in same release — clean cutover, no shim).

### Protocol text (`extensions/constants.ts` `COOK_PROTOCOL` + `extensions/prompts.ts` — owner W2)

New/rewritten sections: §The loop (journal intent before every dispatch, resume rules), §Parallel judgments (review + verify concurrent), §Parallel refutes, §Dual review (complex tasks), §Context packets (facts-only + exact caveat), §Kickbacks (typed findings contract, scoped-repair rule, INV-12 anchor = gate always re-runs), §Escalation (bonus cycle then council), §Follow-up ledger (Backlog doc convention), §Drain (upstream Item 7 steps 1–8 adapted to jj workspaces + Backlog), §Red gate (no judgment on red gate), §AC integrity (pass rejected when AC ok=false), §Pane (herdr-dagr detection + one-time mention; pane is a view, never a gate).

### Agent profiles (`agents/*.md` — owner W3)

- cook-planner: context-packet ownership + refresh-on-re-entry; complexity marking; plan-split escalation fork; fake-edge decomposition guidance.
- cook-worker: factual maintenance duties (only facts directly verified/created/moved; no scope expansion; no conclusions).
- cook-judge: typed findings contract in returns; read-only packet stance; AC-integrity rule (never pass with unverified AC); dual-review decorrelation briefs.
- cook-validator: gate event journaling; red-gate semantics.
- NEW cook-council.md + cook-council-synthesis.md (3 blind inquiry + 1 synthesis; per-finding votes; one typed recovery route).
- `COOK_AGENTS_VERSION` bump + freshness marker; spawn-authority: council dispatch from orchestrator only; evo-sub sync (`extensions/agents.ts`).

---

---

## Part 2.5 — herdr-dagr pane integration (reviewer requirement)

**Goal:** when cook runs, the operator watches the whole workflow live in a [herdr](https://herdr.dev) pane via the already-installed `herdr-dagr` plugin (contract v3, binary built at the plugin root; `herdr agent prompt` on herdr 0.8.2 is the operator-message return channel).

### Architecture: cook is the dagr producer

dagr is a representation kernel: the producer owns truth, the pane only renders. Our cook orchestrator already owns task truth (Backlog) + process truth (journal + state). So the integration is a **projection module**, not a second engine:

- **New `extensions/dagr.ts`** — pure projection: Backlog tasks + cook state + journal tail ⇒ dagr contract v3 run file.
- **Run file:** `.dagr/run.json` in the workspace root (producer-skill default; gitignored).
- **Write discipline (non-negotiable, from the dagr producer skill):** write `run.json.tmp` → `dagr check run.json.tmp --strict --json` → only on clean exit 0, atomic `mv` over `run.json`. Never publish invalid state; the live file never shows a half-written frame. Validator resolution order: `$DAGR_BIN` → `command -v dagr` → plugin build path. **No validator found ⇒ projection silently disabled (pane absence is legal; cook never blocks on the pane).**

### Mapping (cook concept → dagr contract v3)

| Cook | dagr v3 | Notes |
|---|---|---|
| Parent task | `project` (root) | Sub-projects per milestone if present |
| Sub-ticket | `task` `id: TASK-xx`, `kind: impl`, `state` from Backlog status | `queued/working/review/blocked/done` projection; `deps` from Backlog dependencies — readiness derived, never authored |
| Chain phase per task | `attempt` (`T·aN`, `cause`: `initial` / `sent_back(by, reason, ref)` / `gate_failed(ref)`) | Kickback = new attempt with `sent_back` cause — the pane shows retry loops honestly, nothing moves backward |
| Journal `intent` before dispatch | `event: attempt_started` + `attempt.state: working` | Written by the same lock-serialized append — journal and pane can never disagree |
| Journal `record` on return | `event: attempt_settled` + `outcome` | |
| Validator gate run | `event: attempt_settled` on a `gate` task; fan-in gates for multi-lane drains | Gate placement per contract §3 |
| Evidence tiers | `◆ verified` = validator ran green (gate hash recorded); `◇ reported` = typed envelope from judge/worker; `! asserted` = bare claim (rejected by our AC-integrity rule anyway) | Directly mirrors our "evidence survives outside the chat" invariant |
| `convergence` bonus/council | `policy.futures[]` declared on the task | Dotted future rows render the *possible* kickback/council routes — declared, never inferred |
| Claim (Item 7) | `task.state: working` + `attempt.locator {pane, agent}` | herdr pane id recorded as volatile locator |
| Operator pane message (`m` key) | dagr appends to `messages.jsonl`, enqueues via `herdr agent prompt` to the orchestrator pane | Orchestrator correlates resolution by appending `event: message_resolved` with `message_id` — closes the loop the contract §9 defines |

### Who writes it

Every state-mutating cook tool (`cook_claim`, `cook_dispatch_*`, `cook_next`, `cook_advance`, kickback/record paths) calls `projectDagr()` after its store commit, inside the same critical section. The projection is **best-effort**: a dagr check failure logs a warning and cook continues (the pane is a view, never a gate — mirroring upstream's "advisory artifact, never a gate" stance for context packets).

### Pane lifecycle

- `herdr plugin action invoke open-dagr --plugin herdr-dagr` opens the pane (one action per side; the operator binds their preferred side to a key).
- `COOK_PROTOCOL` gains a short §Pane paragraph: cook detects it is running inside herdr (env marker) and mentions the pane once at kickoff; it never requires the pane.
- Drain mode (Item 7) is where this shines: parallel lanes render as sibling rails with a `N→1 ⋈` gate at serialized integration, and the operator can message a specific lane from the pane.

---
## Part 3 — Parallel worker decomposition

**Model:** coordinator (me) dispatches `task` subagents in waves; contract-first so wave 1 runs fully parallel. Each worker owns a **disjoint file set**; shared interfaces are Part 2, not negotiated. Workers skip repo-wide validation (no `just verify` mid-flight); coordinator runs gates after each wave merges. Trunk integration is serialized at the coordinator (upstream Item 7 step 4 discipline, applied to ourselves).

| Worker | Wave | Owns (exclusive) | Deliverable |
|---|---|---|---|
| **W1 state-journal-dagr** | 1 | `extensions/types.ts`, `extensions/state.ts`, **new** `extensions/journal.ts`, **new** `extensions/dagr.ts` | TypedFinding/ConvergenceStage/claims/convergence/pipelineVersion fields with legacy-absent semantics; journal module with lock-serialized seq + dangling-intent API; **dagr projection module** (contract v3 mapping per Part 2.5: tmp→check --strict→atomic-rename loop, validator resolution chain, best-effort disable). Tests: `tests/journal.test.ts`, `tests/state-legacy.test.ts`, `tests/dagr-projection.test.ts` (golden run.json vs sample contract, attempt/cause/evidence mapping, check-clean guarantee, disable-on-no-validator) |
| **W2 protocol-text** | 1 | `extensions/constants.ts`, `extensions/prompts.ts` | Rewritten `COOK_PROTOCOL` (all new sections above) + stage prompt updates. Tests: `tests/protocol-prose.test.ts` (payload-hygiene style: caveat string exact-match, resume rules present, drain steps present, no conclusions in packet contract) |
| **W3 agent-profiles** | 1 | `agents/*.md`, `extensions/agents.ts` | All profile updates + 2 new council profiles + version bump + spawn authority + evo-sub sync. Tests: extend `tests/cook-agents.test.ts` (new profiles install, freshness marker, allowlist grants) |
| **W4 tools-dispatch** | 2 (needs W1 types + W2 event vocab — both contract-declared, starts coding against Part 2 immediately, merges after W1/W2) | `extensions/cook-tools.ts`, `extensions/renderers.ts`, `extensions/autocomplete.ts`, `extensions/index.ts` (wiring only) | 6 new tools + cook_dag_ready cutover + scoped-repair + parallel refute/dual-review/council dispatch paths + red-gate + AC-integrity rejection + snapshot projection + **`projectDagr()` calls after every store-mutating tool commit** (Part 2.5). Tests: `tests/claims.test.ts` (atomic claim/release/claims, refusal cases), `tests/snapshot.test.ts` (golden projection, optionality, read-only proof), `tests/scoped-repair.test.ts` (scoped vs full reset matrix: confined/unconfined/historical-no-findings/council-pending), `tests/refute-parallel.test.ts` (N refutes, arbitrary order, identical state) |
| **W5 tests-docs** | 3 | `plugins/cook/tests/*` (integration additions), `CHANGELOG.md`, `plugins/cook` DOX updates, root `AGENTS.md` child index touch-up | Integration tests: drain-loop dry run (2 lanes, worktree claims, serialized integration, CAS refusal on stale O), back-compat (legacy state file + no journal ⇒ unchanged behavior), INV-12 matrix. CHANGELOG `[Unreleased]` entry. DOX pass per AGENTS.md contract |

**Waves:** W1∥W2∥W3 → merge → W4 → merge → W5 → coordinator final gate.

**Integration order:** W1 → W4 (types), W2 → W4 (protocol strings), W2 → W3 (protocol wording), all → W5. No cross-worker file edits; any conflict ⇒ coordinator resolves, worker re-briefs.

## Part 4 — Verification gates (coordinator, after final merge)

1. `bun test plugins/cook/tests/` — full plugin suite green (21 existing + ~10 new test files).
2. `just verify` — repo gate (`tsc --noEmit` + full suite).
3. Contract spot-checks: legacy state file loads without new fields; journal append/intent/dangling-intent round trip; claim atomicity under concurrent calls; snapshot emits valid JSON with `schemaVersion: 1` and never mutates state bytes.
4. `cook_validate` reports the new INV-12 invariant as passing on a clean store.
5. `dagr check .dagr/run.json --strict --json` exits clean on a projection generated from a live cook session; `herdr plugin action invoke open-dagr --plugin herdr-dagr` renders it; an operator `m`-message from the pane arrives via `herdr agent prompt` and is journaled with `message_resolved` correlation.

## Part 5 — Risks & tradeoffs

- **Claims repurposing:** `CookState.claims` changes shape (string → `{by, at}`). Legacy files store strings — W1 must tolerate both on read (fail-open to legacy) or version the state file. Chosen: tolerate-both read, new-shape write.
- **Protocol rewrite risk:** `COOK_PROTOCOL` is injected verbatim into orchestrator context; a regression here breaks every cook session. Mitigation: W2's prose tests pin every new rule string; smoke test `tests/smoke.test.ts` extended.
- **Council cost:** 3+1 fresh agents per cap hit is expensive. Adopted as-is because upstream bound it behind the bonus cycle (council only after cap+bonus), same as upstream economics.
- **Backlog as packet store:** context packets in task notes grow task files; acceptable — facts-only keeps them small, and `--plan`/notes are the Backlog-sanctioned channels (no direct md edits).
- **Dagr projection drift:** the pane is a pure projection; if a cook tool crashes between store commit and projection, the pane is stale until the next mutation. Accepted: journal remains the provenance authority; the pane re-syncs on the next event. The `dagr check --strict` gate before publish prevents ever rendering invalid state.
- **jj vs git:** upstream integration mechanics are git-flavored (`update-ref` CAS). Our adaptation maps to jj workspace + bookmark moves per `docs/parallel-agents.md`; the O→G ancestry check maps to jj ancestor checks on the task bookmark. W4/W5 implement against jj commands already proven in this repo.

## Part 6 — Non-goals (parked, upstream-aligned)

Operation-category scoped repair; lite-mode split; flavor/grounder/persona surfaces; standalone graph client (`control/` Rust tree — out of scope for an OMP plugin); any adoption of upstream `.jeff/` ledger, beads/Dolt, graph runtimes, or durable-execution engines.

## Part 7 — Execution

On approval: coordinator creates the parent Backlog task + 5 sub-tickets (one per worker, dependencies wired per waves) via `cook_decompose` — dogfooding the upgraded pipeline is a follow-up; this sync ships through the standard dispatch flow. Then dispatch wave 1.
