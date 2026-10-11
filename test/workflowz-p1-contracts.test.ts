import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
type RunExec = (command: string, args: string[], options: { cwd: string; timeout?: number }) => Promise<{ code: number; stdout: string; stderr: string; killed?: boolean; signal?: string }>;



/** Simulated Git environment for worktree tests: `git rev-parse` answers from
 *  the configured root, `git worktree list --porcelain` streams a fixture
 *  registry, and `git worktree add` materializes the sibling directory.
 *  No real Git binary is required — the identity/containment/
 *  symlink contracts are exercised against the parsed evidence. */
function structuredGitExec(root: string, entries: string[], options: { onAdd?: (target: string) => void } = {}): RunExec {
	const registry = entries.length > 0
		? entries.join("\n") + "\n"
		: `worktree ${root}\nHEAD 0123456789abcdef0123456789abcdef01234567\nbranch refs/heads/main\n\n`;
	return async (command, args, opts) => {
		if (command !== "git") return { code: 1, stdout: "", stderr: `unexpected command: ${command} ${args.join(" ")}` };
		if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
			if (opts.cwd === root || opts.cwd.startsWith(root + "/")) return { code: 0, stdout: `${opts.cwd}\n`, stderr: "" };
			return { code: 0, stdout: `${opts.cwd}\n`, stderr: "" };
		}
		if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "main\n", stderr: "" };
		if (args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
		if (args[0] === "worktree" && args[1] === "add") {
			const target = args[2]!;
			mkdirSync(target, { recursive: true });
			options.onAdd?.(target);
			return { code: 0, stdout: `Preparing worktree (checking out 'task/p1-isolation')\nHEAD is now at 0123456\n`, stderr: "" };
		}
		if (args[0] === "worktree" && args[1] === "remove") return { code: 0, stdout: "", stderr: "" };
		if (args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "0123456789abcdef0123456789abcdef01234567\n", stderr: "" };
		return { code: 0, stdout: "", stderr: "" };
	};
}

