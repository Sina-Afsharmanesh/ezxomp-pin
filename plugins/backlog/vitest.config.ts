import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		globals: true,
		testTimeout: 30_000,
		setupFiles: ["tests/setup.ts"],
	},
	resolve: {
		alias: [
			{
				find: /^@oh-my-pi\/pi-coding-agent$/,
				replacement: path.resolve(__dirname, "tests/__mocks__/pi-coding-agent.ts"),
			},
			{
				find: /^@earendil-works\/pi-coding-agent$/,
				replacement: path.resolve(__dirname, "tests/__mocks__/pi-coding-agent.ts"),
			},
		],
	},
});
