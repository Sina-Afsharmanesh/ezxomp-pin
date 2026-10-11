# omp-code-nav
Grounded code navigation companion for OMP.
`@ezxomp/code-nav` is the navigation policy layer. It helps OMP decide the next code-intelligence hop after a repository area, file, or symbol is grounded, handing off to the right tool family from repository discovery to exact-symbol navigation to native LSP operations.

## Install

```bash
omp plugin install @ezxomp/code-nav
```

Or from git:

```bash
omp plugin install https://github.com/anh-chu/pi-code-nav
```

Or via npm directly:

```bash
bun add @ezxomp/code-nav
```

OMP loads the extension through `package.json.omp.extensions`.

## Why it exists

Natural coding tasks, debug, fix, or feature, break into subtasks. Broad discovery, grounded symbol inspection, usage tracing, semantic IDE ops, and final answer. Different tools win at different phases.

`@ezxomp/code-nav` keeps that decision sharp so the agent:

- does not jump to symbol lookups before grounding
- does not fall back to broad `read` once a symbol is already known
- does not repeat work when the session already has enough evidence
- hands off semantic IDE work to native `lsp`

## Value props

- **Grounded symbol navigation**, minimal slices, definition location, grouped references.
- **Navigation planner**, bounded 1-4 hop plan across discovery tools, `code_nav_*`, native `lsp`, `read`, and answer-now.
- **Session-aware reuse**, resolved definitions, top caller files, and queried symbols persist inside the session.
- **Answer-now short-circuit**, planner can return a direct answer when evidence already suffices.
- **Tight steering**, tool descriptions and intent classifier target agent subtask shape, not literal user wording.
- **Complements, not replaces**, works alongside CodeSight for discovery and the plugin-owned `ast_grep_search` / `ast_grep_replace` for structural edits.

## Ecosystem

Recommended stack:

