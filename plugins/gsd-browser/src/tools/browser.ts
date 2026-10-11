/**
 * src/tools/browser.ts — W7 navigate / snapshot / screenshot tools.
 *
 * All three route through the shared tool factory and degrade with the GSD
 * reason vocabulary: no_browser_backend, no_websocket, profile_locked,
 * target_unreachable, timeout. The screenshot tool writes the .gitignore
 * gate unconditionally before the first capture of a session (exact glob
 * list from gsd-ui-auditor.md:87-97).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { CdpClient, CdpError, type CdpReason } from "../cdp/client.js";
import { browserManager } from "../cdp/browser.js";
import {
 attachToTarget,
 captureScreenshotBase64,
 evaluateString,
 getOuterHtml,
 querySelectorAll,
 listTargets,
 navigateAndWait,
 probeVersion,
 setViewport,
} from "../cdp/targets.js";
import { resolveGsdBrowserSettings, type GsdBrowserSettings } from "../settings.js";
import { registerTool } from "./factory.js";

export interface ToolResult {
 content: Array<{ type: "text"; text: string }>;
 isError?: boolean;
 details?: Record<string, unknown>;
}

export const GITIGNORE_HEADER = "# Screenshot files — never commit binary assets";
/** Exact glob list from /tmp/gsd-core/agents/gsd-ui-auditor.md:87-97. */
export const GITIGNORE_GLOBS = [
 "*.png",
 "*.webp",
 "*.jpg",
 "*.jpeg",
 "*.gif",
 "*.bmp",
 "*.tiff",
];
export const GITIGNORE_CONTENT = `${GITIGNORE_HEADER}\n${GITIGNORE_GLOBS.join("\n")}\n`;

export const VIEWPORT_PRESETS: Record<string, { width: number; height: number }> = {
 desktop: { width: 1440, height: 900 },
 mobile: { width: 375, height: 812 },
 tablet: { width: 768, height: 1024 },
};

export type SettingsProvider = (cwd: string) => Promise<GsdBrowserSettings>;

type ConnectFn = (wsUrl: string) => CdpClient;

function makeDefaultConnect(): ConnectFn {
 return () => new CdpClient();
}

function reasonFromError(err: unknown): CdpReason {
 if (err instanceof CdpError) return err.reason;
 const reason = (err as { reason?: string }).reason;
 if (reason === "no_browser_backend" || reason === "no_websocket" || reason === "profile_locked" || reason === "target_unreachable" || reason === "timeout") {
  return reason;
 }
 return "target_unreachable";
}

function degrade(reason: CdpReason, message: string): ToolResult {
 return {
  content: [{ type: "text", text: `Browser unavailable (${reason}): ${message}` }],
  details: { available: false, reason },
 };
}

function ok(text: string, details: Record<string, unknown>): ToolResult {
 return { content: [{ type: "text", text }], details: { available: true, ...details } };
}

/**
 * Attach to (or create) a page target and return a connected page client.
 * `openBrowser` opens the browser-level client (transport injectable for
 * tests); defaults to a plain CdpClient over the platform WebSocket.
 */
export async function getPageClient(
 settings: GsdBrowserSettings,
 connect: ConnectFn,
 openBrowser: (wsUrl: string) => Promise<CdpClient> = async (wsUrl) => {
  const client = connect(wsUrl);
  await client.open(wsUrl);
  return client;
 },
): Promise<CdpClient> {
 const browserClient = await browserManager.ensureClient(openBrowser, settings);
 const port = browserManager.debugPort ?? 0;
 const targets = await listTargets(port);
 const page = targets.find((t) => t.type === "page");
 if (!page) throw new CdpError("target_unreachable", "No page target available");
 const pageClient = await attachToTarget(browserClient, page, connect);
 await probeVersion(browserClient);
 return pageClient;
}

/**
 * Unconditional exact-content .gitignore gate: an existing empty or wrong
 * gate must be repaired, not accepted — screenshots must stay untracked.
 */
export async function ensureGitignoreGate(captureDir: string): Promise<string> {
 await fsp.mkdir(captureDir, { recursive: true });
 const gatePath = path.join(captureDir, ".gitignore");
 const existing = await fsp.readFile(gatePath, "utf8").catch(() => null);
 if (existing !== GITIGNORE_CONTENT) {
  await fsp.writeFile(gatePath, GITIGNORE_CONTENT, "utf8");
 }
 return gatePath;
}

