/**
 * test/agent-learning-review-gate.test.ts — learning.review gate contracts.
 *
 * Covers: isReviewGateEnabled truth table (env + file precedence via
 * PI_CODING_AGENT_DIR temp dirs), registerReviewGate message contents
 * (guidance + config note), and the prohibition on tool_call registration.
 */
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshDirsFromEnv } from "@oh-my-pi/pi-utils";
import {
	isReviewGateEnabled,
	LEARNING_GATE_CONFIG_NOTE,
	LEARNING_GATE_GUIDANCE,
	registerReviewGate,
} from "../plugins/agent-learning/src/review-gate.ts";

function fakeChainSchema(): any {
	const schema: Record<string, any> = {};
	for (const method of ["array", "boolean", "default", "describe", "int", "min", "number", "object", "optional", "string"]) {
		schema[method] = () => schema;
	}
	return schema;
}

function makePi(): { pi: any; events: string[]; handlers: Record<string, any> } {
	const events: string[] = [];
	const handlers: Record<string, any> = {};
	const pi = {
		zod: new Proxy({}, { get: () => () => fakeChainSchema() }),
		on(event: string, handler: any) {
			events.push(event);
			handlers[event] = handler;
		},
		registerTool(_tool: any) {
			// no-op
		},
		registerCommand(_name: string, _def: any) {
			// no-op
		},
	} as any;
	return { pi, events, handlers };
}

function withEnvVar(key: string, value: string | undefined, fn: () => void) {
	const prev = process.env[key];
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
	try {
		fn();
	} finally {
		if (prev === undefined) delete process.env[key];
		else process.env[key] = prev;
	}
}

function withTempAgentDir(fn: (agentDir: string) => void) {
	const agentDir = mkdtempSync(join(tmpdir(), "al-gate-"));
	const prevPiAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	refreshDirsFromEnv();
	try {
		fn(agentDir);
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
		if (prevPiAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = prevPiAgentDir;
		refreshDirsFromEnv();
	}
}

// ─── (a) isReviewGateEnabled truth table ─────────────────────────────────────

describe("agent-learning-review-gate: isReviewGateEnabled truth table", () => {
	it("env 1 | true | yes | on → true", () => {
		withEnvVar("LEARNING_REVIEW", undefined, () => {
			for (const val of ["1", "true", "yes", "on"]) {
				withEnvVar("LEARNING_REVIEW", val, () => {
					expect(isReviewGateEnabled()).toBe(true);
				});
			}
		});
	});

	it("'0' → false", () => {
		withEnvVar("LEARNING_REVIEW", "0", () => {
			expect(isReviewGateEnabled()).toBe(false);
		});
	});

	it("unset env + <agentDir>/agent-learning.json {review:true} → true", () => {
		withEnvVar("LEARNING_REVIEW", undefined, () => {
			withTempAgentDir((agentDir) => {
				writeFileSync(join(agentDir, "agent-learning.json"), JSON.stringify({ review: true }));
				expect(isReviewGateEnabled()).toBe(true);
			});
		});
	});

	it("unset env + malformed JSON → false", () => {
		withEnvVar("LEARNING_REVIEW", undefined, () => {
			withTempAgentDir((agentDir) => {
				writeFileSync(join(agentDir, "agent-learning.json"), "{ not valid json }}}");
				expect(isReviewGateEnabled()).toBe(false);
			});
		});
	});

	it("env wins over file (env 0 → false even when file has review:true)", () => {
		withTempAgentDir((agentDir) => {
			writeFileSync(join(agentDir, "agent-learning.json"), JSON.stringify({ review: true }));
			withEnvVar("LEARNING_REVIEW", "0", () => {
				expect(isReviewGateEnabled()).toBe(false);
			});
			withEnvVar("LEARNING_REVIEW", "1", () => {
				expect(isReviewGateEnabled()).toBe(true);
			});
		});
	});
});

// ─── (b) registerReviewGate stub ──────────────────────────────────────────

describe("agent-learning-review-gate: registerReviewGate", () => {
	it("gate ON: message contains both LEARNING_GATE_GUIDANCE AND config note with autolearn.autoContinue", async () => {
		const prev = process.env.LEARNING_REVIEW;
		process.env.LEARNING_REVIEW = "1";
		try {
			const { pi, events, handlers } = makePi();
			registerReviewGate(pi);

			// No tool_call registration
			expect(events).not.toContain("tool_call");
			expect(events).toEqual(["before_agent_start"]);

			const result = await handlers.before_agent_start({}, {});
			expect(result).toBeDefined();
			expect(result.message.customType).toBe("omp-agent-learning-gate");
			expect(result.message.display).toBe(false);
			// Both existing guidance text AND config note
			expect(result.message.content).toContain(LEARNING_GATE_GUIDANCE);
			expect(result.message.content).toContain(LEARNING_GATE_CONFIG_NOTE);
			expect(result.message.content).toContain("autolearn.autoContinue");
		} finally {
			if (prev === undefined) delete process.env.LEARNING_REVIEW;
			else process.env.LEARNING_REVIEW = prev;
		}
	});

	it("gate OFF: returns undefined (no message)", async () => {
		const prev = process.env.LEARNING_REVIEW;
		delete process.env.LEARNING_REVIEW;
		try {
			// Use manual temp dir handling to support async
			const { mkdtempSync: mkd, rmSync: rm } = await import("node:fs");
			const { tmpdir: td } = await import("node:os");
			const { join: j } = await import("node:path");
			const { refreshDirsFromEnv: r } = await import("@oh-my-pi/pi-utils");
			const agentDir = mkd(j(td(), "al-gate-"));
			const prevPiAgentDir = process.env.PI_CODING_AGENT_DIR;
			process.env.PI_CODING_AGENT_DIR = agentDir;
			r();
			try {
				const { pi, events, handlers } = makePi();
				registerReviewGate(pi);
				expect(events).not.toContain("tool_call");
				expect(events).toEqual(["before_agent_start"]);

				const result = await handlers.before_agent_start({}, {});
				expect(result).toBeUndefined();
			} finally {
				rm(agentDir, { recursive: true, force: true });
				if (prevPiAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
				else process.env.PI_CODING_AGENT_DIR = prevPiAgentDir;
				r();
			}
		} finally {
			if (prev === undefined) delete process.env.LEARNING_REVIEW;
			else process.env.LEARNING_REVIEW = prev;
		}
	});
});

// ─── (c) no tool_call registration ────────────────────────────────────────

describe("agent-learning-review-gate: no tool_call handler", () => {
	it("registerReviewGate registers only before_agent_start — never tool_call", () => {
		withEnvVar("LEARNING_REVIEW", "1", () => {
			const { pi, events } = makePi();
			registerReviewGate(pi);
			expect(events).not.toContain("tool_call");
			expect(events).toEqual(["before_agent_start"]);
		});
	});

	it("registerReviewGate registers only before_agent_start when gate OFF too", () => {
		withEnvVar("LEARNING_REVIEW", undefined, () => {
			withTempAgentDir(() => {
				const { pi, events } = makePi();
				registerReviewGate(pi);
				expect(events).not.toContain("tool_call");
				expect(events).toEqual(["before_agent_start"]);
			});
		});
	});
});
