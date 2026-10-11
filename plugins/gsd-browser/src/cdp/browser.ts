/**
 * src/cdp/browser.ts — browser manager (W6).
 *
 * Discovery: setting browserExecutablePath > env GSD_BROWSER_EXECUTABLE >
 * PATH scan (google-chrome, google-chrome-stable, chromium, chromium-browser,
 * chrome-headless-shell) > platform well-known paths. Spawns headless with
 * --remote-debugging-port=0 and a fresh temp profile, waits for
 * DevToolsActivePort, guards with a {ownerPid,childPid,port} lock file + liveness
 * probe + generation counter, and dispose() kills the child and removes the
 * lock and temp dir.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { CdpClient } from "./client.js";
import type { GsdBrowserSettings } from "../settings.js";

const PATH_CANDIDATES = [
	"google-chrome",
	"google-chrome-stable",
	"chromium",
	"chromium-browser",
	"chrome-headless-shell",
];

const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];
const LOCK_TIMEOUT_MS = 15000;

function wellKnownCandidates(): string[] {
	switch (process.platform) {
		case "darwin":
			return [
				"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
				"/Applications/Chromium.app/Contents/MacOS/Chromium",
			];
		case "win32":
			return [
				"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
				"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
			];
		default:
			return ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
	}
}

function isExecutable(candidate: string): boolean {
	try {
		fs.accessSync(candidate, fs.constants.X_OK);
		return fs.statSync(candidate).isFile();
	} catch {
		return false;
	}
}

function scanPath(candidates: string[]): string | null {
	const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
	for (const name of candidates) {
		for (const dir of dirs) {
			const full = path.join(dir, name);
			if (isExecutable(full)) return full;
		}
	}
	return null;
}

/** Resolve the browser executable: setting > env > PATH scan > well-known. */
export function discoverBrowserExecutable(
	browserExecutablePath = "",
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	for (const candidate of [browserExecutablePath, env.GSD_BROWSER_EXECUTABLE ?? ""]) {
		if (candidate && isExecutable(candidate)) return candidate;
	}
	return scanPath(PATH_CANDIDATES) ?? wellKnownCandidates().find(isExecutable) ?? null;
}

interface BrowserLock {
	ownerPid: number;
	childPid: number;
	generation: number;
	port: number;
	profileDir: string;
	startedAt: number;
}

function lockPathFor(profileDir: string): string {
	return path.join(profileDir, ".lock");
}

