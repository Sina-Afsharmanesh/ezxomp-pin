# SPEC — OMP Programmatic Orchestration Mode

**Working package name:** `omp-programmatic-orchestrator`
**Working mode name:** Programmatic Orchestration Mode (POM)
**Status:** implementation specification / junior-developer handoff
**Date:** 2026-08-09
**Target OMP baseline:** `can1357/oh-my-pi` @ `45e12e5bb758198a920c6070e7e64cb33b21beac`
**Prime Agent reference:** `PrimeIntellect-ai/prime-agent` main, inspected 2026-08-09
**Atomic reference:** `bastani-inc/atomic` main, inspected 2026-08-09

> This document is intentionally prescriptive. If an implementation choice conflicts with an invariant in this spec, preserve the invariant and change the implementation. Do not weaken a hard gate into prompt text to make the code simpler.

---

## 0. Executive decision

Build **one OMP plugin package**, composed of multiple TypeScript modules, that adds a toggleable execution mode with four properties:

1. **Prime-style programmatic operation**
   - The main LLM's direct model-visible tool surface is reduced to **OMP Eval only**.
   - The LLM performs file inspection, shell work, search, transformations, model delegation, and workflow control from code executed through Eval.
   - Intermediate data is kept in Eval variables, files, artifacts, and workflow state rather than automatically entering the LLM transcript.
   - Large context is exposed as handles/catalog metadata and retrieved explicitly only when code or a stage needs it.

2. **Atomic-style host-owned orchestration**
   - Durable workflows are executed by a TypeScript workflow engine owned by the plugin, not by a prose instruction telling the model to remember a process.
   - Workflow stages are **real OMP SDK `AgentSession`s** created with hard tool allowlists using `restrictToolNames: true`.
   - Stage topology is a runtime-validated DAG with explicit dependencies, bounded parallelism, pause/resume, checkpoints, artifacts, and human-input states.
   - Side effects and completed stages are journaled so a resumed run does not blindly repeat completed work.

3. **Programmatic, fail-closed verification**
   - A workflow is not complete because an LLM says it is complete.
   - Required gates are host-owned state. Completion succeeds only when every required gate is in a passing state.
   - Schema failures, missing evidence, verifier execution failures, parse failures, missing artifacts, and command failures fail closed.
   - Repair loops are bounded and explicit.

4. **Native Git repository control**
   - Git is the canonical repository-management backend for exploration, mutation tracking, isolated worktrees, commit identity, stack construction, history rewriting, conflict handling, recovery, push preparation, and final integration.
   - Agents do not improvise repository commands. They call host-owned typed repository service from Eval/workflow code.
   - Git commit IDs identify implementation units; task branches identify isolated work, while `main` remains coordinator-owned.
   - Parallel mutation uses one `git worktree` on one `task/<slug>` branch per worker. Workers commit locally and never push or move `main`.
   - Coordinator serially integrates task branches into `main`, runs required gates, and is only actor allowed to push `origin/main`.

The package must **reuse OMP's Eval, SDK, model registry, session machinery, extension events, and TUI primitives**. It must not require Atomic, Prime Agent, MCP code-execution servers, DBOS, just-bash, or any other orchestration runtime at execution time.

### 0.1 The one-sentence architecture

> **OMP remains the host; Eval becomes the model's single control plane; the plugin supplies a durable workflow kernel, selective-context broker, hard stage policies, gates, a Git repository controller, and a graph/stage TUI around OMP SDK sessions.**

---

## 1. Goals

### 1.1 Primary goals

The package MUST:

- make the mode toggleable without modifying OMP source;
- make **Eval the only direct model-visible OMP tool** while the mode is active;
- retain selected OMP capabilities for **programmatic invocation from Eval**;
- support a Prime-like persistent code-first working style for normal agent work;
- support an Atomic-like durable workflow mode for structured work;
- automatically route each request through a deterministic **MAIN / DUO / ORCHESTRATE / WORKFLOW** lane after bounded exploration;
- keep exploration decisions in a main-agent-owned decision ledger that survives compaction, lane escalation, and workflow resume;
- give every workflow stage a fresh, explicit, minimal context by default;
- support parallel stage fan-out and deterministic fan-in;
- support structured stage outputs;
- support machine checks, independent verifier stages, and human approval gates;
- prevent a required gate from being bypassed by a model-generated boolean or prose claim;
- persist enough workflow state to recover after interruption/restart;
- provide an interactive workflow graph modal and stage inspection/chat surface;
- integrate OMP's existing magic words `orchestrate` and `workflowz` as activation signals;
- avoid external runtime dependencies that duplicate functionality OMP already has;
- use **native Git as the end-to-end repository-management process** so Main, Partner, specialists, and workflows never have to guess repository/commit/branch/worktree semantics;
- make `git worktree` plus task branches the required isolation path, with coordinator-only main integration and push.

### 1.2 Secondary goals

The package SHOULD:

- minimize prompt/context growth;
- preserve provider prompt-cache stability where practical;
- make context transfer auditable;
- make every important workflow transition inspectable in the TUI and journal;
- allow model, thinking level, tool policy, and context policy to differ by stage;
- make reusable **project and global TypeScript workflow definitions a v1 surface**, with project-over-global precedence;
- use append-only/event-style state where practical so crash recovery is explainable;
- exploit Git commit and reflog semantics for repository recovery and stable integration evidence without making the workflow journal depend on Git internals.

### 1.3 Explicit non-goals for v1

The package is NOT required to:

- implement a secure OS sandbox for model-generated code;
- reproduce Prime Agent's daemon/background service architecture;
- reproduce Atomic's full DBOS persistence layer;
- copy Atomic source code or depend on Atomic packages;
- copy Prime Agent's continual-harness refinement system;
- implement a new model provider stack;
- replace OMP's native compaction implementation;
- provide distributed workflow execution across machines;
- guarantee exactly-once effects for arbitrary shell commands that escape the workflow engine;
- prove arbitrary dynamic TypeScript workflows acyclic statically;
- reimplement Git as a library or parse its on-disk internal store directly;

These are deliberate scope boundaries, not omissions.

---

## 2. Source-derived facts that drive the design

This section records the facts the implementation is built around. Do not re-litigate these during implementation unless the OMP version changes.

### 2.1 OMP facts

OMP already provides the extension surfaces needed for this package:

- runtime tool activation/replacement;
- `tool_call` and `tool_result` interception;
- `context` and `before_agent_start` prompt/context control;
- custom commands and shortcuts;
- custom TUI components/overlays;
- session state and custom messages;
- model registry access;
- executable extension code;
- package-scoped declarative resources.

OMP's SDK `createAgentSession()` has the key capability Atomic needs: when `restrictToolNames: true` is used, `toolNames` becomes a real allowlist and ambient MCP, extension discovery, custom commands, and LSP are disabled by default. `toolNames` alone is **not** an allowlist; `restrictToolNames: true` is mandatory for workflow stages.

OMP Eval already provides:

- persistent Python and JavaScript execution state;
- `tool.<name>(args)` for invoking a session tool programmatically;
- `completion(...)` for stateless sub-completions;
- `agent(...)` for subagent execution when spawn policy allows it;
- `parallel(...)` and `pipeline(...)` helpers;
- `budget`, `phase`, `log`, local-file helpers, and persistent variables.

A critical OMP implementation detail: Eval's tool bridge resolves `tool.<name>` against the **session's full tool registry**, not only the currently active/model-visible tool list. Therefore `setActiveTools(["eval"])` is necessary but is not sufficient to constrain programmatic calls. A mode-level `tool_call` policy must also reject tools not on the programmatic allowlist.

A second critical fact: Eval itself is arbitrary code execution. JavaScript exposes Bun capabilities and Python can use normal Python/OS APIs. This package can enforce the **agent interface** and OMP tool policy, but it cannot honestly claim OS capability sandboxing.

### 2.2 Prime Agent facts worth copying conceptually

Prime Agent's useful differentiator is not merely "it has Python." Its RLM design treats the persistent code environment as a **control plane**:

- the model gets one primary execution surface;
- intermediate state lives as variables/functions/files rather than repeated natural-language context;
- subagents are function-like programmatic calls;
- a child gets a focused assignment rather than the parent's entire transcript;
- skill metadata can be exposed first while full skill instructions are loaded only on demand;
- durable supplemental state is summarized before injection;
- host-authoritative concerns such as provider calls, credentials, session persistence, and scheduling stay outside the code kernel.

The key context lesson to copy is:

> **Keep raw working state outside the prompt. Inject catalogs, handles, constraints, and summaries; pull raw content only when the current code/stage actually needs it.**

### 2.3 Atomic facts worth copying conceptually

Atomic's useful differentiator is that orchestration is **runtime structure**, not just model behavior:

- workflow definitions materialize a DAG at runtime;
- stages have explicit policies and fresh/fork context modes;
- stage sessions are separate agent sessions;
- workflow-owned side effects become durable graph nodes;
- completed durable nodes return cached results on replay;
- HIL is a runtime wait state;
- verification uses structured outputs plus host-side reducers;
- bounded repair loops are explicit;
- workflow state drives a graph TUI;
- the graph can attach into a stage's chat/control surface;
- child workflow tools can be hard-disabled by host policy rather than instructions.

The key verification lesson to copy is:

> **LLMs may produce evidence and recommendations, but the host owns the state transition from "not verified" to "verified."**

### 2.4 External code-mode references: what to copy and what not to copy

Cloudflare Code Mode and Anthropic's programmatic tool calling reinforce the same architecture:

- present a code execution surface instead of dozens of direct tools;
- expose capabilities as APIs callable from code;
- allow code to loop/filter/aggregate before returning anything to the model;
- avoid putting each intermediate tool result into the LLM context;
- keep external authority on the host side.

Anthropic additionally warns that a caller annotation such as `allowed_callers` is not itself a security boundary. This spec follows that rule: **presentation is not enforcement**. OMP tool activation, restricted SDK sessions, workflow state, and fail-closed gates are the enforcement layers.

The other references are inspiration only:

- `agent0ai/code-execution-mcp`: persistent execution/session ergonomics; no dependency.
- `vercel-labs/just-bash`: capability-oriented virtual shell/sandbox design; no dependency in v1.
- `vekexasia/pi-extensible-workflows`: inline deterministic JS workflows/checkpoint ideas; no dependency.
- Gemini code execution: evidence that code-first iterative execution is a mainstream agent pattern; no dependency.
- ThinkingCap: supports the motivation to reduce unnecessary reasoning/context cost; it does not define this architecture.

---


### 2.5 Git facts that drive repository architecture

Git is the repository-management authority. The repository layer must use its native model:

- commit IDs identify committed implementation units;
- task branches identify worker ownership and review boundaries;
- one `git worktree` isolates each worker without sharing mutable worktree files;
- `main` is coordinator-owned and is the only integration target;
- coordinator serializes branch merges, runs gates after each integration, and alone pushes `origin/main`;
- merge/rebase commands can succeed while leaving conflicts, so explicit conflict checks remain mandatory;
- reflogs provide local recovery evidence for branch and `HEAD` movement;
- workers commit locally and return branch name plus immutable commit OID; they never push or mutate `main`.

Architectural consequence:

> **The package tracks task branches and commit IDs, then integrates through coordinator-owned `main`; it must reject detached `HEAD` and worker attempts to mutate or push `main`.**

---

## 2.6 Claims vs. code evidence vs. what we should transplant

| Claim / differentiator | What the code actually supports | Critical caveat | OMP package decision |
|---|---|---|---|
| Prime: "everything is programmatic" | Default RLM prompt/session is built around persistent IPython; tools/skills/subagents are called from code. | Prime extensions can still add tools, and arbitrary Python is not sandboxed. | Make Eval the sole direct model tool and preserve selected host capabilities only behind code. |
| Prime: "prompt-as-a-variable" / context control | Persistent kernel state holds variables/functions/results; full skill bodies are loaded on demand; child tasks have independent contexts; harness state is compactly injected. | Prime still appends project context files and some resource catalogs. It does not eliminate context pressure universally. | Use a four-tier context broker: always-small control state, metadata catalog, explicit stage materialization, raw data outside prompt. |
| Prime: subagents as function calls | `rlm(...)` is a host-validated programmatic child-session primitive. | Current detailed docs return an admission handle; answers arrive through messages/files rather than a magical synchronous value. | Use native Eval `agent()` for lightweight orchestration; use SDK-created sessions for durable workflow stages. |
| Prime: persistent long work | Kernel/session/harness/children are designed to outlive a turn. | Prime's daemon is its own runtime; OMP package should not recreate it. | Persist workflow graph/artifacts separately from Eval state so OMP session/restart recovery is sufficient. |
| Atomic: verifiable workflows | Workflow runtime owns nodes, status, explicit reads, durable tools, HIL, and gates. | Dynamic TypeScript topology is validated at runtime, not statically proven. | Implement a runtime DAG with cycle checks, journaled nodes, explicit ContextRefs, and host completion reducer. |
| Atomic: stages/checks/approval instead of hoping | Stage sessions have explicit policies and host restrictions; HIL is an actual await state. | A model can still make bad judgments inside a stage. | Stage policy is hard at SDK construction; judgment is separated from host gate state. |
| Atomic: programmatic verification | Structured verifier/reducer outputs are combined with deterministic host predicates; invalid/missing outputs fail closed. | Some built-in review logic intentionally trusts a particular structured reviewer field after parse/execution guards; not every model judgment is objectively provable. | For v1 use stronger quorum + explicit blocker rules; reducer cannot override host facts. |
| Atomic: durable side effects | `ctx.tool` nodes cache completed serializable outcomes and avoid re-running on resume. | Arbitrary effects outside tracked nodes are not magically exactly-once. | `flow_tool` and tracked stages get replay identity; root Eval escapes taint the workspace/run instead of receiving false guarantees. |
| OMP: `workflowz` | Current magic notice already tells the model to author orchestration in Eval using `agent`, `parallel`, `pipeline`, schemas, verification, and budgets. | It is an inline prompt contract, not a durable resumable workflow runtime. | Preserve the magic UX; replace its effect in this package with enforced mode + durable engine. |
| OMP: `orchestrate` | Current magic word injects a hidden orchestration notice. | It does not remove normal tools or create persistent orchestration state. | Map it to request-scoped Eval-only Prime/RLM-style orchestration. |

### Bottom-line assessment

**Prime solves a large fraction of the context problem by changing where computation happens.** When ten tool calls happen inside one Eval/IPython program, the parent model does not need ten full intermediate observations. Persistent variables and artifact handles are therefore more important than another summarization prompt. However, this does **not** mean every useful project instruction should disappear from context. Immutable task contracts and a small routing/catalog layer still belong in prompt context.

**Atomic solves a different failure mode: process reliability.** A model can understand a plan and still skip a stage, forget a check, rerun a side effect, or declare success too early. Atomic's useful answer is that these things become runtime nodes and state transitions. The OMP package should therefore combine Prime's programmatic data path with Atomic's host-owned control path rather than choosing one.

**OMP already contains most of the expensive primitives.** Eval is already persistent and programmatic; the SDK already creates restricted sessions; extensions already intercept tools/context and render custom TUI. The package should be an integration/control layer, not a second coding-agent implementation.

---

## 3. Terminology

Use these terms consistently in code and UI.

### 3.1 Programmatic mode

A session state in which the model-visible direct tool set is reduced to Eval and environment interaction is expected to happen from code.

### 3.2 Lane

The execution topology selected for the current request after bounded exploration:

- `main` — the main agent completes the request alone. It may inspect, reason, implement, and verify, but it does not create foreground peers.
- `duo` — two foreground agents: **Main + Partner**. They may communicate bidirectionally through the host/OMP messaging bridge. Each foreground agent may launch read-focused scout subagents **one level deep only**. Scouts cannot spawn.
- `orchestrate` — Main coordinates a fan-out/fan-in of specialist agents. Specialists may message **Main only** and may not message each other or spawn additional agents unless an explicit bounded scout policy says otherwise. Main owns synthesis and all final decisions.
- `workflow` — a durable, replayable DAG with typed stages, checkpoints/gates, artifacts, repository workspaces, and workflow TUI. Workflow agents may message **Main only**. Completion is host-owned.

The lane is not a cosmetic profile. It is an enforced concurrency, communication, spawn-depth, durability, and verification policy.

### 3.2.1 Programmatic profile (legacy/internal naming)

Existing implementation code may still use `ProgrammaticProfile` during migration. Replace it with `ExecutionLane` in public types. `rlm` maps to `main`; the old `orchestrate` and `workflow` names map directly. There is no legacy equivalent for `duo`. New code MUST use lanes.

### 3.3 Direct tool

A tool schema sent to the model provider as a normal tool the LLM can select directly.

### 3.4 Programmatic capability

A host capability invoked from Eval code, normally via `tool.<name>(...)` or a package-defined workflow bridge. It is not intended to be visible as a direct provider tool.

### 3.5 Stage

A separately instantiated OMP SDK `AgentSession` that performs one graph node's model work.

### 3.6 Host node

A workflow graph node performed directly by TypeScript (for example a deterministic command check or artifact operation), not by a model stage.

### 3.7 Gate

A host-owned predicate/state transition that must pass before a workflow may complete.

### 3.8 ContextRef

A compact typed handle to context stored outside the model prompt.

### 3.9 Artifact

A persisted file or serializable value produced/consumed by workflow nodes.

### 3.10 Tainted run

A run in which the workspace changed outside a tracked mutation boundary. A tainted run cannot report strict verified completion until the taint is reconciled or explicitly acknowledged by the user.

### 3.11 Exploration phase

A bounded, read-mostly phase that precedes lane commitment for non-trivial requests. Its purpose is to discover enough facts to choose a lane and lock important implementation decisions, not to perform the whole task. Exploration may inspect repository structure, relevant code, tests, build configuration, current repository/Git state, and existing workflow definitions. It must stop when the lane-routing evidence is sufficient.

### 3.12 Decision Ledger

A main-agent-owned durable record of decisions made during exploration and later approved/revised checkpoints. The ledger is authoritative over worker suggestions. Workers can propose changes but cannot silently amend accepted decisions.

### 3.13 Vertical slice

A user-visible implementation increment that crosses the relevant layers needed to produce independently reviewable value (for example API + storage + tests for one behavior), rather than a horizontal layer-only milestone. Workflow checkpoint policy should prefer vertical slices when meaningful.

### 3.14 Repository backend

The host-owned repository implementation selected for the current workspace:

```ts
type RepositoryBackend = "git" | "none";
```

Git is the required repository backend for repository-mutating workflows.

### 3.15 ChangeRef

A workflow reference to a repository commit. Under Git, the immutable commit OID is its identity; rewritten history produces a new OID.

```ts
interface ChangeRef {
  backend: "git";
  commitId: string;
  description?: string;
  branch: string;
  worktree?: string;
}
```

### 3.16 Stack

An ordered set of reviewable implementation changes from base to tip. In Git the stack is represented by ordered commit IDs/revisions, not by assuming a chain of named branches. Publication may attach one branch to the tip for a single PR or one branch per review boundary for stacked PRs.

### 3.17 Repository workspace

An isolated `git worktree` used for concurrent mutation on a `task/<slug>` branch.

---

## 4. User experience and activation

### 4.1 Commands

Register the following extension commands:

```text
/programmatic on [auto|main|duo|orchestrate|workflow]
/programmatic off
/programmatic status
/programmatic graph [run-id]
/programmatic resume <run-id>
/programmatic pause <run-id>
/programmatic abort <run-id>
/programmatic repo status
/programmatic repo stack
/programmatic repo diff [revision]
/programmatic repo recover
/programmatic repo doctor
/programmatic config
/programmatic doctor
```

Optional alias:

```text
/primeflow ...
```

Do not add a default keyboard shortcut in v1. Keybinding collisions are difficult to predict across user configurations. A package config may allow users to opt into one.

### 4.2 Persistent activation scopes

Mode activation has a scope:

```ts
type ActivationScope = "request" | "run" | "session";
```

- `/programmatic on auto` => `session`, lane selected per request
- `/programmatic on main|duo|orchestrate|workflow` => `session`, explicit lane floor/override
- magic `orchestrate` => `request`, minimum lane `orchestrate`
- magic `workflowz` => `run`, forced lane `workflow`

`request` automatically restores the prior tool set after the terminal turn.

`run` remains active while its durable workflow is non-terminal, including across HIL pauses/resume. It exits when the run reaches a terminal state or the user turns it off.

`session` remains active until `/programmatic off` or session shutdown.

### 4.3 OMP magic words

OMP currently recognizes the exact lower-case prose-aware magic words:

```text
orchestrate
workflowz
```

The package MUST treat them as first-class activation inputs.

Mapping:

```text
orchestrate -> laneFloor=orchestrate, scope=request
workflowz   -> lane=workflow,        scope=run
both        -> lane=workflow,        scope=run
```

