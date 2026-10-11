---
id: doc-23
title: SkillOpt integration analysis for agent-learning
type: specification
created_date: '2026-09-06 05:22'
---


## What SkillOpt is

Microsoft SkillOpt (arXiv 2605.23904) treats a skill document as the trainable state of a frozen agent. The research engine (`skillopt`) trains `best_skill.md` artifacts on benchmarks: rollout → reflect → aggregate → select → update → gate. The deployment companion **SkillOpt-Sleep** (`skillopt_sleep/`, zero dependency on the research package) applies the same discipline to daily local-agent usage: harvest transcripts → mine recurring tasks → replay on the user's own budget → consolidate (reflect → bounded edit → **held-out validation gate**) → stage proposal → **human adopt**. The gate accepts a candidate only when it strictly improves held-out score; optional `gate_no_regression` blocks any per-task regression.

Key reusable mechanisms (all in `skillopt_sleep/`):

1. **Protected learned region** (`memory.py`): all machine edits live between `<!-- LEARNED START/END -->` markers; hand-written content outside is never touched. Edits are bounded add/delete/replace with normalized dedup, and `apply_edits_detailed` reports *unmatched* edits so a night is self-diagnosing.
2. **Validation gate** (`gate.py`, vendored self-contained): pure function `evaluate_gate(candidate, current, best)` → accept / accept_new_best / reject, with hard/soft/mixed score projection.
3. **Task mining** (`mine.py`): heuristic miner (retry chains, lexical feedback, re-ask detection) runs with zero API; splits tasks train/val/test deterministically by task-id hash so the gate slice is stable across nights and never overlaps training. `holdout_leaked` flag fails closed when val ⊄ train is violated.
4. **Prompt registry** (`prompts.py`): all LLM templates (miner/attempt/judge/reflect) in one auditable place, user-overridable at runtime via `prompts.json` (mtime-checked, hot reload).
5. **Edit budget + learning-rate analogy**: reflect proposes at most N bounded edits; concrete rules only ("keep response under 1200 chars", not "respect limits").
6. **Staged adoption**: nothing live is modified until a human adopts; every adopt backs up the prior file; `evidence.jsonl` logs per-stage prompts/replies (redacted, truncated).
7. **Session harvesting**: read-only digesters for Claude Code, Codex, Copilot, Cursor, OpenCode, and **Pi** (`harvest_pi.py` already reads OMP's `~/.pi/agent/sessions` JSONL tree sessions, active-branch resolution, secret redaction).

## What agent-learning already has

- procedures lane: evidence capture (`capture_memory`) → confidence promotion (draft→observed→confirmed, hits≥3) → **human-gated SKILL.md patch proposals** (`promotions/` JSON files, `applyProposal` appends to a `## Skillforge learnings` section).
- usage lane: observes eval/tool-call patterns per session, persists pattern records, writes promotion proposals when a pattern repeats ≥2.
- review gate: advisory `learning.review` guidance routing captures into reviewed lanes; config-only enforcement via `autolearn.autoContinue:false`.
- facts lane: thin adapter over native memory; no own store.

## Gap analysis (SkillOpt mechanism → agent-learning status)

| SkillOpt mechanism | agent-learning today | Gap |
|---|---|---|
| Held-out validation gate before accepting any skill edit | none — proposals gate on confidence+hits only, never re-verify against tasks | proposals can degrade skills; no empirical proof |
| Train/val/test split of evidence, stable across nights | hits counter only; no replay, no splits | no anti-overfitting story |
| Protected LEARNED region in skill docs | appends to `## Skillforge learnings` section, dedup via `current.includes` | no bounded edit ops, no unmatched-edit reporting, no dedup normalization |
| Edit budget (learning-rate analogy) | one proposal per memory, unbounded count | patch storms possible |
| Heuristic offline mining of recurring tasks from transcripts | usage lane observes tool calls only, not user intents/retry chains | misses the richest signal: user-corrected recurring tasks |
| Human-adopt staging with backups + evidence log | confirm dialog + promotion log; no backup, no evidence log | weaker audit trail |
| Runtime-overridable prompt templates | n/a (no LLM calls in-lane) | future-proofing for gated LLM reflection |
| Nightly scheduler | none | no automation surface |

## Integration decisions

- **We do NOT execute SkillOpt from agent-learning** (user directive: no execution). The plugin gains the *discipline* (gate, bounded edits, splits, staging) natively in TypeScript; running skillopt-sleep itself stays an external opt-in the user may schedule.
- **Execution boundary**: any LLM-calling piece (replay, LLM mining, reflection) must stay behind explicit user invocation. Heuristic pieces (gate math, edit application, mining) are pure code and safe.
- **Compat contract** (doc-5): procedures store stays `<agentDir>/agent-learning`; no pre-turn injection; read_skills surface untouched.

## Ticket map

1. **AL-SKILLOPT-GATE** — vendored validation gate + held-out evaluation harness (pure TS, no LLM). Blocks promotion proposals that don't improve a held-out score.
2. **AL-SKILLOPT-EDITS** — bounded edit engine (add/delete/replace + dedup + unmatched reporting) + protected learned region in `applyProposal`.
3. **AL-SKILLOPT-SPLITS** — deterministic train/val/test hashing of evidence entries so gate slices stay stable across promotion rounds.
4. **AL-SKILLOPT-MINE** — heuristic transcript miner (retry chains, feedback signals) feeding candidate memories with outcome labels; complements usage lane's tool-call observations.
5. **AL-SKILLOPT-STAGE** — adopt-with-backup staging + evidence log for applied proposals (upgrade from confirm-dialog-only).
6. **AL-SKILLOPT-PROMPTS** — prompt-template registry with runtime override file (prep for optional gated LLM reflection later; no calls shipped).
7. **AL-SKILLOPT-SLEEP** (optional, last) — orchestration command surface `/learning sleep dry-run|status` that *describes* the cycle and links to the external skillopt-sleep CLI, without executing it.

## References

- Repo: https://github.com/microsoft/SkillOpt (MIT). Paper: arXiv 2605.23904.
- Engine: `skillopt_sleep/` — gate.py, consolidate.py, memory.py, mine.py, prompts.py, harvest_pi.py.
- Sleep docs: `docs/sleep/README.md` (data boundary, handoff, fan-out, evalkit).
- Claude Code plugin shape: `plugins/claude-code/` — thin command shell over shared engine; OMP equivalent would be `/learning sleep`.
- Local verified facts: OMP sessions live at `~/.pi/agent/sessions` (216 project dirs on this machine) — the exact source skillopt's Pi harvester reads.
