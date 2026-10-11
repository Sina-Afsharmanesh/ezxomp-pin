// Vendor-safe PathMetadata surface (mirrors upstream core/package-manager.ts:49)
export interface PathMetadata {
	source: string;
	scope: "user" | "project" | "temporary";
	origin: "package" | "top-level";
	baseDir?: string;
	[key: string]: unknown;
}
