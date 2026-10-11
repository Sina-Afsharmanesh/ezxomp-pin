# OMP Workflowz Orchestrator

## Purpose

Use this skill whenever a request should become a validated, resumable OMP Workflowz run rather than an ad-hoc sequence of shell commands or agent calls — including when the user asks to CREATE a new workflow recipe (`/workflows create <prompt>` or a free-form workflow request with no matching recipe).

## Entry points

- `/workflows create <prompt>` — author a NEW recipe: this skill body is injected into the turn; design, validate, save, and report per the creation procedure below.
- `/workflows` — canonical recipe browser and orchestrator entry point.
- `/workflow-library` — compatibility alias for the recipe browser.
- `omp_workflow_list` — list validated V1/V2 recipes by scope.
- `omp_workflow_route` — resolve a direct or chained route without executing it.
- `omp_workflow_render` — resolve typed inputs and produce native eval JavaScript plus a journal run id.
- `omp_workflow_status` / `omp_workflow_stop` — inspect or cooperatively stop a run.

## Required lifecycle

1. Select an existing approved recipe. Drafts require an explicit save/approval step.
2. Validate the route, typed inputs, result references, gate availability, Backlog artifact metadata, and Git repository state (root, current non-detached branch, `HEAD`).
3. Render the recipe only after the route is approved; keep the returned run id and journal path.
4. Execute through native eval primitives (`phase`, `agent`, `parallel`, `tool.*`, `budget`). Do not create a second workflow engine.
5. Record stage, gate, checkpoint, and completion events in the run journal. Stop precedence is authoritative.
6. Verify output schemas and Backlog/Git evidence before declaring completion.

## Recipe contract

- V1 recipes remain valid: `schemaVersion: 1`, `inputs`, ordered `stages`, and task prompts.
- V2 recipes use `schemaVersion: 2`, typed inputs, non-empty stages/tasks, per-stage `gates`, optional `outputs` and `artifacts`, and globally unique ids.
- `{{input.<name>}}` resolves typed inputs. Task `{{result.<id>}}` references must point to earlier stages; route result references must point backward.
- `task.workflow` inlines a V2 child recipe with namespaced stage/task/gate ids; cycles fail before rendering.

## Creation procedure (`/workflows create <prompt>` or unmatched free-form request)

1. **Restate the goal in one sentence** and pick the shape: direct (one stage), chain (sequential stages feeding results forward), or fan-out (parallel tasks in one stage). Reuse a builtin template via `omp_workflow_scaffold` when one already matches (`plan`, `implement`, `review-loop`, `adversarial-verify`, `generate-filter`, `classify-act`, …) instead of authoring from scratch.
2. **Design the recipe**: schemaVersion 2, slug name (`[a-z0-9][a-z0-9-]{0,63}`), string description, typed `inputs` (each `{ description, required, default? }`), non-empty `stages` with slug ids/labels, and per-stage `tasks` with non-empty prompts. Reference inputs as `{{input.<name>}}` and earlier task results as `{{result.<task-id>}}` — never forward.
3. **Add gates deliberately**: `exec`/`just` gates for deterministic checks (`executable` + `args` argv form; raw `command` shell strings are restricted and require explicit approval), `checkpoint` for human approval, `llm` for advisory review, `output` when a completion report must satisfy a schema. Gate ids must be globally unique and must not collide with reserved governance ids (`backlog-record`, `git-state`).
4. **Validate BEFORE saving**: call `omp_workflow_route` on a direct route of the draft, or construct the definition object and confirm `omp_workflow_save` accepts it. Fix every validation message — do not retry blind.
5. **Save**: `omp_workflow_save` with `scope: "project"` (repo-shared) or `"global"` (user-wide). Durable global recipes require a Backlog owner: create or reference a task/document id and pass it in `owners`. The save fails closed on `WORKFLOW_EXISTS` — pass `overwrite: true` only when the user asked to replace an existing recipe.
6. **Report**: name, scope, path, stage/gate summary, and the exact input keys a caller must provide. Then either run it (`/workflows run <name>` flow: validate route → render → execute) or hand it back for review.
7. **Never** bypass validation with a hand-written file under `~/.omp/agent/workflows/` or `.omp/workflows/` — save through the tool so validation, atomic write, and content-hash pinning all hold.

## Profiles and execution

Use only workflow-scoped profiles. Orchestrator, planner, and judge profiles may spawn children; specialist profiles are terminal. Keep spawn depth at one, fan-out at eight for orchestrators and four for planners/judges, and preserve typed handoffs/results. Prefer code-only `just` chains for deterministic checks; make optional skips visible.

## Gates

- `shell`: explicit raw commands use `tool.bash`; executable/argv gates are the default. Dangerous commands fail closed.
- `llm`: `completion` is advisory unless the recipe supplies deterministic acceptance.
- `checkpoint`: `omp_workflow_checkpoint` requires interactive approval or `auto: true` in headless mode.
- `budget`: compare `budget.remaining()` with the recipe threshold and return `budget_exhausted` before launch.
- `output`: completion reports are validated host-side against the recipe output map.

Failed deterministic gates may run a bounded repair prompt and re-check. Preserve stdout, stderr, exit metadata, duration, checks, and normalized violations in the GateReport.

## Governance

Durable artifacts carry Backlog task/document ids, artifact kind/path/hash, acceptance criteria, inherited Definition of Done, type/priority/status, labels, dependencies/readiness, references, documentation, and modified files. Mutation boundaries require Git-state evidence (real Git root, current non-detached branch, `HEAD` OID). Workers commit only their `task/<slug>` branch; workers never push or move `main` — the coordinator alone integrates to `main` and runs `git push origin main`.

Run journals are append-only JSONL under `<cwd>/.omp/workflows/runs/<run-id>/`. Operation ids may deduplicate pure/idempotent journal writes; manual side effects are never claimed exactly-once.
