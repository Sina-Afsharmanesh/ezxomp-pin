# Authoring OMP Marketplace Plugins: Dependency Resolution Contract

**Date:** 2026-08-26
**Type:** Specification
**Tags:** omp, marketplace, plugin-authoring, dependencies, peer-deps, runtime-deps, resolution, evo, cook, codesight, js-yaml, omptype

## Why this doc exists

Symptom seen on user machines after `omp plugin install <name>@ezxomp`:

```
Warning: Failed to load extension ~/.omp/plugins/node_modules/@ezxomp/evo/extensions/index.ts:
  ResolveMessage: Cannot find package 'js-yaml' from '/home/<user>/.omp/plugins/node_modules/@ezxomp/evo/extensions/index.ts'

Warning: Failed to load extension ~/.omp/plugins/node_modules/@ezxomp/cook/extensions/index.ts:
  ResolveMessage: Cannot find module '@oh-my-pi/omptype/typebox' from '/home/<user>/.omp/plugins/node_modules/@ezxomp/cook/extensions/index.ts'
```

The three plugins ship in this repo (and listed in `.omp-plugin/marketplace.json`). None of them are designed wrong in isolation — the bug is that the `package.json` dependency declarations don't survive the OMP marketplace install path. Every new plugin in `plugins/<slug>/` will hit the same bug if the author doesn't follow the contract below.

## The OMP marketplace install model (what actually happens)

Source: `@oh-my-pi/pi-coding-agent@18.0.6` → `src/extensibility/plugins/marketplace/manager.ts`, function `#registerRuntimePlugin` (around L827–L840).

`omp plugin install <name>@ezxomp` performs exactly four steps:

1. `cachePlugin(sourcePath, pluginsCacheDir, marketplace, name, version)` — copies the plugin source into `~/.omp/plugins/cache/<marketplace>/<name>@<version>/`.
2. `mkdir ~/.omp/plugins/node_modules/@ezxomp`
3. `fs.rm(linkPath, { recursive: true, force: true })` then `fs.symlink(cachePath, linkPath, "dir")` — creates `~/.omp/plugins/node_modules/@ezxomp/<name>` as a directory symlink to the cache.
4. `writeRuntimeConfig(...)` — records `{ version, enabledFeatures, enabled: true }` in the lockfile.

**There is no `npm install` / `bun install` / `pnpm install` step.** No hook, no postinstall. The plugin's transitive dependencies are NOT materialized. The plugin must ship a self-contained runtime, or its imports must resolve through a `node_modules` ancestry that the host agent already provides.

## Module resolution walk-up from the symlink

OMP's runtime then loads the extension by importing the file at `~/.omp/plugins/node_modules/@ezxomp/<name>/extensions/index.ts` via `loadLegacyPiModule` (uses Bun's runtime with `?mtime=<tag>` cache-bust). Bun's resolver walks `node_modules` up from the file's real path:

