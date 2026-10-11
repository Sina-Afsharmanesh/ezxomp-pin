import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open, readFile, rename, unlink, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import {
  renderCodesightCommand,
  resolveCodesightInvocation,
  runCodesight,
  type CodesightRunResult,
} from './codesight.ts';
import { getArtifactStatus, type ArtifactStatus } from './stale.ts';
export const DEFAULT_CODESIGHT_SETTINGS: CodesightSettings = {
  watchFiles: true,
  regenerateWiki: true,
  showFooter: true,
  showStartupModal: false,
  notifyOnWatchError: true,
};

export type CodesightSettings = {
  watchFiles: boolean;
  regenerateWiki: boolean;
  showFooter: boolean;
  showStartupModal: boolean;
  notifyOnWatchError: boolean;
};

export type CodesightState =
  | 'disabled'
  | 'starting'
  | 'watching'
  | 'external'
  | 'refreshing'
  | 'stale'
  | 'missing'
  | 'error';

export type WatcherState = Extract<CodesightState, 'disabled' | 'starting' | 'watching' | 'external' | 'error' | 'refreshing'>;

export interface CodesightWatcherSnapshot {
  root: string;
  state: CodesightState;
  watcherState: WatcherState;
  artifactStatus: ArtifactStatus;
  lastRefresh: number | undefined;
  lastError: string | undefined;
  stdout: string;
  stderr: string;
}

interface WatchLock {
  ownerPid: number;
  childPid: number | null;
}

type ReadLockResult =
  | { kind: 'absent' }
  | { kind: 'valid'; value: WatchLock }
  | { kind: 'invalid'; message: string }
  | { kind: 'unreadable'; message: string };

export interface CodesightWatcherOptions {
  runner?: typeof runCodesight;
}

const LOCK_FILE = '.omp-watch.lock';
const MAX_OUTPUT = 64 * 1024;
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] as const;
const STATUS_KEY = 'ezxomp:codesight';

