import { describe, expect, it } from "bun:test";
import { mergeSettings } from "../plugins/gsd-web/extensions/settings.ts";

describe("gsd-web mergeSettings", () => {
	it("applies typed defaults when neither manifest nor persisted set keys", () => {
		const s = mergeSettings({}, {});
		expect(s.host).toBe("auto");
		expect(s.port).toBe(0);
		expect(s.noAuth).toBe(false);
		expect(s.allowUnauthenticatedLAN).toBe(false);
		expect(s.daemonMode).toBe(false);
		expect(s.openBrowser).toBe(false);
		expect(s.freeform).toEqual({ allowedOrigins: "", nodeBinary: "", ompBinary: "", devRoot: "" });
	});

	it("persisted values override manifest values", () => {
		const s = mergeSettings({ host: "auto", port: 3000 }, { host: "localhost", port: 4100 });
		expect(s.host).toBe("localhost");
		expect(s.port).toBe(4100);
	});

	it("coerces bad types instead of passing them through", () => {
		const s = mergeSettings(
			{ port: Number.NaN, host: "   ", noAuth: "yes" },
			{ daemonMode: 1, allowedOrigins: 42 as unknown as string },
		);
		expect(s.port).toBe(0);
		expect(s.host).toBe("auto");
		expect(s.noAuth).toBe(false);
		expect(s.daemonMode).toBe(false);
		expect(s.freeform.allowedOrigins).toBe("");
	});

	it("clamps port into the valid range and truncates fractions", () => {
		expect(mergeSettings({ port: 70000 }, {}).port).toBe(65535);
		expect(mergeSettings({ port: -5 }, {}).port).toBe(0);
		expect(mergeSettings({ port: 8080.9 }, {}).port).toBe(8080);
	});

	it("keeps string freeform keys only when actually strings", () => {
		const s = mergeSettings({}, { allowedOrigins: "https://a.example,https://b.example", ompBinary: "/usr/bin/omp" });
		expect(s.freeform.allowedOrigins).toBe("https://a.example,https://b.example");
		expect(s.freeform.ompBinary).toBe("/usr/bin/omp");
		expect(s.freeform.nodeBinary).toBe("");
	});
});
