---
name: gsd-browser
description: ezxomp GSD browser-tool surface — page fetch, Brave web search, DOM snapshot, navigation, and screenshots with GSD's honest-degradation reason codes. Use when explaining or debugging gsd_browser_* tools, the degradation reason vocabulary, Brave key precedence, or the capture .gitignore gate.
---
# gsd-browser (ezxomp)

Feature-frozen port of the @opengsd/gsd-core browser-tool surface.

| Job | How it shows up |
|-----|-----------------|
| tools | `gsd_browser_search/fetch/snapshot/navigate/screenshot/status` — six tools, one `/gsd-browser` command |
| degradation | honest-degradation reason codes (`no_browser_backend`, `browser_unreachable`, `fetch_failed`, `missing_param`, `invalid_params`) instead of silent failure |
| settings | `pi.settings`-driven backend config (backend/browserExecutablePath/browserProfileDir/headless), CDP client with transport-loss rejection |
| search | Brave API client: status-gated parse (error bodies never JSON-parsed), 429/5xx-only retry with retry-after, no-key = availability signal not error |

## How to use

- Tools register via `registerGsdBrowserTools(pi)`; approval classes are `read` (status) / `exec` (navigate+screenshot).
- Optional tool args are `Type.Optional` — partial arg objects are valid.
- Tests: `bun test` from `plugins/gsd-browser` (vitest; 49 pass / 3 skip).

### DO

- DO keep the reason vocabulary in sync with AGENTS.md when touching failure paths.
- DON'T retry on HTTP error statuses or parse error bodies as JSON.
