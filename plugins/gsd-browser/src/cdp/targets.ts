import { CdpClient, CdpError } from "./client.js"

/** Wait for a single CDP event, with timeout. */
export function waitForEvent(
	client: CdpClient,
	event: string,
	timeoutMs: number,
): Promise<Record<string, unknown>> {
	const { promise, resolve, reject } = Promise.withResolvers<Record<string, unknown>>();

	const timeoutId = setTimeout(() => {
		reject(new CdpError("timeout", `Timeout waiting for ${event}`));
	}, timeoutMs);

	const handler = (params: Record<string, unknown>) => {
		clearTimeout(timeoutId);
		resolve(params);
	};

	client.on(event, handler);

	return promise.finally(() => {
		clearTimeout(timeoutId);
	});
}

export interface TargetInfo {
	id: string;
	type: string;
	url: string;
	title: string;
	webSocketDebuggerUrl?: string;
}

/** List debuggable targets from the DevTools HTTP endpoint. */
export async function listTargets(port: number): Promise<TargetInfo[]> {
	const controller = new AbortController();
	const timeoutMs = 5000;

	const promise = fetch(`http://127.0.0.1:${port}/json/list`, {
		signal: controller.signal,
	})
		.then(res => {
			if (!res.ok) {
				throw new CdpError("target_unreachable", `/json/list failed with ${res.status}`);
			}
			return res.json() as Promise<TargetInfo[]>;
		})
		.catch(err => {
			if (controller.signal.aborted) {
				throw new CdpError("target_unreachable", "target_unreachable");
			}
			throw err;
		});

	setTimeout(() => controller.abort(), timeoutMs);

	return promise;
}

/** Attach a CdpClient to a page target. */
export async function attachToTarget(
	client: CdpClient,
	target: TargetInfo,
	newClient: (wsUrl: string) => CdpClient,
): Promise<CdpClient> {
	if (!target.webSocketDebuggerUrl) {
		throw new CdpError("target_unreachable", "Target has no webSocketDebuggerUrl");
	}
	const page = newClient(target.webSocketDebuggerUrl);
	await page.open(target.webSocketDebuggerUrl);
	return page;
}

/** Capability probe: must succeed at connect, else the backend is unusable. */
export async function probeVersion(client: CdpClient): Promise<{ browser: string; protocolVersion: string }> {
	const result = await client.call<{ browser?: string; protocolVersion?: string }>("Browser.getVersion", {});
	return {
		browser: result.browser ?? "unknown",
		protocolVersion: result.protocolVersion ?? "unknown",
	};
}

export interface NavigationResult {
	finalUrl: string;
	title: string;
	httpStatus: number | null;
}

/** Navigate the attached page and wait for the load event; captures the response status via Network. */
export async function navigateAndWait(
	client: CdpClient,
	url: string,
	timeoutMs: number,
	waitUntil: "load" | "domcontentloaded" | "networkidle" = "load",
): Promise<NavigationResult> {
	let httpStatus: number | null = null;
	let frameNavigated = false;
	let finalUrl = url;

	// Store current response status per URL for main document filtering
	const responseStatusMap = new Map<string, number>();

	client.on("Network.responseReceived", (params) => {
		const response = params.response as { url?: string; status?: number } | undefined;
		if (response && typeof response.status === "number" && response.url) {
			responseStatusMap.set(response.url, response.status);
		}
	});

	client.on("Page.frameNavigated", (params) => {
		const frame = params.frame as { id?: string; url?: string; name?: string } | undefined;
		if (frame && frame.id && frame.url) {
			frameNavigated = true;
			finalUrl = frame.url;
		}
	});

	await client.call("Page.enable");
	await client.call("Network.enable");
	const loadPromise = waitForEvent(client, "Page.loadEventFired", timeoutMs);
	const nav = await client.call<{ frameId?: string; errorText?: string }>(
		"Page.navigate",
		{ url },
		timeoutMs,
	);
	if (nav.errorText) {
		throw new CdpError("target_unreachable", `Navigation failed: ${nav.errorText}`);
	}
	if (waitUntil === "domcontentloaded") {
		// domcontentloaded ≈ readyState interactive; avoid the full load wait.
		await evaluateString(
			client,
			"new Promise<void>((resolve) => { if (document.readyState !== 'loading') resolve(); else document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }); })",
			timeoutMs,
		);
	} else if (waitUntil === "networkidle") {
		// networkidle: wait for load, then a quiet window with no active network.
		await loadPromise;
		await evaluateString(
			client,
			"new Promise<void>((resolve) => { let pending = 0; const proto = performance; let quiet = 0; const started = proto.now(); const iv = setInterval(() => { if (proto.now() - started > 5000 || (pending === 0 && proto.now() - started > 300)) { clearInterval(iv); resolve(); } }, 100); const openFetches = new Set(); const origFetch = globalThis.fetch; try { Object.defineProperty(globalThis, 'fetch', { value: (...a: unknown[]) => { pending++; return (origFetch as (...x: unknown[]) => Promise<unknown>)(...a).finally(() => pending--); }, configurable: true }); } catch { /* read-only env: timeout-only fallback */ } })",
			Math.min(timeoutMs, 8000),
		);
	} else {
		await loadPromise;
	}

	const resolvedUrl = await evaluateString(client, "location.href");
	const title = await evaluateString(client, "document.title");

	// For main document navigation, use the resolvedUrl for status lookup
	// If frameNavigated was set and we have a response for that URL, use it
	if (frameNavigated && responseStatusMap.has(resolvedUrl)) {
		httpStatus = responseStatusMap.get(resolvedUrl) ?? null;
	} else if (!frameNavigated && responseStatusMap.has(url)) {
		httpStatus = responseStatusMap.get(url) ?? null;
	}

	return { finalUrl: resolvedUrl || finalUrl, title, httpStatus };
}

