---
name: compact-eng
description: OMP-native compaction governor and observer — inspect pressure and request guarded text/snapcompact compaction with /compact-eng.
---
# Compact Engineering

Measures context pressure and delegates to OMP-native compaction without replacing Shake, snapcompact, summaries, artifacts, or native fallbacks.

## Command

- `/compact-eng status` — inspect pressure and governor state.
- `/compact-eng compact` — guarded ordinary native request.
- `/compact-eng snapcompact` — guarded explicit bitmap request.

## DO

- DO inspect status before requesting compaction.
- DO recover only the necessary `artifact://` region and retain the pointer as authority.

## DON'T

- DON'T loop on pending, cooldown, no-progress, or circuit-open receipts.
- DON'T claim Compact Engineering performed native Shake or snapcompact.

## Recovery

- Post-compaction precision need → re-read the exact source or referenced `artifact://` region rather than trusting summary prose.
