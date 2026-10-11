---
id: decision-4
title: 'Clean cutover from ultra-compact to compact-eng [TASK-56]'
date: '2026-08-30 01:34'
status: accepted
---
## Context

TASK-56 rearchitects the existing `plugins/ultra-compact/` fork into Compact Engineering. The operator selected the compact-eng identity, and `doc-18` fixes the post-cutover architecture and file map under `plugins/compact-eng/`. The current identity is `@ezxomp/ultra-compact@1.2.1-ezxomp.0`, marketplace slug `ultra-compact`, command `/ultracompact`, and skill `skills/ultra-compact/SKILL.md`.

This repository requires a clean cutover: every caller is migrated in one integrated change, with no shim, alias, re-export, deprecated path, or parallel package identity. Marketplace installation is also an identity boundary: a user install is a symlink from `~/.omp/plugins/node_modules/@ezxomp/<name>` to a versioned cache tree, and updating the marketplace registry does not remove an already-installed old identity. The final shipping state must be a marketplace install under the new identity, after direct-source and local-link verification.

This decision is linked to parent `TASK-56`; `doc-18` owns runtime architecture, while this ADR owns rename, install, cache, version, provenance, rollback, and identity validation mechanics.

## Decision

Perform one atomic clean cutover with these canonical identities:

| Surface | Selected identity |
|---|---|
| Plugin slug and directory | `compact-eng`; `plugins/compact-eng/` |
| Package | `@ezxomp/compact-eng` |
| Marketplace target | `compact-eng@ezxomp` |
| Operator command | `/compact-eng` |
| Skill | `skills/compact-eng/SKILL.md` (discovered as `skill:compact-eng`) |
| First renamed release | `2.0.0-ezxomp.0` |

`/ultracompact` is removed. It is not retained as an alias. The old directory, package name, marketplace slug, skill name, engine exports, and other deprecated identity paths are removed in the same change.

### Version policy

Start `@ezxomp/compact-eng` at `2.0.0-ezxomp.0`. Although the npm/package identity is new, this is the continuing ezxomp fork lineage of `pi-ultra-compact@1.2.1`; a major version communicates the simultaneous breaking command/package/path cutover and the substantial runtime rearchitecture fixed by `doc-18`. Starting at `1.3.0-ezxomp.0` is rejected because it would describe the removal of the old command/package/API and replacement of the old engine as a compatible minor change. Package version, marketplace version, `scripts/import-upstreams.ts` fork-version map, manifest expectations, lockfile workspace record, and `UPSTREAM.json.localForkVersion` must all be byte-identical at `2.0.0-ezxomp.0`.

### Provenance policy

Preserve the immutable fork origin rather than presenting compact-eng as source-independent:

- `UPSTREAM.json` continues to identify `pi-ultra-compact`, its `1.2.1` tarball URL, version, and integrity. Its current-tree `importedPaths` is regenerated for the renamed layout and its `localForkVersion` becomes `2.0.0-ezxomp.0`.
- The package author/README/plugin CHANGELOG and marketplace attribution state that Compact Engineering originated as the Vendex `pi-ultra-compact` fork and was renamed and substantially rearchitected by ezxomp around OMP-native composition.
- The package repository field describes the maintained ezxomp package location; `UPSTREAM.json` remains the authoritative locked upstream source record.
- Historical plugin CHANGELOG entries keep their historical names and commands. A new top entry explains the clean cutover; history is not rewritten to imply that old releases used compact-eng.

## Consequences

The TASK-56.7 implementation must land the following as one atomic identity/runtime change:

