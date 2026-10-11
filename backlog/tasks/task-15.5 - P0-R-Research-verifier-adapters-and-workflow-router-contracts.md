---
id: TASK-15.5
title: 'P0-R: Research verifier adapters and workflow router contracts'
status: Done
assignee:
  - codex
created_date: '2026-08-20 21:39'
updated_date: '2026-08-23 01:52'
labels:
  - workflowz-v2
  - research
  - verifier
  - governance
dependencies: []
references:
  - 'https://github.com/bastani-inc/atomic/tree/main/packages/workflows'
  - 'https://vekexasia.github.io/pi-extensible-workflows/'
  - 'https://github.com/disler/super-simple-software-factory'
  - 'https://github.com/fallow-rs/fallow'
  - 'https://oxc.rs/docs/guide/usage/linter/cli.html'
  - 'https://oxc.rs/docs/guide/usage/linter/output-formats'
  - >-
    https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
  - 'https://go.dev/gopls/'
  - 'https://github.com/microsoft/pyright'
  - 'https://docs.astral.sh/ruff/linter/'
  - 'https://docs.pytest.org/en/stable/how-to/output.html'
  - 'https://github.com/typescript-language-server/typescript-language-server'
  - 'https://rust-analyzer.github.io/book/'
documentation:
  - docs/plugin_proposal/workflowz-v2.md
parent_task_id: TASK-15
priority: high
type: spike
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before workflowz v2 implementation, establish the contracts requested in review: `/workflows <prompt>` routing and chaining, reusable agent-created deterministic code gates, and modern verifier adapters. Research the referenced software-factory `GateReport` pattern, this repo's `plugins/pix-skills/src/gate.ts` severity classifier, and `plugins/pstack-suite/src/commands/verify.ts`/`ship.ts` verify-stop behavior. Then research Fallow CLI, Oxlint, LSP diagnostics, frontmatter validation, and Rust/Go/Python/JavaScript/TypeScript tooling. Record exact commands/API calls, structured result normalization, version detection, installation prerequisites, workspace/package scope, timeout and auto-fix policy, missing-tool behavior, and trust boundaries. Freeze the WorkflowRouteV1 and GateFileV1 schemas plus the command semantics in docs/plugin_proposal/workflowz-v2.md. Do not implement runtime code in this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A research matrix covers Fallow CLI, Oxlint, LSP diagnostics, frontmatter validation, and Rust/Go/Python/JavaScript/TypeScript candidates
- [x] #2 Each adapter has verified invocation/API shape, structured output mapping, minimum version/install detection, scope, timeout, and safe auto-fix policy
- [x] #3 WorkflowRouteV1 defines natural-language selection, direct recipe selection, ordered chaining, typed inputs, result references, gate references, approval mode, depth, and cycle validation
- [x] #4 GateFileV1 defines versioned reusable deterministic gates, trust state, content hash, prerequisites, language selectors, typed inputs, command/tool source, expected result, timeout, and failure policy
- [x] #5 Missing or untrusted tools/gates fail closed unless explicitly marked optional and approved
- [x] #6 The design doc records verified findings and explicitly labels unresolved tool research
- [x] #7 The research adopts an evidence-bearing GateReport contract with one check per examined item, bounded output evidence, normalized violations, exit/result metadata, duration, and tool/version
- [x] #8 The research defines execFile-style executable plus argv as the default adapter boundary, raw shell as an explicitly classified fallback, and reuse of the existing critical/dangerous/risky command classifier
- [x] #9 The research defines same-agent-session correction after gate failure, bounded by retry and budget, with no silent cold restart
- [x] #10 The design references the existing pix-skills gate classifier and pstack verify/ship stop-before-merge behavior
- [x] #11 Fallow contract records `audit --format json --quiet`, `schema`, verdict handling, and exit mapping (0/1 normal, 2 error, 7 network, 8 security)
- [x] #12 Oxlint contract records canonical `-f json`, warning/error thresholds, fix separation, and VitePlus `vp lint` wrapper detection
- [x] #13 LSP contract records stdio JSON-RPC lifecycle, publishDiagnostics severity mapping, timeout/cancel, workspace root, and launchers for Rust/Go/Python/JS/TS
- [x] #14 Local capability snapshot records Fallow 3.16.0 audit pass, VitePlus/Oxlint warning behavior, available TypeScript/Pyright tools, and missing gopls/Ruff/pytest/basedpyright prerequisites
- [x] #15 OMP ExtensionAPI `registerCommand` supports `getArgumentCompletions(argumentPrefix)` returning `AutocompleteItem` values; hook-only command registration does not, so `/workflows` must use the extension path
- [x] #16 OMP session persistence exposes namespaced `appendEntry`, branch/tree reconstruction, read-only `sessionManager` entries/artifacts, and explicit command-context navigation; it does not replace the external workflow journal
- [x] #17 Backlog integration contract identifies the supported task/document mutation path, artifact linkage fields, and fail-closed behavior when Backlog is unavailable
- [x] #18 JJ contract identifies capability/change/bookmark checks, forbidden workflow-owned Git mutations, and optional Worktrunk isolation boundaries
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 All acceptance criteria are met
- [ ] #2 Code changes are tested and documented
- [ ] #3 No regressions in existing functionality
- [ ] #4 Changes are reviewed and approved
- [ ] #5 Documentation is updated to reflect changes
- [ ] #6 All new code follows project coding standards
- [ ] #7 Changes are committed with clear, descriptive messages
- [ ] #8 No known bugs or issues remain unresolved
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture repository evidence from `plugins/pix-skills/src/gate.ts` and `plugins/pstack-suite/src/commands/verify.ts`/`ship.ts`: severity classification, execFile boundary, bounded evidence, and stop-before-merge behavior.
2. Extract the software-factory gate contract: deterministic code owns graph/retries/acceptance, typed envelopes cross phase boundaries, GateReport records per-item evidence, and failed gates correct the same agent session.
3. Research current Fallow, Oxlint, LSP, frontmatter, and Rust/Go/Python/JavaScript/TypeScript adapter contracts, including availability and structured-result normalization.
4. Freeze WorkflowRouteV1 and GateFileV1 requirements, trust/version/hash policy, missing-tool behavior, and `/workflows` semantics.
5. Update `docs/plugin_proposal/workflowz-v2.md`, backlog references, and changelog; re-present through plannotator before P0 runtime changes.