- **[`codesight`](https://github.com/anh-chu/pi-codesight)**, repository discovery. Routes, schema, subsystems, env, hot files.
- **`@ezxomp/code-nav`** (this), grounded navigation, planner, and structural AST search/replace.
- **Built-ins**, `read`, `grep`, `glob`, `lsp`, `ast_edit`.

Rule of thumb:

- broad or fresh task -> `codesight_*`, `glob`, or `read`
- grounded symbol, caller, or usage task -> `code_nav_*`
- IDE-style semantic op -> native `lsp`
- cheap local confirmation in an already-open file -> `read`
- undecided or compound task -> `code_nav_plan_navigation`

## Guidance for users

Users do not need to learn any tool name. Just ask naturally.

- “Debug this failing auth flow.”
- “Fix the route parser bug.”
- “Implement a retry policy in the sync job.”
- “Where is this function actually used?”
- “Show me the implementation of X.”

The agent picks the right tool. Slash commands are available for direct control.

## Agent tools

All tools are registered when OMP loads the extension.

### `code_nav_get_symbol`
Read one exact grounded symbol definition with minimal code.
- Input: `symbol` (required), `file`, `includeBody`, `contextLines`.
- Best when current subtask is minimal implementation inspection.
- Returns: compact slice, location, owning file, jump-ready next-step hints.

### `code_nav_find_definition`
Find the exact definition location of a grounded symbol.
- Input: `symbol` (required), `file`.
- Best when the subtask is resolving the owning file or line.
- Returns: file, line, character, next-step hints.

### `code_nav_find_references`
Find usages of a grounded symbol, grouped by file, caller file prioritized.
- Input: `symbol` (required), `file`, `limit`.
- Best when the subtask is caller tracing, usage tracing, or impact.
- Returns: grouped hits with enriched context (calls, imports, function role, export status), top caller file, next-step hints.

### `code_nav_trace`
Transitive call-chain exploration. Finds references, then extracts what each caller file invokes.
- Input: `symbol` (required), `file`, `depth` (1-3), `limit` (3-20).
- Best when debugging requires following chains: `auth.login()` -> `validateUser()` -> `checkPermissions()`.
- Returns: root symbol, callers with calls-in-context and imports, follow-up hints for deeper tracing.
- Depth > 1 recursively traces the strongest caller chain.

### `code_nav_compare`
Side-by-side implementation analysis. Finds similar function implementations across a scope.
- Input: `symbol` or `pattern` (one required), `scope`, `limit` (2-15).
- Best when comparing how a pattern is implemented across files (e.g., error handling, validation).
- Returns: implementations with calls, common pattern, outliers that deviate from the norm.

### `code_nav_rank_context`
Prioritize files and symbols already observed inside this OMP session.
- Does not explore the repo. Ranks in-memory session state only.
- Returns: ranked items, session state counts, guidance, fresh-session warning if empty.

### `code_nav_plan_navigation`
Plan the next 1-4 navigation hops.
- Input: `task` (required), `symbol`, `file`, `mode`, `limit`.
- Returns: intent, best route, next tool, next args, fallback steps, stop conditions, evidence snapshot.
- Possible routes: `discovery`, `code_nav`, `lsp`, `read`, `answer`.

## Multi-language support

`code_nav_*` symbol navigation works across all languages supported by the plugin-owned `ast_grep_search`. The fallback scanner reads source files and applies language-aware declaration patterns.

| Language | Extensions | Declaration patterns |
|---|---|---|
| TypeScript / JS | `.ts .tsx .js .jsx .mjs .cjs` | `function`, `class`, `interface`, `type`, `enum`, `const` |
| CSS / SCSS / Sass | `.css .scss .sass .less` | `.class {`, `#id {` |
| Python | `.py` | `def`, `class`, `async def` |
| Go | `.go` | `func`, `type` |
| Rust | `.rs` | `fn`, `struct`, `impl`, `trait`, `enum` |
| Java / Kotlin | `.java .kt .kts` | `class`, `interface` |
| Ruby | `.rb` | `def`, `class`, `module` |
| PHP | `.php` | `function`, `class` |
| Swift | `.swift` | `func`, `class`, `struct`, `protocol` |
| Dart | `.dart` | `class`, `void` |
| Elixir | `.ex .exs` | `def`, `defmodule` |
| Scala | `.scala` | `def`, `class`, `object`, `trait` |
| HTML | `.html .htm` | tag / class / id patterns |
| Lua | `.lua` | `function`, `local function` |
| Haskell | `.hs` | symbol at line start |

No install or config required. Language is detected automatically from file extension.

> **Note:** Native OMP LSP semantic navigation remains TypeScript-focused. The `code_nav_*` tools use the containment-checked filesystem scanner and plugin-owned ast-grep backend for other languages.

## Slash commands

Slash commands are a direct control surface in interactive OMP sessions.

- `/symbol <name> [fileHint]`, run `code_nav_get_symbol`.
- `/refs <name> [fileHint]`, run `code_nav_find_references`.
- `/rank <task>`, run `code_nav_rank_context`.
- `/nav <task>`, run `code_nav_plan_navigation`.

After manifest changes, restart OMP or reinstall the package so new commands register.

## Schema

### Planner result

```ts
type ToolRouteFamily = 'discovery' | 'code_nav' | 'lsp' | 'read' | 'answer';

interface NavigationPlan {
  intent: 'inspect' | 'define' | 'trace' | 'impact' | 'debug' | 'discover' | 'explain';
  status: PlannerStatus;
  confidence: 'low' | 'medium' | 'high';
  bestRoute: { primary: ToolRouteFamily; toolName?: string; args?: Record<string, unknown>; reason: string };
  steps: NavigationStep[];
  fallbackSteps: NavigationStep[];
  stopWhen: string[];
  nextTool?: string;
  nextArgs?: Record<string, unknown>;
  evidence: EvidenceSnapshot;
  freshSession: boolean;
}
```

### Symbol result

```ts
interface SymbolSliceResult {
  content: string;
  details: {
    symbol: string;
    location: { file: string; line: number; character?: number };
    owningFile: string;
    body?: string;
    nextBestTool?: string;
    nextBestArgs?: Record<string, unknown>;
    nextBestReason?: string;
  };
}
```

### Reference result

```ts
interface ReferenceResult {
  content: string;
  details: {
    symbol: string;
    groupedHits: Array<{ file: string; count: number; line: number; snippet?: string }>;
    bestNextCallerFile?: string;
    bestNextReadArgs?: { path: string };
    topImpactFiles: Array<{ file: string; score: number }>;
    nextBestTool?: string;
    nextBestArgs?: Record<string, unknown>;
  };
}
```

## Usage

### Natural prompts

```text
Debug why route parsing mishandles trailing slashes.
```
Agent path: discovery first, then grounded symbol hop, then reads minimal code.

```text
Show the implementation of registerPiLspTools.
```
Agent path: `code_nav_get_symbol`.

```text
Where is registerPiLspTools used across the repo?
```
Agent path: `code_nav_find_references`.

```text
Where is registerPiLspTools defined?
```
Agent path: `code_nav_find_definition`, or answer-now if already grounded in session.

### Planner-first

```text
Plan the next navigation move to debug a possible tool registration issue.
```
Agent path: `code_nav_plan_navigation`. Returns next tool + args or answer-now.

### Interactive slash

```
/symbol registerPiLspTools src/tools.ts
/refs registerPiLspTools src/tools.ts
/nav show exact definition location for registerPiLspTools
/rank changes related to tool registration
```


## User-exposed skills

No separate skill bundle ships with `@ezxomp/code-nav` yet. Planner guidance is embedded in the tool descriptions and surfaced through `/nav`.

Recommended companion skills from the OMP ecosystem:

- `lsp-navigation`, for native `lsp` semantic operations.
- `ast-grep`, for structural code search and edits.
- `structured-return`, for compact test and build outputs.
- `commit` and `github`, for git and PR flow after edits.

## Configuration

`pi-code-nav` reads no external configuration. Internal caching is mtime-scoped per file.

## Docs

- `docs/TOOL-CHOOSER.md`, which tool fits which subtask.
- `docs/WORKFLOWS.md`, canonical debug, fix, and feature flows.
- `CHANGELOG.md`, version history.

## License

MIT. See `LICENSE`.
