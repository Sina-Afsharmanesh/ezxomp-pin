# Compact Engineering

Compact Engineering is an OMP-native compaction governor and observer. It measures context pressure at terminal agent boundaries, coalesces concurrent checks, and requests OMP's text or snapcompact path. OMP remains responsible for automatic Shake, selection, summaries, bitmap preflight, budgets, fallbacks, commits, and recovery artifacts.

This package originated as Vendex's `pi-ultra-compact` fork. ezxomp renamed and substantially rearchitected it around native composition; `UPSTREAM.json` retains the immutable origin.

## Installation

```bash
omp plugin install compact-eng@ezxomp --scope user
```

The 2.0 cutover has no compatibility alias. Remove the installed old identity before installation.

## Surface

| Surface | Behavior |
|---|---|
| `/compact-eng` or `/compact-eng compact` | One guarded ordinary `ctx.compact()` request. |
| `/compact-eng snapcompact` | One guarded `ctx.compact({ mode: "snapcompact" })` request; OMP decides eligibility/fallback. |
| `/compact-eng status` | Usage, effective thresholds, phase, circuit, generation, config, and last bounded receipt. |
| `compact_eng_context_status` | Read-only bounded agent status. |
| `compact_eng_request` | Guarded agent text/snapcompact request. |

There is no old-command alias, replacement `session_before_compact`, governance `tool_result` transform, custom summary engine, or direct Shake action.

## Governor

At terminal `agent_end`, the governor samples `ctx.getContextUsage()` and uses the lower of percentage/optional absolute triggers. Automatic boundary and initial-attempt gates check continuation, pending messages, and native in-flight work but do not require `isIdle()`, because OMP awaits `agent_end` handlers while the prompt is still unwinding. Manual requests and fallback attempts retain the full idle/no-pending predicate. Receipts identify their `auto`, `manual`, or `fallback` origin. Calls coalesce into one request, remeasure after settlement, and require release-watermark plus output-headroom recovery. Success/no-progress cool down; repeated failure/no-progress opens only the plugin automatic circuit. Native OMP maintenance remains available.

Native Shake/snapcompact lifecycle is observed, never replaced. `artifact://<id>` remains the sole raw Shake recovery authority. Compact Engineering never duplicates artifacts or writes `preserveData.snapcompact`.

## Configuration

| Key | Default |
|---|---:|
| `autoCompact` | `true` |
| `watermark` | `0.70` |
| `watermarkTokens` | unset |
| `releaseWatermark` | `0.55` |
| `outputHeadroomTokens` | `4096` |
| `mode` | `text` |
| `cooldownTurns` | `2` |
| `maxConsecutiveFailures` | `3` |
| `circuitCooldownTurns` | `5` |
| `minProgressTokens` | `4096` |

Invalid keys/ranges fail the first invocation. Missing/invalid usage yields `usage-unavailable` without a native request.
Configuration is read lazily from persisted OMP plugin settings and validated at runtime by the same configuration resolver.
Persisted settings are read at first invocation where the OMP host package resolves; direct-source isolated runs fall back to factory defaults.

## Recovery

Read only the referenced Shake region (for example `read artifact://123:2`) and retain the pointer as canonical. Do not recurrently inline recovered bodies. Bitmap history and `preserveData.snapcompact` stay native-owned.

## Dependencies

Runtime imports only host-provided `@oh-my-pi/pi-coding-agent@18.0.6`. It imports no snapcompact library or third-party runtime package.

## License
MIT. See [LICENSE](LICENSE).
