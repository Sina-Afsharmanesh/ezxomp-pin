---
id: TASK-56.3
title: OMP Shake and snapcompact extension contracts are evidenced
status: Done
assignee:
  - '@Researcher563'
created_date: '2026-08-30 00:14'
updated_date: '2026-08-30 00:36'
labels:
  - research
  - architecture
dependencies: []
parent_task_id: TASK-56
priority: high
type: spike
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Research OMP 18.0.6 native Shake and @oh-my-pi/snapcompact 18.0.6 from installed source/types. Determine supported public plugin hooks/actions/settings for composing with them, and document the negative controls that would replace or bypass native behavior. Include session_before_compact effects, ctx.compact CompactOptions, lifecycle hooks, artifact:// recovery, snapcompact frame/provider/data budgets, and marketplace dependency resolution. Publish a Backlog research document; do not edit production files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Backlog research document cites exact OMP and snapcompact source/type locations for all claimed extension points and budgets.
- [x] #2 The document distinguishes public supported extension surfaces from private core APIs and unavailable hooks, including whether Shake can be directly invoked by an extension.
- [x] #3 The document proves how session_before_compact handlers affect native speculation/snapcompact selection and records extend-not-overwrite negative controls.
- [x] #4 The document records marketplace resolution constraints from docs/authoring-extensions.md and snapcompact’s installed dependency position.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify OMP 18.0.6 public extension/hook contracts in pi-coding-agent source/types: ExtensionContext, event payloads/results, transform semantics, and compact invocation adapter.
2. Trace native session-maintenance selection to prove session_before_compact speculation suppression, fromHook snapcompact bypass, native Shake dispatch, and snapcompact host safeguards.
3. Verify @oh-my-pi/snapcompact 18.0.6 exports, budgets, archive/preserveData, and history reconstruction from src plus shipped dist/types.
4. Compare plugins/ultra-compact/extensions/index.ts and engine.ts to the native contracts; identify supported extend-not-overwrite seams and negative controls.
5. Run isolated economic/security/performance/UX ADHD frames, focus the candidates, publish a cited Backlog research document, then record objective evidence and check only proven ACs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research published as doc-14 at backlog/docs/compact-eng/omp-native-extension-contracts/doc-14 - OMP-18.0.6-Shake-and-snapcompact-extension-contracts-for-compact-eng.md. Objective verification: backlog_doc_view returned the complete document with exact source/type citations, research tag, facts/interpretations, ADHD ranking, AC map, and extend-not-overwrite controls. Confirmed: (a) any registered session_before_compact handler suppresses speculative start, threshold deferral, and armed-result claim; (b) a supplied compaction becomes kind=fromHook/fromExtension and bypasses native snapcompact selection; (c) ExtensionContext exposes getContextUsage() and compact(), while HookContext omits both. Confirmed no public before_compact name and no public ExtensionContext Shake action. Context packet correction: active pi-coding-agent resolves to 18.0.6+8543910243e3315e, not the packet's 1d12 hash. Tooling limitation: backlog_doc_create/update advertise research type and tags, but installed Backlog CLI rejects --tags during create and rejects research type; the verified document therefore uses legacy type=other plus tag=research. Both mismatches were reported through xd://report_issue.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published and verified doc-14 with local OMP 18.0.6/pi-agent-core/snapcompact source and shipped-type evidence. It confirms session_before_compact presence suppresses speculation, hook compactions become fromHook and bypass native snapcompact, ExtensionContext exposes usage/native compact but no Shake action, and the safe architecture is native auto-maintenance plus observational/additive governance. Verified all four ACs through backlog_doc_view; documented the installed Backlog CLI’s research-type metadata mismatch.
<!-- SECTION:FINAL_SUMMARY:END -->
