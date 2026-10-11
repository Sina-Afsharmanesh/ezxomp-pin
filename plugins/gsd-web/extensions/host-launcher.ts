/**
 * @ezxomp/gsd-web — host launcher.
 *
 * Spawns the committed standalone Next server (web/.next/standalone/web/server.js)
 * detached from the OMP session, with the env contract the web app expects:
 *
 *   PORT / HOSTNAME              — Next standalone bind
 *   GSD_WEB_HOST / GSD_WEB_PORT  — proxy-auth origin allowlist
 *   GSD_WEB_AUTH_TOKEN           — bearer token (URL fragment delivery)
 *   GSD_WEB_STATE_DIR            — OMP-scoped state root (~/.omp/gsd-web)
 *   GSD_WEB_PACKAGE_ROOT         — plugin root (pty probe roots, omp entry)
 *   GSD_WEB_DAEMON_MODE          — disables the pagehide shutdown gate
 *   GSD_WEB_ALLOWED_ORIGINS      — localhost + tailnet origins
 *
 * Tailnet-first: default bind is the tailscale0 address when present, so the
 * dashboard is reachable from other devices on the tailnet. `/gsd-web start
 * --localhost` (or the `host` setting pinned to 127.0.0.1) restricts to loopback.
 */

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import type { SpawnOptions } from "node:child_process";

export interface WebInstance {
 host: string;
 port: number;
 pid: number;
 projectCwd: string;
 startedAt: string;
 daemonMode: boolean;
 authDisabled: boolean;
 logFile: string;
}

export interface ResolvedSettings {
 host: string;
 port: number;
 noAuth: boolean;
 allowUnauthenticatedLAN: boolean;
 daemonMode: boolean;
 openBrowser: boolean;
 freeform: Record<string, string>;
}

const PLUGIN_ROOT = resolve(import.meta.dirname, "..");
const STANDALONE_SERVER = join(PLUGIN_ROOT, "web", ".next", "standalone", "web", "server.js");
const STATIC_DIR = join(PLUGIN_ROOT, "web", ".next", "standalone", "web", ".next", "static");

export function pluginRoot(): string {
 return PLUGIN_ROOT;
}

/** OMP-scoped state root for the web app's sessions/preferences/pid. */
export function stateRoot(): string {
 return process.env.OMP_HOME
  ? join(process.env.OMP_HOME, "gsd-web")
  : join(homedir(), ".omp", "gsd-web");
}

function registryPath(): string {
 return join(stateRoot(), "instances.json");
}

function logPath(port: number): string {
 return join(stateRoot(), "logs", `server-${port}.log`);
}

/**
 * Resolve the bind host. `auto` (default): tailscale0 IPv4 when present so the
 * UI is reachable tailnet-wide; otherwise loopback. Explicit "localhost" /
 * 127.0.0.1 forces loopback; any other value is used verbatim.
 */
export function resolveBindHost(
 setting: string | undefined,
 forceLocalhost: boolean,
): { host: string; source: "loopback" | "tailnet" | "explicit" } {
 const value = forceLocalhost ? "localhost" : (setting ?? "auto").trim();
 if (!value || value === "auto") {
  const tailnet = detectTailnetIp();
  if (tailnet) return { host: tailnet, source: "tailnet" };
  return { host: "127.0.0.1", source: "loopback" };
 }
 if (value === "localhost" || value === "127.0.0.1" || value === "::1") {
  return { host: "127.0.0.1", source: "explicit" };
 }
 return { host: value, source: "explicit" };
}

/** First IPv4 on a tailscale interface (100.64.0.0/10 CGNAT range). */
export function detectTailnetIp(): string | null {
 if (process.platform === "win32") return null;
 try {
  const out = execFileSync("ip", ["-4", "-o", "addr", "show"], {
   encoding: "utf8",
   timeout: 3000,
  });
  const match = out
   .split("\n")
   .find((line) => /tailscale\d+/.test(line) && /inet\s+100\.\d+\.\d+\.\d+/.test(line));
  return match?.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;
 } catch {
  return null;
 }
}

/** Reserve an ephemeral port by binding + closing (requested > 0 passes through). */
export function reservePort(requested: number): Promise<number> {
 if (requested > 0) return Promise.resolve(requested);
 const { promise, resolve: resolvePort } = Promise.withResolvers<number>();
 const srv = createServer();
 srv.listen(0, "127.0.0.1", () => {
  const addr = srv.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  srv.close(() => resolvePort(port));
 });
 return promise;
}

export function readRegistry(): WebInstance[] {
 const path = registryPath();
 if (!existsSync(path)) return [];
 try {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { instances?: WebInstance[] };
  return Array.isArray(parsed.instances) ? parsed.instances : [];
 } catch {
  return [];
 }
}

export function writeRegistry(instances: WebInstance[]): void {
 const path = registryPath();
 mkdirSync(stateRoot(), { recursive: true });
 writeFileSync(path, `${JSON.stringify({ version: 1, instances }, null, 2)}\n`);
}

