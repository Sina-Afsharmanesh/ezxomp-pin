// Vendor-web thin surface: the full interactive command context lives in the CLI
// runtime; the RPC-bridged web app only needs the cwd-scoping helpers.
export class GSDNoProjectError extends Error {
	constructor(message = "No GSD project found") {
		super(message);
		this.name = "GSDNoProjectError";
	}
}

let currentCwd: string | undefined;

export function withCommandCwd<T>(cwd: string, fn: () => T | Promise<T>): T | Promise<T> {
	const prev = currentCwd;
	currentCwd = cwd;
	try {
		return fn();
	} finally {
		currentCwd = prev;
	}
}

export function projectRoot(): string {
	return currentCwd ?? process.cwd();
}

export function currentDirectoryRoot(): string {
	return projectRoot();
}
