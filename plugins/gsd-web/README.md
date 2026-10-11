# @ezxomp/gsd-web

OMP-native port of the GSD-Pi Web UI (`open-gsd/gsd-pi`, pinned in `UPSTREAM.json`).

Serves the full Next.js 16 dashboard — dashboard / power / chat / roadmap / files / activity / visualize views, onboarding wizard, command surface, shell + embedded-agent terminals, multi-project picker — from a committed standalone Node server spawned detached by the plugin. The web UI talks to the OMP agent through an `omp --mode rpc` bridge adapter.

## Usage

- `/gsd-web start [path]` — launch the web host for a project (random free port by default; token auth on unless `noAuth`)
- `/gsd-web stop [path|all]` — stop instance(s)
- `/gsd-web status [path]` — show running instances
- Tools: `gsd_web_start`, `gsd_web_stop`, `gsd_web_status`

## Settings

`host`, `port` (0 = random free port), `noAuth`, `allowUnauthenticatedLAN`, `daemonMode`, `openBrowser` — see `package.json` `omp.settings`.

## Platforms

Linux and macOS only (upstream skips win32 too). Requires a Node binary at runtime (`nodeBinary` persisted setting or `node` on `PATH`).

## Status

W1 scaffold — launcher, registry, tools, and bridge land in W2–W8.