6. Use the verified matrix and local capability snapshot to freeze adapter prerequisites and warning/error policies; keep missing tools fail-closed unless a recipe marks them optional and the user approves.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified local tools on 2026-08-20: `fallow 3.16.0`; `fallow audit --format json --quiet` rc=0, verdict=pass, schema_version=9, 43 changed files, 3 non-error dead-code findings. `vp lint -f json` returns structured diagnostics and rc=1 for repository warnings; PATH `oxlint` is a VitePlus LSP-only wrapper. Available: tsc 5.9.3, typescript-language-server 5.3.0, pyright 1.1.411. Missing: gopls, Ruff, pytest, basedpyright. rust-analyzer proxy exists but the active Rust toolchain lacks the component.

Gate adapter contract: prefer executable+argv/execFile; raw shell requires pix-skills severity classification. Emit GateReport per item with bounded evidence, normalized violations, tool/version, exit/result, duration; repair the same agent session, never silently cold-restart.

OMP API findings: ExtensionAPI RegisteredCommand includes getArgumentCompletions(argumentPrefix); AutocompleteItem has value/label/description/hint and values preserve concatenated prefixes. HookAPI RegisteredCommand lacks argument completion. OMP session custom entries are opaque namespaced state via appendEntry; getBranch/getEntries/getTree/artifacts reconstruct state, while branch/navigateTree are command-context user actions. Core-reserved custom types such as tool_execution_start and session_exit must not be used by extensions.

Governance requirement is executable: P0 must enforce Backlog artifact ownership and JJ repo state through preflight/phase/finalization tools, while rendered subagent prompts carry the same contract. Worktrunk remains optional isolation.

