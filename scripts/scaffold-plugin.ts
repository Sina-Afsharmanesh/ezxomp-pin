/**
 * scaffold-plugin.ts — Create a new OMP plugin scaffold inside this repo.
 *
 * Usage:
 *   bun run scripts/scaffold-plugin.ts <slug> [--description "..."] [--with-skills] [--with-hooks] [--with-tools] [--with-commands] [--with-mcp]
 *
 * Creates:
 *   plugins/<slug>/package.json          — OMP manifest with extensions
 *   plugins/<slug>/src/index.ts          — Extension factory skeleton
 *   plugins/<slug>/AGENTS.md             — DOX child doc
 *   plugins/<slug>/LICENSE               — Apache-2.0 license from the repository root
 *   plugins/<slug>/README.md             — Plugin readme
 *   plugins/<slug>/.gitignore
 *   plugins/<slug>/skills/<name>/SKILL.md — (if --with-skills)
 *   plugins/<slug>/hooks/pre/Bash.sh      — (if --with-hooks)
 *   plugins/<slug>/commands/<name>.md     — (if --with-commands)
 *   plugins/<slug>/.mcp.json             — empty, safe MCP configuration (if --with-mcp)
 *
 * `--with-tools` registers a placeholder tool directly in src/index.ts.
 * The script also registers the plugin in .omp-plugin/marketplace.json and
 * adds its AGENTS.md to the root Child DOX Index.
 *
 * Validation: run `bun run scripts/verify-scaffold.ts <slug>` after scaffolding.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(ROOT, "plugins");
const MARKETPLACE = join(ROOT, ".omp-plugin", "marketplace.json");
const ROOT_AGENTS = join(ROOT, "AGENTS.md");
const ROOT_LICENSE = join(ROOT, "LICENSE");
const DEFAULT_DESCRIPTION = "TODO: describe this plugin.";
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

interface Args {
	slug: string;
	description: string;
	withSkills: boolean;
	withHooks: boolean;
	withTools: boolean;
	withCommands: boolean;
	withMcp: boolean;
}

type JsonObject = Record<string, unknown>;
type Marketplace = JsonObject & { plugins: JsonObject[] };

function exitWithError(message: string): never {
	process.stderr.write(`ERROR: ${message}\n`);
	process.exit(1);
}

function isRecord(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const slug = argv[0];
	if (!slug || slug.startsWith("-")) {
		exitWithError("Usage: bun run scripts/scaffold-plugin.ts <slug> [--description \"...\"] [--with-skills] [--with-hooks] [--with-tools] [--with-commands] [--with-mcp]");
	}
	if (!SLUG_PATTERN.test(slug)) {
		exitWithError(`slug "${slug}" must match /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/ (lowercase alphanumerics, hyphens, dots; must start/end alphanumeric)`);
	}

	const args: Args = {
		slug,
		description: DEFAULT_DESCRIPTION,
		withSkills: false,
		withHooks: false,
		withTools: false,
		withCommands: false,
		withMcp: false,
	};
	let hasDescription = false;

	for (let index = 1; index < argv.length; index += 1) {
		const argument = argv[index];
		switch (argument) {
			case "--description": {
				if (hasDescription) exitWithError("--description may only be provided once");
				const value = argv[index + 1]?.trim();
				if (!value || value.startsWith("--") || value.includes("\n")) {
					exitWithError("--description requires a non-empty, single-line value");
				}
				args.description = value;
				hasDescription = true;
				index += 1;
				break;
			}
			case "--with-skills":
				args.withSkills = true;
				break;
			case "--with-hooks":
				args.withHooks = true;
				break;
			case "--with-tools":
				args.withTools = true;
				break;
			case "--with-commands":
				args.withCommands = true;
				break;
			case "--with-mcp":
				args.withMcp = true;
				break;
			default:
				exitWithError(`unknown option "${argument}"`);
		}
	}

	return args;
}

function readMarketplace(): Marketplace {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(MARKETPLACE, "utf-8"));
	} catch (error) {
		exitWithError(`could not read ${MARKETPLACE}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!isRecord(parsed) || !Array.isArray(parsed.plugins) || parsed.plugins.some(entry => !isRecord(entry))) {
		exitWithError("marketplace.json has no valid \"plugins\" array");
	}
	return parsed as Marketplace;
}

function readRootLicense(): string {
	let license: string;
	try {
		license = readFileSync(ROOT_LICENSE, "utf-8");
	} catch (error) {
		exitWithError(`could not read ${ROOT_LICENSE}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!license.includes("Apache License")) {
		exitWithError(`${ROOT_LICENSE} must contain the Apache License before scaffolding Apache-2.0 plugins`);
	}
	return license;
}

function updatedDoxIndex(slug: string): string {
	let source: string;
	try {
		source = readFileSync(ROOT_AGENTS, "utf-8");
	} catch (error) {
		exitWithError(`could not read ${ROOT_AGENTS}: ${error instanceof Error ? error.message : String(error)}`);
	}

	const heading = "## Child DOX Index";
	const headingIndex = source.indexOf(heading);
	if (headingIndex < 0) exitWithError(`${ROOT_AGENTS} has no ${heading} section`);

	const entry = `- \`plugins/${slug}/AGENTS.md\` — ${slug} OMP plugin.`;
	const sectionEnd = source.indexOf("\n## ", headingIndex + heading.length);
	const end = sectionEnd < 0 ? source.length : sectionEnd;
	if (source.slice(headingIndex, end).includes(entry)) return source;

	const before = `${source.slice(0, end).replace(/\n*$/, "\n")}${entry}\n`;
	return `${before}${source.slice(end)}`;
}

function log(message: string): void {
	process.stdout.write(`${message}\n`);
}

function writeNew(path: string, content: string, mode?: number): void {
	writeFileSync(path, content, "utf-8");
	if (mode !== undefined) chmodSync(path, mode);
	log(`  CREATE: ${path}`);
}

function extensionSource(args: Args): string {
	const apiName = args.withTools || args.withCommands ? "pi" : "_pi";
	const toolName = args.slug.replace(/[.-]/g, "_");
	const tool = args.withTools ? `
	pi.registerTool({
		name: "${toolName}_hello",
		label: "${args.slug} Hello",
		description: "A placeholder tool",
		parameters: pi.zod.object({
			name: pi.zod.string().describe("Name to greet"),
		}),
		async execute(_id, params) {
			return {
				content: [{ type: "text", text: \`Hello, \${params.name}!\` }],
				details: { name: params.name },
			};
		},
	});
` : "";
	const command = args.withCommands ? `
	pi.registerCommand("${args.slug}", {
		description: "Placeholder command",
		handler: async (_args, ctx) => {
		ctx.ui.notify("${args.slug} command invoked", "info");
		},
	});
` : "";

	return `import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

/**
 * ${args.slug} — OMP extension entry point.
 *
 * Register tools, commands, and event handlers here. Do not perform runtime
 * actions during load; use registered handlers, tools, or commands instead.
 *
 * @see https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md
 * @see https://github.com/can1357/oh-my-pi/blob/main/docs/skills/authoring-extensions.md
 */