| Walk step | Path | Typical contents |
|---|---|---|
| 1 | `~/.omp/plugins/node_modules/@ezxomp/<name>/node_modules` | empty (not shipped) |
| 2 | `~/.omp/plugins/node_modules/@ezxomp/node_modules` | empty (only @ezxomp/* siblings) |
| 3 | `~/.omp/plugins/node_modules` | only `@ezxomp/*` and the legacy `omp-*` plugins (no `@oh-my-pi/*`) |
| 4 | `~/.omp/node_modules` | typically does not exist |
| 5 | `~/.bun/install/global/node_modules` | OMP host agent's deps: `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/omptype`, `@oh-my-pi/pi-tui`, etc. ✓ |

So **`@oh-my-pi/pi-coding-agent` and `@oh-my-pi/omptype` resolve via step 5 (bun global)**. But:
- Step 5 only contains packages the OMP host agent itself depends on.
- `@oh-my-pi/omptype/typebox` resolves only if `@oh-my-pi/omptype` is itself installed at step 5 (it is, in `omp` v18.0.6+).
- Any third-party runtime dep — e.g. `js-yaml`, `lodash`, `zod` — has NO walk-up step that can find it.

That is the **mechanical cause** of every "Cannot find package" / "Cannot find module" warning.

## Why peerDependencies and devDependencies fail

- `peerDependencies` are not auto-installed by npm in non-strict mode, and OMP does not run `npm install` after symlink. The plugin's `package.json#peerDependencies` is metadata only; nothing pulls the package in. The user sees the missing-module error.
- `devDependencies` are stripped by `npm install --omit=dev` and by `npm pack`. OMP's cache step is effectively a `cp -r` of the source tree (not a pack), so `devDependencies` are physically present in the cache, but resolution still cannot reach them because they are not in the walked `node_modules` tree.
- `dependencies` is what `npm install` would write into a `node_modules` directory. OMP does not write that directory. The metadata is read, the binaries are not materialized.

**Conclusion:** for a plugin to load successfully under OMP's marketplace install, the dependency model must rely on the host's existing `node_modules` (bun global at step 5), or the plugin must bundle the dependency.

## The three solution classes, in priority order

### 1. Use what the host already provides (preferred for OMP APIs)

OMP ships these in `~/.bun/install/global/node_modules/@oh-my-pi/`:
- `pi-coding-agent` — extension API surface (`ExtensionAPI`, `registerTool`, `registerCommand`, `registerProvider`, hooks)
- `omptype` — schema + `Type` from `@sinclair/typebox` (re-exported as `import { Type } from "@oh-my-pi/omptype/typebox"`)
- `pi-tui` — TUI primitives
- `pi-ai`, `pi-utils`, `pi-agent-core`, `pi-catalog`, `pi-mnemopi`, `pi-natives-*`

**Rule:** any import from `@oh-my-pi/pi-coding-agent` or `@oh-my-pi/omptype` is safe to leave in `peerDependencies` (for version signaling) — it resolves via the host's bun global.

**Anti-pattern (recurring bug):** listing `@oh-my-pi/omptype` or `@oh-my-pi/pi-coding-agent` in `devDependencies` only. They are not just dev tools; the extension source imports them at runtime. `devDependencies` does not produce a walkable `node_modules` entry under OMP marketplace install.

### 2. Declare third-party runtime deps as `dependencies` (only if OMP hoists them)

If a plugin truly needs a third-party runtime package (e.g. `js-yaml` for YAML config persistence), declare it in `dependencies` with a pinned `^x.y.z`. Then:

- For **marketplace installs from this repo**, the marketplace catalog entry must trigger OMP to install dependencies. As of `omp` 18.0.6, marketplace install only symlinks — it does not install. So `dependencies` alone does NOT fix the bug.
- For **npm-published installs** (`omp plugin install @ezxomp/<name>` from the registry), the same single-symlink model applies.
- For **local dev via `omp plugin link ./plugins/<name>`**, OMP also symlinks. The plugin author can `bun install` inside `plugins/<name>/` for local testing, but this does not propagate to end users.

**Implication:** third-party runtime deps require a different delivery mechanism than the simple marketplace symlink. Options:

- **A. Vendor the dependency** into the plugin tree (e.g. `plugins/<name>/vendor/js-yaml/index.js` plus a relative import). Increases repo size, but works for every install path.
- **B. Bundle the extension entry** to a self-contained `.js` that has all imports inlined. This is the **codesight pattern** (see below).
- **C. Replace the dependency with a host-provided equivalent** when one exists. For YAML, this means using `js-yaml`-shaped APIs only when OMP itself re-exports them; today it does not, so this is not a general solution.

### 3. Bundle the extension (codesight pattern)

The `codesight` plugin ships `codesight.bundle.js` (15,633 lines, 600KB+) and references it in `package.json#omp.extensions` (after the OMP manifest convention). The bundle is a single self-contained ES module: every dependency, every helper, every type is inlined. `package.json#files` includes both the source and the bundle. `package.json#scripts.build:bundle` regenerates it via `bun run scripts/build-bundle.mjs`.

This pattern works for every install path because the only thing OMP must resolve at runtime is the plugin's own code — no third-party packages.

**When to use:** any plugin with non-trivial third-party deps (e.g. `js-yaml`, `lodash`, `zod`, sqlite-wasm, custom native bindings). The bundle cost is build complexity and slower iteration; the benefit is zero install-time surprises.

## Concrete fix recommendations for this repo

For each plugin in `plugins/`, follow this checklist:

| Check | Required? | Applies to |
|---|---|---|
| `@oh-my-pi/pi-coding-agent` listed in `peerDependencies` with exact version pin (e.g. `18.0.6`) | YES | every plugin |
| `@oh-my-pi/omptype` listed in `peerDependencies` (NOT devDependencies) if the source imports `from "@oh-my-pi/omptype/typebox"` or `from "@oh-my-pi/omptype"` | YES | every plugin that uses `Type`, schemas, or hook validators |
| Any third-party runtime dep (`js-yaml`, `zod`, etc.) declared in `dependencies`, AND also vendored into the plugin tree, AND imported via relative path | YES | every plugin with non-`@oh-my-pi/*` runtime imports |
| `package.json#files` includes the source dirs the `omp.extensions` entries point to | YES | every plugin |
| `package.json#files` does NOT include `node_modules`, `dist`, `*.test.ts`, `.DS_Store` | YES | every plugin |
| `package.json#omp.extensions` paths use the **bundled** entry when a bundle exists | YES | codesight (and any future bundled plugin) |
| `extensions/index.ts` and the `omp.extensions` path align (the loader rejects `extensions/<ext>/index.ts` vs the declared path mismatch) | YES | every plugin |

### Per-plugin fix targets

- **`@ezxomp/evo`** (`plugins/evo/extensions/index.ts:8`):
  - `import * as yaml from "js-yaml"` — third-party runtime dep.
  - Fix: vendor `js-yaml` into `plugins/evo/vendor/js-yaml/` and change the import to a relative path; OR bundle the extension to `plugins/evo/extensions/index.bundled.js` and point `omp.extensions` at it. Also keep `js-yaml` in `dependencies` for dev-time `bun install` and lint/typecheck.
  - `@oh-my-pi/omptype` is only in `peerDependencies` — that is correct, leave it.

- **`@ezxomp/cook`** (`plugins/cook/extensions/index.ts:8, 12`):
  - `import { Type } from "@oh-my-pi/omptype/typebox"` — host dep, resolves via bun global. OK to stay in `peerDependencies`.
  - `@oh-my-pi/omptype` and `@oh-my-pi/pi-coding-agent` currently in `devDependencies` only (wrong). Move to `peerDependencies` with exact pin matching the host (`18.0.6`).
  - Verify there is no third-party runtime import.

- **`@ezxomp/codesight`** (already correct precedent):
  - `package.json#omp.extensions` references `src/index.ts`. The runtime calls `Bun.spawn` to run `codesight.bundle.js` from disk, never importing third-party packages from the extension file itself.
  - `package.json#files` includes both `src` and `codesight.bundle.js`.
  - `package.json#dependencies` has only `@ezxomp/experiences: workspace:*` — that resolves inside the monorepo for `link`/`npm pack` flows. End users will not have a `workspace:*` resolution, so the published `@ezxomp/codesight` must either ship with a pre-baked dep or drop this dep. (Existing code; tracked separately.)

- **All other plugins** (`agent-learning`, `compact-eng`, `extensible-workflows`, `plannotator`, `augment`, `experiences`, `better-custom`, `pstack-suite`):
  - Audit each `extensions/index.ts` for `from "@oh-my-pi/..."` and `from "<third-party>"` imports.
  - If a third-party import exists, apply the same vendor-or-bundle decision.
  - `@oh-my-pi/*` imports must have the host package in `peerDependencies` with an exact version pin.

## Anti-patterns (do not do these)

1. **Putting `@oh-my-pi/omptype` in `devDependencies`.** It is a runtime import.
2. **Putting `js-yaml` in `dependencies` and expecting it to be installed.** It is not installed by the marketplace install step.
3. **Pointing `omp.extensions` at `src/index.ts` when the loader expects `extensions/index.ts`.** The loader checks both forms, but mixing them across plugins in the same repo breaks `test/manifest.test.ts` which validates every declared path exists.
4. **Editing `package.json#version` without updating `.omp-plugin/marketplace.json#plugins[].version` for the same plugin.** The byte-for-byte invariant is enforced by `test/manifest.test.ts`.
5. **Adding `node_modules` to `package.json#files`.** npm pack will follow it; OMP's cache step is a `cp -r` and will also pull the user's local `node_modules`, bloating the cache.
6. **Using `import { Type } from "typebox"` (the raw `@sinclair/typebox` package) instead of `@oh-my-pi/omptype/typebox`.** OMP's host does not provide `@sinclair/typebox` in bun global. Use the OMP-typed re-export so the host resolver finds it.
7. **Forgetting the `?mtime=` cache bust.** OMP's `loadLegacyPiModule` adds it; plugin authors do not need to, but they must not add their own that conflicts.

## Verification checklist (run before merging any plugin change)

```bash
# 1. From inside plugins/<name>/, confirm typecheck passes locally.
cd plugins/<name>
bun install --omit=optional
bunx tsc --noEmit

# 2. Confirm the extension file's runtime imports resolve under the actual
#    marketplace install path: copy the plugin into a clean tree and simulate
#    OMP's symlink resolution.
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/node_modules/@ezxomp"
ln -s "$(pwd)" "$TMPDIR/node_modules/@ezxomp/<name>"
# (then run: cd "$TMPDIR" && bun -e "import('./node_modules/@ezxomp/<name>/extensions/index.ts')" )
# Expect: no "Cannot find module" / "Cannot find package" errors.
rm -rf "$TMPDIR"

# 3. Run the project-level pre-merge gate.
just verify
```

The marketplace simulation in step 2 is the most important — it directly reproduces the user-reported error. If it fails, the plugin is not safe to ship.

## References

- Source-of-truth for the install model: `@oh-my-pi/pi-coding-agent@18.0.6` → `src/extensibility/plugins/marketplace/manager.ts` (`#registerRuntimePlugin`, `#runtimePackagePath`, `cachePlugin`).
- Source-of-truth for the extension loader: `@oh-my-pi/pi-coding-agent@18.0.6` → `src/extensibility/extensions/loader.ts` (`loadExtensions`, `importExtensionModule`, `loadLegacyPiModule`).
- Working precedent in this repo: `plugins/codesight/` (bundled extension) and `plugins/codesight/scripts/build-bundle.mjs` (the bundle script).
- The test that enforces version sync: `test/manifest.test.ts` (`EXPECTED_PLUGINS`, `EXPECTED_PACKAGE_IDS`, `EXPECTED_VERSIONS`).
- AGENTS.md top-level rule that this doc supports: "Each plugin under `plugins/` owns its own subtree and may have a child `AGENTS.md` with plugin-specific contracts." This doc is the **cross-cutting** contract; plugin-local AGENTS.md files may add plugin-specific notes.
