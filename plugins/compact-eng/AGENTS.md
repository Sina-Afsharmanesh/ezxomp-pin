# AGENTS.md — compact-eng

## Purpose
Compact Engineering governs and observes OMP-native compaction. It measures pressure and delegates; it never supplies compaction output or performs a lossy pre-pass.

## Ownership
- Package: `@ezxomp/compact-eng@2.0.0-ezxomp.0`
- Entry: `extensions/index.ts`; governor: `extensions/governor.ts`; types: `extensions/types/index.ts`
- Skill: `skills/compact-eng/SKILL.md`
- Provenance: continuing fork lineage from Vendex `pi-ultra-compact@1.2.1`, locked by `UPSTREAM.json`

## Local contracts
- The only command is `/compact-eng`; never add an old-name alias.
- Automatic checks use public `agent_end` and `ctx.getContextUsage()`.
- Text uses `ctx.compact()`; explicit bitmap uses `ctx.compact({ mode: "snapcompact" })`.
- Never register `session_before_compact`, return hook compaction, register governance `tool_result`/`context` replacements, call private session APIs/Shake, or write `preserveData.snapcompact`.
- Every trigger shares one single-flight guard. Pending/native work, cooldown, circuit, no-progress, and stale completion suppress duplicates.
- Receipts describe only requests, observed lifecycle actions, measured usage, and exact native outcomes.
- Native `artifact://` pointers remain canonical.

## Verification
```bash
bun test test/compact-eng.test.ts test/manifest.test.ts test/smoke-plugins.test.ts
bunx tsc --noEmit
bun test test/
omp --no-extensions -e "$PWD/plugins/compact-eng/extensions/index.ts"
```

## Child DOX index
No child `AGENTS.md` files are needed.
