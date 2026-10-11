---
name: gsd-loop
description: ezxomp autonomous GSD loop kernel — per-cwd .gsd-loop/ work queue of units (brief + optional verify command) driven turn-by-turn with guard pipeline, crash notes, wedge/foreign-lock coordination, and /gsd-loop command. Use when explaining or debugging gsd_loop_* tools or the loop kernel lifecycle.
---
# gsd-loop (ezxomp)

Autonomous unit-execution loop kernel (port of gsd-pi auto-mode loop).

| Job | How it shows up |
|-----|-----------------|
| kernel | pure guard pipeline: stop flag → foreign live lock → wedge ack → dispatch counters → numberFlag parsing |
| state | per-cwd `.gsd-loop/` durable state: queue, journal (monotonic), wedge.json (disk is authority), crash notes |
| commands | `/gsd-loop start|status|resume|stop|enqueue|record-result|verify-retry` with FIFO preflight and step-mode paused envelope |
| tools | `gsd_loop_*` tool surface |

## How to use

- Hard stops (iteration cap, infrastructure, cooldown/verify exhaustion, error ladder) get classified crash notes; coordination stops (operator STOP, foreign live lock, unacknowledged wedge) do not.
- Resume order: status validation → foreignLockProbe → wedge ack (disk-first unlink); counters reset on EVERY resume.
- Tests: `bun test` from `plugins/gsd-loop` (87/87) + `bash scripts/e2e.sh` (3 units + retry-last, monotonic journal, lock release).

### DO

- DO keep STOP-guard before the complete shortcut in the kernel advance path.
- DON'T write crash notes for coordination stops.
