/**
 * Minimal test shim for @oh-my-pi/pi-tui string helpers.
 *
 * The real pi-tui loads a native addon (pi-natives), whose loader only supports
 * .node and crashes under vitest. The shim implements only the helpers the
 * cook overlay tests exercise, and the semantics are intentionally narrow:
 *
 *   - visibleWidth counts 1 cell per code point (no CJK/wide character width
 *     table, no grapheme cluster/surrogate pair handling; emoji/zwj sequences
 *     count as n).
 *   - tab expansion to a single space - no hard tab stop tracking.
 *   - ANSI: only CSI sequences (\x1b[...m) are stripped; cursor movement,
 *     line/screen erase, and other CSI sequences are not modeled.
 *
 * Keep this shim as long as tests only exercise the helpers above. The durable
 * fix is upstream: a portable (non-.node) fallback in pi-natives (known issue,
 * out of this repo's scope). Do not grow the shim into a TUI - the
 * experiences overlay host cannot be shimmed (Spacer/TUI components).
 */
const ANSI = /\u001b\[[0-9;]*m/g;

export function visibleWidth(value: string): number {
	let width = 0;
	let ansi = false;
	for (const ch of value.replace(/\t/g, " ")) {
		if (ch === "\u001b") { ansi = true; continue; }
		if (ansi) { if (ch === "m") ansi = false; continue; }
		width += 1;
	}
	return width;
}

export function replaceTabs(value: string, replacement = " "): string {
	return value.replace(/\t/g, replacement);
}

export function stripAnsi(value: string): string {
	return value.replace(ANSI, "");
}

export function truncateToWidth(value: string, width: number): string {
	const plain = replaceTabs(value);
	if (visibleWidth(plain) <= width) return plain;
	const maxChars = Math.max(0, width - 1);
	let out = "";
	let w = 0;
	let ansi = false;
	for (const ch of plain) {
		if (ch === "\u001b") { ansi = true; continue; }
		if (ansi) { if (ch === "m") ansi = false; continue; }
		if (w >= maxChars) break;
		out += ch;
		w += 1;
	}
	return out + "…";
}

export function wrapTextWithAnsi(value: string, width: number): string[] {
	const plain = replaceTabs(value);
	if (width <= 0) return [plain];
	const words = plain.split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (visibleWidth(candidate) <= width) current = candidate;
		else {
			if (current) lines.push(current);
			if (visibleWidth(word) <= width) current = word;
			else {
				// hard-break long words
				let rest = word;
				while (visibleWidth(rest) > width) {
					lines.push(rest.slice(0, width));
					rest = rest.slice(width);
				}
				current = rest;
			}
		}
	}
	if (current) lines.push(current);
	return lines.length ? lines : [""];
}

export const Key = {
	escape: "\u001b",
	enter: "\r",
};
