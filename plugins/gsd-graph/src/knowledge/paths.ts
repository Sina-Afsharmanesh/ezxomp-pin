/**
 * .gsd/ path resolution — port of gsd-pi packages/mcp-server readers/paths.ts
 * (resolveGsdRoot + graph file paths), without the MCP-server caches.
 *
 * Resolution order: <projectDir>/.gsd → nearest ancestor .gsd/ → <projectDir>/.gsd
 * fallback (even if missing — for init). The git-repo-root probe of upstream is
 * omitted: plugins run inside the project cwd where the direct/ancestor walk
 * already covers the repo-root layout, and spawning `git rev-parse` per read
 * adds no value in-process.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function resolveGsdRoot(projectDir: string): string {
  const resolved = resolve(projectDir);

  const direct = join(resolved, '.gsd');
  if (existsSync(direct) && statSync(direct).isDirectory()) {
    return direct;
  }

  let dir = resolved;
  while (dir !== dirname(dir)) {
    const candidate = join(dir, '.gsd');
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
    dir = dirname(dir);
  }

  return direct;
}

/**
 * Path helpers over a gsd root. Exported as one object so callers share the
 * exact on-disk layout: <gsdRoot>/graphs/{graph.json, graph.tmp.json, .last-build-snapshot.json}.
 */
export const gsdPaths = {
  graphsDir: (gsdRoot: string): string => join(gsdRoot, 'graphs'),
  graphJsonPath: (gsdRoot: string): string => join(gsdRoot, 'graphs', 'graph.json'),
  graphTmpPath: (gsdRoot: string): string => join(gsdRoot, 'graphs', 'graph.tmp.json'),
  snapshotPath: (gsdRoot: string): string => join(gsdRoot, 'graphs', '.last-build-snapshot.json'),
};