Do not silently make them case-insensitive in v1. Match OMP's current semantics. If aliases are desired later, add them as explicit package configuration.

### 4.4 Core OMP magic-word notices

OMP's built-in `orchestrate` and `workflowz` behavior currently injects hidden prompt notices. Those notices are useful in stock OMP but would duplicate/conflict with this package's stronger runtime policy.

When this package activates from one of those words, its `context` handler SHOULD remove or replace the corresponding core custom notice (`orchestrate-notice` / `workflow-notice`) from the model-facing context and insert one compact package-owned mode notice instead.

This is context deduplication, not a dependency on the built-in notice text.

### 4.5 Status indicator

While active, render a compact status widget above or below the editor:

```text
PROGRAMMATIC · WORKFLOW · Git · task/<slug> · run 8F2C · 4/7 nodes · gate: reviewers
```

The status widget must not contain large logs.

---

## 4.6 Automatic request lifecycle: Explore → Route → Execute → Verify → Integrate

When `/programmatic on auto` is active, every non-trivial user request follows this host-visible lifecycle:

```text
RECEIVE
  ↓
EXPLORE (bounded, read-mostly)
  ↓
ASSESS (structured evidence)
  ↓
ROUTE (host deterministic LaneRouter)
  ↓
EXECUTE in MAIN | DUO | ORCHESTRATE | WORKFLOW
  ↓
VERIFY (lane-appropriate deterministic checks)
  ↓
FINAL REVIEW / INTEGRATION GATE when repository mutation is involved
  ↓
COMPLETE
```

Tiny deterministic requests may use a fast path in which exploration is satisfied by the already-known request/context and the router immediately selects `main`. The system must not create agents simply to prove that agents are unnecessary.

### 4.6.1 Exploration is bounded

Exploration is controlled by an `ExplorationBudget`, for example:

```ts
interface ExplorationBudget {
  maxEvalCells: number;          // default 4
  maxRepositoryReads: number;    // default 24 logical reads/searches
  maxScoutAgents: number;        // default 0 before lane selection
  maxWallClockMs?: number;       // optional host cap
}
```

Exploration MUST NOT mutate tracked project files. It may write package-owned scratch/context artifacts under `.omp/programmatic/`.

Pre-route exploration is Main-only by default. Do not spawn a scout merely to choose a lane. If uncertainty remains after the bounded evidence budget, encode it as `unknown`; the LaneRouter escalates conservatively. A nonzero pre-route scout budget is an advanced opt-in and, if enabled, remains depth-1/read-only and reports only to Main.

### 4.6.2 Structured lane assessment

The model does not directly choose the lane. It submits evidence through a hidden programmatic bridge such as `lane_assess`:

```ts
interface LaneAssessment {
  requestSummary: string;
  repositoryKnown: boolean;
  estimatedFiles: number | "unknown";
  estimatedSubsystems: number | "unknown";
  independentTracks: number;
  ambiguity: "low" | "medium" | "high";
  crossCutting: boolean;
  requiresDesignDecision: boolean;
  requiresExternalResearch: boolean;
  requiresSpecialistReview: boolean;
  mutationRisk: "none" | "low" | "medium" | "high";
  repositoryIntent: "none" | "inspect" | "mutate" | "publish-single" | "publish-stacked" | "integrate-trunk" | "unknown";
  estimatedReviewUnits: number | "unknown";
  requiresStackRewrite: boolean;
  requiresDurability: boolean;
  requiresResume: boolean;
  requiresHumanCheckpoint: boolean;
  requiresMultipleVerticalSlices: boolean;
  reusableWorkflowMatch?: string;
  evidenceRefs: string[];
}

interface RepositoryRoutingFacts {
  backend: RepositoryBackend | "unknown";
  existingMutableStackDepth: number | "unknown";
  touchedStackHasConflicts: boolean | "unknown";
  touchedStackHasDivergence: boolean | "unknown";
  hasUnrelatedWorkingChanges: boolean | "unknown";
}

interface LaneRoutingInput {
  assessment: LaneAssessment;
  repository: RepositoryRoutingFacts;
}
```

The model supplies task semantics; it does not guess Git graph state. `RepositoryManager` deterministically derives `RepositoryRoutingFacts` from the current repository and the host validates the remaining assessment against observable facts (file count estimates, discovered workflow metadata, explicit user constraints) before running the `LaneRouter`. Repository facts are evidence, not prose. If the repository is unknown in a way that changes safe routing, the router must explore once more or fail upward.

### 4.6.3 Deterministic minimum-sufficient LaneRouter

The router always chooses the **least expensive lane that satisfies every hard condition**. A deterministic reference rule set is:

```ts
function selectLane(input: LaneRoutingInput, policy: LanePolicy): ExecutionLane {
  const a = input.assessment;
  const r = input.repository;

  if (
    policy.forceWorkflow ||
    a.requiresDurability ||
    a.requiresResume ||
    a.requiresHumanCheckpoint ||
    a.requiresMultipleVerticalSlices ||
    a.mutationRisk === "high" ||
    a.repositoryIntent === "publish-stacked" ||
    a.repositoryIntent === "integrate-trunk" ||
    (a.requiresStackRewrite && r.existingMutableStackDepth !== "unknown" && r.existingMutableStackDepth >= 2) ||
    r.touchedStackHasConflicts === true ||
    r.touchedStackHasDivergence === true ||
    a.reusableWorkflowMatch
  ) return "workflow";

  if (
    policy.minimumLane === "orchestrate" ||
    a.independentTracks >= 3 ||
    (a.requiresSpecialistReview && a.independentTracks >= 2) ||
    (a.crossCutting && a.estimatedSubsystems !== "unknown" && a.estimatedSubsystems >= 3)
  ) return "orchestrate";

  if (
    policy.minimumLane === "duo" ||
    a.independentTracks === 2 ||
    a.ambiguity === "high" ||
    a.requiresDesignDecision ||
    a.mutationRisk === "medium"
  ) return "duo";

  return "main";
}
```

This exact threshold set is configurable only through validated host policy. The model cannot lower its lane by rewriting the assessment after the router returns. If evidence is unknown in a way that could cross a hard boundary, the router chooses the safer higher lane or requests one more bounded exploration action.

Repository routing rules are intentionally asymmetric:

- ordinary local mutation does **not** force WORKFLOW by itself; MAIN/DUO/ORCHESTRATE remain valid for bounded changes;
- stacked publication always forces WORKFLOW because review-unit ordering, branch mapping, rewrite propagation, verification, and publication form a durable graph;
- trunk integration always forces WORKFLOW because it contains an explicit high-impact HIL gate;
- multi-change stack surgery forces WORKFLOW when the touched stack has two or more mutable changes;
- any conflict/divergence in the touched stack forces WORKFLOW so repair/reverification is journaled;
- a simple single-PR publication may remain in MAIN/DUO/ORCHESTRATE, but its final publication is still host-gated and goes through `RepositoryManager`.

### 4.6.4 Lane escalation

Automatic lane changes are monotonic for a request:

```text
MAIN → DUO → ORCHESTRATE → WORKFLOW
```

A lane may escalate when new evidence invalidates the initial assessment. Automatic downgrade after mutation begins is forbidden. Before mutation begins, the host may recompute and downgrade only if no peer/stage has started and no durable run has been created.

The user may explicitly force a higher lane at any time. Forcing a lower lane after higher-lane work has started requires an explicit user action and must preserve produced artifacts/ledger history.

### 4.6.5 Lane topology and communication policy

| Lane | Foreground agents | Child scouts | Communication | Durability | Primary use |
|---|---:|---|---|---|---|
| MAIN | 1 Main | none by default | n/a | session | small/local, low-risk work |
| DUO | Main + Partner | each may spawn scouts depth 1 | Main ↔ Partner; scouts → parent only | session + ledger | paired design/implementation/review |
| ORCHESTRATE | Main + N specialists | normally none; optional depth-1 read scouts by policy | specialists → Main only; Main → each specialist | request artifacts + ledger | 3+ independent tracks, specialist fan-out |
| WORKFLOW | Main + workflow stages | controlled by workflow definition; default no recursive spawn | stages → Main only; Main → stage | durable run journal | long, gated, resumable, multi-slice work |

Peer-to-peer specialist messaging in `orchestrate` and `workflow` MUST be blocked by the host. This prevents hidden side channels from turning a star topology into an untracked mesh.

### 4.6.6 DUO semantics

DUO is not `parallel(two agents)`. It is a persistent two-foreground-agent collaboration:

- Main owns the user conversation, decision ledger, final answer, and integration authority.
- Partner receives the objective, accepted decisions, explicit context refs, and a named responsibility.
- Main and Partner can send each other bounded host messages using OMP's messaging/steer-follow-up primitives through a package mailbox abstraction.
- Partner may challenge Main's decision, but the challenge is a proposal until Main records an amendment in the Decision Ledger.
- Each foreground agent may spawn scout agents only at depth 1. Scouts are read/research focused, cannot mutate unless policy explicitly allows it, cannot spawn, and report only to their parent.
- The host enforces `maxForegroundAgents=2` and `maxSpawnDepth=1` for DUO.

Recommended DUO role split is selected from the request, not hard-coded: implementer/reviewer, architecture/implementation, backend/frontend, investigation/fix, or author/adversarial-partner.

### 4.6.7 ORCHESTRATE semantics

ORCHESTRATE is a star topology around Main:

- Main decomposes work into explicit named tracks.
- Independent tracks launch with bounded concurrency.
- Each specialist gets fresh context plus only the relevant Decision Ledger entries and ContextRefs.
- Specialist results return to Main as structured values/artifacts.
- Specialists cannot directly negotiate with each other.
- Main resolves disagreements, updates the ledger, and decides whether another bounded wave is required.
- Raw native `agent()/parallel()/pipeline()` may be used through Eval when their calls are request-scoped and do not require durable replay.

### 4.6.8 WORKFLOW semantics

WORKFLOW is selected when process state matters as much as reasoning. It uses the durable engine described later in this spec. Main remains the authority above the graph:

- the graph owns stage ordering, replay, gates, artifacts, repository workspaces, and checkpoints;
- Main owns accepted decisions and user communication;
- stage agents report to Main/graph and cannot alter the Decision Ledger directly;
- user-authored or generated reusable workflows may be resolved from project/global registries;
- workflow definitions use the Atomic-style typed authoring contract and pi-extensible-workflows-style deterministic orchestration primitives specified in §11.8–§11.12.

### 4.7 Decision Ledger

The main agent MUST hold decisions made during exploration. Do not rely on conversational memory alone.

Persist a compact ledger:

```ts
interface DecisionLedger {
  requestId: string;
  revision: number;
  objective: string;
  entries: DecisionEntry[];
}

interface DecisionEntry {
  id: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  kind: "requirement" | "architecture" | "scope" | "constraint" | "tradeoff" | "repository" | "integration" | "verification";
  statement: string;
  rationale: string;
  evidenceRefs: string[];
  decidedBy: "user" | "main";
  decidedAt: number;
  supersedes?: string;
}
```

Rules:

1. Main is the only agent allowed to accept/supersede ledger entries; the user can do so through Main/HIL.
2. Partner/specialists/stages may return `decisionProposals`, never direct ledger mutations.
3. A compact set of currently accepted entries is injected into Main on every turn and into workers only when relevant.
4. Full rationale/evidence remains outside the prompt and is retrievable by ref.
5. Compaction must preserve the ledger artifact and its current accepted summary.
6. Workflow resume must restore the exact ledger revision captured by the run plus any later user-approved amendments.
7. A worker output that conflicts with an accepted decision is marked `conflictWithDecisionIds` and cannot silently drive implementation.
8. Once exploration identifies repository-sensitive work, Main records a compact `RepositoryPlan` in or alongside the Decision Ledger. Workers may propose stack/change-boundary amendments, but only Main/user can accept them.

```ts
interface RepositoryPlan {
  backend: RepositoryBackend;
  baseBranch: string;                 // normally configured main
  intent: "local" | "publish-single" | "publish-stacked" | "integrate-local" | "integrate-trunk";
  reviewUnits: Array<{
    logicalId: string;
    title: string;
    dependsOn: string[];
    commitId?: string;
  }>;
  stackPolicy: "preserve" | "normalize" | "split" | "squash-fixups";
  targetRemote?: string;
  acceptedAtLedgerRevision: number;
}
```

The plan is semantic intent, not a frozen set of commit IDs. Git commit IDs/branch tips are refreshed from commit IDs by the host after every rewrite. A lane escalation can refine the plan but cannot silently contradict accepted exploration decisions.

### 4.8 User involvement policy

The package SHOULD execute autonomously between meaningful checkpoints. It must not ask the user to approve routine decomposition, file reads, ordinary implementation choices, test reruns, or internal agent assignments.

User interaction is reserved for four classes of decision:

1. **Exploration decision** — only when the task has a material product/architecture ambiguity that cannot be resolved from repository evidence or prior user instruction.
2. **Key vertical-slice checkpoint** — only when a workflow definition marks the slice as requiring human review, or the router/policy identifies irreversible/high-impact consequences.
3. **Final review** — before integration of a non-trivial code change. Show the accepted decision summary, changed scope, deterministic verification results, unresolved risks, and publication/stack plan.
4. **Integration action** — an explicit choice before creating/pushing/merging the final integration target when such an action was requested or implied.

The final integration choices should be presented as a single HIL gate when applicable:

```text
Keep local / no publication
Publish single PR
Publish stacked PRs
Integrate locally into target
Push publication branch(s) only
Push/integrate to trunk
```

`Push/integrate to trunk`, destructive history replacement, remote branch deletion, or equivalent high-impact actions always require explicit user selection. The agent must not infer permission from general approval of the implementation. Under Git, normal safe history rewriting inside the unpublished local stack is routine and does not itself require HIL; publication/integration is the permission boundary.

A workflow may checkpoint after key vertical slices, but SHOULD batch low-risk slices to avoid approval fatigue.

---

## 5. Core invariants

These are mandatory.

### INV-1 — Eval-only direct model surface

While programmatic mode is active, the main LLM's active direct tools MUST be exactly:

```ts
["eval"]
```

unless an OMP version requires a hidden protocol tool that is not model-selectable. Any exception must be documented and tested.

### INV-2 — Reassert the tool partition every turn

The extension must reassert Eval-only activation in `before_agent_start`. Dynamic MCP refreshes or other extensions must not silently re-expose direct tools mid-mode.

### INV-3 — Programmatic allowlist

A `tool_call` handler must fail closed for programmatic OMP tools not permitted by the active lane/policy.

### INV-4 — Stage sessions are restricted at construction

Workflow stages MUST be created with `restrictToolNames: true`. Do not create a normal discovered session and merely hide tools afterward.

### INV-5 — Stage model surface is Eval-only

A stage registry may contain its approved programmatic capabilities, but after construction the stage's active model-visible tool set must be reset to `["eval"]`.

### INV-6 — Ambient resources do not leak into stages by default

Workflow stages must not inherit ambient MCP servers, arbitrary extensions, custom commands, LSP, skills, rules, project context files, or prompt templates unless the stage policy explicitly opts them in.

### INV-7 — Fresh context is the default

A workflow stage receives no parent chat transcript by default.

### INV-8 — Context transfer is explicit

Upstream outputs enter a downstream stage only through explicit `ContextRef`s, artifact paths, structured values, or a declared `previous`/handoff field.

### INV-9 — Intermediate programmatic results stay out of chat unless emitted

Code should keep large intermediate tool outputs in variables/artifacts. The plugin must not mirror every internal programmatic call into model context.

### INV-10 — Workflow state is not kernel state

Eval variables are a working cache. The durable workflow journal/store is authoritative for run identity, graph state, gates, artifacts, and replay.

### INV-11 — DAG only

Every materialized workflow topology must remain acyclic. Runtime edge admission is authoritative.

### INV-12 — Required gates are host-owned

A required gate's passing status may only be written by the corresponding gate implementation, never by arbitrary model output.

### INV-13 — Parse/execution failures never approve

Invalid structured verifier output, missing verifier output, verifier error, cancelled verifier, or gate execution error must resolve to non-passing.

### INV-14 — Completion is a host transition

`completeRun()` must reject unless all required completion conditions hold.

### INV-15 — Resume does not blindly repeat completed side effects

A completed durable node with the same replay identity/input hash returns its persisted result instead of running again.

### INV-16 — Human gates block without UI

A HIL gate in non-interactive execution becomes `awaiting_input` / `blocked`; it must never auto-approve.

### INV-17 — No false sandbox claim

Documentation/UI must state that Eval-generated code executes with OMP's process/user permissions unless the user independently runs OMP in a sandbox.

### INV-18 — Lane selection is host-owned

The model supplies exploration evidence; the host `LaneRouter` chooses the lane. A free-form model label is never authoritative.

### INV-19 — Main owns decisions

Accepted exploration/architecture/scope decisions live in the Decision Ledger and can be changed only by Main or the user. Worker/stage proposals cannot mutate accepted decisions directly.

### INV-20 — Communication topology is enforced

DUO permits Main ↔ Partner communication. ORCHESTRATE and WORKFLOW agents may message Main only. Spawn depth and peer routing are host policy, not prompt guidance.

### INV-21 — User interruption is sparse and meaningful

Routine internal choices do not trigger HIL. Required user gates are limited to material exploration ambiguity, configured vertical-slice checkpoints, final review, and integration actions.

### INV-22 — Git is the canonical VCS path

If a Git repository is present, all repository mutation must go through the Git repository service. Repository mutation outside that service is a policy violation.

### INV-23 — Repository mutation uses typed Git service

When `RepositoryBackend === "git"`, host-mediated mutations use validated typed service actions. Workers use task branches and worktrees; only coordinator may integrate into or push `main`. Read-only Git/forge commands may be allowed.

### INV-24 — Commit OID is durable identity

Workflow/run/stage state stores Git commit OIDs with their task branch and worktree. A rewrite creates a new OID; refresh recorded refs before later operations.

### INV-25 — Successful rewrite is not a conflict gate

Every repository rewrite/integration operation must be followed by an explicit conflict query. A Git command exit code of zero cannot by itself approve an integration gate because conflicted commits may be recorded successfully.

### INV-26 — Task branches are ownership boundaries

Create one `task/<slug>` branch per worker and review unit. Do not move another worker's branch. Publication and integration happen from coordinator-owned `main`.

### INV-27 — Git worktrees provide isolation

Concurrent mutating stages use `git worktree add/list/remove` with unique task branches. Worktrees are removed only after coordinator integration is proven.

### INV-28 — Repository mutations require host receipts

Main, Partner, scouts, specialists, and workflow stages are instructed to use the typed `repo`/`ctx.repo` surface for repository semantics. Every admitted mutation must produce a host-owned repository receipt containing the action, exact branch/commit inputs, pre/post reflog entries, refreshed commit OIDs, conflict/divergence state, and owning run/node.

OMP Eval is not an OS sandbox, so code inside Eval can technically spawn `git` directly. The package MUST NOT pretend it can securely prevent that escape with prompt text or source-string matching. Instead, strict repository mode reconciles the Git reflog/commit graph around Eval execution; an unreceipted graph/content mutation taints the run, blocks publication/integration, and enters provenance-aware recovery. The model-facing runtime docs expose the typed repository API, not a raw VCS CLI cookbook.

---
## 6. Package architecture

### 6.1 Required package layout

Use this layout unless OMP's package resolution requires a minor adjustment:

