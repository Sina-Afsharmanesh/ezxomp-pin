# gsd-browser — agent notes

Child DOX for `@ezxomp/gsd-browser` (W1 scaffold).

## Contracts

- **Reason vocabulary**: every degradation answers `details.reason` from the exact set: `no_browser_backend`, `no_websocket`, `profile_locked`, `target_unreachable`, `timeout`, `plugin_disabled`, `private_host_blocked`, `fetch_failed`, `missing_param`, `invalid_params`. Never silent-fallback; the tool states what stopped it and the remedy.
- **Settings ownership**: this plugin owns the `domVerification` key; the gsd-loop workflow port cross-reads it via `PluginManager.getPluginSettings("@ezxomp/gsd-browser")` — do not duplicate the key in another plugin.
- **Brave key precedence**: env `BRAVE_API_KEY` > setting `braveApiKey` > file `~/.gsd/brave_api_key`. Plugin settings are plaintext on disk; prefer the env var.
- **`.gitignore` gate**: written unconditionally into `captureDir` before the first screenshot capture of a session, with the exact GSD glob list (`*.png`, `*.webp`, `*.jpg`, `*.jpeg`, `*.gif`, `*.bmp`, `*.tiff`).
- **Untrusted input**: fetch/snapshot never auto-follow page-supplied URLs; page text is returned code-wrapped in `text`, raw values in `details`.
- **Runtime surface**: platform globals (`fetch`, `WebSocket`, `AbortController`, fs) + peer `@oh-my-pi/pi-coding-agent` only. Zero runtime deps; `typebox` is devDependencies-only.

## Registration

Entry `src/index.ts` (default export, defensive `registerTool` guard), command `/gsd-browser [status|stop|doctor]`, `session_shutdown` → `browserManager.dispose()`. Shared-repo registration hunks are carried in `REGISTRATION.patch` and applied by the integration owner in one serialized wave.