function recordInstance(instance: WebInstance): void {
 const rest = readRegistry().filter((entry) => entry.port !== instance.port);
 writeRegistry([...rest, instance]);
}

export function removeInstance(port: number): void {
 writeRegistry(readRegistry().filter((entry) => entry.port !== port));
}

/** pid-liveness check (signal 0). */
export function isPidAlive(pid: number): boolean {
 if (!pid || pid <= 0) return false;
 try {
  process.kill(pid, 0);
  return true;
 } catch {
  return false;
 }
}

/** Remove dead registry entries; returns surviving instances. */
export function sweepStale(): WebInstance[] {
 const all = readRegistry();
 const alive = all.filter((entry) => isPidAlive(entry.pid));
 if (alive.length !== all.length) writeRegistry(alive);
 return alive;
}

/** Stop a running instance (SIGTERM → 3s → SIGKILL). */
export async function stopInstance(instance: WebInstance): Promise<"stopped" | "not-running"> {
 if (!isPidAlive(instance.pid)) {
  removeInstance(instance.port);
  return "not-running";
 }
 try {
  process.kill(instance.pid, "SIGTERM");
 } catch {
  removeInstance(instance.port);
  return "not-running";
 }
 const deadline = Date.now() + 3000;
 while (Date.now() < deadline) {
  if (!isPidAlive(instance.pid)) {
   removeInstance(instance.port);
   return "stopped";
  }
  await new Promise((r) => setTimeout(r, 150));
 }
 try {
  process.kill(instance.pid, "SIGKILL");
 } catch {
  /* already gone */
 }
 removeInstance(instance.port);
 return "stopped";
}

export interface LaunchOptions {
 settings: ResolvedSettings;
 projectCwd: string;
 forceLocalhost?: boolean;
 portOverride?: number;
}

export interface LaunchResult {
 url: string;
 token: string | null;
 instance: WebInstance;
}

/**
 * Resolve the runtime for the standalone server. node-pty's native module
 * fails under Bun — spawned children exit instantly with no output — so the
 * server must run under Node for the terminal panel to work. Preference:
 * the `nodeBinary` setting, then `node` on PATH; fall back to the host
 * runtime (terminal degrades, chat/files still work).
 */
function resolveServerBinary(nodeBinary: string): string {
 const custom = nodeBinary.trim();
 if (custom && existsSync(custom)) return custom;
 try {
  const version = execFileSync("node", ["--version"], {
   stdio: ["ignore", "pipe", "ignore"],
   timeout: 5000,
   encoding: "utf8",
  });
  if (version.startsWith("v")) return "node";
 } catch {
  // No usable node on PATH.
 }
 console.warn("gsd-web: node binary not found — spawning server under the host runtime; the terminal panel will not work (node-pty requires Node)");
 return process.execPath;
}

/**
 * First-start bootstrap: a marketplace install ships source only (no
 * install-time build hook per the authoring contract), so the standalone
 * runtime and web node_modules are materialized on the first
 * `/gsd-web start`. Installs web deps (bun, falling back to npm ci) and
 * builds once; the completed build is the cache marker.
 */
