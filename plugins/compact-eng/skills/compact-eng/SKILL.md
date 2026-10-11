---
name: compact-eng
description: "Inspect context pressure, request guarded OMP-native text or snapcompact compaction, and recover narrow Shake artifact regions without duplicating context."
license: MIT
metadata:
  author: "Vendex origin; ezxomp rearchitecture"
  version: "2.0.0-ezxomp.0"
---

# Compact Engineering

Compact Engineering is a governor and observer. It requests or observes OMP-native behavior; it does not create summaries, Shake content, bitmap archives, or replacement tool results.

## Procedure

1. Call `compact_eng_context_status` or `/compact-eng status`. If below the trigger, in flight, pending, cooling down, or circuit-blocked, do not issue another request.
2. Prefer `/compact-eng compact` or `compact_eng_request` mode `text` for normal text/code history. This delegates with ordinary `ctx.compact()` and retains OMP's configured order and fallbacks.
3. Use `/compact-eng snapcompact` only when bitmap-frame compression is useful. OMP owns vision/renderability, frame/provider/data budgets, archive preservation, and fallback. Text-only models follow native rejection/skip and the guarded ordinary fallback.
4. If native Shake leaves `[shaken … recover: artifact://ID (region N)]`, read only that referenced region. Keep `artifact://` as canonical authority; do not inline the body repeatedly or create a second archive.

## Context classes

Keep user intent/ACs, raw artifacts, native bitmap history, and guidance distinct. Compact Engineering adds no lossy transform before delegation. Re-read exact sources or artifact regions when precision matters.

## Receipts

- `deferred-pending`: wait for a safe terminal boundary.
- `usage-unavailable`: do not force a request.
- `no-progress`: do not loop; allow cooldown/native maintenance.
- `circuit-open`: plugin automatic requests pause; native OMP remains available. One deliberate manual half-open probe is allowed.
- `stale-completion`: ignore the old generation.
- observed Shake/snapcompact belongs to native OMP.

## Commands

| Command | Purpose |
|---|---|
| `/compact-eng status` | Inspect without compaction. |
| `/compact-eng` or `/compact-eng compact` | Guarded ordinary native request. |
| `/compact-eng snapcompact` | Guarded explicit bitmap request. |

There is no compatibility alias.
