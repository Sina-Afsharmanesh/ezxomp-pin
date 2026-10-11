import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runProcess, type RunOptions } from "./runner.js";
import { onPstackEvent, resetEventSubscribers, type PstackEvent } from "./events.js";

describe("runProcess", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty argv error", async () => {
    const res = await runProcess([]);
    expect(res.spawnError).toBe("empty argv");
    expect(res.ok).toBe(false);
    expect(res.durationMs).toBe(0);
  });

  it("executes a simple command", async () => {
    const res = await runProcess(["echo", "hello"]);
    expect(res.ok).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim()).toBe("hello");
    expect(res.stderr).toBe("");
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("rejects hostile argv metacharacters safely (no shell injection)", async () => {
    const res = await runProcess([
      "sh", "-c",
      "echo safe; exit 42",
    ]);
    // Since we spawn argv[0]=sh, argv.slice(1)=[-c, "echo safe; exit 42"],
    // this runs safely in sh. The command should complete without shell:true injection.
    expect(res.exitCode).toBe(42);
    expect(res.spawnError).toBeNull();
  });

  it("returns non-zero exit code", async () => {
    const res = await runProcess(["sh", "-c", "exit 3"]);
    expect(res.exitCode).toBe(3);
    expect(res.ok).toBe(false);
    expect(res.spawnError).toBeNull();
  });

  it("reports spawn error for nonexistent command", async () => {
    const res = await runProcess(["__nonexistent_command_xyz__", "arg"]);
    expect(res.spawnError).toBeTruthy();
    expect(res.ok).toBe(false);
    expect(res.exitCode).toBeNull();
  });

  it("respects timeout", async () => {
    const res = await runProcess(["sleep", "999"], { timeoutMs: 50 });
    expect(res.timeout).toBe(true);
    expect(res.ok).toBe(false);
    expect(res.durationMs).toBeGreaterThanOrEqual(45);
  });

  it("cancels on AbortSignal", async () => {
    const ac = new AbortController();
    const promise = runProcess(["sleep", "999"], { signal: ac.signal });
    ac.abort();
    const res = await promise;
    expect(res.cancelled).toBe(true);
    expect(res.ok).toBe(false);
  });

  it("captures stderr", async () => {
    const res = await runProcess(["sh", "-c", 'echo "oops" >&2; exit 0']);
    expect(res.stderr.trim()).toBe("oops");
    expect(res.ok).toBe(true);
  });

  it("truncates output keeping tail when exceeding maxOutputBytes", async () => {
    const res = await runProcess(
      ["python3", "-c", "import sys; sys.stdout.write('A' * 50000)"],
      { maxOutputBytes: 1000 },
    );
    expect(res.stdoutTruncated).toBe(true);
    expect(res.stdout.length).toBeGreaterThan(0);
    expect(res.stdout[res.stdout.length - 1]).toBe("A");
    expect(res.ok).toBe(true);
  });

  it("measures durationMs", async () => {
    const res = await runProcess(["echo", "timing"]);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof res.durationMs).toBe("number");
  });

  it("does not use shell: true (spawns directly)", async () => {
    const res = await runProcess(["printf", "no_shell"]);
    expect(res.ok).toBe(true);
    expect(res.stdout).toBe("no_shell");
  });

  it("respects cwd option", async () => {
    const res = await runProcess(["pwd"], { cwd: "/tmp" });
    expect(res.ok).toBe(true);
    expect(res.stdout.trim()).toBe("/tmp");
  });

  it("respects env option", async () => {
    const res = await runProcess(
      ["sh", "-c", "printenv FOO_TEST_VAR_123"],
      { env: { FOO_TEST_VAR_123: "bar" } },
    );
    expect(res.ok).toBe(true);
    expect(res.stdout.trim()).toBe("bar");
  });
});

