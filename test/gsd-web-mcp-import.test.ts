import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const packageRoot = resolve(import.meta.dir, "../plugins/gsd-web")
const projects: string[] = []

afterEach(async () => {
  await Promise.all(projects.splice(0).map((project) => rm(project, { recursive: true, force: true })))
})

describe("gsd-web MCP imports", () => {
  it("persists a discovered stdio server with its command", async () => {
    const project = await mkdtemp(join(tmpdir(), "gsd-web-mcp-import-"))
    projects.push(project)

    const action = {
      action: "import",
      server: {
        name: "demo",
        transport: "stdio",
        sourcePath: "/tmp/discovered-mcp.json",
        sourceTool: "test",
        command: "node",
        args: ["server.mjs"],
        env: { DEMO: "1" },
        headers: {},
        conflicts: false,
      },
    }
    const script = [
      'const { mutateMcpManagement } = await import("./server/mcp-management-service.ts")',
      `const result = await mutateMcpManagement(${JSON.stringify(action)}, process.env.GSD_TEST_PROJECT)`,
      'const { readFile } = await import("node:fs/promises")',
      'const config = JSON.parse(await readFile(`${process.env.GSD_TEST_PROJECT}/.gsd/mcp.json`, "utf8"))',
      'process.stdout.write(JSON.stringify({ result, server: config.mcpServers.demo }))',
    ].join("; ")
    const child = Bun.spawnSync(["bun", "--eval", script], {
      cwd: join(packageRoot, "web"),
      env: { ...process.env, GSD_WEB_PACKAGE_ROOT: packageRoot, GSD_TEST_PROJECT: project },
    })

    expect(child.exitCode).toBe(0)
    const payload = JSON.parse(new TextDecoder().decode(child.stdout))
    expect(payload.result.status).toBe("ok")
    expect(payload.server).toMatchObject({
      type: "stdio",
      command: "node",
      args: ["server.mjs"],
      env: { DEMO: "1" },
    })
  })

  it("rejects an unsupported transport without creating project config", async () => {
    const project = await mkdtemp(join(tmpdir(), "gsd-web-mcp-import-"))
    projects.push(project)

    const action = {
      action: "import",
      server: {
        name: "remote",
        transport: "unsupported",
        sourcePath: "/tmp/discovered-mcp.json",
        sourceTool: "test",
        args: [],
        env: {},
        headers: {},
        conflicts: false,
      },
    }
    const script = [
      'const { mutateMcpManagement } = await import("./server/mcp-management-service.ts")',
      `const result = await mutateMcpManagement(${JSON.stringify(action)}, process.env.GSD_TEST_PROJECT)`,
      'const { existsSync } = await import("node:fs")',
      'process.stdout.write(JSON.stringify({ result, configExists: existsSync(`${process.env.GSD_TEST_PROJECT}/.gsd/mcp.json`) }))',
    ].join("; ")
    const child = Bun.spawnSync(["bun", "--eval", script], {
      cwd: join(packageRoot, "web"),
      env: { ...process.env, GSD_WEB_PACKAGE_ROOT: packageRoot, GSD_TEST_PROJECT: project },
    })

    expect(child.exitCode).toBe(0)
    const payload = JSON.parse(new TextDecoder().decode(child.stdout))
    expect(payload.result).toMatchObject({ status: "error" })
    expect(payload.result.error).toContain("unsupported MCP transport")
    expect(payload.configExists).toBe(false)
  })
})
