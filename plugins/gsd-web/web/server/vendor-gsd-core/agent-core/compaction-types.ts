// Vendored alias: CompactionResult from gsd-agent-core/src/compaction
export interface CompactionResult<T = unknown> {
	result: T;
	tokensBefore: number;
	tokensAfter: number;
	summary: string;
	[key: string]: unknown;
}
