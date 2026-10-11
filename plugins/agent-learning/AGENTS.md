# AGENTS.md — agent-learning

## Purpose

Unified agent-learning plugin: skills.sh surface + ezxomp plugin catalog, native-memory facts shim, skillforge evidence/procedures pipeline, experiences habits lane (companion), unified review gate. Owns the consolidation contract documented in backlog doc-5. SkillOpt (microsoft/SkillOpt) integration direction — validation gate, bounded edits, deterministic splits, staging, prompt registry — is specified in backlog doc-23 (tickets TASK-95..101); the plugin never executes external optimizers.

## Ownership

- `src/read-skills.ts`, `src/remote.ts` — surface lane (catalog + skills.sh adapter; API contract verified 2026-08-23, see module header).
- `src/facts.ts` — facts lane classifier; no storage by design.
- `src/procedures/` — skillforge engine port; store root is \`<agentDir>/agent-learning\` with one-time legacy migration from \`<agentDir>/skillforge\`.
- `src/review-gate.ts` — learning.review gate (env LEARNING_REVIEW or <agentDir>/agent-learning.json).
- `src/learning-command.ts` — /learning routing command.
- `src/procedures/promotion/{gate,edit-engine,splits,staging}.ts` — SkillOpt port lane (TASK-95..99): validation gate, bounded edit engine (protected LEARNED region), deterministic splits, adopt-with-backup staging. Pure TS; no network/LLM/subprocess.
- `src/procedures/transcript/{miner,types}.ts` — Pi-transcript miner (TASK-98): digestPiSession v1/v2/v3, harvestTranscripts, redactSecrets; reads `<agentDir>/sessions` only.
- `src/procedures/prompts/registry.ts` — data-only prompt-template registry (TASK-100): loadOverrides + mtime hot reload; default path `<agentDir>/agent-learning/prompts.json`.
- `/learning sleep` surface in `src/learning-command.ts` (TASK-101) is describe-only by contract: it never executes the external skillopt_sleep CLI.
- `skills/` — bundled ezxomp plugin catalog (one SKILL.md per marketplace plugin + lane deep-dives); exposed via resources_discover so native discovery lists them.

## Local Contracts

- Do NOT re-register @ezxomp/experiences here; duplicate registration breaks when both plugins load. Habits lane routes via /learning experience.
- Do NOT reintroduce pre-turn memory injection in procedures — native recall owns context injection (doc-5 decision).
- read_skills list/description are catalog+cache scoped only; user/project skills belong to native discovery.
- Remote skill fetch policy: safe programming-language-specific content only.
- Upstream modules ported verbatim where possible (once/collapsed-row/run/gate/directive); keep diffs minimal and note any behavior change in the module header.

## Work Guidance

- Follow root AGENTS.md DOX rules; update this file when lane contracts change.
- Catalog entries must stay <=100 lines with DO/DON'T tables per tool.

## Verification

- Root gate: \`just verify\` (tsc + bun test test/) — includes test/agent-learning.test.ts and manifest checks for this package.
- Plugin-local unit tests run via \`cd plugins/agent-learning && bun test\`.

## Child DOX Index

(none)
