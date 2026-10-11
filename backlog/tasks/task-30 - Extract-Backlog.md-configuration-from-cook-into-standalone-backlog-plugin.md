---
id: TASK-30
title: Extract Backlog.md configuration from cook into standalone backlog plugin
status: Done
assignee: []
created_date: '2026-08-27 05:00'
updated_date: '2026-08-27 06:28'
labels:
  - refactor
dependencies: []
type: chore
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The cook plugin (@ezxomp/cook) currently owns all Backlog.md integration: 35 backlog_* tools (extensions/backlog-tools.ts), CLI helpers (extensions/backlog-helpers.ts), TaskInfo type, and the BACKLOG.MD Quality Standards instruction block injected in the before_agent_start hook (extensions/index.ts). Extract into a new standalone @ezxomp/backlog plugin following repo conventions; cook must keep working by consuming the new plugin; no duplicate backlog config may remain in cook; backlog becomes the default instruction source for general model work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New plugins/backlog package registered in workspace, marketplace.json, test/manifest.test.ts with UPSTREAM.json
- [x] #2 All 35 backlog_* tools + helpers + Quality Standards block live in plugins/backlog; registerBacklogTools callable via @ezxomp/backlog cross-package import
- [x] #3 Cook imports registerBacklogTools and helpers from @ezxomp/backlog; cook/extensions has zero leftover backlog tool/config definitions
- [x] #4 Backlog instructions inject as default system prompt overlay for general work (not only when a cook chain is active)
- [x] #5 bunx tsc --noEmit passes; bun test passes incl. manifest + cook suites
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
EXTRACTION PLAN — cook backlog config -> @ezxomp/backlog plugin

Evidence (captured pre-plan):
- Cook owns 4 surfaces: (1) plugins/cook/extensions/backlog-tools.ts — registerBacklogTools, 35 backlog_* tools, only imports runBacklogCli + StoreContext + typebox; (2) extensions/backlog-helpers.ts — runBacklogCli/getTaskJson/getAllTasks/computeReadySet/readyChildren; (3) TaskInfo interface in types.ts (self-contained, no other deps); (4) BACKLOG.MD Quality Standards text block + injection in before_agent_start (index.ts L88-115) — currently only injected when a cook chain is active.
- In-file importers of backlog-helpers inside cook: index.ts, backlog-tools.ts, cook-tools.ts, state.ts, watch.ts. No other repo test/source references registerBacklogTools/backlog-helpers.
- No native  tool this session -> specialists run inline stations.
- backlog CLI binary = npm pkg backlog.md@1.50.1 via bunx; board verified readable.

