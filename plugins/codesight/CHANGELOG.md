# Changelog

All notable changes to this project will be documented in this file.

## 0.2.2-ezxomp.0 - 2026-09-07

- `showStartupModal` now defaults to **false** — sessions with missing/stale artifacts no longer auto-launch the overlay TUI. Enable it in `/codesight` settings if you want the startup modal back.
## 0.2.1-ezxomp.2 - 2026-08-27

- Fix watch-mode watcher crash flap: upstream `codesight@1.19.0` watch mode attaches no `error` handler to its recursive `fs.watch` watcher, so `ENOSPC` (inotify limit exhaustion — common on tmpfs or watch-heavy desktops) crashes the process on the first file change. `build-bundle.mjs` now patches the bundle to log a warning and keep watching instead. The OMP plugin's retry loop previously turned each crash into a watching/error footer flap.

## 0.1.1 - 2026-04-17

- Improve README with clearer tool input/output schemas.
- Document available slash commands.
- Add links to upstream CodeSight repository for new users.
## 0.1.0 - 2026-04-17

- Initial public release of pi-codesight extension.
