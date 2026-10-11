---
name: omp-native-package
description: Create an OMP-native npm package that installs as a plugin. Use when publishing a plugin to npm, configuring package.json for omp plugin install <package>, or setting up files/publishConfig/keywords for OMP discovery.
---

# OMP-Native Package

Package, publish, and install an OMP plugin via the npm registry. Grounded in OMP 17.2.x install internals and [official docs](https://github.com/can1357/oh-my-pi/tree/main/docs).

## Official documentation

- [Extension authoring](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md) — `ExtensionAPI`, runtime model, event surface
- [Authoring Extensions skill](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md) — package.json manifest, discovery paths
- [Extension Loading](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md) — path resolution rules
- [Marketplace system](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md) — install paths, scopes, on-disk layout

## Install paths

OMP installs plugins three ways. Each reads `package.json#omp` (or `#pi`) as the manifest:

| Command | Mechanism | Location |
|---------|----------|----------|
| `omp plugin install <package>` | `bun add` to `~/.omp/plugins/package.json`, `bun install`, load from `node_modules/` | `~/.omp/plugins/node_modules/<pkg>/` |
| `omp plugin install ./path` | Symlink (same as `link`) | `~/.omp/plugins/node_modules/<pkg>/` → `./path` |
| `omp plugin install name@marketplace` | Resolve from marketplace catalog, cache, load | `~/.omp/agents/data/plugins/cache/<marketplace>___<plugin>___<version>/` |

> `omp plugin install git:<url>` treats the URL as a **tarball** and runs `bun install` on it. If the URL is a git remote (not a tarball endpoint), this fails with `ZlibError`. Use `omp plugin marketplace add <url>` for git-based marketplaces, or `omp plugin install <npm-package>` for npm packages.

## The `omp plugin install <package>` flow

1. OMP runs `bun add <package>` in `~/.omp/plugins/`.
2. Bun resolves, downloads, and extracts the package into `~/.omp/plugins/node_modules/`.
3. OMP reads `package.json` from the extracted package.
4. If `package.json#omp` (or `#pi`) is missing, the package is silently skipped — it's not an OMP plugin.
5. If present, OMP reads the manifest, the `version` field, and registers the plugin in `~/.omp/plugins/omp-plugins.lock.json`.

## package.json for npm publishing

```json
{
  "name": "@scope/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "description": "What the plugin does.",
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  },
  "keywords": [
    "omp-package"
  ],
  "files": [
    "src",
    "skills",
    "commands",
    "hooks",
    "tools",
    "AGENTS.md",
    ".mcp.json"
  ],
  "omp": {
    "extensions": ["src/index.ts"]
  },
  "peerDependencies": {
    "@oh-my-pi/pi-coding-agent": "17.3.8"
  }
}
```

### Required fields

- `name` — npm package name. OMP uses this as the plugin identifier.
- `version` — semver. OMP reads this for display, cache keys, and the lock file.
- `omp` (or legacy `pi`) — the manifest. Without it, OMP ignores the package.

### Critical fields

- `files` — controls what `npm publish` includes. OMP auto-discovers `skills/`, `commands/`, `hooks/`, `tools/`, `prompts/`, `rules/` directories — they MUST be in the published tarball. Source `.ts` files in `extensions` must also be included. Test files (`*.test.ts`) should be excluded.
- `publishConfig.access: "public"` — required for scoped packages (`@scope/...`) to publish publicly.
- `keywords: ["omp-package"]` — convention for OMP plugin discoverability. Not enforced by OMP but used by search.
- `peerDependencies` — declare `@oh-my-pi/pi-coding-agent` (or other `@oh-my-pi/*` packages) as peers, not dependencies. OMP provides them at runtime.

### Files array patterns

```json
{
  "files": [
    "src/**/*.js",
    "src/**/*.ts",
    "!src/**/*.test.js",
    "!src/**/*.test.ts",
    "skills",
    "commands",
    "hooks",
    "tools",
    "AGENTS.md",
    ".mcp.json"
  ]
}
```

- Use globs to include source but exclude tests.
- Directory entries (`"skills"`) include the whole directory.
- `!` patterns exclude. Always exclude test files — they bloat the tarball and can cause load errors.

## Publishing

```bash
# Build (if needed):
bun run build

# Dry run to see what's included:
npm pack --dry-run

# Publish:
npm publish

# For scoped packages (first publish):
npm publish --access public
```

### Version strategy

- Follow semver: `MAJOR.MINOR.PATCH`.
- For forked plugins (like this repo), use a fork suffix: `1.0.0-ezxomp.0`. The base version tracks the upstream; the suffix identifies the fork iteration.
- Bump the suffix (`.0` → `.1`) for fork-level changes; bump the base version when rebasing on a new upstream release.

## Installing a published package

```bash
# Install (user scope — default):
omp plugin install @scope/my-plugin

# Pin version:
omp plugin install @scope/my-plugin@1.0.0

# Install to project scope:
omp plugin install @scope/my-plugin --scope project

# Force reinstall:
omp plugin install @scope/my-plugin --force

# List:
omp plugin list

# Uninstall:
omp plugin uninstall @scope/my-plugin
```

## The lock file

Installed npm plugins are tracked in `~/.omp/plugins/omp-plugins.lock.json`:

```json
{
  "plugins": {
    "@scope/my-plugin": {
      "version": "1.0.0",
      "enabled": true,
      "enabledFeatures": null
    }
  }
}
```

- `enabled: false` disables a plugin without uninstalling.
- `enabledFeatures: null` loads default-enabled features. A `string[]` enables only listed features.
- Stale entries (in lock but not in `package.json`) are orphaned — they don't load but persist in the lock. Clean with `rm ~/.omp/plugins/omp-plugins.lock.json` and `bun install`.

## Local development install

```bash
# Symlink a local plugin for development:
omp plugin link ./path/to/my-plugin --scope user

# OMP reads package.json#name to determine the symlink target.
# Changes to source files are immediately reflected (no rebuild needed for TS).
```

For project-internal dev installers, run `omp plugin link <abs-path> --scope user` for each plugin. See `scripts/install-local.ts` in this repo for a working example.

## Scaffolding and verification

```bash
# Scaffold a new plugin (creates package.json, src/index.ts, AGENTS.md, etc.):
bun run scripts/scaffold-plugin.ts my-plugin --description "What it does" --with-skills --with-tools

# Verify before publishing:
bun run scripts/verify-scaffold.ts my-plugin

# Then test locally:
omp plugin link ./plugins/my-plugin --scope user
omp plugin list
omp plugin doctor
```

## Validation before publishing

```bash
# 1. Verify package.json is valid OMP plugin:
bun run scripts/verify-scaffold.ts my-plugin
omp plugin link ./plugins/my-plugin --scope user
omp plugin list  # should show the plugin

# 2. Run doctor:
omp plugin doctor

# 3. Check the tarball contents:
npm pack --dry-run | grep -E 'skills|commands|hooks|tools|src/index'

# 4. Test install from tarball:
npm pack
omp plugin install ./my-plugin-1.0.0.tgz
omp plugin list
omp plugin uninstall @scope/my-plugin
```