```text
omp-programmatic-orchestrator/
├── package.json
├── extension.ts
├── src/
│   ├── config.ts
│   ├── constants.ts
│   ├── state.ts
│   ├── commands.ts
│   │
│   ├── mode/
│   │   ├── controller.ts
│   │   ├── request-lifecycle.ts
│   │   ├── activation.ts
│   │   ├── magic-words.ts
│   │   ├── tool-partition.ts
│   │   ├── tool-firewall.ts
│   │   ├── context-policy.ts
│   │   ├── prompt-policy.ts
│   │   └── eval-result-policy.ts
│   │
│   ├── lane/
│   │   ├── types.ts
│   │   ├── exploration.ts
│   │   ├── assessment.ts
│   │   ├── router.ts
│   │   ├── policy.ts
│   │   ├── duo-runtime.ts
│   │   ├── mailbox.ts
│   │   ├── spawn-policy.ts
│   │   └── decision-ledger.ts
│   │
│   ├── programmatic/
│   │   ├── api-types.ts
│   │   ├── api-docs.ts
│   │   ├── code-policy.ts
│   │   └── bridge-provenance.ts
│   │
│   ├── repo/
│   │   ├── types.ts
│   │   ├── manager.ts
│   │   ├── detector.ts
│   │   ├── git.ts
│   │   ├── git.ts
│   │   ├── state.ts
│   │   ├── ledger.ts
│   │   ├── workspace.ts
│   │   ├── stack.ts
│   │   ├── branches.ts
│   │   ├── publish.ts
│   │   ├── recovery.ts
│   │   ├── command-policy.ts
│   │   └── mutation-sentinel.ts
│   │
│   ├── workflow/
│   │   ├── types.ts
│   │   ├── engine.ts
│   │   ├── scheduler.ts
│   │   ├── graph.ts
│   │   ├── frontier.ts
│   │   ├── store.ts
│   │   ├── journal.ts
│   │   ├── replay.ts
│   │   ├── stage-runtime.ts
│   │   ├── stage-policy-extension.ts
│   │   ├── workspace-ledger.ts
│   │   ├── workspace.ts
│   │   ├── definition.ts
│   │   ├── registry.ts
│   │   ├── discovery.ts
│   │   ├── loader.ts
│   │   ├── dsl.ts
│   │   └── errors.ts
│   │
│   ├── context/
│   │   ├── types.ts
│   │   ├── broker.ts
│   │   ├── catalog.ts
│   │   ├── artifact-store.ts
│   │   ├── summarizer.ts
│   │   └── injection.ts
│   │
│   ├── gates/
│   │   ├── types.ts
│   │   ├── engine.ts
│   │   ├── command-gate.ts
│   │   ├── artifact-gate.ts
│   │   ├── schema-gate.ts
│   │   ├── review-gate.ts
│   │   ├── human-gate.ts
│   │   ├── diff-gate.ts
│   │   └── reducer.ts
│   │
│   ├── tools/
│   │   ├── lane-assess.ts
│   │   ├── lane-status.ts
│   │   ├── decision-ledger.ts
│   │   ├── flow-run.ts
│   │   ├── flow-stage.ts
│   │   ├── flow-gate.ts
│   │   ├── flow-artifact.ts
│   │   ├── flow-tool.ts
│   │   └── repo.ts
│   │
│   └── tui/
│       ├── controller.ts
│       ├── graph-view.ts
│       ├── graph-layout.ts
│       ├── graph-render.ts
│       ├── stage-view.ts
│       ├── stage-transcript.ts
│       ├── artifact-view.ts
│       ├── prompt-view.ts
│       └── keybindings.ts
│
├── skills/
│   └── programmatic-orchestration/
│       └── SKILL.md
│
├── docs/
│   ├── api.md
│   ├── lanes.md
│   ├── workflow-authoring.md
│   ├── vcs-git.md
│   └── threat-model.md
│
└── test/
    ├── mode/
    ├── workflow/
    ├── context/
    ├── gates/
    ├── repo/
    ├── tui/
    └── integration/
```

The split is intentional. Do not build this as one 3,000-line extension file.

### 6.2 Package manifest

Conceptual manifest:

```json
{
  "name": "omp-programmatic-orchestrator",
  "version": "0.1.0",
  "type": "module",
  "peerDependencies": {
    "@oh-my-pi/pi-coding-agent": "*"
  },
  "omp": {
    "version": "0.1.0",
    "description": "Eval-only adaptive orchestration with deterministic lanes, Native Git repository control, durable workflows, and verification",
    "extensions": ["./extension.ts"]
  }
}
```

Do not put normal executable custom tools in `tools/` if OMP package sibling discovery would auto-activate/discover them in a way that complicates the direct-tool surface. Register the package's programmatic bridge tools from `extension.ts` with `defaultActive: false` / hidden presentation semantics instead.

### 6.3 Configuration strategy

Do not rely on `package.json#omp.settings` as the only runtime configuration channel. In the current OMP code, the plugin setting schema is useful to host UI/CLI, but generic setting values are not automatically exposed through `ExtensionAPI`.

Use a package-owned config file:

```text
.omp/programmatic-mode.json
```

with user fallback:

```text
~/.omp/agent/programmatic-mode.json
```

Project values override user values.

Example:

```json
{
  "defaultLane": "auto",
  "magicActivation": true,
  "autoOpenGraph": true,
  "exploration": {
    "maxEvalCells": 4,
    "maxRepositoryReads": 24,
    "maxScoutAgents": 0
  },
  "laneRouter": {
    "orchestrateIndependentTracks": 3,
    "workflowOnHighMutationRisk": true,
    "workflowOnHumanCheckpoint": true,
    "monotonicEscalation": true
  },
  "maxConcurrentStages": 4,
  "maxNodesPerRun": 64,
  "maxRepairRounds": 3,
  "evalResultMaxBytes": 24000,
  "contextCatalogMaxEntries": 32,
  "contextSummaryMaxChars": 240,
  "programmaticTools": {
    "main": ["read", "grep", "glob", "bash", "edit", "write", "lsp", "web_search"],
    "duo": ["read", "grep", "glob", "bash", "edit", "write", "lsp", "web_search"],
    "orchestrate": ["read", "grep", "glob", "bash", "edit", "write", "lsp", "web_search"],
    "workflow": ["read", "grep", "glob", "bash", "edit", "write", "lsp", "web_search"]
  },
  "repository": {
    "backend": "git",
    "strictTracking": true,
    "baseBranch": "main",
    "defaultPushRemote": "origin",
    "stackedReview": {
      "branchPrefix": "task/",
      "oneBranchPerReviewUnit": true
    }
  },
  "workflow": {
    "projectDirectory": ".omp/programmatic/workflows",
    "globalDirectory": "~/.omp/agent/programmatic/workflows",
    "mutatingStagesUseWorkspace": true,
    "requireVerificationGate": true,
    "reviewerCount": 2,
    "reviewerQuorum": "all"
  }
}
```

Validate config at load. Invalid project config must produce a clear warning and fall back to user/default config rather than partially applying corrupt values.

---

## 7. Extension entrypoint responsibilities

`extension.ts` should only wire components together.

Conceptual structure:

```ts
export default async function programmaticExtension(pi: ExtensionAPI) {
  const config = await loadProgrammaticConfig();
  const state = new ModeStateStore();
  const repository = new RepositoryManager({ config, pi });
  await repository.initialize();
  const workflows = new WorkflowEngine({ config, pi, repository });
  const contextBroker = new ContextBroker({ config, workflows, repository });
  const ledger = new DecisionLedgerStore({ config, contextBroker });
  const laneRouter = new LaneRouter({ config, workflows });
  const mode = new ModeController({ pi, config, state, workflows, contextBroker, ledger, laneRouter, repository });
  const tui = new WorkflowTuiController({ pi, config, workflows, mode });

  registerProgrammaticBridgeTools(pi, { workflows, contextBroker, mode, repository });
  registerCommands(pi, { mode, workflows, tui });

  pi.on("input", (event, ctx) => mode.onInput(event, ctx));
  pi.on("before_agent_start", (event, ctx) => mode.beforeAgentStart(event, ctx));
  pi.on("context", (event, ctx) => mode.rewriteContext(event, ctx));
  pi.on("tool_call", (event, ctx) => mode.guardToolCall(event, ctx));
  pi.on("tool_result", (event, ctx) => mode.rewriteToolResult(event, ctx));
  pi.on("agent_end", (event, ctx) => mode.onAgentEnd(event, ctx));
  pi.on("session_start", (event, ctx) => mode.restore(event, ctx));
  pi.on("session_shutdown", (event, ctx) => mode.shutdown(event, ctx));
}
```

Do not put workflow execution logic directly in event handlers.

---

## 8. Mode state model

### 8.1 State type

```ts
export type ExecutionLane = "main" | "duo" | "orchestrate" | "workflow";
export type LaneSelection = "auto" | ExecutionLane;
export type RequestPhase = "idle" | "exploring" | "routing" | "executing" | "verifying" | "awaiting_review" | "integrating" | "complete";
export type ActivationScope = "request" | "run" | "session";

export interface ProgrammaticModeState {
  enabled: boolean;
  selection: LaneSelection;
  lane?: ExecutionLane;
  laneFloor?: ExecutionLane;
  phase: RequestPhase;
  scope: ActivationScope;
  activatedAt: number;
  activatedBy: "command" | "orchestrate" | "workflowz" | "resume" | "config";
  priorActiveTools: string[];
  activeRunId?: string;
  requestTurnId?: string;
  decisionLedgerRevision?: number;
  violationCount: number;
}
```

### 8.2 Persistence

Persist mode state in two places:

1. an OMP custom session entry for session-resume visibility; and
2. package-owned run/session state on disk for crash recovery.

Disk state is authoritative if the two disagree after an unclean shutdown.

Do not persist raw credentials or model provider secrets.

### 8.3 Enter sequence

`ModeController.enter()` must:

1. snapshot `pi.getActiveTools()` if transitioning from off;
2. choose lane selection/floor and activation scope;
3. save state;
4. call `pi.setActiveTools(["eval"])`;
5. set status widget;
6. append a small custom mode-entry session message;
7. if an explicit selection forces `workflow`, prepare a workflow run slot but do not invent an objective before receiving the user prompt; otherwise enter `exploring` and let the LaneRouter decide;
8. if the activation came from `workflowz` and UI exists, open graph after the run is actually created, not before.

### 8.4 Exit sequence

`ModeController.exit()` must:

1. reject automatic exit if a `scope=run` workflow is non-terminal unless this is an explicit user abort/off action;
2. close/hide package mode UI without deleting run data;
3. restore `priorActiveTools` filtered against current `pi.getAllTools()`;
4. clear ephemeral context reminders;
5. persist disabled state;
6. leave completed workflow journal/artifacts intact.

### 8.5 Reassertion

Every `before_agent_start` while active:

```ts
pi.setActiveTools(["eval"]);
```

This must be idempotent.

---

## 9. Direct-tool isolation and programmatic capability policy

### 9.1 Why two layers are required

Layer A — **active tool partition**:

```ts
pi.setActiveTools(["eval"]);
```

This controls what schemas the model receives directly.

Layer B — **programmatic tool firewall**:

Eval can resolve tools from the full session registry. Therefore the extension must enforce a separate allowlist for `tool.<name>` calls.

### 9.2 Firewall policy

```ts
interface ToolPolicy {
  directModelTools: ReadonlySet<string>;       // exactly {"eval"}
  programmaticTools: ReadonlySet<string>;      // configured OMP tools + flow_* bridges
  deniedAlways: ReadonlySet<string>;           // dangerous/unsupported integrations
}
```

When active:

```ts
pi.on("tool_call", async event => {
  if (!mode.enabled) return;

  if (event.toolName === "eval") {
    return inspectEvalCellPolicy(event.input, mode.lane ?? "main");
  }

  if (!policy.programmaticTools.has(event.toolName)) {
    return {
      block: true,
      reason: `Programmatic mode blocked tool '${event.toolName}': not in the active programmatic capability allowlist.`
    };
  }
});
```

### 9.3 Programmatic bridge provenance

OMP's Eval JS/Python tool bridge injects an internal intent marker for programmatic calls. Use that marker for diagnostics and defense in depth when present, but **do not treat it as a cryptographic security boundary**.

Record provenance in the workflow journal:

```ts
interface ToolInvocationReceipt {
  toolName: string;
  caller: "eval-bridge" | "model-direct" | "workflow-host" | "unknown";
  inputHash: string;
  startedAt: number;
  endedAt?: number;
  outcome: "ok" | "error" | "blocked";
}
```

### 9.4 Direct provider payload audit

Optional but recommended:

- inspect `before_provider_request` payloads for supported provider shapes;
- assert that model-selectable client tools contain only `eval` while mode is active;
- if a known provider payload contains an unexpected direct tool, fail closed;
- for an unknown payload shape, emit a warning and rely on OMP's active tool set.

Do not write brittle provider-specific payload rewriting as the primary mechanism.

### 9.5 Root allowed programmatic tools

The default code-first capability set should be conservative but useful:

```ts
const DEFAULT_PROGRAMMATIC_TOOLS = [
  "read",
  "grep",
  "glob",
  "bash",
  "edit",
  "write",
  "lsp",
  "web_search",
];
```

Do not automatically include:

- arbitrary MCP tools;
- computer-use tools;
- browser automation tools;
- SSH/remote execution tools;
- memory mutation tools;
- user-installed custom tools.

Those require explicit config.

### 9.6 Important limit: native code can bypass the OMP tool registry

Eval code can use native filesystem/process/runtime APIs. Therefore the firewall controls **OMP tool access**, not arbitrary OS access.

Document this prominently in `/programmatic doctor` and `docs/threat-model.md`.

---

## 10. Eval behavior in this mode

### 10.1 Eval is the control plane

The system/mode prompt should describe Eval as:

- persistent scratch/control state;
- the place to call host capabilities;
- the place to filter/aggregate large outputs;
- the place to construct workflow calls;
- **not** the source of truth for durable workflow state.

### 10.2 One environment, not competing environments

Do not add a second model-visible shell/code tool. OMP Eval is the canonical model-side execution environment.

### 10.3 Preferred backend

Prefer JavaScript for package workflow authoring examples because:

- OMP is TypeScript/Bun-native;
- the workflow bridge tools use JS object arguments naturally;
- no Python wrapper package is required.

Do not disable Python by default. Prime-style users may prefer IPython for data manipulation.

### 10.4 Compact API bootstrap

The mode prompt may ask the model to define this alias once per Eval kernel:

```ts
const flow = {
  run:      (args) => tool.flow_run(args),
  stage:    (args) => tool.flow_stage(args),
  gate:     (args) => tool.flow_gate(args),
  artifact: (args) => tool.flow_artifact(args),
  host:     (args) => tool.flow_tool(args),
};
```

Do not re-declare it every cell. Eval state persists across calls.

### 10.5 Eval output discipline

Prompt rule:

> Keep raw/intermediate values in variables or artifacts. Print/display only the small result the parent needs for the next decision.

Enforce a result cap in `tool_result` for the outer Eval tool.

Default behavior when textual Eval result exceeds `evalResultMaxBytes`:

1. persist full text as an artifact;
2. return a bounded head/tail preview;
3. include a `ContextRef`/artifact ID;
4. preserve error state and image blocks;
5. never silently discard the only copy.

Example replacement:

```text
[Eval output stored: ctx_7QK3, 184,203 bytes]
--- head ---
...
--- tail ---
...
Use flow.artifact({action:"read", id:"ctx_7QK3", ...}) from Eval to inspect slices.
```

### 10.6 Eval code policy in the WORKFLOW lane

The WORKFLOW lane should statically warn/block obvious uses of untracked orchestration primitives in the Eval cell source, especially direct `agent(...)` calls when a tracked workflow is required.

A minimal lexer should ignore strings/comments and detect direct call tokens such as:

```text
agent(
```

Do **not** claim this makes arbitrary code safe or impossible to bypass. Its purpose is deterministic workflow hygiene, not adversarial sandboxing.

If direct untracked changes occur anyway, the workspace ledger must taint the run and prevent strict completion.

---
## 11. Programmatic workflow API

### 11.1 Why hidden bridge tools are used

The model should not receive a large `Workflow` tool schema directly. The workflow API should be callable only from Eval code.

Register the following extension tools as **inactive by default**:

```text
lane_assess
lane_status
decision_ledger
flow_run
flow_stage
flow_gate
flow_artifact
flow_tool
```

They remain in the session registry so Eval's `tool.<name>` proxy can call them, but they are not included in the active direct tool set.

If OMP's current hidden/default-active semantics do not retain an inactive registered tool in the full registry, adjust registration so it is registered but immediately excluded from active tools. Add an integration test for this exact behavior.

### 11.2 `flow_run`

Schema-level conceptual actions:

```ts
type FlowRunRequest =
  | {
      action: "create";
      name: string;
      objective: string;
      acceptanceCriteria?: string[];
      lane?: "workflow";
      maxNodes?: number;
      maxConcurrent?: number;
      metadata?: JsonObject;
    }
  | { action: "status"; runId: string }
  | { action: "complete"; runId: string }
  | { action: "pause"; runId: string; reason?: string }
  | { action: "resume"; runId: string }
  | { action: "abort"; runId: string; reason?: string }
  | { action: "list" };
```

`complete` is a request, not an assignment. The engine decides whether completion is legal.

### 11.3 `flow_stage`

```ts
type FlowStageRequest =
  | {
      action: "task";
      runId: string;
      key: string;
      name: string;
      prompt: string;
      parents?: string[];
      contextRefs?: string[];
      artifactPaths?: string[];
      outputArtifact?: string;
      outputSchema?: JsonSchema;
      schemaMode?: "permissive" | "strict";
      model?: string;
      thinkingLevel?: string;
      programmaticTools?: string[];
      mutatesWorkspace?: boolean;
      workspace?: "none" | "isolated";
      maxTurns?: number;
      timeoutMs?: number;
    }
  | {
      action: "parallel";
      runId: string;
      stages: Array<Omit<FlowTaskRequest, "action" | "runId">>;
      concurrency?: number;
      failFast?: boolean;
    }
  | {
      action: "send";
      runId: string;
      nodeId: string;
      message: string;
      delivery?: "steer" | "followUp";
    }
  | { action: "abort"; runId: string; nodeId: string };
```

Require `key` for replay identity. `name` is display text; `key` is the durable identity.

### 11.4 `flow_gate`

```ts
type FlowGateRequest =
  | CommandGateRequest
  | ReviewGateRequest
  | SchemaGateRequest
  | ArtifactGateRequest
  | DiffGateRequest
  | HumanGateRequest
  | { action: "status"; runId: string; gateId?: string };
```

Gate creation/execution writes gate state through `GateEngine`; no generic API may directly set `passed: true`.

### 11.5 `flow_artifact`

```ts
type FlowArtifactRequest =
  | { action: "putText"; runId: string; name: string; text: string; tags?: string[] }
  | { action: "putJson"; runId: string; name: string; value: JsonValue; tags?: string[] }
  | { action: "list"; runId: string; tag?: string }
  | { action: "meta"; runId: string; id: string }
  | { action: "read"; runId: string; id: string; offset?: number; limit?: number }
  | { action: "search"; runId: string; id: string; query: string; maxMatches?: number };
```

`read` and `search` return data to Eval code; they do not inject it into the root model context unless the code prints/displays it.

### 11.6 `flow_tool`

`flow_tool` exists for **durable host-owned operations** where replay semantics matter.

```ts
type FlowToolRequest = {
  runId: string;
  key: string;
  operation: "command" | "read" | "write" | "repo" | "custom";
  args: JsonObject;
  failureMode?: "throw" | "return";
  maxAttempts?: number;
  retryDelayMs?: number;
};
```

Do not expose an arbitrary JavaScript callback over the wire. The callback lives in host TypeScript selected by `operation`.

For model-driven arbitrary shell work that is not required to be durable, normal Eval/Bun or programmatic `tool.bash` may still be used in `main`/`duo`/`orchestrate`. In `workflow`, mutation that must survive replay should use a tracked stage, durable `ctx.tool()`, or `flow_tool`.

### 11.7 API documentation discovery

Keep the mode system prompt short. It should contain only:

- the lane/decision APIs plus the five flow API names;
- one-line purpose/signatures;
- the rule that the `workflow` lane requires tracked stages/gates;
- a pointer to full docs.

Expose full docs through:

```ts
await tool.flow_run({ action: "docs", section: "stage" })
```

or a dedicated `flow_docs` action if preferred.

Do not inject the entire authoring manual into every turn.

### 11.8 Workflow authoring contract: Atomic semantics, pi-extensible execution style

Reusable workflows are a **v1 requirement**, not future work.

The public authoring shape MUST intentionally resemble Atomic's typed definition contract:

```ts
import { workflow, Type } from "omp-programmatic-orchestrator/workflow";

export default workflow({
  name: "implement-feature",
  description: "Explore, implement vertical slices, verify, and prepare integration.",
  inputs: {
    task: Type.String(),
  },
  outputs: {
    summary: Type.String(),
  },
  run: async (ctx) => {
    // imperative, dynamic, DAG-only TypeScript
    return { summary: "..." };
  },
});
```

This package MUST NOT import Atomic at runtime. The API is a clean-room OMP implementation informed by Atomic's public authoring contract and runtime semantics.

At the same time, the operations inside `run()` SHOULD follow the compact deterministic style proven by `pi-extensible-workflows`: explicit `agent`, `parallel`, `pipeline`, checkpoints, phases, repository workspaces, budgets, and replayable registered host functions. The package should therefore expose a coherent superset rather than two competing workflow languages.

### 11.9 Required `WorkflowRunContext`

At minimum:

