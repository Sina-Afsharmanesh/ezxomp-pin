# AGENTS.md: skillforge

## Purpose

OMP Skillforge — improves agent skills through verified project memory. Automatically captures verified gotchas, decisions, and patterns from coding-agent sessions, stores them under OMP's profile-aware agent directory, retrieves only relevant entries for active skills, and promotes stable repeated learnings into skill patch proposals. Zero-maintenance during normal work; the only user-facing command reviews/applies pending patches.

## Ownership

- Package: `@ezxomp/skillforge` (workspace `plugins/skillforge`), version `0.2.5-ezxomp.1`
- Upstream: `pi-skillforge` (narumiruna/pi-skillforge), pinned in `UPSTREAM.json`
- Extension entry: `src/index.ts` (registers `skillforge_capture_memory` tool, `/skillforge` command, retrieval injection)
- Depends on `@ezxomp/experiences` for the memory/proposal review overlay host; imports use `@ezxomp/experiences/...` package paths so marketplace cache installs resolve them.

## Local Contracts

- **Memory system** (`src/memory/`): `capture.ts` (create/save entries, `generateMemoryId`), `parse.ts`, `retrieve.ts` (rank + inject relevant memories), `serialize.ts`, `validate.ts` (schema validation), `commands.ts`. Types in `src/shared/types.ts`.
- **Storage** (`src/store/storage.ts`): under `getAgentDir()/skillforge/` — `memory/global/{gotchas,decisions,patterns}`, `memory/projects/<project-id>/…`, `promotions/`, `registry.yaml`, `index.json`, `promotion-log.md`. No repo-local store; project isolation by `<project-id>`. Atomic writes via `writeAtomicFile`.
- **Promotion** (`src/promotion/promotion.ts`): `promoteMemoryIfEligible`, `promoteRetrievedMemories`, `listPendingProposals`, `applyProposal`, `confirmApplyProposal`. MVP criteria: `confidence: confirmed`, `hits >= 3`, at least one `skills` entry. Proposals never modify `SKILL.md` until explicit approval.
- **Schemas**: `schemas/memory.schema.json`, `schemas/skill-registry.schema.json`; templates in `templates/` (gotcha, decision, skill-patch); examples in `examples/`.
- **Overlay** (`src/overlay.ts`): `MemoryBrowserOverlay` (list/inspect/delete memories) and `ProposalReviewOverlay` (review/apply patches).
- **Capture rules**: conservative — no speculation, only reusable learnings with prevention value; prefer project partition; global only for cross-project learnings. Retrieval ignores `draft`/`deprecated`, honors `excluded_skills`, requires skill + prompt-term match.
- **Commands**: `/skillforge help|list|delete|review <skill-name>`; delete is by memory id only, requires confirmation, rebuilds index.

## Work Guidance

- Linting/formatting is Biome via `biome.jsonc` (includes `**`, excludes `.tmp-test-dist`, `dist`, `node_modules`).
- No init/capture/retrieve/validate/reindex/promote commands — those flows are automatic/internal; keep them that way.
- Memory entries must carry trigger, symptom, root cause, fix, verification, scope, confidence.

## Verification

- `npm run check` — `biome check .` + `tsc --noEmit`.
- `npm run lint` / `npm run format` — Biome lint/format.
- Root suite: `bun test test/` covers plugin integration; root `npm run check` (tsc) typechecks.

## Child DOX Index

No child AGENTS.md files needed.
