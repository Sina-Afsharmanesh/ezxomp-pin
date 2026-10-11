import { createRequire as __gwbCreateRequireInit } from "node:module";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/@gsd/native/index.mjs
var native_exports = {};
__export(native_exports, {
  batchParseGsdFiles: () => batchParseGsdFiles,
  extractSection: () => extractSection,
  gitCurrentBranch: () => gitCurrentBranch,
  gitHasChanges: () => gitHasChanges,
  highlightCode: () => highlightCode,
  isNativeAddonLoaded: () => isNativeAddonLoaded,
  parseFrontmatter: () => parseFrontmatter,
  supportsLanguage: () => supportsLanguage
});
var unavailable, gitCurrentBranch, gitHasChanges, parseFrontmatter, extractSection, batchParseGsdFiles, isNativeAddonLoaded, highlightCode, supportsLanguage;
var init_native = __esm({
  "node_modules/@gsd/native/index.mjs"() {
    unavailable = (name) => () => {
      throw new Error(`@gsd/native is not available in @ezxomp/gsd-web (${name})`);
    };
    gitCurrentBranch = unavailable("gitCurrentBranch");
    gitHasChanges = unavailable("gitHasChanges");
    parseFrontmatter = unavailable("parseFrontmatter");
    extractSection = unavailable("extractSection");
    batchParseGsdFiles = unavailable("batchParseGsdFiles");
    isNativeAddonLoaded = () => false;
    highlightCode = unavailable("highlightCode");
    supportsLanguage = () => false;
  }
});

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/session-forensics.ts
import { readFileSync as readFileSync3, readdirSync as readdirSync3, existsSync as existsSync4, statSync as statSync3 } from "node:fs";
import { basename as basename2, join as join6 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
import { readdirSync, existsSync as existsSync2, realpathSync as realpathSync2, statSync as statSync2, Dirent } from "node:fs";
import { join as join3, dirname, normalize, relative, resolve as resolve3 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { spawnSync } from "node:child_process";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-parser-bridge.ts
var NATIVE_GSD_PARSER_ENABLED = process.env.GSD_ENABLE_NATIVE_GSD_PARSER === "1";
var nativeModule = null;
var loadAttempted = false;
function loadNative() {
  if (loadAttempted) return nativeModule;
  loadAttempted = true;
  if (!NATIVE_GSD_PARSER_ENABLED) return nativeModule;
  try {
    const mod = (init_native(), __toCommonJS(native_exports));
    if (mod.parseFrontmatter && mod.extractSection && mod.batchParseGsdFiles) {
      nativeModule = mod;
    }
  } catch {
  }
  return nativeModule;
}
function nativeParseJsonlTail(filePath, maxBytes, maxEntries) {
  const native = loadNative();
  if (!native) return null;
  const result = native.parseJsonlTail(filePath, maxBytes, maxEntries);
  return {
    entries: JSON.parse(result.entries),
    count: result.count,
    truncated: result.truncated
  };
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gsd-home.ts
import { homedir } from "node:os";
import { join, resolve } from "node:path";
function gsdHome() {
  return process.env.GSD_HOME ? resolve(process.env.GSD_HOME) : join(homedir(), ".gsd");
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/worktree-root.ts
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join as join2, resolve as resolve2 } from "node:path";
function normalizeWorktreePathForCompare(path) {
  let normalized;
  try {
    normalized = realpathSync(path);
  } catch {
    normalized = resolve2(path);
  }
  const slashed = normalized.replaceAll("\\", "/");
  const trimmed = slashed.replace(/\/+$/, "");
  return process.platform === "win32" ? (trimmed || "/").toLowerCase() : trimmed || "/";
}
function findWorktreeSegment(normalizedPath) {
  const canonicalMarker = "/.gsd-worktrees/";
  const canonicalIdx = normalizedPath.indexOf(canonicalMarker);
  if (canonicalIdx !== -1) {
    return { gsdIdx: canonicalIdx, afterWorktrees: canonicalIdx + canonicalMarker.length };
  }
  const directMarker = "/.gsd/worktrees/";
  const directIdx = normalizedPath.indexOf(directMarker);
  if (directIdx !== -1) {
    return { gsdIdx: directIdx, afterWorktrees: directIdx + directMarker.length };
  }
  const externalRe = /\/\.gsd\/projects\/[^/]+\/worktrees\//;
  const externalMatch = normalizedPath.match(externalRe);
  if (externalMatch && externalMatch.index !== void 0) {
    return {
      gsdIdx: externalMatch.index,
      afterWorktrees: externalMatch.index + externalMatch[0].length
    };
  }
  const projectsRoot = join2(process.env.GSD_STATE_DIR || gsdHome(), "projects").replaceAll("\\", "/").replace(/\/+$/, "");
  const marker = `${projectsRoot}/`;
  if (normalizedPath.startsWith(marker)) {
    const rel = normalizedPath.slice(marker.length);
    const worktreesIdx = rel.indexOf("/worktrees/");
    if (worktreesIdx > 0) {
      const gsdIdx = marker.length + worktreesIdx;
      return {
        gsdIdx,
        afterWorktrees: gsdIdx + "/worktrees/".length
      };
    }
  }
  return null;
}
function isGsdWorktreePath(path) {
  return findWorktreeSegment(path.replaceAll("\\", "/")) !== null;
}
function resolveExternalStateProjectGsdFromWorktreePath(projectPath) {
  const normalized = resolve2(projectPath).replaceAll("\\", "/");
  if (normalized.includes("/.gsd-worktrees/")) return null;
  if (normalized.includes("/.gsd/worktrees/") && !normalized.includes("/.gsd/projects/")) {
    return null;
  }
  const externalDotGsd = /[/\\]\.gsd[/\\]projects[/\\][^/\\]+[/\\]worktrees(?:[/\\]|$)/.exec(normalized);
  if (externalDotGsd && externalDotGsd.index !== void 0) {
    const worktreesIdx = externalDotGsd[0].search(/[/\\]worktrees(?:[/\\]|$)/);
    return resolve2(normalized.slice(0, externalDotGsd.index + worktreesIdx));
  }
  const projectsRoot = join2(process.env.GSD_STATE_DIR || gsdHome(), "projects").replaceAll("\\", "/").replace(/\/+$/, "");
  const marker = `${projectsRoot}/`;
  if (normalized.startsWith(marker)) {
    const rel = normalized.slice(marker.length);
    const slash = rel.indexOf("/");
    if (slash === -1) return null;
    const hash = rel.slice(0, slash);
    const rest = rel.slice(slash + 1);
    if (rest.startsWith("worktrees/") || rest === "worktrees") {
      return resolve2(projectsRoot, hash);
    }
  }
  return null;
}
function resolveWorktreeProjectRoot(basePath, originalBasePath) {
  const explicitOriginal = originalBasePath?.trim();
  if (explicitOriginal) return resolveProjectRootFromPath(explicitOriginal);
  const envProjectRoot = process.env.GSD_PROJECT_ROOT?.trim();
  if (envProjectRoot && isGsdWorktreePath(basePath)) {
    return resolveProjectRootFromPath(envProjectRoot);
  }
  return resolveProjectRootFromPath(basePath || envProjectRoot || process.cwd());
}
function resolveProjectRootFromPath(path) {
  const normalizedPath = path.replaceAll("\\", "/");
  const segment = findWorktreeSegment(normalizedPath);
  if (!segment) {
    return resolveNearestBootstrappedGsdRoot(path) ?? resolveGitWorkingTreeRoot(path) ?? path;
  }
  const sepChar = path.includes("\\") ? "\\" : "/";
  const gsdMarker = `${sepChar}.gsd${sepChar}`;
  const markerIdx = path.indexOf(gsdMarker);
  const sliceIdx = markerIdx !== -1 ? Math.min(markerIdx, segment.gsdIdx) : segment.gsdIdx;
  const candidate = path.slice(0, sliceIdx);
  const gsdHomeNorm = normalizeWorktreePathForCompare(gsdHome());
  const candidateGsdPath = normalizeWorktreePathForCompare(join2(candidate, ".gsd"));
  if (candidateGsdPath === gsdHomeNorm || candidateGsdPath.startsWith(`${gsdHomeNorm}/`)) {
    const realRoot = resolveProjectRootFromGitFile(path);
    return realRoot ?? path;
  }
  return candidate;
}
function resolveNearestBootstrappedGsdRoot(path) {
  try {
    let dir = existsSync(path) && !statSync(path).isDirectory() ? resolve2(path, "..") : path;
    const externalStateParent = normalizeWorktreePathForCompare(resolve2(gsdHome(), ".."));
    for (let i = 0; i < 30; i++) {
      if (normalizeWorktreePathForCompare(dir) === externalStateParent) return null;
      if (hasGsdBootstrapArtifacts(join2(dir, ".gsd"))) return dir;
      const gitPath = join2(dir, ".git");
      if (existsSync(gitPath)) return null;
      const parent = resolve2(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}
function hasGsdBootstrapArtifacts(gsdPath) {
  return existsSync(gsdPath) && (existsSync(join2(gsdPath, "PREFERENCES.md")) || existsSync(join2(gsdPath, "preferences.md")) || existsSync(join2(gsdPath, "milestones")));
}
function resolveGitWorkingTreeRoot(path) {
  try {
    let dir = existsSync(path) && !statSync(path).isDirectory() ? resolve2(path, "..") : path;
    const externalStateParent = normalizeWorktreePathForCompare(resolve2(gsdHome(), ".."));
    for (let i = 0; i < 30; i++) {
      if (normalizeWorktreePathForCompare(dir) === externalStateParent) return null;
      const gitPath = join2(dir, ".git");
      if (existsSync(gitPath)) return dir;
      const parent = resolve2(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}
function resolveProjectRootFromGitFile(worktreePath) {
  try {
    let dir = worktreePath;
    for (let i = 0; i < 30; i++) {
      const gitPath = join2(dir, ".git");
      if (existsSync(gitPath)) {
        const content = readFileSync(gitPath, "utf8").trim();
        if (content.startsWith("gitdir: ")) {
          const gitDir = resolve2(dir, content.slice(8));
          const dotGitDir = resolve2(gitDir, "..", "..");
          if (dotGitDir.endsWith(".git") || dotGitDir.endsWith(".git/") || dotGitDir.endsWith(".git\\")) {
            return resolve2(dotGitDir, "..");
          }
          const commonDirPath = join2(gitDir, "commondir");
          if (existsSync(commonDirPath)) {
            const commonDir = readFileSync(commonDirPath, "utf8").trim();
            const resolvedCommonDir = resolve2(gitDir, commonDir);
            return resolve2(resolvedCommonDir, "..");
          }
        }
        break;
      }
      const parent = resolve2(dir, "..");
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
  }
  return null;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
var PLANNING_ARTIFACT_SUFFIXES = [
  "CONTEXT",
  "CONTEXT-DRAFT",
  "ROADMAP",
  "PLAN",
  "REPLAN",
  "SUMMARY",
  "RESEARCH",
  "UI-SPEC",
  "VALIDATION",
  "ASSESSMENT",
  "UAT",
  "DISCUSSION",
  "EVAL-REVIEW",
  "PARKED",
  "VERIFICATION-FAILED",
  "CONTINUE"
];
var PLANNING_ARTIFACT_NAME_RE = new RegExp(
  `^[MST]\\d+-(${PLANNING_ARTIFACT_SUFFIXES.join("|")})\\.md$`,
  "i"
);
var gsdRootCache = /* @__PURE__ */ new Map();
function resolveGsdPathContract(workRoot, originalProjectRoot) {
  const resolvedWorkRoot = resolve3(workRoot || process.cwd());
  const isWorktree = isGsdWorktreePath(resolvedWorkRoot);
  if (isWorktree && !originalProjectRoot?.trim()) {
    const rawProjectGsd = resolveExternalStateProjectGsdFromWorktreePath(resolvedWorkRoot);
    if (rawProjectGsd) {
      const projectGsd2 = normalizeRealPath(rawProjectGsd);
      return {
        projectRoot: dirname(dirname(projectGsd2)),
        workRoot: resolvedWorkRoot,
        projectGsd: projectGsd2,
        worktreeGsd: normalizeRealPath(join3(resolvedWorkRoot, ".gsd")),
        projectDb: join3(projectGsd2, "gsd.db"),
        isWorktree
      };
    }
  }
  const projectRoot = resolve3(resolveWorktreeProjectRoot(resolvedWorkRoot, originalProjectRoot));
  const projectGsd = normalizeRealPath(join3(projectRoot, ".gsd"));
  const worktreeGsd = isWorktree ? normalizeRealPath(join3(resolvedWorkRoot, ".gsd")) : null;
  return {
    projectRoot,
    workRoot: resolvedWorkRoot,
    projectGsd,
    worktreeGsd,
    projectDb: join3(projectGsd, "gsd.db"),
    isWorktree
  };
}
function normalizeRealPath(p) {
  try {
    return realpathSync2.native(p);
  } catch {
    return resolve3(p);
  }
}
function normCacheKey(p) {
  const r = normalizeRealPath(p);
  const s = r.replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? s.toLowerCase() : s;
}
function gsdRoot(basePath) {
  const cacheKey = normCacheKey(basePath);
  const cached = gsdRootCache.get(cacheKey);
  if (cached) return cached;
  const result = normalizeRealPath(probeGsdRoot(basePath));
  assertNotGlobalGsdHome(basePath, result);
  gsdRootCache.set(cacheKey, result);
  return result;
}
function assertNotGlobalGsdHome(basePath, result) {
  const norm = (p) => {
    let r;
    try {
      r = realpathSync2.native(p);
    } catch {
      r = p;
    }
    const s = r.replaceAll("\\", "/").replace(/\/+$/, "");
    return process.platform === "win32" ? s.toLowerCase() : s;
  };
  let baseNorm;
  let homeNorm;
  let resultNorm;
  let gsdHomeNorm;
  try {
    baseNorm = norm(basePath);
    homeNorm = norm(homedir2());
    resultNorm = norm(result);
    gsdHomeNorm = norm(gsdHome());
  } catch {
    return;
  }
  if (baseNorm === homeNorm && resultNorm === gsdHomeNorm) {
    throw new Error(
      `Refusing to use ${result} as a project .gsd directory \u2014 that is the global GSD home. Run GSD from inside a project directory.`
    );
  }
}
function isInsideGsdWorktree(p) {
  const normalized = p.replaceAll("\\", "/");
  const segment = findWorktreeSegment(normalized);
  if (!segment) return false;
  const name = normalized.slice(segment.afterWorktrees).split("/")[0];
  return name.length > 0;
}
var MIGRATION_STAGING_DIR_PREFIX = ".gsd-migrate-stage-";
function isInsideMigrationStaging(p) {
  return p.replaceAll("\\", "/").split("/").some((seg) => seg.startsWith(MIGRATION_STAGING_DIR_PREFIX));
}
function probeGsdRoot(rawBasePath) {
  const contract = resolveGsdPathContract(rawBasePath);
  if (contract.isWorktree) return contract.projectGsd;
  const local = join3(rawBasePath, ".gsd");
  if (existsSync2(local)) return local;
  if (isInsideGsdWorktree(rawBasePath)) return local;
  if (isInsideMigrationStaging(rawBasePath)) return local;
  let basePath;
  try {
    basePath = realpathSync2.native(rawBasePath);
  } catch {
    basePath = rawBasePath;
  }
  if (basePath !== rawBasePath && isInsideGsdWorktree(basePath)) return local;
  if (basePath !== rawBasePath && isInsideMigrationStaging(basePath)) return local;
  let gitRoot = null;
  try {
    const out = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: basePath,
      encoding: "utf-8"
    });
    if (out.status === 0) {
      const r = out.stdout.trim();
      if (r) gitRoot = normalize(r);
    }
  } catch {
  }
  const normPath = (p) => {
    let r;
    try {
      r = realpathSync2.native(p);
    } catch {
      r = p;
    }
    const s = r.replaceAll("\\", "/").replace(/\/+$/, "");
    return process.platform === "win32" ? s.toLowerCase() : s;
  };
  let gsdHomeNorm;
  try {
    gsdHomeNorm = normPath(gsdHome());
  } catch {
    gsdHomeNorm = "";
  }
  if (gitRoot) {
    const candidate = join3(gitRoot, ".gsd");
    if (existsSync2(candidate) && normPath(candidate) !== gsdHomeNorm) return candidate;
  }
  if (gitRoot && basePath !== gitRoot) {
    let cur = dirname(basePath);
    while (cur !== basePath) {
      const candidate = join3(cur, ".gsd");
      if (existsSync2(candidate) && normPath(candidate) !== gsdHomeNorm) return candidate;
      if (cur === gitRoot) break;
      basePath = cur;
      cur = dirname(cur);
    }
  }
  return local;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/shared/format-utils.ts
function truncateWithEllipsis(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/jsonl-utils.ts
var MAX_JSONL_BYTES = 10 * 1024 * 1024;
function parseJSONL(raw) {
  const source = raw.length > MAX_JSONL_BYTES ? raw.slice(-MAX_JSONL_BYTES) : raw;
  return source.trim().split("\n").map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-git-bridge.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync3, readFileSync as readFileSync2, rmSync, writeFileSync } from "node:fs";
import { join as join5 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/errors.ts
var GSD_GIT_ERROR = "GSD_GIT_ERROR";
var GSDError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "GSDError";
    this.code = code;
  }
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/git-constants.ts
var LEAKING_GIT_ENV_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_NAMESPACE"
];
function buildSafeParentEnv() {
  const safe = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!LEAKING_GIT_ENV_VARS.includes(k)) {
      safe[k] = v;
    }
  }
  return safe;
}
var GIT_NO_PROMPT_ENV = {
  ...buildSafeParentEnv(),
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  GIT_SVN_ID: "",
  LC_ALL: "C"
  // force English git output so stderr string checks work on all locales (#1997)
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/error-utils.ts
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/debug-logger.ts
import { appendFileSync, mkdirSync, readdirSync as readdirSync2, unlinkSync } from "node:fs";
import { join as join4 } from "node:path";
var _enabled = false;
var _counters = {
  deriveStateCalls: 0,
  deriveStateTotalMs: 0,
  ttsrChecks: 0,
  ttsrTotalMs: 0,
  ttsrPeakBuffer: 0,
  parseRoadmapCalls: 0,
  parseRoadmapTotalMs: 0,
  parsePlanCalls: 0,
  parsePlanTotalMs: 0,
  dispatches: 0,
  renders: 0,
  gitInvocations: 0
};
function debugCount(counter, value = 1) {
  if (!_enabled) return;
  _counters[counter] += value;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-git-bridge.ts
var NATIVE_GSD_GIT_ENABLED = process.env.GSD_ENABLE_NATIVE_GSD_GIT === "1";
var nativeModule2 = null;
var loadAttempted2 = false;
function loadNative2() {
  if (loadAttempted2) return nativeModule2;
  loadAttempted2 = true;
  if (!NATIVE_GSD_GIT_ENABLED) return nativeModule2;
  try {
    const mod = (init_native(), __toCommonJS(native_exports));
    if (mod.gitCurrentBranch && mod.gitHasChanges) {
      nativeModule2 = mod;
    }
  } catch {
  }
  return nativeModule2;
}
function gitExec(basePath, args, allowFailure = false) {
  debugCount("gitInvocations");
  try {
    return execFileSync("git", args, {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    }).trim();
  } catch (err) {
    if (allowFailure) return "";
    throw new GSDError(GSD_GIT_ERROR, `git ${args.join(" ")} failed in ${basePath}: ${getErrorMessage(err)}`);
  }
}
function nativeWorkingTreeStatus(basePath) {
  const native = loadNative2();
  if (native) {
    return native.gitWorkingTreeStatus(basePath);
  }
  return gitExec(basePath, ["status", "--porcelain"], true);
}
function nativeDiffStat(basePath, fromRef, toRef) {
  const native = loadNative2();
  if (native) {
    return native.gitDiffStat(basePath, fromRef, toRef);
  }
  let args;
  if (fromRef === "HEAD" && toRef === "WORKDIR") {
    args = ["diff", "--stat", "HEAD"];
  } else if (fromRef === "HEAD" && toRef === "INDEX") {
    args = ["diff", "--stat", "--cached", "HEAD"];
  } else {
    args = ["diff", "--stat", fromRef, toRef];
  }
  const result = gitExec(basePath, args, true);
  let filesChanged = 0, insertions = 0, deletions = 0;
  const statsMatch = result.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
  if (statsMatch) {
    filesChanged = parseInt(statsMatch[1] ?? "0", 10);
    insertions = parseInt(statsMatch[2] ?? "0", 10);
    deletions = parseInt(statsMatch[3] ?? "0", 10);
  }
  return { filesChanged, insertions, deletions, summary: result };
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/session-forensics.ts
var READ_ONLY_TOOL_NAMES = /* @__PURE__ */ new Set([
  "read",
  "memory_query",
  "gsd_resume",
  "gsd_exec_search",
  "grep",
  "find",
  "ls",
  "glob",
  "skill"
]);
var UNSAFE_SHELL_TOKENS_RE = /(?:&&|\|\||;|[<>]|`|\$\(|\n)/;
var READ_ONLY_EXEC_COMMAND_RE = /^\s*(cat|head|tail|ls|find|grep|rg|git\s+(status|log|show|diff|branch|remote|rev-parse|ls-files)|npm\s+(ls|list|info|view|show|outdated|audit|doctor|ping|--version|-v)|node\s+(--version|-v\b)|python[23]?\s+(--version|-V\b)|jq|yq|env|printenv)\b[\w\s./:@,+-]*$/;
function isReadOnlyReconnaissanceTool(call) {
  const name = call.name.toLowerCase();
  if (READ_ONLY_TOOL_NAMES.has(name)) return true;
  if (name !== "gsd_exec") return false;
  const command = String(call.input.command || call.input.cmd || "").trim();
  if (!command) return false;
  if (UNSAFE_SHELL_TOKENS_RE.test(command)) return false;
  return READ_ONLY_EXEC_COMMAND_RE.test(command);
}
function classifyTraceProgress(trace) {
  if (trace.toolCalls.length === 0) return { isReadOnlyReconnaissanceOnly: false };
  for (const call of trace.toolCalls) {
    if (!isReadOnlyReconnaissanceTool(call)) {
      return { isReadOnlyReconnaissanceOnly: false };
    }
  }
  return { isReadOnlyReconnaissanceOnly: true };
}
function extractLastSession(entries) {
  let lastSessionIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "session") {
      lastSessionIdx = i;
      break;
    }
  }
  return lastSessionIdx >= 0 ? entries.slice(lastSessionIdx) : entries;
}
function extractTrace(entries) {
  const toolCalls = [];
  const filesWritten = [];
  const filesRead = [];
  const commandsRun = [];
  const errors = [];
  let lastReasoning = "";
  const pendingTools = /* @__PURE__ */ new Map();
  const seenWritten = /* @__PURE__ */ new Set();
  const seenRead = /* @__PURE__ */ new Set();
  for (const raw of entries) {
    const entry = raw;
    if (entry.type !== "message" || !entry.message) continue;
    const msg = entry.message;
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text" && part.text) {
          lastReasoning = String(part.text);
        }
        if (part.type === "toolCall") {
          const name = String(part.name || "unknown").toLowerCase();
          const input = part.arguments || part.input || {};
          const id = String(part.id || "");
          if (id) {
            pendingTools.set(id, { name, input });
          }
          const path = input.path ? String(input.path) : null;
          if (path) {
            if (name === "write" || name === "edit") {
              if (!seenWritten.has(path)) {
                seenWritten.add(path);
                filesWritten.push(path);
              }
            } else if (name === "read") {
              if (!seenRead.has(path)) {
                seenRead.add(path);
                filesRead.push(path);
              }
            }
          }
          if ((name === "bash" || name === "bg_shell") && input.command) {
            commandsRun.push({ command: String(input.command), failed: false });
          }
        }
      }
    }
    if (msg.role === "toolResult") {
      const id = String(msg.toolCallId || "");
      const isError = !!msg.isError;
      const resultText = extractResultText(msg);
      const pending = pendingTools.get(id);
      if (pending) {
        toolCalls.push({
          name: pending.name,
          input: redactInput(pending.name, pending.input),
          result: resultText.slice(0, 500),
          isError
        });
        pendingTools.delete(id);
        if (isError && (pending.name === "bash" || pending.name === "bg_shell")) {
          const lastCmd = findLast(commandsRun, (c) => c.command === String(pending.input.command));
          if (lastCmd) lastCmd.failed = true;
        }
      }
      if (isError && resultText) {
        const trimmed = resultText.trim();
        const isBenignNoMatch = pending?.name === "bash" && /^\(no output\)\s*\n\s*Command exited with code 1$/m.test(trimmed);
        const isUserSkip = /^Skipped due to queued user message/i.test(trimmed);
        if (!isBenignNoMatch && !isUserSkip) {
          errors.push(resultText.slice(0, 300));
        }
      }
    }
  }
  for (const [, pending] of pendingTools) {
    const missingResultError = `Tool call ${pending.name} started but no toolResult was recorded`;
    toolCalls.push({
      name: pending.name,
      input: redactInput(pending.name, pending.input),
      result: "missing tool result (stream/tool-call abort before execution)",
      isError: true
    });
    errors.push(missingResultError);
    if (pending.name === "bash" || pending.name === "bg_shell") {
      const lastCmd = findLast(commandsRun, (c) => c.command === String(pending.input.command));
      if (lastCmd) lastCmd.failed = true;
    }
  }
  return {
    toolCalls,
    filesWritten,
    filesRead,
    commandsRun,
    errors,
    lastReasoning: lastReasoning.slice(-600).trim(),
    toolCallCount: toolCalls.length
  };
}
function getGitChanges(basePath) {
  try {
    const status = nativeWorkingTreeStatus(basePath);
    if (!status) return null;
    const diffStat = nativeDiffStat(basePath, "HEAD", "WORKDIR").summary;
    const stagedStat = nativeDiffStat(basePath, "HEAD", "INDEX").summary;
    const parts = [];
    if (status) parts.push(`Status:
${status}`);
    if (stagedStat) parts.push(`Staged:
${stagedStat}`);
    if (diffStat) parts.push(`Unstaged:
${diffStat}`);
    return parts.join("\n\n");
  } catch {
    return null;
  }
}
function synthesizeCrashRecovery(basePath, unitType, unitId, sessionFile, activityDir) {
  try {
    let trace = null;
    if (sessionFile && existsSync4(sessionFile)) {
      const nativeResult = nativeParseJsonlTail(sessionFile, MAX_JSONL_BYTES);
      if (nativeResult) {
        const sessionEntries = extractLastSession(nativeResult.entries);
        trace = extractTrace(sessionEntries);
      } else {
        const stat = statSync3(sessionFile, { throwIfNoEntry: false });
        const fileSize = stat?.size ?? 0;
        if (fileSize <= MAX_JSONL_BYTES * 2) {
          const raw = readFileSync3(sessionFile, "utf-8");
          const allEntries = parseJSONL(raw);
          const sessionEntries = extractLastSession(allEntries);
          trace = extractTrace(sessionEntries);
        }
      }
    }
    if (!trace || trace.toolCallCount === 0) {
      const fallbackTrace = readLastActivityLog(activityDir);
      if (fallbackTrace && fallbackTrace.toolCallCount > 0) {
        trace = fallbackTrace;
      }
    }
    if (!trace) {
      trace = {
        toolCalls: [],
        filesWritten: [],
        filesRead: [],
        commandsRun: [],
        errors: [],
        lastReasoning: "",
        toolCallCount: 0
      };
    }
    const gitChanges = getGitChanges(basePath);
    const prompt = formatRecoveryPrompt(unitType, unitId, trace, gitChanges);
    return { unitType, unitId, trace, gitChanges, prompt };
  } catch {
    return null;
  }
}
function getDeepDiagnostic(basePath, worktreePath) {
  let trace = null;
  try {
    if (worktreePath) {
      const wtActivityDir = join6(gsdRoot(worktreePath), "activity");
      trace = readLastActivityLog(wtActivityDir);
    }
  } catch {
  }
  if (!trace || trace.toolCallCount === 0) {
    const activityDir = join6(gsdRoot(basePath), "activity");
    trace = readLastActivityLog(activityDir);
  }
  if (!trace || trace.toolCallCount === 0) return null;
  return formatTraceSummary(trace);
}
function readActiveMilestoneId(basePath) {
  try {
    const statePath = join6(gsdRoot(basePath), "STATE.md");
    if (!existsSync4(statePath)) return null;
    const content = readFileSync3(statePath, "utf-8");
    const match = /\*\*Active Milestone:\*\*\s*(\S+)/i.exec(content);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
function formatRecoveryPrompt(unitType, unitId, trace, gitChanges) {
  const sections = [];
  sections.push(
    "## Recovery Briefing",
    "",
    `You are resuming \`${unitType}\` for \`${unitId}\` after an interruption.`,
    `The previous session completed **${trace.toolCallCount} tool calls** before stopping.`,
    "Use this briefing to pick up exactly where it left off. Do NOT redo completed work."
  );
  if (trace.toolCalls.length > 0) {
    sections.push("", "### Completed Tool Calls");
    const summary = compressToolCallTrace(trace.toolCalls);
    sections.push(summary);
  }
  if (trace.filesWritten.length > 0) {
    sections.push(
      "",
      "### Files Already Written/Edited",
      ...trace.filesWritten.map((f) => `- \`${f}\``),
      "",
      "These files exist on disk from the previous run. Verify they look correct before continuing."
    );
  }
  const significantCommands = trace.commandsRun.filter(
    (c) => !c.command.startsWith("git ") || c.failed
  );
  if (significantCommands.length > 0) {
    sections.push("", "### Commands Already Run");
    for (const c of significantCommands.slice(-10)) {
      const status = c.failed ? " \u274C" : " \u2713";
      sections.push(`- \`${truncateWithEllipsis(c.command, 121)}\`${status}`);
    }
  }
  if (trace.errors.length > 0) {
    sections.push(
      "",
      "### Errors Before Interruption",
      ...trace.errors.slice(-3).map((e) => `- ${truncateWithEllipsis(e, 201)}`)
    );
  }
  if (gitChanges) {
    sections.push(
      "",
      "### Current Git State (filesystem truth)",
      "```",
      gitChanges,
      "```"
    );
  }
  if (trace.lastReasoning) {
    sections.push(
      "",
      "### Last Agent Reasoning Before Interruption",
      `> ${trace.lastReasoning.replace(/\n/g, "\n> ")}`
    );
  }
  sections.push(
    "",
    "### Resume Instructions",
    "1. Check the task plan for remaining work",
    "2. Verify files listed above exist and look correct on disk",
    "3. Continue from where the previous session left off",
    "4. Do NOT re-read files or re-run commands that already succeeded above"
  );
  return sections.join("\n");
}
function compressToolCallTrace(calls) {
  const lines = [];
  let readBatch = [];
  function flushReads() {
    if (readBatch.length === 0) return;
    if (readBatch.length <= 2) {
      for (const path of readBatch) lines.push(`  read \`${path}\``);
    } else {
      lines.push(`  read ${readBatch.length} files: ${readBatch.map((p) => `\`${basename2(p)}\``).join(", ")}`);
    }
    readBatch = [];
  }
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const num = i + 1;
    if (call.name === "read" && call.input.path) {
      readBatch.push(String(call.input.path));
      continue;
    }
    flushReads();
    const err = call.isError ? " \u274C" : "";
    if (call.name === "write" || call.name === "edit") {
      lines.push(`${num}. ${call.name} \`${call.input.path || "?"}\`${err}`);
    } else if (call.name === "bash" || call.name === "bg_shell") {
      const cmd = truncateWithEllipsis(String(call.input.command || ""), 81);
      lines.push(`${num}. ${call.name}: \`${cmd}\`${err}`);
    } else {
      lines.push(`${num}. ${call.name}${err}`);
    }
  }
  flushReads();
  return lines.join("\n");
}
function formatTraceSummary(trace) {
  const parts = [];
  parts.push(`Tool calls completed: ${trace.toolCallCount}`);
  if (trace.filesWritten.length > 0) {
    parts.push(`Files written: ${trace.filesWritten.map((f) => `\`${f}\``).join(", ")}`);
  }
  if (trace.commandsRun.length > 0) {
    const cmds = trace.commandsRun.slice(-5).map((c) => `\`${truncateWithEllipsis(c.command, 81)}\`${c.failed ? " \u274C" : ""}`);
    parts.push(`Commands run: ${cmds.join(", ")}`);
  }
  if (trace.errors.length > 0) {
    parts.push(`Errors: ${trace.errors.slice(-3).join("; ")}`);
  }
  return parts.join("\n");
}
function readLastActivityLog(activityDir) {
  if (!activityDir) return null;
  try {
    if (!existsSync4(activityDir)) return null;
    const files = readdirSync3(activityDir).filter((f) => f.endsWith(".jsonl")).sort();
    if (files.length === 0) return null;
    const lastFile = files[files.length - 1];
    const filePath = join6(activityDir, lastFile);
    const nativeResult = nativeParseJsonlTail(filePath, MAX_JSONL_BYTES);
    if (nativeResult) {
      return extractTrace(nativeResult.entries);
    }
    const raw = readFileSync3(filePath, "utf-8");
    return extractTrace(parseJSONL(raw));
  } catch {
    return null;
  }
}
function extractResultText(msg) {
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((p) => p.type === "text").map((p) => String(p.text || "")).join(" ");
  }
  return "";
}
function redactInput(name, input) {
  const safe = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "content" || key === "oldText" || key === "newText") {
      safe[key] = typeof value === "string" ? truncateWithEllipsis(value, 101) : "[redacted]";
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
function findLast(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return void 0;
}
export {
  classifyTraceProgress,
  extractTrace,
  getDeepDiagnostic,
  readActiveMilestoneId,
  synthesizeCrashRecovery
};
