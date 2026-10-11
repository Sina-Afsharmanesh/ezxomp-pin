---
id: omp-extension-imports-use-js-suffix
type: gotcha
title: OMP package TypeScript imports need runtime-compatible suffixes
scope:
  languages:
    - typescript
  tools:
    - omp
    - tsc
  files:
    - extensions/**/*.ts
    - src/**/*.ts
skills:
  - omp-extensions
compatible_skills:
  - typescript
excluded_skills:
  - python
confidence: confirmed
hits: 1
created_at: 2026-05-06
updated_at: 2026-05-06
trigger:
  - Adding imports between TypeScript modules in an OMP package using NodeNext module resolution.
symptom:
  - TypeScript reports module-resolution errors or OMP fails to load the extension at runtime.
root_cause:
  - NodeNext ESM imports must use runtime-compatible file suffixes even when importing TypeScript sources.
fix:
  - Use relative imports ending in `.js`, such as `../src/store/storage.js`.
verification:
  - `npm run typecheck` passes after adding `.js` import suffixes.
---

This is an example memory entry for documentation and package verification.