/** Runtime.evaluate returning a string, or empty string on non-string results. */
export async function evaluateString(client: CdpClient, expression: string, timeoutMs?: number): Promise<string> {
	const result = await client.call<{ value?: unknown; type?: string }>("Runtime.evaluate", {
		expression,
		returnByValue: true,
	}, timeoutMs ?? 10000);
	if (result.type === "string") {
		return result.value as string;
	}
	return "";
}

export interface DomNode {
	id: number;
	bound: { x: number; y: number; width: number; height: number } | null;
	outerHTML: string;
}

/** Get the document root node id. */
export async function getDocumentRoot(client: CdpClient): Promise<number> {
	const result = await client.call<{ root?: { nodeId: number } }>(
		"DOM.getDocument",
		{ depth: 0 },
		10000,
	);
	return result.root?.nodeId ?? 0;
}

/** DOM.querySelectorAll returning node ids for a selector (root resolved first). */
export async function querySelectorAll(
	client: CdpClient,
	selector: string,
): Promise<number[]> {
	// CDP does not treat nodeId 0 as the document root — resolve the real one.
	const root = await getDocumentRoot(client);
	const result = await client.call<{ nodeIds?: number[] }>(
		"DOM.querySelectorAll",
		{ nodeId: root, selector },
		10000,
	);
	return result.nodeIds ?? [];
}

/** Resolve a node to its bounded outerHTML excerpt (locally truncated). */
export async function getOuterHtml(
	client: CdpClient,
	nodeId: number,
	maxChars: number,
): Promise<string> {
	// DOM.getOuterHTML takes only nodeId — depth/maxChars are not CDP fields.
	// The advertised bound is enforced locally after fetch.
	const result = await client.call<{ outerHTML?: string }>(
		"DOM.getOuterHTML",
		{ nodeId },
		10000,
	);
	const html = result.outerHTML ?? "";
	return html.length > maxChars ? `${html.slice(0, maxChars)}…[truncated]` : html;
}

/** Page.captureScreenshot → base64 PNG payload. */
export async function captureScreenshotBase64(client: CdpClient, fullPage = false): Promise<string> {
	if (fullPage) {
		// Full-page capture: size the surface to the scrollable content, shoot,
		// then restore the original metrics.
		const metrics = await client.call<{
			contentSize?: { width?: number; height?: number };
		}>("Page.getLayoutMetrics", {}, 10000);
		const cw = metrics.contentSize?.width ?? 0;
		const ch = metrics.contentSize?.height ?? 0;
		const current = await client.call<{ result?: { value?: unknown } }>(
			"Runtime.evaluate",
			{ expression: "JSON.stringify({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })", returnByValue: true },
			10000,
		);
		let prev = { w: 1280, h: 720, dpr: 1 };
		try {
			prev = JSON.parse(String(current.result?.value ?? "{}")) as typeof prev;
		} catch {
			/* defaults */
		}
		await setViewport(client, Math.max(cw, prev.w), Math.max(ch, prev.h));
		try {
			const shot = await client.call<{ data?: string }>(
				"Page.captureScreenshot",
				{ encoding: "base64", captureBeyondViewport: true },
				20000,
			);
			return shot.data ?? "";
		} finally {
			await setViewport(client, prev.w, prev.h);
		}
	}
	const result = await client.call<{ data?: string }>(
		"Page.captureScreenshot",
		{ encoding: "base64" },
		10000,
	);
	return result.data ?? "";
}

/** Emulation.setDeviceMetricsOverride for a viewport preset. */
export async function setViewport(
	client: CdpClient,
	width: number,
	height: number,
): Promise<void> {
	await client.call("Emulation.setDeviceMetricsOverride", {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: false,
	}, 10000);
}
