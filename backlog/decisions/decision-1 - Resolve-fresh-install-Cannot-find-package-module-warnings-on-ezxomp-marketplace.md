---
id: decision-1
title: >-
  Resolve fresh-install Cannot find package/module warnings on ezxomp
  marketplace
date: '2026-08-26 21:47'
status: accepted
---
## Context

End users running `omp plugins marketplace update` against the ezxomp catalog
saw three warnings on every fresh install:

```
Failed to load extension ~/.omp/plugins/node_modules/@ezxomp/evo/extensions/index.ts:
  Cannot find package 'js-yaml'

Failed to load extension ~/.omp/plugins/node_modules/@ezxomp/lean-ctx/extensions/index.ts:
  Cannot find module '@oh-my-pi/omptype/typebox'

Failed to load extension ~/.omp/plugins/node_modules/@ezxomp/cook/extensions/index.ts:
  Cannot find module '@oh-my-pi/omptype/typebox'
```

Root cause (verified by reading
`@oh-my-pi/pi-coding-agent/src/extensibility/plugins/marketplace/manager.ts:827-840`,
`#registerRuntimePlugin`): OMP's marketplace install path does ONLY

1. `cachePlugin` — copy the plugin source to `~/.omp/plugins/cache/<marketplace>/<name>@<version>/`
2. `mkdir ~/.omp/plugins/node_modules/@ezxomp`
3. `fs.symlink(cachePath, linkPath, "dir")`
4. `writeRuntimeConfig`

There is no `npm install` / `bun install` step. Anything declared in
`package.json#dependencies` is metadata only at install time. The
`@oh-my-pi/*` host packages resolve through Node's walk-up to
`~/.bun/install/global/node_modules`, which is the OMP host's own install
root, but `js-yaml` is not part of the OMP host and has no fallback.

## Decision

Adopt the three-class dependency-resolution contract documented in
`docs/authoring-extensions.md` (mirrored as Backlog doc-8):

1. **Host deps** (`@oh-my-pi/*`): declare in **peerDependencies** with a
   version pin matching the OMP host (currently `18.0.6`). Resolution walks
   up from the symlink to the OMP install root.

2. **Third-party packages not in the host** (e.g. `js-yaml`): **vendor**
   into `plugins/<name>/vendor/`, ship a tiny in-tree ESM wrapper, and
   remove from `package.json#dependencies`. License attribution goes in
   `vendor/VENDORED.md`.

3. **Plugin-local code** (helpers, type defs): keep in-tree as
   `src/*.ts`. No external dep.

Final resolution as landed on `main` (2026-08-27):

- `@ezxomp/evo` (0.1.7-ezxomp.3): vendored
  `js-yaml@4.3.1` (MIT) + transitive `argparse@2.0.1` (Python-2.0) under
  `plugins/evo/vendor/`. `extensions/evo/config.ts:10` imports from
  `../../vendor/js-yaml.mjs` (an 830-byte in-tree ESM wrapper that uses
  `createRequire` to load the CJS bundle). `package.json#dependencies` no
  longer contains `js-yaml`. License attribution: `vendor/VENDORED.md`.

- `@ezxomp/lean-ctx` (0.1.7-ezxomp.5) and `@ezxomp/cook` (0.1.7-ezxomp.4):
  the `@oh-my-pi/omptype` peer-pin approach (2ccfffa's original plan) was
  superseded by a better fix in the same landed series — import the
  JSON-Schema builder from the **standalone `typebox` package**
  (`import { Type } from "typebox"`, pinned `1.1.38` in the repo root
  `package.json`), which OMP's host already bundles in the plugin
  `node_modules`. This removes the dependency on ANY peer-only package
  subpath (`@oh-my-pi/omptype/typebox`), which is unresolvable on fresh
  installs regardless of pin. See commit 2ccfffa.

- `.omp-plugin/marketplace.json#plugins[].version`,
  `test/manifest.test.ts#EXPECTED_VERSIONS`, and
  `plugins/<name>/UPSTREAM.json#localForkVersion` all synced per the
  repo version-bump rule.

Symlink-only OMP-install simulation: all three plugins resolve cleanly
in a clean `tmpdir` with no repo `node_modules` available.

## Consequences

- Vendored packages grow the repo by ~272 KB (js-yaml + argparse).
  Acceptable trade for eliminating a class of install failures that
  affects every user; license terms are permissive.
- Future plugin authors MUST follow the three-class contract when
  introducing a new third-party dep. The contract is linked from the
  root, docs, and plugins AGENTS files; new deps without a vendor entry
  will fail on fresh user installs.
- The exact install path is recorded in
  `docs/authoring-extensions.md` and Backlog doc-8. The recipe (clean
  tmpdir + symlink + `bun -e "import(...)"`) is the verification ground
  truth for "does this plugin load on a user's machine?"
- The OMP host version (`18.0.6` today) becomes a soft pin across the
  catalog. When OMP ships a new major, the peerDeps must be bumped in a
  single coordinated commit covering every plugin in the catalog.
