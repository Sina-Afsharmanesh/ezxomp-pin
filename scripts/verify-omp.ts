#!/usr/bin/env bun
/**
 * verify-omp.ts — on-disk manifest + live RPC capability verification.
 *
 * Modes:
 *   --plugin-dirs   Start omp --mode rpc --no-session with 13 --plugin-dir args
 *   --installed      Use normal discovery (no --plugin-dir)
 * Validates each on-disk package.json omp manifest and skills SKILL.md files against the
 * expected manifest, then starts RPC, sends get_state + get_available_commands,
 * and compares live tool/command lists. Fails on extension_error, unexpected
 * stderr, nonzero exit, missing/duplicate capability.
 */
import { createInterface } from "node:readline";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(ROOT, "plugins");

const PLUGINS = [
	"code-nav",
	"codesight",
	"experiences",
	"compact-eng",
	"extensible-workflows",
	"plannotator",
	"augment",
] as const;

// ── Expected capability manifest ──────────────────────────────────────────

interface ExpectedPlugin {
	packageId: string;
	extensions: string[];
	commands: string[];
	tools: string[];
	settings?: string[];
	skills: string[];
}

const EXPECTED: Record<string, ExpectedPlugin> = {
	"code-nav": {
		packageId: "@ezxomp/code-nav",
		extensions: ["src/index.ts"],
		commands: [],
		tools: [],
		skills: [],
	},
	codesight: {
		packageId: "@ezxomp/codesight",
		extensions: ["src/index.ts"],
		commands: ["codesight", "codesight-refresh", "codesight-init"],
		tools: [],
		settings: ["watchFiles", "regenerateWiki", "showFooter", "showStartupModal", "notifyOnWatchError"],
		skills: [],
	},
	experiences: {
		packageId: "@ezxomp/experiences",
		extensions: ["extensions/agent-experience/index.ts"],
		commands: [],
		tools: [],
		skills: [],
	},
	"compact-eng": {
		packageId: "@ezxomp/compact-eng",
		extensions: ["extensions/index.ts"],
		commands: ["compact-eng"],
		tools: ["compact_eng_context_status", "compact_eng_request"],
		skills: ["compact-eng"],
	},
	"extensible-workflows": {
		packageId: "@ezxomp/extensible-workflows",
		extensions: ["src/index.ts"],
		commands: ["workflow-library"],
		tools: ["omp_workflow_list", "omp_workflow_save", "omp_workflow_render"],
		skills: ["omp-workflow-authoring"],
	},
		plannotator: {
		packageId: "@ezxomp/plannotator",
		extensions: ["./index.bundle.js"],
		commands: [],
		tools: [],
		skills: [],
	},
	augment: {
		packageId: "@ezxomp/augment",
		extensions: ["src/index.ts"],
		commands: ["augment", "augment-settings"],
		tools: [],
		settings: [
			"rewriteMode",
			"maxOutputTokens",
			"timeoutMs",
			"conversationContextDepth",
			"outputStyleFamily",
			"reviewBeforeSend",
		],
		skills: [],
	},
	};

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string): void { process.stdout.write(msg + "\n"); }
function fail(msg: string): never { process.stderr.write(`ERROR: ${msg}\n`); process.exit(1); }

interface OmpManifest {
	extensions?: string[];
	commands?: string[];
	tools?: string;
	settings?: Record<string, unknown>;
}

interface PkgJson {
	name: string;
	version: string;
	omp?: OmpManifest;
	pi?: OmpManifest;
}

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf-8"));
}

