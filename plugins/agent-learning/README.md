# @ezxomp/agent-learning

Unified agent-learning plugin for OMP — consolidates the **skills**, **skillforge**, and **experiences** lanes onto OMP's native substrate (skill discovery, `skill://` + `/skill:`, `manage_skill` isolation, pluggable memory backends).

## Lanes

| Lane | What | Where implemented |
|---|---|---|
| surface | `read_skills` scoped to the bundled ezxomp catalog + skills.sh search/fetch (safe-language-only policy) | `src/read-skills.ts` + `src/remote.ts` |
| facts | thin adapter over the native memory backend — no own store, no injection | `src/facts.ts` |
| procedures | skillforge evidence pipeline: capture → promotion thresholds → human-gated SKILL.md patches | `src/procedures/` |
| habits | companion package `@ezxomp/experiences` (`/experience`) — intentionally not re-registered here to avoid duplicate registration when both are installed | routed via `/learning experience` |
| gate | optional `learning.review` guidance routing captures into reviewed lanes | `src/review-gate.ts` |

## Install

```
omp plugin install @ezxomp/agent-learning
```

Migration notes:

- Existing `~/.omp/agent/skillforge/` stores migrate automatically (atomic rename) to `~/.omp/agent/agent-learning/` on first procedures write.
- The legacy `skills` and `skillforge` backcompat shims are archived (`archive/_reference/`); users still holding those marketplace installs should uninstall them — this package provides every lane they re-exported.
- `read_skills` list/description now cover only the catalog + cached remote bundles; user/project skills come from native discovery (`skill://<name>`, `/skill:<name>`).

## Review gate

Enable with env `LEARNING_REVIEW=1` or `<agentDir>/agent-learning.json`:

```json
{ "review": true }
```

When on, pre-turn guidance routes captures: facts → native memory, verified gotchas/decisions/patterns → `skillforge_capture_memory`, behavioral habits → `/experience`. Explicitly does not mutate native autolearn settings.

## Learning-review enforcement

When `learning.review` is ON, also set `autolearn.autoContinue: false` in the OMP agent config (`~/.omp/agent/config.yml` or `/settings → Auto-Learn → Auto-run capture at stop OFF`) so unreviewed managed-skill writes cannot occur autonomously. Keep `autolearn.enabled: true` so manual `learn`/`retain` stays available.

```yaml
autolearn:
  enabled: true            # keep true for manual learn/retain
  autoContinue: false      # ← required when learning.review is ON
```

Optional hard freeze on managed-skill writes (not default — blocks intentional maintenance too):

```yaml
tools:
  approval:
    manage_skill: deny
```

This config-only approach (no `tool_call` handler) is the m-0 enforcement strategy. See the backlog design spec **doc-5** for the full edge-case discussion, including why a `tool_call` block is rejected for m-0 (runner.ts:265, wrapper.ts:65, types.ts:930).

## Commands

- `/learning [status]` — lane overview.
- `/learning experience` — pointer to the companion habits command.
- `/learning skillforge <args>` — same handlers as `/skillforge`.
