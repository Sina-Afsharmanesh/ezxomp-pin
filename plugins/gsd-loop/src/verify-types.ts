/**
 * src/verify-types.ts — shared types + constants for the verify runner.
 */

export const VERIFY_BACKOFF_MIN_MS = 2000;
export const VERIFY_BACKOFF_MAX_MS = 30000;
export const VERIFY_JITTER_RATIO = 0.1;

export interface VerifyOutcome {
	passed: boolean;
	attempts: number;
	timedOut: boolean;
	outputTail: string;
}

export interface VerifyOptions {
	command: string;
	cwd: string;
	maxRetries: number;
	timeoutMs: number;
	/** Injectable sleep for deterministic tests. */
	sleep?: (ms: number) => Promise<void>;
	/** Injectable RNG for deterministic jitter tests. */
	rand?: () => number;
}

export interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
}

function defaultSleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

export { defaultSleep };