function processIsAlive(pid: number | null): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function normalizeCodesightSettings(settings: Partial<CodesightSettings> | undefined): CodesightSettings {
  const merged = { ...DEFAULT_CODESIGHT_SETTINGS, ...(settings ?? {}) };
  return {
    watchFiles: merged.watchFiles === true,
    regenerateWiki: merged.regenerateWiki === true,
    showFooter: merged.showFooter === true,
    showStartupModal: merged.showStartupModal === true,
    notifyOnWatchError: merged.notifyOnWatchError === true,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendTail(current: string, chunk: unknown): string {
  const next = current + String(chunk);
  return next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next;
}

export class CodesightWatcherController {
  readonly root: string;
  readonly lockPath: string;
  #ctx: ExtensionContext;
  #runner: typeof runCodesight;
  #settings: CodesightSettings = normalizeCodesightSettings(undefined);
  #watcherState: WatcherState = 'disabled';
  #child: ChildProcess | undefined;
  #childGeneration = 0;
  #lockOwned = false;
  #generation = 0;
  #retryTimer: unknown;
  #startupTimer: unknown;
  #stableTimer: unknown;
  #retryIndex = 0;
  #warningIssued = false;
  #disposed = false;
  #reconcilePromise: Promise<void> | undefined;
  #lastRefresh: number | undefined;
  #lastError: string | undefined;
  #stdout = '';
  #stderr = '';

  constructor(ctx: ExtensionContext, options: CodesightWatcherOptions = {}) {
    this.#ctx = ctx;
    this.root = ctx.cwd;
    this.lockPath = join(this.root, '.codesight', LOCK_FILE);
    this.#runner = options.runner ?? runCodesight;
  }

  get settings(): CodesightSettings {
    return { ...this.#settings };
  }

  get watcherState(): WatcherState {
    return this.#watcherState;
  }

  get state(): CodesightState {
    if (this.#watcherState === 'refreshing') return 'refreshing';
    if (this.#watcherState === 'error') return 'error';
    const artifacts = getArtifactStatus(this.root);
    if (artifacts.missing.length > 0) return 'missing';
    if (artifacts.stale) return 'stale';
    if (this.#watcherState === 'starting' || this.#watcherState === 'external' || this.#watcherState === 'watching') {
      return this.#watcherState;
    }
    return 'disabled';
  }

  get artifactStatus(): ArtifactStatus {
    return getArtifactStatus(this.root);
  }

  get snapshot(): CodesightWatcherSnapshot {
    return {
      root: this.root,
      state: this.state,
      watcherState: this.#watcherState,
      artifactStatus: this.artifactStatus,
      lastRefresh: this.#lastRefresh,
      lastError: this.#lastError,
      stdout: this.#stdout,
      stderr: this.#stderr,
    };
  }

  updateSettings(settings: Partial<CodesightSettings>): void {
    this.#settings = normalizeCodesightSettings({ ...this.#settings, ...settings });
    this.#updateFooter();
  }

  async run(args: string[]): Promise<CodesightRunResult> {
    return this.#runner(args, this.root);
  }

  async reconcile(settings?: Partial<CodesightSettings>): Promise<void> {
    if (settings) this.#settings = normalizeCodesightSettings(settings);
    if (this.#reconcilePromise) return this.#reconcilePromise;
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#reconcilePromise = promise;
    void this.#reconcileInternal()
      .catch((error) => {
        this.#lastError = formatError(error);
        this.#setWatcherState('error');
      })
      .finally(() => {
        this.#reconcilePromise = undefined;
        resolve();
      });
    return promise;
  }

  async refresh(): Promise<CodesightRunResult> {
    if (this.#watcherState === 'external') return this.#rejectedAction('refresh');
    const generation = ++this.#generation;
    this.#clearRetryTimer();
    this.#setWatcherState('refreshing');
    await this.#stopChild(generation);
    const result = await this.run(['--wiki']);
    if (result.ok) {
      this.#lastRefresh = Date.now();
      this.#lastError = undefined;
    } else {
      this.#lastError = result.error ?? (result.stderr || `CodeSight exited with status ${result.exitCode}`);
    }
    this.#watcherState = 'disabled';
    this.#updateFooter();
    await this.reconcile();
    return result;
  }

  async init(): Promise<CodesightRunResult> {
    if (this.#watcherState === 'external') return this.#rejectedAction('init');
    const generation = ++this.#generation;
    this.#clearRetryTimer();
    this.#setWatcherState('refreshing');
    await this.#stopChild(generation);

    let result = await this.run(['--wiki']);
    if (result.ok) result = await this.run(['--init']);
    if (result.ok) {
      this.#lastRefresh = Date.now();
      this.#lastError = undefined;
    } else {
      this.#lastError = result.error ?? (result.stderr || `CodeSight exited with status ${result.exitCode}`);
    }
    this.#watcherState = 'disabled';
    this.#updateFooter();
    await this.reconcile();
    return result;
  }

  async stop(): Promise<void> {
    ++this.#generation;
    this.#clearRetryTimer();
    this.#clearTimer('startup');
    this.#clearTimer('stable');
    await this.#stopChild(this.#generation);
    await this.#removeOwnedLock();
    this.#watcherState = 'disabled';
    this.#updateFooter();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    ++this.#generation;
    this.#clearRetryTimer();
    this.#clearTimer('startup');
    this.#clearTimer('stable');
    await this.#stopChild(this.#generation);
    await this.#removeOwnedLock();
    this.#child = undefined;
    this.#lockOwned = false;
    this.#watcherState = 'disabled';
    this.#ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  #setWatcherState(state: WatcherState): void {
    this.#watcherState = state;
    this.#updateFooter();
  }

  #updateFooter(): void {
    if (!this.#ctx.hasUI || !this.#settings.showFooter) {
      this.#ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const state = this.state;
    if (state === 'disabled') {
      this.#ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const label = {
      refreshing: 'refreshing',
      error: 'error',
      missing: 'missing',
      stale: 'stale',
      starting: 'starting',
      external: 'shared',
      watching: 'watching',
      disabled: '',
    }[state];
    this.#ctx.ui.setStatus(STATUS_KEY, label ? `CodeSight: ${label}` : undefined);
  }

  async #reconcileInternal(): Promise<void> {
    if (this.#disposed) return;
    if (!this.#ctx.hasUI || !this.#settings.watchFiles) {
      await this.stop();
      return;
    }
    if (this.#watcherState === 'refreshing') {
      this.#updateFooter();
      return;
    }
    if (this.#watcherState === 'external') {
      const lock = await this.#readLock();
      if (lock.kind === 'valid' && (processIsAlive(lock.value.ownerPid) || processIsAlive(lock.value.childPid))) {
        this.#updateFooter();
        return;
      }
      if (lock.kind === 'invalid' || lock.kind === 'unreadable') {
        this.#lastError = lock.message;
        this.#setWatcherState('error');
        return;
      }
      this.#watcherState = 'disabled';
    }
    if (this.#child) {
      if (this.#childGeneration === this.#generation && this.#settings.regenerateWiki !== this.#startedWithWiki) {
        await this.stop();
      } else {
        this.#updateFooter();
        return;
      }
    }
    if (this.#retryTimer) {
      this.#updateFooter();
      return;
    }
    await this.#acquireAndStart();
  }

  #startedWithWiki = DEFAULT_CODESIGHT_SETTINGS.regenerateWiki;

  async #acquireAndStart(): Promise<void> {
    const acquired = await this.#acquireLock();
    if (!acquired || this.#disposed) return;

    this.#startedWithWiki = this.#settings.regenerateWiki;
    const watchArgs = [...(this.#startedWithWiki ? ['--wiki'] : []), '--watch'];
    const generation = this.#generation;
    let invocation;
    try {
      invocation = resolveCodesightInvocation(watchArgs);
    } catch (error) {
      this.#lastError = formatError(error);
      this.#setWatcherState('error');
      await this.#removeOwnedLock();
      this.#scheduleRetry(generation);
      return;
    }
    this.#stdout = '';
    this.#stderr = '';
    this.#lastError = undefined;
    this.#setWatcherState('starting');

    let child: ChildProcess;
    try {
      child = spawn(invocation.executable, invocation.args, {
        cwd: this.root,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      this.#lastError = formatError(error);
      this.#setWatcherState('error');
      await this.#removeOwnedLock();
      this.#scheduleRetry(generation);
      return;
    }
    if (!child.pid || !(await this.#writeOwnedLock({ ownerPid: process.pid, childPid: child.pid }))) {
      child.kill('SIGTERM');
      this.#setWatcherState(this.#lockOwned ? 'error' : 'external');
      if (this.#lockOwned) await this.#removeOwnedLock();
      if (this.#watcherState === 'error') this.#scheduleRetry(generation);
      return;
    }

    this.#child = child;
    this.#childGeneration = generation;
    child.stdout?.on('data', (chunk) => {
      if (this.#child === child) this.#stdout = appendTail(this.#stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      if (this.#child === child) this.#stderr = appendTail(this.#stderr, chunk);
    });
    child.once('error', (error) => void this.#handleChildExit(child, generation, formatError(error)));
    child.once('close', (code, signal) => void this.#handleChildExit(child, generation, signal ? `watcher terminated by ${signal}` : `watcher exited with status ${code ?? -1}`));
    this.#startupTimer = this.#scheduleTimer(() => {
      if (this.#child === child && this.#childGeneration === generation && child.exitCode === null) {
        this.#setWatcherState('watching');
      }
    }, 500);
    this.#stableTimer = this.#scheduleTimer(() => {
      if (this.#child === child && this.#childGeneration === generation && child.exitCode === null) {
        this.#retryIndex = 0;
        this.#warningIssued = false;
      }
    }, 30_000);
  }

  async #handleChildExit(child: ChildProcess, generation: number, error: string | undefined): Promise<void> {
    if (this.#child !== child) return;
    this.#clearTimer('startup');
    this.#clearTimer('stable');
    this.#child = undefined;
    await this.#writeOwnedLock({ ownerPid: process.pid, childPid: null });

    if (generation !== this.#generation || this.#disposed) return;
    this.#lastError = error;
    this.#setWatcherState('error');
    if (this.#settings.notifyOnWatchError && !this.#warningIssued) {
      this.#warningIssued = true;
      this.#ctx.ui.notify(`CodeSight watcher failed: ${error ?? 'watcher exited'}`, 'warning');
    }
    this.#scheduleRetry(generation);
  }

  #scheduleRetry(generation: number): void {
    if (this.#disposed || this.#retryTimer || this.#watcherState !== 'error') return;
    const delay = RETRY_DELAYS[Math.min(this.#retryIndex, RETRY_DELAYS.length - 1)] ?? RETRY_DELAYS.at(-1)!;
    this.#retryIndex = Math.min(this.#retryIndex + 1, RETRY_DELAYS.length - 1);
    this.#retryTimer = this.#scheduleTimer(() => {
      this.#retryTimer = undefined;
      if (generation !== this.#generation || this.#disposed) return;
      void this.reconcile();
    }, delay);
  }

  async #acquireLock(): Promise<boolean> {
    const directory = dirname(this.lockPath);
    try {
      await mkdir(directory, { recursive: true });
    } catch (error) {
      this.#lastError = formatError(error);
      this.#setWatcherState('error');
      return false;
    }

    if (this.#lockOwned) {
      const current = await this.#readLock();
      if (current.kind === 'valid' && current.value.ownerPid === process.pid) return true;
      this.#lockOwned = false;
      if (current.kind === 'invalid' || current.kind === 'unreadable') {
        this.#lastError = current.message;
        this.#setWatcherState('error');
        return false;
      }
      if (current.kind === 'valid' && (processIsAlive(current.value.ownerPid) || processIsAlive(current.value.childPid))) {
        this.#setWatcherState('external');
        return false;
      }
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify({ ownerPid: process.pid, childPid: null }));
        } finally {
          await handle.close();
        }
        this.#lockOwned = true;
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          this.#lastError = formatError(error);
          this.#setWatcherState('error');
          return false;
        }

        const lock = await this.#readLock();
        if (lock.kind === 'invalid' || lock.kind === 'unreadable') {
          this.#lastError = lock.message;
          this.#setWatcherState('error');
          return false;
        }
        if (lock.kind !== 'valid') continue;
        if (processIsAlive(lock.value.ownerPid) || processIsAlive(lock.value.childPid)) {
          this.#lockOwned = false;
          this.#setWatcherState('external');
          return false;
        }
        if (attempt === 0) {
          try {
            await unlink(this.lockPath);
          } catch (unlinkError) {
            this.#lastError = formatError(unlinkError);
            this.#setWatcherState('error');
            return false;
          }
        }
      }
    }
    return false;
  }

  async #readLock(): Promise<ReadLockResult> {
    try {
      const stat = await lstat(this.lockPath);
      if (!stat.isFile()) return { kind: 'invalid', message: 'CodeSight watcher lock is not a regular file' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
      return { kind: 'unreadable', message: `Unable to read CodeSight watcher lock: ${formatError(error)}` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.lockPath, 'utf8'));
    } catch (error) {
      return { kind: 'invalid', message: `Invalid CodeSight watcher lock: ${formatError(error)}` };
    }
    if (!parsed || typeof parsed !== 'object') return { kind: 'invalid', message: 'Invalid CodeSight watcher lock: expected an object' };
    const value = parsed as Partial<WatchLock>;
    const ownerPid = value.ownerPid;
    const childPid = value.childPid;
    if (
      typeof ownerPid !== 'number' ||
      !Number.isInteger(ownerPid) ||
      ownerPid <= 0 ||
      (childPid !== null &&
        (typeof childPid !== 'number' || !Number.isInteger(childPid) || childPid <= 0))
    ) {
      return { kind: 'invalid', message: 'Invalid CodeSight watcher lock: ownerPid/childPid are malformed' };
    }
    return { kind: 'valid', value: { ownerPid, childPid: childPid ?? null } };
  }

  async #writeOwnedLock(value: WatchLock): Promise<boolean> {
    if (!this.#lockOwned) return false;
    const lock = await this.#readLock();
    if (lock.kind !== 'valid' || lock.value.ownerPid !== process.pid) {
      this.#lockOwned = false;
      if (lock.kind === 'invalid' || lock.kind === 'unreadable') {
        this.#lastError = lock.message;
        this.#setWatcherState('error');
      } else if (lock.kind === 'valid') {
        this.#setWatcherState('external');
      }
      return false;
    }

    const temporary = `${this.lockPath}.${process.pid}.${this.#generation}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(value));
      } finally {
        await handle.close();
      }
      const current = await this.#readLock();
      if (current.kind !== 'valid' || current.value.ownerPid !== process.pid) {
        await unlink(temporary).catch(() => undefined);
        this.#lockOwned = false;
        return false;
      }
      await rename(temporary, this.lockPath);
      return true;
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      this.#lastError = formatError(error);
      this.#setWatcherState('error');
      return false;
    }
  }

  async #removeOwnedLock(): Promise<void> {
    if (!this.#lockOwned) return;
    const lock = await this.#readLock();
    if (lock.kind === 'valid' && lock.value.ownerPid === process.pid) {
      await unlink(this.lockPath).catch(() => undefined);
    }
    this.#lockOwned = false;
  }

  async #stopChild(generation: number): Promise<void> {
    const child = this.#child;
    if (!child) return;
    this.#child = undefined;
    if (this.#childGeneration !== generation && generation !== this.#generation) return;

    const { promise, resolve } = Promise.withResolvers<void>();
    const onClose = () => resolve();
    child.once('close', onClose);
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const timer = this.#scheduleTimer(resolve, 2000);
      await promise;
      this.#clearExternalTimer(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    } catch {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }

  #scheduleTimer(callback: () => void, delay: number): unknown {
    if (typeof this.#ctx.setTimeout === 'function') return this.#ctx.setTimeout(callback, delay);
    return setTimeout(callback, delay);
  }

  #clearExternalTimer(timer: unknown): void {
    if (!timer) return;
    if (typeof this.#ctx.clearTimer === 'function') this.#ctx.clearTimer(timer as Timer);
    else clearTimeout(timer as ReturnType<typeof setTimeout>);
  }

  #clearTimer(kind: 'retry' | 'startup' | 'stable'): void {
    const timer = kind === 'retry' ? this.#retryTimer : kind === 'startup' ? this.#startupTimer : this.#stableTimer;
    if (!timer) return;
    this.#clearExternalTimer(timer);
    if (kind === 'retry') this.#retryTimer = undefined;
    else if (kind === 'startup') this.#startupTimer = undefined;
    else this.#stableTimer = undefined;
  }

  #clearRetryTimer(): void {
    this.#clearTimer('retry');
  }

  #rejectedAction(action: string): CodesightRunResult {
    const command = renderCodesightCommand(
      action === 'init' ? ['--wiki', '--init'] : ['--wiki'],
    );
    return {
      command,
      cwd: this.root,
      exitCode: -1,
      stdout: '',
      stderr: 'watcher owned by another OMP session',
      ok: false,
      error: `Cannot ${action}: watcher owned by another OMP session`,
    };
  }
}

export function footerStatusText(state: CodesightState): string | undefined {
  if (state === 'disabled') return undefined;
  const label = state === 'external' ? 'shared' : state;
  return `CodeSight: ${label}`;
}
