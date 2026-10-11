# AGENTS.md — evo

## Purpose
OMP extension: evo mode toggle. Restricts the main agent and/or subagents to an
eval-first, marketplace-plugin tool set and blocks native `write`/`bash`/`edit`/
`glob`/`grep`. EVO is a model-agnostic operating policy, not a provider feature:
it owns **capability** (which tools may run), **routing** (which allowed tool for
which intent), and **recovery** (how the exact pre-evo grants are restored).

## Ownership
- Package: `@ezxomp/evo` (fork of `pi-evo-mode`)
- Entry: `extensions/index.ts` — composes evo-main and evo-sub controllers; slash
  commands `/evo` and `/evo-sub`

## Local Contracts
- Vendored `js-yaml@4.3.1` + `argparse@2.0.1` under `vendor/` (see
  `vendor/VENDORED.md`); loaded via a tiny in-tree ESM wrapper. OMP marketplace
  install does not run npm/bun install, so `dependencies` is metadata only at
  runtime — tests import `../vendor/js-yaml.mjs`, never bare `js-yaml`.
- Peer dep: `@oh-my-pi/pi-coding-agent` 18.0.6
- Slash commands:
  - `/evo {on, off, refresh, debug}` (main lane)
  - `/evo-sub {on, off, refresh, regenerate, debug}` (sub lane)

### Main-agent tool exposure (`extensions/evo/tools.ts`)
`buildEvoMainTools` computes the allowlist from live `getAllTools()` at toggle time —
every registered tool is allowed (base utilities, MCP, and all marketplace-plugin
tools: codesight, code-nav, experiences, agent-learning, cook, backlog,
extensible-workflows, plannotator), except native `write`/`bash`/`edit`/`glob`/`grep`.
`read` stays for protocol URIs only. **Protected floor** (`PROTECTED_TOOLS`): `task`,
`hub`, `eval` always union in regardless of the snapshot so orchestration survives;
`read` joins only when the host registers it. **Eval-first**: `eval` is the default
surface for file/shell/batch ops. Newly installed plugins are picked up on the next
`/evo on` or `/evo refresh`.

### Transactional generation state (`extensions/evo/generation-state.ts`)
The core of the recovery contract. Each lane keeps its own durable, schema-versioned
record; a shared `serializeTransition` lock serializes every activate/deactivate/
refresh/regenerate so concurrent transitions cannot interleave.

- **Main lane** → `agent/evo-mode/main-generation.json`: `MainGenerationRecord` holds
  the original active-tool grant snapshot (`originalToolNames`) plus hashes. It is
  **grants/hashes only — never profile paths.** Persisted atomically (tmp+rename)
  **before** the active tool surface changes; `config.main=true` is written only after
  the record is committed. On restart, `hydrate()` re-proves the committed generation
  and `/evo off` restores **exactly** the original set (not all registered tools).
  `schemaVersion`, `generationId`, `policyVersion`, and `status`
  (`pending|active|restoring|failed`) are validated; an invalid/foreign record fails
  closed.
- **Sub lane** → `agent/evo-mode/sub-state.json`: `SubGenerationRecord` binds
  project-nearest profiles to one owner cwd, storing per-profile byte-exact
  `originalContent`, `originalHash`, `effectiveContentHash`, and original/effective
  tool names. Refresh rotates `generationId` while keeping immutable originals.
- **Legacy** `generation-state.json` (pre-lane-split shared record) is **not** recovery
  authority: `migrateLegacySharedRecord` conservatively migrates only records whose
  project profiles all belong to the current authorized cwd; ambiguous/foreign
  evidence is `retained` untouched and activation refuses to overwrite it.
- Path authority is centralized in `paths.ts` (`OMP_HOME` override respected).

### Sub-agent derived policy (`extensions/evo/tools.ts` + `evoSub.ts`)
`/evo-sub on` rewrites the ten cook-* profiles' `tools:` frontmatter. The effective
surface is **derived from the profile's own original grants**, not a flat replace:

```
effective = registered(original - SUB_DENIED_TOOLS - cook_dispatch_*)
          + SUB_BASE_TOOLS (eval, hub, yield)
          + role tools (SUB_ROLE_TOOLS, if the role already had them)
```

- `SUB_DENIED_TOOLS` drops native mutation tools (eval replaces them); `task` and
  `cook_dispatch_*` stay out so children can never loop-spawn.
- **Project-nearest wins** (`selectProjectNearestProfiles`): when a profile exists in
  both the global dir (`$OMP_HOME/agents`) and the project-local dir
  (`<cwd>/.omp/agents`), only the project copy is rewritten; the global copy is left
  byte-untouched.
- **Conflict-safe restore**: on `/evo-sub off`, if a profile drifted since activation
  (hash mismatch), the restore is **refused** — the drifted bytes are retained, the
  record is marked `failed`, and `EVO_RESTORE_CONFLICT` is reported with recovery
  evidence kept. `/evo-sub regenerate` performs a verified restore first, then
  re-derives a fresh generation; it never adopts an evo overlay as the new original.
- `evoSubCatalogHash` gives a stable per-role catalog identity for the generation.
- Unknown profile names fall back to the shared base (`SUB_BASE_TOOLS`).

### Routing + stable hooks (`extensions/evo/routing.ts` + `index.ts`)
Deterministic, model-agnostic message surface. One concise canonical routing ladder
(`buildRoutingLadder`) is injected into the main agent's system prompt while the main
lane is active — routing guidance, never a tool inventory. The `tool_call` hook returns
stable, machine-checkable reason codes:

- `EVO_FS_READ_USE_NAV` — native `read` on a filesystem path while main evo is on.
- `EVO_SUBSTATE_INVALID` — `task` dispatch for a cook-* profile while sub evo is on but
  the committed generation, policy/catalog identity, or effective hash cannot be proven
  to match the project-nearest profile (task-dispatch preflight in `preflight.ts`).
- `EVO_REPEAT_VIOLATION` — the same bad native tool was already taught this turn; a hard
  block that never re-teaches, so there is no A↔B redirect loop.

Teach-once: the first misuse of a native tool in a turn emits the full teaching reason;
`PerTurnViolationTracker` (reset at `turn_start`) turns repeats into the concise hard
block. OMP `tool_call` returns `block+reason` — it never auto-substitutes a different
tool.

### Protocol reads (`extensions/evo/routing.ts`)
While evo is on, native `read`/`glob` resolve **supported protocol URIs only**:
`skill://`, `memory://`, `agent://`, `history://`, `artifact://`, `issue://`, `pr://`,
`local://`, `omp://`, `rule://`, `ssh://`, `http(s)://`, and **`xd://`**.
`isProtocolUri` accepts any `scheme://` shape via `PROTOCOL_SCHEMES` (forward-compatible).
Filesystem paths are blocked with `EVO_FS_READ_USE_NAV`.

## Work Guidance
- Sub-modules under `extensions/evo/`: `paths.ts`, `config.ts`, `tools.ts`,
  `frontmatter.ts`, `substate.ts`, `atomic.ts`, `routing.ts`, `preflight.ts`,
  `generation-state.ts`, `evoMain.ts`, `evoSub.ts`
- Never call native `write`/`bash`/`edit`/`glob`/`grep` tools when evo is on; the host
  tool set is collapsed to the allowlist.
- Keep the routing-ladder text in `routing.ts` in sync with the bundled skill when
  either changes.

## Verification
- `bun test` (vitest, see `tests/`): transactional main routing, sub policy/dual-scope,
  substate, extension, skill-frontmatter.

## Child DOX Index
No child AGENTS.md files needed.
