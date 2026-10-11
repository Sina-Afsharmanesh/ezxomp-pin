---
name: ezxomp-marketplace
description: Manage the ezxomp OMP plugin marketplace. Use when adding/updating/removing plugins from .omp-plugin/marketplace.json, installing all or individual plugins, adding the marketplace from local or git remote, or debugging omp plugin install failures.
---

# ezxomp Marketplace Management

Manage the ezxomp plugin marketplace catalog, install plugins, and debug install failures. Grounded in OMP 17.2.x marketplace internals and [official docs](https://github.com/can1357/oh-my-pi/tree/main/docs).

## Official documentation

- [Marketplace system](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md) — catalog format, source formats, commands, scopes, on-disk layout, naming rules
- [Extension authoring](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md) — what plugins can contain
- [Authoring Extensions skill](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md) — package.json manifest, discovery paths
- [Extension Loading](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md) — how OMP discovers and loads plugin files

## What this repo is

`ezxomp` is an OMP **marketplace** — a git repo containing a catalog file (`.omp-plugin/marketplace.json`) that registers 13 forked plugins under `plugins/*`. OMP discovers the catalog, resolves plugin sources, caches them, and installs by `name@marketplace`.

This is NOT a single plugin. `omp plugin install git:<url>` fails because it treats the URL as one tarball. The correct flow is `omp plugin marketplace add` → `omp plugin install <name>@<marketplace>`.

## Catalog schema (OMP contract)

OMP's `parseMarketplaceCatalog` validates this schema strictly. The field is `plugins`, NOT `entries`:

```json
{
  "name": "ezxomp",
  "owner": {
    "name": "ezxomp"
  },
  "plugins": [
    {
      "name": "code-nav",
      "source": "./plugins/code-nav",
      "description": "Multi-role cook-and-dispatch agent fork.",
      "version": "3.8.0-ezxomp.0",
      "attribution": "Forked from @johanthoren/jeff by Johan Thorén."
    }
  ]
}
```

### Field rules

| Field | Type | Rule |
|-------|------|------|
| `name` | string | Matches `/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/`, max 64 chars |
| `owner.name` | string | Required, non-empty |
| `plugins` | array | Required. `entries` will NOT work. |
| `plugins[].name` | string | Same regex as `name`, max 64 chars |
| `plugins[].source` | string \| object | String must start with `./`. Object variant: `{ source: "github"\|"url"\|"git-subdir"\|"npm", ... }` |
| `plugins[].description` | string | Optional. Shown in `omp plugin discover`. |
| `plugins[].version` | string | Optional. Display only; the installed version comes from the plugin's own `package.json`. |
| `plugins[].attribution` | string | Optional. Provenance credit. |

### Source variants

| `source` | Form | Resolution |
|----------|------|------------|
| `"./plugins/<slug>"` | string | Resolved relative to the marketplace root (repo root). Works for local AND cloned-git marketplaces. |
| `{ "source": "github", "repo": "owner/repo", "ref"?, "sha"? }` | object | Clones `https://github.com/owner/repo.git` at ref/sha |
| `{ "source": "url", "url": "https://...", "ref"?, "sha"? }` | object | Clones the git URL at ref/sha |
| `{ "source": "git-subdir", "url": "...", "path": "subdir", "ref"?, "sha"? }` | object | Clones repo, resolves `path` subdirectory (must stay inside repo) |
| `{ "source": "npm", "package": "..." }` | object | NOT YET SUPPORTED — throws error. Use git or local sources. |

### Catalog discovery

OMP searches for the catalog at these paths (in order):
1. `.omp-plugin/marketplace.json`
2. `.claude-plugin/marketplace.json`

This repo uses `.omp-plugin/marketplace.json`.

## Install workflow

### Add the marketplace

```bash
# From a local clone:
omp plugin marketplace add ~/repo/ezxomp

# From the git remote (tangled):
omp plugin marketplace add https://tangled.org/expi.tngl.sh/ezxomp
```

For local sources, OMP reads the catalog directly (no clone). For git sources, OMP clones the repo into a cache dir (`~/.omp/agents/data/marketplaces/`), then reads the catalog.

### Discover available plugins

```bash
omp plugin discover            # list all plugins from all marketplaces
omp plugin discover ezxomp     # list plugins from the ezxomp marketplace only
```

### Install plugins

```bash
# Individual plugin:
omp plugin install skillforge@ezxomp --scope user

# Multiple plugins:
omp plugin install experiences@ezxomp skillforge@ezxomp --scope user

# All 9:
omp plugin install skillforge@ezxomp skills@ezxomp code-nav@ezxomp \
  codesight@ezxomp experiences@ezxomp compact-eng@ezxomp \
  extensible-workflows@ezxomp plannotator@ezxomp augment@ezxomp --scope user

# Force reinstall:
omp plugin install skillforge@ezxomp --force

# Verify:
omp plugin list
```

Individual installs of plugins with sibling runtime dependencies must include their providers first or in the same command:

| Plugin | Also install |
| --- | --- |
| `skillforge` | `experiences` |
| `extensible-workflows` | `experiences` |
| `augment` | `experiences` |
| `codesight` | `experiences` |

### Plugin ID format

`<plugin-name>@<marketplace-name>` — e.g. `skillforge@ezxomp`. The combined length must be ≤ 128 chars. Both parts must match the name regex. OMP validates this before resolving the install.

### Uninstall

```bash
omp plugin uninstall skillforge@ezxomp
```

### Update the marketplace

```bash
# Pull latest catalog from the source:
omp plugin marketplace update ezxomp

# Update all marketplaces:
omp plugin marketplace update --all
```

For git marketplaces, this re-clones and re-caches the catalog. For local marketplaces, it re-reads the file.

### Remove the marketplace

```bash
omp plugin marketplace remove ezxomp
```

This removes the catalog from the registry. Installed plugins from this marketplace remain installed but lose their marketplace association.

## Managing the catalog

### Add a new plugin

```bash
# Scaffold a new plugin (creates directory + marketplace entry):
bun run scripts/scaffold-plugin.ts my-plugin --description "What it does" \
  --with-skills --with-tools --with-commands

# Verify the scaffold:
bun run scripts/verify-scaffold.ts my-plugin
```

The scaffold script:
1. Creates `plugins/<slug>/` with `package.json`, `src/index.ts`, `AGENTS.md`, `LICENSE`, `README.md`
2. Optionally creates `skills/`, `hooks/`, `commands/`, and an empty `.mcp.json`; `--with-tools` registers a placeholder tool in `src/index.ts`
3. Appends the entry to `.omp-plugin/marketplace.json` and the root Child DOX Index

### Manual catalog edit

1. Create the plugin directory: `plugins/<slug>/` with `package.json` containing the `omp` manifest.
2. Add an entry to `.omp-plugin/marketplace.json` under `"plugins"`:

```json
{
  "name": "<slug>",
  "source": "./plugins/<slug>",
  "description": "One-line description.",
  "version": "1.0.0-ezxomp.0",
  "attribution": "Forked from <source>."
}
```

3. Test locally:

```bash
omp plugin marketplace remove ezxomp 2>/dev/null  # remove stale
omp plugin marketplace add ~/repo/ezxomp
omp plugin discover ezxomp          # should list the new plugin
omp plugin install <slug>@ezxomp --scope user
omp plugin list
omp plugin uninstall <slug>@ezxomp
```

### Update a plugin version

1. Bump `version` in `plugins/<slug>/package.json`.
2. Bump `version` in the `.omp-plugin/marketplace.json` entry (display only — the real version comes from `package.json`).
3. Test with `--force` to trigger reinstall.

### Remove a plugin

1. Delete the entry from `.omp-plugin/marketplace.json` `plugins` array.
2. Remove the plugin directory `plugins/<slug>/`.
3. Users who installed it keep their cached copy until they update or remove it.

## How source resolution works

When `omp plugin install <name>@ezxomp` runs:

1. OMP reads the marketplace registry (`~/.omp/agents/data/marketplaces.json`) to find the `ezxomp` entry.
2. For **local** marketplaces: `marketplaceClonePath` = the resolved local directory (e.g. `/home/egsox/repo/ezxomp`).
3. For **git** marketplaces: `marketplaceClonePath` = the cached clone dir.
4. OMP finds the plugin entry in the catalog, reads its `source` field.
5. If the source is a relative string (e.g. `"./plugins/code-nav"`): OMP resolves it as `path.join(marketplaceClonePath, "./plugins/code-nav")`, checks it stays inside the marketplace root, and verifies the directory exists.
6. OMP reads `package.json` from the resolved dir, validates `name` and `version`, reads the `omp` manifest.
7. OMP copies the plugin dir to the cache: `~/.omp/agents/data/plugins/cache/<marketplace>___<plugin>___<version>/`.
8. OMP resolves extension/skill/hook/command/tool paths, validates them, and registers the plugin.

Relative `./plugins/<slug>` sources work identically for local and git marketplaces because both provide a `marketplaceClonePath`.

## Common failures and fixes

### `Missing or invalid field "plugins" in catalog`

**Cause:** The catalog uses `"entries"` instead of `"plugins"`.

**Fix:** Rename `entries` → `plugins` in `.omp-plugin/marketplace.json`.

### `ZlibError decompressing "<url>"`

**Cause:** `omp plugin install git:<url>` treats the URL as a tarball. Git remotes are not tarball endpoints.

**Fix:** Use `omp plugin marketplace add <url>` to add the repo as a marketplace, then `omp plugin install <name>@<marketplace>`.

### `Cannot resolve relative source: marketplaceClonePath is required`

**Cause:** The marketplace was added via a direct URL (not git clone), but a plugin uses a relative `./` source.

**Fix:** Re-add the marketplace using its git URL (not a raw JSON URL). Relative sources require a git or local marketplace that provides a clone path.

### `Plugin source "./plugins/X" resolves outside marketplace root`

**Cause:** The relative path escapes the marketplace directory (e.g. `../../somewhere`).

**Fix:** Keep all plugin sources under the marketplace root. Use `./plugins/<slug>` only.

### `Plugin source directory does not exist: "<path>"`

**Cause:** The catalog references a plugin directory that doesn't exist.

**Fix:** Create `plugins/<slug>/` with a valid `package.json`, or remove the entry from the catalog.

### `npm plugin sources are not yet supported`

**Cause:** A catalog entry uses `{ "source": "npm", "package": "..." }`.

**Fix:** Use `./plugins/<slug>` (local) or `{ "source": "github", "repo": "..." }` (git) instead.

## The 13 plugins in this marketplace

| Name | Version | Source |
|------|---------|--------|
| `skillforge` | 0.2.5-ezxomp.1 | `@narumitw/pi-skillforge` (npm fork) |
| `skills` | 0.7.4-ezxomp.0 | `@xynogen/pix-skills` (npm fork) |
| `code-nav` | 0.5.0-ezxomp.0 | `pi-code-nav` (npm fork) |
| `codesight` | 0.2.1-ezxomp.1 | `pi-codesight` (npm fork) |
| `experiences` | 0.1.49-ezxomp.1 | `pi-experiences` (npm fork) |
| `compact-eng` | 2.0.0-ezxomp.0 | `pi-ultra-compact` origin; ezxomp native-composition rearchitecture |
| `extensible-workflows` | 5.1.0-ezxomp.1 | `vekexasia/pi-extensible-workflows` (git fork) |
| `plannotator` | 0.25.1-ezxomp.1 | `backnotprop/plannotator` (git fork) |
| `augment` | 1.0.8-ezxomp.0 | `pi-augment` (npm fork) |