export default function extension(${apiName}: ExtensionAPI): void {${tool}${command}}
`;
}

function agentsSource(args: Args): string {
	const capabilities = [
		args.withSkills ? "- `skills/` — auto-discovered skills" : "",
		args.withHooks ? "- `hooks/` — pre/post tool hooks" : "",
		args.withTools ? "- `src/index.ts` — placeholder LLM tool registration" : "",
		args.withCommands ? "- `commands/` — slash commands" : "",
		args.withMcp ? "- `.mcp.json` — MCP server configuration" : "",
	].filter(Boolean).join("\n");

	return `# ${args.slug}

## Purpose

${args.description}

## Ownership

- \`src/index.ts\` — extension entry point (omp.extensions)
${capabilities ? `${capabilities}\n` : ""}
## Local Contracts

- \`package.json#omp.extensions\` must list \`src/index.ts\`
- Extension modules use \`ExtensionAPI\` from \`@oh-my-pi/pi-coding-agent\`
- Peer-depend on \`@oh-my-pi/*\` packages, never bundle them

## Work Guidance

## Verification

\`\`\`bash
bun run scripts/verify-scaffold.ts ${args.slug}
\`\`\`

## Child DOX Index
`;
}

function readmeSource(args: Args): string {
	const mcpGuidance = args.withMcp ? `
## MCP configuration

\`.mcp.json\` starts with no servers. Add only trusted, pinned MCP server commands before enabling it.
` : "";
	return `# ${args.slug}

${args.description}

## Install

\`\`\`bash
omp plugin marketplace add ~/repo/ezxomp
omp plugin install ${args.slug}@ezxomp --scope user
\`\`\`

## Development

\`\`\`bash
bun run scripts/verify-scaffold.ts ${args.slug}
\`\`\`
${mcpGuidance}`;
}