```ts
interface WorkflowRunContext<I, O> {
  readonly inputs: I;
  readonly runId: string;
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly decisions: Readonly<DecisionLedgerView>;

  task(name: string, options: TaskOptions): Promise<TaskResult>;
  agent(prompt: string, options?: AgentOptions): Promise<JsonValue>;
  parallel<T>(name: string, tasks: ParallelTasks<T>, options?: ParallelOptions): Promise<T>;
  pipeline<T>(name: string, items: PipelineItems<T>, stages: PipelineStages, options?: PipelineOptions): Promise<T>;
  workflow<I2, O2>(definition: WorkflowDefinition<I2, O2>, options: ChildWorkflowOptions<I2>): Promise<O2>;

  tool<T>(name: string, args: JsonValue, fn: () => Promise<T>, options?: DurableToolOptions): Promise<T>;
  shell(command: string, options?: ShellOptions): Promise<ShellResult>;
  withWorkspace<T>(name: string, fn: (ref: RepositoryWorkspaceRef) => Promise<T>): Promise<T>;
  /** Compatibility alias; Git backend maps this to withWorkspace(). */
  withWorktree<T>(name: string, fn: (ref: RepositoryWorkspaceRef) => Promise<T>): Promise<T>;
  repo: WorkflowRepositoryContext;

  phase(name: string): void;
  checkpoint(name: string, options?: CheckpointOptions): Promise<boolean>;
  gate(name: string, gate: GateDefinition): Promise<GateResult>;
  artifact: WorkflowArtifactApi;
  ui: WorkflowUiApi;
  log(message: string): void;
}
```

Semantic rules:

- `task()` is the preferred Atomic-style named stage primitive when the graph identity should be explicit.
- `agent()` is the compact pi-extensible-style agent primitive; the runtime derives stable call-site/occurrence identity and journals it. It remains a tracked workflow node, unlike raw OMP Eval `agent()` outside this DSL.
- `parallel()` is for genuinely independent branches and returns keyed results.
- `pipeline()` is for multiple items passing through the same ordered stages; do not copy identical chains into `parallel()`.
- `tool()` wraps workflow-owned host side effects/checks in durable replay semantics.
- `shell()` is primarily for deterministic verification or idempotent operations. Mutating shell operations should normally be inside `tool()` or a tracked repository-workspace stage.
- `checkpoint()` is a durable approval/continuation point; it does not imply that every phase needs the user.
- `ui.*` is runtime HIL only; there is no declaration-time fake approval marker.
- every materialized dependency graph remains DAG-only; runtime edge admission is authoritative.

### 11.10 Dynamic workflows generated by Main

The default generated-workflow path follows pi-extensible-workflows closely:

1. Main inspects the workflow catalog/registry metadata.
2. Main writes a named workflow program in Eval or a package-owned scratch file.
3. Independent work fans out with `parallel()`; repeated uniform work uses `pipeline()`.
4. Results are passed explicitly into synthesizer/reviewer stages or artifacts.
5. Verification uses deterministic `shell`/host gates plus structured reviewer outputs as needed.
6. The launch snapshot captures the exact workflow source, inputs, resolved roles/models/tool policy, accepted Decision Ledger revision, and referenced reusable workflow versions/hashes.
7. Resume/retry replays completed durable nodes rather than re-running them.

Generated workflow code must run in a restricted workflow interpreter/runtime surface. It MUST NOT gain arbitrary imports/network/process/filesystem solely because it is TypeScript/JavaScript. Host access occurs through the context API. This is stricter than root OMP Eval and prevents workflow code from bypassing graph accounting accidentally.

### 11.11 Reusable workflow discovery: project and global

Use OMP-native paths:

```text
# Project scope — checked into / specific to repository
<project>/.omp/programmatic/workflows/*.ts

# Global/user scope — available in every project
~/.omp/agent/programmatic/workflows/*.ts
```

Resolution precedence:

```text
Project > Global/User > Package Built-ins
```

A project workflow with the same canonical name shadows the global definition. A global definition shadows a package builtin. Duplicate names within the same scope are errors.

The registry descriptor contains metadata only:

```ts
interface WorkflowDescriptor {
  name: string;
  description: string;
  scope: "project" | "global" | "builtin";
  path?: string;
  inputSchemaHash: string;
  outputSchemaHash: string;
  sourceHash: string;
  updatedAt?: number;
}
```

Discovery/listing MUST NOT execute arbitrary workflow body code just to show metadata. Prefer a safe loader that parses/loads through the package's constrained definition module and validates the returned `workflow()` definition without invoking `run()`.

Project workflow files are trusted project customization only when the project is trusted under the host's normal trust model. In an untrusted project, ignore project workflow code and surface a diagnostic.

### 11.12 Workflow creation and promotion UX

Commands:

```text
/programmatic workflow new
/programmatic workflow list
/programmatic workflow show <name>
/programmatic workflow reload
/programmatic workflow save <run-id> [--project|--global]
/programmatic workflow validate <name|path>
```

`workflow new` opens a minimal form/modal:

```text
Name: <workflow-name>
Scope: Project | Global
Description: ...
```

and writes a typed template using `workflow({...})`.

`workflow save <run-id>` promotes a successful dynamic workflow into a **reviewable source file**. Promotion never silently persists opaque generated code. The user/model must be able to inspect the resulting TypeScript before future use. The promotion process strips run-specific IDs/paths, converts concrete values to typed inputs where appropriate, and preserves deterministic node keys/checkpoint names.

Reload semantics should follow Atomic's strong behavior: serialize/coalesce reloads, publish a complete replacement registry only after validation, keep the prior registry on fatal refresh failure, and let in-flight runs keep their captured definition while future launches use the new one.

### 11.13 Workflow authoring guidance bundled with the package

`docs/workflow-authoring.md` and the bundled skill MUST teach these rules, adapted from Atomic and pi-extensible-workflows:

- default to `main` for truly single-agent work; do not use workflow merely because it exists;
- use workflow for genuine structure, durability, checkpoints, multiple vertical slices, or verifiable objectives;
- assign phases distinct responsibilities;
- keep result flow explicit;
- use `parallel()` only for independent work;
- use `pipeline()` for identical ordered chains across keyed items;
- await results before interpolation/consumption;
- prefer structured output only when a downstream consumer validates/compares fields;
- keep schemas minimal to consumer needs;
- use repository workspaces deliberately, with non-conflicting ownership;
- use deterministic host checks for verification and gates;
- treat retries, resume, and budget changes as explicit state transitions;
- preserve stable structural keys/call identity for replay;
- never create graph cycles;
- do not ask the user at every checkpoint—only the HIL classes in §4.8.

---

## 12. Workflow data model

### 12.1 Run state

```ts
export type RunStatus =
  | "pending"
  | "running"
  | "paused"
  | "awaiting_input"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export interface WorkflowRun {
  schemaVersion: 1;
  id: string;
  name: string;
  objective: string;
  acceptanceCriteria: string[];
  status: RunStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  lane: "workflow";
  rootCwd: string;
  definitionVersion: string;
  configHash: string;
  nodeOrder: string[];
  requiredGateIds: string[];
  activeNodeIds: string[];
  frontierNodeIds: string[];
  artifactIds: string[];
  tainted: boolean;
  taintReasons: string[];
  pauseReason?: string;
  terminalReason?: string;
  metadata: JsonObject;
}
```

### 12.2 Node state

```ts
export type NodeKind = "stage" | "host_tool" | "gate" | "human" | "subworkflow";
export type NodeStatus =
  | "pending"
  | "running"
  | "awaiting_input"
  | "paused"
  | "completed"
  | "cached"
  | "failed"
  | "blocked"
  | "cancelled";

export interface WorkflowNode {
  id: string;
  runId: string;
  key: string;
  name: string;
  kind: NodeKind;
  parentIds: string[];
  status: NodeStatus;
  ordinal: number;
  inputHash: string;
  replayHash: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  attempt: number;
  resultArtifactIds: string[];
  sessionFile?: string;
  error?: SerializedError;
  metadata: JsonObject;
}
```

### 12.3 Gate state

```ts
export type GateStatus = "pending" | "running" | "passed" | "failed" | "blocked" | "cancelled";

export interface GateRecord {
  id: string;
  runId: string;
  nodeId: string;
  key: string;
  type: "command" | "schema" | "artifact" | "review" | "human" | "diff";
  required: boolean;
  status: GateStatus;
  evidenceArtifactIds: string[];
  summary?: string;
  failureReason?: string;
  createdAt: number;
  endedAt?: number;
}
```

### 12.4 Context reference

```ts
export interface ContextRef {
  id: string;
  runId?: string;
  kind: "artifact" | "file" | "stage-output" | "command-output" | "review" | "memory" | "external";
  title: string;
  summary: string;
  path?: string;
  sha256: string;
  bytes: number;
  mimeType: string;
  tags: string[];
  createdByNodeId?: string;
  createdAt: number;
}
```

Context IDs must be opaque and stable for the life of the run.

---

## 13. DAG engine

### 13.1 Runtime topology only

Workflow code is dynamic. The engine validates the graph as nodes/edges materialize.

Do not attempt to statically prove arbitrary model-written Eval code acyclic.

### 13.2 Edge admission

When adding edge `parent -> child`:

1. reject `parent === child`;
2. reject if `child` is already an ancestor of `parent`;
3. reject if either node belongs to another run except through an explicit subworkflow boundary;
4. persist the edge before starting the child;
5. update the frontier atomically with the node admission event.

### 13.3 Frontier semantics

Maintain a `GraphFrontier` so model code does not need to calculate dependencies manually for the common case.

- first node parents = `[]`;
- sequential task parents = current frontier;
- after one sequential node settles, frontier = `[thatNode]`;
- at `parallel(...)` start, snapshot current frontier;
- every branch in that parallel call gets the same parent snapshot;
- after the parallel barrier, frontier = all successful/settled branch node IDs according to failure policy.

Allow explicit parents only for advanced workflows.

### 13.4 Parallelism

```ts
interface SchedulerConfig {
  maxConcurrentStages: number;
  maxConcurrentModelRequests?: number;
  maxNodesPerRun: number;
}
```

Use a simple semaphore. No external queue package.

`failFast=false` is the default for independent research/review fan-outs so one failure does not erase evidence from successful siblings.

### 13.5 Cancellation

Every running node gets an `AbortController`.

Cancellation hierarchy:

```text
run abort -> abort all descendants/running nodes
node abort -> abort only node + descendants that depend exclusively on it
pause     -> do not admit new nodes; running nodes may be allowed to settle unless hard pause requested
```

Do not kill the root OMP session when cancelling a workflow stage.

---

## 14. Durable journal and replay

### 14.1 Storage layout

Default project-local layout:

```text
.omp/programmatic/
└── runs/
    └── <run-id>/
        ├── run.json
        ├── journal.jsonl
        ├── graph.json
        ├── artifacts/
        ├── stages/
        │   └── <node-id>/
        ├── workspaces.json
        └── locks/
```

Allow `storageRoot` override.

Add `.omp/programmatic/runs/` to the package's recommended `.gitignore` guidance; do not modify `.gitignore` automatically without user consent.

### 14.2 Journal format

Use append-only JSONL events:

```ts
type JournalEvent =
  | { type: "run_created"; ... }
  | { type: "run_started"; ... }
  | { type: "node_admitted"; ... }
  | { type: "node_started"; ... }
  | { type: "node_completed"; ... }
  | { type: "node_failed"; ... }
  | { type: "gate_started"; ... }
  | { type: "gate_resolved"; ... }
  | { type: "prompt_opened"; ... }
  | { type: "prompt_resolved"; ... }
  | { type: "artifact_recorded"; ... }
  | { type: "run_tainted"; ... }
  | { type: "run_paused"; ... }
  | { type: "run_resumed"; ... }
  | { type: "run_terminal"; ... };
```

Every event includes:

```ts
{
  schemaVersion: 1,
  eventId: string,
  runId: string,
  timestamp: number,
  sequence: number
}
```

### 14.3 Atomic writes

For snapshot files:

1. write `<name>.<pid>.<uuid>.tmp`;
2. fsync if available/needed;
3. rename into place.

Journal append must write one complete JSON line per event.

### 14.4 Replay identity

A durable node must have a caller-supplied `key` unique in a run.

Compute:

```ts
inputHash = sha256(canonicalJson(nodeInputs));
replayHash = sha256(`${engineVersion}:${kind}:${key}:${inputHash}`);
```

On repeat admission with the same `(runId, key)`:

- same replay hash + prior completed => return cached result;
- same key + different replay hash => reject with `ReplayIdentityConflict` unless caller explicitly requests replacement/retry;
- prior failed => create next attempt under the same logical node identity;
- prior running after crash => mark interrupted, then follow configured resume policy.

### 14.5 Exactly-once claim boundary

The engine may claim:

> "Completed tracked nodes are not re-executed on replay when their replay identity matches."

It must NOT claim exactly-once semantics for:

- arbitrary Eval-native filesystem writes;
- arbitrary direct shell commands outside `flow_tool`/tracked stage;
- external services without idempotency keys;
- side effects performed by third-party code that ignores cancellation.

### 14.6 Resume policy

```ts
type ResumeInFlight = "ask" | "retry" | "fail";
```

Default interactive behavior: `ask`.

For non-interactive mode: `fail` unless config explicitly permits retry.

---

## 15. Stage runtime: OMP SDK sessions

### 15.1 Architectural decision

Durable workflow stages MUST use OMP's **public in-process SDK** rather than shelling out to another coding-agent process.

Import only public package exports from:

```ts
@oh-my-pi/pi-coding-agent
```

Do not import private file paths under OMP's source tree from the plugin.

### 15.2 Stage construction

Conceptual implementation:

```ts
const settings = await createEphemeralStageSettings(policy);
const registry = new AgentRegistry();
const sessionManager = SessionManager.create(stageCwd, stageSessionDir);

const { session, setToolUIContext } = await createAgentSession({
  cwd: stageCwd,
  sessionManager,
  modelRegistry: parentModelRegistry,
  model: resolvedModel,
  thinkingLevel: policy.thinkingLevel,
  settings,
  agentRegistry: registry,

  toolNames: ["eval", ...policy.programmaticTools],
  restrictToolNames: true,
  requireYieldTool: false,

  disableExtensionDiscovery: true,
  extensions: [createStagePolicyExtension(policy)],

  outputSchema: policy.outputSchema,
  outputSchemaMode: policy.schemaMode ?? "strict",

  enableLsp: policy.enableLsp === true,
  hasUI: workflowHasUi,
});

session.setActiveToolsByName(["eval"]);
```

The exact option names must be verified against the targeted OMP SDK types. Do not substitute a looser session if one option changes; update the code to preserve the policy.

### 15.3 Ephemeral settings

Do not mutate the user's persistent OMP settings to create stage restrictions.

Implementation pattern:

1. load user/project settings read-only through public `Settings` APIs;
2. create an isolated/non-persisting settings instance;
3. copy only the keys the stage needs (provider behavior, approval policy, eval backend availability, retry behavior, etc.);
4. apply stage-only overrides in memory.

Recommended stage overrides:

```text
magic keywords: off
ambient task recursion: off unless explicitly allowed
memory promotion/autolearn: off
ambient MCP: off
ambient extension discovery: off
workspace tree prompt: off by default
inline unrelated tool catalogs: off
```

### 15.4 Fresh system prompt

Each stage gets a compact stage doctrine through the inline stage policy extension's `before_agent_start` hook.

Required content:

```text
- stage role/name
- exact assignment
- exact acceptance condition
- allowed programmatic capabilities
- context-ref/artifact list
- output schema contract
- repository backend, mutation policy, workspace path, and owned change contract
- instruction to keep raw intermediate data in Eval variables/files
- instruction not to infer missing upstream context
- instruction to return evidence, not narration
```

Do not paste the root conversation.

### 15.5 Stage input

The stage user message contains only:

```text
[workflow run]
[stage key/name]
[assignment]
[declared ContextRefs/artifact paths]
[required output contract]
```

No prior assistant chatter.

### 15.6 Stage output

Prefer strict structured output for verifier/planner/reducer stages.

For free-form implementation stages, return:

```ts
interface StageResultEnvelope {
  summary: string;
  evidence: string[];
  artifactIds: string[];
  changedFiles?: string[];
  verification?: string[];
  blockers?: string[];
}
```

Persist full transcript/session file separately; inject only the envelope/summary upstream.

### 15.7 Stage lifecycle handle

Keep an in-memory `StageHandle` while the process is alive:

```ts
interface StageHandle {
  runId: string;
  nodeId: string;
  session: AgentSession;
  abort: AbortController;
  transcript: StageTranscriptProjection;
  status: NodeStatus;
}
```

This powers live TUI attachment and steering.

After process restart, expose completed stage sessions as read-only/postmortem transcript views until a new live session is resumed/recreated.

---
## 16. Selective context architecture

This is a core feature, not an optimization to add later.

### 16.1 The context problem this mode is solving

Traditional tool-using agent loops repeatedly do this:

```text
LLM -> tool call -> raw result -> LLM context -> next tool call -> raw result -> LLM context -> ...
```

For large repositories/research tasks this has three bad effects:

1. intermediate data consumes context even when it only exists to feed another operation;
2. child tasks inherit irrelevant reasoning/history;
3. compaction must summarize large amounts of transient tool chatter.

The mode instead targets:

```text
LLM -> Eval code
        -> programmatic tool calls
        -> variables / local files / artifacts
        -> filtering / slicing / aggregation
        -> small emitted result
LLM <- small result
```

and:

```text
root LLM -> stage assignment + selected ContextRefs
stage LLM -> focused work
root LLM <- structured result + artifact refs
```

### 16.2 Four context tiers

#### Tier 0 — Control context

Small context that is always eligible for injection while a workflow is active:

- workflow ID/name;
- objective;
- immutable acceptance criteria;
- current run status;
- current frontier;
- required gate summary;
- blockers/HIL state;
- a bounded artifact catalog.

Target budget: **<= 2,500 tokens** by default.

#### Tier 1 — Catalog context

Metadata only:

```text
ctx_01 — auth review — 12 KB — stage-output — “OAuth callback lacks state check…”
ctx_02 — test log — 88 KB — command-output — “3 failing integration tests…”
```

No raw body.

#### Tier 2 — Selected stage context

Raw or summarized material explicitly selected for one stage:

- file/artifact paths;
- slices;
- structured upstream output;
- ContextRefs named by the stage call.

It is materialized into the stage's fresh context, not automatically appended to the root transcript.

#### Tier 3 — Raw working state

Large data that should normally never be injected into an LLM message automatically:

- complete command logs;
- large file contents;
- raw search result sets;
- full stage transcripts;
- large JSON;
- repository indexes.

It remains in Eval variables, files, or the artifact store until selected.

### 16.3 Context broker responsibilities

`ContextBroker` must provide:

```ts
interface ContextBroker {
  putText(...): Promise<ContextRef>;
  putJson(...): Promise<ContextRef>;
  registerFile(...): Promise<ContextRef>;
  metadata(id: string): Promise<ContextRef>;
  list(filter?: ContextFilter): Promise<ContextRef[]>;
  readSlice(id: string, options: SliceOptions): Promise<string>;
  search(id: string, query: string, options?: SearchOptions): Promise<ContextSearchResult[]>;
  materializeForStage(ids: string[], budget: ContextBudget): Promise<StageContextBundle>;
  compactCatalog(runId: string): Promise<string>;
}
```

### 16.4 ContextRef integrity

When content is persisted, calculate SHA-256 and size.

When a stage consumes a file artifact whose hash no longer matches, fail the handoff or create a new ContextRef. Do not silently pretend a changed file is the same artifact.

### 16.5 Artifact-first handoffs

For outputs larger than a small envelope, use file-only/artifact handoff:

```text
specialist -> artifact + structured 5-line summary
aggregator -> receives artifact ID/path and reads only needed sections
```

This mirrors the strongest part of Atomic's `reads`/`file-only` pattern and Prime's prompt-as-variable approach.

### 16.6 No automatic parent transcript inheritance

A stage must never receive `ctx.session.messages` from the parent by default.

If a future `context="fork"` mode is added, it must be explicit and should use OMP session branching/summarization, not a raw copy of every message.

### 16.7 Root context injection

Use the extension `context` event conservatively.

It SHOULD:

- deduplicate core `orchestrate`/`workflowz` notices when package mode owns the request;
- ensure one bounded workflow-state custom message is present;
- replace stale package workflow-state messages with the newest snapshot;
- avoid injecting full artifacts/transcripts.

It SHOULD NOT in v1:

- aggressively delete arbitrary historical user/assistant messages;
- manually reconstruct provider tool-call/tool-result protocol pairs;
- replace OMP compaction wholesale.

The biggest context win comes from keeping internal tool calls inside Eval and using fresh stage sessions, not from risky transcript surgery.

### 16.8 Compaction behavior

Critical workflow state must survive OMP compaction because it is persisted externally.

After compaction or session restoration:

1. reload run snapshot/journal;
2. rebuild the Tier-0 compact run summary;
3. re-inject that summary when the next turn starts;
4. keep artifact bodies out of the prompt.

Eval kernel state may be reused when available, but recovery must not depend on it.

### 16.9 Context budget enforcement

```ts
interface ContextBudget {
  maxBytes: number;
  maxCharsPerItem: number;
  maxItems: number;
}
```

If explicit stage context exceeds budget:

- do not silently truncate correctness-critical contract text;
- keep objective/acceptance criteria protected;
- convert bulk material to artifact references and slices;
- fail with an actionable error when materialization cannot fit safely.

### 16.10 Selective injection acceptance test