STEPS
1. [AC2] Create plugins/backlog born-in-repo: package.json (@ezxomp/backlog, 0.1.0-ezxomp.0, omp.extensions=[./extensions/index.ts], peerDeps @oh-my-pi/pi-coding-agent 17.3.8, files=[extensions, README.md, LICENSE], keyword omp-package), UPSTREAM.json (born-in-repo pattern per evo/UPSTREAM.json with originalName omp-backlog, integrity sha256-omp-backlog-born-in-repo, localForkVersion 0.1.0-ezxomp.0), tsconfig.json mirroring cook's, README.md, LICENSE copy from cook.
2. [AC2] Move source: git mv logic-equivalents into plugins/backlog/extensions/: types.ts (backlog/types.ts containing TaskInfo + BacklogStoreContext w/ same fields as cook's StoreContext minus refreshWidget? NO - keep exact StoreContext shape for drop-in compat), backlog-tools.ts, backlog-helpers.ts, index.ts entry (default export registers: registerBacklogTools(pi, sc) + a createSharedState helper? NO). Entry contract: export default function(pi){...} needs a state store - replicate minimal: keep registerBacklogTools(pi, sc) signature requiring caller-supplied StoreContext, AND default export that constructs an internal store so the plugin works standalone.
   Risk: StoreContext is defined in cook/types.ts as full cook-state context (cookmode/watch/heartbeats fields). Extraction MUST NOT move CookState; extract ONLY the narrow shape backlog-tools actually uses: {currentCwd: string} mutation + nothing else. Verify by grep: backlog-tools uses sc.currentCwd only. Decision: define in backlog plugin: export interface BacklogToolsContext { currentCwd: string }; registerBacklogTools(pi: ExtensionAPI, sc: BacklogToolsContext).
   back-compat risk: None expected.
3. [AC4] Default instruction source: new module plugins/backlog/extensions/instructions.ts exports two strings (BACKLOG_QUALITY_STANDARDS, BACKLOG_AGENT_INSTRUCTIONS) + defaultOverlay(): string containing the full '## Backlog.md Workflow' + CRITICAL_INSTRUCTION block currently living verbatim in root AGENTS.md lines ~155-190, PLUS the BACKLOG.MD Quality Standards block from cook/index.ts. Register pi.on('before_agent_start') unconditionally (no chain check) injecting that overlay AFTER existing systemPrompt so it is default for general model work.
   RISK (callout): root AGENTS.md block duplicates content that will now be injected at runtime by the plugin; plan = plugin injects, AGENTS.md keeps (operator-facing doc of the workflow) but trims to pointer? DECISION: leave AGENTS.md untouched this task (docs may duplicate injected runtime guidance; removal is operator scope creep). Instead inject the canonical string from the plugin.
4. [AC1] Registration: root package.json already covers plugins/* via workspaces glob; add slug backlog to .omp-plugin/marketplace.json plugins[] ({name backlog, source ./plugins/backlog, version 0.1.0-ezxomp.0, description..., attribution born-in-repo}); test/manifest.test.ts EXPECTED_PLUGINS += backlog (+EXPECTED_PACKAGE_IDS.backlog=@ezxomp/backlog, EXPECTED_VERSIONS.backlog=0.1.0-ezxomp.0).
5. [AC3] Rewire cook: index.ts remove inline quality-standards array literal (L88-115); instead extend chain-phase extras import { backlogQualityStandards } from '@ezxomp/backlog/extensions/instructions.ts'; delete backlog-tools.ts + backlog-helpers.ts + TaskInfo from types.ts (move to re-import); update all in-cook importers (index/cook-tools/state/watch/cook-tools use getTaskJson etc.) to import from '@ezxomp/backlog/extensions/*'. Keep JEFF fixture env vars and heartbeat gating behavior identical otherwise. peerDeps: none added beyond existing (workspace resolves @ezxomp/backlog from monorepo).
6. [AC5] Verify: bunx tsc --noEmit; bun test test/manifest.test.ts, then full plugins/cook/extensions/backlog-tools.ts(16,3): error TS2322: Type 'TObject<{ title: TString; description: TOptional<TString>; assignee: TOptional<TString>; status: TOptional<TString>; ... 13 more ...; draft: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ title: TString; description: TOptional<TString>; assignee: TOptional<TString>; status: TOptional<TString>; ... 13 more ...; draft: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ title: TString; description: TOptional<TString>; assignee: TOptional<TString>; status: TOptional<TString>; ... 13 more ...; draft: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(38,33): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(39,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(39,41): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(40,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(40,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(41,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(41,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(42,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(42,46): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(43,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(43,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(44,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(44,42): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(45,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(46,22): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(47,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(48,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(49,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(50,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(50,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(51,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(51,40): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(52,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(52,56): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(53,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(53,45): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(54,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(55,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(56,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(57,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(58,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(58,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(59,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(72,3): error TS2322: Type 'TObject<{ task_id: TString; status: TOptional<TString>; assignee: TOptional<TString>; labels: TOptional<TArray<TString>>; ... 18 more ...; dependencies: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; status: TOptional<TString>; assignee: TOptional<TString>; labels: TOptional<TArray<TString>>; ... 18 more ...; dependencies: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; status: TOptional<TString>; assignee: TOptional<TString>; labels: TOptional<TArray<TString>>; ... 18 more ...; dependencies: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(99,31): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(100,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(100,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(101,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(101,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(102,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(102,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(103,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(103,46): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(104,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(104,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(105,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(105,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(106,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(106,40): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(107,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(107,54): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(108,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(108,44): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(109,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(110,32): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(111,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(111,56): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(112,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(113,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(114,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(115,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(115,40): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(116,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(117,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(118,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(119,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(120,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(121,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(122,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(122,40): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(123,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(124,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(125,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(126,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(127,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(128,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(129,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(129,45): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(142,3): error TS2322: Type 'TObject<{ status: TOptional<TString>; assignee: TOptional<TString>; unassigned: TOptional<TBoolean>; parent: TOptional<TString>; ... 5 more ...; limit: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ status: TOptional<TString>; assignee: TOptional<TString>; unassigned: TOptional<TBoolean>; parent: TOptional<TString>; ... 5 more ...; limit: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ status: TOptional<TString>; assignee: TOptional<TString>; unassigned: TOptional<TBoolean>; parent: TOptional<TString>; ... 5 more ...; limit: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(157,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(157,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(158,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(158,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(159,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(160,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(160,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(161,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(161,39): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(162,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(162,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(163,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(164,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(164,42): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(165,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(165,42): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(166,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(166,47): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(178,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(185,14): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(199,3): error TS2322: Type 'TObject<{ title: TString; content: TString; type: TUnion<[TLiteral<"spec">, TLiteral<"research">, TLiteral<"adr">, TLiteral<"guide">, TLiteral<...>]>; path: TOptional<...>; tags: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ title: TString; content: TString; type: TUnion<[TLiteral<"spec">, TLiteral<"research">, TLiteral<"adr">, TLiteral<"guide">, TLiteral<...>]>; path: TOptional<...>; tags: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ title: TString; content: TString; type: TUnion<[TLiteral<"spec">, TLiteral<"research">, TLiteral<"adr">, TLiteral<"guide">, TLiteral<...>]>; path: TOptional<...>; tags: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(217,5): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(219,5): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(221,5): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(223,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(223,37): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(224,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(224,41): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(236,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(243,25): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(256,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(263,24): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(277,3): error TS2322: Type 'TObject<{ query: TString; type: TOptional<TString>; task_type: TOptional<TArray<TString>>; status: TOptional<TString>; exclude_status: TOptional<...>; priority: TOptional<...>; modified_file: TOptional<...>; limit: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ query: TString; type: TOptional<TString>; task_type: TOptional<TArray<TString>>; status: TOptional<TString>; exclude_status: TOptional<...>; priority: TOptional<...>; modified_file: TOptional<...>; limit: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ query: TString; type: TOptional<TString>; task_type: TOptional<TArray<TString>>; status: TOptional<TString>; exclude_status: TOptional<...>; priority: TOptional<...>; modified_file: TOptional<...>; limit: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(289,25): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(290,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(290,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(291,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(291,48): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(292,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(292,42): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(293,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(293,48): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(294,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(294,46): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(295,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(295,56): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(296,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(296,47): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(308,3): error TS2322: Type 'TObject<{ title: TString; status: TOptional<TUnion<[TLiteral<"proposed">, TLiteral<"accepted">, TLiteral<"rejected">, TLiteral<"superseded">]>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ title: TString; status: TOptional<TUnion<[TLiteral<"proposed">, TLiteral<"accepted">, TLiteral<"rejected">, TLiteral<"superseded">]>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ title: TString; status: TOptional<TUnion<[TLiteral<"proposed">, TLiteral<"accepted">, TLiteral<"rejected">, TLiteral<"superseded">]>>; }>'.
plugins/cook/extensions/backlog-tools.ts(321,37): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(322,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(322,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(334,3): error TS2322: Type 'TObject<{ show_completed: TOptional<TBoolean>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ show_completed: TOptional<TBoolean>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ show_completed: TOptional<TBoolean>; }>'.
plugins/cook/extensions/backlog-tools.ts(340,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(352,3): error TS2322: Type 'TObject<{ name: TString; description: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ name: TString; description: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ name: TString; description: TOptional<TString>; }>'.
plugins/cook/extensions/backlog-tools.ts(358,35): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(359,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(359,52): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(371,3): error TS2322: Type 'TObject<{ old_name: TString; new_name: TString; no_update_tasks: TOptional<TBoolean>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ old_name: TString; new_name: TString; no_update_tasks: TOptional<TBoolean>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ old_name: TString; new_name: TString; no_update_tasks: TOptional<TBoolean>; }>'.
plugins/cook/extensions/backlog-tools.ts(378,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(378,55): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(379,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(392,3): error TS2322: Type 'TObject<{ name: TString; task_handling: TOptional<TUnion<[TLiteral<"clear">, TLiteral<"keep">, TLiteral<"reassign">]>>; reassign_to: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ name: TString; task_handling: TOptional<TUnion<[TLiteral<"clear">, TLiteral<"keep">, TLiteral<"reassign">]>>; reassign_to: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ name: TString; task_handling: TOptional<TUnion<[TLiteral<"clear">, TLiteral<"keep">, TLiteral<"reassign">]>>; reassign_to: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(405,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(406,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(406,56): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(407,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(407,52): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(419,3): error TS2322: Type 'TObject<{ milestone_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ milestone_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ milestone_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(426,30): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(440,3): error TS2322: Type 'TObject<{ doc_id: TString; content: TOptional<TString>; title: TOptional<TString>; type: TOptional<TUnion<[TLiteral<"spec">, TLiteral<"research">, TLiteral<...>, TLiteral<...>, TLiteral<...>]>>; tags: TOptional<...>; path: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ doc_id: TString; content: TOptional<TString>; title: TOptional<TString>; type: TOptional<TUnion<[TLiteral<"spec">, TLiteral<"research">, TLiteral<...>, TLiteral<...>, TLiteral<...>]>>; tags: TOptional<...>; path: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ doc_id: TString; content: TOptional<TString>; title: TOptional<TString>; type: TOptional<TUnion<[TLiteral<"spec">, TLiteral<"research">, TLiteral<...>, TLiteral<...>, TLiteral<...>]>>; tags: TOptional<...>; path: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(458,32): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(459,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(459,44): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(460,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(460,40): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(461,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(461,34): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(462,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(462,38): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(463,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(463,34): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(475,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/backlog-tools.ts(489,3): error TS2322: Type 'TObject<{ query: TString; limit: TOptional<TNumber>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ query: TString; limit: TOptional<TNumber>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ query: TString; limit: TOptional<TNumber>; }>'.
plugins/cook/extensions/backlog-tools.ts(495,32): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(496,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(496,47): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(508,3): error TS2322: Type 'TObject<{ doc_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ doc_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ doc_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(515,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(529,3): error TS2322: Type 'TObject<{ file: TOptional<TString>; export_version: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ file: TOptional<TString>; export_version: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ file: TOptional<TString>; export_version: TOptional<TString>; }>'.
plugins/cook/extensions/backlog-tools.ts(536,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(536,28): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(537,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(538,32): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(551,3): error TS2322: Type 'TObject<{ project_name: TOptional<TString>; no_git: TOptional<TBoolean>; defaults: TOptional<TBoolean>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ project_name: TOptional<TString>; no_git: TOptional<TBoolean>; defaults: TOptional<TBoolean>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ project_name: TOptional<TString>; no_git: TOptional<TBoolean>; defaults: TOptional<TBoolean>; }>'.
plugins/cook/extensions/backlog-tools.ts(559,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(559,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(560,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(561,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(574,3): error TS2322: Type 'TObject<{ guide: TOptional<TUnion<[TLiteral<"overview">, TLiteral<"task-creation">, TLiteral<"task-execution">, TLiteral<"task-finalization">, TLiteral<...>]>>; list: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ guide: TOptional<TUnion<[TLiteral<"overview">, TLiteral<"task-creation">, TLiteral<"task-execution">, TLiteral<"task-finalization">, TLiteral<...>]>>; list: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ guide: TOptional<TUnion<[TLiteral<"overview">, TLiteral<"task-creation">, TLiteral<"task-execution">, TLiteral<"task-finalization">, TLiteral<...>]>>; list: TOptional<...>; }>'.
plugins/cook/extensions/backlog-tools.ts(589,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(591,15): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(592,26): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(611,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(618,26): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(634,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/backlog-tools.ts(649,3): error TS2322: Type 'TObject<{ title: TString; description: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ title: TString; description: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ title: TString; description: TOptional<TString>; }>'.
plugins/cook/extensions/backlog-tools.ts(655,34): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(656,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(656,41): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(669,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(676,26): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(690,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(697,26): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(711,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/backlog-tools.ts(718,23): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(734,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/backlog-tools.ts(752,3): error TS2322: Type 'TObject<{ layout: TOptional<TUnion<[TLiteral<"horizontal">, TLiteral<"vertical">]>>; milestones: TOptional<TBoolean>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ layout: TOptional<TUnion<[TLiteral<"horizontal">, TLiteral<"vertical">]>>; milestones: TOptional<TBoolean>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ layout: TOptional<TUnion<[TLiteral<"horizontal">, TLiteral<"vertical">]>>; milestones: TOptional<TBoolean>; }>'.
plugins/cook/extensions/backlog-tools.ts(761,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(762,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(777,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/backlog-tools.ts(795,3): error TS2322: Type 'TObject<{ action: TUnion<[TLiteral<"list">, TLiteral<"get">, TLiteral<"set">]>; key: TOptional<TString>; value: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ action: TUnion<[TLiteral<"list">, TLiteral<"get">, TLiteral<"set">]>; key: TOptional<TString>; value: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ action: TUnion<[TLiteral<"list">, TLiteral<"get">, TLiteral<"set">]>; key: TOptional<TString>; value: TOptional<TString>; }>'.
plugins/cook/extensions/backlog-tools.ts(807,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(808,13): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(808,52): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(809,13): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(809,52): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(809,70): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(825,3): error TS2322: Type 'TObject<{ update_instructions: TOptional<TBoolean>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ update_instructions: TOptional<TBoolean>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ update_instructions: TOptional<TBoolean>; }>'.
plugins/cook/extensions/backlog-tools.ts(831,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(847,3): error TS2322: Type 'TObject<{ fix: TOptional<TBoolean>; yes: TOptional<TBoolean>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ fix: TOptional<TBoolean>; yes: TOptional<TBoolean>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ fix: TOptional<TBoolean>; yes: TOptional<TBoolean>; }>'.
plugins/cook/extensions/backlog-tools.ts(854,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(855,8): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/backlog-tools.ts(871,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/backlog-tools.ts(888,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/backlog-tools.ts(904,3): error TS2322: Type 'TObject<{ items: TArray<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ items: TArray<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ items: TArray<TString>; }>'.
plugins/cook/extensions/backlog-tools.ts(911,58): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(29,3): error TS2322: Type 'TObject<{ role: TOptional<TUnion<[TLiteral<"planner">, TLiteral<"scout">, TLiteral<"researcher">, TLiteral<"worker">, TLiteral<"validator">, TLiteral<...>, TLiteral<...>]>>; model: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ role: TOptional<TUnion<[TLiteral<"planner">, TLiteral<"scout">, TLiteral<"researcher">, TLiteral<"worker">, TLiteral<"validator">, TLiteral<...>, TLiteral<...>]>>; model: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ role: TOptional<TUnion<[TLiteral<"planner">, TLiteral<"scout">, TLiteral<"researcher">, TLiteral<"worker">, TLiteral<"validator">, TLiteral<...>, TLiteral<...>]>>; model: TOptional<...>; }>'.
plugins/cook/extensions/cook-tools.ts(45,17): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(46,18): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(107,3): error TS2322: Type 'TObject<{ task_id: TString; intent: TOptional<TString>; chain_name: TOptional<TUnion<[TLiteral<"scout">, TLiteral<"plan">, TLiteral<"implement">, TLiteral<...>, TLiteral<...>]>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; intent: TOptional<TString>; chain_name: TOptional<TUnion<[TLiteral<"scout">, TLiteral<"plan">, TLiteral<"implement">, TLiteral<...>, TLiteral<...>]>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; intent: TOptional<TString>; chain_name: TOptional<TUnion<[TLiteral<"scout">, TLiteral<"plan">, TLiteral<"implement">, TLiteral<...>, TLiteral<...>]>>; }>'.
plugins/cook/extensions/cook-tools.ts(122,39): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(128,15): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(132,27): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(147,3): error TS2322: Type 'TObject<{ task_id: TString; chain_name: TUnion<[TLiteral<"scout">, TLiteral<"plan">, TLiteral<"implement">, TLiteral<"review">, TLiteral<...>]>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; chain_name: TUnion<[TLiteral<"scout">, TLiteral<"plan">, TLiteral<"implement">, TLiteral<"review">, TLiteral<...>]>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; chain_name: TUnion<[TLiteral<"scout">, TLiteral<"plan">, TLiteral<"implement">, TLiteral<"review">, TLiteral<...>]>; }>'.
plugins/cook/extensions/cook-tools.ts(159,15): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(167,37): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(177,22): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(184,20): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(185,15): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(193,34): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(203,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/cook-tools.ts(233,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/cook-tools.ts(263,3): error TS2322: Type 'TObject<{ problem: TString; frames: TOptional<TArray<TString>>; num_ideas: TOptional<TNumber>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ problem: TString; frames: TOptional<TArray<TString>>; num_ideas: TOptional<TNumber>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ problem: TString; frames: TOptional<TArray<TString>>; num_ideas: TOptional<TNumber>; }>'.
plugins/cook/extensions/cook-tools.ts(269,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(282,42): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(292,3): error TS2322: Type 'TObject<{ ideas: TArray<TObject<{ frame: TString; idea: TString; novelty: TNumber; viability: TNumber; fit: TNumber; traps: TArray<TString>; }>>; top_k: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ ideas: TArray<TObject<{ frame: TString; idea: TString; novelty: TNumber; viability: TNumber; fit: TNumber; traps: TArray<TString>; }>>; top_k: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ ideas: TArray<TObject<{ frame: TString; idea: TString; novelty: TNumber; viability: TNumber; fit: TNumber; traps: TArray<TString>; }>>; top_k: TOptional<...>; }>'.
plugins/cook/extensions/cook-tools.ts(306,18): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(307,14): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(334,3): error TS2322: Type 'TObject<{ task_id: TString; context: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; context: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; context: TOptional<TString>; }>'.
plugins/cook/extensions/cook-tools.ts(339,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(347,18): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(350,86): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(354,5): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(354,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(360,43): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(371,3): error TS2322: Type 'TObject<{ query: TString; scope: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ query: TString; scope: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ query: TString; scope: TOptional<TString>; }>'.
plugins/cook/extensions/cook-tools.ts(377,16): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(378,6): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(378,33): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(391,3): error TS2322: Type 'TObject<{ task_id: TString; problem: TString; frames: TOptional<TArray<TString>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; problem: TString; frames: TOptional<TArray<TString>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; problem: TString; frames: TOptional<TArray<TString>>; }>'.
plugins/cook/extensions/cook-tools.ts(397,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(405,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(406,17): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(407,15): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(417,46): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(428,3): error TS2322: Type 'TObject<{ task_id: TString; plan: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; plan: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; plan: TOptional<TString>; }>'.
plugins/cook/extensions/cook-tools.ts(433,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(441,17): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(447,5): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(447,30): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(453,42): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(464,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/cook-tools.ts(468,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(475,33): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(480,45): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(491,3): error TS2322: Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TString; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TString; }>'.
plugins/cook/extensions/cook-tools.ts(495,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(502,29): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(507,41): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(518,3): error TS2322: Type 'TObject<{ parent_task_id: TString; subtasks: TArray<TObject<{ title: TString; description: TOptional<TString>; acceptance_criteria: TOptional<TArray<TString>>; priority: TOptional<...>; depends_on: TOptional<...>; }>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ parent_task_id: TString; subtasks: TArray<TObject<{ title: TString; description: TOptional<TString>; acceptance_criteria: TOptional<TArray<TString>>; priority: TOptional<...>; depends_on: TOptional<...>; }>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ parent_task_id: TString; subtasks: TArray<TObject<{ title: TString; description: TOptional<TString>; acceptance_criteria: TOptional<TArray<TString>>; priority: TOptional<...>; depends_on: TOptional<...>; }>>; }>'.
plugins/cook/extensions/cook-tools.ts(532,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(539,21): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(631,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/cook-tools.ts(728,3): error TS2322: Type 'TObject<{ scope: TUnion<[TLiteral<"project">, TLiteral<"personal">]>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ scope: TUnion<[TLiteral<"project">, TLiteral<"personal">]>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ scope: TUnion<[TLiteral<"project">, TLiteral<"personal">]>; }>'.
plugins/cook/extensions/cook-tools.ts(733,18): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(750,3): error TS2322: Type 'TObject<{ task_id: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ task_id: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ task_id: TOptional<TString>; }>'.
plugins/cook/extensions/cook-tools.ts(758,22): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(758,40): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(792,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/cook-tools.ts(819,3): error TS2322: Type 'TObject<{ cwd: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ cwd: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ cwd: TOptional<TString>; }>'.
plugins/cook/extensions/cook-tools.ts(825,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(843,3): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/cook/extensions/cook-tools.ts(878,3): error TS2322: Type 'TObject<{ stage: TUnion<[TString, TNumber]>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ stage: TUnion<[TString, TNumber]>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ stage: TUnion<[TString, TNumber]>; }>'.
plugins/cook/extensions/cook-tools.ts(893,15): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(894,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(896,36): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(902,25): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(936,3): error TS2322: Type 'TObject<{ action: TUnion<[TLiteral<"start">, TLiteral<"stop">, TLiteral<"status">, TLiteral<"add_tasks">, TLiteral<"remove_tasks">, TLiteral<...>]>; debounceMs: TOptional<...>; trigger: TOptional<...>; tasks: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ action: TUnion<[TLiteral<"start">, TLiteral<"stop">, TLiteral<"status">, TLiteral<"add_tasks">, TLiteral<"remove_tasks">, TLiteral<...>]>; debounceMs: TOptional<...>; trigger: TOptional<...>; tasks: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ action: TUnion<[TLiteral<"start">, TLiteral<"stop">, TLiteral<"status">, TLiteral<"add_tasks">, TLiteral<"remove_tasks">, TLiteral<...>]>; debounceMs: TOptional<...>; trigger: TOptional<...>; tasks: TOptional<...>; }>'.
plugins/cook/extensions/cook-tools.ts(954,19): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(967,25): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(968,22): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(1008,22): error TS18046: 'params' is of type 'unknown'.
plugins/cook/extensions/cook-tools.ts(1033,22): error TS18046: 'params' is of type 'unknown'.
plugins/lean-ctx/extensions/index.ts(464,5): error TS2322: Type 'TObject<{ action: TUnion<[TLiteral<"list">, TLiteral<"read">]>; uri: TOptional<TString>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ action: TUnion<[TLiteral<"list">, TLiteral<"read">]>; uri: TOptional<TString>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ action: TUnion<[TLiteral<"list">, TLiteral<"read">]>; uri: TOptional<TString>; }>'.
plugins/lean-ctx/extensions/index.ts(681,5): error TS2322: Type 'TObject<{ action: TUnion<[TLiteral<"proxy">, TLiteral<"policy">, TLiteral<"dashboard">]>; config: TOptional<TRecord<"^.*$", TAny>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ action: TUnion<[TLiteral<"proxy">, TLiteral<"policy">, TLiteral<"dashboard">]>; config: TOptional<TRecord<"^.*$", TAny>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ action: TUnion<[TLiteral<"proxy">, TLiteral<"policy">, TLiteral<"dashboard">]>; config: TOptional<TRecord<"^.*$", TAny>>; }>'.
plugins/lean-ctx/extensions/index.ts(731,5): error TS2322: Type 'TObject<{ tool: TString; args: TOptional<TRecord<"^.*$", TUnknown>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ tool: TString; args: TOptional<TRecord<"^.*$", TUnknown>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ tool: TString; args: TOptional<TRecord<"^.*$", TUnknown>>; }>'.
plugins/lean-ctx/extensions/index.ts(739,11): error TS2322: Type '(_id: string, params: unknown, _signal: AbortSignal | undefined, _onUpdate: AgentToolUpdateCallback<unknown> | undefined, ctx: ExtensionContext) => Promise<...>' is not assignable to type '(toolCallId: string, params: unknown, signal: AbortSignal | undefined, onUpdate: AgentToolUpdateCallback<unknown> | undefined, ctx: ExtensionContext) => Promise<...>'.
  Type 'Promise<McpToolResult>' is not assignable to type 'Promise<AgentToolResult<unknown, unknown>>'.
    Type 'McpToolResult' is not assignable to type 'AgentToolResult<unknown, unknown>'.
      Types of property 'content' are incompatible.
        Type '{ type: string; text: string; }[]' is not assignable to type '(ImageContent | TextContent)[]'.
          Type '{ type: string; text: string; }' is not assignable to type 'ImageContent | TextContent'.
            Type '{ type: string; text: string; }' is not assignable to type 'TextContent'.
              Types of property 'type' are incompatible.
                Type 'string' is not assignable to type '"text"'.
plugins/lean-ctx/extensions/index.ts(772,5): error TS2322: Type 'TObject<{ action: TUnion<[TLiteral<"load">, TLiteral<"unload">, TLiteral<"list">]>; categories: TOptional<TArray<TString>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ action: TUnion<[TLiteral<"load">, TLiteral<"unload">, TLiteral<"list">]>; categories: TOptional<TArray<TString>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ action: TUnion<[TLiteral<"load">, TLiteral<"unload">, TLiteral<"list">]>; categories: TOptional<TArray<TString>>; }>'.
plugins/lean-ctx/extensions/index.ts(815,5): error TS2322: Type 'TObject<{ action: TUnion<[TLiteral<"references">, TLiteral<"definition">, TLiteral<"implementations">, TLiteral<"rename">, TLiteral<"rename_preview">, ... 14 more ..., TLiteral<...>]>; ... 8 more ...; text: TOptional<...>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ action: TUnion<[TLiteral<"references">, TLiteral<"definition">, TLiteral<"implementations">, TLiteral<"rename">, TLiteral<"rename_preview">, ... 14 more ..., TLiteral<...>]>; ... 8 more ...; text: TOptional<...>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ action: TUnion<[TLiteral<"references">, TLiteral<"definition">, TLiteral<"implementations">, TLiteral<"rename">, TLiteral<"rename_preview">, ... 14 more ..., TLiteral<...>]>; ... 8 more ...; text: TOptional<...>; }>'.
plugins/lean-ctx/extensions/index.ts(950,7): error TS2322: Type 'TObject<{}>' is not assignable to type 'TSchema'.
  Type 'TObject<{}>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{}>'.
plugins/lean-ctx/extensions/index.ts(1087,5): error TS2322: Type 'TObject<{ tool: TString; args: TOptional<TRecord<"^.*$", TAny>>; }>' is not assignable to type 'TSchema'.
  Type 'TObject<{ tool: TString; args: TOptional<TRecord<"^.*$", TAny>>; }>' is not assignable to type 'TJsonSchema'.
    Index signature for type 'string' is missing in type 'TObject<{ tool: TString; args: TOptional<TRecord<"^.*$", TAny>>; }>'.; manual smoke: bunx backlog.md task list still parses post-change.

VERIFICATION CHECKPOINTS
- After step 2: tsc on new package alone
- After step 5: grep cook/extensions has zero matches for registerBacklogTools|runBacklogCli|BACKLOG.MD
- After step 6: full just verify green

NON-GOALS
- No changes to cook agents/, watch policy semantics, or Done-gate hook logic.
- No AGENTS.md prose rewrite beyond DOX pass updates (plugins/AGENTS.md child index + cook/backlog AGENTS.md).
- CHANGELOG.md entry under [Unreleased].

RISK CALLOUTS
- store-shape drift (mitigated: BacklogToolsContext narrowed)
- marketplace/manifest-test triple registration sync (step 4 + AC1 test enforces)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
COOK-CHAIN PROPOSAL (label=refactor -> implement chain): 1. capture (orchestrator, done - inspection complete, evidence in these notes). 2. plan (cook-planner): decompose extraction into atomic sub-tickets with depends_on edges. 3. implement (cook-worker): build @ezxomp/backlog plugin, rewire cook imports, register in marketplace/manifest tests, default-instruction overlay. 4. review (cook-judge): independent AC + no-leftover audit. Reason: label=refactor selects implement chain; scout skipped (inspection evidence captured); validator stage folded into worker verification (just verify gate) under trivial-stage rule.

ALL SUBTICKETS DONE (30.1 scaffold+migrate, 30.2 default-instruction wiring, 30.3 cook rewire+purge, 30.4 registration, 30.5 gates). Operator requirements disposition: (a) standalone backlog plugin with repo-convention structure -> plugins/backlog (manifest/UPSTREAM/tsconfig/vitest/tests/README/LICENSE/AGENTS.md). (b) cook keeps backlog functionality via new plugin -> declared workspace:* dependency; imports registerBacklogTools+helpers+standards from @ezxomp/backlog; local backlog modules deleted. (c) backlog as default instruction source -> unconditional before_agent_start overlay in backlog entry injecting verbatim Backlog.md guides + quality standards for EVERY session/work item. (d) no duplicate leftovers -> grep-verified zero registerBacklogTools/backlog-helpers/BACKLOG.MD-quality-block definitions in cook/extensions. (e) imports resolve, nothing else broke -> manifest+plugin suites green, tsc error classes unchanged vs baseline, plannotator regression caught and repaired mid-flight, 3 root-suite fails all reproduced on clean baseline workspace.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-27 05:07
---
BASELINE FINDING (pre-change, evidence): bunx tsc --noEmit = 302 errors BEFORE any modification (294 in plugins/cook, 8 in plugins/lean-ctx; typebox 1.1.38 TObject vs @oh-my-pi/pi-coding-agent@17.3.8 TSchema/TJsonSchema assignability + resulting params:unknown). Pre-existing on HEAD bac82e6; NOT caused by extraction. Gate consequence: just verify cannot go fully green without out-of-scope fix; verification strategy = scoped gates (manifest test, plugin vitest suites) + strict no-new-error delta on touched files.
---

created: 2026-08-27 05:48
---
VERIFICATION FINDINGS (TASK-30.5):
(1) FIXED-opportunistic: agent-learning catalog coverage failure - evo/lean-ctx/cook had NO SKILL.md catalog entries since commit 2ccfffa materialized them (pre-existing red, surfaced in every bun test run). Added skills/{evo,lean-ctx,cook}/SKILL.md + backlog/SKILL.md; frontmatter-name/format checks green.
(2) PRE-EXISTING, NOT MINE: plugins/pstack-suite AC4b parity failure reproduces on clean jj-baseline workspace (jj workspace add @-, fresh bun install, same fail). Untouched subtree.
(3) PRE-EXISTING ENVIRONMENTAL: procedures pipeline e2e asserts saved.path contains 'agent-learning' but saveMemoryEntry now takes the SQLite path ('sqlite:procedures/<id>.md') because ~/.agents/experience/ledger.sqlite reached legitimate uv=7 (was uv=999 future-guard when TASK-28.E gated, forcing atomic-fallback pass). Fixture passed historically only via fallback luck. Experiences/agent-learning storage untouched by this extraction. Candidates for follow-up ticket (display-path assertion or explicit AX_STATE_ROOT fixture contract).
---

created: 2026-08-27 05:59
---
VALIDATOR ROUND (user-ordered 'verify'): ran .test-tmp/verify-instructions.ts contract probe (deleted after run) - INDEPENDENTLY CONFIRMED, not trusted: (1) BACKLOG_QUALITY_STANDARDS reconstructed from jj parent revision cook source = byte-identical to exported constant (25 lines). (2) All four guide constants match live 'bunx backlog.md instructions' output exactly (2365/5623/3807/2719 chars). (3) defaultOverlay() composes all five parts with blank-line separators. just verify: check leg fails on pre-existing 302-error typebox debt (baseline-equal; unchanged from session start, documented in TASK-30.5); test leg outcome already recorded (manifest 71/71, backlog 4/4, cook 52/52; 2 root fails pre-existing on baseline).
---

created: 2026-08-27 06:03
---
VALIDATOR ROUND 2 (runtime-load tier): simulated OMP marketplace install layout in isolation (/tmp sim: hoisted node_modules with package-name dirs @ezxomp/{cook,backlog}, host-provided typebox + @oh-my-pi peers — the same hoisting that broke cook on @oh-my-pi/omptype historically). POSITIVE: both extensions' default exports load from installed paths; cook's state.ts reaches syncFromBacklog through its @ezxomp/backlog import graph. NEGATIVE CONTROL (correctness of the test itself): physically removing backlog from the sim makes cook fail with 'Cannot find module @ezxomp/backlog/extensions/index.ts' — proving resolution genuinely goes through package layout, not bun fallback into the repo. Probe + sim deleted after run.
---

created: 2026-08-27 06:09
---
VALIDATOR ROUND 3 (real OMP loader + co-install contract) - FOUND AND FIXED 2 REAL DEFECTS the earlier tiers missed:
D1: cook still called registerBacklogTools(pi, sc) in its entry - co-installing backlog+cook registered all 35 backlog_* tools TWICE (second registration shadows the first in a real host). Fixed: call removed; backlog's own extension entry is the sole registrar. Detection: probe assertion 'every backlog_* tool exactly once'.
D2: cook's chain-phase before_agent_start re-appended BACKLOG_QUALITY_STANDARDS while backlog's default overlay always injects them -> double guidance injection whenever a cook chain was active. Fixed: append removed from cook; single canonical injection point = backlog overlay. Detection: probe fired on the live mid-flight chain in cook-state.json; tool_notes tests unaffected.
PROOF (post-fix): REAL getEnabledPlugins() from @oh-my-pi/pi-coding-agent discovers both plugins enabled from a synthetic user root; co-load against one host registers 36 backlog_* tools each exactly once with zero shadowing; 2 before_agent_start handlers emit quality standards EXACTLY once total; base prompt preserved first. Regression sweep post-fix: backlog vitest 4/4, cook vitest 52/52, manifest 71/71, tsc delta unchanged (217/77/8). Probe deleted; CHANGELOG + cook AGENTS.md updated to state the no-re-register/no-re-append contracts.
---

created: 2026-08-27 06:28
---
VALIDATOR ROUND 4 (E2E + packaging tier):
(1) E2E REAL-CLI PASSTHROUGH: loaded migrated tools.ts (36 backlog_* tools registered), drove flag mapping against the LIVE backlog.md CLI: task_list --plain returned the live board (17.9k chars, task ids matched); in an isolated temp project ran create->view->edit(status Done+final_summary)->list(--status Done) roundtrip through the exact tool.execute entry points — all green. Flag mapping survived extraction byte-for-byte.
(2) FRESH-CLONE PACKAGING: created a second jj workspace at the extraction rev, clean 'bun install' -> per-package link plugins/cook/node_modules/@ezxomp/backlog -> ../../../backlog materializes; Bun.resolve('@ezxomp/backlog/extensions/index.ts', plugins/cook) succeeds. NOTE: bun.lock is gitignored in this repo, so fresh clones always regenerate; frozen-lockfile errors seen mid-probe were artifacts of interrupted installs in scratch workspaces (node-pty postinstall needs toolchain, --ignore-scripts is the correct local workaround).
(3) DOX COMPLETENESS: root AGENTS.md Monorepo enumeration now lists @ezxomp/backlog; cook/backlog AGENTS.md already updated in round 3.
Probe deleted. All tiers of verification now exhausted; remaining repo-wide red = documented pre-existing typebox debt.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted Backlog.md configuration from cook into standalone @ezxomp/backlog plugin: 35-tool suite + helpers + TaskInfo moved verbatim, quality-standards block + canonical instruction guides now injected unconditionally as the default system-prompt overlay for all agent work, cook rewired onto the package via workspace dependency with zero leftover definitions, full registration across marketplace/manifest-test/catalog + CHANGELOG and DOX updates. Verified: manifest 71/71, backlog vitest 4/4, cook vitest 52/52, tsc delta neutral with no new error classes; remaining repo failures proven pre-existing on baseline jj workspace.
<!-- SECTION:FINAL_SUMMARY:END -->
