---
name: omp-plugin-authoring
description: Create and structure an OMP-native plugin. Use when building a new plugin, adding extensions/hooks/skills/commands/tools/MCP to an existing plugin, or validating a plugin package.json omp manifest against the OMP runtime contract.
---

# OMP Plugin Authoring

Author, extend, and validate OMP-native plugins. Grounded in OMP 17.2.x runtime internals and [official docs](https://github.com/can1357/oh-my-pi/tree/main/docs).

## Official documentation

- [Extension API surface, events, tools, commands](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md) — primary authoring guide (`ExtensionAPI`, event catalog, tool/command registration)
- [Authoring Extensions skill](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md) — quick start, factory signature, discovery paths, debugging
- [Extension Loading](https://github.com/can1357/oh-my-pi/blob/main/docs/extension-loading.md) — path resolution rules, filesystem loading order
- [hello-extension example](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/examples/hello-extension/README.md) — minimal working example
- [Marketplace system](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md) — catalog schema, source formats, install/update/scope

## What an OMP plugin is

An OMP plugin is an npm-style package with a `package.json` whose `omp` (or legacy `pi`) field holds the **manifest**. OMP loads the package from `node_modules` (npm install), a marketplace cache, or a symlink, reads the `omp` manifest, and resolves each declared capability into runtime extensions.

The manifest tells OMP *what to load*. The directory structure tells OMP *where to find auto-discovered content*. Both are used together.

## The `package.json` contract

### Required fields

```json
{
  "name": "@scope/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "omp": {
    "extensions": ["src/index.ts"]
  }
}
```

- `name` — npm package name. Scoped names (`@scope/pkg`) create nested cache dirs.
- `version` — semver string. OMP reads this for display and cache keys.
- `omp` (or legacy `pi`) — the manifest object. OMP checks `package.json#omp` first, then falls back to `package.json#pi`. Set `omp.version = package.json#version` automatically at load.

### The `omp` manifest fields

| Field | Type | Purpose |
|-------|------|---------|
| `extensions` | `string \| string[]` | Entry points loaded as ES modules. Each is resolved relative to the plugin root. If a directory, OMP looks for `index.{ts,js,mjs,cjs}`. These modules register runtime hooks (tool interception, event handlers, lifecycle). See [extensions.md](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md). |
| `skills` | `string \| string[]` | Explicit skill entry points. If omitted, OMP auto-discovers `skills/<name>/SKILL.md` (see below). |
| `hooks` | `string \| string[]` | Explicit hook entry points. If omitted, OMP auto-discovers `hooks/pre/` and `hooks/post/` dirs. |
| `commands` | `string \| string[]` | Explicit command entry points. If omitted, OMP auto-discovers `commands/*.md`. |
| `tools` | `string \| string[]` | Explicit tool entry points. If omitted, OMP auto-discovers `tools/` (see below). |
| `settings` | `object` | Plugin settings schema. Each key is a setting name with `{ type, default, min, step, values? }`. Users configure via `omp plugin config`. |
| `features` | `object` | Feature-gated capabilities. Each feature key maps to `{ default?: boolean, extensions?, skills?, hooks?, commands?, tools? }`. Enabled per-install via `--enable`/`--disable` or `omp-plugins.lock.json`. |
| `mcpServers` | — | Not in the manifest. Declared in `.mcp.json` or `mcp.json` at the plugin root (see MCP). |

### Extension modules

`omp.extensions` points to TS/JS modules exporting a default factory function. The factory receives `ExtensionAPI`:

```ts
// src/index.ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI): void {
  const z = pi.zod;

  // Register event handlers
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("My extension loaded!", "info");
  });

  // Register an LLM-callable tool
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Does something useful",
    parameters: z.object({ input: z.string() }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      return { content: [{ type: "text", text: `Got: ${params.input}` }] };
    },
  });

  // Register a slash command
  pi.registerCommand("my-cmd", {
    description: "My command",
    handler: async (_args, ctx) => { ctx.ui.notify("Hi!", "info"); },
  });
}
```

Key constraint: **do not call runtime actions (`pi.sendMessage()`, etc.) during load** — register handlers/tools/commands during load, perform runtime actions only from event handlers, tools, or commands. See [authoring-extensions.md](https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md).

Extensions are resolved relative to the plugin root. If the entry is a directory, OMP searches for `index.ts`, `index.js`, `index.mjs`, `index.cjs` (in that order). Extension entries that point to directories are scanned recursively for all `index.{ts,js,mjs,cjs}` files.

### Peer dependencies

If the plugin uses OMP SDK types or runtime APIs, declare them as peer dependencies:

```json
{
  "peerDependencies": {
    "@oh-my-pi/pi-coding-agent": "17.3.8"
  }
}
```

OMP provides these at runtime; bundling them causes version conflicts.

## Auto-discovered capabilities

OMP scans these directories inside the plugin root. Content is discovered per capability type — you don't declare them in the manifest unless you want explicit paths or feature gating.

### Skills: `skills/<name>/SKILL.md`

```
skills/
  my-skill/
    SKILL.md          ← frontmatter: name, description; body: instructions
```

Discovery rules:
- Each subdirectory of `skills/` containing a `SKILL.md` is a skill.
- The skill name comes from frontmatter `name`, falling back to the directory name.
- Frontmatter `enabled: false` skips the skill.
- Skills without a frontmatter `description` are silently skipped.
- Hidden directories (starting with `.`) are skipped.

### Slash commands: `commands/*.md`

```
commands/
  my-command.md       ← frontmatter: name, description; body: prompt template
```

- Name = filename without `.md`, unless frontmatter `name` overrides.
- Content is the prompt body.

### Hooks: `hooks/pre/` and `hooks/post/`

```
hooks/
  pre/
    Bash.sh           ← runs before Bash tool calls
  post/
    Write.sh          ← runs after Write tool calls
```

- Hook type = directory name (`pre` or `post`).
- Tool matcher = filename without extension. `*` matches all tools.
- Each file is executable; receives tool input as arguments/env.

### Tools: `tools/`

```
tools/
  my-tool.ts          ← TS/JS module exporting a tool definition
  my-tool.json        ← JSON tool definition (name, description, schema)
  my-tool.md          ← MD tool definition (frontmatter: name, description)
```

Supported extensions: `json`, `md`, `ts`, `js`, `sh`, `bash`, `py`.
Subdirectories with an `index.ts` are also discovered as tools.

### Rules: `rules/*.md` or `*.mdc`

```
rules/
  my-rule.md          ← Cursor MDC / Windsurf / Cline format
```

### Prompts: `prompts/*.md`

```
prompts/
  my-prompt.md        ← frontmatter: name, description; body: template
```

### Context files: `AGENTS.md`

A plugin can ship an `AGENTS.md` at its root — it's discovered as a context file.

### MCP servers: `.mcp.json` or `mcp.json`

```json
{
  "mcpServers": {
    "my-server": {
      "command": "/absolute/path/to/trusted-mcp-server",
      "args": ["--stdio"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

- Discovered from `.mcp.json` or `mcp.json` at the plugin root.
- Each entry needs `command` (stdio) or `url` (SSE/HTTP).
- Use a trusted, pinned command or URL; do not add an unpinned package-installer placeholder.
- `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are substituted in `command` and `cwd` paths.

## Feature gating

```json
{
  "omp": {
    "extensions": ["src/core.ts"],
    "features": {
      "advanced-search": {
        "default": false,
        "extensions": ["src/advanced.ts"],
        "skills": ["skills/advanced-search"]
      },
      "experimental": {
        "default": true,
        "commands": ["commands/exp.md"]
      }
    }
  }
}
```

- `default: true` features load when no explicit feature set is configured (install creates `enabledFeatures: null`).
- `default: false` (or omitted) features require explicit `--enable` at install or `enabledFeatures` in the lock.
- When `enabledFeatures` is a Set, only listed features' capabilities are resolved, plus the top-level (ungated) capabilities.

## Validation

### Scaffold a new plugin

```bash
# Create a plugin scaffold with optional capabilities:
bun run scripts/scaffold-plugin.ts my-plugin --description "What it does" \
  --with-skills --with-hooks --with-tools --with-commands --with-mcp

# This creates:
#   plugins/my-plugin/package.json      — omp manifest
#   plugins/my-plugin/src/index.ts       — extension factory skeleton
#   plugins/my-plugin/AGENTS.md          — DOX child doc
#   plugins/my-plugin/LICENSE, README.md, .gitignore
#   Optional: skills/, hooks/, commands/, .mcp.json
#   --with-tools registers a placeholder tool in src/index.ts
#   Also appends the entry to .omp-plugin/marketplace.json and the root Child DOX Index
```

### Verify a plugin

```bash
# Validate a scaffolded or existing plugin:
bun run scripts/verify-scaffold.ts <slug>

# Checks: package.json omp manifest, extension files exist, default export,
# skills/commands frontmatter, .mcp.json structure, marketplace entry, AGENTS.md
```

### Manifest validation (at install)

`omp plugin install` validates:
- `package.json` exists and has `name` and `version`.
- The `omp` (or `pi`) field exists — otherwise the package is ignored (not an OMP plugin).
- Extension paths resolve to existing files/directories within the plugin root.
- Plugin sources don't escape the plugin root (path containment check).

### Runtime validation (at load)

Each capability validates its entries:
- **Skills**: `name` and `path` required.
- **Hooks**: `name`, `path`, `type` (`pre`|`post`), `tool` required.
- **Commands**: `name`, `path`, `content`, `level` (`user`|`project`|`native`) required.
- **Tools**: `name` and `path` required.
- **MCP**: `name`, plus `command` or `url` required. `stdio` transport requires `command`.
- **Rules**: `name`, `path`, `content` (string) required.
- **Prompts**: `name`, `path`, `content` required.

### Doctor

```bash
omp plugin doctor          # check all plugins
omp plugin doctor --fix    # attempt fixes
```

## Plugin directory checklist

```
my-plugin/
  package.json              ← name, version, omp manifest
  src/
    index.ts                ← extension entry (omp.extensions)
  skills/
    my-skill/
      SKILL.md
  commands/
    my-command.md
  hooks/
    pre/
      Bash.sh
    post/
      Write.sh
  tools/
    my-tool.ts
  prompts/
    my-prompt.md
  rules/
    my-rule.md
  .mcp.json                 ← optional MCP server config
  AGENTS.md                 ← optional context file
  LICENSE
  README.md
```

## Patterns from this repo

Existing plugins (`plugins/*`) use minimal manifests — most declare only `extensions: ["src/index.ts"]` and rely on auto-discovery for skills/commands/hooks:

```json
{
  "name": "@ezxomp/codesight",
  "version": "0.1.0-ezxomp.1",
  "omp": { "extensions": ["src/index.ts"] }
}
```

Plugins with settings (like `augment`) add a `settings` object with typed schema fields. Plugins with feature-gated capabilities (like `jeff`'s security-auditor) use the `features` key.
