# workflowz v2 — Importing Atomic + pi-extensible-workflows into @ezxomp/extensible-workflows

Status: Proposed (2026-08-20)
Owner: @ezxomp/extensible-workflows
Type: Design / specification
**Contents (frozen decisions):** [§7B OMP-core capability-gap matrix (TASK-15.6)](docs/plugin_proposal/workflowz-v2.md#7b-omp-core-capability-gap-matrix--extension-mitigation-vs-core-parity-task-156-freeze-2026-08-22) · [§7C profiles+Just chains (TASK-15.7)](#7c-workflow-scoped-agent-profiles-and-just-backed-code-only-chains-task-157-freeze-2026-08-22) · [§7D orchestrator+Hook/Hub (TASK-15.8)](#7d-orchestrator-skill-and-hookhub-watchdog-control-plane-task-158-freeze-2026-08-22)


## 1. Context

`@ezxomp/extensible-workflows` (5.1.0-ezxomp.1) is a fork of `vekexasia/pi-extensible-workflows` re-scoped to a **persistence/authoring layer** for OMP's native Workflowz. It stores `WorkflowFileV1` JSON recipes, validates them, and renders self-contained JavaScript that runs on OMP's native `eval` kernel (`agent`, `parallel`, `phase`, `budget`). It does not execute workflows.

Two external systems were analyzed as import sources:

- **Atomic `@bastani/workflows`** — imperative TypeScript `workflow({...})` definitions with TypeBox-typed inputs/outputs, nested child workflows, durable `ctx.tool` side effects, HIL gates (`ctx.ui.confirm/input/select/editor/custom`), model fallback chains, worktrees, builtin workflow library (`fanOutAndSynthesize`, `adversarialVerification`, `tournament`, `generateAndFilter`, `classifyAndAct`, `loopUntilDone`, `goal`, `ralph`, `review-and-merge`, `research-and-verify`), DBOS/Postgres durability with checkpoint replay and resume, and a graph TUI with stage chat.
- **pi-extensible-workflows (upstream)** — sandboxed JS scripts with 8 primitives (`agent`, `shell`, `prompt`, `parallel`, `pipeline`, `phase`, `log`, `checkpoint`, `withWorktree`), journaled operations with cold-recovery replay, run states incl. `budget_exhausted`, `workflow_resume`/`workflow_retry` with budget patches, role files with frontmatter policy, settings selectors, extension registry (functions, modelAliases, agentSetupHooks, agentAttemptActions), 5 standalone subagent tools, Herdr handoff, `piewf` CLI.

**Design principle: stay a recipe layer.** Execution stays in OMP's native eval kernel. The new channel is the eval kernel's `tool.*` bridge — rendered JS calls registered extension tools for gates, checkpoints, telemetry, and worktrees. No new engine, no shadowing of built-ins, no override of OMP's built-in Workflowz. Enhance every surface OMP's Extension API offers.
Existing repository gate patterns are part of the foundation: `plugins/pix-skills/src/gate.ts` classifies commands by severity (`critical`, `dangerous`, `risky`) with configurable extra rules and explicit auto-approval; `plugins/pstack-suite/src/commands/verify.ts` executes `tsc --noEmit` with `execFile` and reports a bounded result; `plugins/pstack-suite/src/commands/ship.ts` aborts before merge when verification fails. Workflowz must reuse these safety and fail-closed patterns rather than introduce unchecked raw shell execution.


## 2. What OMP already provides (no import needed)

| pi-extensible-workflows feature | OMP native equivalent |
|---|---|
| 5 subagent tools (`subagents_run/inspect/steer/stop/retry`) | `task` tool + Agent Hub (`Alt+A`, steer/revive/kill) + `hub`/`history://`/`agent://`; eval `agent(..., {handle: true})` gives background runs with durable IDs |
| `parallel`/`pipeline`/`phase`/`log` | already the eval kernel primitives |
| `outputSchema` structured output | eval `agent(..., {schema})` — same as Atomic's `structured_output` |
| `prompt(template, values)` | eval `render`/template interpolation (fork already emits it) |
| roles as policy files | OMP agent registry (`agent=` names) — document, don't reimplement |

## 3. Imports and OMP-native mechanisms

| Import (source) | OMP-native mechanism |
|---|---|
| `checkpoint()` (pi) / `ctx.ui.confirm` (Atomic) | new **`omp_workflow_checkpoint`** tool — `ctx.ui.confirm` inside, `hasUI` guard, `auto: true` escape for headless |
| `shell()` gates (pi) / `ctx.tool` checks (Atomic) | `tool.bash({command})` in rendered JS + bounded repair loop |
| `withWorktree` (pi) / `gitWorktreeDir` (Atomic) | new **`omp_workflow_worktree`** tool — named worktrees: create/reuse/cleanup via git, validated paths |
| journal replay (pi) / DBOS (Atomic) | **stage-granular run journal** — `<cwd>/.omp/workflows/runs/<run-id>/journal.jsonl` (0700); resume re-renders skipping completed stages, seeding `{{result.*}}` from the journal. Honest downgrade: no operation-level replay without an engine |
| `workflow_status/respond/stop/retry/resume` (pi) | `omp_workflow_status` / `omp_workflow_checkpoint` / `omp_workflow_stop` (cooperative) / `omp_workflow_retry` / `omp_workflow_resume` |
| `reviewLoop` starter (pi) | builtin `review-loop` recipe template |
| Atomic builtins | ~10 builtin recipe templates, shipped read-only, scaffoldable |
| `ctx.workflow` nested children (Atomic) | **render-time inlining** — `task.workflow` resolves the child recipe's stages+gates into the parent's JS, namespaced ids, cycle detection at render |
| typed `outputs` (Atomic) | recipe `outputs` + final validation in `omp_workflow_report` (host-side JSON-schema check, not model judgment) |
| `ctx.exit` statuses (Atomic) | rendered JS returns `{status, reason, outputs}`; report tool records it |
| lifecycle notices (Atomic) | custom message cards (`sendMessage` + `registerMessageRenderer`) |
| graph TUI (Atomic) / run navigator (pi) | new `WorkflowRunOverlay` (journal-driven) |
| background widget (pi) | `setWidget` belowEditor + `setStatus` footer line |
| `agentSetupHooks` (pi) | `task.setup` **embedded in the prompt** — subagent sessions don't load extensions, so `before_agent_start` label-matching can't reach them |
| `modelAliases`/`fallbackModels` (pi/Atomic) | **not expressible** — eval `agent()` takes no model/tools/skills options; document as limitation |
| `concurrency`/`failFast` (Atomic) | eval `parallel` is all-at-once; document |



## 3A. User entrypoint, routing, and chaining

The primary user surface is the slash command **`/workflows`**:

- `/workflows <request>` — ask in natural language; an OMP agent selects the best predefined recipe or an ordered chain of recipes.
- `/workflows run <name>` — run a known recipe directly, collecting its declared inputs.
- `/workflows chain <name> -> <name> ...` — explicitly concatenate predefined recipes into a validated chain.
- `/workflows list [recipes|templates|gates|runs]` — browse one catalog surface, with the whole command prefix preserved while completing.
- `/workflows status|resume|retry|stop <run-id>` — inspect or control a known run.
- `/workflow-library` — remain as the direct catalog overlay/compatibility command.

`/workflows <request>` does not execute arbitrary model-written orchestration immediately. It first produces a strict, host-validated route plan:

```json
{
  "request": "Implement the feature and prove it is safe",
  "mode": "chain",
  "steps": [
    { "workflow": "plan", "inputs": { "task": "..." } },
    { "workflow": "implement", "inputs": { "plan": "{{result.plan}}" } },
    { "workflow": "verify", "inputs": { "scope": "{{result.implement}}" } }
  ],
  "gates": ["fallow-health", "language-verify", "workflow-output"],
  "approval": "required"
}
```

The router must validate recipe IDs, input schemas, result references, chain depth, cycles, and gate availability before rendering. A chain is a composition of existing recipes, not a second execution engine: each child recipe renders into the native eval primitives and reports namespaced results. File-mutating chains require a checkpoint before execution; read-only chains may be auto-approved when policy permits. Every chain step and its gates remain visible in the run journal and TUI.

Predefined recipes are read-only and versioned. Initial templates include `plan`, `implement`, `review-loop`, `research-and-verify`, `fan-out-synthesize`, `adversarial-verify`, `lint-and-fix`, `language-verify`, `frontmatter-check`, `lsp-diagnostics`, and `fallow-health`. The agent may compose them, but cannot silently invent an unregistered recipe during a run.

All subcommands are registered on one OMP extension command with `getArgumentCompletions(argumentPrefix)`. Completion values concatenate the existing prefix and a trailing space (for example `chain plan `, then `chain plan -> `, then a recipe ID), matching OMP's `AutocompleteItem` contract (`value`, `label`, `description`, `hint`). Nested completions cover subcommands, recipe/template/gate/run IDs, and `key=value` inputs; the handler uses the same quote-aware tokenizer as completion. A completion must never discard already-entered subcommands. The explicit `->` chain operator is the textual form of composition; a bare `/workflows <request>` remains agent-routed natural language.




## 3B. Gate contract to reuse

The referenced [Super Simple Software Factory](https://github.com/disler/super-simple-software-factory) supplies the right gate semantics for this plugin:

- deterministic code owns sequencing, retries, and acceptance; agents remain bounded nodes inside the graph;
- an agent proposes claims in a typed envelope, while code verifies those claims;
- each gate returns one evidence-bearing check per item (`item`, `ok`, `note`), not only a boolean;
- failed gates send a correction naming the exact violations to the **same agent session**; they do not cold-restart the agent;
- deterministic code phases remain visible separately from agent phases, so the trace identifies whether an agent or a verifier failed.

Adapt this contract to OMP without importing a second engine. `GateReport` is the host-side normalized result stored in the workflow journal:

```json
{
  "gate": "language-verify",
  "passed": false,
  "checks": [
    { "item": "src/app.ts", "ok": false, "note": "type error TS2322", "tool": "tsc", "durationMs": 842 }
  ],
  "violations": ["src/app.ts: TS2322"],
  "evidenceTail": "...last bounded output..."
}
```

Gate execution rules:

- Prefer `execFile`-style executable + argv adapters (`executable`, `args`) with no shell interpolation. A raw `command` string is a separate, explicitly classified `shell` kind.
- Route every command through the existing severity classifier before execution. Critical/dangerous commands fail closed; risky commands require a checkpoint unless an explicit approved rule allows them. Reuse `pix-skills` rule semantics instead of duplicating them.
- Preserve bounded stdout/stderr tails, exit code, duration, tool/version, scope, and one `check` record per examined item. Journal the complete report, including failed checks.
- On a failed gate with a repair prompt, send the report to the same `agent()` handle/session. The correction loop is bounded by retries and budget; a failed gate never silently becomes an agent restart.
- `pstack verify` remains the project-level smoke/type-check reference: code reports a result and `pstack ship` refuses to merge after failure. Workflow gates generalize that stop-before-next-phase behavior.


## 3C. OMP native checkpoint and snapshot integration

OMP's session system is append-only JSONL tree storage, not an external workflow database. Extensions receive a read-only `sessionManager` with `getBranch`, `getEntries`, `getTree`, `getLeafId`, `getEntry`, artifact storage, and branch/session metadata; extensions can persist namespaced opaque state through `pi.appendEntry(customType, data)`. `sendMessage` is for visible/LLM-context messages; `appendEntry` is for durable extension state that must not enter model context. OMP also supports user-visible branch/tree navigation from command context.

Use both persistence layers with clear authority:

- **Native session snapshot:** after a route approval or gate checkpoint, append `ezxomp.workflowz.checkpoint` with `{runId, routeHash, sessionId, stageId, gateId, state, journalPath, artifactRefs}`. Store large GateReport evidence through `sessionManager.saveArtifact` and keep only a bounded pointer/hash in the custom entry. Reconstruct the latest state from `sessionManager.getBranch()` on `session_start`, `session_tree`, and session switches.
- **Workflow journal:** remain authoritative for subprocess outcomes, gate reports, retries, stop state, and resumable stage results. A session snapshot can point to a journal; it cannot replace it because OMP session history does not know whether an external command, worktree, or child agent completed.
- **Branch/revisit:** use command-context `branch`/`navigateTree` only when the user explicitly asks to revisit a route or conversation checkpoint. Do not silently move the session leaf from a workflow tool.
- **Namespacing:** use package-qualified custom types; extensions must not write core-reserved values such as `tool_execution_start` or `session_exit`. The native `label` entry is metadata, not an external execution checkpoint.
- **Recovery semantics:** a restored session with an active `runId` reads the journal, verifies the route/content hashes, and reports `paused`, `stopped`, `awaiting_input`, or `resume_available`; it never treats the presence of a session snapshot as proof that work completed.



## 3D. Mandatory artifact and repository governance

Every workflow agent inherits two non-optional operating contracts:

### Backlog artifact contract

- Backlog is the durable source of truth for every plan, specification, research result, decision, review outcome, implementation note, final summary, reusable recipe, and reusable gate.
- Before creating or changing a durable artifact, the workflow must find or create its Backlog task/document and carry `{taskId, documentId, artifactKind, path, contentHash}` in the route/run metadata. The owner must also carry acceptance criteria, inherited Definition of Done, type, priority, status, labels, dependencies/readiness, references, documentation, and modified-file paths.
- `omp_workflow_artifact_record` records or verifies this link through the Backlog CLI/plugin surface, including acceptance criteria, Definition of Done, proper type/priority, labels, dependencies, references, documentation, modified files, and ready-state evidence. Agents must never edit Backlog task/document markdown directly; all status, acceptance, notes, comments, and final summaries use Backlog operations.
- Ephemeral run journals and OMP session snapshots may remain local runtime state, but must carry the related Backlog task/artifact IDs whenever the run has a durable owner. Promoting an ephemeral result to a reusable recipe/gate requires a Backlog record first.
- Subagent setup text repeats this contract because subagent sessions do not load the extension's handlers automatically.

### Git repository contract

- Git is the repository-management authority: use `git status`, `git diff`, `git commit`, `git switch`, and `git push` as appropriate. Standard Git branches, commits, and pushes are required for workflow-owned repository changes.
- A mutating workflow requires a Git capability check and records the current branch/commit in its route and journal. A missing Git tool fails the mutating route closed; read-only research may report unsupported repo management.
- Native Git worktrees are optional isolation. When selected, the coordinator creates and cleans the named run worktree; workers commit only on its `task/<slug>` branch, and the coordinator alone integrates and pushes. Without isolation, use the validated current Git workspace after approval.
- The workflow must not claim a repository artifact is complete until the Backlog record and Git commit state are both recorded.

### Workflow enforcement sequence

Governance is executable state, not prompt-only guidance. Every routed run carries this envelope:

```json
{
  "artifact": { "taskId": "TASK-15", "documentId": "doc-...", "kind": "implementation" },
  "repo": { "manager": "git", "isolation": "none", "gitBranch": "...", "gitCommit": "..." },
  "policy": { "backlogRequired": true, "gitRequiredForMutation": true }
}
```

The host enforces these transitions:

1. **Route preflight:** `omp_workflow_artifact_record` finds/creates the Backlog owner and verifies the artifact path/kind; `omp_workflow_repo_guard` verifies Git availability/current branch and chooses `none` or optional `worktree` isolation.
2. **Agent setup:** every rendered `agent()` prompt receives the Backlog/Git contract, owner IDs, repo mode, and forbidden operations. Subagents cannot rely on extension hooks to receive it.
3. **Before durable writes:** the artifact tool must return a Backlog-linked record. Unlinked recipe/gate/plan writes are rejected.
4. **Before mutation:** the repo guard must return a Git branch and approved worktree. Mutating operations must use standard Git commands and the approved task worktree; pushes are coordinator-only.
5. **Phase boundaries:** a `backlog-record` check and `git-state` check run before a mutating phase can advance. Optional Git worktree creation/cleanup is recorded but never substitutes for Git state.
6. **Finalization:** the workflow records implementation notes, changed files, verification evidence, and final summary through Backlog, then records Git branch/commit state. Completion is blocked until both records succeed.

Backlog/Git integration failures are visible GateReports and fail closed; the agent may repair metadata or ask the user, but it cannot bypass the governance gates.




## 3E. Code-only tool chains and workflow-scoped agent profiles

Native eval is an optional transport for agent orchestration, not a requirement for deterministic code. Code-only tools run through host-registered extension tools and can be chained directly; agent steps may use native eval when it provides the desired OMP surface.

### Just-backed code tool chains

`just` is the project command runner and the default code-gate entrypoint. The host discovers recipes with `just --list`, accepts only an allowlisted recipe ID plus typed arguments, captures stdout/stderr/exit/duration, and emits a GateReport. It must not pass an arbitrary shell string or silently install dependencies.

Initial reusable code chains:

| Chain | Deterministic steps | Owner |
|---|---|---|
| `artifact-ready` | Backlog owner/readiness → frontmatter/schema → references → acceptance criteria + Definition of Done | `workflowz-backlog-steward` |
| `repo-ready` | Git capability → `git status`/branch → diff/commit inspection → optional Git worktree state | `workflowz-git-steward` |
| `verify-local` | `just check` → `just test` → `just pstack-test` | `workflowz-verifier` |
| `verify-premerge` | `just verify` → Fallow JSON audit → Git state/evidence | `workflowz-verifier` + `workflowz-git-steward` |
| `review-loop` | Planner handoff → implementation handoff → `just verify` → Judge GateReport → bounded same-session repair | Orchestrator/Planner/Judge |
| `research-ready` | Backlog spike/doc → source evidence → structured report → Backlog document update | `workflowz-researcher` + `workflowz-backlog-steward` |
| `release-ready` | Backlog readiness/dependencies → `just verify` → Git diff/commit/DCO evidence | `workflowz-git-steward` + `workflowz-judge` |

The code-only chain surface includes `omp_workflow_just_list`, `omp_workflow_just_run`, `omp_workflow_backlog_record`, `omp_workflow_repo_guard`, `omp_workflow_fallow_audit`, `omp_workflow_lsp_diagnostics`, and `omp_workflow_gate_report`. These are host tools with typed inputs and safety policy; they do not require an eval cell.

### Workflow-scoped profile roster

Ship nine prefixed profiles under the extension's `agents/` surface. They are discoverable OMP agents, but a workflow route may select only the explicit `workflowz-*` allowlist; ordinary OMP agent-profile changes do not silently alter this workflow's roster.

| Profile | Responsibility | Spawn authority | Primary surfaces |
|---|---|---|---|
| `workflowz-orchestrator` | route request, compose chain, own lifecycle | max fan-out 8; normal/background/parallel | workflow tools, task, hub, read-only Git/Backlog status |
| `workflowz-planner` | decompose and produce typed handoffs | max 4 children, depth 1 | read/search, Backlog read/record, route preview |
| `workflowz-judge` | evaluate GateReports, approve/reject progression | max 4 children, depth 1 | Just gates, Fallow, Git read, Backlog finalization |
| `workflowz-researcher` | gather external/repository evidence | terminal | web/read/search, Backlog research artifact |
| `workflowz-implementer` | make scoped code changes | terminal | read/write/edit, Git worktree, approved Just gates |
| `workflowz-verifier` | run code-only checks and normalize evidence | terminal | Just, Fallow, LSP, tests, read-only Git |
| `workflowz-security-reviewer` | inspect safety/trust/policy boundaries | terminal | read/search, security tools, GateReport |
| `workflowz-backlog-steward` | maintain task/doc/AC/DoD/readiness metadata | terminal | Backlog operations, artifact records |
| `workflowz-git-steward` | maintain Git branch/commit state and optional Git-worktree isolation | terminal | Git, native worktree tools when selected, repo evidence |

Only Orchestrator, Planner, and Judge may spawn children. Specialists are terminal nodes. The host `omp_workflow_spawn_guard` enforces parent role, child allowlist, spawn mode, per-parent fan-out, and depth before allocating an agent. Native OMP `spawns`/recursion policy remains enabled, with this workflow's stricter depth-one rule layered on top.

Supported spawn modes:

- **normal:** awaited typed result;
- **background:** `agent(..., {handle: true})` with lifecycle status and explicit join;
- **parallel:** bounded fan-out using the parent's limit (`8` Orchestrator, `4` Planner/Judge).

Each handoff uses `WorkflowHandoffV1`: source/target profile, parent run ID, Backlog task/document IDs, Git change/gitCommit, artifact hashes, input/output schema, GateReports, changed files, and status. The orchestrator owns extension tools and governance writes; specialists return structured results when their subagent session cannot load extension handlers.

### Online precedents

- [Microsoft Conductor](https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/) separates deterministic script steps from model nodes, supports explicit parallel failure modes, human gates, dry-run validation, and zero-token routing.
- [GitHub Agentic Workflows](https://github.github.com/gh-aw/) separates deterministic Actions from agent reasoning, defaults to read-only/sandboxed jobs, validates compiled workflows, constrains safe outputs, and enforces hard run budgets.
- [OpenCode Orchestrator depth hierarchy](https://deepwiki.com/agnusdei1207/opencode-orchestrator/5.5-agent-spawning-and-depth-hierarchy) demonstrates terminal-node guards, centralized depth constants, structured delegation errors, and per-role concurrency limits.



## 3F. Slash command as the orchestrator skill bootstrap

The initial `/workflows` command behaves like a skill invocation. It must load a workflow-scoped `omp-workflow-orchestrator` skill block into `workflowz-orchestrator` before asking it to route or execute anything. A keyword notice or recipe catalog alone is insufficient.

The skill block is a durable, Backlog-linked artifact and contains:

1. **Mission and inputs:** restate the user's request, declared constraints, target project, Backlog owner, Git worktree/change, and requested output.
2. **Discovery checklist:** inspect Backlog task/document status, acceptance criteria, inherited Definition of Done, labels/dependencies/readiness, `git status`/change/gitCommit, `just --list`, available verifier adapters, active agents, and existing workflow/gate catalog.
3. **Route rules:** choose one registered recipe or acyclic chain; select the nine workflowz profiles; validate typed inputs/results; never invent a recipe or skip required governance.
4. **Gate map:** run artifact/repo preflight, route approval, mutation approval, code-only Just/verifier chains, GateReport/Judge checks, and Backlog/Git finalization in order. Each gate states what evidence permits continuation, what requires repair, and what requires user escalation.
5. **Agent control loop:** launch normal/background/parallel children within profile limits; monitor heartbeats and tool results; inspect transcripts when progress stops or errors appear; steer with focused guidance; stop/retry/escalate according to health policy.
6. **Continuation logic:** continue only after required gates pass and the child handoff is valid; chain another registered workflow only when its input contract is satisfied and cycle/depth limits permit; otherwise pause with a visible reason.
7. **Completion contract:** record GateReports, Backlog acceptance/DoD/readiness evidence, modified files, and Git branch/commit state; return a typed `OrchestratorRunResultV1` with status, chain, child outcomes, evidence refs, and next action.

The command injects this skill text plus the route/run context into the orchestrator prompt. It does not assume that generic OMP Workflowz instructions, a child extension hook, or a recipe description will supply these decisions.

## 3G. Hook and Hub watchdog control loop

Hooks provide lifecycle evidence and policy interception; Agent Hub provides live inspection and control. The orchestrator's monitor is a host-owned control loop, not a passive status widget.

### Hook contract

Register idempotent handlers through the ExtensionAPI/HookAPI:

| Event | Workflowz action |
|---|---|
| `before_agent_start` | inject the orchestrator skill, governance context, route state, gate map, and profile limits into the orchestrator; keep catalog notices bounded |
| `agent_start` | register child ID/parent/profile/mode, initialize heartbeat and operation budget |
| `turn_start` / `turn_end` | update progress, last activity, usage, handoff phase, and stall timers |
| `tool_call` | block forbidden direct Backlog markdown/Git mutations; enforce profile/tool policy before execution |
| `tool_result` | capture Just/Git/Backlog/GateReport evidence and classify errors for the monitor |
| `agent_end` | validate `WorkflowHandoffV1`, persist child outcome, trigger Judge/next-chain decision |
| `session_start` / `session_tree` | restore snapshot pointers and reconcile active journal runs |
| `session_shutdown` | mark active children interrupted, persist resume pointers, and never claim completion |

Handlers must be safe when a child session does not load extension modules: parent hooks and the host monitor remain authoritative; child prompts carry the same reporting/governance contract.

### Hub monitor contract

`omp_workflow_agent_control` wraps OMP Hub capabilities for the orchestrator:

- `inspect`: roster status, parent/child lineage, current tool/arguments, last activity, usage, output/patch paths, and worktree metadata;
- `peek`: bounded live transcript via `history://<id>` plus saved output via `agent://<id>`;
- `steer`: send focused guidance to a running/idle child through the Hub prompt path;
- `stop`: abort/kill a child only when the health policy, user request, or governance gate permits;
- `retry`: create a bounded retry with the same handoff/input hash, never an untracked duplicate.

Health states are `starting`, `running`, `progressing`, `idle`, `blocked`, `tool_error`, `stalled`, `completed`, `failed`, and `stopped`. The monitor polls with OMP lifecycle-safe timers and reacts to event evidence:

1. no progress at the configured threshold → inspect/peek;
2. confirmed blocked/tool-error state → steer with the exact GateReport/tool failure;
3. repeated no-progress or retry exhaustion → stop and escalate;
4. valid completion → persist handoff and let Judge decide continuation;
5. any stop/shutdown → journal an interrupted state and expose explicit resume/retry.

Every inspect, steer, stop, and retry action is recorded with actor, reason, child ID, parent run ID, and Backlog/Git references. The orchestrator does not wait for a child to “ping” it; hooks, heartbeats, Hub inspection, and transcript peeking provide proactive supervision.

## 4. Schema V2

```json
{
  "schemaVersion": 2,
  "name": "review-and-merge",
  "description": "Plan, approve, implement, verify.",
  "inputs": { "task": { "description": "What to implement", "required": true } },
  "outputs": { "status": "string", "result": "string" },
  "stages": [
    {
      "id": "plan", "label": "Plan",
      "tasks": [{ "id": "planner", "agent": "task", "prompt": "Create a plan for {{input.task}}" }],
      "gates": [{ "id": "plan-ok", "type": "checkpoint", "prompt": "Approve this plan?" }]
    },
    {
      "id": "verify", "label": "Verify",
      "tasks": [{ "id": "implementer", "agent": "task", "prompt": "Execute the plan" }],
      "gates": [
        { "id": "verify-pass", "type": "shell", "command": "just verify",
          "expect": { "exitCode": 0 }, "retries": 3,
          "repair": "Fix the failures and re-run" }
      ]
    }
  ]
}
```

### Gate types (all rendered to deterministic eval JS)

| Gate | Rendered as | Failure behavior |
|---|---|---|
| `shell` | `tool.bash({command})` → exitCode check | bounded repair loop: `agent(repair)` → re-check → fail after `retries` |
| `llm` | `completion(prompt, {schema})` → validate | fail with reason |
| `checkpoint` | `tool.omp_workflow_checkpoint({prompt})` | `rejected` → return `{status: "cancelled"}` |
| `budget` | `budget.remaining() < threshold` | return `{status: "budget_exhausted"}` |
| `output` (final) | `tool.omp_workflow_report({event: "complete", results})` | host-side JSON-schema validation against `outputs` |



### Reusable deterministic gate catalog

Workflow gates are reusable, versioned code/verifier definitions, separate from recipes. Add a `GateFileV1` catalog under `.omp/workflows/gates/` and `~/.omp/agent/workflows/gates/` with project-over-global precedence:

```json
{
  "schemaVersion": 1,
  "id": "oxlint-js-ts",
  "version": "1.0.0",
  "description": "Run Oxlint for JavaScript and TypeScript files.",
  "kind": "exec",
  "language": ["javascript", "typescript"],
  "executable": "oxlint",
  "args": ["{{input.scope}}"],
  "expect": { "exitCode": 0 },
  "safety": "standard",
  "timeoutMs": 120000,
  "trust": "approved",
  "contentHash": "..."
}
```

Rules:

- The LLM may create a draft gate through `omp_workflow_gate_create`; saving it globally or running a new gate for the first time requires a human checkpoint.
- A gate is deterministic only when its host adapter produces a stable, machine-checkable result. `shell`, LSP diagnostics, linters, frontmatter validation, and language checks qualify; an `llm` gate is advisory and must never be described as a deterministic code gate.
- Every adapter returns a GateReport with one evidence-bearing check per item, bounded output evidence, exit/result metadata, and a normalized violation list. A bare boolean is not sufficient for the journal or TUI.
- Gate commands use typed inputs, fixed working-directory policy, executable allowlists, timeouts, normalized stdout/stderr, and content hashes. Do not interpolate untrusted prompt text into shell source.
- Prefer `execFile`-style `executable` + `args`; raw shell commands require severity classification and an explicit approval policy using the existing project gate rules.
- Reusable gates carry prerequisites, version detection, supported-language selectors, auto-fix policy, and failure severity. Missing tools fail closed unless the recipe explicitly marks the gate optional.
- Project-scoped drafts may be edited locally. Global gates are immutable by version/content hash; updates create a new version rather than silently changing behavior. Global gates must record non-empty Backlog task/document ids as owners; free-form or empty owner strings fail closed at persistence and resolution. Scaffold ownership verification routes `task-*`-shaped owners through Backlog task lookup and `doc-*` owners through Backlog document lookup.

### Verifier research matrix

The research result below freezes the adapter boundary. Each adapter must record executable/version, argv or JSON-RPC method, scope, exit/result mapping, bounded evidence, and missing-tool behavior. These are approved invocation shapes; project-local config still controls paths and thresholds.

| Surface | Verified invocation/API | Result normalization and policy |
|---|---|---|
| Fallow | `fallow audit --format json --quiet`; `fallow schema` for the machine manifest | JSON root includes `kind`, `schema_version`, `version`, `verdict`, summary, and analysis sections. Exit `0`/`1` are normal clean/findings outcomes; `2` is a runtime/validation error; `7` network failure; `8` security-gate hit. Gate on `verdict` plus exit policy, preserve the JSON artifact, and never collapse `1` into an infrastructure failure. |
| Oxlint | Canonical CLI: `oxlint -f json <paths>`; safe fixes are separate (`oxlint --fix`). The local repo uses `vp lint -f json` because its `oxlint` PATH wrapper is LSP-only. | JSON contains `diagnostics`, file/rule/thread metadata, severity, filename, spans, help, and rule code. Gate thresholds must distinguish errors from warnings. Detect VitePlus wrappers and project-local binaries before invocation; do not assume `oxlint` on `PATH` is the linter. |
| LSP diagnostics | JSON-RPC/LSP over stdio: `initialize` → `initialized` → `didOpen`/`didChange` → collect `textDocument/publishDiagnostics`; normalize Diagnostic severity 1 error, 2 warning, 3 info, 4 hint; shutdown/cancel on timeout. | Use workspace root and document URI explicitly. Require a bounded diagnostic window and server exit/health result. Launch candidates: `rust-analyzer`, `gopls serve`, `pyright-langserver --stdio`, `typescript-language-server --stdio`. |
| Rust | `rust-analyzer` LSP; `cargo fmt --check`; `cargo clippy --message-format=json`; `cargo test --message-format=json` | LSP diagnostics plus compiler/test JSON events. Scope by workspace/package; no formatter mutation in a gate. Local rust-analyzer proxy exists but fails because the installed Rust toolchain lacks the component, so the adapter must report unavailable rather than pass. |
| Go | `gopls serve`; `gofmt -l`; `go vet`; `go test -json` | LSP diagnostics, unformatted-file list, vet result, and test events. Scope by module/package; prohibit implicit network mutation unless explicitly configured. Local `gopls` is absent, so missing-tool handling is exercised. |
| Python | `pyright --outputjson`; `pyright-langserver --stdio`; `ruff check --output-format json`; `ruff format --check`; `pytest --junit-xml=<path>` | Parse Pyright/Ruff JSON and JUnit XML into GateReport checks. Safe Ruff fixes are opt-in; unsafe fixes require a separate approval. Local Pyright 1.1.411 and its language-server launcher are present; Ruff and pytest are absent. |
| JavaScript/TypeScript | `oxlint -f json`; local `vp lint -f json`; `tsc --noEmit --pretty false`; `typescript-language-server --stdio` | Parse Oxlint diagnostics; preserve TypeScript compiler stderr as bounded evidence with a stable line parser; collect LSP diagnostics. Local TypeScript 5.9.3 and TypeScript Language Server 5.3.0 are present; `vp lint` currently returns `1` for repository warnings, so warning policy must be explicit. |
| Metadata/frontmatter | Reuse project delimiters/parser: `^---\n([\s\S]*?)\n---`; validate required keys and list shape as existing `pix-skills`/`pstack` tests do | Emit one check per file/key with line locations. Do not add a YAML dependency until the research proves the existing regex contract is insufficient for a target recipe. |

Verified local snapshot (2026-08-20): `fallow 3.16.0` returned `audit` JSON with `verdict: pass`, `schema_version: 9`, 43 changed files, and 3 non-error dead-code findings; `vp lint -f json` returned structured diagnostics and exit `1` for warnings; `tsc 5.9.3`, `typescript-language-server 5.3.0`, and `pyright 1.1.411` are available; `gopls`, Ruff, pytest, and basedpyright are missing. This snapshot is evidence for prerequisite reporting, not a hard-coded project dependency.

Primary contracts: [Fallow CLI](https://github.com/fallow-rs/fallow), [Oxlint CLI](https://oxc.rs/docs/guide/usage/linter/cli.html), [Oxlint output formats](https://oxc.rs/docs/guide/usage/linter/output-formats), [LSP 3.17 diagnostics](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/), [gopls](https://go.dev/gopls/), [Pyright](https://github.com/microsoft/pyright), [Ruff](https://docs.astral.sh/ruff/linter/), [pytest JUnit output](https://docs.pytest.org/en/stable/how-to/output.html), [TypeScript Language Server](https://github.com/typescript-language-server/typescript-language-server), and [rust-analyzer](https://rust-analyzer.github.io/book/).

### Rendered gate example

```js
phase("Verify");
const check = await tool.bash({ command: "just verify" });
if (check.exitCode !== 0) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await agent("Fix the failures:\n" + (check.stderr || check.stdout));
    const re = await tool.bash({ command: "just verify" });
    if (re.exitCode === 0) break;
    if (attempt === 3) return { workflow, results, status: "failed", reason: "verify gate failed after 3 attempts" };
  }
}
```

## 5. Run lifecycle

```
omp_workflow_render(name, inputs) → { code, runId }   // run record created
model pastes code into eval cell                        // runId baked into JS
rendered JS: tool.omp_workflow_report({runId, event: "phase|gate|complete", ...})
  → journal.jsonl append (0700)
omp_workflow_status(runId) → phases, gates, results, state
omp_workflow_stop(runId)  → journal marked stopped; next report call returns
                            {status: "stopped"} → JS returns early (cooperative)
omp_workflow_resume(runId) → new runId, parentRunId link, completed stages skipped,
                            journaled results seed {{result.*}}
omp_workflow_retry(runId)  → fresh render, same inputs, no seeding
```

Launch bridge: overlay action → `pi.sendUserMessage("workflowz <name> with inputs …")` → the model renders + runs. No new run tool needed.

## 6. TUI surfaces — every OMP surface used

| OMP surface | What we build |
|---|---|
| `hostCenteredOverlay` (experiences) | `WorkflowLibraryOverlay` v2 — tabs: **Recipes / Templates / Runs**; Enter → detail; launch action → `sendUserMessage` |
| `/workflows` command + `ctx.ui.custom` | natural-language route prompt, strict chain preview, input collection, and approval before mutating chains |
| `hostCenteredOverlay` | new **`WorkflowRunOverlay`** — live run inspector: phases, gates, results, checkpoint answer (journal-driven, `ctx.setInterval` poll) |
| `ctx.ui.custom` | run inspector as modal from the command path |
| `setWidget`/`setHookWidget` (`belowEditor`, 10-line cap) | live run strip: `run <id> · stage 2/4 · verify gate` — the **footer widget** |
| `ctx.ui.setStatus` | footer status line per key (`workflowz: …`) — **`setFooter` is a documented no-op in interactive mode; this is the honest replacement** |
| `registerMessageRenderer` + `sendMessage` | run lifecycle **cards** (started/completed/failed/checkpoint) — the TUI modal surface |
| `renderCall`/`renderResult` on gate tools | compact gate rendering in transcript |
| `registerShortcut` | `alt+w` library, `alt+shift+w` run inspector (not in reserved list) |
| `ctx.ui.confirm/select/input` | checkpoint dialogs, recipe input collection |
| `ctx.ui.notify` | run completion/failure toasts |
| `setTitle`/`setWorkingMessage` | terminal title during active run |
| `ctx.setInterval`/`setTimeout` | widget/overlay polling (never raw timers — session teardown risk) |
| `pi.appendEntry` + `sessionManager` | native namespaced checkpoint/snapshot pointer, artifact refs, and reconstruction on `session_start`/`session_tree`; workflow journal remains execution authority |
| `before_agent_start` + `containsWorkflow` | existing catalog injection; extend with template + active-run counts (keep 8 KiB cap) |
| `tool_call`/`tool_result` | optional: detect eval cells running a workflow (parse `const workflow =`), auto-attach runId — fragile, mark optional |
| `pi.exec`, `pi.logger`, `pi.zod` | scaffold writes, logging, schemas |
| `getAllTools` | harden `isWorkflowzEnabled`: verify `eval` + `task` actually active before injecting |

## 7. Honest limitations

1. **No operation-level replay** — resume is stage-granular (stages are barriers; journaled results seed refs). Pi's journal and Atomic's DBOS replay need an engine OMP doesn't have.
2. **No per-task model/tools/skills** — eval `agent()` surface is `{agent, label, schema, handle, …}` only. Roles = OMP agent names; `setup` embedded in prompts.
3. **No hard budget enforcement** — `budget` is advisory; gates are soft.
4. **Checkpoints interactive-only** — `hasUI` guard; `auto: true` for headless recipes.
5. **`setFooter` no-op** — status line + belowEditor widget instead.
6. **`parallel` has no concurrency/failFast** — all-at-once fan-out.
7. **Subagent sessions don't load extensions** — all per-task injection must be in the prompt text.
8. **Verifier CLIs are versioned dependencies** — Fallow, Oxlint, LSP servers, and language tools require researched adapters; do not hard-code guessed commands.
9. **LLM gates are advisory** — only host-executed code/tool gates can satisfy deterministic-gate policy.
10. **Gate evidence is required** — a pass/fail boolean without per-item notes, bounded output, and tool metadata cannot support repair, audit, or TUI inspection.
11. **OMP session snapshots are not workflow checkpoints** — they recover conversation/extension state, while the journal recovers external execution state.
12. **Command autocomplete is extension-supported but hook-only APIs lack it** — implement `/workflows` through the extension API, not the legacy hook registration path.
13. **Durable artifact and repo claims require two records** — Backlog links the artifact/task; Git records repository state. Worktree isolation alone is not repository provenance.



## 7A. Limitation mitigation and OMP-core boundary

The limitations are not accepted as vague permanent gaps. Each has a mitigation path and an explicit boundary where only OMP core can provide full parity. `TASK-15.6` records the capability decision matrix before runtime work begins.

| Limitation | Extension-level mitigation | Full parity requires | Hard fallback |
|---|---|---|---|
| Operation-level replay | Wrap each rendered agent/tool/gate operation with an `operationId`, input/content hash, start/complete journal records, replay class (`pure`, `idempotent`, `manual`), and cached-result lookup. Replay pure/idempotent operations; require confirmation for manual side effects. | OMP eval transaction hooks or an engine-owned exactly-once scheduler around `agent()`/`tool.*`. | Resume at the last durable operation/stage; never claim exactly-once semantics. |
| Per-task model/tools/skills | Resolve named OMP agent profiles, embed setup/policy in prompts, and enforce host-side gate/tool boundaries. | `agent()` capability options or extension-inherited subagent profiles with tool/skill isolation. | Reject unavailable profiles; do not claim per-task tool restrictions. |
| Hard token/cost budgets | Reserve and consume launch-count, wall-clock, and configured task budgets in a host ledger before execution. | OMP usage events exposing authoritative token/cost telemetry per agent/tool call. | Enforce launch/time limits; label token/cost as advisory and stop before unknown overrun. |
| Interactive-only checkpoints | Add explicit headless policies: read-only auto-approve, mutating auto-reject, or externally recorded approval; journal the decision and policy source. | OMP-native approval events/response channels usable by noninteractive runners. | Fail closed when no valid policy/approval exists. |
| Footer API unavailable | Use `setStatus`, below-editor widgets, lifecycle cards, overlays, and terminal title. | A supported extension footer renderer/hook. | Show status in widget/card/overlay; never pretend `setFooter` rendered. |
| `parallel` lacks concurrency/fail-fast | Render a bounded worker pool with `limit`, `failFast`, operation IDs, and agent handles; stop launching new work after failure. | Core cancellation/abort propagation for already-running agent calls. | Mark in-flight work `indeterminate`, preserve evidence, and require explicit resume/retry. |
| Subagents do not load extensions | Inject Backlog/Git/governance setup into prompts; keep extension-tool calls in the parent; require structured child results. | OMP subagent extension inheritance or capability broker. | Child agents cannot create durable artifacts or mutate the repo directly; parent performs those operations. |
| Versioned verifier CLIs | Adapter discovery probes executable/version, records prerequisites, parses structured output, and applies configured thresholds. | None required; this is plugin-owned. | Missing or incompatible required tools fail closed; optional tools skip visibly. |
| LLM gates are non-deterministic | Keep LLM review as advisory evidence; required acceptance uses host-executed code/tool gates only. | None required for deterministic policy. | An LLM cannot mark a required deterministic gate passed. |
| Gate evidence overhead | Enforce `GateReport` schema, per-item checks, bounded output, normalized violations, artifacts, and journal references. | None required; this is plugin-owned. | Boolean-only adapters are rejected. |
| OMP snapshots do not capture external work | Store namespaced session checkpoint pointers/artifacts and reconcile them with the operation/stage journal on explicit resume. | Core-owned external-operation transaction integration. | Snapshot alone never resumes or certifies external work. |
| Command autocomplete limitations | Use extension `getArgumentCompletions` with full-prefix `AutocompleteItem` values; keep hook registration out of the command path. | None required for `/workflows`; legacy hook commands remain limited. | Display command grammar in help/overlay when completion is unavailable. |
| Backlog/Git governance | Enforce `omp_workflow_artifact_record`, `omp_workflow_repo_guard`, per-agent setup, phase gates, and finalization records. | None required for the policy itself; host integrations must be available. | Block durable writes/mutations when Backlog or Git evidence cannot be recorded. |

**Parity rule:** an extension mitigation may improve behavior, but it must not label an advisory fallback as a hard guarantee. OMP-core requests are separate decision/implementation work and do not silently expand the plugin's contract.


## 7B. OMP-core capability-gap matrix — extension mitigation vs. core parity (TASK-15.6 freeze 2026-08-22)

> **Scope:** This section freezes TASK-15.6. It is a docs/decision record only; it cites shipped extension behavior as it exists in `plugins/extensible-workflows/src/runtime.ts` and `src/p0-tools.ts` (P0 runtime already SHIPPED) and marks every delta beyond that as *future work*. It does not claim core implementation. Parent: TASK-15 (#20/#21 depend on this). See also §7/§7A for the original honest-limitation list and §8 phased plan. Section added for TASK-15.6; linked from TOC and parent TASK-15 notes.

### Evidence base (shipped)

- **`operationId` dedup:** `runtime.ts:519-531` — `appendRunEvent` returns existing entry when `event.operationId` already present (idempotent append, not execution). `runtime.ts:128` — `JournalEvent.operationId?: string` and contentHash fields exist. No engine-level exactly-once execution.
- **Per-task policy:** `runtime.ts:385-477` — `renderWorkflowDefinition` renders `task.agent` (OMP agent name) and `task.setup` by embedding `task.setup` into `agent(prompt)` text (`423-428`); no `model`/`tools`/`skills` slot is rendered because eval `agent()` has none (honest limitation §7#2).
- **Budget ledger (soft):** `runtime.ts:32,49,432,447,604-609` — `gate.type="budget"` with `threshold`, `budget.remaining()` probe, advisory GateReport. `p0-tools.ts:108-117` delegates to `executeGate` with `evidence.budgetRemaining`.
- **Cooperative stop/status:** `p0-tools.ts:153-168` (`omp_workflow_stop` → `stopRun`) and `140-151` (`omp_workflow_status` → `runStatus`); `runtime.ts:550-559` — `runStatus` returns `{status, stopped}` and `stopRun` appends `event:"stop", status:"stopped"`. Rendered JS checks `stopped(await report(...))` at `runtime.ts:422,449,466` and returns `{status:"stopped"}` — cooperative, not abortive.
- **Headless checkpoint:** `p0-tools.ts:120-138` (`omp_workflow_checkpoint`) — `approved = auto===true || (hasUI ? confirm : false)`; `auto:true` is the headless escape, otherwise headless rejects. Journal `policy` records `auto` vs `interactive` vs `headless-requires-auto` (`131`).
- **Footer rendering:** §6 TUI table — `setFooter` is a documented no-op in interactive mode; shipped replacement is `ctx.ui.setStatus` + `setWidget:belowEditor` (10-line cap) + lifecycle cards/overlays/title (`runtime.ts:406-414` activity notwithstanding, UI surface is §6).
- **Parallel fan-out:** `runtime.ts:429` — `await parallel([async () => [id, await agent(...)]])` — unbounded all-at-once; no `limit`/`failFast`/cancellation wiring (limitation §7#6).
- **Subagent extension inheritance:** §7#7 and §3D/§3G — subagent sessions do not load extension modules; setup text must be embedded; extension-tool calls stay in parent; `p0-tools.ts` tools run in parent ExtensionContext.

### Classification legend

- **hard guarantee** — extension can enforce it end-to-end without core; violation fail-closes visibly.
- **advisory signal** — extension can emit/best-effort-check it, but cannot authoritatively enforce/meter without core telemetry; caller must treat it as hint and stop before overrun.
- **explicit non-goal** — extension will not claim it; any future claim requires a separate core change and docs update.

### Limitation matrix (8 required rows)

| # | Limitation | Strongest extension-only mitigation (shipped mechanism) | Residual limitation | Exact OMP-core API/event needed for parity | Classification | Fail-closed user-visible fallback |
|---|---|---|---|---|---:|---|
| 1 | **Operation-level replay** | Wrap every rendered `agent`/`tool`/`gate` op with `operationId = hash(runId + stageId + taskOrGateId + attempt + contentHash)` and `inputHash`; start+complete journal records with `operationId`; on resume/retry `appendRunEvent` dedup (`runtime.ts:519-531`) returns cached entry so duplicate append is idempotent; replay class `pure`→ re-execute and compare hash, `idempotent`→ return cached result without re-execution, `manual`→ require user confirmation (`§7A` row). Stage-granular `resumeWorkflowRun` (`runtime.ts:861-896`) with `skipStages` already ships; operation-level extends it. | Cannot guarantee exactly-once for side-effectful tools or LLM calls; journal dedup prevents double-record but does not prevent double-execution of the operation itself without an engine transaction around `agent()`/`pi.exec`. | `omp://hooks.md` / eval Kernel: `before_agent_call` + `after_agent_call` transaction hook (or `agent()` returning an `operationId`-bearing handle with host scheduler), plus `tool_call`/`tool_result` journal transaction that can return cached result without re-invoking the tool. Until then parity is partial. | **explicit non-goal** for engine-level exactly-once; **hard guarantee** for stage-granular resume + append-dedup | On resume: render skips completed stages (shipped); for in-flight operation without `operationId` match, show `indeterminate — last durable stage was <id>; re-run required choice: replay pure/idempotent from cache or re-execute manual with confirmation`. Never claim operation was skipped or exactly-once. |
| 2 | **Per-task model/tool/skill policy** | Resolve named OMP agent profiles (`task.agent` is an OMP-registered agent name, §3E roster) and embed `task.setup` governance/policy text into the rendered prompt (`runtime.ts:424-425`); enforce tool boundaries host-side in `omp_workflow_gate`/`omp_workflow_just_run` safety classifier (`runtime.ts:615-616` `directiveBlockReason`, `gate.ts` rules) and in `tool_call` hook (`§3G`). | No true per-task isolation — eval `agent()` surface is `{agent,label,schema,handle}` only (shipped: `runtime.ts:427`); cannot restrict a child to a disjoint tool/skill set, pin a different model, or hide parent skills. | `omp://task-agent-discovery.md`: `agent({agent, model, tools:[], skills:[], isolation:"strict"})` capability options, plus `agents/workflowz-*.md` frontmatter `tools/skills/model/spawns` honored by the host for subagents (subagent extension inheritance). | **explicit non-goal** for isolation (until API exists); **hard guarantee** for prompt-embedded policy + host-side gate rejection | If requested profile demands disallowed tools/model, reject route validation with `WORKFLOW_ROUTE_INVALID: per-task model/tools requires core capability; requested agent=<name> unavailable` and list allowed `workflowz-*` profiles. Do not claim isolation was enforced. |
| 3 | **Hard token/cost budgets** | Host ledger reserves launch-count, wall-clock (`Date.now()` in `reportBase`/`executeGate`), and configured task-count before execution; rendered `budget` gate probes `budget.remaining()` when provided (`runtime.ts:432,447`) and `executeGate` returns advisory GateReport when threshold not reached (`runtime.ts:609`); `runStatus` surfaces `budget_exhausted` (`749,1019`). | No authoritative token/cost telemetry from the model layer; extension cannot meter tokens reactively. The probe is advisory when host does not expose `budget`. | `omp://session.md` + eval runtime: `budget` API or `usage` events (`token/cost` per `agent()`/`completion()` call) streamed to the host, plus a host `Reserve`/`Consume` ledger with pre-execution budget check that can refuse new `agent()` launches. | **advisory signal** for token/cost (until telemetry exists); **hard guarantee** for launch-count and wall-clock caps that the host can enforce | Enforce launch-count and wall-clock caps fail-closed (`budget_exhausted` → GateReport `failed` + `runStatus` terminal); for token/cost, label GateReport `advisory:true` (`runtime.ts:609`) and show `advisory budget — consumed launch=<n> time=<ms> tokens unknown; stopping before unknown overrun`. Never label advisory as metered. |
| 4 | **True agent cancellation** | Cooperative stop: `omp_workflow_stop` appends `stop` event (`p0-tools.ts:162`, `runtime.ts:557`), `runStatus(...).stopped` true (`550-554`), and rendered JS checks `stopped(await report('stage_start'|'gate'|'stage_complete'))` and returns early with `{status:"stopped"}` (`runtime.ts:422,449,466`); no new stages launch after stopped. | In-flight `agent()`/`tool.bash()` calls are not aborted; `AbortSignal` from ExtensionContext is not wired to eval agent handles. `parallel` children already launched continue until they complete. | `omp://agent-hub.md` / `omp://extensions.md`: `agent_handle.abort(reason)` + `tool_call` abort propagation via `AbortSignal` passed to `agent()` and `pi.exec`, plus Hub `stop` that kills the underlying turn (not just journal flag). | **advisory signal** (cooperative); **hard guarantee** requires core abort | On stop: mark journal `stopped`, stop launching new stages/agents, mark in-flight agents `indeterminate` (`Tool`/`AgentHub` `health:stalled` until peek confirms), persist evidence, expose `resume`/`retry` pointers. Show `workflow stopped cooperatively — in-flight agent <id> may still complete; inspect with status/peek`. Never claim instant abort. |
| 5 | **Headless checkpoint approval** | Explicit headless policy: `auto:true` → `approved:true` regardless of UI (`p0-tools.ts:129-130`); otherwise `hasUI ? confirm : false` → headless without `auto` is rejected. Journal records `policy: "auto"|"interactive"|"headless-requires-auto"` and `status:approved|rejected` (`131`), and namespaced snapshot appends `ezxomp.workflowz.checkpoint` (`132`). | No out-of-band approval channel for headless runners (CI, daemon) beyond `auto:true`; read-only vs mutating auto-policy must be configured per recipe, not inferred. | `omp://hooks.md`: `approval_requested` event on `checkpoint` plus `approval_response` channel usable headlessly (CLI flag, env, or Hub steer) that the host can await before rendering next stage. | **hard guarantee** (fail-closed) | If `hasUI===false` and `auto!==true`, return `fail("Checkpoint rejected by policy.", {approved:false,status:"rejected"})` (`p0-tools.ts:133`), journal `rejected`, show visible rejection reason and required `auto:true` or interactive approval. Never auto-approve mutating steps silently. |
| 6 | **Footer rendering** | Use `ctx.ui.setStatus(key:"workflowz:…")` + `setWidget` belowEditor (10-line cap) + `registerMessageRenderer` lifecycle cards + `hostCenteredOverlay` + `setTitle/setWorkingMessage` (`§6` table, `runtime.ts:132-133` activity hooks); intentionally avoid `setFooter` (no-op). | Cannot render in the host's footer bar itself; the widget/status surface is separate. | `omp://extensions.md`: `ctx.ui.setFooter(component)` or `setHookWidget:footer` extension renderer. | **explicit non-goal** for native footer until core surface exists; **hard guarantee** for status+widget+card fallback | Show status line `workflowz: <run> · stage X/Y · gate <id>` via `setStatus` and widget; when footer API unavailable, never claim `setFooter` rendered. Help/overlay explains fallback surface. |
| 7 | **Parallel concurrency / fail-fast** | Render a bounded worker-pool wrapper around `parallel` using per-parent limits (Orchestrator 8 / Planner,Judge 4, §3E), chunked `parallel` batches, `failFast` flag that stops launching further chunks after first `failed` GateReport, and `operationId` + `agent({handle:true})` handles to track in-flight children. Gate truth remains host-side (`omp_workflow_gate` GateReport). | Already-running `agent()` futures cannot be cancelled; `failFast` stops *launch* but does not abort in-flight work (row #4). True concurrency throttling inside the eval kernel is host-scheduled. | Core scheduler: `parallel(tasks, {concurrency:number, failFast:boolean, signal:AbortSignal})` with abort propagation to child agents (row #4 API). | **hard guarantee** for bounded launching + stop-launch-on-failure; **advisory signal** for abort of in-flight | On `failFast` failure: `GateReport failed — stopped launching remaining parallel tasks (launched <n>/<cap>)`; mark in-flight `indeterminate`; require explicit `resume`/`retry` to continue. Never claim already-running tasks were cancelled. |
| 8 | **Subagent extension inheritance** | All governance is prompt-embedded: every `task.setup` + rendered prompt carries Backlog/Git/governance/tool policy (§3D/§3G), extension-tool calls (`omp_workflow_*`) remain in parent only, children return typed `WorkflowHandoffV1` that parent validates before durable writes. `p0-tools.ts` tools run only in parent ExtensionContext. | Child cannot directly call extension tools, load gated skills, or rely on `before_agent_start` injection to receive policy if it omits setup text. | `omp://extensions.md` + `omp://task-agent-discovery.md`: `subagentInherits: {extensions:true, tools:[allowlist], skills:[allowlist]}` or capability-broker that exposes selected extension tools to named `workflowz-*` children. | **explicit non-goal** for loading extensions in subagents (until broker exists); **hard guarantee** for parent-owned durable writes | If child attempts a durable write/repo mutation, parent's `tool_call` hook or route validation rejects with `WORKFLOW_GOVERNANCE_REQUIRED: child cannot create artifact/mutate repo — return handoff to parent`. Show `child <id> returned handoff; parent will record artifact/Git`. Never let child bypass governance. |

### Shipped vs. future-work boundary (retro-freeze)

P0 runtime as it ships is stage-granular (journal + `skipStages` seeding, `operationId` dedup only), cooperative stop, advisory budget, headless `auto:true` escape, widget/status fallback, unbounded `parallel`, and parent-only extension tools. The rows above treat that as baseline and mark every stronger semantic (engine-level exactly-once replay, true abort, authoritative token telemetry, native footer, kernel-level concurrency, subagent tool inheritance) explicitly as **future work** requiring the listed OMP-core API/event. Roadmap items remain separate tasks and must not be read as shipped guarantees.


## 7C. Workflow-scoped agent profiles and Just-backed code-only chains (TASK-15.7 freeze 2026-08-22)

> **Scope:** This section freezes TASK-15.7. It is a docs/design record only; runtime code is not claimed complete. It defines the nine `workflowz-*` prefixed profiles, deterministic spawn policy, typed handoff/result contracts, and Just-backed code-only chains grounded against the real `justfile` recipe set as it ships (`justfile`: `default`, `check` → `bun run check`, `test` → `bun test test/`, `verify: check test`, `smoke`). Sections 3A-5/6/8 (WorkflowRouteV1/GateFileV1) are not rewritten; this section appends the profile/chain freeze and links from TOC. Future `just` recipes are marked `to-create`. See also §3E for the roster summary, §3D for governance, §3F/§3G for the skill that will select these profiles, and references `omp://task-agent-discovery.md`, Conductor, gh-aw, opencode-orchestrator.

### 7C.1 Nine `workflowz-*` profiles — full definition

Profiles are discoverable OMP agents under the extension's `agents/` surface (agent-plugin-format) but a workflow route may select **only** the explicit `workflowz-*` allowlist. They are scoped to the workflowz extension; ordinary OMP agent-profile changes do not silently alter this workflow's roster.

| # | Profile (`agents/workflowz-*.md`) | Responsibility | Allowed tools/skills (host-enforced) | Model policy | Backlog/Git governance setup | Allowed child profiles | Terminal / spawn |
|---|---|---|---|---|---|---:|---|
| 1 | `workflowz-orchestrator` | Owns the run: fan-out from validated `WorkflowRouteV1`, chain progression, phase/gate/judge orchestration, finalization/`OrchestratorRunResultV1` | Extension workflow tools (`omp_workflow_*`: `report`,`gate`,`checkpoint`,`status`,`stop`,`artifact_record`,`repo_guard`,`just_*`,`gate_report`), `task` (Hub), `read`/`search`, read-only Git/Backlog status; **no** direct `write`/`edit` of durable artifacts (delegates to specialists) except final `report` | `@task` (host `$0`); configured via OMP agent registry `model: "@task"`; subagents inherit parent model unless overridden by policy | Carries `{taskId,documentId,artifactKind,path,contentHash,routeHash,gitBranch,gitCommit,runId}` envelope; invokes `omp_workflow_artifact_record`+`repo_guard` preflight before spawning; enforces gate map; persists `OrchestratorRunResultV1` | May spawn `workflowz-planner` (→ decompose), `workflowz-judge` (→ gate verdict), `workflowz-researcher`/`verifier`/`backlog-steward`/`git-steward` as parallel assessors | **spawn authority** — max fan-out **8**, depth **0** (root); **not terminal** |
| 2 | `workflowz-planner` | Decompose task, produce typed `WorkflowHandoffV1` + plan artifact draft, validate `inputs`/`outputs` and result refs | `read`/`search`/`glob`, `Backlog read/record` (`artifact_record`), route preview; **no** `exec`/`just_run`/`edit`/`Git write` | `@task` (inherits); planning is model-heavy, budget accounted via `budget` gate | Must receive Backlog owner IDs in `setup` text (§3D); validates AC/DoD/labels/dependencies before returning handoff; parent verifies `taskId` before durable write | May spawn up to **4** children: `workflowz-researcher`, `workflowz-backlog-steward`, `workflowz-git-steward`, `workflowz-verifier` (read-only assessors) | **spawn authority** — max fan-out **4**, depth **1** (child of orchestrator) |
| 3 | `workflowz-judge` | Evaluate GateReports, approve/reject progression, request bounded repair, block finalization until evidence passes | `just_list`/`just_run` (allowlist), `fallow_audit`, `lsp_diagnostics`, `gate_report` read, `Backlog` finalization check, `Git read` — **no** `write`/`edit` except via gated handoff | `@task`; deterministic gates own truth, not model judgment | Verifies `GateReport.passed` + artifact/Git evidence before escorting next chain step; enforces `validateOutputs` (`runtime.ts:638-646`) | May spawn up to **4** children: `workflowz-verifier`, `workflowz-security-reviewer`, `workflowz-researcher` (evidence gatherers) | **spawn authority** — max fan-out **4**, depth **1** (child of orchestrator); may be invoked by orchestrator after each stage |
| 4 | `workflowz-researcher` | Gather external/repo evidence for spikes/decisions; produce structured report → Backlog document | `web`/`read`/`search`/`ctx_search`, `Backlog research artifact` (via parent), no `edit` of production code, no `exec` beyond read-only searches | `@task` or `@smol` when configured as low-reasoning assessor; prompt-specified | Receives `taskId`/`documentId` of spike; must cite file:line per claim (§3D); parent records doc | Spawns **none** | **terminal** |
| 5 | `workflowz-implementer` | Make scoped code changes per plan handoff; keep changes within approved workspace/worktree | `read`/`write`/`edit`/`patch` on allowed paths, `Git worktree` (read/change via guard), gated `just` (`check`/`test` subset) — **no** direct Backlog doc edits, no direct Git `commit/push` (coordinator-only) | `@task`; respects orchestrator budget ledger | Enforces `artifact_record` before durable write (§3D enforcement #3) and `repo_guard` before mutation (#4); records `modifiedFiles` | Spawns **none** | **terminal** |
| 6 | `workflowz-verifier` | Run code-only checks and normalize evidence into `GateReport` (one `check` per item, bounded tails, violations, tool/version, duration) | `just_list`/`just_run` (allowlist), `fallow_audit`, `lsp_diagnostics`, `tests`, `read` — **no** `write`/`edit` beyond GateReport capture, read-only Git | `@smol` or `@task` when diagnostics need reasoning; GateReport is host-normalized (`runtime.ts:591-627`) | Reports `checks[]`/`violations[]`/`evidenceTail`/`tool`/`durationMs` to parent; parent persists journal | Spawns **none** | **terminal** |
| 7 | `workflowz-security-reviewer` | Inspect safety/trust/policy boundaries — command severity, gate trust state, contentHash, prerequisite availability | `read`/`search`, security tools (`gate.ts` classifier, `fallow`), `GateReport` | `@task` (security reasoning) | Validates `GateFileV1.trust`/`contentHash`/`prerequisites` before approving gate promotion; advisory, never marks deterministic gate passed alone (§7#9) | Spawns **none** | **terminal** |
| 8 | `workflowz-backlog-steward` | Maintain task/doc/AC/DoD/readiness metadata; validate artifact linkage fields before durable writes | **Backlog operations only** (`artifact_record` path): task/document read/create/update, `definitionOfDone`, labels/deps/refs/docs/`modifiedFiles` — **no** code `edit`/`exec` | `@smol` (mechanical) | Owns `verifyBacklogArtifact` (`runtime.ts:651-661`) and `omp_workflow_artifact_record` (`p0-tools.ts:170-181`) validation; fail-closed on missing metadata | Spawns **none** | **terminal** |
| 9 | `workflowz-git-steward` | Maintain Git branch/commit state and optional Git-worktree isolation metadata; collect repo evidence | read-only `Git` (`git status/diff/show/worktree list`), `worktree` (`resolveWorktree/cleanWorktree`); coordinator-only commit/integration/push | `@smol` (mechanical) | Owns `verifyGitState` and `omp_workflow_repo_guard`; records `gitBranch`/`gitCommit` into run envelope; worktree isolation never substitutes for Git state (§3D) | Spawns **none** | **terminal** |

**Single writer invariant:** specialists never write durable artifacts or mutate the repo directly — they return a typed `WorkflowHandoffV1`/`GateReport` to their parent (planner/judge/orchestrator), and the parent performs the `artifact_record`/`repo_guard`-gated write (§7B#8 fallback).

### 7C.2 Spawn policy (normative, host-enforced)

- **Who may spawn:** only `workflowz-orchestrator`, `workflowz-planner`, `workflowz-judge`. Rule enforced by `omp_workflow_spawn_guard` before allocating an `agent()` handle. Attempt from a terminal profile is rejected `WORKFLOW_SPAWN_FORBIDDEN` and journals a GateReport-style violation.
- **Fan-out caps:** Orchestrator ≤ **8** concurrent live children; Planner ≤ **4**; Judge ≤ **4**. Caps are per-parent live-children count (Hub roster), not total creations; exceeding cap blocks with `WORKFLOW_SPAWN_FANOUT_EXCEEDED` until a slot frees. Config is a host constant (not model-tunable), layered over native OMP `spawn`/`recursion` policy which remains enabled.
- **Depth cap:** workflow depth = **1** — root orchestrator (depth 0) may spawn children (depth 1); children may not spawn grandchildren. Planner/Judge children are terminal assessors. This matches §9 "Profiles/spawn: depth is one" and the opencode-orchestrator depth-hierarchy precedent (terminal-node guard, centralized depth constants).
- **Specialists terminal:** `workflowz-researcher`, `workflowz-implementer`, `workflowz-verifier`, `workflowz-security-reviewer`, `workflowz-backlog-steward`, `workflowz-git-steward` are leaf nodes; any `agent()` call from them is rejected by the same guard.
- **Allowed child profiles (enforced allowlist):** Orchestrator → `{planner, judge, researcher, verifier, backlog-steward, git-steward, security-reviewer, implementer}`; Planner → `{researcher, backlog-steward, git-steward, verifier}`; Judge → `{verifier, security-reviewer, researcher}`. Out-of-allowlist child is rejected before spawn.
- **Spawn modes:** `normal` (awaited), `background` (detached), `parallel` (bounded fan-out). All three are validated by the same guard for role/fan-out/depth before issuance.

### 7C.3 Spawn modes — typed contracts and bounded behavior

#### Mode `normal` (awaited)

```
orchestrator --normal--> child {prompt: rendered task.setup+"\n\n"+task.prompt, agent: "workflowz-*", label:"workflow:<name>:<stage>:<task>", schema: <TSchema>}
child returns WorkflowHandoffV1 (see §7D) synchronously; orchestrator validates schema, AC/DoD/evidence completeness, then records journal event.
Failure: child returns {status:"failed", reason, gateReports?, handoff?}; host retry policy (§7D health) decides one bounded retry before escalation. Never blocks on unbounded wait — `normal` has an explicit turn/Git phase timeout gated via `gate.timeoutMs` (default 120s, max 600s per runtime.ts:64).
```

#### Mode `background`

```
handle = await agent(prompt, {agent:"workflowz-*", label, schema, handle:true})
→ Hub registers child ID (AgentRegistry: id→session, status "running", parentId) per registry/agent-registry.ts
→ hook `agent_start` initializes heartbeat/operation budget (see §7D)
→ parent may continue; explicit `join(handle, {timeoutMs, pollMs})` awaits Typed `AgentResultV1`:
  AgentResultV1 = { childId:string, parentRunId:string, handoff?:WorkflowHandoffV1, gateReports?:GateReport[], status:"completed"|"failed"|"stopped", reason?:string, artifacts?:{path,contentHash}[], startedAt:string, endedAt?:string }
Bounded join: default timeout = slowest gate `timeoutMs` sum + 30s slack; on expiry parent runs inspect→peek→steer (§7D). Failure: child `stopped`/`failed` is persisted as journal `gate`/`failed` event; parent decides retry vs escalate.
```

#### Mode `parallel` (bounded fan-out)

```
await parallel([
  async () => ["a", await agent(handoffA, {agent:"workflowz-verifier", ...})],
  async () => ["b", await agent(handoffB, {agent:"workflowz-researcher", ...})],
])
Host wrapper enforces `limit = parentCap - liveChildren` (Orchestrator 8, Planner/Judge 4) by chunking; `failFast:false` → collect all results then let Judge synthesize; `failFast:true` → stop launching further chunks after first failure (see §7B#7), but in-flight agents remain indeterminate until peek/stall timeout.
Typed result: ParallelResultV1 = { parentRunId:string, mode:"parallel", limit:number, failFast:boolean, operations: Map<operationId, {status, handoff?, gateReport?, error?}>, fanOut:number, durationMs:number }
Failure: partial-failure is not hidden — `operations` carries per-child GateReport/violations; orchestrator journals one event per operation (operationId) and may retry only the failed subset (same input hash) with bounded retry count (see §7D retry).
```

**Handoff/result contract (shared across modes):** every child handoff is `WorkflowHandoffV1` (defined §7D.5) — `{from, to, parentRunId, taskId, documentId, artifactRefs[], contentHashes, inputs, resultsSchema, gateReports[], changedFiles[], gitBranch,gitCommit, operationIds[], status, reason}`. An invalid handoff (missing `taskId`/hash/schema mismatch) is rejected and the parent journals `handoff_invalid` without claiming artifact creation.

### 7C.4 Just-backed code-only chains — artifact/repo readiness and verification sequences

`just` is the project command runner and the default deterministic-gate entrypoint. Chains are compositions of host tools (typed, allowlisted, execFile-style) that **do not require an eval cell** — they run through `omp_workflow_just_list` / `omp_workflow_just_run` plus sibling host tools (`omp_workflow_backlog_record`, `omp_workflow_repo_guard`, `omp_workflow_fallow_audit`, `omp_workflow_lsp_diagnostics`, `omp_workflow_gate_report`). The runtime consults `runtime.ts:676-686` `listJustRecipes`/`runJustRecipe` helpers for discovery/execution and `runtime.ts:581-589` `argvFromGate` substitution with `directiveBlockReason` safety classification.

**Real justfile recipe map (as shipped):**

| Recipe (ground truth) | Command | Evidence |
|---|---|---|
| `default` | `@just --list` (print available recipes) | `justfile:5-6` |
| `check` | `bun run check` (tsc --noEmit) | `justfile:9-10` |
| `test` | `bun test test/` | `justfile:13-14` |
| `verify` | `check test` + `echo "✓ all gates passed — ok to push/merge"` (pre-merge gate) | `justfile:17-19` |
| `smoke` | `bun test test/smoke-plugins.test.ts` (faster subset) | `justfile:22-23` |

Other named steps (Backlog/Git/Fallow/LSP/frontmatter) are toolchain invocations via their own host tools, not just recipes, unless a just wrapper is later added (marked `to-create`).

| Chain | Deterministic steps (typed host tools) | Owner profile(s) | Maps to shipped `just` recipe | Status |
|---|---|---|---|---|
| `artifact-ready` | `omp_workflow_backlog_record` verifies `{taskId,documentId,artifactKind,path,acceptanceCriteria,definitionOfDone,type,priority,status,labels,dependencies,references,documentation,modifiedFiles}` (§3D, `p0-tools.ts:170-181`/`runtime.ts:651-661`) → frontmatter/schema (`^---\n…\n---`) → references → AC+DoD completeness → GateReport `artifact-ready` (`runtime.ts:651-661`) | `workflowz-backlog-steward` (parent orchestrator records) | No single just recipe; Backlog host tool (code-only) | **shipped** (p0-tool) |
| `repo-ready` | `omp_workflow_repo_guard` → `verifyGitState` → `git status`/`git log --oneline` → `gitBranch`/`gitCommit` resolution → optional `resolveWorktree`/`cleanWorktree` (native Git worktree, when selected) → `runStatus` cross-check → GateReport `repo-ready` | `workflowz-git-steward` | No just recipe (Git host tool) | **shipped** (p0-tool + worktree) |
| `verify-local` | `omp_workflow_just_run{recipe:"check"}` → `omp_workflow_just_run{recipe:"test"}` → collect `GateReport` per item (one `check` per file/test group per §3B) → `validateOutputs` when `workflow.outputs` present (`runtime.ts:638-646`) | `workflowz-verifier` | `check` + `test` (each distinct) → together equivalent to local verify | **shipped** (just `check`+`test`) |
| `verify-premerge` | `omp_workflow_just_run{recipe:"verify"}` (= `check test`) → `omp_workflow_fallow_audit` (audit JSON, verdict/exit mapping) → `verifyGitState` evidence → aggregate GateReport `verify-premerge` | `workflowz-verifier` + `workflowz-git-steward` | `verify` (`just verify`) | **shipped** (`just verify`); Fallow adapter researched (§4.3 verifier matrix) — probes `fallow audit --format json --quiet` / `fallow schema` |
| `review-loop` | Planner handoff → `workflowz-implementer` change → `omp_workflow_just_run{recipe:"verify"}` → `workflowz-judge` evaluates GateReport → bounded same-session repair (`runtime.ts:452-464` repair loop, `retries≤8`) → repeat until pass or retry exhaustion | Orchestrator / `workflowz-planner` / `workflowz-judge` / `workflowz-implementer` / `workflowz-verifier` | `verify` (inside loop) | **shipped** primitive (gate retries); chain wiring is skill-governed (§3F gate map) |
| `research-ready` | Backlog spike/doc existence (`artifact_record` read) → source evidence (`read`/`ctx_search`) → structured report with file:line citations → `Backlog document update` → GateReport `research-ready` | `workflowz-researcher` + `workflowz-backlog-steward` | No just recipe (host+search tools) | **shipped** (Backlog doc host tool); requires §3D contract |
| `release-ready` | `backlog readiness/dependencies` check → `omp_workflow_just_run{recipe:"verify"}` → `git diff`/`gitCommit`/`DCO` evidence (`verifyGitState` + `runJustRecipe` refs) → GateReport `release-ready` | `workflowz-git-steward` + `workflowz-judge` | `verify` + Git evidence | **shipped** partially; DCO/gitCommit push prerequisites are Git evidence, not a just recipe |

**To-create (not shipped) just wrappers:** if an operator prefers a single `just` entrypoint for chain steps that today are separate host tools, create wrappers `backlog-check`, `git-ready`, `fallow-health`, `lsp-check`, `frontmatter-check` in `justfile` that delegate to the respective adapter without shell interpolation (argv allowlist). Until they exist, the chain's step refers to the host tool, and `omp_workflow_just_run` requesting that recipe returns `WORKFLOW_MISSING_TOOL` → visible `missing_tool_failure` (`runtime.ts:1251` category) and fail-closed unless the step is marked `optional`.

### 7C.5 Typed host tools (code-only; eval-cell not required)

| Tool | Typed inputs (zod) | GateReport capture | Allowlist / rejection policy | Works without eval cell |
|---|---|---|---|---|
| `omp_workflow_just_list` | `{cwd}` → `listJustRecipes(cwd, exec)` probes `just --list` / parses recipe names | `GateReport & {recipes?:string[]}` (`runtime.ts:676-680`) — discovery gate | Only `just` binary, no shell string | **yes** — host `pi.exec` |
| `omp_workflow_just_run` | `{recipe:string, args?:string[]}` → `runJustRecipe(cwd, recipe, args, exec)` (`runtime.ts:682-686`) validates `recipe` against discovered allowlist; `args` are argv-array, not shell-interpolated | `GateReport` with `evidenceTail/stdout/stderr/exitCode/durationMs/tool` (`runtime.ts:618-626`) | Rejects arbitrary shell strings: `directiveBlockReason` (`runtime.ts:35-39` metachar `;|&$`<{}`) + `classify` severity; unknown recipe → `WORKFLOW_UNKNOWN_RECIPE`; metachar-char string → `WORKFLOW_COMMAND_REJECTED` | **yes** |
| `omp_workflow_backlog_record` | `{taskId,documentId?,artifactKind,path,acceptanceCriteria[],definitionOfDone[],type,priority,status,labels[],dependencies[],references[],documentation[],modifiedFiles[]}` (`p0-tools.ts:171-174`) then `verifyBacklogArtifact` | `GateReport` `artifact-ready` (`runtime.ts:651-661`) | Rejects incomplete metadata (`p0-tools.ts:178`); no markdown-file edit allowed | **yes** |
| `omp_workflow_repo_guard` / `verifyGitState` | `{cwd}` → root, porcelain status, branch, and `HEAD` probes | `GateReport` `repo-ready` | Rejects detached or unresolved Git state; workers never push or mutate `main` | **yes** |
| `omp_workflow_fallow_audit` | `{scope}` → `fallow audit --format json --quiet` + `fallow schema` manifest (`§4 Verifier matrix`) | `GateReport` with `verdict/kind/schema_version` JSON artifact | `fallow` binary only; exit `0/1` normal, `2/7/8` infrastructure | **yes** |
| `omp_workflow_lsp_diagnostics` | `{root, language, files[]}` → spawn `rust-analyzer|gopls|pyright-langserver|typescript-language-server` over stdio, `initialize→didOpen→publishDiagnostics`, severity 1-4 normalization | `GateReport` with one `check` per diagnostic | `executable+args` allowlist; timeout/cancel bounded (`timeoutMs≤600s`) | **yes** |
| `omp_workflow_gate_report` | `{runId, stageId, gateId, report:GateReport}` → `appendRunEvent` (`runtime.ts:111-117` path) | Persists `GateReport` (checks/violations/evidenceTail/tool/version/duration) into journal (`0700` dir, `0600` file) | Validates `GateReport` schema — per-item `check` + bounded output required; boolean-only rejected | **yes** |

All seven tools share the shard safety envelope: `execFile`-style `executable`+`args` is the default boundary, raw `command` is a separate explicitly classified `shell` kind (§3B, `runtime.ts:35-39,581-589,615-636`), and `pix-skills` `buildRules`/`classify` severity (critical/dangerous/risky) is reused before execution. They are host-registered via `pi.registerTool` (`p0-tools.ts:44-46`) and usable from the orchestrator's monitor loop without an eval `agent()` session.

### 7C.6 OMP discovery/spawn policy and online deterministic-orchestration precedents (normative references)

- **`omp://task-agent-discovery.md`:** profile shape `{name, description, tools[], spawns, model, thinkingLevel, blocking, prewalk}` (`src/task/agents.ts` AgentFrontmatter) — workflowz profiles use the same shape under `agents/workflowz-*.md`; `spawns` field encodes the allowlist (Planner/Judge show `spawns:"workflowz-researcher,workflowz-verifier,workflowz-backlog-steward,workflowz-git-steward"`); `model` uses selectors `"@task"`/`"@smol"` (no per-task `tools/skills` array because eval `agent()` surface lacks it — §7#2). The host's spawn guard consults the emitting profile's `spawns` to reject out-of-allowlist children, consistent with the file-proven agent registry.
- **Microsoft Conductor** — *Deterministic orchestration for multi-agent AI workflows* ([Conductor](https://opensource.microsoft.com/blog/2026/05/14/conductor-deterministic-orchestration-for-multi-agent-ai-workflows/)): separates deterministic script steps from model nodes, supports explicit parallel failure modes, human gates, dry-run validation, zero-token routing. Workflowz chains reuse this layering: script-owned Just/GateReport steps (zero-token when replayed from journal) plus bounded agent nodes under deterministic spawn/join rules — not an imported runtime.
- **GitHub gh-aw (Agentic Workflows)** — *Deterministic Actions + agent reasoning* ([gh-aw](https://github.github.com/gh-aw/)): read-only/sandboxed default jobs, compiled/validated workflows, constrained safe outputs, hard run budgets. Workflowz adopts the same compiler-stage validation (WorkflowRouteV1 validates recipe IDs/inputs/resultRefs/depth/cycles before render — `p0-tools.ts:223-246` `omp_workflow_route`) and safe-output typing (`WorkflowHandoffV1`/`OrchestratorRunResultV1`).
- **OpenCode orchestrator depth hierarchy** — *5.5 Agent spawning and depth hierarchy* ([DeepWiki](https://deepwiki.com/agnusdei1207/opencode-orchestrator/5.5-agent-spawning-and-depth-hierarchy)): terminal-node guards, centralized `MAX_DEPTH` constant, structured delegation errors, per-role concurrency limits. Workflowz mirrors this with depth=1 terminal specialists, centralized cap constants (Orchestrator 8, Planner/Judge 4), and `WORKFLOW_SPAWN_*` structured errors that never silently become retries.

Precedents are design-rationale references, not implementation dependencies. Any OMP-discovery mismatch (e.g. a distro that does not expose `spawns`) degrades to the prompt-embedded allowlist checked by `omp_workflow_spawn_guard` as well as the routing validation in `omp_workflow_route`.

### 7C.7 Linkage and non-claim

This freeze is linked from the TOC and referenced from parent TASK-15 (#22). It does not claim runtime implementation is complete — P0 engine work (§8 P0 — engine) must implement `omp_workflow_spawn_guard`, the seven host tools, `operationId`-bearing render, and GateReport persistence before this roster/chains text becomes executable. The Backlog task for this freeze is tracked under TASK-15.7.


## 7D. Orchestrator skill and Hook/Hub watchdog control plane (TASK-15.8 freeze 2026-08-22)

> **Scope:** This section freezes TASK-15.8. It is a docs/design record only; it does not claim runtime implementation is complete. It defines the `/workflows` slash-command bootstrap as a durable orchestrator skill/runbook, the parent HookAPI lifecycle map, the Hub-backed `omp_workflow_agent_control` surface, deterministic health/heartbeat/retry-stop policy, the typed `OrchestratorRunResultV1`/`WorkflowHandoffV1` contracts, and the child-sessions-without-extensions handling. Grounding is the shipped P0 runtime (`runtime.ts`, `p0-tools.ts`), the existing `justfile` recipe set, Backlog/Git governance (§3D), and OMP core surfaces `omp://hooks.md`, `omp://agent-hub.md`, `omp://task-agent-discovery.md`, `omp://session.md`, `omp://extensions.md`. This section appends to §§3F-3G and links from TOC; §§3A-5/6/8 remain untouched. Parent: TASK-15 (#24). Precedents: Conductor / gh-aw / opencode-orchestrator (§7C.6).

### 7D.1 Slash-command bootstrap — durable orchestrator skill/runbook

**Entry:** the extension registers **one** `/workflows` command via ExtensionAPI `registerCommand` with `getArgumentCompletions(argumentPrefix)` (see §3A, `§4.3` installer: `p0-tools.ts:44-46` `pi.registerTool` pattern and §6 command surface). Invocation `/workflows <request>` (natural-language) or `/workflows run|chain|list|status|resume|retry|stop …` concatenates the existing prefix before completion; nested completions never discard already-entered subcommands (`§3A`).

**Bootstrap:** the command handler does **not** route inline. It first builds the durable skill artifact, then prompts `workflowz-orchestrator`:

1. **Discover & load skill text:** read Backlog-linked `skill:omp-workflow-orchestrator` artifact (path `~/.omp/agent/skills/omp-workflow-orchestrator.md` or project `.omp/workflows/skills/omp-workflow-orchestrator.md` when project-scoped). If absent, the handler fails closed with `WORKFLOW_SKILL_MISSING` and shows creation guidance — it never falls back to generic Workflowz instructions.

2. **Inject run-bound context into prompt:** the skill body plus a run-bound block:

```
// injected header (not persisted as skill)
MISSION: <user request verbatim, truncated 4k>
CONSTRAINTS: <target project cwd, owner taskId/documentId per §3D, Git worktree/change/gitCommit per §3D, budget ledger caps per §7B#3>
ROUTE_CANDIDATE: <WorkflowRouteV1 JSON awaiting validation — §3A/§4>
CHAIN_RULES: §7D.2 below
GATE_MAP: §7D.3 below
PROFILE/SPAWN POLICY: §7C.2 (Orchestrator 8, Planner/Judge 4, depth 1, terminal specialists) + allowed child allowlist
MONITOR CONTRACT: §7D.4 + §7D.5 health/heartbeat + `omp_workflow_agent_control` operations
COMPLETION CONTRACT: OrchestratorRunResultV1 schema (§7D.6)
GOVERNANCE: Backlog artifact envelope + Git envelope from §3D — "every durable write requires artifact_record; every mutation requires repo_guard"
```

3. **Skill/runbook sections (durable artifact `SKILL.md` frontmatter + body):**

| § | Title | Normative content |
|---|---|---|
| 7D.1.1 | **Mission & inputs** | Echo user request, declared constraints (cwd, Backlog owner `task-*`/`doc-*`, Git worktree, `just --list` discovery result), requested outputs schema, and explicit non-goals (no implicit authoring of new recipes/gates during routing — §9 entry point). The skill restates the whole run as a single `OrchestratorRun` identity (`runId` UUID `runtime.ts:511-517`). |
| 7D.1.2 | **Backlog/Git/Just discovery checklist (pre-routing, must pass before any chain launches)** | `omp_workflow_backlog_record` existence/readiness → AC/DoD/labels/dependencies/readiness + `modifiedFiles` presence (§3D, `runtime.ts:651-661`); `omp_workflow_repo_guard` → Git availability/`git status`/`gitBranch`/`gitCommit` (`runtime.ts:663-674`) + optional `resolveWorktree`; `just_list` → `listJustRecipes` (`runtime.ts:676-680`, `justfile:5-23` recipes `check/test/verify/smoke`); verifier adapter probe (`probeAdapterHealth` per §4 matrix); `WorkflowRouteV1` catalog availability (`listWorkflowDefinitions`); active agents roster (`AgentRegistry` per `registry/agent-registry.ts`). Each item journals a `discovery` event with GateReport evidence; any hard item missing fails closed before routing. |
| 7D.1.3 | **Route & chain rules** | Choose exactly one `WorkflowRouteV1` (`mode:"direct"|"chain"`, `steps:[{workflow,inputs,resultRef}]`, `gates`, `approval`) per §3A — validate `recipeIds`, typed `inputs` via `resolveDefinitionInputs` (`runtime.ts:319-329`), namespaced `resultRef` existence (no forward refs), maxDepth (`steps.length≤maxDepth` default 4), cycle detection (no repeated workflow id with overlapping inputs unless chained result justifies), gate references existence+trust (`GateFileV1.trust`), approval mode (`required` for mutating, `auto` only for read-only per §3C), missing/untrusted prerequisite handling. Chains are acyclic ordered composition of existing recipes; each child renders to native primitives (§3A) and reports namespaced results — no second engine. |
| 7D.1.4 | **Gate map** | Executed in order with explicit continue/repair/escalate per gate: `artifact-ready` (§7C.4) → `repo-ready` (§7C.4) → `route validation` (`omp_workflow_route` 223-246) → `route approval` (`omp_workflow_checkpoint` with `auto` policy §7B#5) → `mutation approval` (Git guard + worktree consent) → code-only chains `verify-local`→`verify-premerge`→`fallow/lsp` (adapters per §4 matrix) → Judge GateReport evaluation (`workflowz-judge`) → `Backlog/Git finalization` (`artifact_record`+`repo_guard` + `report complete` with `validateOutputs` 638-646). Each gate node states what evidence permits continuation vs. same-session repair vs. user escalation; repair loops are bounded `retries≤8` (`runtime.ts:64`) and budget-capped (see §7B#3). |
| 7D.1.5 | **Profile/spawn policy (restated)** | Nine `workflowz-*` profiles allowed (§7C.1); only Orchestrator, Planner, Judge may spawn; caps Orchestrator 8 / Planner,Judge 4 / depth 1 / specialists terminal (§7C.2); `omp_workflow_spawn_guard` enforces allowlist + caps + depth before `agent()` allocation; native OMP `spawns`/`recursion` policy remains layered underneath. |
| 7D.1.6 | **Monitor loop** | The orchestrator owns a host-driven monitor (not model-poll-driven) that runs on `ctx.setInterval`/`setTimeout` lifecycle-safe timers (§6). It polls `omp_workflow_agent_control{op:"inspect"|"peek"}` at heartbeat intervals (§7D.4 thresholds), classifies health (§7D.5), and may `steer`/`stop`/`retry` via Hub without waiting for a child ping (§3G, §7D.3). |
| 7D.1.7 | **Continuation / escalation logic** | Valid `WorkflowHandoffV1` + all required gates `passed`/`advisory` → Judge decides `continue` (chain next recipe when `inputs` contract satisfied + depth/cycle checks) else `finalize`. Gate `failed` with `repairable` → bounded same-session repair (`runtime.ts:452-464`) then re-gate. `stopped`/`budget_exhausted`/`cancelled` → no auto-continuation. `tool_error`/`blocked`/`stalled` beyond thresholds → `steer` → `retry` (bounded) → `stop` → escalate with visible reason. Every decision journals `continuation {decision, gateId, handoffStatus, gitBranch, backlogRefs}` and shows a card/toast. |
| 7D.1.8 | **Typed completion contract** | Return `OrchestratorRunResultV1` (`§7D.6`) — never free-form text; `report complete` (`p0-tools.ts:76-98`) validates `workflow.outputs` via `validateOutputs` and journals `completed`|`failed`|`stopped`|`budget_exhausted` terminal status (`runtime.ts:749,1019,1251`). Partial or indeterminate runs return the same typed envelope with `status:"failed"|"stopped"` and explicit `nextAction: "resume"|"retry"|"revise inputs"|"escalate"` plus resume pointers. |

The skill artifact is Backlog-linked (`taskId:"TASK-15"`, `kind:"skill"`, `path:"…/skills/omp-workflow-orchestrator.md"`, `contentHash` of file) before it can be used by an agent; `omp_workflow_artifact_record` blocks a skill without an owner (see §3D). The command handler injects the skill text; it does not rely on a child extension hook or recipe description to supply these decisions.

### 7D.2 Hook mapping — all lifecycle and tool hooks (fail-closed policy handlers)

Hooks are registered through `ExtensionAPI.registerHook` / `HookAPI` (see `capability/hook.ts` shape, `internal-urls/agent-protocol.ts` artifact surface). Each handler is idempotent, namespaced, and returns `{proceed:true}|{proceed:false, reason, code}` so the host can enforce fail-closed behavior. Parent hooks remain authoritative when a child session does not load extension modules (§7D.7).

| # | OMP hook / event | When it fires | Workflowz action (host handler) | Fail-closed policy |
|---|---|---|---|---|
| 1 | `before_agent_start` | Engine schedules any agent turn (orchestrator or child) | Inject the durable orchestrator skill block (7D.1 header + run envelope: `runId, routeHash, sessionId, taskId/documentId, gitBranch/gitCommit, profile limits`), bound catalog notice (≤8 KiB, per `before_agent_start` existing catalog injection §6). Tag the turn with `workflowz.runId`. | If skill artifact missing/unverified (`contentHash` mismatch or Backlog owner absent), block turn with `WORKFLOW_SKILL_UNAVAILABLE` and show recovery hint. Never run ungoverned. |
| 2 | `agent_start` | Child (or orchestrator) session actually starts | Register `{childId, parentRunId, profileName, spawnMode, handle, startedAt, operationId}` in host monitor table; initialize heartbeat deadline (`now + HEARTBEAT_TIMEOUT_MS` §7D.4), operation budget (`launchesRemaining`, `timeRemaining`), and `lastActivity=now`. Record parent→child lineage for Hub projection. | Reject start that violates spawn policy (§7C.2) before registration (`WORKFLOW_SPAWN_FORBIDDEN` / `WORKFLOW_FANOUT_EXCEEDED` / `WORKFLOW_DEPTH_EXCEEDED`). |
| 3a | `turn_start` | Each LLM turn begins | Update `child.lastActivity=now`, bump `turnCount`, capture `modelRole`/`resolvedModel`, reset stall timer. | Advisory only; no fail-closed block. |
| 3b | `turn_end` | Each LLM turn ends | Update `progress` (usage tokens/cost if exposed), `lastActivity`, `handoffPhase` (planning | implementing | verifying | awaiting_gate), and schedule next heartbeat check. Persists incremental transcript size for peek cursor tracking (`history://<id>` byte offset). | Advisory only; drift cannot block. |
| 4a | `tool_call` | Before any tool executes (`pi.exec`, `agent()`, `read`/`write`, Backlog/Git/Just) | **Policy gate:** block (return `isError:true` without executing) when (a) forbidden direct Backlog markdown edits (`*.md` under `backlog/`) — must use `omp_workflow_artifact_record`; (b) forbidden Git mutations (`git commit|branch|push`) for workflow-owned changes (§3D) — must use Git; (c) `tool.bash({command})` contains shell metachars or disallowed `executable` (`directiveBlockReason` `runtime.ts:35-39`); (d) `agent()` spawn from terminal profile or exceed fan-out/depth/allowlist (§7C.2); (e) `omp_workflow_just_run` with unknown recipe or `args` containing shell string. On allow, attach `operationId` and ledger reservation. | **Fail-closed:** blocked call returns `fail("blocked by workflowz policy: <code> — <reason>", {code:"WORKFLOW_TOOL_BLOCKED", tool, reason})` with visible transcript rendering via `renderCall/renderResult` (§6). Orchestrator's monitor sees the block as `tool_error`/`blocked` health (§7D.5) and may `steer`. Never silently downgrade to allow. |
| 4b | `tool_result` | After tool returns | **Evidence capture:** normalize and journal `GateReport` fragments (Just exit, Fallow JSON, LSP diagnostics, `validateOutputs` violations), classify error for health machine (success | `tool_error` when `isError`+retryable vs `blocked` when policy-blocked). Bump `lastActivity`, attach `evidenceHash` to report, route `outputValidation failed` (`p0-tools.ts:83-87`) to `failed` health. | Capture never blocks; classification feeds §7D.5 escalation deterministically. |
| 5 | `agent_end` | Child (or orchestrator) finishes with a structured result | Validate returned `WorkflowHandoffV1` schema + AC/DoD backing (`taskId` task view via Backlog), `contentHash` equality for artifact paths, `gitBranch` liveness (optional `verifyGitState` ping). Persist outcome `{childId, parentRunId, profile, handoff, gateReports, artifactRefs, gitBranch/gitCommit, status, durationMs}` into journal; trigger Judge/next-chain continuation (§7D.1.7). | On `handoff_invalid` (missing required refs/hash mismatch/schema error) mark journal `handoff_invalid` and show `WORKFLOW_HANDOFF_INVALID: <field>`; do not record artifact/Git completion. Require repair/`retry` — never auto-promote invalid handoff. |
| 6a | `session_start` | Engine loads (or reloads) a session | Restore snapshot pointer from `sessionManager.getBranch()` (see §3C): find latest `ezxomp.workflowz.checkpoint {runId, routeHash, sessionId, stageId, gateId, state, journalPath, artifactRefs}` and reconcile with authoritative journal `readRunEvents`/`runStatus` (`runtime.ts:535-548,550-555`). Show `resume_available` badge when journal is ahead of snapshot. | If snapshot hash mismatches journal (`contentHash` diverged `runtime.ts:258,870-871`) or `runId` not found, show `WORKFLOW_SESSION_DIVERGED` and require explicit `resume`/`retry` with reason; never treat snapshot presence as proof of external work completion (§7#11). |
| 6b | `session_tree` | User/session-layer switches branch/tree view | Same reconciliation as `session_start` across branches; invalidate active-run widget when current leaf has no `runId` association. Advisory. | Advisory; no blocking. |
| 7 | `session_shutdown` | Session disposing (quit/signal/test teardown) | Mark all active children `interrupted` with `reason:session_shutdown`, persist resume pointers `{runId, parentRunId, lastStageId, lastGateId, operationIds}` via `appendRunEvent(event:"interrupted", status:"interrupted")`, flush `WorkflowRunOverlay` state, never claim completion. Honor `SHUTDOWN_CONSOLIDATE_BUDGET_MS`=1500 ms and `drainTimeoutMs` window per `session/agent-session-types.ts`. | **Fail-closed:** any active run stays `running`→`interrupted`; status queries after shutdown return `interrupted` with explicit `resume`/`retry` pointers. Never journal `completed`. |

All handlers log via `pi.logger` at `debug`/`warn` and use bounded `capNoticeBytes` (`plugins/extensible-workflows/src/workflows-overlay.ts:66-78` pattern) when surfacing catalog/evidence to avoid context bloat.

### 7D.3 `omp_workflow_agent_control` — Hub/history/agent surface with actor/reason/permission logging

`omp_workflow_agent_control` is the **single** workflow-scoped entrypoint the orchestrator uses to supervise children. It wraps public OMP Hub/host/artifact APIs and enforces permission checks before acting. It is **not** a raw `hub`/`history://` passthrough.

**Registration:** `pi.registerTool("omp_workflow_agent_control")` with zod params `{runId, op, childId?, cursor?, limit?, steerText?, reason, actor}` where `op ∈ {inspect, peek, steer, stop, retry}`, `reason` is a non-empty string (≥8 chars) explaining the supervisory intent, and `actor` is `{profile:"workflowz-orchestrator"|"workflowz-judge", sessionId, agentLabel}` resolved from ExtensionContext. Every invocation is audited.

**Tool discipline (`ctx:ExtensionContext`):**

```ts
type ControlOp = "inspect" | "peek" | "steer" | "stop" | "retry";
type ControlParams = {
  runId: string;          // owning workflow run (JournalEvent.runId)
  op: ControlOp;
  childId?: string;       // required for all ops except list-style inspect w/o childId
  cursor?: number;        // peek byte offset
  limit?: number;         // peek byte cap (default 8k, max 32k)
  steerText?: string;     // required for steer
  reason: string;         // supervisory justification
  // actor derived from context + caller label
};
type ControlResult = { ok:boolean, op:ControlOp, childId?:string, data?:unknown, audit:AuditRef, isError?:boolean };
type AuditRef = { actor:{profile:string, sessionId:string}, reason:string, childId:string, parentRunId:string, backlogRefs?:{taskId:string,documentId?:string}, gitRefs?:{branch:string,commit:string}, ts:string };
```

**Per-op specification:**

| Op | Underlying OMP surface | What the handler does | Data returned (bounded) | Permission check | Audit |
|---|---|---|---|---|---|
| `inspect` | `AgentRegistry` (`registry/agent-registry.ts`: `AgentRef {id,status,parentId,session,lastActivity,history:{metrics,outputPath}}`) + `SessionObserverRegistry` + `AgentHubProjection` (`modes/components/agent-hub-projection.ts`) | Look up child in registry; snapshot `status` (`running|idle|parked|aborted`), `parentId`, `lastActivity`, `activity` gist, current tool+args when `running`, `history.metrics{ tokens,requests,tools,cost,durationMs }`, `outputPath`/`patchPath` when set, `runDir`/`worktreeName`/`gitBranch`/`routeRef` from journal. With `childId` omitted, returns roster of children under `runId` (parent run → childId list from journal `operationId` index). | `{childId, parentRunId, status, lastActivity, activity?, currentTool?, metrics?, outputPath?, patchPath?, worktree?, gitBranch?, gitCommit?, backlogRefs?}` — truncated per `visibleWidth` (`modes/components/agent-hub-renderer.ts`) | Caller must be `workflowz-orchestrator` or `workflowz-judge` that owns `parentRunId` (parent check) | Appends `WorkflowControlAudit` event to journal (`event:"control", op:"inspect", actor, reason, childId, parentRunId, ...backlog/Git refs`) |
| `peek` | `history://<id>` (live JSONL transcript tail + `getBranch`/`getEntry`) + `agent://<id>` (saved structured output, `internal-urls/agent-protocol.ts` `AgentProtocolHandler` with `agent://<id>` / `agent://<id>/<child>` / `agent://<id>?q=<jq>` semantics) + `AgentHubRemoteTranscript` (`agent-hub.ts:AgentHubRemoteTranscript`) | Reads transcript incrementally: `history://<id>?fromByte=<cursor>` semantics (complete JSONL lines only, `newSize` as next cursor) plus `agent://<id>` structured `WorkflowHandoffV1` when available. Caps output to `limit` (default 8k, max 32k); notes extraction when jq path `?q=` is used. | `{childId, cursor, nextCursor:number, text:string, truncated:boolean, error?:string, handoffStatus?:string, lastLines:string[]}` | Same owner check; `peek` on unrelated run is rejected `WORKFLOW_CONTROL_NOT_OWNED` | Audit same as inspect; peek evidence hash stored in monitor state |
| `steer` | `hub` IRC bus (`IrcBus`, `AgentHubRemote.chat(id,text)`) → `history://` write path (child prompt injection via normal `prompt` path, revives `parked`) | Sends focused steering guidance to `running`|`idle`|`parked` child; text must include the exact `GateReport` violation / `tool_error` payload (not paraphrase) plus a single next step, ≤2k chars; revives `parked` before steering. Uses Hub `chat` / staged `prompt` path, not a raw `hub send` shell. | `{childId, delivered:boolean, revived:boolean, steerSeq:number, nextHeartbeat:string}` | Owner check; `steerText`≥16 chars and must reference a prior GateReport/tool failure hash when `tool_error`/`blocked` health is active; otherwise `WORKFLOW_STEER_UNGROUNDED` rejection (prevents vacuous nudges). | Audit with `reason` + hashed `steerText` (first 200 chars in clear, remainder hash) |
| `stop` | Hub `kill(id)` / `AgentRegistry` abort path (`modes/components/agent-hub.ts` `x` abort+release) + `stopRun` journal (`runtime.ts:557-559` appends `event:"stop",status:"stopped"`) | Aborts/kills the child only when health policy, user request, or governance gate permits (see §7D.5 thresholds); journals `stopped` with `reason` and writes tombstone `.tombstone`. Does not delete evidence — peek/history remain. | `{childId, stopped:boolean, journalEvent:JournalEvent, nextAction:"retry"|"revise"|"escalate"}` | Owner check; plus mandatory `reason` cites health-state escalation (§7D.5) or explicit user `stop`/`checkpoint rejected` authority — otherwise `WORKFLOW_STOP_UNAUTHORIZED` | Full audit; `actor` + `reason` + previous health state + GateReport that triggered stop; logged in journal and `pi.logger.warn` |
| `retry` | `resumeWorkflowRun`/`retryWorkflowRun` helpers (`runtime.ts:861-896, 897-908` family) + new `createRun` with `parentRunId` link and input-hash dedup; re-invokes spawn guard for new child | Creates a bounded retry with **same handoff `inputHash` and same `operationId` base** (append `".retry.N"`), never an untracked duplicate. Shares the parent `runId` chain; inherits `taskId`/`documentId`/`gitBranch`. Enforces retry cap (Judge: ≤3 per gate, Planner: ≤2, Orchestrator: ≤2 per child — see §7D.5), drops if input hash differs (that is a new task, not a retry). | `{retryChildId:string, parentChildId:string, attempt:number, inputHash:string, code:string, runId:string}` | Owner check + `runtime.ts:870-871` contentHash still matches (workflow definition unchanged) + attempt limit remaining; otherwise `WORKFLOW_RETRY_EXHAUSTED` | Audit with attempt number and GateReport that seeded the retry |

**Common enforcement (all ops):**

- **Not elaborate:** `reason` length check (≥8 chars) and `actor` session must match the ExtensionContext's calling agent (no impersonation).
- **Rate-limited:** per-child `inspect`/`peek` at most once per heartbeat interval; burst capped so the model cannot spam Hub reads.
- **Visible:** every successful call writes one `WorkshopControlAudit` journal entry and a debug `pi.logger` line; any rejection returns `fail("Workflow control rejected: <code> — <detail>", {code:"WORKFLOW_CONTROL_REJECTED"})` which surfaces in transcript and monitor health.
- **No raw escape:** direct `hub`/`history://`/`agent://` use by the orchestrator prompt outside this tool is flagged by the `tool_call` hook (§7D.2#4a) as `WORKFLOW_DIRECT_HUB_USE` and steered to use `omp_workflow_agent_control`.

### 7D.4 Deterministic health states, thresholds, and timers

**Health state machine (child agent → single canonical state):**

```
starting ──► running ──► progressing ──► idle ──► completed
               │          │               │
               ├─► blocked (policy block, needs steer) ──► stalled
               ├─► tool_error (isError tool_result, repairable) ──┐
               └─► stalled (no progress ≥ threshold) ──────────────┴─► failed
                                    │                    ▲
                                    └─► stopped (host/user stop) ──► interrupted (session_shutdown)
completed/failed/stopped/interrupted are terminal; failed + exhausted retries → orchestrator escalates.
```

| State |Entered when | Monitor action | Visible rendering |
|---|---|---|---|
| `starting` | `agent_start` registered, no `turn_start` yet | none yet | `run verifier: starting` |
| `running` | `turn_start` or tool in flight | reset heartbeat deadline | `running` + `currentTool` |
| `progressing` | `tool_result` success or `turn_end` with usage bump | update `lastActivity`, heartbeat; clear stall | `progressing` |
| `idle` | Turn ended, no tool in flight, Awaiting next LLM token | `inspect` at `IDLE_POLL_MS=10s` | `idle` |
| `blocked` | `tool_call` blocked by policy (§7D.2#4a) | immediate `peek` then `steer` with the exact block reason hash | `blocked — WORKFLOW_TOOL_BLOCKED: …` |
| `tool_error` | `tool_result` has `isError:true` or `GateReport.passed===false` | `peek` to confirm, then `steer` with that failure | `tool_error — <violations[0]>` |
| `stalled` | `now - lastActivity ≥ STALL_THRESHOLD_MS` (see below) AND no `progressing` transition; also `tool_result` parsing proves no usable output | `inspect`+`peek` to confirm, then escalation path of §7D.5 | `stalled — no progress <duration>` |
| `completed` | `agent_end` with valid `WorkflowHandoffV1` `status:"completed"` | persist handoff, trigger Judge (§7D.1.7) | `completed` + handoff summary |
| `failed` | `agent_end` with `status:"failed"` OR `GateReport` terminal failure despite retries | persist failure, no auto-continuation | `failed — <reason>` |
| `stopped` | `omp_workflow_agent_control stop` or `session_shutdown` | journal `stopped`/`interrupted`, expose `resume`/`retry` pointers | `stopped — <reason>` |

**Deterministic thresholds (host constants, not model-tunable):**

- `HEARTBEAT_TIMEOUT_MS = 30_000` — expected heartbeat (any `turn_end`/`tool_result`/`progress`) from `running`/`progressing`; missed heartbeat triggers `inspect` then (after `STALL_THRESHOLD_MS`) `stalled`.
- `IDLE_POLL_MS = 10_000` — polling cadence for `idle` children (inspect) before considering steer.
- `STALL_THRESHOLD_MS = 60_000` — no-progress tripwire to `stalled` (`runtime.ts` gate `timeoutMs` default 120s is independent — stall is agent silence, not gate kill).
- `TOOL_ERROR_GRACE_MS = 15_000` — after entering `tool_error`, host waits one `peek` window before `steer`, so a fast-following model correction is not pre-stolen.
- `BLOCKED_GRACE_MS = 5_000` — `blocked` is steered faster (policy violation is actionable immediately).
- `SHUTDOWN_DRAIN_MS = 5_000` and `SHUTDOWN_CONSOLIDATE_BUDGET_MS = 1_500` per `session/agent-session-types.ts` — included for `session_shutdown` timing; `agent_end` after shutdown maps to `interrupted`.

All values are logged in `inspect` payloads and journal `control` events. Changing them is a docs update to this section, not a prompt tweak.

### 7D.5 Blocked / tool-error / stalled handling and retry/stop escalation

**Per-state handler (deterministic, ordered):**

1. **One failed `tool_result` / gate `failed` → `tool_error`:** `pei_ctrl peek` to confirm the exact `violations[]`/`stderr` tail; when `violations` match deterministic policy (e.g. `exit code 1`), `steer` is sent once with that exact violation string + bounded tail (1 steering per failure). Gate repair loops stay in same session and are bounded by `gate.retries` (`runtime.ts:64` max 8, default per GateFile). Steer text includes `operationId` so the child can correlate.

2. **Policy `blocked` → `blocked`:** immediate `peek` (confirming block code) then single `steer` with `WORKFLOW_TOOL_BLOCKED` code + allowed alternative (`use artifact_record not backlog markdown`, `use Git worktree protocol`, `use just_run recipe not raw shell`). A second consecutive `blocked` after steer escalates: `stop` the child (`reason:" repeated policy block after steer #N"`) → parent re-issues the step via correct tool.

3. **No progress (`now-lastActivity ≥ STALL_THRESHOLD_MS`) → `stalled`:** sequence `inspect` → `peek` (bounded tail) → `steer` with the last known GateReport or `peek` observation (`"no progress <dur>; last tool: <id>; evidence tail: … truncated"`). One `steer` per stall window. Second consecutive stall window (so ~2 minutes total silence) without any `tool_result` → `stop` with `reason:"stalled — no progress after steer"`. A `stopped` child is never auto-retried solely on stall; it requires a new `WorkflowHandoffV1` input.

4. **Retry policy (bounded, never unbounded):**
   - Judge child on a failing gate:≤ **3** retries per `gateId` (same `operationId` base, `attempt` 1..3); counted from journal `attempt` field (`p0-tools.ts:112`/`runtime.ts:132`).
   - Planner child (research/plan failure): ≤ **2** retries.
   - Orchestrator-spawned direct specialist: ≤ **2** retries.
   - Global circuit breaker: in-flight `retry` count across the run ≤ `activeAgents * 2` (prevents retry storms when `failFast:false`). Exhaustion → `WORKFLOW_RETRY_EXHAUSTED` and escalation to user with `GateReport`s. Retries preserve `inputHash` (`contentHash` equality checked via `runtime.ts:870-871`); a changed workflow definition refuses retry.

5. **Stop escalation:** stop is called exactly when (a) health machine says `stop_after_steer` (cases 2-3 above) or retry exhaustion, OR (b) user issued `/workflows stop <runId>` / `omp_workflow_stop` (`p0-tools.ts:157-168`), OR (c) `session_shutdown` path. Stopped children expose `nextAction: "retry"|"revise inputs"|"escalate"` in `OrchestratorRunResultV1`. The orchestrator does not busy-loop polling after stop — it journals `interrupted` and shows resume pointers (`runId`, `parentRunId`, `lastStageId`, `operationIds`).

**Visibility:** every transition (`running→tool_error`, `idle→stalled`, `tool_error→steer`, `stalled→stop`) is one journal `control` event plus one rendered row in transcript via `renderResult` compact gate line (§6). `WorkflowRunOverlay` polls the journal (never model memory) so TUI and CLI agree.

### 7D.6 Typed contracts — `OrchestratorRunResultV1` and `WorkflowHandoffV1` with Backlog/Git/artifact/GateReport references

**`WorkflowHandoffV1`** — typed child → parent result that every terminal specialist and spawnable agent (Planner, Judge children) must return. Rejected when invalid.

```ts
type WorkflowHandoffV1 = {
  schemaVersion: 1;
  from: `workflowz-${string}`;           // emitting profile, e.g. "workflowz-planner"
  to: `workflowz-${string}`;             // receiving parent profile (orchestrator|planner|judge)
  parentRunId: string;                    // owning JournalEvent.runId (UUID, runtime.ts:RUN_ID_RE)
  childId: string;                        // Hub AgentRef.id that produced this handoff
  operationIds: string[];                 // one per operation this handoff closes (operationId dedup runtime.ts:519-531)
  taskId: string;                         // Backlog owner task, e.g. "TASK-15" — must exist (verifyBacklogArtifact 651-661)
  documentId?: string;                    // when artifact is a document
  artifactKind: string;                   // e.g. "plan"|"implementation"|"gate"|"research"|"decision"
  artifactRefs: { path:string, contentHash:string, kind:string, taskId:string, documentId?:string }[]; // mirrors WorkflowArtifactRef runtime.ts:74-76
  status: "completed" | "failed" | "stopped" | "cancelled" | "budget_exhausted";
  reason?: string;
  inputs: Record<string,string>;          // the resolved typed inputs this handoff consumed
  results: Record<string,unknown>;        // typed result values the next step may {{result.*}} into
  gateReports: GateReport[];              // evidence-bearing GateReport[] (one check per item, bounded output, violations, tool/version, durationMs — §3B/§7B#10, runtime.ts:108,591-627)
  changedFiles: string[];                 // modified files for Backlog artifact_record (p0-tools.ts:171 modifiedFiles)
  gitBranch?: string;                      // current branch when repo-touching (verifyGitState)
  gitCommit?: string;
  worktreeName?: string;                  // when isolation was used (resolveWorktree)
  contentHash?: string;                   // workflow definition hash at handoff (runtime.ts:721-730)
};
```

**`OrchestratorRunResultV1`** — final typed completion contract the slash-command orchestration returns (via `agent()` final return + `omp_workflow_report{event:"complete"}` validation `p0-tools.ts:83-87`/`runtime.ts:638-646`).

```ts
type OrchestratorRunResultV1 = {
  schemaVersion: 1;
  runId: string;                          // journal runId (randomUUID runtime.ts:511)
  parentRunId?: string;                   // when resume/retry created this run (runtime.ts:498-501 CreateRunOptions)
  workflow: string;                       // top-level workflow name (or "chain:<names>")
  chain: { steps: {workflow:string, inputs:Record<string,string>, resultRef?:string}[], gateIds:string[], approvalPolicy:string } | null;
  status: "completed"|"failed"|"stopped"|"cancelled"|"budget_exhausted"|"interrupted"; // terminal map runtime.ts:749,1019,1251
  childOutcomes: Array<{
    childId:string, profile:`workflowz-${string}`, handoff: WorkflowHandoffV1|null, gateReports:GateReport[], retries:number, durationMs:number
  }>;
  evidenceRefs: {                        // pointers, not blobs — bounded snapshot
    journalPath:string;                   // e.g. ".omp/workflows/runs/<runId>/journal.jsonl" (0700, runtime.ts:514,528 0600 file)
    artifactRefs: {taskId:string,documentId?:string,path:string,contentHash:string,kind:string}[];
    checkpoint?: { runId:string, status:"approved"|"rejected", routeRef?:string, journalRef?:string, artifactRefs?:string[], sessionId:string, stageId?:string, gateId?:string, entry:"ezxomp.workflowz.checkpoint" }; // p0-tools.ts:132 appendEntry ns
    gateReportArtifacts: string[];        // sessionManager.saveArtifact pointers for large GateReports (§3C)
  };
  backlog: { taskId:string, documentId?:string, readiness: GateReport /* artifact-ready */, recordedAt:string };
  repo:   { gitBranch?:string, gitCommit?:string, gitStatus: GateReport /* repo-ready */, worktreeName?:string };
  gates:  { summary: GateReport[], failed?: string[], optionalSkipped?: string[] };
  nextAction: "none" | "resume" | "retry" | "revise inputs" | "rework gate" | "escalate"; // required
  nextPointers?: { resumeRunId:string, retryParentRunId:string, codeSnippet:string }; // when resume/retry applicable (resumeWorkflowRun 861-896, retryWorkflowRun)
};
```

Both types carry Backlog (`taskId`/`documentId`/`artifactKind`/`path`/`contentHash` + `labels`/`dependencies` provenance), Git (`gitBranch`/`gitCommit`/`worktree`), artifact hashes, and GateReports. Host-side validation (`validateOutputs` `runtime.ts:638-646` for `orchestratorReport`, `handoff` validator for child) rejects missing refs with structured codes (`WORKFLOW_HANDOFF_INVALID`, `WORKFLOW_OUTPUT_INVALID`) that the `agent_end` hook (§7D.2#5) surfaces fail-closed.

### 7D.7 Child sessions that never load extension modules — parent hooks/monitor remain authoritative

**Problem:** subagent sessions (every `workflowz-*` child) **do not load extension modules**, so they cannot run `p0-tools.ts` handlers, `omp_workflow_*` tools, or the hook handlers registered in the orchestrator's extension context. Naïvely they would appear invisible to the watchdog.

**Contract (explicit):**

1. **Parent hooks are authoritative.** The lifecycle events above (`agent_start`, `turn_start/end`, `tool_call/result`, `agent_end`) fire in the **parent's** session/hook context even for children created via `agent()` with a `handle` or via `task` subagent plumbing. The parent's registered hooks observe the child's turn and tool edges because the AgentRegistry/Hub is process-global (see `registry/agent-registry.ts` AgentRef lifecycle and `modes/components/agent-hub.ts`). A child that never loads the extension is still inspected via `AgentRegistry` + `history://<id>` + `agent://<id>` from the parent — no child-ping required.
2. **Child prompt embeds the whole reporting/governance contract.** Every rendered `agent()` call prefixes `task.setup` + a `setup block` containing:
   ```
   WORKFLOWZ CONTRACT (child <childId>, parentRun <runId>, task TASK-..):
   - You are workflowz-<profile>; terminal? true/false; allowed tools: [...]
   - Backlog owner: taskId=<id>, documentId=<id>, artifactKind=<k>, path=<p> — before any durable write you must produce WorkflowHandoffV1 with these refs and let the parent record it; do not write backlog/*.md directly.
   - Git owner: gitBranch=<b>, gitCommit=<c>, mode isolation=<none|worktree:<name>> — mutating steps require parent's repo_guard before commit; do not push or mutate main; use the assigned Git worktree and task branch.
   - Gating: every host-executed check must produce a GateReport-shaped reasoning fragment (one check per item) and return it in your handoff.gateReports[]; an advisory LLM-only note must not claim deterministic gate passed.
   - Budget/retries: gate.retries ≤ N, failFast behavior per §7B#7, operationId <id> for this operation — include it in handoff.operationIds[].
   - Completion: return ONLY a JSON WorkflowHandoffV1 object (schema §7D.6); your surroundings will extract it via agent://<id>?q=...
   ```
   This is necessary because `task.setup` is the only reliable per-task injection surface for subagents (see §7#7 and `runtime.ts:424-425` prompt embedding comment `task.setup embedded in prompt — subagent sessions don't load extensions`).

3. **Verification step in parent:** on `agent_end`, the parent's hook validates the child's returned JSON against `WorkflowHandoffV1` zod schema and against the journal's evidence (GateReports persisted via the parent's `omp_workflow_gate` calls, not child's). An untrusted or missing field results in `handoff_invalid` status (`§7D.2#5`) and a visible repair steer — the parent does not guess or fill child claims.

4. **No silent bypass:** any attempt by the child prompt to issue a raw `hub`/`history://` read on its own behalf is ignored — the monitor's timers live in the parent's `ctx.setInterval` and use `omp_workflow_agent_control` as the access gate (§7D.3). Children cannot self-stall-hidden; parent peek reveals their transcript even when they omit extension tool calls.

This handling is intentionally parent-authoritative: the orphan difficulty (child without extension) is mitigated by moving governance writes to the parent and keeping only structured handoffs from the child, rather than pretending the child can run the lifecycle alone.

### 7D.8 Linkage and non-claim

This freeze is linked from the TOC and referenced from parent TASK-15 (#23/#24). It extends §§3F-3G with the full skill/Hook/Hub contract. It does not claim runtime implementation is complete — P0 engine work (§8 P0 — engine) must implement the skill artifact creation in the `/workflows` command handler, the `omp_workflow_agent_control` tool, the `omp_workflow_spawn_guard`, the host monitor timers, and the scheduler around `parallel`. Backlog governance and Git guard enforcement remain per §§3D/7C.4, and token/cost telemetry remains advisory until core exposes `budget`/`usage` events (§7B#3).

## 8. Phased plan

- **P0-R — verifier/router/governance/profile/orchestrator research**: inspect the existing pix-skills severity classifier and pstack verify/ship gates; adopt the software-factory `GateReport` contract; confirm Backlog artifact recording, Git repository operations, optional native Git-worktree boundaries, `TASK-15.6` OMP-core capability matrix, nine workflowz profiles/spawn policy, and `TASK-15.8` orchestrator skill/hook/Hub watchdog contract; then confirm Fallow, Oxlint, LSP, frontmatter, and Rust/Go/Python/JS/TS adapter contracts; freeze `WorkflowRouteV1`, `GateFileV1`, `WorkflowHandoffV1`, and `OrchestratorRunResultV1` schemas, trust policy, `/workflows` semantics, and hard/advisory boundaries.
- **P0 — engine**: Schema V2 + skill-bootstrapped orchestrator + deterministic Just/code-tool chains + workflow-scoped profile/spawn guard + hook/Hub watchdog + deterministic GateReport rendering through execFile-style adapters + operation envelopes/replay for pure/idempotent work + enforced `omp_workflow_artifact_record`/`omp_workflow_repo_guard` preflight and phase gates + `omp_workflow_report`/`checkpoint` + run journal + `status`/`stop`; add host validation for route plans, gate references, command safety, budgets, and same-session repair loops.
- **P1 — lifecycle**: `resume`/`retry` + optional native-Git-worktree-backed `omp_workflow_worktree` + predefined templates + Backlog-linked recipe/gate scaffold tools; support global reusable gates, profile handoffs, and workflow chains with Git remaining authoritative.
- **P2 — TUI**: library overlay tabs, natural-language route preview, chain/gate approval modal, native session snapshot indicator, run overlay, footer widget + status, lifecycle cards, shortcuts.
- **P3 — polish**: concatenating/autocomplete `/workflows` subcommands and recipe/gate IDs, `appendEntry` snapshot mirror, title/working-message, memory stats, adapter health diagnostics.



## 9. Frozen decisions from docs grilling

These decisions are confirmed for the design review and are not implementation suggestions:

- **Entry point:** `/workflows <prompt>` routes to existing predefined recipes only. New recipes/gates require explicit scaffold/save actions; no implicit authoring or execution during routing.
- **Command grammar:** `/workflows` is the canonical composable command. Supported forms are `run`, `chain <recipe> -> <recipe>`, `list`, `status`, `resume`, `retry`, and `stop`; `getArgumentCompletions` preserves the entered prefix and concatenates nested completions. `/workflow-library` remains a compatibility/browser command.
- **Mutation approval:** render the complete route, inputs, gates, expected mutations, and worktree before creating a worktree or invoking a mutating agent. Require explicit approval first.
- **Repair boundary:** use one validated named worktree per run when isolation is selected. Gate repair stays in that worktree, uses the same agent session, and stops after retry/budget exhaustion.
- **Gate trust:** LLM-created gates begin as drafts. First execution and global promotion require approval; global versions are immutable/content-hashed.
- **Gate success:** required gates must pass. Optional gates may skip only with visible status and an evidence-bearing reason; skipped optional gates cannot produce a fully-verified claim.
- **Persistence:** OMP namespaced session entries/artifacts provide UI/conversation snapshot recovery; the external workflow journal remains authoritative for commands, worktrees, child agents, retries, and gate reports. Resume is always explicit.
- **Initial adapters:** P0 implements existing pix-skills/pstack gates, Fallow, local `vp lint`, and `tsc`; other language/LSP adapters remain researched contracts until prerequisites are verified.
- **Artifact governance:** every durable workflow artifact is Backlog-linked before creation/update; executable preflight/finalization gates enforce this, and Backlog operations—not direct markdown edits—own task/document state.
- **Repository governance:** Git owns repository state and mutations; executable repo guards reject out-of-worktree or coordinator-only push violations. Git worktrees provide isolation.
- **Code-only tools:** Just-backed host tools and verified tool chains are first-class; eval is optional for deterministic code steps.
- **Profiles/spawn:** nine workflow-scoped profiles ship; only Orchestrator/Planner/Judge may spawn; depth is one; Orchestrator fan-out is 8; Planner/Judge fan-out is 4; specialists are terminal.
- **Orchestrator control:** `/workflows` injects a complete skill/runbook; hooks capture lifecycle/tool evidence; Hub-backed monitor inspects, peeks, steers, stops, and retries children proactively.
- **Implementation gate:** docs grilling is complete, but runtime code waits for final plannotator approval of this frozen document.

## 10. References

- https://github.com/bastani-inc/atomic/tree/main/packages/workflows
- https://vekexasia.github.io/pi-extensible-workflows/ (index, developers, subagents, llm guides)
- https://github.com/disler/super-simple-software-factory
- `omp://magic-keywords.md`, `omp://extensions.md`, `omp://agent-hub.md`, `omp://hooks.md`, `omp://custom-tools.md`
- `omp://session.md` (append-only entries, branch/tree reconstruction, artifacts, and persistence limits)
- `backlog://workflow/overview` and `skill://git-tangled-workflow` (artifact and repository governance)
- `justfile` (project code-only gate recipes)
- `omp://task-agent-discovery.md` (profile shape, spawns, depth, model/tool policy)
- `omp://hooks.md` and `omp://agent-hub.md` (lifecycle hooks, inspect/steer/stop/Hub behavior)
- TASK-15.8 (orchestrator skill and hook/Hub watchdog decision)
- TASK-15.6 (OMP-core capability-gap decision matrix)
- TASK-15.7 (workflow-scoped profiles and Just code-chain decision)
- `plugins/extensible-workflows/UPSTREAM.json` (fork provenance)
- `plugins/pix-skills/src/gate.ts` (existing command safety classifier)
- `plugins/pstack-suite/src/commands/verify.ts` and `ship.ts` (existing verify/stop-before-merge gates)
