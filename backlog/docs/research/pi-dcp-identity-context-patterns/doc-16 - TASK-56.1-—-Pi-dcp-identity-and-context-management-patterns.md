---
id: doc-16
title: TASK-56.1 — Pi-dcp identity and context-management patterns
type: other
created_date: '2026-08-30 00:44'
updated_date: '2026-08-30 00:44'
tags:
  - TASK-56.1
  - research
  - pi-dcp
  - context-management
  - compaction
  - recovery
  - compact-eng
---
# TASK-56.1 — Pi-dcp identity and context-management patterns

**Lookup date:** 2026-08-29 UTC. **Boundary:** Pi-dcp only; pi-agenticoding is TASK-56.2 and OMP Shake/snapcompact API verification is TASK-56.3.

## Finding

**Fact:** “Pi-dcp” does not uniquely identify a public project. Exact/direct searches resolve to multiple Pi extensions and prototypes. No local source, operator URL, badlogic-owned repository, or upstream cross-reference ties the operator wording to one owner.

**Result:** Identity remains unresolved; no candidate is silently selected.

**Required disambiguation:** Which owner/repository or package did you mean—for example `pi-vault/pi-dcp`, `PSU3D0/pi-dcp`, `hypernewbie/pi-dcp`, `Davidcreador/pi-dcp` / `@davecodes/pi-dcp`, `Snowy117/pi-dcp-migrate` / `@snowy117/pi-dcp`, `zenobi-us/pi-dcp` / unscoped `pi-dcp`, or another implementation? If the feature was “Pi built-in compaction plus bounded `dcp_read_session` recovery,” confirm `hypernewbie/pi-dcp`; if it was payload-only pruning, provide the owner because several implement that design.

## Lookup method

