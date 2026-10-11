# @ezxomp/gsd-browser

GSD browser-tool surface for OMP: page fetch, Brave web search, DOM snapshot, navigation, and screenshots — ported feature-frozen from [`@opengsd/gsd-core`](https://github.com/open-gsd/gsd-core) v1.12.0 (MIT) with GSD's honest-degradation reason codes preserved.

## Overview

This plugin provides a complete browser tool suite for OMP, implementing the same browser capabilities as GSD-core but using OMP's native tool model and plugin architecture. It includes six core tools:

| Tool | Approval | Semantics |
|---|---|---|
| `gsd_browser_search` | read | Brave web search; exact upstream payload, silent `{available:false}` without a key |
| `gsd_browser_fetch` | read | HTTP GET → extracted readable text, byte-capped with truncation marker, injection-scan advisory |
| `gsd_browser_snapshot` | read | Structural DOM observation of a managed page (data, never verdicts) |
| `gsd_browser_navigate` | exec | Drive the managed headless browser; returns final URL, title, HTTP status |
| `gsd_browser_screenshot` | exec | Viewport PNG (`desktop`/`mobile`/`tablet`/custom) into `captureDir`; `.gitignore` gate written first |
| `gsd_browser_status` | read | Resolved settings + backend/search availability + reason codes and remedies |

## Installation

Install the plugin using OMP's plugin management system:

```bash
omp plugin install @ezxomp/gsd-browser
```

## Configuration

### Plugin Settings

Plugin settings are configured through `package.json#omp.settings` and can be overridden by environment variables:

| Setting | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `true` | Kill switch for the entire plugin |
| `backend` | enum(`["auto","none"]`) | `"auto"` | `"none"` disables backend probing (CDP tools degrade with reason `no_browser_backend`) |
| `domVerification` | boolean | `false` | When true, enables DOM verification features (owned by gsd-loop) |
| `braveApiKey` | string | `""` | Brave Search API key. Precedence: `BRAVE_API_KEY` env > setting > `~/.gsd/brave_api_key` file |
| `searchTimeoutMs` | number | `10000` | Per-attempt Brave search timeout. Can be overridden by `GSD_WEBSEARCH_TIMEOUT_MS` env |
| `fetchTimeoutMs` | number | `10000` | HTTP fetch timeout |
| `maxFetchBytes` | number | `67108864` | Byte cap for `gsd_browser_fetch`. Truncation marker appended: `[truncated at N bytes]` |
| `injectionBlocking` | boolean | `false` | HIGH injection findings block with `isError` only when true; advisory always in `details.injection` |
| `allowPrivateHosts` | boolean | `true` | Set `false` to reject loopback/RFC1918/link-local hosts with reason `private_host_blocked` |
| `viewportWidth` | number | `1440` | Default desktop viewport width |
| `viewportHeight` | number | `900` | Default desktop viewport height |
| `maxDomChars` | number | `20000` | Bound on each outerHTML excerpt in snapshot tool |
| `captureDir` | string | `".gsd-browser/captures"` | Directory for screenshot captures. `.gitignore` gate written unconditionally |
| `browserProfileDir` | string | `""` | Persistent browser profile dir. Empty = fresh temp profile per launch (GSD `--isolated` equivalent) |
| `browserExecutablePath` | string | `""` | Browser binary override. Discovery order: setting > `GSD_BROWSER_EXECUTABLE` env > PATH scan > well-known paths |
| `headless` | boolean | `true` | Whether to spawn browser in headless mode |

### Environment Variables

- `BRAVE_API_KEY`: Direct Brave Search API key (overrides file and setting)
- `GSD_WEBSEARCH_TIMEOUT_MS`: Search timeout override (positive integer)
- `GSD_BROWSER_EXECUTABLE`: Browser binary path override

### File Fallback

If `braveApiKey` is not set via env or plugin settings, the plugin looks for `~/.gsd/brave_api_key` (trimmed, empty → unset).

## Tool Reference

### `gsd_browser_search`

**Approval:** read

**Description:** Brave web search with exact semantics from GSD-core's `cmdWebsearch`. Returns structured results or silent unavailable when no API key is configured.

**Parameters:**
- `query` (string, required): Search query
- `limit` (number, optional): Maximum results (default: 10)
- `freshness` (enum(`["day","week","month"]`, optional): Time constraint

**Result Structure:**
```json
{
  "available": true,
  "query": "search query",
  "count": 10,
  "results": [
    {
      "title": "Result title",
      "url": "https://example.com",
      "description": "Result description",
      "age": "1h ago"
    }
  ],
  "details": {
    "injection": { "level": "none", "ruleIds": [] }
  }
}
```

**Degradation:** When no API key, returns `{available:false, reason:"BRAVE_API_KEY not set"}` (silent degradation).

### `gsd_browser_fetch`

**Approval:** read

**Description:** HTTP GET with policy enforcement, byte capping, and content extraction. Never auto-follows page-supplied URLs; page text returned in fenced/code-wrapped evidence blocks.

**Parameters:**
- `url` (string, required): Target URL (http/https only)
- `raw` (boolean, optional): Skip HTML → text extraction if true
- `maxBytes` (number, optional): Override per-request byte cap
- `timeoutMs` (number, optional): Override fetch timeout

**Policies Applied:**
- Protocol: Only `http:` and `https:` allowed
- Private hosts: Reject `localhost`, `127.0.0.1`, RFC1918 ranges, etc. when `allowPrivateHosts=false`
- Redirects: Cap at 5 hops
- Byte cap: `maxFetchBytes` with truncation marker

**Injection Scanning:**
- Always includes `details.injection` with level (`none`/`low`/`high`) and matched rule IDs
- HIGH severity findings block with `isError:true` only when `injectionBlocking=true`

**Degradation Reasons:**
- `private_host_blocked`: Private host rejected
- `fetch_failed`: General fetch error

### `gsd_browser_snapshot`

**Approval:** read

**Description:** Structural DOM observation of a managed page. Returns page metadata and optional selector matches without verdicts.

**Parameters:**
- `selector` (string, optional): CSS selector for targeted extraction
- `maxDomChars` (number, optional): Bound per outerHTML excerpt

**Result Structure:**
```json
{
  "content": ["{...}"],
  "details": {
    "url": "https://example.com",
    "title": "Page title",
    "text": "Extracted page text (code-wrapped in content)",
    "matches": [
      {
        "selector": ".selector",
        "html": "<div>...</div>"
      }
    ]
  }
}
```

**Untrusted-Input Contract:**
- Never auto-follows page-supplied URLs
- Page text returned inside fenced/code-wrapped evidence blocks in `content`
- `details` contains raw values

**Degradation Reasons:**
- `no_browser_backend`: No Chrome binary found
- `profile_locked`: Browser profile locked
- `target_unreachable`: Page unreachable
- `timeout`: Operation timed out

### `gsd_browser_navigate`

**Approval:** exec

**Description:** Drive the managed headless browser to a URL and wait for load. Returns final URL, title, and HTTP status.

**Parameters:**
- `url` (string, required): Target URL to navigate to
- `timeoutMs` (number, optional): Navigation timeout (default: fetch timeout)

**Result Structure:**
```json
{
  "content": ["{...}"],
  "details": {
    "finalUrl": "https://example.com/final",
    "title": "Final page title",
    "httpStatus": 200
  }
}
```

**Degradation Reasons:**
- `no_browser_backend`: No browser engine available
- `profile_locked`: Profile lock conflict
- `target_unreachable`: Navigation failed
- `timeout`: Navigation timed out

### `gsd_browser_screenshot`

**Approval:** exec

**Description:** Capture viewport PNG of a URL or current page. Writes `.gitignore` gate before first capture.

**Parameters:**
- `url` (string, optional): URL to navigate before capture
- `viewport` (enum(`["desktop","mobile","tablet","custom"]`, default: `"desktop"`): Preset viewport
- `width` (number, optional): Custom viewport width (requires `viewport="custom"`)
- `height` (number, optional): Custom viewport height (requires `viewport="custom"`)
- `path` (string, optional): Custom filename (default: timestamped in `captureDir`)

**Viewport Presets:**
- `desktop`: 1440×900
- `mobile`: 375×812
- `tablet`: 768×1024

**.gitignore Gate:**
The plugin unconditionally writes `.gitignore` in `captureDir` on first screenshot capture:

```
# Screenshot files — never commit binary assets
*.png
*.webp
*.jpg
*.jpeg
*.gif
*.bmp
*.tiff
```

**Degradation Reasons:**
- `no_browser_backend`: No browser available
- `no_websocket`: WebSocket not supported
- `profile_locked`: Profile lock issue
- `target_unreachable`: URL unreachable
- `timeout`: Operation timed out

### `gsd_browser_status`

**Approval:** read

**Description:** Detailed status report including resolved settings, backend/search availability, and degradation reasons with remedies.

**Result Structure:**
```json
{
  "content": ["{...}"],
  "details": {
    "enabled": true,
    "backend": "auto",
    "domVerification": false,
    "braveApiKeySet": true,
    "searchAvailable": true,
    "backendAvailable": true,
    "reason": null
  }
}
```

**Text Output Example:**
```
GSD Browser Settings:
- Enabled: true
- Backend: auto
- DOM Verification: false
- Brave API Key Set: true
- Browser Executable: /usr/bin/chromium
- Capture Dir: .gsd-browser/captures
- Viewport: 1440×900
```

## OMP Commands

### `/gsd-browser` (Status)

Display plugin status, resolved settings, and availability:

```bash
/gsd-browser
```

**Output Includes:**
- All resolved settings values
- Search availability (key presence)
- Backend availability and executable path
- Degradation reasons and remedies

### `/gsd-browser stop` (Stop)

Stop the managed browser and clean up resources:

```bash
/gsd-browser stop
```

**Effects:**
- Terminates browser process
- Removes lock file
- Deletes temporary profile directory
- Confirms cleanup via notification

### `/gsd-browser doctor` (Diagnostics)

Enhanced status with troubleshooting information:

```bash
/gsd-browser doctor
```

**Additional Features:**
- Brave API key resolution trail (env → setting → file)
- Detailed degradation reason explanations
- All remedies and recovery steps
- Path discovery trail for browser executable

## Degradation Reason Vocabulary

| Reason | When Triggered | Remedy |
|---|---|---|
| `no_browser_backend` | No Chrome-family binary found | Set `browserExecutablePath` or `GSD_BROWSER_EXECUTABLE` env |
| `no_websocket` | Platform doesn't support WebSocket | Use environment with WebSocket support |
| `profile_locked` | Browser profile directory locked | Use empty `browserProfileDir` for temp profiles |
| `target_unreachable` | URL unreachable or navigation failed | Verify URL format and network connectivity |
| `timeout` | Operation exceeded timeout | Increase timeout settings or check system resources |
| `plugin_disabled` | Plugin `enabled=false` | Set `enabled: true` in settings |
| `private_host_blocked` | Private host requested with `allowPrivateHosts=false` | Set `allowPrivateHosts: true` or use different host |

## Examples

### Basic Search

```json
{
  "tool": "gsd_browser_search",
  "parameters": {
    "query": "TypeScript best practices",
    "limit": 5
  }
}
```

### Fetch with Truncation

```json
{
  "tool": "gsd_browser_fetch",
  "parameters": {
    "url": "https://example.com/large-document",
    "maxBytes": 10000
  }
}
```

### Navigate and Snapshot

```json
{
  "tool": "gsd_browser_navigate",
  "parameters": {
    "url": "https://example.com/page"
  }
}
```

```json
{
  "tool": "gsd_browser_snapshot",
  "parameters": {
    "selector": ".content",
    "maxDomChars": 5000
  }
}
```

### Screenshot with Custom Viewport

```json
{
  "tool": "gsd_browser_screenshot",
  "parameters": {
    "url": "https://example.com/page",
    "viewport": "custom",
    "width": 800,
    "height": 600
  }
}
```

## Migration from GSD

This plugin maintains feature-frozen compatibility with GSD-core v1.12.0 while adapting to OMP's architecture:

**Preserved Behaviors:**
- Brave search semantics (exact parameters, retry logic)
- HTTP fetch policies (byte cap, redirect handling, private host blocking)
- Injection scanning (4 summarisation + 4 markdown-link patterns)
- CDP backend (Chrome headless with DevTools, honest degradation)
- Viewport presets (desktop/mobile/tablet)
- Degradation reason vocabulary

**OMP-Specific Adaptations:**
- Tool envelope: `{content:[{type:"text",text}], isError?, details}`
- Settings management: `PluginManager.getPluginSettings()` with typed defaults
- Plugin lifecycle: Managed via OMP extensions, session_shutdown cleanup
- Command surface: `/gsd-browser` family (status/stop/doctor)

## Troubleshooting

### Common Issues

**1. No browser binary found**
- Check `browserExecutablePath` setting or `GSD_BROWSER_EXECUTABLE` env
- Verify Chrome/Chromium is installed on the system
- Run `/gsd-browser doctor` for detailed discovery trail

**2. Private host blocked**
- Set `allowPrivateHosts: true` in plugin settings
- Or use dev server URLs like `http://localhost:3000`

**3. Injection blocking**
- Set `injectionBlocking: true` if you want HIGH severity findings to block
- Default is advisory-only (prevents disruption)

**4. Timeouts**
- Increase `searchTimeoutMs` and `fetchTimeoutMs` settings
- Check system resources and network connectivity

### Debugging Commands

```bash
# Check plugin status
/gsd-browser

# Detailed diagnostics
/gsd-browser doctor

# Stop browser if stuck
/gsd-browser stop

# Check logs (if OMP provides logging)
# Look for gsd-browser entries in OMP logs
```

## Testing

Run plugin tests with:

```bash
cd plugins/gsd-browser
bun test
```

Tests cover:
- Settings normalization and validation
- HTTP fetch policies and error handling
- Injection scanning (all rule IDs)
- Brave search (mocked HTTP)
- CDP client/manager (fake transport)
- Browser tools (navigate/snapshot/screenshot)
- Plugin registration (smoke tests)

## License

Apache-2.0. Ported logic is attributed per `THIRD_PARTY_NOTICES.md` (upstream MIT from GSD-core v1.12.0).

## Attribution

Ported from `@opengsd/gsd-core` v1.12.0 (MIT). Feature-frozen port of the browser-tool surface only:

- Browser capabilities 1-6 (search, fetch, snapshot, navigate, screenshot, status)
- Honest degradation reason vocabulary preserved
- Viewport presets and `.gitignore` gate ported
- Brave client semantics (exact retry logic, error payloads)
- Injection scanner patterns (8 total: 4 summarisation + 4 markdown-link)

**Modifications:**
- OMP tool envelope adaptation
- Plugin settings system integration
- OMP command surface (`/gsd-browser` family)
- TypeScript typing and test coverage