Superseding validator audit (2026-08-22): audited current TASK-15.5 notes, frozen docs/plugin_proposal/workflowz-v2.md, and durable extensible-workflows runtime/p0-tools evidence (design hash sha256=3c81aaabce463cfdb83757c3f1435d72ddfba1178a961234a50b3e5111312e99). Full suite `bun test test/`: rc=0; 307 pass markers, 0 fail markers, 36 skip/todo markers, 0 warning-token lines; gate.green=true, gate.clean=true. AC sweep: #1 PASS — §4.3 research matrix rows cover Fallow, Oxlint, LSP, frontmatter, Rust, Go, Python, JS/TS. #2 PASS — matrix + GateFile schema/rules freeze invocation/API, normalized output, version/prerequisite detection, scope, timeout, safe-fix policy, and missing-tool behavior. #3 PASS — §3A `/workflows <request>` natural-language selection, `run` direct recipe, explicit ordered `chain`, typed inputs/result refs; §7D.1.3 freezes gate refs, approval, maxDepth, forward-ref and cycle checks. #4 PASS — GateFileV1 schemaVersion/id/version, trust, contentHash, prerequisites, language, typed executable/args, expect, timeout, and failure severity are frozen (§4.2). #5 PASS — missing tools fail closed unless recipe marks optional; untrusted gate/prerequisite handling is required (§4.2, §7D.1.3). #6 PASS — §4.3 labels approved/verified invocation research and the verified local snapshot; absent/unresolved gopls, Ruff, pytest, basedpyright, and rust-analyzer prerequisite are explicitly identified. #7 PASS — §3B GateReport has one evidence-bearing check per item, bounded evidenceTail, normalized violations, exit/result metadata, duration, tool/version, and failed-check persistence. #8 PASS — §3B requires execFile-style executable+argv by default; raw command is classified shell; critical/dangerous fail closed and risky requires checkpoint; pix-skills rules are reused. #9 PASS — §3B same-agent correction is bounded by retries+budget and never a silent cold restart; §7D.1.7 repeats same-session repair/escalation. #10 PASS — §3B explicitly cites pix-skills severity rules and pstack verify/ship stop-before-next-phase behavior. #11 PASS — §4.3 Fallow row freezes `audit --format json --quiet`, `schema`, verdict, and exits 0/1 normal, 2 error, 7 network, 8 security. #12 PASS — §4.3 Oxlint row freezes canonical `-f json`, warning/error thresholds, separate `--fix`, and VitePlus `vp lint` wrapper detection. #13 PASS — §4.3 LSP row freezes stdio JSON-RPC lifecycle, publishDiagnostics severity 1–4, timeout/cancel, workspace/document scope, and Rust/Go/Python/JS/TS launchers. #14 PASS — verified snapshot records Fallow 3.16.0 audit pass, vp/Oxlint warning exit behavior, tsc 5.9.3, TSLS 5.3.0, Pyright 1.1.411, and missing gopls/Ruff/pytest/basedpyright (plus Rust component gap). #15 PASS — notes freeze ExtensionAPI registerCommand completions (`getArgumentCompletions` → AutocompleteItem), hook-only limitation, and `/workflows` extension-path requirement. #16 PASS — §3C/notes freeze namespaced appendEntry, read-only sessionManager branch/tree/entries/artifacts, command-context navigation, and external journal authority. #17 PASS — §3D/`omp_workflow_backlog_record` freeze supported mutation path, linkage fields, and incomplete-metadata rejection; runtime.ts:812–821 verifies task/doc availability and emits GateReport violations `task <id> unavailable`/`document <id> unavailable`; p0-tools.ts:186–190 journals failed `backlog-record` evidence and completion returns WORKFLOW_GOVERNANCE_BLOCKED when evidence is missing. #18 PASS — §3D/runtime JJ guard freezes jj capability/status, change/bookmark evidence, forbidden workflow-owned Git mutations, and notes keep Worktrunk isolation optional. Status intentionally remains In Progress for orchestrator closure.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: plannotator
created: 2026-08-20 21:50
---
Second plannotator review requested grounding in the repository's code-gate pattern and disler/super-simple-software-factory. Findings: pix-skills provides severity classification and auto-approve rules; pstack verify/ship uses execFile and aborts before merge; the factory uses per-item GateReport evidence and same-session correction. Design updated accordingly.
---

author: codex
created: 2026-08-20 21:56
---
Plan approved through grounded plannotator review. Beginning P0-R research; runtime implementation remains blocked until this research task is complete and its contracts are recorded.
---

author: plannotator
created: 2026-08-20 22:04
---
Third review feedback incorporated: verified the plan against the repository's code gate and current tool availability, then grounded it in official Fallow/Oxlint/LSP/language-tool contracts. The design now records exact invocation shapes, structured outputs, exit policies, and local prerequisites.
---
<!-- COMMENTS:END -->
