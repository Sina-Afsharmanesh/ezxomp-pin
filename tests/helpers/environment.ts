/**
 * Shared test environment helper — isolates a test from ambient environment
 * variables and cleans up temp dirs it creates.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestEnvironment {
	/** Clear every tracked env var (leaves saved snapshot intact). */
	reset(): void;
	/** Create a fresh temp dir under the OS tmpdir, tracked for cleanup. */
	makeTempDir(): string;
	/** Restore saved env var values and remove created temp dirs. */
	restore(): void;
}

export function createTestEnvironment(
	envKeys: readonly string[],
	prefix: string,
): TestEnvironment {
	const saved = new Map<string, string | undefined>();
	const tempDirs: string[] = [];

	const snapshot = () => {
		saved.clear();
		for (const key of envKeys) saved.set(key, process.env[key]);
	};
	snapshot();

	return {
		reset() {
			for (const key of envKeys) delete process.env[key];
		},
		makeTempDir() {
			const dir = mkdtempSync(join(tmpdir(), prefix));
			tempDirs.push(dir);
			return dir;
		},
		restore() {
			for (const key of envKeys) {
				const value = saved.get(key);
				if (value !== undefined) process.env[key] = value;
				else delete process.env[key];
			}
			for (const dir of tempDirs) {
				rmSync(dir, { recursive: true, force: true });
			}
			tempDirs.length = 0;
		},
	};
}
