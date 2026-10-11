import { beforeEach, vi } from "vitest";
import { __resetHandlers } from "./__mocks__/pi-coding-agent.ts";

beforeEach(() => {
	vi.clearAllMocks();
	__resetHandlers();
});
