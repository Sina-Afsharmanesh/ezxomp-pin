import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchWithPolicy, isPrivateHostname, PrivateHostError } from "../src/http.ts";
import { htmlToText } from "../src/extract.ts";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
	server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
		switch (url.pathname) {
			case "/page":
				res.setHeader("content-type", "text/html");
				res.end("<html><head><script>alert('x')</script><style>b{color:red}</style></head><body><h1>Hello</h1><p>World&nbsp;&amp; more</p></body></html>");
				break;
			case "/big":
				res.setHeader("content-type", "text/plain");
				res.end("a".repeat(10000));
				break;
			case "/slow":
				setTimeout(() => res.end("late"), 3000);
				break;
			case "/hop1":
				res.statusCode = 302;
				res.setHeader("location", "/hop2");
				res.end();
				break;
			case "/hop2":
				res.statusCode = 302;
				res.setHeader("location", "/hop3");
				res.end();
				break;
			case "/hop3":
				res.statusCode = 302;
				res.setHeader("location", "/hop4");
				res.end();
				break;
			case "/hop4":
				res.statusCode = 302;
				res.setHeader("location", "/hop5");
				res.end();
				break;
			case "/hop5":
				res.statusCode = 302;
				res.setHeader("location", "/hop6");
				res.end();
				break;
			case "/hop6":
				res.statusCode = 302;
				res.setHeader("location", "/done");
				res.end();
				break;
			case "/done":
				res.end("arrived");
				break;
			default:
				res.statusCode = 404;
				res.end("nope");
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const addr = server.address();
	if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

const baseOpts = { maxBytes: 67108864, timeoutMs: 5000, allowPrivateHosts: true };

describe("fetchWithPolicy", () => {
	it("fetches a page and follows redirects within the cap of 5 (5 redirects ok)", async () => {
		const r = await fetchWithPolicy(`${baseUrl}/hop2`, baseOpts);
		expect(r.text).toBe("arrived");
	expect(r.finalUrl.endsWith("/done")).toBe(true);
	});

	it("rejects beyond the redirect cap (6 redirects)", async () => {
		await expect(fetchWithPolicy(`${baseUrl}/hop1`, baseOpts)).rejects.toThrow("too many redirects");
	});

	it("appends truncation marker at maxBytes", async () => {
		const r = await fetchWithPolicy(`${baseUrl}/big`, { ...baseOpts, maxBytes: 1024 });
		expect(r.truncated).toBe(true);
		expect(r.text).toBe(`a`.repeat(1024) + `\n\n[truncated at 1024 bytes]`);
	});

	it("aborts on timeout", async () => {
		await expect(fetchWithPolicy(`${baseUrl}/slow`, { ...baseOpts, timeoutMs: 100 })).rejects.toThrow();
	});

	it("rejects unsupported protocols", async () => {
		await expect(fetchWithPolicy("ftp://example.com/x", baseOpts)).rejects.toThrow("unsupported protocol");
	});

	it("allows private hosts by default and blocks with private_host_blocked when disabled", async () => {
		const allowed = await fetchWithPolicy(`${baseUrl}/page`, baseOpts);
		expect(allowed.status).toBe(200);

		await expect(
			fetchWithPolicy(`${baseUrl}/page`, { ...baseOpts, allowPrivateHosts: false }),
		).rejects.toBeInstanceOf(PrivateHostError);
	});

	it("isPrivateHostname covers loopback, RFC1918, link-local, IPv6 ULA/link-local", () => {
		expect(isPrivateHostname("localhost")).toBe(true);
		expect(isPrivateHostname("127.0.0.1")).toBe(true);
		expect(isPrivateHostname("10.1.2.3")).toBe(true);
		expect(isPrivateHostname("172.16.0.1")).toBe(true);
		expect(isPrivateHostname("192.168.1.1")).toBe(true);
		expect(isPrivateHostname("169.254.9.9")).toBe(true);
		expect(isPrivateHostname("fd00::1")).toBe(true);
		expect(isPrivateHostname("fe80::1")).toBe(true);
		expect(isPrivateHostname("example.com")).toBe(false);
		expect(isPrivateHostname("8.8.8.8")).toBe(false);
		expect(isPrivateHostname("172.32.0.1")).toBe(false);
	});
});

describe("htmlToText", () => {
	it("strips script/style, block tags to newlines, decodes entities, collapses whitespace", () => {
		const text = htmlToText(
			"<html><head><script>alert(1)</script><style>p{}</style></head><body><h1>Hi</h1><p>A&nbsp;&amp;&nbsp;B</p><span>tail</span></body></html>",
		);
		expect(text).not.toContain("alert");
		expect(text).not.toContain("p{");
		expect(text).toContain("Hi");
		expect(text).toContain("A & B");
		expect(text).toContain("tail");
	});
});
