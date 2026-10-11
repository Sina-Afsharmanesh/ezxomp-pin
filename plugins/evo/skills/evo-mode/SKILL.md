---
name: evo-mode
description: "Efficient tool use when OMP evo mode is ON. Use whenever evo mode is active, when a native tool call is blocked (evo mode native read or glob blocked), when routing between eval / marketplace-plugin tools / protocol URIs, when gathering code context (codesight/code-nav routing), when OMP-native tools (todo/task/hub/yield) reject arguments or skip, or when a tool call dies to the output token limit. Prevents blocked-tool thrash, wasted tokens on raw file dumps, argument-validation errors, and false-progress accounting."
globs:
  - "**/*"
alwaysApply: false
hide: false
---

# Evo Mode — Tool Discipline

Evo mode is an efficiency mode: the same work, fewer tokens, fewer round
trips. It strips the session to an explicit allowlist. Reaching for a
stripped tool wastes a round trip every time; reaching for a raw dump when a
surgical tool exists wastes thousands of tokens. Route correctly the first
time.

## Context-gathering ladder (MANDATORY — before touching any file)

Any agent that is about to explore, locate, or understand code MUST climb
this ladder in order. Each rung returns exact slices at a fraction of the
token cost of raw reads:

1. **Orient** — `codesight_get_wiki_index`, `codesight_get_summary`,
   `codesight_get_hot_files` (artifact reads from prebuilt `.codesight/`
   data: near-zero tokens, no file I/O).
2. **Ground** — `codesight_get_symbol_index`, `codesight_get_routes`,
   `codesight_get_schema`, `codesight_get_import_graph`,
   `codesight_get_blast_radius` (locate the exact symbol/route/table and
   its blast radius BEFORE reading anything).
3. **Slice** — `code_nav_get_symbol`, `code_nav_find_definition`,
   `code_nav_find_references`, `code_nav_trace`, `code_nav_compare`,
   `code_nav_rank_context`, `ast_grep_search` (exact symbol bodies, call
   chains depth ≤3, structural pattern matches — never whole files).
4. **Read raw** — `eval` `read(path, offset, limit)` LAST, and even then
   always pass `offset`/`limit`; a full-file `read()` after skipping
   rungs 1–3 is a routing failure.

`codesight_refresh` is explicit-only — never hidden auto-refresh. Fresh
`rank_context` withholds results by design; it needs session evidence.

## The active tool map (authoritative: `extensions/evo/tools.ts`)

Allowed when evo is ON: every registered tool name — base utilities, all
MCP tools, and every ezxomp marketplace plugin tool (see family table
below) — except the natives `write`, `bash`, `edit`, `glob`, `grep`.
Backlog tools register as bare `backlog_*` names (no `mcp__` prefix).
Protected floor: `task`, `hub`, and `eval` are ALWAYS active regardless of
the `getAllTools()` snapshot (orchestration primitives — cook dispatch and
subagent messaging dead-end without them). `read` is floor-protected only
when the host registers it, and stays filesystem-blocked by the tool_call
hook (protocol URIs only).

Blocked natively: `write`, `bash`, `edit`, `glob`, `grep`, and `read` on
filesystem paths. `read` survives ONLY for protocol URIs.

## ezxomp marketplace tool families (all active in evo mode)

Evo mode exposes every tool registered by installed ezxomp marketplace
plugins. Route by family:

