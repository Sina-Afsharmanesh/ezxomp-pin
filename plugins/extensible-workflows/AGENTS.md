# AGENTS.md — extensible-workflows

## Purpose

Persist and render validated OMP Workflowz recipes while preserving the V1 recipe API and adding the workflowz V2 execution boundary.

## Ownership

- `src/library.ts` owns the legacy V1 schema and compatibility helpers.
- `src/runtime.ts` owns the V1/V2 definition boundary, V2 validation/rendering, route checks, gate reports, JSONL run journals, and repository/Just adapters.
- `src/p0-tools.ts` owns workflow-scoped report, gate, checkpoint, status, stop, resume, retry, artifact, repository, Just, and route tools.
- `src/index.ts` owns list/save/render tools, `/workflows` (library, run/chain route preview, `create`/free-form authoring dispatch) and `/workflow-library`, and catalog injection.
- `src/workflow-overlay.ts` owns the centered recipe browser presentation.
- `skills/omp-workflow-authoring/SKILL.md` owns the `/workflows` orchestrator runbook, the recipe-creation procedure, and profile/gate/governance usage contract.

## Local Contracts

- V1 definitions remain loadable and render through the existing library renderer.
- V2 definitions require `schemaVersion: 2`, validated inputs/stages/tasks/gates, optional outputs/artifacts, and globally unique stage/task/gate IDs.
- Rendered V2 JavaScript runs through native eval helpers; shell commands default to executable/argv adapters, while raw shell commands are restricted and explicitly routed through `tool.bash`.
- Run journals live under `<cwd>/.omp/workflows/runs/<uuid>/journal.jsonl`; UUID validation, path containment, append-only events, malformed-entry evidence, cooperative stop precedence, and operation-id replay are mandatory.
- Recovery is journal-authoritative and stage-granular: `omp_workflow_resume` creates a new run linked to `parentRunId`, seeds only completed valid stage results, and skips those stages; `omp_workflow_retry` creates a fresh run with the same normalized inputs and owner provenance but no seeding. Both preserve owner IDs, Git commit/branch, and route/preview refs from the `created` journal record, inherit the journaled normalized inputs (caller inputs may only repeat them), and refuse malformed, stopped, completed/failed, incomplete, or content-incompatible journals; snapshots never substitute for journal proof.
- Durable workflow artifacts require Backlog readiness metadata and mutation boundaries require Git-state evidence (`git-state` reserved gate: real Git root, current non-detached branch, `HEAD` OID, status). Workers commit only their `task/<slug>` branch; the coordinator alone integrates to `main` and runs `git push origin main` — workers never push or move `main`.
- **Repo isolation contract** (`src/worktree.ts`): workflow isolation is native `git worktree`-based. `isolation: "none"` = the current Git workspace with live branch/commit evidence; `isolation: "worktree"` = a named sibling worktree on `refs/heads/task/<slug>` created from `main` and located at `${repoDir}/../${repo}.${slug}`, reused only when the parsed `git worktree list --porcelain` registry records exactly that branch/path. Cleanup removes only the exact registered worktree and preserves the worker branch for the coordinator. Fail closed on invalid worktree paths, symlinks, repo escapes, branch mismatches, or git-root identity mismatches.
- **Authoring dispatch** (`openWorkflowAuthoring`): `/workflows create <prompt>` and free-form non-route prompts compose the bundled SKILL.md body + library snapshot + request into one `sendUserMessage` turn; the agent performs creation via `omp_workflow_save`/`omp_workflow_scaffold`. The command never writes recipes itself, and an unreadable skill body fails visibly.

## Work Guidance

- Keep runtime validation at file/tool boundaries; fail closed for malformed gates, dangerous commands, unknown routes, unsafe paths, and headless checkpoints without `auto: true`.
- Preserve native OMP execution primitives (`agent`, `parallel`, `phase`, `tool.*`, `budget`) instead of creating a parallel workflow engine.
- Add behavior-level tests for new V2 contracts and retain V1 smoke coverage.

## Verification

- `bunx tsc --noEmit`
- `bun test test/workflowz-v2-runtime.test.ts`
- `bun test test/workflowz-command.test.ts`
- `bun run test/smoke-workflowz.test.ts`
- `bun test test/smoke-plugins.test.ts`

## Child DOX Index
- Entry: `src/index.ts` — `extensibleWorkflows(pi)` registers tools, command, and `before_agent_start` catalog injection
- Depends on `@ezxomp/experiences` for the workflow-library overlay host; imports use `@ezxomp/experiences/...` package paths so marketplace cache installs resolve them.
- Depends on `@ezxomp/agent-learning` for gate-rule building (`src/runtime.ts` imports `buildRules`/`classify` from `@ezxomp/agent-learning/src/gate.ts`); imports use the `@ezxomp/agent-learning/...` package path — never a relative escape, which breaks OMP flat-cache installs (enforced by `test/flat-cache-cross-plugin.test.ts`).

## Local Contracts
- Tools: `omp_workflow_list` (scope `effective|global|project`, default `effective`; returns metadata + malformed-file diagnostics), `omp_workflow_save` (atomic; fails with `WORKFLOW_EXISTS` unless `overwrite=true`), `omp_workflow_render` (resolves defaults, rejects missing/unknown inputs, returns generated JS)
- `before_agent_start`: injects a catalog notice into the system prompt only when Workflowz is enabled and the prompt mentions workflows
- Command: `/workflow-library` — browse and manage saved recipes; `/workflows` — library (empty), route preview (`run <name|chain>`-style explicit routes), authoring (`create <prompt>` or free-form)

## Work Guidance
- Keep the recipe schema and render output compatible with OMP native Workflowz eval — `src/library.ts` is the single source of truth for validation and rendering.

## Verification
- No test script in package.json.

## Child DOX Index
No child AGENTS.md files needed.
