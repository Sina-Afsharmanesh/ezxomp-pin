type PlannotatorBrowserModule = typeof import("./plannotator-browser.ts");

export {
	getPlanBrowserHtml,
	getReviewBrowserHtml,
	getStartupErrorMessage,
	hasPlanBrowserHtml,
	hasReviewBrowserHtml,
} from "./plannotator-browser-shared.ts";

let browserModulePromise: Promise<PlannotatorBrowserModule> | undefined;

/**
 * Load the browser/server graph on first use.
 *
 * Concurrent callers share one import, while a failed import is cleared so a
 * later invocation can retry instead of retaining a permanently rejected promise.
 */
export function loadPlannotatorBrowser(): Promise<PlannotatorBrowserModule> {
	if (!browserModulePromise) {
		browserModulePromise = import("./plannotator-browser.ts").catch((error: unknown) => {
			browserModulePromise = undefined;
			throw error;
		});
	}
	return browserModulePromise;
}

/** Stop browser/server resources only when the lazy graph has already been loaded. */
export function stopLoadedBrowserSessions(): void {
	const promise = browserModulePromise;
	if (!promise) return;
	void promise
		.then((browser) => browser.stopAllBrowserSessions())
		.catch((error: unknown) => {
			console.error(`Plannotator browser cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
		});
}
