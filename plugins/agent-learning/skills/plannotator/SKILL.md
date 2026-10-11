---
name: plannotator
description: Visual plan/diff/PR review gates in the browser — annotate markdown specs, approve or request changes on plans and diffs, expose reviews over tailnet, hand reviewer feedback back to the agent. Use when a plan or diff needs explicit human sign-off before implementation.
---
# Plannotator (review gates)

Turns plans/specs/diffs into browser-annotatable review pages with approve/request-changes gates.

## Surface

- Registers a plan-submission tool plus the annotated-review runtime (index.bundle.js + HTML assets).
- Typical loop: submit artifact → human annotates in browser → agent applies requested changes → re-review.

## DO

- DO submit a plan for annotation BEFORE implementing when scope is ambiguous.
- DO classify feedback: request-changes vs question vs nitpick; answer questions inline.
- DO re-submit after material revisions; small wording fixes can be applied directly.

## DON'T

- DON'T treat approval as covering unsubmitted follow-up scope — submit additions separately.
- DON'T block on review for trivial mechanical changes; use judgment and say so.

## Recovery

- Review page unreachable remotely → check the tailnet URL/printout in the review receipt; restart the gated review if expired.
