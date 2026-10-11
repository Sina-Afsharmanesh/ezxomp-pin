import { beforeEach, vi } from "vitest";

// Reset mock call history and module-level watcher state before each test.
// Without this, `vi.mock("node:fs")` mock results accumulate across tests, and
// the extension's module-level `activeWatcher` leaks between dynamic imports.
beforeEach(async () => {
	vi.clearAllMocks();
	const mod = await import("../extensions/index.ts");
	mod.__resetWatchState();
	mod.__resetAllState();
});
