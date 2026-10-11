import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { evaluateWebProxyAuth, type WebProxyAuthRequest } from "../proxy-auth.ts";

function makeRequest(pathname: string, authorization?: string, origin?: string): WebProxyAuthRequest {
  const headers: Record<string, string | null> = {};
  if (authorization) headers.authorization = authorization;
  if (origin) headers.origin = origin;

  return {
    pathname,
    searchParams: new URLSearchParams(),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe("evaluateWebProxyAuth", () => {
  const testToken = ["local", "token"].join("-");
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GSD_WEB_AUTH_TOKEN: testToken,
    GSD_WEB_HOST: "100.85.194.64",
    GSD_WEB_PORT: "3459",
  };

  test("allows public root without token", () => {
    assert.deepEqual(evaluateWebProxyAuth(makeRequest("/"), baseEnv), { kind: "next" });
    assert.deepEqual(evaluateWebProxyAuth(makeRequest("/index.html"), baseEnv), { kind: "next" });
  });

  test("allows _next static routes without token", () => {
    assert.deepEqual(evaluateWebProxyAuth(makeRequest("/_next/static/chunk.js"), baseEnv), { kind: "next" });
  });

  test("requires bearer token for non-public routes", () => {
    assert.deepEqual(evaluateWebProxyAuth(makeRequest("/api/projects"), baseEnv), {
      kind: "json",
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  test("accepts bearer token for non-public routes", () => {
    assert.deepEqual(evaluateWebProxyAuth(makeRequest("/api/projects", `Bearer ${testToken}`), baseEnv), { kind: "next" });
  });

  test("rejects bad bearer token", () => {
    assert.deepEqual(evaluateWebProxyAuth(makeRequest("/api/projects", "Bearer bad"), baseEnv), {
      kind: "json",
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  test("rejects mismatched origin", () => {
    assert.deepEqual(
      evaluateWebProxyAuth(makeRequest("/api/projects", `Bearer ${testToken}`, "http://evil.example"), baseEnv),
      { kind: "json", status: 403, body: { error: "Forbidden: origin mismatch" } }
    );
  });

  test("allows configured tailnet origin with valid token", () => {
    const env = { ...baseEnv };
    assert.deepEqual(
      evaluateWebProxyAuth(makeRequest("/api/projects", `Bearer ${testToken}`, "http://100.85.194.64:3459"), env),
      { kind: "next" }
    );
  });

  test("allows extra allowed origins", () => {
    const env = { ...baseEnv, GSD_WEB_ALLOWED_ORIGINS: "http://extra.example" };
    assert.deepEqual(
      evaluateWebProxyAuth(makeRequest("/api/projects", `Bearer ${testToken}`, "http://extra.example"), env),
      { kind: "next" }
    );
  });
});
