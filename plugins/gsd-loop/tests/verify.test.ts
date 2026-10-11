import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VERIFY_BACKOFF_MAX_MS, VERIFY_BACKOFF_MIN_MS } from "../src/verify-types.js";
import { runVerify } from "../src/verify.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(path.join(tmpdir(), "gsd-loop-verify-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const noSleep = () => Promise.resolve();

describe("runVerify", () => {
	it("fail,fail,pass ⇒ attempts 3, passed", async () => {
		const cwd = tempRoot();
		const marker = path.join(cwd, "marker");
		// failures differ per attempt (echo $n) so hash short-circuit doesn't fire
		const command = `n=$(cat "${marker}" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "${marker}"; [ "$n" -ge 3 ] && exit 0; exit 1`;
		const outcome = await runVerify({ command, cwd, maxRetries: 3, timeoutMs: 5000, sleep: noSleep });
		expect(outcome.passed).toBe(true);
		expect(outcome.attempts).toBe(3);
	});

	it("always-fail ⇒ attempts == maxRetries + 1 total", async () => {
		const outcome = await runVerify({
			command: "exit 1",
			cwd: tempRoot(),
			maxRetries: 2,
			timeoutMs: 5000,
			sleep: noSleep,
		});
		expect(outcome.passed).toBe(false);
		expect(outcome.attempts).toBe(3); // first attempt + 2 retries
	});

	it("timeout is enforced within scheduling slack", async () => {
		const outcome = await runVerify({
			command: "sleep 5",
			cwd: tempRoot(),
			maxRetries: 0,
			timeoutMs: 500,
			sleep: noSleep,
		});
		expect(outcome.passed).toBe(false);
		expect(outcome.timedOut).toBe(true);
	});
	it("backoff sleeps stay within [2s, 30s] bounds and grow exponentially", async () => {
		const cwd = tempRoot();
		const marker = path.join(cwd, "n");
		// distinct output per attempt so the hash short-circuit never fires
		const command = `n=$(cat "${marker}" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "${marker}"; echo "fail-$n" >&2; exit 1`;
		const sleeps: number[] = [];
		await runVerify({
			command,
			cwd,
			maxRetries: 6,
			timeoutMs: 5000,
			sleep: (ms) => {
				sleeps.push(ms);
				return Promise.resolve();
			},
			rand: () => 0.5, // zero jitter
		});
		expect(sleeps).toHaveLength(6);
		for (const ms of sleeps) {
			expect(ms).toBeGreaterThanOrEqual(VERIFY_BACKOFF_MIN_MS * (1 - 0.1));
			expect(ms).toBeLessThanOrEqual(VERIFY_BACKOFF_MAX_MS);
		}
		expect(sleeps[0]).toBe(VERIFY_BACKOFF_MIN_MS); // 2s
		expect(sleeps[1]).toBe(2 * VERIFY_BACKOFF_MIN_MS); // 4s
		expect(sleeps[4]).toBe(Math.min(VERIFY_BACKOFF_MAX_MS, VERIFY_BACKOFF_MIN_MS * 16)); // 30s cap
	});
	it("identical consecutive failure hashes short-circuit remaining budget", async () => {
		const sleeps: number[] = [];
		const outcome = await runVerify({
			command: "exit 1",
			cwd: tempRoot(),
			maxRetries: 5,
			timeoutMs: 5000,
			sleep: (ms) => {
				sleeps.push(ms);
				return Promise.resolve();
			},
		});
		// identical failure each time: second hash matches, budget burned
		expect(outcome.attempts).toBe(6);
		expect(sleeps).toHaveLength(1);
	});

	it("changing output defeats the hash short-circuit", async () => {
		const cwd = tempRoot();
		const marker = path.join(cwd, "n");
		const command = `n=$(cat "${marker}" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "${marker}"; echo "fail-$n" >&2; exit 1`;
		const sleeps: number[] = [];
		const outcome = await runVerify({
			command,
			cwd,
			maxRetries: 2,
			timeoutMs: 5000,
			sleep: (ms) => {
				sleeps.push(ms);
				return Promise.resolve();
			},
		});
		expect(outcome.passed).toBe(false);
		expect(outcome.attempts).toBe(3);
		expect(sleeps).toHaveLength(2); // every retry slept: outputs differed
	});
});
