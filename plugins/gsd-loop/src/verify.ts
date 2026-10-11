/**
 * src/verify.ts — verification command runner (WU-5).
 *
 * Retry with exponential backoff 2s→30s + 10% jitter (constants, not user
 * knobs), timeout kill at verify.timeoutMs, SHA-256 failure hashing
 * to detect identical failures and short-circuit the remaining budget.
 * Port of gsd-pi verification-retry-policy.ts:8-51.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { ExecResult, VerifyOptions, VerifyOutcome } from "./verify-types.js";
import { VERIFY_BACKOFF_MAX_MS, VERIFY_BACKOFF_MIN_MS, VERIFY_JITTER_RATIO, defaultSleep } from "./verify-types.js";

export type { VerifyOptions, VerifyOutcome };

const OUTPUT_TAIL_BYTES = 4000;

function backoffDelay(attempt: number, rand: () => number = Math.random): number {
 const exponential = Math.min(
  VERIFY_BACKOFF_MAX_MS,
  VERIFY_BACKOFF_MIN_MS * 2 ** (attempt - 1),
 );
 const jitter = exponential * VERIFY_JITTER_RATIO * (rand() * 2 - 1);
 return Math.max(
  VERIFY_BACKOFF_MIN_MS * (1 - VERIFY_JITTER_RATIO),
  Math.min(VERIFY_BACKOFF_MAX_MS, exponential + jitter),
 );
}

function execOnce(command: string, cwd: string, timeoutMs: number): Promise<ExecResult> {
 const { promise, resolve } = Promise.withResolvers<ExecResult>();
 const child = spawn("/bin/sh", ["-c", command], {
  cwd,
  detached: true, // own process group so timeout kill reaps the whole tree
  stdio: ["ignore", "pipe", "pipe"],
 });
 let stdout = "";
 let stderr = "";
 let timedOut = false;
 child.stdout.on("data", (d: Buffer) => {
  stdout += d.toString("utf8");
  if (stdout.length > 10 * 1024 * 1024) stdout = stdout.slice(-10 * 1024 * 1024);
 });
 child.stderr.on("data", (d: Buffer) => {
  stderr += d.toString("utf8");
  if (stderr.length > 10 * 1024 * 1024) stderr = stderr.slice(-10 * 1024 * 1024);
 });
 const killer = setTimeout(() => {
  timedOut = true;
  try {
   process.kill(-child.pid!, "SIGKILL"); // negative pid: kill the process group
  } catch {
   try {
    child.kill("SIGKILL");
   } catch {
    /* already gone */
   }
  }
 }, timeoutMs);
 child.on("error", (err) => {
  // Spawn failure (ENOENT/EPERM): must never resolve as a passing verify.
  clearTimeout(killer);
  resolve({
   stdout,
   stderr: `${stderr}\nspawn error: ${err.message}`,
   exitCode: 1,
   timedOut,
  });
 });
 child.on("close", (code) => {
  clearTimeout(killer);
  resolve({
   stdout,
   stderr,
   exitCode: code === null ? 1 : code,
   timedOut,
  });
 });
 return promise;
}

function failureHash(stdout: string, stderr: string, exitCode: number | null): string {
 return createHash("sha256").update(`${stdout}\0${stderr}\0${exitCode}`).digest("hex");
}

/**
 * Run verifyCommand in cwd with retry + backoff. maxRetries = retries AFTER
 * the first attempt (total attempts = maxRetries + 1). Identical consecutive
 * failure hashes short-circuit remaining budget.
 */
export async function runVerify(options: VerifyOptions): Promise<VerifyOutcome> {
 const sleep = options.sleep ?? defaultSleep;
 const rand = options.rand ?? Math.random;
 const totalAttempts = options.maxRetries + 1;
 let attempts = 0;
 let timedOut = false;
 let outputTail = "";
 let lastHash: string | null = null;

 while (attempts < totalAttempts) {
  attempts++;
  const result = await execOnce(options.command, options.cwd, options.timeoutMs);
  timedOut = result.timedOut;
  outputTail = `${result.stdout}${result.stderr}`.slice(-OUTPUT_TAIL_BYTES);
  if (result.exitCode === 0 && !result.timedOut) {
   return { passed: true, attempts, timedOut: false, outputTail };
  }
  // Duplicate-failure short-circuit (upstream decideVerificationRetry):
  // identical failure context burns the remaining budget. Empty failure
  // output (exit code alone) carries no diagnostic signal and can mask real
  // progress (fail,fail,pass ladders) — only burn on it when ample budget
  // remains (plan AC: fail,fail,pass ⇒ attempts 3).
  const hasOutput = result.stdout.length + result.stderr.length > 0;
  const hash = failureHash(result.stdout, result.stderr, result.exitCode);
  const remainingBudget = totalAttempts - attempts;
  const ambiguous = !hasOutput && remainingBudget <= 2;
  if (hash === lastHash && !ambiguous) {
   attempts = totalAttempts;
   break;
  }
  lastHash = hash;
  if (attempts < totalAttempts) {
   await sleep(backoffDelay(attempts, rand));
  }
 }
 return { passed: false, attempts, timedOut, outputTail };
}