Create a synthetic 2 MB tool result and a three-stage workflow.

The test passes only if:

- the 2 MB raw result is stored outside model context;
- root receives a bounded preview/ref;
- stage 2 receives only the requested slice/ref;
- stage 3 does not receive stage 1 data unless explicitly declared;
- workflow remains resumable after the Eval kernel is reset.

---

## 17. Artifact store

### 17.1 Artifact metadata

```ts
export interface WorkflowArtifact {
  id: string;
  runId: string;
  name: string;
  kind: "text" | "json" | "file" | "patch" | "diff" | "log" | "report" | "transcript";
  relativePath: string;
  sha256: string;
  bytes: number;
  createdAt: number;
  createdByNodeId?: string;
  tags: string[];
  summary: string;
}
```

### 17.2 Naming

Do not let model-provided names escape the run artifact root.

Sanitize display names and generate actual filenames from opaque IDs plus safe suffixes.

Reject path traversal.

### 17.3 Secret handling

Before persisting model-visible command/tool outputs, run OMP-compatible secret redaction where public APIs exist. If unavailable, implement conservative pattern redaction for obvious bearer/API-key forms and document limits.

Never persist process environment wholesale.

### 17.4 Output limits

Store full output subject to a configurable hard artifact size limit; return bounded summaries to models/UI.

Suggested defaults:

```text
single textual artifact hard cap: 16 MiB
model preview: 24 KiB
TUI preview: 128 KiB paged/sliced
```

If a command can produce more, stream to a file and keep tail/head indexes rather than buffering all of it in memory.

---

## 18. Native Git repository, worktree, branch, and mutation management

### 18.1 Architectural rule

Repository management is a **host service**, not an agent convention.

The package exposes one normalized API to Main, Partner, specialists, and workflow stages. The service records Git state once for each request/run and rejects unsafe repository state.

```ts
type RepositoryBackend = "git" | "none";

interface RepositoryContext {
  backend: RepositoryBackend;
  repoRoot?: string;
  worktreeRoot?: string;
  worktreeName?: string;
  branch?: string;
  commit?: string;
  base: RevisionRef;
  remotes: RepositoryRemote[];
  conflicts: RepositoryConflict[];
}
```

The model calls `tool.repo({ action: "status" })` or workflow `ctx.repo.status()`. It does not infer repository state from prompt text. Typed repository methods own status, branch, commit, worktree, merge, review, recovery, and push operations.

OMP Eval is not an OS sandbox. Direct process spawning can escape host policy, so repository mutation sentinels reconcile branch, commit, worktree, and reflog state around Eval. Unreceipted changes taint the run, block integration/push, and enter recovery.

### 18.2 Deterministic Git detection and bootstrap

At activation or first repository-sensitive request, `RepositoryManager.initialize()`:

```text
1. detect a Git repository and resolve its root
2. reject detached HEAD and in-progress merge/rebase/cherry-pick/bisect state
3. resolve `main` and configured remote `origin`
4. select the current task branch or require `task/<slug>` for worker mutation
5. record branch, immutable commit OID, worktree path, and reflog checkpoint
```

A missing repository supports read-only MAIN mode. Repository-mutating workflow paths require a valid Git repository, attached branch, clean ownership boundaries, and a coordinator for integration.

### 18.3 Worker isolation and ownership

Every mutating worker uses one dedicated worktree and task branch:

```text
git fetch origin main
git worktree add -b task/<slug> ../<repo>.<slug> main
```

Workers inspect and edit only inside that worktree, commit locally, and report branch plus immutable commit OID. Workers MUST NOT push, switch to `main`, merge into `main`, or alter another worktree. The coordinator owns worktree creation policy and cleanup.

The worktree lifecycle is: create from `main`; perform scoped edits; commit; report branch/OID; coordinator inspects; coordinator serially merges into `main`; coordinator runs gates; coordinator pushes `origin/main`; coordinator removes worktree only after integration succeeds.

### 18.4 Durable repository identity

Persist branch and commit identity together:

```ts
interface GitRevisionRef {
  branch: string;
  commit: string;
  parents: string[];
  conflicted: boolean;
}

interface GitRecoveryCheckpoint {
  reflogEntry: string;
  at: number;
  reason: string;
  nodeId?: string;
  runId?: string;
}
```

Commit OIDs are immutable evidence for delivered work. Rewrites create new OIDs; refresh branch and commit refs after every rewrite. Reflog entries provide local recovery evidence but never replace the workflow journal.

### 18.5 Repository ledger and taint detection

At workflow start and around every tracked mutation boundary, record repository root, branch, commit OID, worktree path, `main` base, remote targets, conflict state, and changed-file fingerprint. Reconcile branch, commit, worktree, and reflog state after each boundary. Unexpected mutation sets `run.tainted = true`.

### 18.6 Strict repository mode

When `repository.strictTracking=true`:

- mutating WORKFLOW runs require `backend === "git"`;
- detached HEAD, unresolved conflicts, or unexpected mutations block completion;
- workers must remain on `task/<slug>` branches;
- `main` integration and `origin/main` push are coordinator-only;
- final completion records exact task branches, commit OIDs, and reflog checkpoint.

### 18.7 Coordinator integration

Coordinator integrates branches serially:

```text
git switch main
git merge --no-ff task/<slug> -m "merge: <slug> into main"
just verify
git push origin main
```

Use `git merge --ff-only` where project policy requires linear history. Never run concurrent coordinator merges or pushes. A successful merge command is not enough: inspect conflict state and rerun required gates after each integration batch.

### 18.8 Recovery and cleanup

Before destructive or rewrite operations, record a reflog checkpoint. Recovery chooses a provenance-backed Git operation and requires user approval when unrelated work could be replaced. Do not use `git reset --hard`, `git clean -fd`, or force branch deletion as repair.

Clean a task worktree only after coordinator integration is proven and `git status --short --branch` confirms no uncommitted work. Preserve unknown changes and stop rather than deleting them.

### 18.9 Review-unit preparation

Review units are task branches and commit ranges based on `main`. A single review uses one task branch and its tip commit. Stacked review uses explicitly ordered task branches and commit OIDs; never infer order from lexical branch names. Rewriting a lower branch requires refreshing descendant branches and all recorded commit OIDs before integration.

### 18.10 Remote publication

Only coordinator may push. Before push, fetch `origin/main`, reconcile divergence, inspect the planned range, run gates, and use normal `git push origin main`. Remote rejection is a blocked state requiring reconciliation, not a reason to force blindly. Branch deletion after integration requires explicit coordinator policy and preservation checks.

### 18.11 Repository programmatic bridge

Register one hidden/inactive bridge tool named `repo` for Eval and expose the same functionality as `ctx.repo` in workflows.

```ts
type RepoAction =
  | "status" | "snapshot" | "commit" | "diff" | "merge" | "rebase"
  | "worktree_create" | "worktree_close" | "branch_get" | "verify"
  | "conflicts" | "recover" | "fetch" | "push";
```

Mutation actions name exact branch, worktree, commit, and remote inputs. No action accepts arbitrary shell commands. `push` is rejected unless caller is coordinator on clean `main` after gates pass.

### 18.12 Repository state in the TUI

```text
VCS Git · branch task/<slug> · commit 3f8d9a · worktree omp-N4
main base · 0 conflicts · push: coordinator only · remote origin
```

Node/stage panes show owned branch, commit OID, worktree, base, and integration state. Detached HEAD is always rendered as a blocked state.

### 18.13 Conflict and divergence handling

After every history-changing operation, query merge/rebase status, detect unresolved conflicts, and compare branch tip against its recorded base. If conflicts exist, mark node blocked or failed, attach paths/evidence, resolve in an isolated worktree when repair is allowed, rerun machine checks, and never integrate conflicted branches.

### 18.14 Raw command policy

Package-owned repository commands use `Bun.spawn` argument arrays and validated repository/worktree cwd. Never shell-concatenate branch names, paths, or remote names.

```ts
type RepoCommandClass =
  | "git-read" | "git-mutate-local" | "git-remote"
  | "git-mutate-forbidden";
```

Host-mediated mutating Git is allowed only through typed repository service actions. Raw model-directed mutation outside that service is a contract violation and taints the run when observed.

### 18.15 Repository checks

Repository doctor reports Git version, root, current branch, detached-HEAD state, worktree list, `main` resolution, remotes, reflog access, merge/rebase state, and push readiness. Read-only/programmatic mode works outside a repository; mutating paths fail closed without valid Git state.

## 19. Verification and gate engine

This is the most important Atomic-derived component.

### 19.1 Gate philosophy

Use LLMs to generate hypotheses, evidence, patches, explanations, and structured verdicts.

Use host code to decide whether the workflow state transition is allowed.

Never write:

```ts
if (modelSaidLooksGood) run.status = "completed";
```

### 19.2 Required gate categories

Implement these in v1:

1. command gate;
2. artifact gate;
3. schema gate;
4. review gate;
5. human gate;
6. diff/workspace gate.

### 19.3 Command gate

```ts
interface CommandGateRequest {
  action: "command";
  runId: string;
  key: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  expectedExitCodes?: number[]; // default [0]
  timeoutMs?: number;
  required?: boolean;          // default true
}
```

Execute with `Bun.spawn` using argv arrays where possible.

Persist:

- command/args;
- cwd;
- exit code;
- bounded stdout/stderr;
- duration;
- evidence artifact IDs.

Pass iff exit code is in expected set and execution was not cancelled/timed out.

### 19.4 Artifact gate

Examples:

- required file exists;
- artifact hash matches expected;
- required report was produced;
- patch is non-empty/empty as appropriate.

Do not ask an LLM whether a file exists.

### 19.5 Schema gate

Validate a stage/result artifact against a JSON schema/TypeBox-compatible schema.

Schema parse/validation error => failed gate.

### 19.6 Review gate

The review gate runs independent verifier stages in fresh contexts.

Default verifier output:

```ts
interface ReviewDecision {
  verdict: "pass" | "fail";
  confidence: number;
  summary: string;
  evidence: Array<{
    claim: string;
    source: string;
    observation: string;
  }>;
  blockingFindings: Array<{
    title: string;
    severity: "critical" | "high" | "medium" | "low";
    evidence: string;
    remediation?: string;
  }>;
  reviewerError?: {
    kind: "validation_unavailable" | "dependency_unavailable" | "tool_failure" | "reviewer_failure";
    message: string;
  };
}
```

Host approval predicate for `quorum="all"`:

```ts
function passesReviewGate(reviews: ReviewDecision[], expectedCount: number): boolean {
  return (
    reviews.length === expectedCount &&
    reviews.every(r =>
      r.verdict === "pass" &&
      r.reviewerError == null &&
      r.blockingFindings.length === 0
    )
  );
}
```

If structured output cannot be parsed, treat that reviewer as failed.

### 19.7 Reducer

A reducer stage may synthesize reviewer evidence into:

```ts
{
  decision: "accept" | "repair" | "reject",
  rationale: string,
  remainingWork: string[]
}
```

But the reducer does not override deterministic host facts.

Example:

```ts
if (reducer.decision === "accept" && !hostQuorumPassed) {
  reducerDecision = repairBudgetRemaining ? "repair" : "reject";
}
```

### 19.8 Human gate

```ts
interface HumanGateRequest {
  action: "human";
  runId: string;
  key: string;
  name: string;
  kind: "confirm" | "select" | "input" | "editor";
  message: string;
  choices?: string[];
  required?: boolean;
}
```

Persist prompt identity and answer separately.

The answer must be auditable in the TUI/journal.

### 19.9 Diff/workspace gate

At minimum support:

- fail if run tainted;
- fail if unresolved merge conflicts exist;
- fail the repository diff hygiene check. Under Git, render the owned change/stack as Git-format diff (`git diff --git ...`) and run the configured whitespace/patch validator; do not make raw `git diff --check` the canonical implementation;
- optionally require expected changed files/patterns;
- optionally ensure no changes when workflow is analysis-only.

### 19.10 Gate status cannot be edited generically

There must be no public method like:

```ts
setGateStatus(id, "passed")
```

outside the gate engine's internal implementation.

### 19.11 Completion reducer

`WorkflowEngine.completeRun(runId)`:

```ts
if (run.tainted && strictPolicy) fail("workspace tainted");
if (run.activeNodeIds.length > 0) fail("nodes still running");
if (requiredGates.some(g => g.status !== "passed")) fail("required gates not passed");
if (requiredArtifactsMissing) fail("required artifacts missing");
if (unresolvedPrompt) fail("awaiting human input");

transition(run, "completed");
```

Only this function writes terminal `completed`.

---

## 20. Bounded repair loops

### 20.1 Generic repair helper

Provide a host-level helper used by the model through bridge calls:

```ts
interface RepairPolicy {
  maxRounds: number;
  verifierCount: number;
  quorum: "all" | number;
}
```

Flow:

```text
candidate stage
  -> verifier fan-out
  -> host reducer
     -> pass => gate passes
     -> fail + rounds left => repair stage
     -> fail + no rounds => gate fails / run blocked
```

### 20.2 Repair evidence

Repair stages get only:

- candidate artifact;
- normalized blocking findings;
- acceptance criteria;
- relevant context refs.

Do not inject all verifier transcripts.

### 20.3 Bound exhaustion

When the bound is reached, do not keep asking the model to "try again" indefinitely.

Set:

```text
run.status = blocked or failed
```

with explicit remaining work.

---
## 21. Workflow TUI / modal

The TUI is required functionality, not a debugging afterthought.

### 21.1 Host primitive

Use OMP extension UI:

```ts
ctx.ui.custom(factory, { overlay: true, ... })
```

The workflow graph must be a real TUI component, not ASCII injected into chat.

### 21.2 One overlay shell, multiple panes

Follow Atomic's strongest UI pattern conceptually: mount one outer overlay and switch its interior between views.

```ts
type WorkflowPaneMode =
  | "graph"
  | "stage"
  | "artifact"
  | "gate"
  | "prompt";
```

Do not destroy/recreate the outer overlay on every stage attach. Preserve focus and scroll state.

### 21.3 Graph view

Header:

```text
WORKFLOW  security-audit   8F2C   RUNNING   4/9   02:14   $0.42
```

Body should show a compact DAG with status glyphs.

Suggested glyphs:

```text
○ pending
◌ queued
● running
✓ completed
↺ cached/replayed
! failed
⊘ cancelled
? awaiting input
Ⅱ paused
◆ gate
```

Do not depend on Nerd Font glyphs; provide ASCII fallback.

### 21.4 Node card data

Each focused node card shows:

- name/key;
- kind;
- parents;
- status;
- model/thinking level for stage;
- allowed programmatic tools;
- context refs count;
- artifacts;
- elapsed/tokens/cost if available;
- last intent/current tool projection;
- error/blocker summary.

### 21.5 Graph keybindings

Recommended package-local keymap while overlay focused:

```text
↑/↓ or j/k     move focus
←/→ or h/l     navigate graph branch/column
Enter          attach/open focused node
g              graph view
a              artifacts for focused node
e              gate evidence for focused gate
p              pause/resume selected run/node (with confirmation for destructive action)
r              retry eligible failed node
x              cancel selected node (confirm)
Ctrl+X         detach/hide overlay, return to main chat
Esc            close transient pane / back
?              help
```

Use OMP keybinding manager types when available, but keep mappings scoped to the overlay.

### 21.6 Stage view

For a live stage, display:

- stage header/status;
- projected stage transcript;
- working/tool activity;
- queued messages;
- editor/composer;
- footer hints.

Input behavior:

```text
idle stage + Enter      -> prompt/continue stage
running + Enter         -> steer
running + Ctrl+F        -> queue follow-up
paused + Enter          -> resume with composer text
Ctrl+X                  -> return to graph
blocked/completed       -> read-only except allowed retry/navigation commands
```

If OMP does not export its internal interactive chat renderer as a supported public SDK component, implement a small package-local transcript renderer from `AgentSession` subscription events. Do **not** import Atomic UI source or OMP private source paths.

### 21.7 Stage transcript projection

Store a lightweight display projection rather than retaining unbounded rendered components:

```ts
interface StageTranscriptEntry {
  id: string;
  role: "user" | "assistant" | "tool" | "notice";
  text: string;
  timestamp: number;
  collapsed?: boolean;
}
```

Long tool output should link to artifacts instead of rendering every line.

### 21.8 HIL prompt view

When a human gate is pending:

- focus the prompt card;
- show exactly which run/gate requested it;
- render input/select/confirm/editor;
- write the answer to the journal;
- return to graph with the gate visibly resolved.

Do not send the HIL answer into unrelated main-chat model context unless the workflow root needs a compact result.

### 21.9 Postmortem view

Completed/failed stage sessions must remain inspectable after the live session is disposed.

Use persisted transcript/session artifacts for read-only view.

### 21.10 Main-chat lifecycle notices

Send compact lifecycle messages only for meaningful transitions:

- workflow started;
- workflow awaiting input;
- workflow blocked/failed;
- workflow completed;
- user paused/resumed/aborted.

Do not send a main-chat message for every node update.

---

## 22. Prompt policy

### 22.1 Root mode prompt must be small

Target: **under ~1,500 tokens** excluding dynamic Tier-0 workflow summary.

It should say, in substance:

```text
PROGRAMMATIC MODE ACTIVE.

Direct tool surface: Eval only.
Use Eval code as the control plane. Keep intermediate data in variables/artifacts and emit only what you need to reason about.

Programmatic OMP capabilities may be called with tool.<name>(args) only when allowed by the active policy.

Execution lanes are host-selected after bounded exploration:
- MAIN: Main completes the request alone.
- DUO: Main + one Partner, bidirectional messaging, scouts depth 1 only.
- ORCHESTRATE: specialist fan-out; workers report to Main only.
- WORKFLOW: durable typed workflow; stages/gates, not prose, determine completion.

Accepted exploration decisions are held in the Main-owned Decision Ledger.

Full workflow API docs are available programmatically; do not ask for them unless needed.
```

### 22.2 WORKFLOW lane additional contract

```text
A WORKFLOW-lane request is incomplete until a tracked run reaches host status completed.
Do not use prose such as “tests pass” as a gate.
Do not claim a required gate passed unless flow_gate reports passed.
Do not dump raw logs into chat; store them as artifacts and inspect slices.
```

### 22.3 Mode reminders

Do not resend the full policy every turn as a custom chat message.

- full mode block: system prompt while mode active;
- compact run-state block: dynamic Tier 0;
- optional one-line custom reminder every N user turns only if the model repeatedly violates mode contract.

### 22.4 Child/stage prompt

Stages should have an even smaller role-specific system prompt.

Do not expose workflow-controller internals to a verifier stage unless it needs them.

### 22.5 Protect immutable acceptance criteria

Acceptance criteria are stored in run state and included verbatim in verifier/reducer stages.

A model stage may propose a clarification, but may not mutate the original criteria in place.

If criteria change, create a versioned amendment with user provenance.

---

## 23. Magic-word integration details

### 23.1 Parser behavior

Implement a small prose-aware matcher equivalent to OMP's current magic-word semantics:

- only lower-case standalone `orchestrate` / `workflowz`;
- ignore code fences and inline code where practical;
- avoid matching inside URLs/identifiers;
- no substring match in `myworkflowzthing`.

Reuse public OMP helper exports if available. Otherwise implement locally and test against the known OMP cases.

### 23.2 Event timing

Activation must occur before the provider receives the tool list for the triggering user message.

Preferred:

```text
input event -> detect -> enter mode -> activeTools=[eval]
```

`before_agent_start` then reasserts.

If the OMP event order changes in a future version, the integration test must catch any request where the triggering turn still exposes normal tools.

### 23.3 `orchestrate`

`orchestrate` is an explicit request-scoped lane floor: the router may not select MAIN or DUO for that request.

Expected behavior:

- Eval-only direct surface;
- Prime/RLM-style code-first work;
- use native Eval `agent(...)`, `parallel(...)`, and `pipeline(...)` when useful;
- no durable graph is required unless new evidence forces escalation to WORKFLOW;
- request-scoped activation auto-restores the prior tool set after terminal `agent_end`.

### 23.4 `workflowz`

`workflowz` activates strict durable workflow behavior.

Expected behavior:

- Eval-only direct surface;
- create or resume a tracked workflow run;
- use `flow_*` API for stage/gate/artifact lifecycle;
- graph UI becomes available immediately after run creation;
- run-scoped activation persists through HIL and retries;
- root cannot reach verified-complete state without gate engine approval.

### 23.5 Both words

If both are present in one prompt, `workflowz` wins because it is strictly stronger.

---

## 24. Completion enforcement and contract violations

### 24.1 Root agent attempts to finish with non-terminal workflow

On `agent_end`, if:

```text
lane == workflow
AND active run exists
AND run is not terminal
AND run is not legitimately awaiting user input/paused
```

then the extension should send one compact follow-up/steer message:

```text
The tracked workflow is not terminal. Continue it or explicitly block/abort it; do not report completion yet. Current state: ...
```

