/**
 * Minimal stubs for @gsd/pi-coding-agent utilities used by the gsd-web service layer.
 * These mirror the upstream surface without pulling the full implementation.
 */

export const DEFAULT_MAX_BYTES = 51200;
export const DEFAULT_MAX_LINES = 2000;

export function formatSize(bytes: number): string {
	const KB = 1024;
	const MB = KB * 1024;
	if (bytes < KB) return `${bytes}B`;
	if (bytes < MB) return `${(bytes / KB).toFixed(1)}KB`;
	return `${(bytes / MB).toFixed(1)}MB`;
}

export function truncateHead(
	content: string,
	options?: { maxLines?: number; maxBytes?: number },
): { content: string; truncated: boolean; totalLines: number; totalBytes: number; outputLines: number; outputBytes: number } {
	const maxLines = options?.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return {
			content,
			truncated: false,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
		};
	}

	const truncatedLines = lines.slice(0, maxLines);
	const truncatedContent = truncatedLines.join("\n");
	const outputBytes = Buffer.byteLength(truncatedContent, "utf-8");

	return {
		content: truncatedContent,
		truncated: true,
		totalLines,
		totalBytes,
		outputLines: maxLines,
		outputBytes,
	};
}

export function getShellConfig() {
	return {
		shell: process.env.SHELL || "/bin/sh",
		args: [] as string[],
	};
}

export function sanitizeCommand(command: string): string {
	return command;
}

export interface KillProcessTreeOptions {
	graceMs?: number;
}

export async function killProcessTree(pid: number, options?: KillProcessTreeOptions): Promise<void> {
	// Minimal stub for killProcessTree
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		// already gone
	}
}

export function getSkillDirectories(): string[] {
	return [];
}

export function getMarkdownTheme() {
	return {
		code: "github",
	};
}

// AuthStorage stub used by doctor-providers.ts
export const AuthStorage = {
	create: (path: string) => ({
		getCredentialsForProvider: (providerId: string) => [],
	}),
	inMemory: (config: Record<string, unknown>) => ({
		getCredentialsForProvider: (providerId: string) => [],
	}),
};

// Tool creation stubs used by dynamic-tools.ts
export function createBashTool(cwd: string, opts: Record<string, unknown>) {
	return {
		name: "bash",
		description: "Run a bash command",
		parameters: {},
		execute: async (_id: string, params: unknown) => {
			return { output: "", exitCode: 0 };
		},
	};
}

export function createEditTool(cwd: string) {
	return {
		name: "edit",
		description: "Edit a file",
		parameters: {},
		execute: async (_id: string, params: unknown) => {
			return { success: true };
		},
	};
}

export function createReadTool(cwd: string) {
	return {
		name: "read",
		description: "Read a file",
		parameters: {},
		execute: async (_id: string, params: unknown) => {
			return { content: "" };
		},
	};
}

export function createWriteTool(cwd: string) {
	return {
		name: "write",
		description: "Write a file",
		parameters: {},
		execute: async (_id: string, params: unknown) => {
			return { success: true };
		},
	};
}
