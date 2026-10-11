import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
	closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
	realpathSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

interface Lease {
	active: boolean;
	fd: number;
	path: string;
}

const ownership = new AsyncLocalStorage<ReadonlyMap<string, Lease>>();
const WAIT_MS = 5_000;

/** All Cook persistence and ownership use the same physical project root. */
export function canonicalCookRoot(cwd: string): string {
	return realpathSync(cwd);
}

/** Absence initializes a new file; unreadable or corrupt existing data never does. */
export function readCookFile(path: string, kind: "state" | "journal"): string | undefined {
	try {
		return readFileSync(path, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			try {
				lstatSync(path);
			} catch (pathError) {
				if ((pathError as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			}
		}
		throw new Error(`Cannot read Cook ${kind}: ${path}`, { cause: error });
	}
}

function syncDirectory(path: string): void {
	const fd = openSync(path, "r");
	try {
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function ensureDirectory(path: string): void {
	const firstCreated = mkdirSync(path, { recursive: true });
	if (!firstCreated) return;
	const parent = dirname(firstCreated);
	for (let current = path; ; current = dirname(current)) {
		syncDirectory(current);
		if (current === parent) break;
	}
}

function tryAcquire(root: string): Lease | undefined {
	const path = join(root, "backlog", ".cook.lock");
	ensureDirectory(dirname(path));
	let fd: number;
	try {
		fd = openSync(path, "wx", 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
		throw error;
	}
	const lease = { active: true, fd, path };
	try {
		writeFileSync(fd, JSON.stringify({ pid: process.pid, token: randomUUID() }));
		fsyncSync(fd);
		syncDirectory(dirname(path));
		return lease;
	} catch (error) {
		try {
			release(lease);
		} catch (cleanupError) {
			throw new AggregateError([error, cleanupError], `Cook lock creation and cleanup failed: ${path}`);
		}
		throw error;
	}
}

function release(lease: Lease): void {
	lease.active = false;
	try {
		const held = fstatSync(lease.fd);
		const current = lstatSync(lease.path);
		if (held.dev !== current.dev || held.ino !== current.ino) {
			throw new Error(`Cook lock ownership changed: ${lease.path}`);
		}
		unlinkSync(lease.path);
		syncDirectory(dirname(lease.path));
	} finally {
		closeSync(lease.fd);
	}
}

function ownedLease(root: string): Lease | undefined {
	const lease = ownership.getStore()?.get(root);
	return lease?.active ? lease : undefined;
}

function busyError(root: string): Error {
	return new Error(`Cook project is locked: ${root}. Retry after its owner finishes; orphan locks require explicit recovery.`);
}

/** Sync writes may reenter only their own live async execution, never another caller. */
export function withCookLockSync<T>(cwd: string, action: () => T): T {
	const root = canonicalCookRoot(cwd);
	if (ownedLease(root)) return action();
	const lease = tryAcquire(root);
	if (!lease) throw busyError(root);
	try {
		return ownership.run(new Map([...(ownership.getStore() ?? []), [root, lease]]), action);
	} finally {
		release(lease);
	}
}

/** Serialize processes with bounded waiting; never steal a live or unverified orphan lock. */
export async function withCookLock<T>(cwd: string, action: () => Promise<T>): Promise<T> {
	const root = canonicalCookRoot(cwd);
	if (ownedLease(root)) return action();
	const deadline = performance.now() + WAIT_MS;
	let lease = tryAcquire(root);
	while (!lease) {
		if (performance.now() >= deadline) throw busyError(root);
		await delay(25);
		lease = tryAcquire(root);
	}
	try {
		return await ownership.run(new Map([...(ownership.getStore() ?? []), [root, lease]]), action);
	} finally {
		release(lease);
	}
}

/** Same-directory replacement: acknowledged bytes and directory entry are durable. */
export function writeCookFileAtomic(path: string, content: string): void {
	const directory = dirname(path);
	ensureDirectory(directory);
	const temporary = join(directory, `.cook-write-${randomUUID()}.tmp`);
	const fd = openSync(temporary, "wx", 0o600);
	let pending = true;
	try {
		try {
			writeFileSync(fd, content, "utf-8");
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temporary, path);
		pending = false;
		syncDirectory(directory);
	} catch (primaryError) {
		if (pending) {
			try {
				unlinkSync(temporary);
			} catch (cleanupError) {
				if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
					throw new AggregateError([primaryError, cleanupError], "Cook atomic write and temporary cleanup failed", { cause: primaryError });
				}
			}
		}
		throw primaryError;
	}
}