function scaffoldPlugin(args: Args): void {
	const dir = join(PLUGINS_DIR, args.slug);
	if (existsSync(dir)) exitWithError(`plugins/${args.slug} already exists`);

	const marketplace = readMarketplace();
	if (marketplace.plugins.some(entry => entry.name === args.slug)) {
		exitWithError(`marketplace already registers "${args.slug}"`);
	}
	const license = readRootLicense();
	const rootAgents = updatedDoxIndex(args.slug);

	const files = ["src", "AGENTS.md", "LICENSE", "README.md"];
	if (args.withSkills) files.push("skills");
	if (args.withHooks) files.push("hooks");
	if (args.withCommands) files.push("commands");
	if (args.withMcp) files.push(".mcp.json");
	const pkg = {
		name: `@ezxomp/${args.slug}`,
		version: "0.1.0-ezxomp.0",
		description: args.description,
		type: "module",
		license: "Apache-2.0",
		keywords: ["omp-package"],
		files,
		publishConfig: { access: "public" },
		omp: { extensions: ["src/index.ts"] },
		peerDependencies: { "@oh-my-pi/pi-coding-agent": "17.3.8" },
	};

	log(`Scaffolding plugin: ${args.slug}`);
	mkdirSync(join(dir, "src"), { recursive: true });
	writeNew(join(dir, "package.json"), `${JSON.stringify(pkg, null, "\t")}\n`);
	writeNew(join(dir, "src", "index.ts"), extensionSource(args));
	writeNew(join(dir, "AGENTS.md"), agentsSource(args));
	writeNew(join(dir, "LICENSE"), license);
	writeNew(join(dir, "README.md"), readmeSource(args));
	writeNew(join(dir, ".gitignore"), "node_modules/\ndist/\n*.log\n.env\n");

	if (args.withSkills) {
		mkdirSync(join(dir, "skills", "my-skill"), { recursive: true });
		writeNew(
			join(dir, "skills", "my-skill", "SKILL.md"),
			"---\nname: my-skill\ndescription: TODO: describe what this skill does and when to use it.\n---\n\n# My Skill\n\nTODO: skill instructions here.\n",
		);
	}
	if (args.withHooks) {
		mkdirSync(join(dir, "hooks", "pre"), { recursive: true });
		writeNew(
			join(dir, "hooks", "pre", "Bash.sh"),
			"#!/usr/bin/env sh\n# TODO: implement this pre-Bash hook. Exit 0 to allow, exit 1 to block.\nexit 0\n",
			0o755,
		);
	}
	if (args.withCommands) {
		mkdirSync(join(dir, "commands"), { recursive: true });
		writeNew(
			join(dir, "commands", `${args.slug}.md`),
			`---\nname: ${args.slug}\ndescription: TODO: describe this command.\n---\n\nTODO: command prompt body here.\n`,
		);
	}
	if (args.withMcp) {
		writeNew(join(dir, ".mcp.json"), `${JSON.stringify({ mcpServers: {} }, null, "\t")}\n`);
	}

	marketplace.plugins.push({
		name: args.slug,
		source: `./plugins/${args.slug}`,
		description: args.description,
		version: "0.1.0-ezxomp.0",
		attribution: "Created by ezxomp scaffold.",
	});
	writeFileSync(ROOT_AGENTS, rootAgents, "utf-8");
	writeFileSync(MARKETPLACE, `${JSON.stringify(marketplace, null, "\t")}\n`, "utf-8");
	log("  UPDATE: " + ROOT_AGENTS);
	log("  UPDATE: " + MARKETPLACE);

	log("\nDone. Next steps:");
	log(`  1. cd plugins/${args.slug} && edit src/index.ts`);
	log(`  2. bun run scripts/verify-scaffold.ts ${args.slug}`);
	log(`  3. omp plugin marketplace add ${ROOT} --force`);
	log(`  4. omp plugin install ${args.slug}@ezxomp --scope user`);
}

scaffoldPlugin(parseArgs());