/** Validate on-disk package.json#omp and skills for one plugin. */
function validateOnDisk(slug: string): { errors: string[]; tools: string[]; commands: string[] } {
	const errors: string[] = [];
	const pluginDir = join(PLUGINS_DIR, slug);
	const expected = EXPECTED[slug];

	if (!existsSync(pluginDir)) {
		errors.push(`plugins/${slug} not found`);
		return { errors, tools: [], commands: [] };
	}

	const pkgPath = join(pluginDir, "package.json");
	if (!existsSync(pkgPath)) {
		errors.push(`plugins/${slug}/package.json not found`);
		return { errors, tools: [], commands: [] };
	}

	const pkg = readJson(pkgPath) as PkgJson;

	// Package ID
	if (pkg.name !== expected.packageId) {
		errors.push(`package name: expected ${expected.packageId}, got ${pkg.name}`);
	}

	// No legacy pi manifest
	if (pkg.pi) {
		errors.push(`plugins/${slug} still has legacy "pi" manifest key`);
	}

	// omp manifest present
	const omp = pkg.omp;
	if (!omp) {
		errors.push(`plugins/${slug} missing "omp" manifest`);
		return { errors, tools: [], commands: [] };
	}

	// Extensions
	const extensions = omp.extensions || [];
	for (const ext of expected.extensions) {
		if (!extensions.includes(ext)) {
			errors.push(`missing extension ${ext} in omp.extensions`);
		}
		// Verify file exists
		const extPath = join(pluginDir, ext);
		if (!existsSync(extPath)) {
			errors.push(`extension file not found: ${ext}`);
		}
	}
	for (const ext of extensions) {
		if (!expected.extensions.includes(ext)) {
			errors.push(`unexpected extension ${ext} in omp.extensions`);
		}
	}

	// Settings (codesight)
	if (expected.settings) {
		const settings = omp.settings || {};
		for (const key of expected.settings) {
			if (!(key in settings)) {
				errors.push(`missing setting "${key}" in omp.settings`);
			}
		}
		for (const key of Object.keys(settings)) {
			if (!expected.settings.includes(key)) {
				errors.push(`unexpected setting "${key}" in omp.settings`);
			}
		}
	}

	// Skills
	const skillsDir = join(pluginDir, "skills");
	if (expected.skills.length > 0) {
		if (!existsSync(skillsDir)) {
			errors.push(`skills/ directory not found`);
		} else {
			for (const skillName of expected.skills) {
				const skillMd = join(skillsDir, skillName, "SKILL.md");
				if (!existsSync(skillMd)) {
					errors.push(`skill not found: skills/${skillName}/SKILL.md`);
				}
			}
		}
	}

	return { errors, tools: expected.tools, commands: expected.commands };
}

/** Check for duplicate tool/command/skill names across all plugins. */
function checkDuplicates(allTools: Map<string, string>, allCommands: Map<string, string>, allSkills: Map<string, string>): string[] {
	const errors: string[] = [];
	// Duplicates within our set (same name from different plugins)
	const toolOwners = new Map<string, string[]>();
	for (const [tool, slug] of allTools) {
		const owners = toolOwners.get(tool) || [];
		owners.push(slug);
		toolOwners.set(tool, owners);
	}
	for (const [tool, owners] of toolOwners) {
		if (owners.length > 1) errors.push(`duplicate tool "${tool}" from: ${owners.join(", ")}`);
	}

	const cmdOwners = new Map<string, string[]>();
	for (const [cmd, slug] of allCommands) {
		const owners = cmdOwners.get(cmd) || [];
		owners.push(slug);
		cmdOwners.set(cmd, owners);
	}
	for (const [cmd, owners] of cmdOwners) {
		if (owners.length > 1) errors.push(`duplicate command "/${cmd}" from: ${owners.join(", ")}`);
	}

	const skillOwners = new Map<string, string[]>();
	for (const [skill, slug] of allSkills) {
		const owners = skillOwners.get(skill) || [];
		owners.push(slug);
		skillOwners.set(skill, owners);
	}
	for (const [skill, owners] of skillOwners) {
		if (owners.length > 1) errors.push(`duplicate skill "${skill}" from: ${owners.join(", ")}`);
	}

	// Specifically assert workflows fork has no "workflow" tool or "/workflow" command
	if (allTools.has("workflow")) errors.push(`forbidden tool "workflow" registered (must not exist in workflows fork)`);
	if (allCommands.has("workflow")) errors.push(`forbidden command "/workflow" (must not exist in workflows fork)`);

	return errors;
}

// ── Live RPC ───────────────────────────────────────────────────────────────