### 24.2 No tracked run created

If `workflowz` activated and the root agent reaches terminal output without creating a run:

- first violation: re-enter with one compact corrective message;
- second violation: stop auto-continuation, mark mode violation, notify the user, and leave the session interactive.

Do not create an infinite self-correction loop.

### 24.3 Model claims a gate passed

Ignore the claim unless `GateRecord.status === "passed"`.

The TUI should visibly distinguish:

```text
model claim: “tests pass”
gate state: FAILED
```

if they disagree.

---

## 25. Model and stage orchestration policy

### 25.1 Model selection

By default, a stage inherits the root's current model.

Allow explicit stage model selectors from the authenticated OMP model registry.

Do not inject the full model catalog into the prompt. Expose a bounded programmatic search/action if needed, following Prime's pattern.

### 25.2 Stage roles

These are runtime roles, not separately discovered OMP task-agent files:

```text
scout
planner
worker
implementer
verifier
reducer
critic
```

A role maps to defaults:

```ts
interface StageRolePolicy {
  systemPrompt: string;
  programmaticTools: string[];
  mutation: "none" | "allowed";
  workspace: "none" | "isolated";
  outputSchema?: JsonSchema;
  thinkingLevel?: string;
}
```

Do not ship dozens of `agents/*.md` just to encode these internal policies. Runtime SDK stages are more explicit and easier to hard-isolate.

### 25.3 Verifier independence

Verifier stage MUST:

- use fresh context;
- not reuse the worker session;
- receive the literal objective/acceptance criteria;
- receive candidate artifact(s) and necessary source refs;
- receive no worker chain-of-thought/private scratch state;
- be instructed to re-derive claims and default to fail when evidence is unavailable.

### 25.4 Reducer independence

Reducer gets structured verifier outputs and candidate references, not raw hidden reasoning.

Host still performs quorum/parse/error checks independently of reducer opinion.

---

## 26. Concurrency, budgets, and backpressure

### 26.1 Separate queue size from concurrency

```ts
maxNodesPerRun != maxConcurrentStages
```

Allow a workflow to describe 30 nodes while only running 4 at once.

### 26.2 Default limits

Suggested:

```text
maxNodesPerRun: 64
maxConcurrentStages: 4
maxRepairRounds: 3
maxReviewers: 4
stage timeout: inherit OMP/default, configurable
workflow wall clock: no hard default, but expose optional budget
```

### 26.3 Token/cost accounting

Subscribe to stage events and aggregate usage where OMP exposes it.

Display run totals in the graph header.

Budget policy may block new node admission when a configured ceiling is exceeded.

### 26.4 Backpressure

Do not admit unbounded `parallel` arrays.

Validate before scheduling:

```ts
if (stages.length > config.maxNodesPerRun - currentNodes) reject;
```

### 26.5 Failure isolation

For parallel research/review:

- `failFast=false` default;
- settle all independent siblings;
- preserve successful evidence;
- mark downstream dependencies blocked if their required parent failed.

For mutation pipelines:

- fail fast at integration/merge barriers by default.

---

## 27. Error taxonomy

Use typed errors so UI/bridge can give actionable output.

```ts
class ProgrammaticModeError extends Error {}
class ToolPolicyViolation extends ProgrammaticModeError {}
class WorkflowNotFound extends ProgrammaticModeError {}
class WorkflowStateError extends ProgrammaticModeError {}
class DagCycleError extends ProgrammaticModeError {}
class ReplayIdentityConflict extends ProgrammaticModeError {}
class StageCreationError extends ProgrammaticModeError {}
class StageExecutionError extends ProgrammaticModeError {}
class StageOutputValidationError extends ProgrammaticModeError {}
class GateFailedError extends ProgrammaticModeError {}
class GateInfrastructureError extends ProgrammaticModeError {}
class ContextBudgetError extends ProgrammaticModeError {}
class ArtifactIntegrityError extends ProgrammaticModeError {}
class WorkspaceTaintedError extends ProgrammaticModeError {}
class HumanInputRequired extends ProgrammaticModeError {}
```

Bridge results should return a stable machine-readable error code plus human message.

Do not expose internal stack traces to the model by default; persist them to diagnostic logs.

---

## 28. Security and trust model

### 28.1 What this package does enforce

It enforces:

- direct model tool exposure is Eval-only while active;
- workflow stage registry is constructed from an allowlist;
- ambient SDK capabilities are disabled for restricted stages;
- programmatic OMP tool calls are allowlisted by extension policy;
- gate status transitions are host-owned;
- HIL fails closed without user input;
- path traversal is rejected in artifact storage;
- replay identity protects tracked nodes from accidental duplicate execution;
- strict workflow completion can be blocked on workspace taint.

### 28.2 What it does not enforce

It does not provide a security sandbox for:

- Python `os`, `subprocess`, filesystem access;
- Bun/JS filesystem/process/network APIs;
- malicious project code executed by the agent;
- a process running with credentials already available to OMP;
- external commands that intentionally escape the repository.

### 28.3 Threat-model statement shown to user

`/programmatic doctor` should include:

```text
Programmatic mode isolates the LLM's OMP tool interface and workflow policies.
Eval code still runs with this OMP process's OS permissions. Use a disposable clone,
container/VM, restricted user, or other external sandbox for untrusted code/instructions.
```

### 28.4 Optional future strict sandbox profile

If later required, implement a separate execution backend, not misleading wrappers around `node:vm`.

Possible platform strategies:

- Linux namespaces/seccomp via an available host sandbox;
- container/VM runtime supplied by user;
- a deliberately capability-limited interpreter/VFS.

Do not make `just-bash` a mandatory dependency merely to check a box. Its VFS/capability design is useful inspiration, but OMP Eval should remain the default programmatic engine.

---

## 29. Observability

### 29.1 Structured logs

Every workflow event should have structured debug logging:

```ts
logger.debug("programmatic.workflow.node.completed", {
  runId,
  nodeId,
  key,
  durationMs,
  cached,
});
```

### 29.2 Audit receipts

A completed workflow report should list concise receipts:

```text
- implementation: node N4, artifact patch_17
- tests: gate G2, exit 0, log ctx_44
- reviewers: G3, 2/2 passed
- workspace: untainted
```

### 29.3 Doctor command

`/programmatic doctor` checks:

- Eval exists and is registered;
- `setActiveTools(["eval"])` works;
- inactive flow tools remain registry-resolvable from Eval;
- OMP SDK `restrictToolNames` behaves as expected;
- stage session can be created/disposed;
- storage root writable;
- `git` version/capabilities, repository backend, trunk resolution, colocation, reflog access, conflicts/divergence, and push remote;
- task-sensitive repository compatibility: submodule scope, LFS-managed paths, in-progress Git state, and project checks that currently exist only as Git hooks;
- review-evolution support (`git interdiff`, `git evolog`) and read-only stack-verification support (`git run --ignore-changes`) when available;
- Git availability only if `git` or forge compatibility requires it;
- TUI availability;
- config validity;
- current OMP version/commit if detectable;
- known unsupported/changed APIs.

---
## 30. Critical architecture choices and rejected alternatives

This section exists to stop well-intentioned simplifications from destroying the design.

### 30.1 REJECTED: "Just add a system prompt telling OMP to use Eval"

Why rejected:

- normal direct tool schemas remain available;
- the model can ignore the instruction;
- no hard workflow state exists;
- no durable gates exist;
- context still fills with direct tool results.

Required replacement:

- active tool partition + tool firewall + host workflow engine.

### 30.2 REJECTED: `setActiveTools(["eval"])` as the only isolation mechanism

Why rejected:

- Eval's `tool.<name>` bridge resolves the full session registry.

Required replacement:

- active tool partition **and** programmatic allowlist.

### 30.3 REJECTED: create normal stage sessions and hide tools afterward

Why rejected:

- ambient MCP/extensions/custom tools may already be loaded;
- hidden registry capabilities may still be programmatically reachable.

Required replacement:

- create stage with `restrictToolNames: true` and explicit tool names, then make only Eval active.

### 30.4 REJECTED: use OMP `task`/Eval `agent()` as the only Atomic workflow engine

Why rejected for strict workflow mode:

- good for lightweight programmatic delegation, but insufficient as the durable source of graph/checkpoint/HIL state;
- live graph/stage-control semantics are harder to own reliably;
- raw calls can happen outside a tracked run.

Decision:

- keep native tracked/request-scoped `agent()` for the `orchestrate` lane;
- the `workflow` lane uses plugin-owned stage lifecycle backed by OMP SDK sessions.

### 30.5 REJECTED: copy Atomic's workflow implementation wholesale

Why rejected:

- user asked for one OMP package reusing OMP;
- Atomic's internal runtime types, persistence, and UI are coupled to its fork/runtime;
- it creates a large maintenance fork.

Decision:

- copy concepts/invariants, implement against OMP public SDK.

### 30.6 REJECTED: add DBOS or an external workflow service

Why rejected:

- external dependency and operational burden are unnecessary for a local coding-agent workflow;
- JSONL + snapshots are sufficient for v1 durability.

### 30.7 REJECTED: put all workflow output into the parent prompt

Why rejected:

- defeats the primary context-management objective.

Decision:

- artifacts + ContextRefs + explicit stage reads.

### 30.8 REJECTED: let a review LLM directly set gate status

Why rejected:

- reviewer/model output is fallible and can be malformed;
- Atomic's strongest patterns use host predicates around structured outputs.

Decision:

- structured reviewer evidence + deterministic host quorum/reducer rules.

### 30.9 REJECTED: claim Eval is a sandbox

Why rejected:

- false under OMP's current runtime.

Decision:

- explicit trust boundary and optional future external sandbox profile.

### 30.10 REJECTED: Agent-directed Git commands without coordinator control

Why rejected:

- it lets workers mutate shared repository state;
- it bypasses task-branch ownership and isolated worktrees;
- it allows concurrent integration and push races;
- it weakens detached-HEAD and conflict gates;
- it makes recovery and audit evidence ambiguous.

Decision:

- Git is the canonical repository backend; coordinator owns `main` integration and `origin/main` push.

### 30.11 REJECTED: let agents issue arbitrary `git` commands directly as the normal path

Why rejected:

- the goal is to stop the model guessing repository-management operations;
- advanced revision/rewrite/push semantics need host validation and evidence;
- stack publication and recovery require provenance the workflow engine can trust.

Decision:

- expose typed `tool.repo` / `ctx.repo` operations; raw `git` may be used only for read-only diagnostics when explicitly allowed.

### 30.12 REJECTED: aggressive root transcript rewriting in v1

Why rejected:

- can break provider protocol/history semantics;
- unnecessary to get most context savings.

Decision:

- keep internal operations in Eval; use compact results and fresh stage contexts.

---

## 31. Detailed module responsibilities

### `src/config.ts`

- load user/project JSON config;
- validate fields;
- merge precedence;
- provide immutable normalized config object;
- compute config hash for runs.

### `src/state.ts`

- in-memory mode state;
- session restoration metadata;
- no workflow execution logic.

### `src/mode/controller.ts`

- enter/exit/restore;
- activation scope;
- current lane/selection/phase;
- request lifecycle handoff to exploration/router;
- prior tool snapshot;
- status widget state;
- turn/run lifecycle.

### `src/mode/magic-words.ts`

- prose-aware matching;
- exact lower-case semantics;
- tests mirroring OMP behavior.

### `src/mode/tool-partition.ts`

- capture/restore active tools;
- reassert Eval-only state;
- verify Eval availability.

### `src/mode/tool-firewall.ts`

- programmatic allowlist;
- mode/lane policy resolution;
- `tool_call` event result;
- diagnostic provenance.

### `src/mode/context-policy.ts`

- dedupe core magic notices;
- inject bounded Tier-0 run summary;
- keep context event changes conservative.

### `src/mode/eval-result-policy.ts`

- inspect outer Eval result;
- persist oversized text;
- return bounded preview;
- preserve errors/images.

### `src/lane/exploration.ts`

- bounded read-mostly exploration;
- evidence collection and ContextRefs;
- optional depth-1 read scout;
- no tracked project mutation.

### `src/lane/router.ts`

- deterministic minimum-sufficient lane selection;
- lane floors/forced workflow;
- safe handling of unknown evidence;
- monotonic escalation.

### `src/lane/duo-runtime.ts` and `mailbox.ts`

- exactly Main + Partner foreground sessions;
- Main ↔ Partner message routing;
- scout depth enforcement;
- worker proposal/result delivery without Decision Ledger mutation.

### `src/lane/decision-ledger.ts`

- accepted/proposed/superseded decision persistence;
- Main/user-only mutation authorization;
- compact prompt projection and evidence refs.

### `src/programmatic/code-policy.ts`

- lightweight lexer for WORKFLOW-lane hygiene;
- direct `agent(...)` warnings/blocking where configured;
- not a security component.

### `src/workflow/graph.ts`

- nodes/edges;
- ancestor checks;
- cycle rejection;
- nested graph expansion types if later added.

### `src/workflow/frontier.ts`

- sequential and parallel frontier transitions;
- no persistence I/O.

### `src/workflow/journal.ts`

- append events;
- sequence numbers;
- replay journal;
- corruption handling.

### `src/workflow/store.ts`

- snapshots;
- query/update state;
- subscription invalidation for TUI.

### `src/workflow/replay.ts`

- replay hashes;
- cache hit/conflict resolution;
- interrupted-node policy.

### `src/workflow/scheduler.ts`

- semaphores;
- cancellation registry;
- admission limits;
- fail-fast behavior.

### `src/workflow/stage-runtime.ts`

- create/dispose OMP SDK sessions;
- register live handles;
- subscribe to events;
- structured output collection;
- UI binding;
- stage artifact/session persistence.

### `src/workflow/stage-policy-extension.ts`

Inline extension factory loaded only into a stage session. It:

- replaces/appends stage doctrine;
- reasserts Eval-only active tools;
- enforces stage programmatic tool allowlist;
- blocks ambient workflow-control tools unless explicitly supplied;
- bounds Eval result context.

### `src/repo/manager.ts`

- initialize/detect repository backend once;
- own normalized `RepositoryService`;
- expose backend/state to lanes/workflows/TUI;
- prohibit mid-run backend switching.

### `src/repo/git.ts`

- all Git CLI invocation and typed output parsing;
- use argument arrays only;
- version/capability detection;
- resolve branches, commit OIDs, `main`, conflicts, reflog entries;
- never expose arbitrary command execution.

### `src/repo/stack.ts`

- build/validate `StackPlan`;
- split/squash/absorb/rebase/abandon through `git.ts`;
- refresh branch tips and commit OIDs after rewrite;
- publication branch mapping;
- explicit stacked-review dependency order.

### `src/repo/workspace.ts`

- create/list/root/update-stale/forget Git worktrees;
- opaque run/node workspace naming;
- cleanup safety;
- Git-worktree implementation only inside `git.ts`.

### `src/repo/ledger.ts`

- reflog recovery checkpoints;
- owned commit graph fingerprints;
- taint/conflict/divergence state;
- pre/post mutation evidence.

### `src/repo/recovery.ts`

- plan Git reflog-based recovery from provenance;
- detect unrelated user work;
- require HIL when recovery may replace unrelated state.

### `src/repo/command-policy.ts`

- classify Git commands used through host-mediated execution paths;
- block raw repository mutation outside typed Git service;
- reject raw model-directed Git mutation as an API-contract violation where the host can observe it before execution;
- allow read-only compatibility/forge commands;
- provide diagnostics rather than model-visible command guessing.

### `src/repo/mutation-sentinel.ts`

- snapshot Git branch/commit state around Eval execution;
- correlate repository-service mutation receipts with reflog deltas;
- detect unreceipted graph/content mutation even when Eval spawned the VCS process directly;
- taint/block publication and hand exact provenance to `recovery.ts`;
- never claim to be an OS sandbox.

### `src/workflow/workspace-ledger.ts`

- normalized repository state/diff fingerprints;
- mutation ownership windows and repository receipts;
- taint state;
- reconciliation through `RepositoryService`/`mutation-sentinel.ts`.

### `src/workflow/workspace.ts`

- delegate isolated workspace lifecycle to `RepositoryService`;
- patch capture;
- safe cleanup;
- conflict diagnostics.

### `src/context/artifact-store.ts`

- safe paths;
- hashes;
- file I/O;
- metadata.

### `src/context/broker.ts`

- ContextRef creation/resolution;
- slicing/search;
- stage materialization.

### `src/context/summarizer.ts`

- deterministic summaries where possible (line counts, file names, exit code);
- optional model summary via `completion()` only when necessary;
- summary output bounded and never authoritative for verification.

### `src/gates/engine.ts`

- gate lifecycle;
- only writer of gate resolution state;
- completion queries.

### `src/gates/review-gate.ts`

- create fresh verifier sessions;
- validate output;
- compute quorum;
- store evidence.

### `src/gates/reducer.ts`

- deterministic reducer logic around model reducer output;
- no UI.

### `src/tools/flow-*.ts`

- validate bridge request;
- call domain object;
- serialize bounded result;
- contain no business logic that belongs in engine/context/gates.

### `src/tui/controller.ts`

- open/hide/retarget overlay;
- subscribe to store;
- own pane shell.

### `src/tui/graph-view.ts`

- focus/navigation;
- graph rendering;
- no engine mutation except through injected callbacks.

### `src/tui/stage-view.ts`

- transcript display;
- steer/follow-up/resume controls;
- read-only postmortem fallback.

---

## 32. Pseudocode: root mode controller

Repository-sensitive paths call `repository.initialize()/status()` before lane execution. The controller never asks the model to determine whether the repo uses Git or Git.


```ts
class ModeController {
  async enter(selection: LaneSelection, scope: ActivationScope, source: ActivationSource) {
    if (!this.state.enabled) {
      this.state.priorActiveTools = this.pi.getActiveTools();
    }

    this.state.enabled = true;
    this.state.selection = selection;
    this.state.lane = selection === "auto" ? undefined : selection;
    this.state.phase = selection === "auto" ? "exploring" : "executing";
    this.state.scope = scope;
    this.state.activatedBy = source;
    this.state.activatedAt = Date.now();

    this.pi.setActiveTools(["eval"]);
    await this.persistState();
    this.renderStatus();
  }

  async beforeAgentStart(event: BeforeAgentStartEvent) {
    if (!this.state.enabled) return;

    this.pi.setActiveTools(["eval"]);

    return {
      systemPrompt: [
        ...event.systemPrompt,
        buildCompactModePrompt(this.state.lane, this.state.phase, await this.ledger.compactView()),
        ...(this.state.activeRunId
          ? [await this.contextBroker.buildTier0(this.state.activeRunId)]
          : []),
      ],
    };
  }

  async guardToolCall(event: ToolCallEvent) {
    if (!this.state.enabled) return;
    return this.toolFirewall.evaluate(event, this.state.lane ?? "main");
  }

  async onAgentEnd(event: AgentEndEvent) {
    if (!this.state.enabled) return;

    if (this.state.scope === "request") {
      await this.exit("request-complete");
      return;
    }

    if (this.state.scope === "run" && this.state.activeRunId) {
      const run = this.workflows.getRun(this.state.activeRunId);
      if (isTerminal(run.status)) {
        await this.exit("run-terminal");
      } else if (!isLegitimateWait(run)) {
        await this.nudgeIncompleteWorkflow(run);
      }
    }
  }
}
```

---

## 33. Pseudocode: stage creation

```ts
async function createWorkflowStage(spec: StageSpec, parent: ParentRuntime): Promise<StageHandle> {
  const toolNames = unique(["eval", ...spec.programmaticTools]);
  const settings = await createEphemeralStageSettings(parent, spec);
  const sessionManager = SessionManager.create(spec.cwd, spec.sessionDir);
  const agentRegistry = new AgentRegistry();

  const created = await createAgentSession({
    cwd: spec.cwd,
    sessionManager,
    modelRegistry: parent.modelRegistry,
    model: spec.model ?? parent.model,
    thinkingLevel: spec.thinkingLevel ?? parent.thinkingLevel,
    settings,
    agentRegistry,
    toolNames,
    restrictToolNames: true,
    disableExtensionDiscovery: true,
    extensions: [createStagePolicyExtension(spec)],
    outputSchema: spec.outputSchema,
    outputSchemaMode: spec.outputSchema ? "strict" : undefined,
    enableLsp: spec.programmaticTools.includes("lsp"),
    hasUI: parent.hasUI,
  });

  created.session.setActiveToolsByName(["eval"]);
  bindStageUi(created, parent.ui);

  const handle = registerStageHandle(spec, created.session);

  await created.session.prompt(buildStageUserMessage(spec));
  return handle;
}
```

If the SDK type does not accept one of these exact keys on the target version, locate the supported public equivalent. Do not silently omit `restrictToolNames` or ambient discovery controls.

---

## 34. Pseudocode: durable task node

