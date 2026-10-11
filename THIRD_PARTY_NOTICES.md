# Third-party notices

## Vendored Pix helpers

The following small helpers are vendored into `plugins/agent-learning/src/`
to avoid runtime dependencies on the corresponding `@xynogen/pix-*` packages:

- `@xynogen/pix-data`
- `@xynogen/pix-gate`
- `@xynogen/pix-pretty`
- `@xynogen/pix-runtime`

MIT License

Copyright (c) 2026 xynogen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Bundled runtime dependencies (plannotator marketplace bundle)

`plugins/plannotator/index.bundle.js` inlines third-party JavaScript that is
redistributed as part of the plannotator marketplace bundle. OMP's
marketplace install does not run `npm install`; the bundle ships every
runtime npm dependency inline so a remote clone already contains a working
extension. The runtime surface is `index.bundle.js` plus the two HTML assets
(`plannotator.html`, `review-editor.html`); the `./generated/*.ts` sources
ship alongside so downstream consumers can rebuild the bundle and so upstream
provenance is preserved. The following 38 packages are bundled:

## Bundled runtime dependency (codesight package bundle)

`plugins/codesight/codesight.bundle.js` inlines third-party JavaScript from
`codesight@1.19.0`; the package's MIT license text is available at
`plugins/codesight/THIRD_PARTY_NOTICES.md`, and that file is included in the
`plugins/codesight` package manifest (`package.json#files`).



### Notes

- All bundled packages use permissive licenses (MIT, BSD-2-Clause,
  BSD-3-Clause, Apache-2.0). No copyleft.
- The exact bundled runtime is enumerated by reading the package paths in
  the bundle file:
  `grep -E '^\s*//\s+\.?\./?\.?\./?node_modules/\.bun/' plugins/plannotator/index.bundle.js`
- The interactive agent-terminal backend cannot be started from the
  bundled marketplace: the build's Bun resolver plugin
  (`scripts/build-bundle.mjs`) replaces the `@plannotator/webtui/server`
  subpath with `plugins/plannotator/scripts/optional-stubs/webtui-server.mjs`,
  so transitive imports of `node-pty` (and `ws`) are never reachable from
  the bundle. Plan review, code review, and Markdown annotation are
  unaffected.
- `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui`, `@oh-my-pi/pi-utils`,
  `@anthropic-ai/claude-agent-sdk`, `@opencode-ai/sdk`, and
  `omp-legacy-pi-modules` are external runtime deps (not bundled); each
  ships with its own LICENSE.

## @opengsd/gsd-core (browser-tool surface port)

- Upstream: https://github.com/open-gsd/gsd-core
- Upstream license: MIT (Copyright (c) GSD-core contributors — full text:
  https://github.com/open-gsd/gsd-core/blob/main/LICENSE)
- Used by: plugins/gsd-browser
- Scope of port: feature-frozen port of the browser-tool surface only
  (Brave web-search client semantics, injection-scanner patterns and rule
  IDs, viewport presets, degradation reason vocabulary) into
  `plugins/gsd-browser`, relicensed Apache-2.0 with this attribution.
