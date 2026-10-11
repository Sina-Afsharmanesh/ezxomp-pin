/**
 * src/injection.ts — faithful port of gsd-core hooks/gsd-read-injection-scanner.js
 * (4 summarisation-survival patterns + 4 markdown-link patterns with the
 * DATA_URI_SAFE_MIME_RE safe-list, exact rule IDs).
 *
 * scanText(text) -> {level: "none"|"low"|"high", ruleIds[]}; HIGH = 3+ hits.
 * Fail-open: any scanner exception yields {level:"none", ruleIds:[]}.
 *
 * Deviation note: upstream assigns generic ruleId "INJECTION-PATTERN" with a
 * describePattern() source fragment to the summarisation patterns; the plan
 * asks for exact per-rule IDs, so each summarisation pattern carries a
 * descriptive stable ID (SUMMARISATION-*) instead.
 */

export interface InjectionFinding {
	ruleId: string;
	match: string | null;
}

export interface InjectionScan {
	level: "none" | "low" | "high";
	ruleIds: string[];
	findings: InjectionFinding[];
}

// Summarisation-survival patterns (novel — not in gsd-prompt-guard.js).
const SUMMARISATION_PATTERNS: Array<{ pattern: RegExp; ruleId: string }> = [
	{
		pattern: /when\s+(?:summari[sz]ing|compressing|compacting),?\s+(?:retain|preserve|keep)\s+(?:this|these)/i,
		ruleId: "SUMMARISATION-RETAIN-ON-COMPRESS",
	},
	{
		pattern: /this\s+(?:instruction|directive|rule)\s+is\s+(?:permanent|persistent|immutable)/i,
		ruleId: "SUMMARISATION-PERMANENT-INSTRUCTION",
	},
	{
		pattern: /preserve\s+(?:these|this)\s+(?:rules?|instructions?|directives?)\s+(?:in|through|after|during)/i,
		ruleId: "SUMMARISATION-PRESERVE-RULES-THROUGH",
	},
	{
		pattern: /(?:retain|keep)\s+(?:this|these)\s+(?:in|through|after)\s+(?:summar|compress|compact)/i,
		ruleId: "SUMMARISATION-RETAIN-THROUGH-COMPRESS",
	},
];

// Markdown link patterns — mirrors scripts/security.cjs MARKDOWN_LINK_PATTERNS.
//   MD-LINK-JS-SCHEME: OWASP XSS Prevention
//   MD-LINK-DATA-SCHEME: OWASP File Upload (SVG unsafe)
//   MD-LINK-USERINFO: RFC 3986 §3.2.1, RFC 9110 §4.2.4
//   MD-LINK-TOKEN-IN-QUERY: RFC 9700 §4.3.1
const DATA_URI_SAFE_MIME_RE = /^data:(image\/(png|jpe?g|gif|webp|bmp|ico|avif|heic)|font\/(woff2?|otf|ttf))(;[^,]*)?,/i;

const MARKDOWN_LINK_PATTERNS: Array<{ pattern: RegExp; ruleId: string; safePredicate?: (line: string) => boolean }> = [
	{
		pattern: /\]\(\s*javascript:/i,
		ruleId: "MD-LINK-JS-SCHEME",
	},
	{
		pattern: /\]\(\s*data:/i,
		ruleId: "MD-LINK-DATA-SCHEME",
		safePredicate: (line) => {
			const m = line.match(/\]\(\s*(data:[^)]*)/i);
			if (!m) return false;
			return DATA_URI_SAFE_MIME_RE.test(m[1]);
		},
	},
	{
		pattern: /\]\(\s*https?:\/\/[^/\s]+:[^/@\s]+@/i,
		ruleId: "MD-LINK-USERINFO",
	},
	{
		pattern: /[?&](token|access_token|id_token|refresh_token|api_key|apikey|secret|password|client_secret|code)=/i,
		ruleId: "MD-LINK-TOKEN-IN-QUERY",
	},
];

export function scanText(text: string): InjectionScan {
	try {
		const findings: InjectionFinding[] = [];

		for (const entry of SUMMARISATION_PATTERNS) {
			const m = text.match(entry.pattern);
			if (m) findings.push({ ruleId: entry.ruleId, match: m[0].substring(0, 40) });
		}

		const lines = text.split("\n");
		for (const entry of MARKDOWN_LINK_PATTERNS) {
			for (const line of lines) {
				const m = line.match(entry.pattern);
				if (!m) continue;
				if (entry.safePredicate && entry.safePredicate(line)) continue;
				findings.push({ ruleId: entry.ruleId, match: m[0].substring(0, 40) });
			}
		}

		// Dedupe rule IDs (a rule may fire on multiple lines).
		const ruleIds: string[] = [];
		for (const f of findings) {
			if (!ruleIds.includes(f.ruleId)) ruleIds.push(f.ruleId);
		}
		const level: InjectionScan["level"] = findings.length >= 3 ? "high" : findings.length > 0 ? "low" : "none";
		return { level, ruleIds, findings };
	} catch {
		// Fail-open: losing the injection check is safer than failing the tool
		// this scan only observes (#3911).
		return { level: "none", ruleIds: [], findings: [] };
	}
}