| Family | Tools | When to use |
| --- | --- | --- |
| **codesight** (repo orientation, artifact-first) | `codesight_get_wiki_index`, `codesight_get_wiki_article`, `codesight_get_summary`, `codesight_get_routes`, `codesight_get_schema`, `codesight_get_blast_radius`, `codesight_get_env`, `codesight_get_hot_files`, `codesight_get_import_graph`, `codesight_get_symbol_index`, `codesight_get_change_impact`, `codesight_refresh` | RUNGS 1–2 of the ladder. FIRST for broad/fresh tasks: orientation, routes, schema, env vars, hot files, pre-edit blast radius. Reads prebuilt `.codesight/` artifacts — refresh explicitly with `codesight_refresh`, never hidden |
| **code-nav** (grounded symbol work) | `code_nav_get_symbol`, `code_nav_find_definition`, `code_nav_find_references`, `code_nav_trace`, `code_nav_compare`, `code_nav_rank_context`, `code_nav_plan_navigation`, `ast_grep_search`, `ast_grep_replace` | RUNG 3 of the ladder. AFTER codesight grounds a symbol: exact reads, defs/refs, call chains (depth ≤3), pattern compare, session-ranked context (`rank_context` withholds results on a fresh session). `ast_grep_*` for AST-precise search/replace (needs `sg` on PATH) |
| **experiences** (habit capture/review) | `agent_experience_draft_habit`, `agent_experience_confirm_habit`, `agent_experience_list_review`, `agent_experience_apply_review` | Conversational habit drafting + numbered review flows via the experiences lane |
| **agent-learning** (skills + memory capture) | `read_skills`, `skillforge_capture_memory` | Catalog/skill loading via read-skills surface; verified gotcha/decision/pattern capture into skillforge procedures |
| **backlog** (Backlog.md artifacts) | `backlog_task_*` (create/edit/list/view/complete/archive/demote), `backlog_doc_*` (create/update/view/search), `backlog_draft_*`, `backlog_milestone_*`, `backlog_decision_*`, `backlog_search`, `backlog_overview`, `backlog_instructions`, `backlog_board_export`, `backlog_doctor`, … | Task/doc/draft/milestone/decision tracking as durable Backlog.md artifacts. Never edit Backlog markdown directly — always via these tools. Bare names, no `mcp__` prefix |
| **cook** (Backlog cookbook orchestration) | `cook_propose`, `cook_start`, `cook_next`, `cook_advance`, `cook_decompose`, `cook_dispatch_{planner,scout,researcher,worker,validator,judge,audit,refute,council,council_synthesis}`, `cook_record_result`, `cook_record_council`, `cook_validate`, `cook_ready`, `cook_claim`, `cook_release`, `cook_claims`, `cook_snapshot`, `cook_journal`, `cook_rewind`, `cook_status`, `cook_watch`, `cook_config`, `cook_install`, `cook_reset`, `cook_stop`, `cook_adhd_diverge`, `cook_adhd_focus` | Multi-agent cookbook loop over Backlog tickets; specialist outcomes are recorded before advancement, and capped convergence runs the three-vote council plus synthesis lifecycle |
| **extensible-workflows** (saved recipes) | `omp_workflow_list`, `omp_workflow_save`, `omp_workflow_render`, plus the P0 execution family: `omp_workflow_reserve_launch`, `omp_workflow_report`, `omp_workflow_gate`, `omp_workflow_checkpoint`, `omp_workflow_status`, `omp_workflow_stop`, `omp_workflow_artifact_record`, `omp_workflow_repo_guard`, `omp_workflow_just_list`, `omp_workflow_just_run`, `omp_workflow_route`, `omp_workflow_resume`, `omp_workflow_retry`, `omp_workflow_adapter_health`, `omp_workflow_stats`, `omp_workflow_scaffold`, `omp_workflow_worktree` | Persist, validate, and rerun repeatable agentic procedures; run `just` recipes inside workflows |
| **plannotator** (plan review gate) | `plannotator_submit_plan` | ON REQUEST ONLY — use only when the user explicitly invokes Plannotator (`/plannotator`, plan/review gate). Submit the markdown plan file for browser review/approval during planning mode. It is NOT a default workflow |
| **eval** (persistent kernel) | `eval` | DEFAULT for MUTATIONS: file writes/edits, shell commands, batch operations, and anything a blocked native would have done. For READS/context, eval is the LAST rung of the ladder, not the first |

**Navigation policy:** broad/fresh → `codesight_*`; grounded symbol →
`code_nav_*`; raw bytes → `eval` `read(offset, limit)` last. Codesight
reads artifacts-first; code-nav is the symbol-level layer above it; eval
is the floor under both, not a rival.

**Questions & clarifications:** default to the native `ask` tool — always
available in evo mode. Plannotator's review UI is for plan/diff sign-off on
explicit request only, never a substitute for `ask`.

**Discovery:** run `/evo debug` for active vs target tool counts; the
allowlist is computed from live `getAllTools()` at toggle time (plus the
protected floor), so newly installed marketplace plugins are picked up on
the next `/evo on`.

## Routing table

