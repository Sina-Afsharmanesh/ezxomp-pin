---
name: experiences-habits
description: Human-reviewed behavioral habits — /experience setup panel, conversational habit drafting (agent_experience_draft_habit / confirm_habit), numbered review, analyze, law overrides, provenance-marked steering. Use when declaring work preferences or reviewing suggested habits.
---
# Experiences (habits lane)

Skills tell you what to do; memory tells you what to know; habits shape HOW the agent works with you — always human-reviewed.

## Tools

- `agent_experience_draft_habit` — draft an exact When:/Do: habit from natural conversation.
- `agent_experience_confirm_habit` — save the draft after explicit user confirmation in a later message.
- `agent_experience_list_review` — numbered plain-language review items.
- `agent_experience_apply_review` — apply a decision the user named by number.

Command: `/experience` (setup panel: capture, analyze, retention, reminders, duplicates, schedule).

## DO

- DO show the exact draft wording and wait for a clear yes in a LATER user message before confirming.
- DO route repeated-behavior suggestions through Analyze + explicit Approve/Reject.
- DO respect the law file (~/.agents/experience/law.md); direct instructions and law override habits.

## DON'T

- DON'T auto-approve, auto-merge, or reword an approved habit without new approval.
- DON'T expose internal IDs, checksums, scores, or paths in conversation.
- DON'T convert one-off task facts or credentials into habits.

## Recovery

- Panel missing after update → restart OMP, then /experience setup again.
- Duplicate suggestions → resolve via the numbered review; never silently merge.
