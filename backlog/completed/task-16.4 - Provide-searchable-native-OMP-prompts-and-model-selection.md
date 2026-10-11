---
id: TASK-16.4
title: Provide searchable native OMP prompts and model selection
status: Done
assignee:
  - t16w2-c
created_date: '2026-08-21 20:16'
updated_date: '2026-08-21 21:20'
labels:
  - feature
  - design
dependencies:
  - TASK-16.1
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/ui/select.ts
  - /tmp/better-custom-research/src/ui/prompts.ts
  - node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts
modified_files:
  - plugins/better-custom/src/ui/select.ts
  - plugins/better-custom/src/ui/prompts.ts
  - plugins/better-custom/package.json
parent_task_id: TASK-16
priority: medium
type: feature
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the interactive selection and prompt surface without inventing host UI APIs. This ticket owns only UI helpers; it must not mutate models config or call the probe engine.

Targets: plugins/better-custom/src/ui/select.ts, plugins/better-custom/src/ui/prompts.ts, and plugins/better-custom/package.json only if the implemented custom selector truly requires the pi-tui peer.

Required contract:
- Reuse ctx.ui.input, ctx.ui.select, ctx.ui.confirm, and ctx.ui.notify for ordinary prompts.
- Port searchable single-select and multi-select picker behavior through ctx.ui.custom; OMP has no native multi-select. Preserve filtered search, selected-state visibility, keyboard completion/cancel behavior, and typed return values.
- Use ctx.ui.setWorkingMessage for progress text; do not fabricate a spinner API.
- A canceled prompt returns an explicit cancel result and causes no persistence by its caller.
- Keep imports within zero-dependency policy; add @oh-my-pi/pi-tui@17.3.8 only if the source actually imports it.

Verify through focused deterministic UI/helper tests or the repository's existing TUI test seam, with no real terminal interaction required.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can search and choose one option or select multiple options through OMP UI helpers, including a keyboard-cancel path with no chosen value.
- [x] #2 Ordinary text, select, confirmation, notification, and progress interactions use the documented native OMP UI methods rather than unsupported multiselect or spinner APIs.
- [x] #3 The selector implementation remains within the plugin's zero-external-dependency package contract.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add dependency-free selector core in plugins/better-custom/src/ui/select.ts: normalize/string item handling, case-insensitive filtering over label/value/suffix/description/searchText, explicit CANCEL sentinel, and native OMP pi-tui custom component rendering/keyboard handling for single and multi selection.
2. Port plugins/better-custom/src/ui/prompts.ts around the shared CommandContext seam: delegate ordinary input/select/confirm/notify flows to ctx.ui natives, expose progress via setWorkingMessage when available, and retain cancellation as null/undefined without persistence side effects.
3. Keep the package manifest dependency-free; add the pinned @oh-my-pi/pi-tui peer only if selector implementation imports its key/width helpers.
4. Add deterministic root coverage in test/better-custom-ui.test.ts for normalization/filtering/typed cancel behavior and native prompt delegation, using fake UI/context seams only.
5. Verify focused Bun tests and plugin diagnostics; append evidence and check only supported acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
UI files and focused tests are complete. Native select adapter strips internal value fields before calling host API and maps returned labels back to typed values. Progress helper delegates only to optional setWorkingMessage; no spinner API used.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: t16w2-c
created: 2026-08-21 21:08
---
Implemented the OMP UI kit in `plugins/better-custom/src/ui/select.ts` and `src/ui/prompts.ts`: searchable single-select and multi-select custom components now normalize/filter options, preserve checked state across queries, handle arrows/space/enter/backspace/Esc/Ctrl-C, and convert an explicit cancellation sentinel to null. Ordinary text/select/confirm/notify paths use native `ctx.ui` methods; progress uses `setWorkingMessage` only. Added pinned `@oh-my-pi/pi-tui` peer because selector rendering imports its key/width helpers. Added deterministic `test/better-custom-ui.test.ts` covering pure matching, typed selection/cancellation, native label mapping, and progress.

Verification: `bun test test/better-custom-ui.test.ts` -> 5 pass, 0 fail, 18 expectations; `bun test test/manifest.test.ts` -> 50 pass, 0 fail; `bun run check` exits 2 on existing unrelated repository diagnostics, with zero `plugins/better-custom` or `test/better-custom-ui` diagnostics. No config mutation or probe calls are present in the UI slice.
---

author: t16j-16.4
created: 2026-08-21 21:20
---
[review passed] t16j-16.4: Scoped review covered plugins/better-custom/src/ui/select.ts, src/ui/prompts.ts, test/better-custom-ui.test.ts, and package.json only. `bun test test/better-custom-ui.test.ts` passed (5/5, 18 expectations); `bun test test/manifest.test.ts` passed (50/50). `bunx tsc --noEmit` exits 2 on unrelated extensible-workflows/repository diagnostics, with zero diagnostics mentioning better-custom. Selector uses pi-tui Key/matchesKey/truncateToWidth; peer is exactly @oh-my-pi/pi-tui 17.3.8 and dependencies remain {}. Native input/select/confirm/notify paths and setWorkingMessage are used; no spinner/multiselect/config/probe imports or persistence calls. SELECT_CANCEL is a stable exported Symbol; CANCELLED/CANCEL are identity aliases and public helpers convert only that sentinel to typed null, with no competing cancellation values. No blockers found. Follow-up design note: aliases could be consolidated if API surface is revisited, but current identity equality prevents silent cancellation ambiguity.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
UI kit ported: src/ui/select.ts (pure normalize/filter/match helpers + searchable single/multi selectors on ui.custom; stable SELECT_CANCEL Symbol sentinel, aliases same identity; arrows/space/enter/backspace/Esc/Ctrl-C), src/ui/prompts.ts (native input/select/confirm/notify delegation with host label↔value adapter; setWorkingMessage progress; zero config/probe coupling), package.json pi-tui peer @17.3.8 (genuinely imported: Key/matchesKey/truncateToWidth), test/better-custom-ui.test.ts. Verification: focused 5/5 (18 expects), manifest suite 50/50, tsc zero better-custom diagnostics, scope paths clean. Judge: REVIEW_PASSED, no blockers.
<!-- SECTION:FINAL_SUMMARY:END -->