describe("workflowz P1 contracts", () => {
	test("scaffold persists user-supplied template input defaults", () => {
		const home = mkdtempSync(join(tmpdir(), "workflowz-p1-home-"));
		try {
			const script = `
				import { registerP0Tools } from "./plugins/extensible-workflows/src/p0-tools.ts";
				const tools = new Map();
				let schema;
				schema = new Proxy(() => schema, { get: (_target, property) => property === "then" ? undefined : schema, apply: () => schema });
				registerP0Tools({ zod: schema, exec: async () => ({ code: 0, stdout: "", stderr: "" }), registerTool: tool => tools.set(tool.name, tool) });
				const result = await tools.get("omp_workflow_scaffold").execute("scaffold", { kind: "recipe", templateName: "plan", targetName: "p1-plan", inputs: { context: "P1 recovery and isolation context" }, ownerIds: ["TASK-15.1"] }, undefined, undefined, { cwd: process.cwd(), hasUI: false });
				console.log(JSON.stringify(result));
			`;
			const child = spawnSync(process.execPath, ["-e", script], {
				cwd: process.cwd(),
				env: { ...process.env, HOME: home },
				encoding: "utf8",
			});
			expect(child.status).toBe(0);
			const result = JSON.parse(child.stdout) as { isError?: true; details: { workflow: { name: string; inputs: Record<string, { default?: string }> } } };
			expect(result.isError).toBeUndefined();
			expect(result.details.workflow.name).toBe("p1-plan");
			expect(result.details.workflow.inputs.context?.default).toBe("P1 recovery and isolation context");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("content-addresses equivalent nested GateFile definitions identically", async () => {
		const { draftGate, gateContentHash } = await import("../plugins/extensible-workflows/src/templates.ts");
		const gate = draftGate({
			id: "p1-gate",
			version: "1.0.0",
			description: "Verify P1 contracts",
			kind: "exec",
			executable: "echo",
			args: ["ok"],
			expect: { exitCode: 0, stdout: "ok" },
			createdBy: "llm",
		});
		const equivalent = { ...gate, expect: { stdout: "ok", exitCode: 0 } };
		expect(gateContentHash(equivalent)).toBe(gateContentHash(gate));
	});

	test("keeps builtin catalog definitions immutable across caller mutations", async () => {
		const { builtinTemplate, listBuiltinTemplates } = await import("../plugins/extensible-workflows/src/templates.ts");
		expect(listBuiltinTemplates()).toEqual(expect.arrayContaining(["plan", "fallow-health"]));
		const mutated = builtinTemplate("plan");
		expect(mutated).toBeDefined();
		mutated!.inputs.context!.default = "caller mutation";
		const fresh = builtinTemplate("plan");
		expect(fresh).not.toBe(mutated);
		expect(fresh!.inputs.context?.default).toBe("");
	});

	test("fails closed when persisted GateFile ownership or content integrity is invalid", async () => {
		const { draftGate, projectGatesDir, resolveGateFile } = await import("../plugins/extensible-workflows/src/templates.ts");
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p1-gates-"));
		const gate = (id: string) => draftGate({
			id,
			version: "1.0.0",
			description: "Verify P1 gate integrity",
			kind: "exec",
			executable: "echo",
			args: ["ok"],
			owners: ["TASK-15.1.1"],
		});
		try {
			const dir = projectGatesDir(cwd);
			mkdirSync(dir, { recursive: true });
			const malformedOwners = { ...gate("owner-shape"), owners: "TASK-15.1.1" };
			writeFileSync(join(dir, "owner-shape.json"), JSON.stringify(malformedOwners));
			const staleHash = { ...gate("stale-hash"), contentHash: "0".repeat(64) };
			writeFileSync(join(dir, "stale-hash.json"), JSON.stringify(staleHash));
			expect(resolveGateFile("owner-shape", cwd).error).toContain("owners");
			expect(resolveGateFile("stale-hash", cwd).error).toContain("content hash");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("refuses global same-version GateFile replacement while accepting an identical retry", () => {
		const home = mkdtempSync(join(tmpdir(), "workflowz-p1-gate-home-"));
		try {
			const script = `
				import { approveGate, draftGate, saveGateFile } from "./plugins/extensible-workflows/src/templates.ts";
				const makeGate = description => approveGate(draftGate({ id: "p1-global-gate", version: "1.0.0", description, kind: "exec", executable: "echo", args: ["ok"], owners: ["TASK-15.1.1"] }));
				const first = saveGateFile(makeGate("First definition"), "global", false, process.cwd());
				const identical = saveGateFile(makeGate("First definition"), "global", true, process.cwd());
				const changed = saveGateFile(makeGate("Changed definition"), "global", true, process.cwd());
				console.log(JSON.stringify({ first, identical, changed }));
			`;
			const child = spawnSync(process.execPath, ["-e", script], {
				cwd: process.cwd(),
				env: { ...process.env, HOME: home },
				encoding: "utf8",
			});
			expect(child.status).toBe(0);
			const result = JSON.parse(child.stdout) as { first: { created?: boolean }; identical: { created?: boolean }; changed: { error?: string } };
			expect(result.first.created).toBe(true);
			expect(result.identical.created).toBe(false);
			expect(result.changed.error).toContain("immutable");
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("routes document owners through document verification and refuses missing documents before scaffold writes", () => {
		const home = mkdtempSync(join(tmpdir(), "workflowz-p1-doc-owner-home-"));
		try {
			const script = `
				import { existsSync } from "node:fs";
				import { join } from "node:path";
				import { getAgentDir } from "@oh-my-pi/pi-utils";
				import { registerP0Tools } from "./plugins/extensible-workflows/src/p0-tools.ts";
				const tools = new Map();
				const calls = [];
				let schema;
				schema = new Proxy(() => schema, { get: (_target, property) => property === "then" ? undefined : schema, apply: () => schema });
				const exec = async (command, args) => {
					calls.push([command, args]);
					const validDocument = command === "backlog" && args[0] === "doc" && args[1] === "view" && args[2] === "doc-asset-owner";
					return validDocument ? { code: 0, stdout: "document", stderr: "" } : { code: 1, stdout: "", stderr: "document not found" };
				};
				registerP0Tools({ zod: schema, exec, registerTool: tool => tools.set(tool.name, tool) });
				const scaffold = tools.get("omp_workflow_scaffold");
				const context = { cwd: process.cwd(), hasUI: false };
				const valid = await scaffold.execute("valid-document-owner", { kind: "recipe", templateName: "plan", targetName: "document-owner-plan", ownerIds: ["doc-asset-owner"] }, undefined, undefined, context);
				const missing = await scaffold.execute("missing-document-owner", { kind: "recipe", templateName: "plan", targetName: "missing-document-plan", ownerIds: ["doc-missing-owner"] }, undefined, undefined, context);
				const missingPath = join(getAgentDir(), "workflows", "missing-document-plan.json");
				console.log(JSON.stringify({ valid, missing, calls, missingFile: existsSync(missingPath) }));
			`;
			const child = spawnSync(process.execPath, ["-e", script], {
				cwd: process.cwd(),
				env: { ...process.env, HOME: home },
				encoding: "utf8",
			});
			expect(child.status).toBe(0);
			const result = JSON.parse(child.stdout) as {
				valid: { isError?: true };
				missing: { isError?: true; details: { code?: string; ownerId?: string } };
				calls: Array<[string, string[]]>;
				missingFile: boolean;
			};
			expect(result.valid.isError).toBeUndefined();
			expect(result.calls).toContainEqual(["backlog", ["doc", "view", "doc-asset-owner", "--plain"]]);
			expect(result.calls).not.toContainEqual(["backlog", ["task", "view", "doc-asset-owner", "--plain"]]);
			expect(result.missing).toMatchObject({ isError: true, details: { code: "WORKFLOW_SCAFFOLD_OWNER_UNVERIFIED", ownerId: "doc-missing-owner" } });
			expect(result.missingFile).toBe(false);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("refuses a recipe whose persisted content hash no longer matches", async () => {
		const { contentHash, resolveWorkflowDefinition, saveWorkflowDefinition } = await import("../plugins/extensible-workflows/src/runtime.ts");
		const cwd = mkdtempSync(join(tmpdir(), "workflowz-p1-recipe-"));
		const definition = {
			schemaVersion: 2 as const,
			name: "tampered-recipe",
			description: "Verify persisted recipe integrity",
			inputs: {},
			stages: [{ id: "verify", label: "Verify", tasks: [{ id: "checker", prompt: "Verify" }], gates: [] }],
		};
		try {
			const persisted = { ...definition, contentHash: contentHash(definition) };
			const saved = saveWorkflowDefinition(persisted, "project", false, cwd);
			expect(saved.error).toBeUndefined();
			if (!saved.path) throw new Error("expected persisted recipe path");
			writeFileSync(saved.path, JSON.stringify({ ...persisted, description: "Tampered after save" }));
			const resolved = resolveWorkflowDefinition("tampered-recipe", cwd, "project");
			expect(resolved.workflow).toBeUndefined();
			expect(resolved.error?.details).toMatchObject({ code: "WORKFLOW_INVALID", message: "persisted contentHash does not match definition content" });
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("creates a sibling worktree on task/<name> from main and records branch/commit evidence", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-create-"));
		const root = join(parent, "repo");
		const target = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const calls: string[][] = [];
			const result = await resolveWorktree(root, async (command, args, options) => {
				calls.push([command, ...args]);
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: `worktree ${root}\nHEAD 0123456789abcdef0123456789abcdef01234567\nbranch refs/heads/main\n\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "add") { mkdirSync(target, { recursive: true }); return { code: 0, stdout: "Preparing worktree (new branch 'task/p1-isolation')\n", stderr: "" }; }
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "task/p1-isolation\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.state).toEqual({
				name: "p1-isolation",
				workspace: target,
				isolation: "worktree",
				manager: "git",
				gitCommit: "abc123def4567890abc123def4567890abc123de",
				gitBranch: "task/p1-isolation",
				reused: false,
			});
			expect(calls).toContainEqual(["git", "worktree", "add", target, "-b", "task/p1-isolation", "main"]);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("reattaches the preserved task branch after a prior worktree cleanup", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-reattach-"));
		const root = join(parent, "repo");
		const target = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const calls: string[][] = [];
			const result = await resolveWorktree(root, async (command, args, options) => {
				calls.push([command, ...args]);
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: `worktree ${root}\nHEAD 0123456789abcdef0123456789abcdef01234567\nbranch refs/heads/main\n\n`, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "add") { mkdirSync(target, { recursive: true }); return { code: 0, stdout: "Preparing worktree\n", stderr: "" }; }
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "task/p1-isolation\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.state).toMatchObject({ workspace: target, gitBranch: "task/p1-isolation", reused: false });
			expect(calls).toContainEqual(["git", "worktree", "add", target, "task/p1-isolation"]);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("accepts bare and detached porcelain records while resolving an isolation", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-porcelain-"));
		const root = join(parent, "repo");
		const detached = join(parent, "repo.detached");
		const target = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		mkdirSync(detached, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const registry = [`worktree ${root}`, "bare", "", `worktree ${detached}`, "HEAD abc123def4567890abc123def4567890abc123de", "detached", ""].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--verify") return { code: 1, stdout: "", stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "add") { mkdirSync(target, { recursive: true }); return { code: 0, stdout: "Preparing worktree\n", stderr: "" }; }
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "task/p1-isolation\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.state).toMatchObject({ workspace: target, gitBranch: "task/p1-isolation" });
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("reuses a locked exact registered branch/path worktree and validates its real git root", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-reuse-"));
		const root = join(parent, "repo");
		const workspace = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		mkdirSync(workspace, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const calls: string[][] = [];
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${workspace}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/task/p1-isolation",
				"locked",
				"",
			].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				calls.push([command, ...args]);
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "task/p1-isolation\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.state).toMatchObject({ workspace, isolation: "worktree", manager: "git", gitBranch: "task/p1-isolation", reused: true });
			expect(calls).not.toContainEqual(expect.arrayContaining(["git", "worktree", "add"]));
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("fails closed when a registered worktree changes branch before use", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-branch-drift-"));
		const root = join(parent, "repo");
		const workspace = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		mkdirSync(workspace, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${workspace}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/task/p1-isolation",
				"",
			].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "main\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.error).toContain("branch changed");
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("creates from main when the registry has no task/<name> entry despite a foreign branch", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-foreign-branch-"));
		const root = join(parent, "repo");
		const foreign = join(root, "nested", "foreign");
		mkdirSync(root, { recursive: true });
		mkdirSync(foreign, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${foreign}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/foreign",
				"",
			].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "add") { mkdirSync(join(parent, "repo.p1-isolation"), { recursive: true }); return { code: 0, stdout: "Preparing worktree (new branch 'task/p1-isolation')\n", stderr: "" }; }
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "task/p1-isolation\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "abc123def4567890abc123def4567890abc123de\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.state).toMatchObject({ workspace: join(parent, "repo.p1-isolation"), isolation: "worktree", manager: "git", gitBranch: "task/p1-isolation", reused: false });
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("cleans only the exact registered worktree and preserves the worker branch", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-cleanup-"));
		const root = join(parent, "repo");
		const workspace = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		mkdirSync(workspace, { recursive: true });
		try {
			const { cleanWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const calls: string[][] = [];
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${workspace}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/task/p1-isolation",
				"",
			].join("\n");
			const valid = await cleanWorktree(root, async (command, args, options) => {
				calls.push([command, ...args]);
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				if (command === "git" && args[0] === "status") return { code: 0, stdout: "## task/p1-isolation\n", stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "remove") return { code: 0, stdout: "", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, "p1-isolation");
			expect(valid.error).toBeUndefined();
			expect(calls).toContainEqual(["git", "worktree", "remove", workspace]);
			expect(calls.some(call => call.includes("branch") || call.includes("-d"))).toBe(false);
			// An unregistered foreign worktree is never removed.
			const foreignCalls: string[][] = [];
			const foreignRegistry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${join(root, "nested", "foreign")}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/foreign",
				"",
			].join("\n");
			const foreignResult = await cleanWorktree(root, async (command, args, options) => {
				foreignCalls.push([command, ...args]);
				if (command === "git" && args[0] === "worktree" && args[1] === "remove") return { code: 0, stdout: "", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: foreignRegistry, stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, "p1-isolation");
			expect(foreignResult.error).toBeUndefined();
			expect(foreignCalls.filter((call) => call[0] === "git" && call[1] === "worktree" && call[2] === "remove").length).toBe(0);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("refuses the repository root itself as an isolation location", async () => {
		const root = mkdtempSync(join(tmpdir(), "workflowz-p1-root-isolation-"));
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/task/p1-isolation",
				"",
			].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.error).toContain("escapes the repository");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("fails closed on a malformed git worktree registry", async () => {
		const root = mkdtempSync(join(tmpdir(), "workflowz-p1-git-malformed-"));
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			for (const payload of ["garbage without structure", ""]) {
				const result = await resolveWorktree(root, async (command, args, options) => {
					if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
					if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: payload, stderr: "" };
					return { code: 1, stdout: "", stderr: `unexpected ${command}` };
				}, { selected: true, name: "p1-isolation" });
				expect(result.error).toContain("invalid registry");
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses to clean a registered worktree with uncommitted changes", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-dirty-cleanup-"));
		const root = join(parent, "repo");
		const workspace = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		mkdirSync(workspace, { recursive: true });
		try {
			const { cleanWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const calls: string[][] = [];
			const registry = [`worktree ${root}`, "HEAD 0123456789abcdef0123456789abcdef01234567", "branch refs/heads/main", "", `worktree ${workspace}`, "HEAD abc123def4567890abc123def4567890abc123de", "branch refs/heads/task/p1-isolation", ""].join("\n");
			const result = await cleanWorktree(root, async (command, args, options) => {
				calls.push([command, ...args]);
				if (command === "git" && args[0] === "rev-parse") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				if (command === "git" && args[0] === "status") return { code: 0, stdout: "## task/p1-isolation\n M src/workflow.ts\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, "p1-isolation");
			expect(result.error).toContain("uncommitted changes");
			expect(calls).not.toContainEqual(["git", "worktree", "remove", workspace]);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("fails closed when a registered task branch uses a non-sibling path", async () => {
		const root = mkdtempSync(join(tmpdir(), "workflowz-p1-git-nested-"));
		const workspace = join(root, "nested", "p1-isolation");
		mkdirSync(workspace, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${workspace}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/task/p1-isolation",
				"",
			].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.error).toContain('does not match isolation "p1-isolation"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("refuses a symlink reported as the registered Git worktree isolation", async () => {
		const parent = mkdtempSync(join(tmpdir(), "workflowz-p1-git-symlink-"));
		const root = join(parent, "repo");
		const target = join(parent, "real-worktree");
		const workspace = join(parent, "repo.p1-isolation");
		mkdirSync(root, { recursive: true });
		mkdirSync(target, { recursive: true });
		symlinkSync(target, workspace);
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const registry = [
				`worktree ${root}`,
				"HEAD 0123456789abcdef0123456789abcdef01234567",
				"branch refs/heads/main",
				"",
				`worktree ${workspace}`,
				"HEAD abc123def4567890abc123def4567890abc123de",
				"branch refs/heads/task/p1-isolation",
				"",
			].join("\n");
			const result = await resolveWorktree(root, async (command, args, options) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${options!.cwd}\n`, stderr: "" };
				if (command === "git" && args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: registry, stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, { selected: true, name: "p1-isolation" });
			expect(result.error).toContain("symlink");
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("refuses a detached-HEAD workspace in the non-isolated Git path", async () => {
		const root = mkdtempSync(join(tmpdir(), "workflowz-p1-git-detached-"));
		mkdirSync(root, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const result = await resolveWorktree(root, async (command, args) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${root}\n`, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "HEAD\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, {});
			expect(result.error).toContain("detached");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("returns current workspace branch/commit evidence when isolation is not selected", async () => {
		const root = mkdtempSync(join(tmpdir(), "workflowz-p1-git-none-"));
		mkdirSync(root, { recursive: true });
		try {
			const { resolveWorktree } = await import("../plugins/extensible-workflows/src/worktree.ts");
			const result = await resolveWorktree(root, async (command, args) => {
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--show-toplevel") return { code: 0, stdout: `${root}\n`, stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { code: 0, stdout: "feature-auth\n", stderr: "" };
				if (command === "git" && args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: "fff111222333444555666777888999aaabbbcccc\n", stderr: "" };
				return { code: 1, stdout: "", stderr: `unexpected ${command}` };
			}, {});
			expect(result.state).toEqual({
				workspace: root,
				isolation: "none",
				manager: "git",
				gitCommit: "fff111222333444555666777888999aaabbbcccc",
				gitBranch: "feature-auth",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

});
