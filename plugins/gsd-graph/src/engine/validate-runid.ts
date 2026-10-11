/**
 * validate-runid.ts — Guard for raw runId strings on the tool surface.
 *
 * Our tool accepts raw runId strings ("<workflow>/<timestamp>") where
 * upstream had parseUnitId. A malicious runId could traverse out of
 * .gsd/workflow-runs — this guard closes that: exactly 2 segments,
 * charset [A-Za-z0-9._-]+ per segment, no `..`, and the resolved runDir
 * must stay under <projectDir>/.gsd/workflow-runs.
 */

import { isAbsolute, join, resolve, sep } from 'node:path';

const RUN_ID_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface ValidatedRunId {
  workflow: string;
  timestamp: string;
  runDir: string;
}

/**
 * Validate and resolve a runId. Returns the run directory or throws with a
 * user-readable message.
 *
 * @param runId — raw "<workflow>/<timestamp>" string from tool/command input
 * @param projectDir — project root containing .gsd/workflow-runs
 * @throws Error if the runId is malformed or escapes the runs root
 */
export function validateRunId(runId: string, projectDir: string): ValidatedRunId {
  if (!runId || typeof runId !== 'string') {
    throw new Error('runId is required (expected "<workflow>/<timestamp>")');
  }
  if (isAbsolute(runId)) {
    throw new Error(`Invalid runId "${runId}": absolute paths are not allowed`);
  }

  const segments = runId.split('/');
  if (segments.length !== 2) {
    throw new Error(
      `Invalid runId "${runId}": expected exactly 2 path segments ("<workflow>/<timestamp>")`,
    );
  }

  const [workflow, timestamp] = segments;
  for (const segment of segments) {
    if (!RUN_ID_SEGMENT_PATTERN.test(segment)) {
      throw new Error(
        `Invalid runId "${runId}": segment "${segment}" contains characters outside [A-Za-z0-9._-]`,
      );
    }
    if (segment.includes('..')) {
      throw new Error(`Invalid runId "${runId}": segment "${segment}" contains disallowed '..'`);
    }
  }

  const runsRoot = resolve(join(projectDir, '.gsd', 'workflow-runs'));
  const runDir = resolve(runsRoot, join(workflow, timestamp));

  if (runDir !== runsRoot && !runDir.startsWith(runsRoot + sep)) {
    throw new Error(`Invalid runId "${runId}": resolved path escapes .gsd/workflow-runs`);
  }

  return { workflow, timestamp, runDir };
}
