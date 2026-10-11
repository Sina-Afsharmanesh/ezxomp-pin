# Plan: SkillOpt → agent-learning — parallel worker execution with audit + review gates

Status: AWAITING REVIEW · tickets TASK-95..101 (Backlog doc-23) · protocol: `docs/parallel-agents.md` (decision-2)

## What this plan does

Executes the seven SkillOpt-derived enhancement tickets against `plugins/agent-learning/` using parallel
jj workspaces (one worker per ticket), each followed by a two-stage gate:

1. **Auditor** — independent per-workspace verification agent: re-runs the worker's targeted tests,
   checks acceptance criteria against observable behavior only, verifies "work is done" claims.
   Findings loop back to the worker; audit passes only when findings are empty.
2. **Reviewer** — code-review loop on the merged worktree: reviews diffs against repo standards
   (`AGENTS.md` contracts, doc-5 compat rules), files typed findings back to workers; workers fix and
   re-enter the review loop until the reviewer returns clean.

The coordinator then runs `just verify` (repo gate), merges locally, and — only after your approval in
this review — pushes `main`.

## Scope

| Ticket | Deliverable | Deps |
|---|---|---|
| TASK-95 | `evaluate_gate` / `select_gate_score` port (pure TS) wired into `promoteMemoryIfEligible` | — |
| TASK-96 | bounded edit engine (add/delete/replace, dedup, unmatched reporting) + protected learned region in `applyProposal` | — |
| TASK-97 | deterministic train/val/test hashing + `holdout_leaked` fail-closed | 95 |
| TASK-98 | heuristic transcript miner (offline, zero network, redaction) | — |
| TASK-99 | adopt-with-backup + evidence log | 96 |
| TASK-100 | prompt template registry (data-only, mtime hot reload) | 95 |
| TASK-101 | describe-only `/learning sleep` surface | 99 |

Non-goals: no LLM calls shipped anywhere in the lane; no execution of external skillopt binaries;
no changes to read_skills surface or native autolearn (doc-5 contract).

## Execution graph

```
Wave 1 (parallel):   W95  W96  W98          (three independent workspaces)
Wave 2 (parallel):   W97←95  W99←96  W100←95
Wave 3:              W101←99
Per worker:  implement → self-test → jj bookmark <task>
Per work:    AUDIT (parallel per workspace) → findings loop back to worker until clean
Integration: coordinator merges bookmarks → REVIEW loop (reviewer ↔ workers) → just verify → YOUR approval → push main
```

## Worker rules (from decision-2, binding)

- One jj workspace per ticket: `../ezxomp.<task>`, rooted at current `main`; `bun install --frozen-lockfile` when `node_modules/` absent.
- Worker never pushes, never moves `main`; deliverable = task bookmark on the finished commit.
- Shared-file awareness: TASK-95/97/100 all touch `src/procedures/promotion/` or add modules under it;
  contracts fixed up front (see Interfaces) to prevent merge conflicts — new code goes in new files,
  existing files touched only at named call-sites.

## Interfaces fixed before dispatch (cross-task contract)

- `src/procedures/promotion/gate.ts` (TASK-95): exports `evaluateGate`, `selectGateScore`, `GateResult`.
- `src/procedures/promotion/edit-engine.ts` (TASK-96): exports `applyEditsDetailed`, `LEARNED_REGION` markers.
- `src/procedures/promotion/splits.ts` (TASK-97): exports `assignSplits`, `Splits`.
- `src/procedures/transcript/miner.ts` (TASK-98): exports `mineTranscripts`, `TaskRecord`.
- `src/procedures/promotion/staging.ts` (TASK-99): exports `backupSkillFile`, `appendEvidenceLog`.
- `src/procedures/prompts/registry.ts` (TASK-100): exports `getPrompt`, `render`, `loadOverrides`.
- `src/learning-command.ts` (TASK-101): adds `case "sleep"` only — no other edits to shared files.

## Audit stage (auditors = "checking if the work is done", loop validation)

Per completed worker, in the SAME workspace, a fresh verifier agent:
1. `bun test <targeted files>` — runs the ticket's tests itself, does not trust worker output.
2. Checks each acceptance criterion against observable behavior (test names + outcomes), never
   implementation presence.
3. Verifies zero-network/no-LLM constraint by import-graph inspection.
4. Verifies doc-5 compat: store path unchanged, no pre-turn injection, no read_skills changes.
5. Returns typed verdict: PASS or findings list. Findings → coordinator sends back to the worker as
   steering; worker fixes, re-bookmarks, auditor re-runs. Loop capped at 3 rounds, then escalation.

## Review stage (reviewer → worker loop, after merge)

Reviewer agent reads the merged diff vs pre-merge `main` and the changed AGENTS.md contracts:
- Standards: repo `AGENTS.md` + `plugins/agent-learning/AGENTS.md` + doc-5 + doc-23 decisions.
- Defect classes: missing callers (clean cutover), dead code, tests that assert implementation rather
  than behavior, contract drift vs the Interfaces table, DOX doc updates missed.
- Output: typed findings (BLOCKING / FOLLOW-UP). BLOCKING → worker fix round in the merged worktree
  (coordinator dispatches, single writer per file), reviewer re-reviews the fix diff. Loop until clean.

## Integration and delivery order

1. Merge Wave-1 bookmarks into local `main` (merge commits preserve provenance).
2. Audit wave 1 (parallel auditors). Fix loops as above.
3. Merge Waves 2–3 as their deps land; audit each.
4. Reviewer loop on the full integrated diff.
5. DOX pass: update `plugins/agent-learning/AGENTS.md` lane contracts + CHANGELOG.md.
6. `just verify` (tsc + full test suite).
7. **Gated on THIS review page:** you approve → `jj git push --bookmark main`. You annotate/deny → plan
   revision, no push.

## Risks / mitigations

- **Concurrent edits to `promotion/`**: mitigated by the Interfaces table (new files, named call-sites)
  and single-writer-per-file dispatch during fix rounds.
- **Test flakiness across workspaces**: each workspace installs its own `node_modules`; tests are
  hermetic per decision-2 bootstrap rule.
- **Audit theater** (auditor rubber-stamping): auditors must paste actual command output as evidence;
  coordinator rejects verdicts without raw output.

## Verification (how you'll know it worked)

- `just verify` green on merged main (pre-push).
- Per-ticket: auditor evidence trail (test output pasted), reviewer clean verdict.
- TASK-95/96 have dedicated unit tests with no-mock pure-function coverage (gate math, edit ops).
- No new network/LLM imports anywhere under `plugins/agent-learning/src/` (auditor-verified).
