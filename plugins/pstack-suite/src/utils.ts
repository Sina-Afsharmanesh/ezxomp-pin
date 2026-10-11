import * as fs from "node:fs";
import * as path from "node:path";
import { isToolAvailable } from "./runner.js";

export { isToolAvailable } from "./runner.js";

export interface PstackModelsConfig {
  roles: {
    architect?: string;
    implementer?: string;
    reviewer?: string;
    writer?: string;
    [role: string]: string | undefined;
  };
  default?: string;
}

export function loadPstackConfig(projectRoot: string): PstackModelsConfig | undefined {
  const result = loadPstackConfigResult(projectRoot);
  return result.ok ? result.config : undefined;
}

/** Load pstack config with explicit success/failure distinction.
 * Returns { ok: true, config } on valid read.
 * Returns { ok: false, reason: "missing" } when the file does not exist.
 * Returns { ok: false, reason: "invalid" } for malformed JSON or missing roles key.
 */
export function loadPstackConfigResult(
  projectRoot: string,
): { ok: true; config: PstackModelsConfig } | { ok: false; reason: "missing" | "invalid" } {
  const configPath = path.join(projectRoot, ".omp", "pstack-models.json");
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "ENOENT") {
      return { ok: false, reason: "missing" };
    }
    return { ok: false, reason: "invalid" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid" };
  }
  const obj = parsed as Record<string, unknown>;
  const roles = obj.roles;
  if (roles === undefined || roles === null || typeof roles !== "object" || Array.isArray(roles)) {
    return { ok: false, reason: "invalid" };
  }
  for (const [, val] of Object.entries(roles)) {
    if (typeof val !== "string") {
      return { ok: false, reason: "invalid" };
    }
  }
  const def = obj.default;
  if (def !== undefined && typeof def !== "string") {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, config: parsed as PstackModelsConfig };
}

/** Resolve model for a role with source attribution. */
export function resolveRoleModelDetailed(
  cwd: string,
  role: string,
  sessionDefault?: string,
): { model: string; source: "role" | "session" | "project-default" } | undefined {
  const result = loadPstackConfigResult(cwd);
  if (!result.ok) {
    return sessionDefault ? { model: sessionDefault, source: "session" } : undefined;
  }
  const config = result.config;
  if (config.roles[role]) {
    return { model: config.roles[role]!, source: "role" };
  }
  if (sessionDefault) {
    return { model: sessionDefault, source: "session" };
  }
  if (config.default) {
    return { model: config.default, source: "project-default" };
  }
  return undefined;
}

/** Resolve model for a role using project config, falling back to session default.
 * Precedence: role config → sessionDefault → config.default → undefined.
 * Returns the resolved model string, or undefined if no config mapping is active.
 */
export function resolveRoleModel(
  cwd: string,
  role: string,
  sessionDefault?: string,
): string | undefined {
  const detailed = resolveRoleModelDetailed(cwd, role, sessionDefault);
  return detailed?.model;
}

export function savePstackConfig(projectRoot: string, config: PstackModelsConfig): void {
  const dir = path.join(projectRoot, ".omp");
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, "pstack-models.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function resolveModel(
  config: PstackModelsConfig | undefined,
  role: string,
  sessionDefault?: string,
): string | undefined {
  if (config?.roles[role]) {
    return config.roles[role];
  }
  return sessionDefault ?? config?.default;
}

/** Parse role=model lines from a Cursor pstack-models.mdc file */
export function parseCursorModels(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("<!--")) {
      continue;
    }
    const match = trimmed.match(/^(architect|implementer|reviewer|writer|planner|default)\s*=\s*(.+)$/i);
    if (match) {
      const key = match[1]!; const val = match[2]!.trim(); result[key.toLowerCase()] = val;
    }
  }
  return result;
}

/** Try to read and parse ~/.cursor/rules/pstack-models.mdc; returns parsed roles or undefined */
export function detectCursorMigration(): Record<string, string> | undefined {
  const home = process.env.HOME;
  if (!home) return undefined;
  const cursorPath = path.join(home, ".cursor", "rules", "pstack-models.mdc");
  try {
    const raw = fs.readFileSync(cursorPath, "utf-8");
    return parseCursorModels(raw);
  } catch {
    return undefined;
  }
}
/** Check if gh (GitHub CLI) is available */
export function hasGh(): boolean {
  return isToolAvailable("gh");
}

/** Check if backlog.md CLI is available */
export function hasBacklogMd(): boolean {
  return isToolAvailable("backlog");
}

/** Verify tool dependencies at startup. Returns true if hard deps are met. */
export function checkDependencies(): boolean {
  const hardOk = hasBacklogMd();

  if (!isToolAvailable("gh")) {
    console.warn(
      "[pstack-suite] gh (GitHub CLI) not found — some features will be limited. Install: https://cli.github.com/",
    );
  }

  return hardOk;
}