function isPidAlive(pid: number): boolean {
	if (pid === process.pid) return true;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

/** TCP probe for the DevTools endpoint. */
export function probeDevToolsPort(port: number, host = "127.0.0.1", timeoutMs = 500): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.connect({ port, host });
		const done = (ok: boolean) => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

interface ManagedBrowser {
	child: ChildProcess;
	port: number;
	browserPath: string;
	profileDir: string;
	lockPath: string;
	generation: number;
}

export class BrowserManager {
	private managed: ManagedBrowser | null = null;
	private generation = 0;

	get debugPort(): number | null {
		return this.managed?.port ?? null;
	}

	/** Reap a stale-but-present lock; returns the live lock owner if healthy. */
	private async checkLock(lockPath: string): Promise<boolean> {
		let lock: BrowserLock;
		try {
			lock = JSON.parse(await fsp.readFile(lockPath, "utf8")) as BrowserLock;
		} catch {
			return false;
		}
		if (!isPidAlive(lock.ownerPid) || !isPidAlive(lock.childPid)) {
			// Stale lock: child may still be winding down; probe the port before reclaiming.
			const portAlive = await probeDevToolsPort(lock.port, "127.0.0.1", 300);
			if (!portAlive) {
				await fsp.rm(lockPath, { force: true }).catch(() => {});
				return false;
			}
		}
		return true;
	}

	/**
	 * Launch (or reuse) the managed headless browser. Returns a connected
	 * CdpClient for the browser-level endpoint. Throws a CdpError with a
	 * reason on any failure (`profile_locked`, `no_browser_backend`, `timeout`).
	 */
	async ensureClient(connect: (wsUrl: string) => Promise<CdpClient>, settings?: GsdBrowserSettings): Promise<CdpClient> {
		// Operator kill switch / disabled backend: degrade before any spawn.
		if (settings && (!settings.enabled || settings.backend === "none")) {
			const err = new Error("Browser backend disabled by settings (enabled=false or backend=none)") as Error & { reason?: string };
			err.reason = "no_browser_backend";
			throw err;
		}
		if (this.managed) {
			try {
				return await connect(this.browserWsUrl(this.managed.port, this.managed.browserPath));
			} catch (error) {
				// Reconnect against a dead endpoint must not leave managed state
				// behind — dispose so the next call spawns a fresh browser
				// instead of retrying the stale port forever.
				try {
					this.dispose();
				} catch {
					/* dispose best-effort */
				}
				throw error;
			}
		}
		const executable = settings?.browserExecutablePath || discoverBrowserExecutable();
		if (!executable) {
			const err = new Error(
				"No Chrome-family browser binary found. Set browserExecutablePath or GSD_BROWSER_EXECUTABLE.",
			) as Error & { reason?: string };
			err.reason = "no_browser_backend";
			throw err;
		}
		// Explicit profile dir wins (persisted profile); otherwise a throwaway
		// temp profile per managed session.
		const profileDir = settings?.browserProfileDir
			? settings.browserProfileDir
			: await fsp.mkdtemp(path.join(os.tmpdir(), "gsd-browser-"));
		const lockPath = lockPathFor(profileDir);
		const deadline = Date.now() + LOCK_TIMEOUT_MS;
		let attempt = 0;
		// Bounded backoff loop: retry profile/lock acquisition and spawn.
		for (;;) {
			const existingLock = await fsp
				.readFile(lockPath, "utf8")
				.then((data) => JSON.parse(data) as BrowserLock)
				.catch(() => null);
			if (existingLock && (await this.checkLock(lockPath))) {
				throw Object.assign(new Error("Browser profile is locked by another process."), {
					reason: "profile_locked",
				});
			}
			this.generation += 1;
			const generation = this.generation;
			const child = spawn(
				executable,
				[
					...(settings?.headless === false ? [] : ["--headless=new"]),
					"--no-first-run",
					"--no-default-browser-check",
					"--disable-extensions",
					"--disable-popup-blocking",
					"--disable-translate",
					"--disable-background-timer-throttling",
					"--disable-backgrounding-occluded-windows",
					`--remote-debugging-port=0`,
					`--user-data-dir=${profileDir}`,
				],
				{ stdio: "ignore", detached: true },
			);
			const startedAt = Date.now();
			try {
				const port = await this.waitForDevToolsActivePort(profileDir, deadline);
				if (!port) {
					throw Object.assign(new Error("Timed out waiting for DevToolsActivePort."), {
						reason: "timeout",
					});
				}
				// Persist lock with port so stale reclamation can probe the actual endpoint.
				await fsp.writeFile(lockPath, JSON.stringify({
					ownerPid: process.pid,
					childPid: child.pid ?? -1,
					generation,
					port,
					profileDir,
					startedAt,
				} satisfies BrowserLock));
				const browserPath = await this.readBrowserWsPath(profileDir);
				this.managed = { child, port, browserPath, profileDir, lockPath, generation };
				const wsUrl = this.browserWsUrl(port, browserPath);
				return connect(wsUrl);
			} catch (err) {
				// Roll back on connect() failure: kill child, remove lock, clear managed state.
				try {
					child.kill("SIGTERM");
				} catch {
					// ignore
				}
				await fsp.rm(lockPath, { force: true }).catch(() => {});
				this.managed = null;
				throw err;
			} finally {
				if (generation !== this.generation) {
					// Superseded by a newer launch; clean up this attempt's child.
					try {
						child.kill("SIGTERM");
					} catch {
						// ignore
					}
					await fsp.rm(lockPath, { force: true }).catch(() => {});
				}
			}
		}
	}

	private browserWsUrl(port: number, browserPath: string): string {
		const uuid = this.readBrowserWsPath(this.managed?.profileDir ?? "");
		return `ws://127.0.0.1:${port}${uuid}`;
	}

	private async waitForDevToolsActivePort(profileDir: string, deadline: number): Promise<number | null> {
		while (Date.now() < deadline) {
			const port = await this.readDevToolsActivePort(profileDir);
			if (port !== null && (await probeDevToolsPort(port))) return port;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return null;
	}

	/** Second line of DevToolsActivePort: the uuid browser ws path. */
	private readBrowserWsPath(profileDir: string): string {
		try {
			const raw = fs.readFileSync(path.join(profileDir, "DevToolsActivePort"), "utf8");
			return raw.split("\n")[1].trim();
		} catch {
			return "";
		}
	}

	private async readDevToolsActivePort(profileDir: string): Promise<number | null> {
		try {
			const raw = await fsp.readFile(path.join(profileDir, "DevToolsActivePort"), "utf8");
			const first = raw.split("\n")[0]?.trim();
			const port = Number(first);
			return Number.isFinite(port) ? port : null;
		} catch {
			return null;
		}
	}

	dispose(): void {
		const managed = this.managed;
		this.managed = null;
		if (!managed) return;
		this.killChild(managed.child);
		const profileDir = managed.profileDir;
		fs.rmSync(managed.lockPath, { force: true });
		fs.rmSync(profileDir, { recursive: true, force: true });
	}

	private killChild(child: ChildProcess): void {
		try {
			child.kill("SIGTERM");
		} catch {
			// ignore
		}
	}
}

export const browserManager = new BrowserManager();