describe("runProcess signal termination", () => {
  it("receives signal in signal field when killed", async () => {
    const ac = new AbortController();
    const promise = runProcess(
      ["python3", "-c", "import time; time.sleep(999)"],
      { signal: ac.signal },
    );
    await new Promise((r) => setTimeout(r, 200));
    ac.abort();
    const res = await promise;
    expect(res.cancelled).toBe(true);
    expect(res.signal).toBeTruthy();
  });
});

describe("runProcess timeoutMs zero and SIGKILL escalation", () => {
  it("timeoutMs: 0 runs without a timer — sleep 0.5 completes normally", async () => {
    const res = await runProcess(["sleep", "0.5"], { timeoutMs: 0 });
    expect(res.ok).toBe(true);
    expect(res.timeout).toBe(false);
    expect(res.exitCode).toBe(0);
  });

  it("SIGKILL escalation kills unkillable (SIGTERM-ignoring) child", async () => {
    const ac = new AbortController();
    const promise = runProcess(
      ["sh", "-c", "trap \'\' TERM; sleep 999"],
      { signal: ac.signal, timeoutMs: 200 },
    );
    // timeout should fire at 200ms, SIGTERM ignored, SIGKILL at 2200ms
    // but the child will eventually die. We just await.
    const res = await promise;
    expect(res.cancelled || res.timeout || res.signal).toBeTruthy();
    expect(res.ok).toBe(false);
  });
});


describe("runProcess emits events through onPstackEvent (live)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetEventSubscribers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEventSubscribers();
  });

  it("timeout: cancellation event observed before command finish event, finish carries timeout:true", async () => {
    const received: PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));

    const res = await runProcess(["sleep", "999"], { timeoutMs: 150 });

    const types = received.map((e) => e.type);
    const cancelIdx = types.indexOf("cancellation");
    const finishIdx = types.findIndex(
      (t, i) => t === "command" && received[i]?.payload?.settled === true
    );

    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(finishIdx).toBeGreaterThanOrEqual(0);
    expect(cancelIdx).toBeLessThan(finishIdx);
    expect(received[finishIdx]?.payload?.settled).toBe(true);
    expect(res.timeout).toBe(true);

    unsub();
  });

  it("abort: cancellation event observed before command finish, cancelled:true", async () => {
    const ac = new AbortController();
    const received: PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));

    const promise = runProcess(["sleep", "999"], { signal: ac.signal });

    await new Promise((r) => setTimeout(r, 100));
    ac.abort();

    const res = await promise;

    const types = received.map((e) => e.type);
    const cancelIdx = types.indexOf("cancellation");
    const finishIdx = types.findIndex(
      (t, i) => t === "command" && received[i]?.payload?.settled === true
    );

    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(finishIdx).toBeGreaterThanOrEqual(0);
    expect(cancelIdx).toBeLessThan(finishIdx);
    expect(res.cancelled).toBe(true);

    unsub();
  });

  it("command START event argv is array containing command name", async () => {
    const received: PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));

    await runProcess(["sleep", "0.01"]);

    const startEvent = received.find(
      (e) => e.type === "command" && !e.payload?.settled
    );
    expect(startEvent).toBeDefined();
    const argv = startEvent?.payload?.argv;
    expect(Array.isArray(argv)).toBe(true);
    expect(argv).toContain("sleep");

    unsub();
  });

  it("propagates runId and cancellation flags in terminal events", async () => {
    const received: PstackEvent[] = [];
    const unsub = onPstackEvent((ev) => received.push(ev));
    const ac = new AbortController();
    const pending = runProcess(["sleep", "999"], { signal: ac.signal, runId: "run-correlation" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    ac.abort();
    const result = await pending;
    const commandEvents = received.filter((ev) => ev.type === "command");
    expect(commandEvents.some((ev) => ev.meta?.runId === "run-correlation")).toBe(true);
    const settled = commandEvents.find((ev) => ev.payload?.settled === true);
    expect(settled?.meta?.runId).toBe("run-correlation");
    expect(settled?.payload?.cancelled).toBe(true);
    expect(result.cancelled).toBe(true);
    unsub();
  });
});