interface NavigateArgs {
 url: string;
 timeoutMs?: number;
 waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export function registerNavigateTool(
 pi: unknown,
 getSettings: SettingsProvider,
 connect: ConnectFn = makeDefaultConnect(),
): void {
 registerTool(pi, "gsd_browser_navigate", {
  approval: "exec",
  description: "Navigate the managed headless browser to a URL and wait for load. Returns finalUrl, title, and HTTP status.",
  args: {
   url: { type: "string", description: "URL to navigate to (http/https)" },
   timeoutMs: { type: "number", description: "Optional navigation timeout in ms", optional: true },
   waitUntil: { type: "string", description: "Load condition: load (default) | domcontentloaded | networkidle", optional: true },
  },
  execute: async (
   _toolCallId: string,
   params: Record<string, unknown>,
   _signal: AbortSignal | undefined,
   _onUpdate: ((details: unknown) => void) | undefined,
   ctx: { cwd: string }
  ): Promise<ToolResult> => {
   const settings = await getSettings(ctx.cwd);
   const timeoutMs = (params.timeoutMs as number) ?? settings.fetchTimeoutMs;
   const url = params.url as string | undefined;

   if (!url) return { content: [{ type: "text", text: "Missing required parameter: url" }], details: { reason: "missing_param" }, isError: true };

   try {
    const client = await getPageClient(settings, connect);
    const waitUntilRaw = params.waitUntil as string | undefined;
    const waitUntil = waitUntilRaw === "domcontentloaded" || waitUntilRaw === "networkidle" ? waitUntilRaw : "load";
    const result = await navigateAndWait(client, url, timeoutMs, waitUntil);
    return ok(
     `Navigated to ${result.finalUrl} — "${result.title}" (HTTP ${result.httpStatus ?? "unknown"})`,
     { ...result },
    );
   } catch (err) {
    return degrade(reasonFromError(err), err instanceof Error ? err.message : String(err));
   }
  },
 });
}

interface SnapshotArgs {
 selector?: string;
 maxDomChars?: number;
}

export function registerSnapshotTool(
 pi: unknown,
 getSettings: SettingsProvider,
 connect: ConnectFn = makeDefaultConnect(),
): void {
 registerTool(pi, "gsd_browser_snapshot", {
  description: "Snapshot the current page: text, optional selector matches with bounded outerHTML excerpts. Never follows page-supplied URLs.",
  args: {
   selector: { type: "string", description: "Optional CSS selector to excerpt", optional: true },
   maxDomChars: { type: "number", description: "Bound on each outerHTML excerpt", optional: true },
   url: { type: "string", description: "Optional URL to navigate to before snapshotting", optional: true },
   timeoutMs: { type: "number", description: "Navigation/excerpt timeout in ms", optional: true },
   queries: {
    type: "array",
    description: "Selector queries with optional attribute excerpts: [{selector, attribute?}]; overrides `selector` when present",
    optional: true,
   },
  },
  execute: async (
   _toolCallId: string,
   params: Record<string, unknown>,
   _signal: AbortSignal | undefined,
   _onUpdate: ((details: unknown) => void) | undefined,
   ctx: { cwd: string }
  ): Promise<ToolResult> => {
   const settings = await getSettings(ctx.cwd);
   const maxDomChars = (params.maxDomChars as number) ?? settings.maxDomChars;
   const timeoutMs = (params.timeoutMs as number) ?? settings.fetchTimeoutMs;
   const selector = params.selector as string | undefined;
   const queries = Array.isArray(params.queries)
    ? (params.queries as Array<{ selector?: unknown; attribute?: unknown }>)
    : undefined;

   try {
    const client = await getPageClient(settings, connect);
    if (params.url) {
     await navigateAndWait(client, String(params.url), timeoutMs);
    }
    const pageText = await evaluateString(client, "document.body?.innerText ?? document.body?.textContent ?? ''");
    let matches: Array<{ selector: string; attribute?: string; html: string }> = [];
    if (queries && queries.length) {
     for (const query of queries.slice(0, 10)) {
      const qSelector = typeof query.selector === "string" ? query.selector : undefined;
      if (!qSelector) continue;
      const attribute = typeof query.attribute === "string" ? query.attribute : undefined;
      const nodeIds = await querySelectorAll(client, qSelector);
      for (const nodeId of nodeIds.slice(0, 10)) {
       let excerpt = await getOuterHtml(client, nodeId, maxDomChars);
       if (attribute) {
        const attr = await evaluateString(
         client,
         `(document.querySelectorAll(${JSON.stringify(qSelector)})[${nodeIds.indexOf(nodeId)}]?.getAttribute(${JSON.stringify(attribute)}) ?? '')`,
        );
        excerpt = attr || excerpt;
       }
       matches.push({ selector: qSelector, attribute, html: excerpt });
      }
     }
    } else if (selector) {
     const nodeIds = await querySelectorAll(client, selector);
     for (const nodeId of nodeIds.slice(0, 10)) {
      matches.push({
       selector,
       html: await getOuterHtml(client, nodeId, maxDomChars),
      });
     }
    }
    const details: Record<string, unknown> = {
     url: await evaluateString(client, "location.href"),
     title: await evaluateString(client, "document.title"),
     text: pageText,
     matches,
    };
    return ok(`Page text (code-wrapped):\n\`\`\`\n${pageText}\n\`\`\``, details);
   } catch (err) {
    return degrade(reasonFromError(err), err instanceof Error ? err.message : String(err));
   }
  },
 });
}

interface ScreenshotArgs {
 viewport?: keyof typeof VIEWPORT_PRESETS;
 url?: string;
}

export function registerScreenshotTool(
 pi: unknown,
 getSettings: SettingsProvider,
 connect: ConnectFn = makeDefaultConnect(),
): void {
 registerTool(pi, "gsd_browser_screenshot", {
  approval: "exec",
  description: "Capture a PNG screenshot of the current page (optionally navigating first) into captureDir. Writes the .gitignore gate before the first capture.",
  args: {
   url: { type: "string", description: "Optional URL to navigate to before capture", optional: true },
   viewport: { type: "string", description: "Viewport preset: desktop | mobile | tablet (ignored when width/height given)", optional: true },
   width: { type: "number", description: "Custom viewport width in px (overrides preset)", optional: true },
   height: { type: "number", description: "Custom viewport height in px (overrides preset)", optional: true },
   path: { type: "string", description: "Output file path (defaults into captureDir with a timestamp)", optional: true },
   fullPage: { type: "boolean", description: "Capture the full scrollable page instead of the viewport", optional: true },
   timeoutMs: { type: "number", description: "Navigation timeout in ms when url is given", optional: true },
  },
  execute: async (
   _toolCallId: string,
   params: Record<string, unknown>,
   _signal: AbortSignal | undefined,
   _onUpdate: ((details: unknown) => void) | undefined,
   ctx: { cwd: string }
  ): Promise<ToolResult> => {
   const settings = await getSettings(ctx.cwd);
   const url = params.url as string | undefined;
   const width = typeof params.width === "number" ? params.width : undefined;
   const height = typeof params.height === "number" ? params.height : undefined;
   const fullPage = params.fullPage === true;
   const timeoutMs = (params.timeoutMs as number) ?? settings.fetchTimeoutMs;
   const presetRaw = params.viewport as string | undefined;
   if (presetRaw && !(presetRaw in VIEWPORT_PRESETS) && !width && !height) {
    return degrade("invalid_params", `Unknown viewport preset "${presetRaw}" (desktop | mobile | tablet) — or pass width/height`);
   }
   const preset = presetRaw && presetRaw in VIEWPORT_PRESETS ? presetRaw : "desktop";

   try {
    // Gate BEFORE the first capture of the session — unconditionally.
    await ensureGitignoreGate(settings.captureDir);
    const client = await getPageClient(settings, connect);
    // Resolution order: explicit width/height > preset > configured settings
    // viewport. The configured dimensions are never silently ignored.
    const presetDims = VIEWPORT_PRESETS[preset];
    const vw = width ?? presetDims.width;
    const vh = height ?? presetDims.height;
    await setViewport(client, vw, vh);
    if (url) {
     await navigateAndWait(client, url, timeoutMs);
    }
    const base64 = await captureScreenshotBase64(client, fullPage);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const pathParam = typeof params.path === "string" ? params.path : "";
    const filePath = path.isAbsolute(pathParam) ? pathParam : path.join(settings.captureDir, pathParam || `${stamp}-${preset}.png`);
    const bytes = Buffer.from(base64, "base64");
    await fsp.writeFile(filePath, bytes);
    return ok(
     `Screenshot saved: ${filePath} (${bytes.length} bytes, ${preset} ${vw}x${vh}${fullPage ? ", fullPage" : ""})`,
     { path: filePath, bytes: bytes.length, viewport: { preset, width: vw, height: vh }, fullPage },
    );
   } catch (err) {
    return degrade(reasonFromError(err), err instanceof Error ? err.message : String(err));
   }
  },
 });
}