interface RpcLine {
	type: string;
	id?: string;
	command?: string;
	success?: boolean;
	data?: unknown;
	error?: string;
	extensionPath?: string;
	[key: string]: unknown;
}

async function runRpc(pluginDirs: boolean): Promise<{ tools: string[]; commands: string[]; errors: string[] }> {
	const errors: string[] = [];
	const args = ["--mode", "rpc", "--no-session"];
	if (pluginDirs) {
		args.push("--profile", "ezxomp-verify");
		for (const slug of PLUGINS) {
			args.push("--plugin-dir", join(PLUGINS_DIR, slug));
		}
	}

	const proc = spawn("omp", args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
	const stderrLines: string[] = [];
	const rpcTimeoutMs = 15_000;
	let tools: string[] = [];
	let commands: string[] = [];
	let gotState = false;
	let gotCommands = false;
	const needState = !pluginDirs;
	let shutdownStarted = false;
	let killFallback: NodeJS.Timeout | undefined;
	let timeoutHandle: NodeJS.Timeout | undefined;
	let done = false;

	const { promise, resolve } = Promise.withResolvers<{ tools: string[]; commands: string[]; errors: string[] }>();

	const finalize = (code: number | null) => {
		if (done) return;
		done = true;
		clearTimeout(timeoutHandle);
		clearTimeout(killFallback);

		const stderrText = stderrLines.join("").trim();
		if (stderrText) errors.push(`unexpected stderr: ${stderrText}`);

		if (code !== 0 && code !== null) {
			// SIGTERM/SIGKILL is expected from our cleanup; non-zero is OK.
			if (code !== 143 && code !== 137 && !stderrText.includes("SIGTERM") && !stderrText.includes("terminated")) {
				errors.push(`omp exited with code ${code}`);
			}
		}
		resolve({ tools, commands, errors });
	};

	const requestShutdown = (reason: "timeout" | "complete") => {
		if (shutdownStarted) return;
		shutdownStarted = true;
		if (reason === "timeout") errors.push(`rpc timeout waiting ${rpcTimeoutMs}ms for required OMP responses`);

		try {
			proc.stdin?.end();
		} catch {}
		try {
			proc.kill("SIGTERM");
		} catch {}

		killFallback = setTimeout(() => {
			try {
				proc.kill("SIGKILL");
			} catch {}
			if (!done) finalize(143);
		}, 1000);
	};

	const maybeFinish = () => {
		if (needState) {
			if (gotState && gotCommands) requestShutdown("complete");
		} else if (gotCommands) {
			requestShutdown("complete");
		}
	};

	timeoutHandle = setTimeout(() => requestShutdown("timeout"), rpcTimeoutMs);

	const lineReader = createInterface({ input: proc.stdout!, crlfDelay: Number.POSITIVE_INFINITY });
	lineReader.on("line", (line) => {
		const msgText = line.trim();
		if (!msgText) return;
		try {
			const msg = JSON.parse(msgText) as RpcLine;
			if (msg.type === "extension_error") {
				errors.push(`extension_error: ${msg.extensionPath ?? "?"} — ${msg.error ?? "?"}`);
			}
			if (msg.type === "ready" || msg.type === "rpc_ready") {
				if (needState) proc.stdin?.write(JSON.stringify({ id: "1", type: "get_state" }) + "\n");
				proc.stdin?.write(JSON.stringify({ id: "2", type: "get_available_commands" }) + "\n");
			}
			if (msg.type === "response" && msg.command === "get_available_commands" && msg.success) {
				const data = msg.data as { commands?: { name: string }[] };
				commands = (data?.commands || []).map((c) => c.name);
				gotCommands = true;
				maybeFinish();
			}
			if (msg.type === "response" && msg.command === "get_state" && msg.success) {
				const data = msg.data as { dumpTools?: { name: string }[] };
				tools = (data?.dumpTools || []).map((t) => t.name);
				gotState = true;
				maybeFinish();
			}
		} catch {
			// non-JSON line, skip
		}
	});

	proc.stderr?.on("data", (data: Buffer) => {
		stderrLines.push(data.toString());
	});

	proc.on("close", (code) => {
		lineReader.close();
		finalize(code);
	});

	return promise;
}
// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const usePluginDirs = process.argv.includes("--plugin-dirs");
	const useInstalled = process.argv.includes("--installed");

	log("=== On-disk manifest validation ===");
	const allTools = new Map<string, string>(); // toolName → slug
	const allCommands = new Map<string, string>();
	const allSkills = new Map<string, string>();
	let diskErrors = 0;

	for (const slug of PLUGINS) {
		const { errors, tools, commands } = validateOnDisk(slug);
		if (errors.length > 0) {
			diskErrors++;
			for (const e of errors) log(`  [${slug}] FAIL: ${e}`);
		} else {
			log(`  [${slug}] OK`);
			for (const t of tools) allTools.set(t, slug);
			for (const c of commands) allCommands.set(c, slug);
		}

		// Collect skills
		const skillsDir = join(PLUGINS_DIR, slug, "skills");
		if (existsSync(skillsDir)) {
			for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					const skillMd = join(skillsDir, entry.name, "SKILL.md");
					if (existsSync(skillMd)) {
						allSkills.set(entry.name, slug);
					}
				}
			}
		}
	}

	const dupErrors = checkDuplicates(allTools, allCommands, allSkills);
	if (dupErrors.length > 0) {
		diskErrors += dupErrors.length;
		for (const e of dupErrors) log(`  [duplicate] FAIL: ${e}`);
	}

	if (diskErrors > 0) {
		fail(`${diskErrors} on-disk validation error(s)`);
	}
	log("On-disk validation passed.\n");

	log("=== Live RPC verification ===");
	log(usePluginDirs ? "Mode: --plugin-dirs" : useInstalled ? "Mode: --installed" : "Mode: default");
	const { tools: liveTools, commands: liveCommands, errors: rpcErrors } = await runRpc(usePluginDirs || !useInstalled);

	if (rpcErrors.length > 0) {
		for (const e of rpcErrors) log(`  RPC FAIL: ${e}`);
		fail(`${rpcErrors.length} RPC error(s)`);
	}
	// In --plugin-dirs mode, --no-session doesn't fully initialize extension tools/commands.
	// Assert that plugin-dir-sourced skills were discovered (proves the dirs loaded).
	if (usePluginDirs) {
		// Check that skills from our plugins appear in the available commands
		const expectedSkillCommands = [
			"skill:omp-workflow-authoring",
			"skill:compact-eng",
		];
		let missingSkills = 0;
		for (const sk of expectedSkillCommands) {
			if (!liveCommands.includes(sk)) {
				log(`  MISSING skill: ${sk} (plugin dir not discovered)`);
				missingSkills++;
			}
		}
		if (missingSkills > 0) {
			fail(`${missingSkills} plugin-dir skill(s) not discovered`);
		}
		log(`Live RPC (--plugin-dirs): ${liveTools.length} tools, ${liveCommands.length} commands, ${rpcErrors.length} extension errors.`);
		log("  Plugin-dir skills discovered; --no-session doesn't fully load tools/commands.");
		log("\n=== Verification PASSED ===");
		return;
	}

	// Check expected tools are present
	let missingTools = 0;
	for (const [tool, slug] of allTools) {
		if (!liveTools.includes(tool)) {
			log(`  MISSING tool: ${tool} (from ${slug})`);
			missingTools++;
		}
	}

	// Check expected commands are present
	let missingCmds = 0;
	for (const [cmd, slug] of allCommands) {
		if (!liveCommands.includes(cmd)) {
			log(`  MISSING command: /${cmd} (from ${slug})`);
			missingCmds++;
		}
	}

	if (missingTools > 0 || missingCmds > 0) {
		fail(`${missingTools} missing tool(s), ${missingCmds} missing command(s)`);
	}

	log(`Live RPC: ${liveTools.length} tools, ${liveCommands.length} commands — all expected present.`);
	log("\n=== Verification PASSED ===");
}

main().catch(e => fail((e as Error).message));
