# OMP Skillforge

OMP package for improving agent skills through verified global memory and reviewed skill patches.

`Skillforge` automatically captures verified gotchas, fixes, decisions, and workflow learnings from coding-agent sessions, stores them under OMP's profile-aware agent directory, retrieves only relevant entries for active skills, and promotes stable repeated learnings into skill patch proposals.

## Status

Early implementation. The package supports global-only project-aware memory storage, automatic retrieval injection, agent-mediated automatic capture, and automatic skill patch proposal generation. The only user-facing command reviews pending patches for one skill and applies them after explicit approval.

See [PLAN.md](./PLAN.md) for the product plan and memory model, and [docs/runtime-behavior.md](./docs/runtime-behavior.md) for the runtime behavior during normal OMP usage.

## Install

Install from npm:

```bash
omp plugin install @ezxomp/skillforge
```

Try without installing permanently:

```bash
omp plugin run @ezxomp/skillforge
```

For local development:

```bash
omp --plugin-dir .
```

## Usage

`Skillforge` is designed to be zero-maintenance during normal agent work. After the package is loaded, there is no setup command and no manual memory workflow.

What happens automatically:

1. Before each agent turn, relevant project/global memories are retrieved and injected as hidden context.
2. During work, the agent may call `skillforge_capture_memory` when it has a verified reusable gotcha, decision, or pattern.
3. When a confirmed memory becomes stable enough, the extension writes a pending skill patch proposal under the global Skillforge store.

The user-facing `/skillforge` command is a small command center for reviewing generated skill patches and inspecting or deleting stored memories:

```text
/skillforge help
/skillforge list [all|global|project] [all|gotchas|decisions|patterns]
/skillforge 列出所有 global 的 GOTCHA
/skillforge delete <memory-id>
/skillforge delete global <memory-id>
/skillforge delete project <memory-id>
/skillforge review <skill-name>
/skillforge <skill-name>
```

Examples:

```text
/skillforge list global gotchas
/skillforge delete global gotcha-example-id
/skillforge review python-typer
```

Patch review commands:

1. Find pending patch proposals for the named skill.
2. Show the target skill, source memory, proposed guidance, rationale, and verification evidence.
3. Ask for approval before editing the target `SKILL.md`.
4. Mark the proposal as applied and append to `promotion-log.md` after a successful apply.

The legacy shorthand `/skillforge <skill-name>` still reviews patches for that skill.

Memory delete commands are intentionally conservative:

1. They delete by memory id only, never by arbitrary filesystem path.
2. They show the partition, type, title, id, and path before deletion.
3. They require explicit confirmation.
4. They rebuild the memory index after deletion.
5. If an id is ambiguous across project/global partitions, they ask you to specify the partition.

There are intentionally no commands for init, capture, retrieve, validate, reindex, or promote; those flows are automatic/internal.

## Storage

All Skillforge data is stored under OMP's active profile directory returned by `getAgentDir()`:

```txt
getAgentDir()/skillforge/
├── memory/
│   ├── global/
│   │   ├── gotchas/
│   │   ├── decisions/
│   │   └── patterns/
│   └── projects/
│       └── <project-id>/
│           ├── gotchas/
│           ├── decisions/
│           └── patterns/
├── promotions/
│   ├── global/
│   └── projects/
│       └── <project-id>/
├── registry.yaml
├── index.json
└── promotion-log.md
```

There is no repo-local `.omp-skillforge/` store. Project-specific memories are isolated by `<project-id>` inside the OMP profile store; retrieval reads only the current project partition plus the global partition.

## Workflows

### Automatic capture

The extension registers the `skillforge_capture_memory` tool. The agent may use it automatically when the current task produces a verified, reusable gotcha, decision, or pattern with concrete evidence.

Capture rules are intentionally conservative:

- Do not capture speculation or ordinary chat history.
- Capture only reusable learnings with prevention value.
- Include trigger, symptom, root cause, fix, verification, scope, and confidence.
- Prefer the project partition for project-specific learnings.
- Use the global partition only for clearly cross-project learnings.

### Automatic retrieval

Before each agent turn, the extension retrieves relevant memories from:

- the current project partition
- the global partition

Relevant memories are injected as hidden concise context. Unrelated memories are not injected.

Retrieval rules are conservative:

- `draft` and `deprecated` memories are ignored.
- `excluded_skills` blocks injection when a loaded skill is excluded.
- Skill-scoped memories require a loaded `skills` or `compatible_skills` match.
- Prompt/scope terms must also match, so a loaded skill alone is not enough.

### Automatic promotion

Confirmed memories become skill patch proposals automatically when they are stable enough.

MVP promotion criteria:

- `confidence: confirmed`
- `hits >= 3`
- at least one target `skills` entry

Promotion is checked after a memory is saved and after relevant memories are retrieved. The extension generates proposal files under `promotions/`, but does not modify `SKILL.md` until you run `/skillforge review <skill-name>` or legacy `/skillforge <skill-name>` and approve the patch.

## Package layout

```txt
omp-skillforge/
├── src/
│   ├── index.ts
│   ├── memory/
│   │   ├── capture.ts
│   │   ├── parse.ts
│   │   ├── retrieve.ts
│   │   ├── serialize.ts
│   │   └── validate.ts
│   ├── promotion/
│   │   └── promotion.ts
│   ├── store/
│   │   └── storage.ts
│   └── shared/
│       └── types.ts
├── schemas/
├── templates/
├── examples/
├── README.md
└── package.json
```

The package exposes its extension through `package.json`:

```json
{
	"omp": {
		"extensions": ["src/index.ts"]
	}
}
```

## Development

Install dependencies:

```bash
npm install
```

Useful commands:

```bash
just check       # biome check + typecheck
just format      # format files with Biome
just hooks       # install pre-commit hooks
just pack        # preview npm package contents
just publish     # publish with --access public
just verify-npm  # check npm registry metadata
```

## Release

Typical patch release:

```bash
just bump patch
just check
just publish
just tag
```

For scoped npm packages, publishing must use public access. The `just publish` recipe already runs:

```bash
npm publish --access public
```

If `npm publish` succeeds but `omp plugin install @ezxomp/skillforge` returns 404 immediately afterwards, wait a few minutes for npm registry metadata to propagate, then run:

```bash
just verify-npm
```

## Lean-ctx / eval usage capture (TASK-25)

Skillforge auto-captures how agents use `ctx_*` and eval tools during sessions.

### What is captured
- Tool-call sequences for `ctx_read`, `ctx_search`, `ctx_compose`, `ctx_shell`, `eval`, `ctx_execute`.
- Efficiency flags: search-read-search chains, sequential evals that could be `parallel(thunks)`,
  redundant re-imports across eval cells, orientation via scattered reads instead of one `ctx_compose`.
- Errors (triage filtering, argument validation failures) with recovery actions.

### Where records go
- Pattern memories: the global `memory/global/patterns` store (existing layout preserved).
- Promotion proposals: `<agentDir>/skillforge/promotions/<id>.md`, each with
  Before/After comparison, occurrence count, measured call/error evidence, and an
  estimated per-occurrence token saving. A proposal is generated after a pattern
  repeats at least twice.

### Review surface
Run `/skillforge review` to inspect pending proposals, or read
`<agentDir>/skillforge/promotions/*.md` directly; each file carries a
`status: pending` marker until reviewed.

### Session injection
At `before_agent_start`, up to five stored lean-ctx/eval pattern fixes are injected
into agent context as an undisplayed custom message.