1. Move `plugins/ultra-compact/` to `plugins/compact-eng/`; remove obsolete `engine.ts`, `UltraCompactEngine`, old types, and old identity paths as specified by `doc-18`. There is no forwarding directory.
2. Update the plugin `package.json`: name, version, description, keywords, maintained repository metadata, OMP extension/skill paths, and published file set. Preserve the exact OMP `18.0.6` peer-dependency policy and add no direct snapcompact dependency.
3. Replace the `.omp-plugin/marketplace.json` entry with name `compact-eng`, source `./plugins/compact-eng`, version `2.0.0-ezxomp.0`, a Compact Engineering/native-composition description, and attribution that preserves the `pi-ultra-compact` origin while naming the ezxomp rearchitecture. Do not add a second entry.
4. Replace the root `AGENTS.md` monorepo package identity. Update root `README.md` install examples and catalog row. Add a root `CHANGELOG.md` `[Unreleased]` entry describing the breaking clean cutover and required reinstall.
5. Rewrite plugin `AGENTS.md`, `README.md`, and the new top section of plugin `CHANGELOG.md` for the compact-eng contract. Update `UPSTREAM.json` under the provenance policy above. Rename the skill directory/file references to `skills/compact-eng/SKILL.md`, and remove stale `/ultracompact` guidance while retaining historical CHANGELOG text as history.
6. Migrate active registry/install/test callers: `scripts/import-upstreams.ts`, `scripts/install-local.ts`, `scripts/verify-omp.ts` (package, command, and `skill:compact-eng` expectations), `test/manifest.test.ts`, `test/smoke-plugins.test.ts`, and `test/compact-eng.test.ts`. Assertions must require the new package/command/skill and explicitly require the old command to be absent. The root `package.json` uses the generic `plugins/*` workspace and the `justfile` uses generic test recipes, so neither needs an identity edit unless implementation introduces a literal reference; their invoked manifest/smoke tests do need migration.
7. Regenerate `bun.lock` after the workspace move/name/version change. Its workspace key, package name, and `@ezxomp/compact-eng@workspace:plugins/compact-eng` resolution replace the old records; do not hand-maintain both identities.
8. Refresh generated CodeSight artifacts only after the integrated rename by running `/codesight-refresh` (or the equivalent `codesight_refresh` tool). The refresh must replace stale package/path/symbol references in `.codesight/CODESIGHT.md`, `.codesight/libs.md`, and `.codesight/wiki/**`; generated artifacts are not manually patched. Do not run the refresh while the rename is only an ADR.
9. Preserve the marketplace registry cardinality at 14 plugins: one entry is renamed, not added.

### Alias and installed-cache behavior

A `/ultracompact` compatibility alias is rejected. It would preserve a deprecated caller, violate the repository clean-cutover convention, create two documented command identities, and weaken the negative RED contract that requires `/ultracompact` to be absent. The same rejection applies to an `@ezxomp/ultra-compact` wrapper package, duplicate marketplace entry, old skill alias, forwarding directory, or re-exported `UltraCompactEngine`.

An existing marketplace installation does not rename itself. Its old `@ezxomp/ultra-compact` symlink and lock entry can continue loading the cached old package until explicitly removed, even after the refreshed marketplace registry advertises only compact-eng. Installing compact-eng before removing the old identity can load both packages and is forbidden. Old versioned cache directories may remain inert after uninstall; the authoritative checks are the installed symlink and plugin lock/installed records, not cache-directory absence. Do not delete cache content merely for tidiness.

Rename cutover sequence after the pushed registry contains compact-eng:

1. `omp plugin marketplace update ezxomp` and verify the cached marketplace commit/version.
2. `omp plugin uninstall ultra-compact@ezxomp`.
3. Verify that `~/.omp/plugins/node_modules/@ezxomp/ultra-compact` and the old lock/installed keys are absent. Because renamed identities have been observed to survive a successful uninstall report, remove only the stale old symlink and old keys if necessary, as documented by `skill://ezxomp-plugin-e2e-test`.
4. `omp plugin install compact-eng@ezxomp` (use `--force` only for a verified surviving link/cache-layout conflict).
5. Run `omp plugin doctor`, then verify a fresh session. Leave compact-eng marketplace-installed.

### Validation sequence

Apply `docs/omp-marketplace-update.md` and `skill://ezxomp-plugin-e2e-test` to the rename with both positive and negative identity checks:

1. **Repository and direct-source isolation:** after targeted contracts and `just verify` pass, launch a fresh OMP process with `omp --no-extensions -e /home/eag1/repo/ezxomp/plugins/compact-eng/extensions/index.ts`. Prove this exact source loads, the registered command is `/compact-eng`, `/compact-eng status` and the safe request path behave as specified by `doc-18`, `/ultracompact` is absent, the old package/path is not discovered, and startup logs contain no extension-load/module errors. This is source isolation, not an installed-layout substitute.
2. **Phase 1, local link:** remove the old installed identity first, link the working-tree `plugins/compact-eng`, run `omp plugin doctor` with zero warnings/errors, and use a fresh OMP agent with the mandatory fixed-format report. It must classify `@ezxomp/compact-eng` as LOCAL, find no `@ezxomp/ultra-compact` symlink/lock key, exercise `/compact-eng`, confirm `/ultracompact` is absent, confirm the compact-eng package/version/skill, and report zero startup load errors.
3. **Commit and push:** the coordinator (never a worker) records the jj change, advances `main`, and runs `jj git push --remote origin --bookmark main`; read-only remote inspection confirms the pushed main. Phase 2 never installs an unpushed working tree.
4. **Phase 2, marketplace shipping state:** update the ezxomp marketplace cache and verify it matches pushed main and contains `compact-eng@2.0.0-ezxomp.0` with no `ultra-compact` entry. Uninstall the old identity if still present, uninstall the local compact-eng link, install `compact-eng@ezxomp`, and run `omp plugin doctor` with zero warnings/errors. A second fresh OMP agent must classify compact-eng as MKT (cache target), find no old symlink/lock/registry identity, exercise `/compact-eng`, confirm `/ultracompact` is absent, verify package/version/skill, and report zero startup load errors. Leave this marketplace installation in place.

Each fresh-agent report is read-only, prints one fixed-prefix line per check and a final `verdict=OK|FAIL`, and is captured as evidence. A running coordinator session is never used because it retains its session-start plugin set.

### Rollback

Rollback is a forward jj revert, not a destructive checkout and not a Git mutation. If the cutover has not been pushed and is the latest repository operation with no intervening work, `jj undo` may undo that repository operation; do not use it after later shared operations. The auditable path for a committed or pushed cutover is:

```text
jj new main
jj revert -r <compact-eng-cutover-change-id>
jj describe -m "Revert compact-eng clean cutover to ultra-compact"
just verify
jj bookmark move main -t @
jj git push --remote origin --bookmark main
```

The coordinator performs that sequence and confirms pushed `main` by read-only remote inspection. Then refresh the marketplace, `omp plugin uninstall compact-eng@ezxomp`, verify its symlink/lock key is absent, `omp plugin install ultra-compact@ezxomp`, run doctor, and repeat the fresh marketplace-agent checks with the identities reversed: ultra-compact present and loading, compact-eng absent. Leave the restored marketplace install in place. If the cutover was never pushed or installed, stop after the jj revert and repository verification; do not mutate user-scope installs unnecessarily.

## Alternatives considered

- **Keep the ultra-compact identity and only add the new features:** rejected because the operator selected Compact Engineering as the plugin's focus and `doc-18` fixes the compact-eng public surface and post-rename layout.
- **Dual-publish ultra-compact and compact-eng:** rejected because it creates two active packages/marketplace entries, invites double registration, and violates the no-deprecated-path rule.
- **Rename package but retain `/ultracompact` as an alias:** rejected because command identity is part of the clean cutover and the fixed RED contract requires absence.
- **Use `1.3.0-ezxomp.0`:** rejected because the command, package, path, skill, engine API, and runtime architecture all break compatibility.
- **Reset the new package to `1.0.0`:** rejected because it hides continuity with the tracked `pi-ultra-compact@1.2.1` fork lineage and weakens provenance/version traceability.
- **Delete old cache directories as part of migration:** rejected; installed symlink/lock state and fresh-agent behavior are authoritative, while unused cache data is harmless and cache manipulation adds risk.