```ts
async function runStageNode(request: FlowTaskRequest): Promise<NodeResult> {
  const run = store.requireRun(request.runId);
  assertRunAcceptsNewWork(run);

  const replay = replayResolver.resolve(run, request.key, request);
  if (replay.kind === "cached") return replay.result;
  if (replay.kind === "conflict") throw new ReplayIdentityConflict(...);

  const parents = request.parents ?? frontier.currentParents(run.id);
  graph.assertCanAdmit(parents, request.key);

  const node = journal.admitStage({ request, parents });
  scheduler.register(node);

  try {
    journal.startNode(node.id);
    const result = await scheduler.withPermit(() => stageRuntime.run(node, request));
    const artifacts = await artifactStore.captureStageResult(node, result);
    journal.completeNode(node.id, artifacts);
    frontier.onSettle(node.id);
    return result;
  } catch (error) {
    journal.failNode(node.id, serializeError(error));
    frontier.onFailure(node.id);
    throw error;
  } finally {
    scheduler.unregister(node.id);
  }
}
```

---

## 35. Pseudocode: review gate

```ts
async function executeReviewGate(spec: ReviewGateSpec): Promise<GateRecord> {
  const gate = gateStore.start(spec);

  const reviews = await scheduler.parallel(
    range(spec.reviewerCount).map(index => () =>
      stageRuntime.runVerifier({
        key: `${spec.key}:reviewer:${index + 1}`,
        acceptanceCriteria: spec.acceptanceCriteria,
        candidateRefs: spec.candidateRefs,
        contextRefs: spec.contextRefs,
        outputSchema: REVIEW_SCHEMA,
      })
    ),
    { concurrency: Math.min(spec.reviewerCount, config.maxConcurrentStages), failFast: false }
  );

  const parsed = reviews.map(normalizeReviewerResult);
  const infrastructureOk = parsed.length === spec.reviewerCount && parsed.every(r => r.valid);
  const quorumPassed = infrastructureOk && computeQuorum(parsed, spec.quorum);

  const evidence = await artifactStore.putJson(...parsed);

  return quorumPassed
    ? gateStore.pass(gate.id, evidence)
    : gateStore.fail(gate.id, evidence, buildReviewFailure(parsed));
}
```

---

## 36. Pseudocode: completion gate

```ts
function requestCompletion(runId: string): RunSnapshot {
  const run = store.requireRun(runId);

  const failures: string[] = [];

  if (run.activeNodeIds.length) failures.push("nodes still running");
  if (run.status === "awaiting_input") failures.push("human input unresolved");
  if (run.tainted && config.repository.strictTracking) failures.push("workspace tainted");

  const required = gateStore.requiredForRun(runId);
  for (const gate of required) {
    if (gate.status !== "passed") {
      failures.push(`gate ${gate.key} is ${gate.status}`);
    }
  }

  if (failures.length) {
    throw new WorkflowStateError(`Cannot complete run: ${failures.join("; ")}`);
  }

  return store.transitionRun(runId, "completed");
}
```

---

## 37. Default workflow patterns

Ship examples/docs, not hard-coded assumptions, for these patterns.

### 37.1 Research fan-out

```text
scout
  -> parallel specialists
  -> synthesis
  -> completeness verifier
  -> completion
```

Context rule: specialist raw outputs are artifacts; synthesis receives refs.

### 37.2 Implement + verify

```text
plan
  -> implement (isolated repository workspace)
  -> command gates
  -> parallel reviewers
  -> reducer
     -> repair if needed (bounded)
  -> diff gate
  -> completion
```

### 37.3 Adversarial verification

```text
candidate
  -> N independent verifiers
  -> host quorum
  -> reducer
  -> optional repair
  -> repeat <= maxRepairRounds
```

### 37.4 Human approval

```text
planner
  -> human gate
     -> reject => cancelled/blocked
     -> approve => implement
  -> verify
```

### 37.5 Candidate tournament

```text
parallel candidate implementations/recommendations
  -> verifier panel
  -> deterministic score/quorum reducer
  -> select winner
  -> final validation
```

No pattern should be mandatory for trivial work outside `workflowz`/the WORKFLOW lane.

---
## 38. Example model-side usage

These examples define the intended ergonomics. They are not a promise that the exact bridge return shape cannot evolve before v1.

### 38.1 `orchestrate` example

User:

```text
orchestrate inspect this auth subsystem and find security problems
```

Root model sees only Eval.

Possible JS Eval cell:

```js
phase("scout")
const files = await tool.glob({ pattern: "src/**/*auth*" })
const authFiles = files.files ?? []

const tasks = [
  "Review authentication entry points and session lifecycle",
  "Review OAuth/OIDC state, callback, and redirect validation",
  "Review authorization checks and privilege boundaries",
]

const results = await parallel(tasks.map((prompt, i) => async () => {
  return await agent(prompt, { label: `auth-review-${i + 1}`, schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      findings: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "findings"]
  }})
}))

display(results.map(r => ({ summary: r.summary, findings: r.findings })))
```

Only the displayed result needs to enter parent model context.

### 38.2 `workflowz` example

User:

```text
workflowz implement the cache fix and prove it works
```

First Eval cell:

```js
const flow = {
  run: (args) => tool.flow_run(args),
  stage: (args) => tool.flow_stage(args),
  gate: (args) => tool.flow_gate(args),
  artifact: (args) => tool.flow_artifact(args),
  host: (args) => tool.flow_tool(args),
}

const run = await flow.run({
  action: "create",
  name: "cache-fix",
  objective: "Implement the requested cache fix and verify correctness",
  acceptanceCriteria: [
    "The cache bug is fixed",
    "Relevant tests pass",
    "No blocking reviewer finding remains"
  ]
})
```

Second cell:

```js
const plan = await flow.stage({
  action: "task",
  runId: run.id,
  key: "plan",
  name: "planner",
  prompt: "Inspect the cache implementation and produce a minimal implementation plan with relevant tests.",
  programmaticTools: ["read", "grep", "glob", "lsp"],
  outputSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      files: { type: "array", items: { type: "string" } },
      tests: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "files", "tests"],
    additionalProperties: false
  }
})
```

Implementation stage:

```js
const impl = await flow.stage({
  action: "task",
  runId: run.id,
  key: "implement",
  name: "implementer",
  prompt: "Implement the approved cache fix. Keep the change minimal.",
  contextRefs: plan.contextRefs,
  programmaticTools: ["read", "grep", "glob", "edit", "write", "bash", "lsp"],
  mutatesWorkspace: true,
  workspace: "isolated"
})
```

Machine gate:

```js
const tests = await flow.gate({
  action: "command",
  runId: run.id,
  key: "tests",
  name: "targeted tests",
  command: "bun",
  args: ["test", "test/cache.test.ts"],
  required: true
})
```

Review gate:

```js
const review = await flow.gate({
  action: "review",
  runId: run.id,
  key: "review",
  name: "independent review",
  candidateRefs: impl.contextRefs,
  reviewerCount: 2,
  quorum: "all",
  required: true
})
```

Completion:

```js
const done = await flow.run({ action: "complete", runId: run.id })
display(done)
```

If tests/review failed, `complete` returns/rejects with exact unmet gates. The model cannot bypass them by printing a success message.

---

## 39. Conformance tests against OMP before feature implementation

Implement these first. If these fail on the target OMP version, stop and adapt the design before building the workflow engine.

### C-01 — Inactive registered tool remains programmatically reachable

Setup:

- register `flow_probe` with `defaultActive=false`;
- active tools = `["eval"]`;
- Eval JS calls `await tool.flow_probe({ value: 1 })`.

Expected:

- provider sees only Eval;
- Eval programmatic call succeeds;
- `flow_probe` never appears as a direct model tool.

### C-02 — `tool_call` event sees Eval-bridge tool execution

Eval calls a registered/native tool.

Expected:

- extension `tool_call` receives the inner tool call;
- returning `block:true` prevents execution;
- timeout/failure is fail-closed according to OMP extension runner behavior.

### C-03 — `restrictToolNames` is a real SDK allowlist

Create stage with:

```ts
toolNames: ["eval", "read"],
restrictToolNames: true
```

Expected:

- full stage registry has no unrelated ambient MCP/custom tools;
- `tool.bash` from Eval fails unknown/blocked;
- `tool.read` is resolvable;
- after `setActiveToolsByName(["eval"])`, direct model tools contain only Eval.

### C-04 — Inline stage policy extension loads in restricted session

Expected:

- stage extension hooks fire;
- stage prompt replacement works;
- stage firewall blocks a disallowed inner tool.

### C-05 — Multiple concurrent SDK sessions do not collide

Create two concurrent stage sessions with private `AgentRegistry` instances.

Expected:

- no `Main` identity collision;
- independent active tool sets;
- clean disposal.

### C-06 — Stage output schema strictness

Expected:

- valid output passes;
- malformed output is surfaced as a validation failure;
- malformed output can never be normalized into a passing review gate.

### C-07 — TUI custom overlay can subscribe to stage/workflow store updates

Expected:

- live rerender;
- hide/show without corrupting main editor;
- dispose removes listeners.

### C-08 — Magic activation happens before provider tool serialization

Trigger with `orchestrate` and inspect provider request/tool state.

Expected:

- triggering turn is Eval-only, not the next turn.

---

## 40. Functional acceptance test matrix

### Mode/tool isolation

- **T-001** `/programmatic on main` leaves exactly `eval` active.
- **T-002** `/programmatic off` restores the exact previously active tools that still exist.
- **T-003** dynamic MCP refresh during mode does not expose MCP tools directly.
- **T-004** disallowed `tool.<name>` from Eval is blocked.
- **T-005** allowed `tool.<name>` from Eval succeeds.
- **T-006** direct provider payload audit detects unexpected direct tool on supported provider fixtures.
- **T-007** mode remains functional when an allowed tool is missing; error names the missing capability.

### Lane routing and collaboration

- **T-008** auto mode enters bounded exploration before mutating repository files.
- **T-009** identical normalized `LaneAssessment` + policy produces the identical lane.
- **T-009a** low-risk single-track work routes to MAIN.
- **T-009b** exactly two meaningful tracks or medium-risk paired work routes to DUO.
- **T-009c** three independent tracks route to ORCHESTRATE.
- **T-009d** durability, resume, high mutation risk, required HIL, or multi-vertical-slice work routes to WORKFLOW.
- **T-009e** unknown evidence that could cross a hard lane boundary triggers bounded additional exploration or fails upward.
- **T-009f** after mutation starts, automatic route changes only escalate.
- **T-009g** DUO refuses a third foreground agent.
- **T-009h** DUO scout attempting to spawn another scout is blocked.
- **T-009i** Main ↔ Partner messages are delivered in DUO.
- **T-009j** specialist-to-specialist messages are blocked in ORCHESTRATE and WORKFLOW.
- **T-009k** worker Decision Ledger mutation is rejected; a decision proposal is accepted as data.
- **T-009l** stacked-publication intent routes to WORKFLOW independent of model preference.
- **T-009m** trunk-integration intent routes to WORKFLOW and produces a required final HIL gate.
- **T-009n** two-or-more-change stack rewrite routes to WORKFLOW.
- **T-009o** touched-stack conflict/divergence routes to WORKFLOW.
- **T-009p** simple local mutation does not force WORKFLOW solely because the backend is Git.

### Magic words

- **T-010** standalone lower-case `orchestrate` activates request scope with minimum lane `orchestrate`.
- **T-011** standalone lower-case `workflowz` activates forced `workflow` lane run scope.
- **T-012** `ORCHESTRATE` does not trigger by default.
- **T-013** inline-code/fenced-code mention does not trigger.
- **T-014** both words => forced `workflow` lane.
- **T-015** core OMP magic notice is not duplicated in model context while package owns activation.

### Context

- **T-020** 2 MB inner tool output used inside Eval does not become 2 MB root context.
- **T-021** oversized outer Eval output is persisted and replaced with bounded preview/ref.
- **T-022** stage has no parent transcript by default.
- **T-023** stage receives only declared ContextRefs.
- **T-024** downstream stage cannot see an undeclared sibling artifact through automatic injection.
- **T-025** changed artifact hash creates integrity error/new ref rather than silent reuse.
- **T-026** workflow resumes after Eval reset using journal/context refs.
- **T-027** Tier-0 run summary remains under configured budget.

### Graph

- **T-030** self edge rejected.
- **T-031** ancestor cycle rejected.
- **T-032** parallel branches share one frontier snapshot.
- **T-033** concurrency cap respected.
- **T-034** `failFast=false` preserves successful sibling results after one failure.
- **T-035** downstream required dependency becomes blocked when parent fails.

### Durability/replay

- **T-040** completed stage with same replay hash is cached, not re-run.
- **T-041** completed host side effect with same replay hash is cached, not re-run.
- **T-042** same key with changed input hash raises replay conflict.
- **T-043** failed node can be retried as a new attempt.
- **T-044** crash after node-completed journal event but before snapshot write recovers completed state from journal.
- **T-045** truncated/corrupt final JSONL line is ignored/reported without discarding prior valid events.
- **T-046** HIL pending prompt survives restart.

### Stage isolation

- **T-050** verifier stage direct tools = Eval only.
- **T-051** verifier registry lacks ambient MCP by default.
- **T-052** verifier does not inherit root project context files unless declared.
- **T-053** worker can access only configured programmatic OMP tools through bridge.
- **T-054** stage disposal removes listeners/kernels/session resources.
- **T-055** two stages with different allowlists cannot cross-use each other's tools.

### Gates

- **T-060** command gate exit 0 passes.
- **T-061** command gate nonzero fails.
- **T-062** timeout fails.
- **T-063** review parse failure fails.
- **T-064** reviewer execution error fails.
- **T-065** `quorum=all` requires all expected valid reviewers.
- **T-066** reducer `accept` cannot override failed host quorum.
- **T-067** missing required artifact fails artifact gate.
- **T-068** HIL without UI never auto-passes.
- **T-069** required gate cannot be set passed via generic workflow API.
- **T-070** workflow completion rejects while any required gate non-passing.
- **T-071** bounded repair stops at configured max rounds.

### Repository / Git

- **T-080** Git backend is selected in an existing `.git` repository.
- **T-081** trusted Git repository is detected and used directly when configured.
- **T-082** unavailable `git` chooses explicit `git`, never masquerades as Git.
- **T-083** raw host-mediated mutating Git is blocked while Git backend is active.
- **T-084** repository ledger stores reflog entry + working commit ID and detects untracked graph/content mutation taint.
- **T-085** parallel mutating stages use separate `git worktree` workspaces and return distinct owned branch/commit refs.
- **T-086** rewrite refreshes commit ID while preserving durable change-ID identity.
- **T-087** a successful `git rebase` that creates conflicts fails the integration conflict gate.
- **T-088** divergent owned commits block publication.
- **T-089** single-PR normalization creates one publication branch at the explicit review tip.
- **T-090** stacked-PR normalization creates ordered branch-per-review-unit mappings and explicit PR bases.
- **T-091** rewriting a lower stack change refreshes descendants/branch mappings before push.
- **T-092** rejected unpublished change can be abandoned and descendants remain represented correctly.
- **T-093** repository recovery chooses a provenance-backed Git recovery action and refuses to replace unrelated user state without HIL.
- **T-094** non-colocated forge execution derives Git dir from `git root`.
- **T-095** repository diff hygiene gate works from Git-produced diff and does not require raw Git mutation.
- **T-096** task scope that requires a Git submodule path chooses `git` or blocks before mutation when fallback is disabled.
- **T-097** task scope that requires a Git-LFS-managed path chooses `git` or blocks before mutation when fallback is disabled.
- **T-098** configured Git-hook-equivalent checks are explicit host gates; successful Git mutation never implies Git hooks ran.
- **T-099** repository backend cannot switch after the first owned mutation without an explicit recovery/new-run transition.
- **T-100** `interdiff` compares an explicit prior-published review revision with its current local review revision and returns a bounded artifact without mutating repository state.
- **T-101** `evolution` follows a logical change by commit ID across rewrites and does not depend on a stale commit ID.
- **T-102** direct raw `git` mutation spawned from Eval without a matching repository-service receipt is detected by pre/post branch/commit reconciliation, taints the run, and blocks publication/integration.

### TUI

- **T-110** graph opens and renders active run.
- **T-111** focus survives graph -> stage -> graph transition.
- **T-112** live stage transcript updates during streaming.
- **T-113** Enter steers live stage; Ctrl+F queues follow-up.
- **T-114** HIL prompt resolves from graph/stage UI and updates journal.
- **T-115** completed stage opens read-only postmortem view.
- **T-116** hiding overlay does not stop workflow.
- **T-117** disposing overlay unsubscribes render listeners/timers.

### Contract enforcement

- **T-120** workflowz + no run + terminal answer triggers one corrective continuation.
- **T-121** second identical violation stops auto-loop and notifies user.
- **T-122** active nonterminal run cannot be reported as host-completed.
- **T-123** legitimate awaiting-input run does not trigger auto-continuation.
- **T-124** explicit user abort terminates run and allows mode exit.

---

## 41. Failure-injection tests

These are mandatory for durability claims.

### F-01 Crash points

Inject process errors at each boundary:

```text
before node admission journal write
after admission / before start
after stage side effect / before node complete
after node complete / before snapshot
while writing artifact
while resolving gate
while resolving HIL answer
```

Verify recovery behavior is deterministic and documented.

### F-02 Slow/ignoring cancellation

Use a fake stage/tool that ignores `AbortSignal`.

Expected:

- workflow UI reports cancelling;
- host does not mark cancelled until bounded cleanup policy completes/expires;
- no completed state is written on top of a still-running mutation.

### F-03 Corrupt artifact

Modify artifact after hash registration.

Expected:

- integrity error;
- no reviewer gets silently changed content under old ContextRef.

### F-04 Reviewer hallucinated pass

Return:

```json
{"verdict":"pass","blockingFindings":[{"title":"critical bug",...}]}
```

Expected:

- normalization/host policy fails the gate.

### F-05 Reducer hallucinated accept

Verifier quorum failed; reducer says accept.

Expected: host rejects/repairs.

### F-06 Unexpected ambient tool

Simulate another extension registering a tool mid-run.

Expected:

- stage restricted sessions do not inherit it;
- root active list remains Eval-only;
- firewall blocks programmatic use unless config explicitly allows it.

---

## 42. Performance tests

### P-01 Context amplification

Compare a representative 20-step repository audit in:

1. normal direct-tool mode;
2. programmatic mode.

Measure:

- provider input tokens;
- tool-result text entering parent transcript;
- number of model turns;
- wall clock;
- final correctness gate.

The target is not a guaranteed percentage. The test exists to ensure the architecture actually reduces intermediate context rather than merely relocating it.

### P-02 Parallel saturation

Run 20 no-op/fake stage nodes with concurrency 4.

Verify max live stages never exceeds 4.

### P-03 Large graph TUI

Render 64 nodes and nested evidence cards.

Target:

- no quadratic repaint path noticeable in terminal;
- bounded transcript projections;
- no unbounded timer/listener growth.

### P-04 Journal recovery

Replay a 10k-event synthetic journal.

Target reasonable startup latency; if needed, checkpoint snapshots every N events while preserving journal authority.

---

## 43. Implementation plan

### Phase 0 — OMP conformance harness

Implement only tests C-01 through C-08.

Deliverable:

```text
No workflow engine yet.
A test proves the host assumptions are true on the target OMP commit/version.
```

Do not proceed if inactive bridge tools or restricted sessions behave differently than assumed.

### Phase 1 — Eval-only mode

Implement:

- config loader;
- `/programmatic on/off/status/doctor`;
- activation state;
- active-tool capture/restore;
- Eval-only reassertion;
- programmatic `tool_call` allowlist;
- compact mode prompt;
- Eval oversized-result externalization;
- magic `orchestrate` request scope.

Exit criteria:

- T-001..T-007;
- T-010 `orchestrate` path;
- T-020/T-021.

### Phase 2 — Exploration, LaneRouter, Decision Ledger, and DUO

Implement:

- bounded exploration lifecycle;
- `lane_assess`/`lane_status`;
- deterministic minimum-sufficient router;
- lane floors and monotonic escalation;
- durable Decision Ledger;
- DUO Main + Partner foreground runtime;
- package mailbox on OMP messaging primitives;
- depth-1 scout policy and spawn firewall;
- ORCHESTRATE star-topology communication firewall.

Exit criteria:

- deterministic router tests for all boundary cases;
- DUO exactly-two-foreground test;
- scout depth rejection test;
- peer-to-peer message rejection in ORCHESTRATE;
- Decision Ledger mutation-authority and compaction tests.

### Phase 3 — Git repository control plane

Implement:

- `RepositoryManager` backend detection/bootstrap;
- trusted Git -> colocated Git initialization;
- typed `repo` bridge + `ctx.repo`;
- Git state/change/op parsing;
- strict command policy;
- commit-OID and branch repository ledger;
- Git worktree lifecycle;
- stack manager and publication mapping;
- conflict/divergence checks;
- reflog recovery planner;
- coordinator-only Git integration and push.

