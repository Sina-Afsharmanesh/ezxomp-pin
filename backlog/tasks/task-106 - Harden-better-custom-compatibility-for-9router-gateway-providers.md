---
id: TASK-106
title: Harden better-custom compatibility for 9router gateway providers
status: Done
assignee: []
created_date: '2026-09-09 20:36'
updated_date: '2026-09-09 20:58'
labels:
  - bug
dependencies: []
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
9router (github.com/decolua/9router) fronts OllamaCloud-compatible upstreams through its OpenAI-compatible /v1 surface. The better-custom wizard must tolerate gateway/provider quirks (mixed metadata shapes, non-strict tool-property schemas surfaced as 400s upstream, missing endpoints) without breaking discovery or persistence for well-behaved gateways.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Wizard discovery completes against a 9router-shaped /v1 endpoint that returns partial or unusual model metadata
- [ ] #2 Developer-role probe tolerates gateway 400s (e.g. bool-in-tool-schema upstream errors) and degrades to supportsDeveloperRole=false
- [ ] #3 Existing probe/config tests remain green and new behavior has focused tests in test/better-custom*.test.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator note (worktree ezxomp-ws-task106, bookmark task106-9router-compat): implemented by the TASK-106 agent. Changes: probe/ollama.ts tolerates /v1-suffixed gateway endpoints (subpath-native roots kept intact) and falls back to an OpenAI-style /models parse (same metadata map shape via metadataFromModelListItem) when /api/tags yields nothing — covers 9router serving the Ollama surface at e.g. /ollama with /v1/models discovery. model-entry.ts ollama-chat compat keeps supportsDeveloperRole/supportsReasoningEffort false with a comment citing the 9router bool-ToolProperty 400. flows/shared.ts styleUsesGatewayPreset documents the gateway-subpath tolerance. Tests: test/better-custom-probe.test.ts adds two focused regressions (subpath + fallback; developer-role 400 bool-ToolProperty -> false, not a throw). Verification: bun test test/better-custom-probe.test.ts 12/12 green; bunx tsc --noEmit clean; full bun test test/ 391 pass with only 2 pre-existing environment failures (manifest.test.ts plannotator git-tracked checks require a .git dir absent from jj secondary workspaces). Status intentionally left unchanged per brief.

Implementer agent (herdr, workspace ezxomp-ws-task106, bookmark task106-9router-compat @ 6e31963c) shipped: probeOllama gateway-subpath tolerance + /api/tags-404 fallback to OpenAI-style /models parse; ollama-chat compat comment citing 9router bool-ToolProperty 400; developer-role probe fail-closed regression tests. Focused suites 12+24 green, tsc clean. Full-suite 2 failures are plannotator git-tracked checks that require .git (jj secondary workspace limitation, unrelated).

Version-bump follow-up: 0.1.0 cache keying meant 'omp plugin upgrade' kept serving the old build. Bumped to 0.1.1-ezxomp.0 across package.json, marketplace.json, README table, UPSTREAM.json localForkVersion, and test/manifest.test.ts EXPECTED_VERSIONS (manifest gate 82/82, tsc clean, probe suite 12/12). Pushed to main (d1f0254e). Marketplace upgrade verified: user install now 0.1.1-ezxomp.0 with fix markers present; omp plugin doctor 0 warnings/errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-106 shipped end to end: better-custom 0.1.1-ezxomp.0 with 9router gateway tolerance (probeOllama subpath + /models fallback, bool-ToolProperty compat citation, developer-role fail-closed regressions), version-bumped, pushed to remote main, and verified installed in the user's OMP plugin set.
<!-- SECTION:FINAL_SUMMARY:END -->
