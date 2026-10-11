/**
 * Vendored from @xynogen/pix-gate@0.2.0 src/lib.ts.
 *
 * The original `buildRules` returned `{ rules, autoApprove, pathRules }`; skills
 * only consumes `.rules`, so `pathRules` is intentionally dropped here.
 *
 * `loadUserConfig` is rewritten to read `<getAgentDir()>/pix.json` directly via
 * `node:fs`, removing the original `@xynogen/pix-runtime` config-singleton
 * dependency. Behavior is preserved: parse the `gate` section and return a
 * UserConfig (or `{}` when missing/malformed).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils";

export type Severity = "critical" | "dangerous" | "risky";

export interface Rule {
	pattern: RegExp;
	severity: Severity;
	reason: string;
}

export type GateRuleConfig = {
	pattern: string;
	flags?: string | undefined;
	severity?: Severity | undefined;
	reason?: string | undefined;
};

export interface UserConfig {
	extraRules?: GateRuleConfig[] | undefined;
	guardrails?: ("on" | "off") | undefined;
	autoApprove?: string[] | undefined;
}

const SEVERITIES: readonly Severity[] = ["critical", "dangerous", "risky"];

function isObj(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

export const DEFAULT_RULES: Rule[] = [
	// CRITICAL — destructive, irreversible, or system-wide
	{ pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+\/(\s|$)/i, severity: "critical", reason: "rm -rf on /" },
	{ pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(~|\$HOME)(\s|$|\/\s*$)/i, severity: "critical", reason: "rm -rf on $HOME" },
	{ pattern: /\bmkfs(\.\w+)?\b/i, severity: "critical", reason: "filesystem formatting" },
	{ pattern: /\bdd\s+.*\bof=\/dev\/(sd[a-z]|nvme|disk)/i, severity: "critical", reason: "dd to raw block device" },
	{ pattern: />\s*\/dev\/(sd[a-z]|nvme|disk)/i, severity: "critical", reason: "writing to raw block device" },
	{ pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, severity: "critical", reason: "fork bomb" },
	{ pattern: /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i, severity: "critical", reason: "system power command" },
	// DANGEROUS — destructive or privileged but recoverable in scope
	{ pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, severity: "dangerous", reason: "recursive force remove" },
	{ pattern: /(^|[\s;|&])sudo\b/i, severity: "dangerous", reason: "privilege escalation" },
	{ pattern: /\b(chmod|chown)\b[^|;&]*\b(777|-R\s+777)/i, severity: "dangerous", reason: "world-writable permissions" },
	{ pattern: /\bchmod\s+-R\b/i, severity: "dangerous", reason: "recursive chmod" },
	{ pattern: /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i, severity: "dangerous", reason: "remote script execution (curl|sh)" },
	{ pattern: /\bgit\s+(push\s+(-f|--force)|reset\s+--hard|clean\s+-[a-z]*f)/i, severity: "dangerous", reason: "destructive git operation" },
	{ pattern: /\bnpm\s+publish\b/i, severity: "dangerous", reason: "package publish" },
	{ pattern: /\bdocker\s+(system\s+prune|rm\s+-f|volume\s+rm)/i, severity: "dangerous", reason: "destructive docker operation" },
	{ pattern: /\bkill\s+-9\s+-1\b/i, severity: "dangerous", reason: "kill all processes" },
	// RISKY — worth a glance but usually fine
	{ pattern: /\bgit\s+checkout\s+(-f|--force)/i, severity: "risky", reason: "force checkout (overwrites local changes)" },
	{ pattern: /\bgit\s+stash\s+drop\b/i, severity: "risky", reason: "stash drop" },
	{ pattern: />\s*[^|&;]*\.env\b/i, severity: "risky", reason: "writing to .env" },
];

export function buildRules(cfg: UserConfig): { rules: Rule[]; autoApprove: RegExp[] } {
	const base = cfg.guardrails === "off" ? [] : DEFAULT_RULES.slice();
	const extra = (cfg.extraRules ?? []).map((r) => ({
		pattern: new RegExp(r.pattern, r.flags ?? "i"),
		severity: (r.severity ?? "dangerous") as Severity,
		reason: r.reason ?? "user-defined rule",
	}));
	const autoApprove = (cfg.autoApprove ?? []).map((s) => new RegExp(s));
	return { rules: [...base, ...extra], autoApprove };
}

export function classify(command: string, rules: Rule[]): Rule | undefined {
	const order: Severity[] = ["critical", "dangerous", "risky"];
	for (const sev of order) {
		const hit = rules.find((r) => r.severity === sev && r.pattern.test(command));
		if (hit) return hit;
	}
	return undefined;
}

export function loadUserConfig(): UserConfig {
	try {
		const p = join(getAgentDir(), "pix.json");
		if (!existsSync(p)) return {};
		const raw = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
		const gate = raw.gate;
		if (!isObj(gate)) return {};
		return {
			guardrails: gate.guardrails === "off" ? "off" : "on",
			autoApprove: Array.isArray(gate.autoApprove)
				? (gate.autoApprove.filter((x): x is string => typeof x === "string"))
				: undefined,
			extraRules: Array.isArray(gate.extraRules)
				? gate.extraRules
						.filter((r): r is Record<string, unknown> => isObj(r) && typeof r.pattern === "string")
						.map((r) => ({
							pattern: r.pattern as string,
							flags: typeof r.flags === "string" ? r.flags : undefined,
							severity:
								typeof r.severity === "string" && SEVERITIES.includes(r.severity as Severity)
									? (r.severity as Severity)
									: undefined,
							reason: typeof r.reason === "string" ? r.reason : undefined,
						}))
				: undefined,
		};
	} catch {
		return {};
	}
}