async function ensureStandaloneBuild(): Promise<void> {
 if (existsSync(STANDALONE_SERVER) && existsSync(STATIC_DIR)) return;

 const webRoot = join(PLUGIN_ROOT, "web");
 const hasBunLock = existsSync(join(webRoot, "bun.lock"));
 const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolveRun, rejectRun) => {
   const child = spawn(cmd, args, { cwd: webRoot, stdio: "inherit", shell: process.platform === "win32" });
   child.on("exit", (code) => (code === 0 ? resolveRun() : rejectRun(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
   child.on("error", rejectRun);
  });

 if (!existsSync(join(webRoot, "node_modules"))) {
  // OMP ships on bun, so the bun.lock install path is primary; npm is the fallback.
  // bun.lock is committed without package-lock.json, so npm ci has nothing to pin.
  const useBun = hasBunLock && process.env.GSD_WEB_BOOTSTRAP_INSTALLER !== "npm";
  if (useBun) {
   try {
    await run("bun", ["install"]);
   } catch (error) {
    console.warn(`gsd-web: bun install failed (${error instanceof Error ? error.message : String(error)}), falling back to npm install`);
    await run("npm", ["install"]);
   }
  } else {
   await run("npm", ["install"]);
  }
 }
 await run("npm", ["run", "build"]);

 if (!existsSync(STANDALONE_SERVER) || !existsSync(STATIC_DIR)) {
  throw new Error("gsd-web build completed but the standalone output is missing — inspect the build output above");
 }
}

/** Start the standalone server detached; returns the token-bearing URL. */
export async function launchWebServer(options: LaunchOptions): Promise<LaunchResult> {
 await ensureStandaloneBuild();

 const existing = sweepStale().find((entry) => entry.projectCwd === options.projectCwd);
 if (existing) {
  return {
   url: instanceUrl(existing, options.settings.noAuth),
   token: options.settings.noAuth ? null : readTokenForInstance(existing),
   instance: existing,
  };
 }

 const bind = resolveBindHost(options.settings.host, options.forceLocalhost === true);
 const port = await reservePort(options.portOverride ?? options.settings.port);
 const token = options.settings.noAuth ? null : randomBytes(32).toString("hex");

 const stateDir = stateRoot();
 const logFile = logPath(port);
 mkdirSync(join(stateDir, "logs"), { recursive: true });

 const allowedOrigins = new Set<string>([
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
 ]);
 if (bind.host !== "127.0.0.1") {
  allowedOrigins.add(`http://${bind.host}:${port}`);
 }
 for (const extra of (options.settings.freeform.allowedOrigins ?? "").split(",")) {
  const trimmed = extra.trim();
  if (trimmed) allowedOrigins.add(trimmed);
 }

 const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(port),
  HOSTNAME: bind.host,
  GSD_WEB_HOST: bind.host,
  GSD_WEB_PORT: String(port),
  GSD_WEB_STATE_DIR: stateDir,
  GSD_WEB_PACKAGE_ROOT: PLUGIN_ROOT,
  GSD_WEB_PROJECT_CWD: options.projectCwd,
  GSD_WEB_DAEMON_MODE: options.settings.daemonMode || options.settings.allowUnauthenticatedLAN ? "1" : "0",
  GSD_WEB_ALLOWED_ORIGINS: [...allowedOrigins].join(","),
  ...(token ? { GSD_WEB_AUTH_TOKEN: token } : {}),
 };

 const logFd = openSync(logFile, "a");
 const child = spawn(resolveServerBinary(options.settings.freeform.nodeBinary ?? ""), [STANDALONE_SERVER], {
  cwd: join(PLUGIN_ROOT, "web", ".next", "standalone", "web"),
  env,
  detached: true,
  stdio: ["ignore", logFd, logFd],
  windowsHide: true,
 });
 child.unref();

 const instance: WebInstance = {
  host: bind.host,
  port,
  pid: child.pid ?? 0,
  projectCwd: options.projectCwd,
  startedAt: new Date().toISOString(),
  daemonMode: env.GSD_WEB_DAEMON_MODE === "1",
  authDisabled: token === null,
  logFile,
 };

 await waitForHttp(bind.host, port, 15_000);
 recordInstance(instance);

 return { url: instanceUrl(instance, token === null), token, instance };
}

function instanceUrl(instance: WebInstance, noAuth: boolean): string {
 const base = `http://${instance.host === "localhost" ? "127.0.0.1" : instance.host}:${instance.port}/`;
 return noAuth ? base : `${base}#token=${readTokenForInstance(instance) ?? ""}`;
}

/**
 * The token lives in the server's env only (never persisted to the registry —
 * it is a credential). For `status`/`url` we surface it from /proc/<pid>/environ
 * on Linux; on other platforms the user re-runs `/gsd-web start` for a fresh URL.
 */
export function readTokenForInstance(instance: WebInstance): string | null {
 if (process.platform === "linux" && instance.pid > 0) {
  try {
   const environ = readFileSync(`/proc/${instance.pid}/environ`, "utf8");
   const entry = environ.split("\0").find((e) => e.startsWith("GSD_WEB_AUTH_TOKEN="));
   return entry ? entry.slice("GSD_WEB_AUTH_TOKEN=".length) : null;
  } catch {
   return null;
  }
 }
 return null;
}

async function waitForHttp(host: string, port: number, timeoutMs: number): Promise<void> {
 const deadline = Date.now() + timeoutMs;
 let lastError: string | null = null;
 while (Date.now() < deadline) {
  try {
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), 1500);
   const response = await fetch(`http://${host.includes(":") ? `[${host}]` : host}:${port}/`, {
    signal: controller.signal,
   });
   clearTimeout(timer);
   if (response.status < 500) return;
   lastError = `HTTP ${response.status}`;
  } catch (error) {
   lastError = error instanceof Error ? error.message : String(error);
  }
  await new Promise((r) => setTimeout(r, 300));
 }
 throw new Error(`gsd-web server did not become ready on ${host}:${port} (${lastError ?? "timeout"})`);
}

/** Best-effort browser open (xdg-open / open). */
export function openInBrowser(url: string): boolean {
 try {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const opts: SpawnOptions = { detached: true, stdio: "ignore" };
  const child = spawn(opener, [url], opts);
  child.unref();
  return true;
 } catch {
  return false;
 }
}

/** Logs tail for a running instance. */
export function readLogs(instance: WebInstance, lines = 40): string {
 try {
  const content = readFileSync(instance.logFile, "utf8");
  return content.split("\n").slice(-lines).join("\n");
 } catch {
  return `(no log file at ${instance.logFile})`;
 }
}
