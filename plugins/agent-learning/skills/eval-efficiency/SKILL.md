---
name: eval-efficiency
description: Efficient use of the stateful eval code-execution tool — persistent kernel semantics, parallel(thunks)/pipeline concurrency, import hygiene, error recovery, language specifics (py/js/rb/jl, Bun globals), and eval vs bash decision rule. Trigger on 'eval tool', 'persistent kernel', 'code execution efficiency', or before running multi-step computation via eval.
---
# Eval Tool Efficiency (persistent kernel)

The `eval` tool runs code in a PERSISTENT kernel. State survives across calls. Treat it as one long-lived session, not one-shot scripts.

## 1. Persistent kernel semantics

- State persists across calls: variables, imports, functions, loaded data all survive. NEVER re-import or re-declare prior top-level names — reuse them.
- Top-level `await` works (py, js). No wrapper needed.
- Python: `asyncio.run(…)` RAISES an error at top level — use bare `await` instead.
- Prior top-level names survive into the next cell — reuse; do NOT re-import/re-declare.
- Re-read a file ONLY if it changed since you last read it.

```python
# Cell 1: import once
import json
data = json.loads(open('cfg.json').read())

# Cell 2: reuse — no re-import
display(sorted(data.keys()))
```

## 2. Concurrency WITHIN a cell

Never split parallelizable work into sequential calls. Use in-kernel helpers:

- `parallel(thunks)` → list of results: run zero-arg callables concurrently.
- `pipeline(items, ...stages)` → list: staged waves with a barrier between stages.

```python
results = parallel([
    lambda: fetch('a'),   # thunks = zero-arg callables
    lambda: fetch('b'),
])
out = pipeline(urls, download, parse, summarize)
```

One cell with `parallel` replaces 3+ sequential calls.

## 3. Import hygiene

- Imports → first cell only. Re-running setup wastes tokens and can clobber state.
- Re-declare a name ONLY when deliberately replacing it.
- After `reset` or a kernel crash, re-run setup ONCE — never proactively.

## 4. Error recovery

- On error: fix and re-run ONLY the failing step. Do NOT restart from cell 1.
- `reset: true` wipes the kernel — use ONLY after a crash/reset requirement. Everything must be re-established afterward.
- Work incrementally: imports → define → test → use, each its own cell.

## 5. Language specifics

| Lang | Calling | Notes |
|---|---|---|
| py | sync, kwargs | top-level await ok; NO asyncio.run() |
| js | async, ONE trailing object literal | args as `{...}` object, never positional |
| rb | sync, kwargs | auto-displays last expression |
| jl | sync, kwargs | auto-displays last expression |

JS runs under **Bun**. Globals available without import: `Bun.file`, `Bun.$`, `fetch`, `Buffer`.

```js
const cfg = JSON.parse(await Bun.file('cfg.json').text())
await Bun.$`ls src`.quiet()
```


- Foreground cells have a ~110s cap. Long work: set `timeout` explicitly, or detach and poll.
- For long-running jobs, launch detached and poll the job id instead of blocking.

## 6. eval vs bash

- **eval**: stateful computation, transforms, anything needing intermediate variables across steps.
- **bash tool**: build/test/log/one-shot commands; keep output small with `cut -c1-N` or targeted pipelines.

Rule of thumb: if the next step needs the result as a variable → eval. If it's "run command, see output" → bash.

## 7. Timeouts & background jobs

## DO / DON'T

- DO reuse imports and top-level names across cells; work incrementally (import → define → test → use).
- DO use `parallel(thunks)`/`pipeline(items, ...stages)` instead of sequential calls, and poll background jobs by id.
- DON'T call `asyncio.run()` at Python top level (raises) — use bare `await`.
- DON'T reset the kernel for ordinary errors: fix and re-run ONLY the failing step; reset only after a real crash.
