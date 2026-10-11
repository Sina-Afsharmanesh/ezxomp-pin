type OpenCodeRequest = Record<string, unknown>;
type OpenCodeResponse<T> = Promise<{ data?: T }>;
type OpenCodeEventStream = AsyncIterable<Record<string, unknown>> & {
	return?: () => void | Promise<void>;
};

declare module "@opencode-ai/sdk" {
	export interface OpencodeClient {
		config: {
			get: (options: OpenCodeRequest) => Promise<unknown>;
		};
		session: {
			create: (options: OpenCodeRequest) => OpenCodeResponse<{ id: string }>;
			fork: (options: OpenCodeRequest) => OpenCodeResponse<{ id: string }>;
			get: (options: OpenCodeRequest) => Promise<unknown>;
			promptAsync: (options: OpenCodeRequest) => Promise<unknown>;
			abort: (options: OpenCodeRequest) => Promise<unknown>;
		};
		provider: {
			list: (options: OpenCodeRequest) => OpenCodeResponse<{
				connected?: string[];
				all?: Array<{
					id: string;
					name: string;
					models: Record<string, { id: string; name?: string }>;
				}>;
			}>;
		};
		event: {
			subscribe: () => Promise<{ stream: OpenCodeEventStream }>;
		};
		postSessionIdPermissionsPermissionId: (options: OpenCodeRequest) => Promise<unknown>;
	}
}

declare module "@anthropic-ai/claude-agent-sdk" {
	export const query: (...args: readonly unknown[]) => unknown;
}
