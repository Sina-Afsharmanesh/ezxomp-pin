import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Tracked git artifact produced by `scripts/build-bundle.mjs`. */
const BUNDLED_CLI_PATH = resolve(PLUGIN_ROOT, 'codesight.bundle.js');

export interface CodesightInvocation {
  executable: string;
  args: string[];
}

export function projectRoot(directory = '.') {
  return resolve(process.cwd(), directory);
}

export function codesightArtifactsRoot() {
  return '.codesight';
}

export function artifactPath(root: string, ...parts: string[]) {
  return join(root, codesightArtifactsRoot(), ...parts);
}

export function readTextIfExists(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function quoteShellArg(value: string) {
  if (!value) return "''";
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `\\'`)}'`;
}

/** Resolve the git-tracked, locally-bundled CodeSight CLI. */
export function resolveCodesightBin(): string {
  if (existsSync(BUNDLED_CLI_PATH)) return BUNDLED_CLI_PATH;
  throw new Error(
    `CodeSight CLI bundle is missing at ${BUNDLED_CLI_PATH}. ` +
      'Run `bun run scripts/build-bundle.mjs` (requires codesight@1.19.0 on disk).',
  );
}

export function resolveCodesightInvocation(args: string[]): CodesightInvocation {
  return {
    executable: resolveCodesightBin(),
    args,
  };
}

export function formatCodesightInvocation(invocation: CodesightInvocation) {
  return [invocation.executable, ...invocation.args].map(quoteShellArg).join(' ');
}

export function renderCodesightCommand(args: string[]) {
  try {
    return formatCodesightInvocation(resolveCodesightInvocation(args));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export interface CodesightRunResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  ok: boolean;
  error?: string;
}

export function isInsideRoot(root: string, candidate: string) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':'));
}

export function resolveProjectPath(root: string, inputPath: string) {
  const resolved = resolve(root, inputPath);
  return isInsideRoot(root, resolved) ? resolved : null;
}

export async function runCodesight(
  args: string[],
  cwd = process.cwd(),
): Promise<CodesightRunResult> {
  let invocation: CodesightInvocation;
  try {
    invocation = resolveCodesightInvocation(args);
  } catch (error) {
    return {
      command: renderCodesightCommand(args),
      cwd,
      exitCode: -1,
      stdout: '',
      stderr: '',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const command = formatCodesightInvocation(invocation);
  const { promise, resolve: resolvePromise } = Promise.withResolvers<CodesightRunResult>();
  const child = spawn(invocation.executable, invocation.args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (result: CodesightRunResult) => {
    if (settled) return;
    settled = true;
    resolvePromise(result);
  };

  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    finish({
      command,
      cwd,
      exitCode: -1,
      stdout,
      stderr,
      ok: false,
      error: error.message,
    });
  });

  child.on('close', (exitCode) => {
    finish({
      command,
      cwd,
      exitCode: exitCode ?? -1,
      stdout,
      stderr,
      ok: exitCode === 0,
    });
  });

  return promise;
}

let runnerOverride: typeof runCodesight | undefined;

export function setCodesightRunnerForTest(fn: typeof runCodesight | undefined) {
  runnerOverride = fn;
}

export function getCodesightRunner() {
  return runnerOverride ?? runCodesight;
}