Exit criteria:

- T-080..T-102.

### Phase 4 — Durable run/store/graph core

Implement:

- run model;
- node model;
- JSONL journal;
- snapshots;
- replay identities;
- DAG/frontier;
- scheduler;
- cancellation;
- `flow_run` and store queries.

Use fake stage executors initially.

Exit criteria:

- T-030..T-046.

### Phase 5 — OMP SDK stage runtime

Implement:

- ephemeral settings;
- restricted `createAgentSession` stage;
- stage policy inline extension;
- stage event subscription;
- output schema capture;
- live handles;
- `flow_stage`;
- basic stage artifacts.

Exit criteria:

- T-050..T-055.

### Phase 6 — Context broker/artifacts

Implement:

- ContextRef;
- hashes;
- artifact store;
- slicing/search;
- Tier-0 run summary;
- explicit stage materialization;
- oversized Eval output artifact integration.

Exit criteria:

- T-020..T-027.

### Phase 7 — Gate engine

Implement:

- command/schema/artifact/diff gates;
- review verifier sessions;
- quorum/reducer;
- HIL gate;
- bounded repair;
- completion reducer.

Exit criteria:

- T-060..T-071;
- failure injection F-04/F-05.

### Phase 8 — WORKFLOW lane + magic `workflowz`

Implement:

- `flow_*` bridge API complete;
- WORKFLOW-lane prompt/contract;
- run-scoped mode activation;
- agent-end incomplete-run correction;
- core magic-notice dedupe;
- workspace taint detection;
- isolated Git worktree mutation path;
- StackPlan-aware single/stacked publication preparation;
- typed Atomic-style `workflow({...})` definition API;
- project/global/builtin registry and safe reload;
- pi-extensible-style `agent/parallel/pipeline/checkpoint/phase/withWorkspace` workflow primitives, with `withWorktree` retained only as a source-compatibility alias;
- workflow creation/promotion commands.

Exit criteria:

- T-011..T-015;
- workflow/repository integration coverage built on T-080..T-102;
- T-120..T-124.

### Phase 9 — TUI

Implement:

- graph overlay shell;
- graph renderer/navigation;
- stage view/transcript;
- artifacts/evidence panes;
- HIL prompts;
- lifecycle notifications;
- postmortem stage view.

Exit criteria:

- T-110..T-117.

### Phase 10 — Hardening

Implement:

- failure injection suite;
- performance suite;
- provider payload audit fixtures;
- `/programmatic doctor` detailed diagnostics;
- API docs/skill;
- migration/version checks;
- cleanup of repository workspaces/orphan locks;
- documentation of trust model.

---
## 44. Runtime dependency policy

### 44.1 Allowed runtime dependencies

Prefer only:

- Bun/Node standard APIs;
- public exports from `@oh-my-pi/pi-coding-agent`;
- OMP-owned schema/types packages already required for extension tool definitions, if necessary.

If a tiny data structure is needed (semaphore, DAG traversal, JSONL store, hashing, retry), implement it locally.

### 44.2 Disallowed default dependencies

Do not add these as runtime requirements:

```text
Atomic
Prime Agent
DBOS
Temporal
LangGraph
MCP code-execution server
agent0ai/code-execution-mcp
just-bash
pi-extensible-workflows
Docker SDK
Redis/Postgres
```

### 44.3 Repository executables

`git` is the preferred environmental executable and canonical mutation backend. The package feature-detects its version/capabilities at runtime rather than depending on a Git JS library.

Git may still be present because Git commonly uses the Git backend and forge/build tooling expects Git metadata. Raw Git mutation is not the default package implementation. The Git CLI is required only for explicit `git` behavior or external tools that independently require it.

Read-only/programmatic MAIN mode must still work in a non-repository directory; repository-mutating workflow paths require a valid normalized repository backend.

### 44.4 Optional future adapters

A future adapter interface may support external sandbox/durable backends, but core engine interfaces must not depend on them.

---

## 45. Version compatibility and feature detection

OMP is evolving quickly. Do not assume a method exists merely because it did on the baseline commit.

At extension load, feature-detect:

```text
pi.getActiveTools
pi.getAllTools
pi.setActiveTools
ctx.ui.custom
createAgentSession
AgentSession.setActiveToolsByName
Settings isolated/non-persisting constructor/factory
AgentRegistry
SessionManager
```

For a missing **required** safety/invariant feature, fail package initialization with a clear compatibility error instead of degrading silently.

Example:

```text
Programmatic mode requires OMP SDK restricted sessions (`restrictToolNames`).
This OMP build does not expose the required SDK behavior. Package disabled.
```

Do not silently fall back to a prompt-only workflow mode.

### 45.1 Git capability detection

At repository initialization, detect at least:

```text
git version
git rev-parse --show-toplevel
git status --short --branch
git worktree add/list/remove
git branch --list
git merge/rebase
git fetch/push
git reflog
git diff
git range-diff (optional review evidence)
```

Do not rely only on a minimum version string if command/flag probing can be more precise. If an advanced operation is unavailable, the repository service either chooses a documented safe alternative or reports that capability unavailable; the model does not invent syntax.

Also detect task-relevant Git compatibility constraints before selecting/finalizing the backend: `.gitmodules`/submodule scope, LFS-managed paths, in-progress Git operations, and project verification that currently exists only as Git hooks. Git remains preferred; “preferred” never means pretending an unsupported feature exists.

### 45.2 Compatibility matrix file

Ship/update:

```text
docs/compatibility.md
```

with tested OMP versions/commits and conformance status.

---

## 46. Migration/versioning of persisted runs

Every persisted structure has a schema version.

```ts
const RUN_SCHEMA_VERSION = 1;
const JOURNAL_SCHEMA_VERSION = 1;
const ARTIFACT_SCHEMA_VERSION = 1;
```

On load:

- newer unknown version => read-only/error, never mutate destructively;
- known older version => explicit migration;
- migration writes backup first;
- journal event IDs/sequence remain stable.

Do not make old runs silently unreadable on minor package upgrades.

---

## 47. Cleanup and orphan handling

### 47.1 Normal shutdown

On `session_shutdown`:

- stop admitting new work;
- flush journal/snapshots;
- abort or detach stage sessions according to run policy;
- dispose in-memory stage handles;
- close overlay timers/listeners;
- leave resumable run artifacts intact.

### 47.2 Orphaned repository workspaces

Track package-created repository workspaces in `workspaces.json`, including backend, Git worktree name, path, owning run/node, owned commit IDs, creation reflog entry, and cleanup state.

`/programmatic doctor` reports orphaned repository workspaces and offers cleanup through an explicit command/action.

Do not forget/delete a Git worktree whose owned commits are unpublished/unintegrated until the owned commit graph has been safely retained elsewhere; if cleanup could abandon or lose user-visible work, require explicit user approval. Git worktrees follow the same rule in Git.

### 47.3 Orphaned locks

Locks include PID + timestamp. On startup, stale locks from nonexistent PIDs may be recovered after validating journal state.

Do not rely only on wall-clock age.

---

## 48. Documentation deliverables

Ship at least:

### `README.md`

- install/link package;
- `/programmatic` commands;
- magic word behavior;
- Eval-only mental model;
- trust model warning.

### `docs/api.md`

- exact `flow_*` request/response schemas;
- examples;
- replay rules;
- error codes.

### `docs/workflow-authoring.md`

- stage/context/gate patterns;
- parallelism;
- repair loops;
- artifacts;
- HIL;
- `ctx.repo` and `withWorkspace` patterns.

### `docs/vcs-git.md`

- Native Git repository model;
- commit IDs vs commit IDs;
- branches as publication boundaries;
- Git worktrees;
- stack normalization, split/squash/absorb/rebase;
- conflicts/divergence;
- reflog recovery;
- single vs stacked PR publication;
- `interdiff` for review deltas and `evolog` for change evolution across rewrites;
- typed-repository-only model contract and unreceipted Eval mutation detection;
- Git policy.

### `docs/threat-model.md`

- direct tool isolation vs OS sandboxing;
- Eval trust model;
- workspace taint;
- external sandbox recommendations.

### `skills/programmatic-orchestration/SKILL.md`

Keep model-invocation metadata minimal and preferably disable automatic model invocation outside the mode. The mode prompt/API docs are the canonical runtime guidance.

---

## 49. Definition of done

Version `0.1.0` is done only when all of the following are true:

1. The triggering `orchestrate`/`workflowz` turn exposes only Eval directly.
2. Auto mode performs bounded exploration and the host LaneRouter deterministically selects MAIN/DUO/ORCHESTRATE/WORKFLOW from a structured assessment.
3. Equivalent assessments always produce the same lane under the same policy, and ambiguous unknowns fail upward rather than silently choosing a cheaper lane.
4. Lane escalation is monotonic once mutation/peer work begins.
5. DUO enforces exactly two foreground agents and scout depth <= 1.
6. ORCHESTRATE and WORKFLOW block peer-to-peer worker messaging; workers may message Main only.
7. Decision Ledger accepted entries can be mutated only by Main/user and survive compaction/resume.
8. `/programmatic on/off` reliably captures/restores active tools.
9. A disallowed Eval bridge tool is blocked by host policy.
10. A workflow stage is demonstrably created with `restrictToolNames: true` and no ambient capabilities.
11. A stage's direct model-visible tool list is Eval-only.
12. Parent transcript is absent from a fresh stage unless explicitly passed.
13. Large intermediate data can remain outside parent context and be retrieved by handle/slice.
14. A dynamic parallel DAG executes with bounded concurrency.
15. A completed replayable node is not rerun after restart.
16. An invalid verifier output fails closed.
17. A reducer cannot override failed host quorum.
18. A required command/review gate blocks completion when failing.
19. A HIL gate survives pause/restart and never auto-approves.
20. User prompts occur only at material exploration ambiguity, configured key vertical-slice checkpoints, final review, or integration action gates.
21. Final integration gate distinguishes keep-local, single PR, stacked PRs, local integration, publication-branch push, and trunk integration; high-impact actions require explicit selection.
22. Graph modal renders live state and can attach to a stage view.
23. Git is the canonical backend; strict repository tracking detects untracked mutation taint and blocks strict completion.
24. Project/global workflow discovery works with `Project > Global > Builtin` precedence and same-scope duplicates fail.
25. A typed `workflow({ name, description, inputs, outputs, run })` definition can execute using task/agent/parallel/pipeline/tool/checkpoint/repository-workspace/repo/UI primitives.
26. `/programmatic workflow save <run-id> --project|--global` produces a reviewable reusable workflow source file.
27. Workflow reload keeps the prior registry on fatal refresh failure and does not mutate in-flight definitions.
28. `/programmatic doctor` explains OS-sandbox limitations.
29. No runtime dependency on Atomic, Prime Agent, DBOS, MCP code-execution servers, or just-bash exists.
30. Failure-injection tests cover journal/snapshot crash boundaries.
31. Owned work is durably identified by Git commit OIDs plus task branches.
32. Parallel mutating stages use one `git worktree` per task branch; repository mutation outside typed Git service is blocked.
33. StackManager can normalize a local stack with rebase/split/squash/absorb policies and refresh identities after rewrite.
34. Successful Git commands with resulting conflicts cannot pass integration/completion gates.
35. Single-PR and stacked-PR publication create explicit branch mappings from the validated `StackPlan`.
36. Reflog recovery is provenance-aware and does not overwrite unrelated user work without approval.
37. Repository capability preflight blocks unsupported submodule/LFS or hook states before mutation; required checks are explicit host gates.
38. Stack verification runs in isolated worktrees without rewriting task branches.
39. Final review shows bounded commit-range evidence for changes since last publication.
40. An unreceipted raw repository mutation performed from Eval is detected, taints the run, and cannot be published or integrated as if it were repository-service-owned work.
41. Docs explain lane routing, Git repository semantics, worktrees, task branches, and both `orchestrate` and `workflowz` integration.
42. The package works without modifying OMP source on the tested baseline.

---

## 50. Known package-only limitations that must remain visible

### 50.1 Eval is more powerful than the OMP tool registry

Even with every normal OMP tool hidden/blocked, arbitrary Eval code can use native runtime APIs. This mode is a control/interface architecture, not a malicious-code sandbox.

### 50.2 Lightweight `agent()` is not a durable workflow node

Native Eval `agent()` is useful and should remain available in `orchestrate` when spawn policy allows it. In `workflow`, direct raw `agent()` is contractually disallowed because it bypasses the durable graph.

The plugin can detect/block obvious direct call syntax and can refuse workflow completion without tracked nodes/gates, but a determined arbitrary program can use reflection to evade a syntax rule. Again: this is not a hostile-code sandbox.

### 50.3 Arbitrary external side effects cannot be exactly-once without cooperation

A retry-safe journal cannot make a third-party API idempotent. `flow_tool` operations that call external systems should support/request idempotency keys where possible.

### 50.4 Post-restart live stage chat may degrade to postmortem

If OMP cannot restore the exact live in-memory `AgentSession` from a stage session file through public APIs, completed/failed stages are still inspectable but not steerable. Resume should create a continuation stage/node rather than pretending the old process is live.

### 50.5 Core OMP magic keyword implementation may change

The package should own its activation semantics and test them. It should not parse or depend on internal OMP notice text.

---

## 51. Future extensions (not v1)

### 51.1 Continual harness

Prime-style evidence-backed refinement of:

- prompt notes;
- workflow templates;
- memories;
- stage role presets.

Any auto-refinement must be reviewable/versioned and must not rewrite immutable base policy.

### 51.2 Workflow packages / shared registries

Project and global workflow definition files are already v1. A future version may add signed/shared workflow packages, remote registries, and organization policy bundles while preserving project > global > builtin precedence.

### 51.3 Nested workflows

Add explicit child-run boundaries with max depth and parent graph nodes.

### 51.4 Strong external sandbox adapter

A pluggable execution backend that can run Eval-like code in an actual container/VM/capability sandbox.

### 51.5 Content-addressed cross-run cache

Allow safe reuse of pure analysis nodes across runs when repository/input/model/policy hashes match. Keep disabled by default until cache invalidation is proven.

### 51.6 Provider-aware prompt-cache diagnostics

Measure how mode notices/tool changes affect cache prefixes and optimize injection placement.

---

## 52. Research/source index

This spec was derived code-first. These are the primary files/pages a maintainer should re-check when upgrading.

### 52.1 OMP

Repository baseline:

- https://github.com/can1357/oh-my-pi/tree/45e12e5bb758198a920c6070e7e64cb33b21beac

Core customization/runtime surfaces:

- `packages/coding-agent/src/extensibility/extensions/types.ts`
- `packages/coding-agent/src/extensibility/extensions/runner.ts`
- `packages/coding-agent/src/extensibility/extensions/wrapper.ts`
- `packages/coding-agent/src/session/session-tools.ts`
- `packages/coding-agent/src/sdk.ts`
- `docs/sdk.md`

Eval:

- `packages/coding-agent/src/tools/eval.ts`
- `packages/coding-agent/src/prompts/tools/eval.md`
- `packages/coding-agent/src/eval/js/tool-bridge.ts`
- `packages/coding-agent/src/eval/py/tool-bridge.ts`
- `packages/coding-agent/src/eval/agent-bridge.ts`
- `packages/coding-agent/src/task/structured-subagent.ts`

Magic words:

- `packages/coding-agent/src/modes/magic-keywords.ts`
- `packages/coding-agent/src/modes/orchestrate.ts`
- `packages/coding-agent/src/modes/workflow.ts`
- `packages/coding-agent/src/prompts/system/orchestrate-notice.md`
- `packages/coding-agent/src/prompts/system/workflow-notice.md`
- `packages/coding-agent/test/agent-session-magic-keywords.test.ts`

### 52.2 Prime Agent

Repository:

- https://github.com/PrimeIntellect-ai/prime-agent

Primary files:

- `README.md`
- `packages/coding-agent/docs/rlm.md`
- `packages/coding-agent/docs/rlm-runtime.md`
- `packages/coding-agent/src/core/prompts/rlm.ts`
- `packages/coding-agent/src/core/rlm-runtime.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/refinement/refinement.ts`

Concepts taken:

- single programmatic control plane;
- one host-owned Native Git repository control plane—agents never invent VCS strategy;
- persistent code state;
- prompt/context as variables/handles;
- metadata-first/on-demand context;
- focused child contexts;
- host bridge for authoritative state;
- durable supplemental state as compact context.

### 52.3 Atomic

Repository:

- https://github.com/bastani-inc/atomic

Primary files:

- `packages/workflows/README.md`
- `packages/workflows/src/authoring.ts`
- `packages/workflows/src/shared/authoring-contract-stage.ts`
- `packages/workflows/src/shared/authoring-contract-ui.ts`
- `packages/workflows/src/extension/wiring.ts`
- `packages/workflows/src/runs/foreground/executor-task-prompts.ts`
- `packages/workflows/src/tui/graph-view.ts`
- `packages/workflows/src/tui/graph-view-types.ts`
- `packages/workflows/src/tui/workflow-attach-pane.ts`
- `packages/workflows/src/tui/stage-chat-view.ts`
- `packages/workflows/builtin/ralph-review-gate.ts`
- `packages/workflows/builtin/adversarial-verification-runner.ts`
- `packages/workflows/builtin/goal.ts`

Concepts taken:

- runtime DAG;
- explicit stage policy;
- restricted stage sessions;
- durable node/checkpoint semantics;
- explicit artifact reads/context transfer;
- HIL wait states;
- graph -> stage attach TUI;
- independent verifier fan-out;
- deterministic host gate around model reducer;
- bounded repair loops.

### 52.4 pi-extensible-workflows

Repository:

- https://github.com/vekexasia/pi-extensible-workflows

Primary files:

- `README.md`
- `packages/core/skills/pi-extensible-workflows/SKILL.md`
- `packages/core/src/types.ts`
- `docs/llm.md`
- `docs/developers.html`

Concepts taken:

- main agent generates named inline workflow programs for genuinely multi-agent work;
- explicit `parallel()` fan-out and `pipeline()` repeated-stage semantics;
- stable structural identity for replay;
- explicit result passing instead of hidden transcript sharing;
- checkpoints, phases, aggregate budgets, worktrees, retry/resume;
- registered typed host functions with replay semantics;
- workflow status as compact authoritative recovery state;
- workflow code accesses host capabilities through a narrow orchestration API.

### 52.5 Git

Primary documentation: `https://git-scm.com/docs`. The package must feature-detect Git CLI behavior rather than rely on agent memory. Git commands, repository state, worktree ownership, reflog recovery, conflict checks, and remote push safety are encoded as host policy rather than left to the model.

### 52.6 External references

Code-mode/programmatic invocation:

- https://blog.cloudflare.com/code-mode/
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner
- https://platform.claude.com/docs/en/build-with-claude/mid-conversation-effort-example
- https://ai.google.dev/gemini-api/docs/code-execution

Additional inspiration considered, not dependencies:

- https://github.com/agent0ai/code-execution-mcp
- https://github.com/vercel-labs/just-bash
- https://bottlecapai.com/post/thinkingcap-qwen3-6-27b/

---

## 53. Final implementation guidance to the developer

If you remember only twelve things while implementing this package, remember these:

1. **Do not build a prompt-only mode.** The tool partition is runtime state.
2. **Do not let the model choose its lane by prose.** Exploration produces evidence; the host LaneRouter selects the minimum sufficient lane.
3. **Main owns the Decision Ledger.** Workers propose; Main/user decide.
4. **Enforce communication topology.** DUO is bidirectional Main ↔ Partner; ORCHESTRATE/WORKFLOW workers report to Main only.
5. **Eval-only direct tools is not enough.** Eval can reach the full tool registry; keep the programmatic firewall.
6. **Do not call a normal discovered OMP session a restricted stage.** Use `restrictToolNames: true` at construction.
7. **Do not copy the parent transcript into stages.** Pass explicit context refs/artifacts/ledger entries.
8. **Do not put raw intermediate programmatic results into chat unless needed.** Variables/artifacts are the point.
9. **Workflow authoring is a first-class v1 API.** Use Atomic-style typed definitions plus pi-extensible-style deterministic orchestration primitives.
10. **Do not trust a reviewer/reducer boolean by itself or let `complete` be model-owned.** Host predicates and completion state are authoritative.
11. **Do not make replay/sandbox claims you cannot enforce.** Track side effects; taint escapes; Eval itself is not an OS sandbox.
12. **Do the phase-0 OMP conformance tests first.** Preserve invariants when APIs move.

The target product is not “OMP with a workflow prompt.” It is an **OMP-hosted adaptive agent runtime**: Main explores and retains decisions, a deterministic router chooses the correct collaboration lane, code is the model's control surface, context is explicitly materialized, workflows are user-authorable durable programs, and verification/integration are host-owned state transitions.