1. Local search: `pi-dcp`, `pi dcp`, `dynamic context protocol`, `dcp`; only the new TASK-56 records/session capture referred to the name.
2. Web queries: `"Pi-dcp" coding agent context GitHub`, `site:github.com "pi-dcp" "Dynamic Context Pruning"`, `pi dcp context`, `pi-mono dcp`, `dynamic context protocol pi`.
3. GitHub REST [`q=pi-dcp in:name`](https://api.github.com/search/repositories?q=pi-dcp%20in:name&sort=updated&order=desc&per_page=100) reported `total_count: 36`, `incomplete_results: false`; unrelated substring hits were excluded after reading metadata/README content.
4. GitHub [`org:badlogic dcp`](https://api.github.com/search/repositories?q=org%3Abadlogic%20dcp&per_page=100) returned `total_count: 0`.
5. Checked exact Pi registry entries and their repository links.
6. Commit-pinned sources: `pi-vault/pi-dcp@479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7` (0.6.0), `PSU3D0/pi-dcp@8d15a3331c51f3551ccd20583ac0f5ba499a13c3`, `hypernewbie/pi-dcp@8ebaca166b679970aa6eee2c9f22cb38728ec7bb` (0.8.27), `zenobi-us/pi-dcp@6e23f36bc625ad5e8a770272bf68680a43a762d3`.

## Evidence-distinguished candidates

“Relevance” is a pattern to evaluate, not identity proof.

| Candidate | Primary-source facts / distinction | Relevance |
|---|---|---|
| [`pi-vault/pi-dcp`](https://github.com/pi-vault/pi-dcp), [`@pi-vault/pi-dcp`](https://pi.dev/packages/%40pi-vault/pi-dcp) | Package 0.6.0 describes incremental pruning and compression ([package 2–11](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/package.json#L2-L11)). It combines auto dedup/error pruning, model compression, nudges, native session state, recovery, trust gating, and model disablement ([README 39–65](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/README.md#L39-L65), [111–176](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/README.md#L111-L176)). | Pipeline/protection, durable state, reversible blocks, overhead. |
| [`PSU3D0/pi-dcp`](https://github.com/PSU3D0/pi-dcp) | Pi “Zero-Mutation Context Hook” preserving disk/user/final/causal/recent history ([README 1–16](https://github.com/PSU3D0/pi-dcp/blob/8d15a3331c51f3551ccd20583ac0f5ba499a13c3/README.md#L1-L16)); pure strategies, pressure/frontier protection, rerun tombstones ([45–50](https://github.com/PSU3D0/pi-dcp/blob/8d15a3331c51f3551ccd20583ac0f5ba499a13c3/README.md#L45-L50), [82–107](https://github.com/PSU3D0/pi-dcp/blob/8d15a3331c51f3551ccd20583ac0f5ba499a13c3/README.md#L82-L107)). | Payload-only projection and active-frontier protection. |
| [`hypernewbie/pi-dcp`](https://github.com/hypernewbie/pi-dcp) | Package 0.8.27: percent/absolute dual trigger, bounded raw recovery, artifact-reference preservation, native-vs-DCP receipts, native fallback, cache warning ([README 11–19](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L11-L19), [96](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L96), [115–165](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L115-L165)). | Closest feature match to native composition/bounded recovery, but not identity proof. |
| [`zenobi-us/pi-dcp`](https://github.com/zenobi-us/pi-dcp), unscoped [`pi-dcp`](https://pi.dev/packages/pi-dcp?page=103), fork [`digi4care/pi-dcp`](https://github.com/digi4care/pi-dcp) | Exact “Pi-DCP” title ([line 1](https://github.com/zenobi-us/pi-dcp/blob/6e23f36bc625ad5e8a770272bf68680a43a762d3/README.md#L1)); prepare→process→filter and `PruneRule` interface ([42–80](https://github.com/zenobi-us/pi-dcp/blob/6e23f36bc625ad5e8a770272bf68680a43a762d3/README.md#L42-L80), [138–143](https://github.com/zenobi-us/pi-dcp/blob/6e23f36bc625ad5e8a770272bf68680a43a762d3/README.md#L138-L143)). Digi4care explicitly says Zenobi fork. Registry’s unscoped entry tells users to clone Zenobi but lists `edmundmiller/dotfiles`, so name alone is unreliable. | Extensible deterministic phases; registry mismatch reinforces ambiguity. |
| [`Davidcreador/pi-dcp`](https://github.com/Davidcreador/pi-dcp), [`@davecodes/pi-dcp`](https://pi.dev/packages/%40davecodes/pi-dcp) | OpenCode-DCP Pi port ([README 1–5](https://github.com/Davidcreador/pi-dcp/blob/main/README.md#L1-L5)); transforms outbound request while disk remains intact; decompress/recompress ([33–37](https://github.com/Davidcreador/pi-dcp/blob/main/README.md#L33-L37), [134–138](https://github.com/Davidcreador/pi-dcp/blob/main/README.md#L134-L138)). Registry: 0.2.0, 2026-05-19. | Request-only and reversible blocks. |
| [`Snowy117/pi-dcp-migrate`](https://github.com/Snowy117/pi-dcp-migrate), [`@snowy117/pi-dcp`](https://pi.dev/packages/%40snowy117/pi-dcp) | OpenCode-DCP Pi port ([README 3–5](https://github.com/Snowy117/pi-dcp-migrate/blob/master/README.md#L3-L5)); stable refs, fork inheritance, immutable disk, tree reconciliation ([13–18](https://github.com/Snowy117/pi-dcp-migrate/blob/master/README.md#L13-L18), [135–148](https://github.com/Snowy117/pi-dcp-migrate/blob/master/README.md#L135-L148)). Registry: 0.1.3, 2026-08-03. | Stable identity and fork/tree recovery. |
| [`complexthings/pi-dynamic-context-pruning`](https://github.com/complexthings/pi-dynamic-context-pruning), [registry](https://pi.dev/packages/%40complexthings/pi-dynamic-context-pruning) | Registry calls it a Pi DCP extension, version 1.0.7 (2026-04-14); README documents blocks, complete tool-pair expansion, thresholds, persistence, decompression. | Adjacent-name candidate; pair invariants and recovery. |
| [`lacoroze/pi-dcp`](https://github.com/lacoroze/pi-dcp) | `pi-dcp-stable` adds focused `dcp_expand_block` and `dcp_search_compressed_raw`; helpers answer a specific missing detail, not replace summaries ([README 1–12](https://github.com/lacoroze/pi-dcp/blob/main/README.md#L1-L12)). | Narrow recovery instead of full reinflation. |
| [`nostalfinals/pi-dcp`](https://github.com/nostalfinals/pi-dcp) | README says Pi DCP and “under development, not ready for daily use”; commands inspect/restore ranges. | Recovery concept only, not production authority. |
| [`arafays/pi-dcp-advanced`](https://github.com/arafays/pi-dcp-advanced) | Native Pi `AgentMessage[]` DCP: mark/apply, stable IDs, range compression, nudges, custom-entry persistence. | Modular phases; adjacent name. |
| [`YoungJurry/pi-hybrid-dcp`](https://github.com/YoungJurry/pi-hybrid-dcp) | Explicit half-finished prototype ([3–5](https://github.com/YoungJurry/pi-hybrid-dcp/blob/main/README.md#L3-L5)); built-in compaction changes timing, not storage; pruning is payload-only ([12](https://github.com/YoungJurry/pi-hybrid-dcp/blob/main/README.md#L12), [143–146](https://github.com/YoungJurry/pi-hybrid-dcp/blob/main/README.md#L143-L146)). | Native-timing pattern only. |
| [`theLittleStone/pi-agent-dcp`](https://github.com/theLittleStone/pi-agent-dcp) | README calls it an OpenCode-DCP Pi port but says P0 has not started and it is not usable. | Name-adjacent; no implemented behavior to adopt. |

**Identity conclusion:** pi-vault is a current scoped package, hypernewbie is the closest feature match, and Zenobi is the oldest exact unscoped lineage found. These are distinctions, not proof. Ambiguity remains until the question above is answered.

## Pattern facts

### Context management

- Request-only hook over a deep-copied context: [`PSU3D0/index.ts` 46–50](https://github.com/PSU3D0/pi-dcp/blob/8d15a3331c51f3551ccd20583ac0f5ba499a13c3/index.ts#L46-L50).
- Ordered pipeline—strip, stable refs, rebuild, strategies, IDs/nudges, prune: [`pi-vault/pipeline.ts` 19–72](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/pipeline.ts#L19-L72).
- Hard protection for recent user turns, complete tool pairs, mutation/subagent output, verification/frontier: [pi-vault 176–228](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/README.md#L176-L228), [PSU3D0 82–88](https://github.com/PSU3D0/pi-dcp/blob/8d15a3331c51f3551ccd20583ac0f5ba499a13c3/README.md#L82-L88).
- Versioned stable facts, durable fingerprint, snapshot validation, rebuildable caches: [`persistence.ts` 35–75](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/state/persistence.ts#L35-L75), [191–257](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/state/persistence.ts#L191-L257).
- Cache warning: per-turn mutation can cost more than it saves: [hypernewbie 165](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L165).

### Compaction/summarization

- Cheap auto pruning is separate from model-callable range/message compression: [pi-vault 39–43](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/README.md#L39-L43).
- Recent-window/overlap refusal and tool-pair-safe block expansion: [`handler.ts` 56–135](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/compress/handler.ts#L56-L135).
- Min/max/model limits, throttled nudges, summary buffer against cascades: [pi-vault 193–210](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/README.md#L193-L210).
- Dual capacity/cost trigger and native fallback: [hypernewbie 115–132](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L115-L132).
- Honest native attribution (`PI COMPACT`, default summary untouched): [151–159](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L151-L159).
- Clean-overhead benchmark can be net-negative from stable IDs; repeated-tool workload reports estimated 94.6% reduction with explicit limits: [pi-vault 255–280](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/README.md#L255-L280).

### Recovery/refetch

- Rerun tombstone: [PSU3D0 50](https://github.com/PSU3D0/pi-dcp/blob/8d15a3331c51f3551ccd20583ac0f5ba499a13c3/README.md#L50).
- Deactivate block; originals return next pass: [`decompress.ts` 4–21](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/commands/decompress.ts#L4-L21).
- Stable visible `[Compressed Block bN]` anchors: [`state.ts` 4–29](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/compress/state.ts#L4-L29).
- Read-only, pair-preserving, 8,000-token-capped narrow session retrieval: [hypernewbie 96](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L96).
- Focused block expand/search only for a missing detail: [lacoroze 9–12](https://github.com/lacoroze/pi-dcp/blob/main/README.md#L9-L12).

### Extension/hook points

- `context` returns projected request messages: [`pi-vault/index.ts` 429–498](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/index.ts#L429-L498).
- Tools, permission/model gates, system guidance: [194–297](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/index.ts#L194-L297).
- Lifecycle restore/tree/compact/shutdown reconciliation: [300–374](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/index.ts#L300-L374).
- Trust-gated project config and live tool-surface disablement: [111–127](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/index.ts#L111-L127), [180–186](https://github.com/pi-vault/pi-dcp/blob/479ec4f3a5df06b73f1c1d1d1dfbdd9d0bac23c7/src/index.ts#L180-L186).
- Native composition leaves host summary/storage untouched or schedules built-in compaction: [hypernewbie 151–159](https://github.com/hypernewbie/pi-dcp/blob/8ebaca166b679970aa6eee2c9f22cb38728ec7bb/README.md#L151-L159), [YoungJurry 143–146](https://github.com/YoungJurry/pi-hybrid-dcp/blob/main/README.md#L143-L146).

## Compact-eng interpretation—not source fact

Pi-dcp sources do not document OMP Shake or snapcompact; TASK-56.3 must verify those contracts.

1. **Native governor, not second compactor:** request verified OMP native compaction and let native text/snapcompact selection occur; DCP precedent does not justify a replacement summary.
2. **Shake-aware no-op:** do not create another archive or replace recoverable Shake markers with tombstones. Preserve `artifact://` references and count already-shaken output as relieved.
3. **Recovery ladder:** native artifact pointer/read first; broader block restore second; rerun only if no artifact exists and recomputation is safe.
4. **Hard boundary:** recent intent, mutation output, verification, subagent conclusions, compaction metadata, artifact pointers, and complete tool pairs are non-lossy.
5. **Governor:** single-flight, dual-trigger, hysteretic/cooldown-bound, no-progress aware; count summary/metadata overhead.
6. **Cache economics:** per-turn rewriting remains disabled without provider-specific net benefit, especially because Shake already removes large payloads.
7. **Honest receipts:** distinguish Shake, plugin-triggered native compaction, native snapcompact/text outcome, recovery; never attribute unobserved native savings.

## ADHD analysis

### Divergence—isolated frames

- **Economic:** dual percent/absolute trigger; cheap pruning before paid summary; net-benefit accounting; provider-specific receipts.
- **Security:** ephemeral projection; trust gate; hard working-set/artifact/tool-pair protection; bounded recovery/state validation.
- **Performance:** single-flight cooldown/hysteresis/no-progress; durable facts/rebuildable caches; clean-overhead benchmark; no rewrite after Shake/cache loss.
- **UX:** stable refs/artifact pointers; honest native/plugin receipts; automatic/manual/model-disable modes; throttled nudges only when native action cannot run.

### Focus—top 7 of 16 (novelty + viability + fit)

| Rank | Survivor | Frame | Score | Trap |
|---:|---|---|---:|---|
| 1 | Avoid rewriting when Shake/cache economics already favor no-op | Performance | 26 | Needs verified Shake observability; cache varies. |
| 2 | Honest native/plugin/pruning/recovery receipts | UX | 26 | Avoid spam/unsupported claims. |
| 3 | Lower-of percentage/absolute trigger | Economic | 25 | Must delegate native compaction. |
| 4 | Bounded read-only recovery by stable ref | Security | 25 | Can re-expose secrets; do not duplicate artifacts. |
| 5 | Net-benefit accounting including overhead | Economic | 24 | Estimates approximate; snapcompact pending. |
| 6 | Working-set/artifact/tool-pair continuity | Security | 24 | Overprotection can erase savings. |
| 7 | Single-flight cooldown/hysteresis/no-progress | Performance | 24 | Excess cooldown can miss overflow. |

Secondary ideas clustered under these survivors: trust gating; durable fingerprints/benchmarks; manual modes/nudges; cache-aware deterministic pruning.

## Recommendation

**Non-obvious pick:** make “do nothing because native Shake already made the turn cheap” a successful first-class outcome. DCP implementations show metadata and prompt-cache loss can erase savings. compact-eng should be a small native-compaction governor with recovery continuity, not unconditional rewriting.

Carry forward: authoritative context stays recoverable; active work/tool pairs are hard boundaries; compaction is pressure/cost/no-progress governed; recovery is stable-reference/narrow/bounded/read-only; native work is composed with and honestly attributed; Pi-dcp claims are not proof of OMP APIs.

## Limitations

Activity/stars/downloads/recency do not prove identity. Similar ports do not establish lineage unless documented. README performance values are project-reported; no reproduction ran. OMP native behavior remains TASK-56.3.
