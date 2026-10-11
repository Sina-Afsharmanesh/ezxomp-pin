---
id: TASK-16.1
title: Establish the typed OMP better-custom plugin boundary
status: Done
assignee:
  - t16w-16.1e
created_date: '2026-08-21 20:15'
updated_date: '2026-08-21 20:45'
labels:
  - architecture
dependencies: []
references:
  - >-
    backlog/docs/doc-2 -
    better-custom-port-host-API-upstream-contract-research.md
  - /tmp/better-custom-research/src/types.ts
  - plugins/pix-skills/package.json
  - plugins/AGENTS.md
modified_files:
  - plugins/better-custom/package.json
  - plugins/better-custom/src/types.ts
  - plugins/better-custom/AGENTS.md
  - plugins/better-custom/LICENSE
parent_task_id: TASK-16
priority: high
type: chore
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the durable package boundary for the zero-dependency provider-wizard plugin at plugins/better-custom. This is the prerequisite for all later slices; do not implement provider persistence, probing, or UI flows here.

Targets: plugins/better-custom/package.json, plugins/better-custom/src/types.ts, plugins/better-custom/AGENTS.md, and license/package metadata files required by the workspace convention.

Required contract:
- Package name is @ezxomp/better-custom; omp.extensions is ["src/index.ts"]; files and keywords include omp-package and omp-extension.
- dependencies is exactly empty. peerDependencies may contain only @oh-my-pi/* packages pinned to 17.3.8: require pi-coding-agent and pi-utils; add pi-tui only if the later custom selector imports it.
- Define shared, host-neutral TypeScript contracts that all later modules can import: the five provider styles, their host API spellings (openai-completions, openai-responses, anthropic-messages, google-generative-ai, ollama-chat), API-key modes, probe metadata, gateway profile, model-edit options, and command/UI context boundaries. Do not import upstream model-probe or yaml.
- Add a child AGENTS.md because this is a durable plugin boundary. It must state ownership, no-external-dependency rule, required host API spellings, source layout, and focused verification location.

Non-goals: no placeholder extension factory, no command registration, and no functional flow implementation in this ticket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The workspace exposes @ezxomp/better-custom through an OMP manifest whose only runtime dependency list is empty and whose peer packages are limited to pinned @oh-my-pi/* packages.
- [x] #2 Shared plugin types express all five supported styles with the host API spellings, including ollama-chat rather than ollama, without importing yaml or model-probe.
- [x] #3 The plugin directory contains durable local guidance that lets later workers preserve the package, dependency, and test conventions.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the host contract research, pix-skills manifest, plugin guidance, license, workspace, and TypeScript include rules; preserve existing root registration because plugins/* and plugins/**/*.ts already resolve the new package.
2. Create plugins/better-custom/package.json with the @ezxomp manifest, src/index.ts extension entry declaration, source/README/license files, omp-package + omp-extension keywords, no dependencies, and only @oh-my-pi/* peers pinned to 17.3.8.
3. Create src/types.ts as host-neutral contracts: host API literals for five provider styles, credential serialization modes, gateway profile ids, probe metadata, model-edit option kinds, and minimal command/UI seams without yaml/model-probe/upstream imports.
4. Add child AGENTS.md and MIT LICENSE (plus the manifest-required README stub) documenting ownership, no-external-dependency rule, host spellings, planned source layout, and focused verification path.
5. Run bun run check, parse/assert manifest constraints, and scan created files for forbidden yaml/model-probe/bare Ollama or Anthropic API literals before checking AC #1-#3.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created the zero-dependency @ezxomp/better-custom manifest, host-neutral shared contracts, child DOX guidance, MIT license, and manifest-required README stub. Kept root registration unchanged because package.json already resolves plugins/* and tsconfig includes plugins/**/*.ts.

Types-only compile passed for plugins/better-custom/src/types.ts. The required root bun run check was exercised and failed only on pre-existing unrelated errors under plugins/extensible-workflows/node_modules and existing workflowz tests; it emitted zero plugins/better-custom errors (878 unrelated TS diagnostics). Manifest/forbidden-content assertions passed: dependencies exactly {}, all peer keys @oh-my-pi/* pinned 17.3.8, required omp fields/keywords present, and no forbidden yaml/model-probe/bare API literals.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-21 20:39
---
Implemented the TASK-16.1 scaffold. Why: establish a stable package/type boundary before persistence, probing, UI, and flow slices while enforcing the no-runtime-dependency contract. Evidence: types-only tsc passed; root bun run check was run and has zero better-custom diagnostics but is blocked by unrelated existing workspace/node_modules errors; parsed manifest assertions passed; created-file scan found zero forbidden imports/literals.
---

author: cook-judge
created: 2026-08-21 20:44
---
[review] REVIEW_PASSED — No blocking findings. Verified manifest invariants (empty dependencies, allowed peers pinned to 17.3.8, required OMP metadata/keywords, files present); all five host API literals and required host-neutral seams; AGENTS section order/content; only the five ticket source artifacts changed and no root config files. `bunx tsc --noEmit` reported 878 unrelated diagnostics and zero `plugins/better-custom` diagnostics; isolated `types.ts` check exited 0.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scaffold complete per ticket contract: plugins/better-custom/{package.json,src/types.ts,AGENTS.md,LICENSE,README.md}. Manifest verified: @ezxomp/better-custom, omp.extensions ["src/index.ts"], dependencies exactly {}, peers only @oh-my-pi/pi-coding-agent + @oh-my-pi/pi-utils pinned 17.3.8, keywords omp-package/omp-extension. types.ts host-neutral (zero imports), five styles on host API literals incl ollama-chat, no bare "ollama"/"anthropic", no yaml/model-probe imports. Verification: targeted tsc clean; bun run check shows zero better-custom diagnostics (878 pre-existing unrelated errors elsewhere); forbidden-content grep zero hits. Judge review: PASSED, no blockers.
<!-- SECTION:FINAL_SUMMARY:END -->
