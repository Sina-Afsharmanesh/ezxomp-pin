/**
 * src/extract.ts — zero-dep HTML -> readable text.
 * Strip script/style/noscript, block tags -> newlines, decode entities,
 * collapse whitespace.
 */

const BLOCK_TAGS_RE =
	/<\/?(?:p|div|section|article|header|footer|nav|main|aside|ul|ol|li|dl|dt|dd|h[1-6]|blockquote|pre|table|thead|tbody|tr|td|th|form|fieldset|figure|figcaption|hr|br)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	"#39": "'",
};

function decodeEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
		if (body[0] === "#") {
			const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
			if (Number.isInteger(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
			return whole;
		}
		const named = ENTITIES[body.toLowerCase()];
		return named ?? whole;
	});
}

export function htmlToText(html: string): string {
	return decodeEntities(
		html
			.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
			.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(BLOCK_TAGS_RE, "\n"),
	)
		.replace(/[ \t\r\f\v]+/g, " ")
		.split("\n")
		.map((line) => line.trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
