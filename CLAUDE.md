# ezxomp — Project Context

**Stack:** raw-http | none | javascript
**Monorepo:** @ezxomp/agent-learning, @ezxomp/augment, @ezxomp/backlog, @ezxomp/better-custom, @ezxomp/code-nav, @ezxomp/codesight, @ezxomp/cook, @ezxomp/evo, @ezxomp/experiences, @ezxomp/extensible-workflows, @ezxomp/plannotator, @ezxomp/pstack-suite, @ezxomp/compact-eng

68 routes | 0 models | 55 env vars | 1538 import links

**API areas:** /v1, /api/ai, /uploads/, /api/plan, /api/share-html, /api/config, /api/image, /api/upload, /api/open-in, /api/draft

**High-impact files** (change carefully):
- plugins/cook/extensions/index.ts (imported by 46 files)
- plugins/pstack-suite/src/commands/benny.ts (imported by 39 files)
- plugins/pstack-suite/src/commands/ship.ts (imported by 37 files)
- plugins/experiences/extensions/agent-experience/src/storage/private-root.ts (imported by 35 files)
- plugins/pstack-suite/src/commands/deslop.ts (imported by 31 files)

**Required env vars:** AL_SRC, AX_BUILD_OUTFILE, AX_SELECTOR_MODE, AX_SELECTOR_MODEL_SOURCE_ROOT, AX_SRC, AX_STATE_ROOT, BROWSER, C, CHOKIDAR_INTERVAL, CHOKIDAR_USEPOLLING, CLAUDE_CONFIG_DIR, CODESIGHT_NATIVE_AST, CODESIGHT_PLUGIN_DIR, CODEX_HOME, DAGR_BIN, HERDR_PANE_ID, JINA_API_KEY, LEARNING_REVIEW, PI_CODING_AGENT_DIR, PI_TODO_PATH, PLANNOTATOR_AGENT_TERMINAL_REMOTE, PLANNOTATOR_AI, PLANNOTATOR_ANNOTATE_HISTORY, PLANNOTATOR_BROWSER, PLANNOTATOR_CURSOR_SANDBOX, PLANNOTATOR_DATA_DIR, PLANNOTATOR_DEBUG, PLANNOTATOR_GLIMPSE, PLANNOTATOR_GUIDE_HISTORY, PLANNOTATOR_JINA, PLANNOTATOR_PASTE_URL, PLANNOTATOR_PORT, PLANNOTATOR_REMOTE, PLANNOTATOR_SEM_PATH, PLANNOTATOR_SHARE, PLANNOTATOR_SHARE_URL, PLANNOTATOR_TODO_PROVIDER, RUN_SMOKE, SSH_CONNECTION, VSCODE_TEXTMATE_DEBUG, XDG_CACHE_HOME, XDG_CONFIG_HOME

---

## Instructions for Claude Code

### Two-Step Rule (mandatory)
**Step 1 — Orient:** Use wiki articles to find WHERE things live.
**Step 2 — Verify:** Read the actual source files listed in the wiki article BEFORE writing any code.

Wiki articles are structural summaries extracted by AST. They show routes, models, and file locations.
They do NOT show full function logic, middleware internals, or dynamic runtime behavior.
**Never write or modify code based solely on wiki content — always read source files first.**

Read in order at session start:
1. `.codesight/wiki/index.md` — orientation map (~200 tokens)
2. `.codesight/wiki/overview.md` — architecture overview (~500 tokens)
3. Domain article (e.g. `.codesight/wiki/auth.md`) → check "Source Files" section → read those files
4. `.codesight/CODESIGHT.md` — full context map for deep exploration

Routes marked `[inferred]` in wiki articles were detected via regex — verify against source before trusting.
If any source file shows ⚠ in the wiki, re-run `npx codesight --wiki` before proceeding.

Or use the codesight MCP server for on-demand queries:
   - `codesight_get_wiki_article` — read a specific wiki article by name
   - `codesight_get_wiki_index` — get the wiki index
   - `codesight_get_summary` — quick project overview
   - `codesight_get_routes --prefix /api/users` — filtered routes
   - `codesight_get_blast_radius --file src/lib/db.ts` — impact analysis before changes
   - `codesight_get_schema --model users` — specific model details

Only open specific files after consulting codesight context. This saves ~107,375 tokens per conversation.
