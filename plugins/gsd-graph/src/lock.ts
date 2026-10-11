/**
 * File lock for GRAPH.yaml / graph.json writers.
 *
 * In-tree re-implementation of gsd-pi's proper-lockfile wrapper
 * (upstream src/resources/extensions/gsd/file-lock.ts) with upstream's exact
 * constants: retries 5, stale 10s, retry delay 50ms.
 *
 * Mechanism: open(target + ".lock", "wx") — exclusive create. The lock body
 * records the owner PID; if the create fails with EEXIST and the recorded
 * owner is dead (or the lock is older than staleMs), the stale lock is
 * unlinked and the acquire retried. After exhausting retries, throws an
 * ELOCKED error. PID liveness uses process.kill(pid, 0); EPERM = alive.
 */

import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export interface FileLockOptions {
	retries?: number;
	staleMs?: number;
	retryDelayMs?: number;
}

export const DEFAULT_LOCK_OPTIONS: Required<FileLockOptions> = {
	retries: 5,
	staleMs: 10_000,
	retryDelayMs: 50,
};

export class LockError extends Error {
	constructor(targetPath: string) {
		super(`ELOCKED: could not acquire lock for ${targetPath} after retries`);
		this.name = "LockError";
	}
}

// Async retry delay: a synchronous block (Atomics.wait) would stall the
// event loop and starve the lock holder's own completion — parallel writers
// in one process would deadlock against each other's release timers.
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Is a PID alive? EPERM means the process exists but is not ours to signal — alive. */
function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

interface LockBody {
	ownerPid: number;
	acquiredAt: number;
}

function readLockBody(lockPath: string): LockBody | null {
	try {
		const parsed = JSON.parse(readFileSync(lockPath, "utf-8")) as Partial<LockBody>;
		if (typeof parsed.ownerPid !== "number") return null;
		return { ownerPid: parsed.ownerPid, acquiredAt: parsed.acquiredAt ?? 0 };
	} catch {
		return null;
	}
}

function lockIsStale(lockPath: string, staleMs: number): boolean {
	const body = readLockBody(lockPath);
	if (!body) return true; // unparseable lock body — stale
	if (!isPidAlive(body.ownerPid)) return true; // dead owner — stale
	try {
		return Date.now() - statSync(lockPath).mtimeMs > staleMs;
	} catch {
		return true;
	}
}

function acquire(lockPath: string, staleMs: number): void {
	try {
		const fd = openSync(lockPath, "wx");
		const body: LockBody = { ownerPid: process.pid, acquiredAt: Date.now() };
		writeFileSync(fd, JSON.stringify(body), "utf-8");
		closeSync(fd);
		return;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
	}
	if (lockIsStale(lockPath, staleMs)) {
		try {
			unlinkSync(lockPath);
		} catch {
			// Lost a takeover race — next retry re-evaluates.
		}
	}
	throw new Error("EEXIST");
}

export async function withFileLock<T>(
	targetPath: string,
	fn: () => Promise<T> | T,
	options?: FileLockOptions,
): Promise<T> {
	const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
	const lockPath = `${targetPath}.lock`;
	mkdirSync(dirname(lockPath), { recursive: true });

	let acquired = false;
	for (let attempt = 0; attempt <= opts.retries; attempt++) {
		try {
			acquire(lockPath, opts.staleMs);
			acquired = true;
			break;
		} catch (err) {
			if ((err as Error).message !== "EEXIST") throw err;
			if (attempt < opts.retries) await sleep(opts.retryDelayMs);
		}
	}
	if (!acquired) throw new LockError(targetPath);

	try {
		return await fn();
	} finally {
		try {
			unlinkSync(lockPath);
		} catch {
			// Lock already gone (stale takeover raced us) — nothing to release.
		}
	}
}

/** For tests and diagnostics: the lock sidecar path for a target. */
export function lockPathForTarget(targetPath: string): string {
	return `${targetPath}.lock`;
}

/** Check whether a lock file exists without acquiring. */
export function lockExists(targetPath: string): boolean {
	return existsSync(lockPathForTarget(targetPath));
}
