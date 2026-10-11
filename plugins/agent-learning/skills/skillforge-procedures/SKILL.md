---
name: skillforge-procedures
description: Procedures lane deep-dive — structured evidence memories (gotcha/decision/pattern), promotion thresholds (confirmed + hits>=3 + target skills), human-gated SKILL.md patches, /skillforge and /learning skillforge commands, memory browser. Use when capturing verified engineering lessons or reviewing pending skill patches.
---
# Skillforge Procedures (evidence -> patches)

Structured memory for verified engineering lessons, with a human-gated path into skill files.

## Flow

1. Call the capture tool (skillforge_capture_memory) — store entry with trigger / symptom / root_cause / fix / verification arrays, scope (languages/tools/files/projects), confidence, target skills[].
2. Eligibility: confidence=confirmed AND hits>=3 AND skills non-empty -> patch proposal JSON written under the store.
3. "/learning skillforge review <skill>" (alias "/skillforge review") — human reviews rationale + verification evidence, then approves apply.
4. Applied patches append a "## Skillforge learnings" section to the target user skill.

## Store

- Root: <agentDir>/agent-learning/ (pre-consolidation <agentDir>/skillforge/ migrates automatically on first write; never clobbers an existing new store).
- Partitions: project (git-remote-derived project id) and global.
- Index rebuilt atomically after each save.

## DO

- DO include a falsifiable verification line ("bun test X passes", file:line citation).
- DO set partition=project for repo-specific lessons; global only if reusable everywhere.
- DO use skills[] targeting sparingly — only skills that genuinely should carry the lesson.

## DON'T

- DON'T save drafts with placeholder text — validation rejects them by design.
- DON'T bump hits manually without new evidence.
- DON'T expect pre-turn injection anymore — removal is intentional (native memory recall covers context); query via /learning skillforge list instead.

## Recovery

- Ambiguous delete id -> "/learning skillforge delete global|project <id>" disambiguates.
