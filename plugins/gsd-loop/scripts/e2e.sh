#!/usr/bin/env bash
# scripts/e2e.sh — WU-12 end-to-end proof (judge round 2: three-unit completion).
#
# In a temp cwd: enqueue 3 passing units + 1 verify-failing unit (maxRetries 1)
# LAST, drive start→advance→record via the plugin's own facade (host-free), run
# to terminal.
#
# Assertions:
#  1. unit-a/b/c complete, failing unit failed after exactly 1 retry
#     (verifyAttempts === 2), final run stopped on verify exhaustion
#  2. journal contains run-start → terminal with monotonic seq per flowId
#  3. .gsd-loop/loop.lock removed after terminal stop
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/gsd-loop-e2e-XXXXXX)"
DRIVER="$(mktemp /tmp/gsd-loop-e2e-driver-XXXXXX.ts)"
trap 'rm -rf "$TMP" "$DRIVER"' EXIT

export E2E_CWD="$TMP"
export PLUGIN_SRC="$PLUGIN_DIR/src"

cat > "$DRIVER" <<'EOF'
import assert from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
const { pathToFileURL } = await import("node:url");
const core = await import(pathToFileURL(process.env.PLUGIN_SRC + "/core.js").href);
const state = await import(pathToFileURL(process.env.PLUGIN_SRC + "/state.js").href);

const cwd = process.env.E2E_CWD!;
core.setFacadeContext({ cwd, hasUI: false });

console.log(core.doEnqueue({ id: "unit-a", title: "Passing unit", brief: "do A", verifyCommand: "true" }).text);
console.log(core.doEnqueue({ id: "unit-b", title: "Second passing unit", brief: "do B", verifyCommand: "true" }).text);
console.log(core.doEnqueue({ id: "unit-c", title: "Third passing unit", brief: "do C", verifyCommand: "true" }).text);
console.log(core.doEnqueue({ id: "unit-retry", title: "Failing unit", brief: "do R", verifyCommand: "false", maxRetries: 1 }).text);
console.log(core.doStart({}).text);

let guard = 0;
for (;;) {
	if (++guard > 30) throw new Error("E2E runaway guard: loop did not terminate in 30 turns");
	const advanced = core.doAdvance({});
	console.log("[advance]", advanced.text.split("\n")[0]);
	if (advanced.text.startsWith("STOPPED:")) break;
	const unit = (advanced.details as { unit: { id: string } }).unit.id;
	const recorded = await core.doRecordResult({ unitId: unit, status: "completed", summary: `did ${unit}` });
	console.log("[record]", recorded.text.split("\n")[0]);
	if (recorded.text.startsWith("STOPPED:")) break;
	// kernel retry semantics: a verify-failed unit goes back to pending; record
	// again WITHOUT advance (fresh attempt) — maxRetries 1 exhausts here.
	const snapshot = state.loadState(cwd)!;
	const pending = snapshot.queue.find((q) => q.id === unit);
	if (pending && pending.status === "pending" && snapshot.run.status === "running") {
		const r2 = await core.doRecordResult({ unitId: unit, status: "completed", summary: `did ${unit} (retry)` });
		console.log("[record]", r2.text.split("\n")[0]);
		if (r2.text.startsWith("STOPPED:")) break;
	}
}

const final = state.loadState(cwd)!;
console.log("final status:", final.run.status);
console.log("units:", final.queue.map((u) => `${u.id}:${u.status}:v${u.verifyAttempts}`).join(" "));

assert.equal(final.run.status, "stopped", `expected stopped on verify exhaustion, got ${final.run.status}`);
for (const id of ["unit-a", "unit-b", "unit-c"]) {
	const u = final.queue.find((q) => q.id === id)!;
	assert.equal(u.status, "complete", `${id} should be complete, got ${u.status}`);
}
const b = final.queue.find((u) => u.id === "unit-retry")!;
assert.equal(b.status, "failed", `unit-retry should be failed, got ${b.status}`);
assert.equal(b.verifyAttempts, 2, `unit-retry verifyAttempts should be exactly 2 (1 retry), got ${b.verifyAttempts}`);

const journal = state.readJournal(cwd);
const eventTypes = journal.map((e) => e.eventType);
assert.ok(eventTypes.includes("run-start"), "journal missing run-start");
assert.ok(eventTypes.includes("terminal"), "journal missing terminal");
const seqs = journal.map((e) => e.seq);
for (let i = 1; i < seqs.length; i++) {
	assert.ok(seqs[i] > seqs[i - 1], `journal seq not monotonic at ${i}: ${seqs[i - 1]} -> ${seqs[i]}`);
}

assert.equal(existsSync(`${cwd}/.gsd-loop/loop.lock`), false, "loop.lock should be removed after terminal stop");
console.log("E2E PASS: 3 units complete, retry unit failed after 1 retry, monotonic journal, lock released");
EOF

cd "$PLUGIN_DIR" && bun "$DRIVER"
