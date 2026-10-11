# Vendored third-party packages

This directory contains third-party JavaScript packages vendored (copied verbatim) into
the ezxomp source tree so that OMP's marketplace install (which does not run
`npm install` / `bun install`) can resolve them at runtime.

The packages here are not modified — only their non-runtime artifacts (README, source
maps, build outputs) are stripped to keep the tree small. License texts are preserved.

| Package | Version | License | Source | Used by |
| --- | --- | --- | --- | --- |
| `js-yaml` | 4.3.1 | MIT | https://github.com/nodeca/js-yaml | `plugins/evo/extensions/evo/config.ts`, `plugins/gsd-graph/src/engine/graph.ts` |
| `argparse` | 2.0.1 | Python-2.0 (Python Software Foundation License) | https://github.com/nodeca/argparse | `js-yaml` (transitive runtime dep) |

`vendor/js-yaml.mjs` is a tiny ESM bootstrap (~830 bytes) we maintain in-tree; it uses
`createRequire` to load the vendored CJS `js-yaml` and re-exports `load` and `dump`.
No upstream modification.

## Why vendored

OMP's marketplace plugin install path (`#registerRuntimePlugin` in
`@oh-my-pi/pi-coding-agent/src/extensibility/plugins/marketplace/manager.ts`) does ONLY:

1. `cachePlugin` — copy the plugin source to `~/.omp/plugins/cache/<marketplace>/<name>@<version>/`
2. `mkdir ~/.omp/plugins/node_modules/@ezxomp`
3. `fs.symlink(cachePath, linkPath, "dir")` — symlink the cache into the OMP node_modules
4. `writeRuntimeConfig`

There is no `npm install` or `bun install` step. Anything declared in
`package.json#dependencies` is metadata only; the package is never materialized at
runtime. Resolution walks up from the symlink target:

- `[plugin]/node_modules` — empty (we don't ship one)
- `~/.omp/plugins/node_modules/@ezxomp/<peer>/node_modules` — empty
- `~/.omp/plugins/node_modules` — only other `@ezxomp/*` plugins
- `~/.omp/node_modules` — typically absent
- `~/.bun/install/global/node_modules` — only OMP's own host deps (`@oh-my-pi/*`)

`@oh-my-pi/*` is reachable through the last hop, which is why those packages belong in
**peerDependencies** (the host provides them). Anything not in that last hop — including
third-party packages like `js-yaml` — MUST be vendored or bundled.

See `docs/authoring-extensions.md` (mirrored from Backlog doc-8) for the full contract.