| Intent | Correct tool |
| --- | --- |
| Understand a subsystem / orient on a task | `codesight_get_wiki_index` → `codesight_get_summary` (ladder rung 1) |
| Locate a symbol/route/table before reading | `codesight_get_symbol_index` / `codesight_get_routes` / `codesight_get_schema` (rung 2) |
| Read ONE symbol's definition or find callers | `code_nav_get_symbol` / `code_nav_find_references` / `code_nav_trace` (rung 3) |
| Pre-edit impact check | `codesight_get_blast_radius` / `codesight_get_change_impact` |
| Read a specific file section (AFTER 1–3 failed or N/A) | `eval` `read(path, offset, limit)` — never full-file |
| Find files by pattern | `ast_grep_search` for code shapes; `eval` glob for non-code (native `glob` is blocked) |
| Read `skill://` `memory://` `artifact://` `history://` `local://` `agent://` `issue://` `pr://` `omp://` | native `read` — the ONLY resolver; filesystem paths stay blocked |
| Write/edit any file | `eval` `write()` / edit via apply_patch in kernel (native write/edit are gone) |
| Shell command | `eval` subprocess / `Bun.$` (verbatim output) |
| Long/heavy command | `eval` with background process or `hub` op:start |
| Out-of-root directory listing | `eval` os.listdir |

## Output-token-limit truncation (top observed failure — 481 hits/4d)

`Tool call was not executed ... (stop_reason: length) before the arguments
could complete` = the ARGS were too big, not the tool. Never retry the same
call unchanged. Split the payload: write large content in eval chunks
(`write()` appends or multiple cells), pass big text via `local://` file
references in task/hub prompts, and keep edit ops small and anchored.

## Yield-skip semantics (245 hits/4d) — skipped is NOT completed

`Skipped due to pending system advisory / parent steering / queued user
message / pending peer interrupt` means the subagent result is VOID. Do not
count it as work or verification; clear the pending condition, then re-prompt.
`Tool yield not found` / `IRC wait aborted: agent X is not running` means the
addressed agent died before yielding — check `hub jobs`, then respawn under a
proven-live identity (routes pin at session start; config edits do not heal).

## Eval-first discipline (for mutations, not for context)

When a tool refuses (roots jail, protocol URI, missing binary), do NOT
retry the same call — switch to the persistent `eval` kernel. Reuse
top-level names across cells; never re-import what already exists.
Parallelize inside ONE cell with `parallel(thunks)`.
**Do not use eval to brute-force what codesight/code-nav already answer:**
a 400-line raw read costs 10–40× the tokens of a
`code_nav_get_symbol` slice and burns context that agents downstream need.

## Known validation traps (all observed in real sessions)

- `eval`: `language` must be `py` | `js` | `rb` | `jl` — never `python`/`javascript`.
- `todo` init: `list` items must be OBJECTS `{phase, items:[...]}` — plain strings fail validation.
- `hub`: `op` is REQUIRED on every call; daemon/process names must exist — run `op:list`/`op:ps` first, never guess names.
- `task` dispatch 404 / dead model route: routes resolve at SESSION start;
  editing config mid-session does NOT heal them. Dispatch under a proven-live
  agent identity with a role-override preamble instead of respawning the dead route.
- Subagents inherit evo restrictions. Under `/evo-sub`, each cook-* profile's
  `tools:` line grants eval + hub + web_search + that role's plugin tools
  (codesight_*, code_nav_*, backlog_*) — brief them on the context-gathering
  ladder up front so they do not burn turns on blocked natives or raw dumps.

## Parallel repo work

When dispatching subagents that mutate the repo, follow the consuming project's
parallel-agent Git protocol (`docs/parallel-agents.md` in the project root — single
source of truth): one `git worktree` on branch `task/<slug>` from `main` per task,
the branch + immutable `HEAD` OID as the deliverable, workers never `git push` or
move `main`; the coordinator integrates serially and is the only pusher. Git footguns
(detached HEAD, wrong worktree root): verify with `git worktree list --porcelain`
and `git rev-parse --show-toplevel` before mutating.

## After changing evo code

Toggle `/evo off` then `/evo on` to rebuild the active set (and `/evo-sub off/on`
for subagent profiles). `/evo debug` prints active vs target tool counts.
Run `bun run test` in the plugin dir before toggling.
