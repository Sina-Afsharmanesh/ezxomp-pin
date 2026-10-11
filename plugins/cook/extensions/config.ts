import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import yaml from "../vendor/js-yaml.mjs";
import { CONFIG_FILE, ROLE_FILE_MAP, ROLES } from "./constants.ts";
import type { Role } from "./constants.ts";
import type { ModelConfig, ModelEntry } from "./types.ts";

export type CookConfigScope = "project" | "personal" | "global";

export interface CookConfigScopeInfo {
	scope: CookConfigScope;
	directory: string;
	exists: boolean;
}

export interface CookConfigSource {
	scope: CookConfigScope | "legacy";
	path: string;
	role: Role;
}

export interface ResolvedCookConfig {
	config: ModelConfig;
	scope: CookConfigScope;
	writeScope: CookConfigScope;
	writeDirectory: string;
	sources: Partial<Record<Role, CookConfigSource>>;
	fallback: "project" | "personal" | "global" | "legacy" | "inheritance";
	warnings: string[];
}

export interface ModelValidation {
	valid: boolean;
	value: string;
	entry?: ModelEntry;
	reason?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export function defaultModelConfig(): ModelConfig {
	return { planner: null, scout: null, researcher: null, worker: null, validator: null, judge: null };
}

function configPathFor(cwd: string): string {
	return join(cwd, CONFIG_FILE);
}

function profileName(role: Role): string {
	return ROLE_FILE_MAP[`cook-${role}`] ?? `cook-${role}.md`;
}

function profilePath(directory: string, role: Role): string {
	return join(directory, profileName(role));
}

function ompHome(): string {
	return process.env.OMP_HOME ?? join(process.env.HOME ?? "~", ".omp");
}

/** Nearest ancestor directory (including cwd) that has a .omp/agents profile directory. */
function nearestProjectProfileDirectory(cwd: string): string {
	let current = resolve(cwd);
	for (;;) {
		const candidate = join(current, ".omp", "agents");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return join(resolve(cwd), ".omp", "agents");
}

export function getCookConfigScope(cwd: string, scope: CookConfigScope): CookConfigScopeInfo {
	const directory =
		scope === "project"
			? nearestProjectProfileDirectory(cwd)
			: scope === "personal"
				? join(ompHome(), "agents")
				: join(ompHome(), "agent", "agents");
	return { scope, directory, exists: ROLES.some((role) => existsSync(profilePath(directory, role))) };
}

function readLegacyConfig(cwd: string): ModelConfig | null {
	try {
		const path = configPathFor(cwd);
		if (!existsSync(path)) return null;
		const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
		const config = defaultModelConfig();
		for (const role of ROLES) {
			const value = raw[role];
			if (typeof value === "string" && value.trim()) config[role] = value;
			else if (value === null) config[role] = null;
		}
		return config;
	} catch {
		return null;
	}
}

interface ParsedProfile {
	frontmatter: Record<string, unknown>;
	body: string;
	newline: "\n" | "\r\n";
}

function parseProfile(content: string): ParsedProfile | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return null;
	try {
		const loaded = yaml.load(match[1] ?? "");
		const frontmatter = loaded && typeof loaded === "object" && !Array.isArray(loaded) ? (loaded as Record<string, unknown>) : {};
		return { frontmatter, body: content.slice(match[0].length), newline: content.includes("\r\n") ? "\r\n" : "\n" };
	} catch {
		return null;
	}
}

function profileModel(parsed: ParsedProfile): string | null {
	const model = parsed.frontmatter.model;
	if (typeof model === "string" && model.trim()) return model.trim();
	if (Array.isArray(model)) {
		const first = model.find((value): value is string => typeof value === "string" && value.trim().length > 0);
		if (first) return first.trim();
	}
	return null;
}

function readProfileModel(path: string): { model: string | null; warning?: string } | null {
	if (!existsSync(path)) return null;
	try {
		const parsed = parseProfile(readFileSync(path, "utf-8"));
		if (!parsed) return { model: null, warning: `Cook profile has invalid frontmatter: ${path}` };
		return { model: profileModel(parsed) };
	} catch {
		return { model: null, warning: `Cook profile could not be read: ${path}` };
	}
}

/**
 * One authoritative resolution path for both /cook config and cook_config:
 * per-role project .omp/agents -> personal OMP_HOME/agents -> global
 * OMP_HOME/agent/agents, legacy backlog/cook-config.json read last. A profile
 * without a model key explicitly inherits the session model and stops fallback
 * (deliberate null), while a missing profile continues down the ladder.
 */
export function resolveCookConfig(cwd: string, requestedScope?: CookConfigScope): ResolvedCookConfig {
	const scope = requestedScope ?? "project";
	const searchScopes: CookConfigScope[] = requestedScope ? [requestedScope] : ["project", "personal", "global"];
	const config = defaultModelConfig();
	const sources: Partial<Record<Role, CookConfigSource>> = {};
	const warnings: string[] = [];
	let fallback: ResolvedCookConfig["fallback"] = "inheritance";
	const legacy = requestedScope ? null : readLegacyConfig(cwd);
	for (const role of ROLES) {
		let found = false;
		for (const candidateScope of searchScopes) {
			const path = profilePath(getCookConfigScope(cwd, candidateScope).directory, role);
			const profile = readProfileModel(path);
			if (!profile) continue;
			if (profile.warning) warnings.push(profile.warning);
			config[role] = profile.model;
			sources[role] = { scope: candidateScope, path, role };
			if (candidateScope !== "project") fallback = candidateScope;
			found = true;
			break;
		}
		if (!found && legacy) {
			config[role] = legacy[role];
			sources[role] = { scope: "legacy", path: configPathFor(cwd), role };
			if (legacy[role] !== null) fallback = "legacy";
		}
	}
	const writeScope = requestedScope ?? "project";
	return { config, scope, writeScope, writeDirectory: getCookConfigScope(cwd, writeScope).directory, sources, fallback, warnings };
}

export function loadModelConfig(cwd: string, scope?: CookConfigScope): ModelConfig {
	return resolveCookConfig(cwd, scope).config;
}

/** Shipped profile template used to seed a missing project profile. */
function profileTemplate(role: Role): string {
	try {
		const templatePath = join(__dirname, "..", "agents", profileName(role));
		if (existsSync(templatePath)) return readFileSync(templatePath, "utf-8");
	} catch {}
	return `---\nname: cook-${role}\n---\n`;
}

function updateProfile(directory: string, role: Role, model: string | null): string {
	const path = profilePath(directory, role);
	const existing = existsSync(path) ? readFileSync(path, "utf-8") : undefined;
	const source = existing ?? profileTemplate(role);
	const parsed = parseProfile(source);
	if (!parsed) throw new Error(`Cook profile has invalid frontmatter and was not modified: ${path}`);
	if (model === null) delete parsed.frontmatter.model;
	else parsed.frontmatter.model = model;
	const fm = yaml.dump(parsed.frontmatter).replace(/\n$/, "");
	return `---\n${fm}\n---${parsed.body.replace(/^\r?\n/, "\n")}`;
}

/**
 * Persist model assignments. Default write scope is the active project;
 * explicit personal/global only when requested. Never falls through scopes
 * silently. Preserves existing frontmatter and body; seeds the shipped
 * template when the project profile does not exist yet.
 */
export function saveModelConfig(cwd: string, config: ModelConfig, scope?: CookConfigScope): CookConfigScopeInfo {
	const info = getCookConfigScope(cwd, scope ?? "project");
	mkdirSync(info.directory, { recursive: true });
	for (const role of ROLES) {
		const path = profilePath(info.directory, role);
		const existing = existsSync(path) ? readFileSync(path, "utf-8") : undefined;
		const content = updateProfile(info.directory, role, config[role]);
		writeFileSync(path, content);
	}
	return { ...info, exists: true };
}

/**
 * Dynamically resolved model list grouped by provider family. No hardcoded
 * provider allowlist: unknown providers fall back to a normalized raw label.
 */
export function listModels(ctx: ExtensionContext): ModelEntry[] {
	const models = ctx.models.list();
	const idCounts = new Map<string, number>();
	for (const m of models) idCounts.set(m.id, (idCounts.get(m.id) ?? 0) + 1);
	return models.map((m) => {
		const family = providerFamily(m.provider, m.id);
		const duplicate = (idCounts.get(m.id) ?? 0) > 1;
		const name = typeof m.name === "string" && m.name.trim() ? m.name.trim() : undefined;
		return {
			id: m.id,
			provider: m.provider,
			family,
			selection: `${m.provider}/${m.id}`,
			label: `${family} — ${m.id}${name ? ` (${name})` : ""}${duplicate ? ` [${m.provider}]` : ""}`,
		};
	});
}

const PROVIDER_FAMILY_ALIASES: Record<string, string> = {
	openai: "OpenAI",
	"openai-codex": "OpenAI Codex",
	opencode: "OpenCode",
	"opencode-go": "OpenCode Go",
	cohere: "Cohere Command",
	llama: "Llama",
	"meta-llama": "Llama",
	nanogpt: "NanoGPT",
};

function titleCaseToken(token: string): string {
	const upper = token.toUpperCase();
	if (upper === "GPT" || upper === "LLM" || upper === "AI") return upper;
	return token.charAt(0).toUpperCase() + token.slice(1);
}

/** Normalize a raw provider string into a display family. Unknown providers stay visible. */
export function providerFamily(provider: string, id?: string): string {
	const normalized = provider
		.replace(/[_\s]+/g, "-")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase();
	const alias = PROVIDER_FAMILY_ALIASES[normalized];
	if (alias) return alias;
	const tokens = normalized
		.split("-")
		.filter(Boolean)
		.map(titleCaseToken);
	return tokens.length > 0 ? tokens.join(" ") : "Unknown Provider";
}

/**
 * Validate a model selection. Order: exact provider/id selection, unique bare
 * id, then ctx.models.resolve (aliases like @slow synthesize an entry). A bare
 * id that matches multiple providers is rejected as ambiguous; unknown values
 * fail clearly with no silent substitution.
 */
export function validateModelSelection(ctx: ExtensionContext, raw: string): ModelValidation {
	const value = raw.trim();
	if (!value) return { valid: false, value, reason: "empty model value" };
	const models = listModels(ctx);
	const bySelection = models.find((m) => m.selection.toLowerCase() === value.toLowerCase());
	if (bySelection) return { valid: true, value: bySelection.selection, entry: bySelection };
	const matching = models.filter((m) => m.id === value);
	if (matching.length === 1) return { valid: true, value: matching[0].id, entry: matching[0] };
	// note: matching.length > 1 falls through to the ambiguous rejection below
	if (matching.length > 1) {
		return {
			valid: false,
			value,
			reason: `ambiguous model id "${value}" across providers (${matching.map((m) => m.provider).join(", ")}); use provider/id form`,
		};
	}
	try {
		const resolved = ctx.models.resolve(value);
		if (resolved) {
			const family = providerFamily(resolved.provider, resolved.id);
			const synthesized: ModelEntry = {
				id: resolved.id,
				provider: resolved.provider,
				family,
				selection: `${resolved.provider}/${resolved.id}`,
				label: `${family} — ${resolved.id}`,
			};
			return { valid: true, value: resolved.id, entry: synthesized };
		}
	} catch {
		// resolve may be unavailable in degraded hosts; fall through to reject
	}
	return { valid: false, value, reason: `unknown model "${value}"` };
}

/** Human-readable description of a role's configured model. */
export function describeModel(value: string | null): string {
	return value ? value : "(inherits session model)";
}

/**
 * Rich model description for user-facing responses: resolves the configured
 * value against the live catalog and renders family + provider/id metadata.
 * Inherited roles, unknown/unresolved values stay clearly labeled (AC#6).
 */
export function formatModelForContext(ctx: ExtensionContext, value: string | null): string {
	if (!value) return "(inherits session model)";
	const models = safeListModels(ctx);
	const bySelection = models.find((m) => m.selection === value);
	if (bySelection) return `${bySelection.family} — ${bySelection.selection}`;
	const byId = models.filter((m) => m.id === value);
	if (byId.length === 1) return `${byId[0].family} — ${byId[0].selection}`;
	if (byId.length > 1) {
		const first = byId[0];
		return `${first.family} — ${first.selection} (ambiguous bare id; use provider/id)`;
	}
	try {
		const resolved = ctx.models.resolve?.(value);
		if (resolved) {
			const family = providerFamily(resolved.provider, resolved.id);
			return `${family} — ${resolved.provider}/${resolved.id}`;
		}
	} catch {}
	return `(unresolved: ${value})`;
}

function safeListModels(ctx: ExtensionContext): ModelEntry[] {
	try {
		return listModels(ctx);
	} catch {
		return [];
	}
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
	if (typeof ctx.ui?.notify === "function") ctx.ui.notify(message, level);
}

/**
 * Interactive model wizard. Headless/RPC/no-UI contexts return the resolved
 * config unchanged (deterministic no-op preserved from TASK-32.5). Options
 * include inherit-session and keep-current; duplicate ids save the full
 * provider/id selection, unique ids save the bare id.
 */
export async function runModelConfigWizard(ctx: ExtensionContext, cwd: string, scope?: CookConfigScope): Promise<ModelConfig> {
	const resolved = resolveCookConfig(cwd, scope);
	const config = resolved.config;
	if (!ctx.hasUI || typeof ctx.ui?.select !== "function") return config;
	const models = listModels(ctx);
	if (!models.length) {
		notify(ctx, "Could not load model list. Keeping existing config.", "warning");
		return config;
	}

	const modelOptions = (current: string | null) => [
		"\u21ba Inherit session model",
		...(current ? [`\u2713 Keep current (${describeModel(current)})`] : []),
		...models.map((m) => m.label),
	];

	for (const role of ROLES) {
		const pick = await ctx.ui.select(
			`Model for ${role}  (current: ${describeModel(config[role])})  [scope: ${resolved.writeScope}]`,
			modelOptions(config[role]),
		);
		if (pick === undefined) break;
		if (pick.startsWith("\u21ba")) config[role] = null;
		else if (!pick.startsWith("\u2713")) {
			const chosen = models.find((m) => m.label === pick);
			if (chosen) {
				const sameId = models.filter((m) => m.id === chosen.id).length;
				config[role] = sameId > 1 ? chosen.selection : chosen.id;
			}
		}
	}

	saveModelConfig(cwd, config, scope);
	return config;
}
