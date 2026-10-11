/**
 * Vendored from @xynogen/pix-pretty@1.8.0 src/utils.ts (lines 55-80).
 *
 * The accepted keys are the exact subset used by the formatter, so OMP's
 * narrower `Theme.fg` signature remains assignable under strict function types.
 */

export type CollapsedToolStatus = "success" | "error" | "warning";
type CollapsedToolColor = CollapsedToolStatus | "toolTitle" | "muted" | "dim";

export type CollapsedToolTheme = {
	fg: (key: CollapsedToolColor, text: string) => string;
	bold: (text: string) => string;
};

export function formatCollapsedToolRow(
	theme: CollapsedToolTheme,
	tool: string,
	target: string,
	meta = "",
	status: CollapsedToolStatus = "success",
): string {
	const icon = status === "success" ? "✓" : status === "warning" ? "⚡" : "✗";
	const parts = [
		`${theme.fg(status, icon)} ${theme.fg("toolTitle", theme.bold(tool))}`,
		target ? theme.fg("muted", target) : "",
		meta ? `${theme.fg("dim", "·")} ${theme.fg("dim", meta)}` : "",
	].filter(Boolean);
	return parts.join(" ");
}
