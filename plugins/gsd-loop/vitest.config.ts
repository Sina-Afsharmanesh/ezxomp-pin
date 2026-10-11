import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@oh-my-pi\/pi-coding-agent$/,
				replacement: path.resolve(__dirname, "tests/__mocks__/pi-coding-agent.ts"),
			},
		],
	},
	test: {
		include: ["tests/**/*.test.ts"],
	},
});
