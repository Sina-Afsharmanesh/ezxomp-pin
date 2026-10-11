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

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/auto/infra-errors.ts
var INFRA_ERROR_CODES = /* @__PURE__ */ new Set([
  "ENOSPC",
  // disk full
  "ENOMEM",
  // out of memory
  "EROFS",
  // read-only file system
  "EDQUOT",
  // disk quota exceeded
  "EMFILE",
  // too many open files (process)
  "ENFILE",
  // too many open files (system)
  "EAGAIN",
  // resource temporarily unavailable (resource exhaustion)
  "ENOBUFS",
  // no buffer space available (transient pipe exhaustion)
  "ECONNREFUSED",
  // connection refused (offline / local server down)
  "ENOTFOUND",
  // DNS lookup failed (offline / no network)
  "ENETUNREACH"
  // network unreachable (offline / no route)
]);
function isInfrastructureError(err) {
  if (err && typeof err === "object") {
    const code = err.code;
    if (typeof code === "string" && INFRA_ERROR_CODES.has(code)) return code;
  }
  const msg = err instanceof Error ? err.message : String(err);
  for (const code of INFRA_ERROR_CODES) {
    if (msg.includes(code)) return code;
  }
  if (msg.includes("database disk image is malformed")) return "SQLITE_CORRUPT";
  return null;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/debug-logger.ts
import { appendFileSync, mkdirSync, readdirSync as readdirSync2, unlinkSync } from "node:fs";
import { join as join4 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
import { readdirSync, existsSync as existsSync2, realpathSync as realpathSync2, statSync as statSync2, Dirent } from "node:fs";
import { join as join3, dirname, normalize, relative, resolve as resolve3 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { spawnSync } from "node:child_process";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-parser-bridge.ts
var NATIVE_GSD_PARSER_ENABLED = process.env.GSD_ENABLE_NATIVE_GSD_PARSER === "1";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/gsd-home.ts
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/worktree-root.ts
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join as join2, resolve as resolve2 } from "node:path";

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

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/debug-logger.ts
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
var TRANSIENT_GIT_RETRY_CODES = /* @__PURE__ */ new Set(["ENOBUFS", "EAGAIN"]);
var GIT_RETRY_DELAY_MS = 200;
var nativeModule = null;
var loadAttempted = false;
function loadNative() {
  if (loadAttempted) return nativeModule;
  loadAttempted = true;
  if (!NATIVE_GSD_GIT_ENABLED) return nativeModule;
  try {
    const mod = (init_native(), __toCommonJS(native_exports));
    if (mod.gitCurrentBranch && mod.gitHasChanges) {
      nativeModule = mod;
    }
  } catch {
  }
  return nativeModule;
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
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function isRetryableGitError(err) {
  const code = isInfrastructureError(err) ?? isInfrastructureError(err?.stderr ?? "");
  return code !== null && TRANSIENT_GIT_RETRY_CODES.has(code);
}
function execGitFileSyncWithRetry(basePath, args, options) {
  debugCount("gitInvocations");
  try {
    return execFileSync("git", args, {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
      ...options
    }).trim();
  } catch (err) {
    if (!isRetryableGitError(err)) throw err;
    sleepSync(GIT_RETRY_DELAY_MS);
    debugCount("gitInvocations");
    return execFileSync("git", args, {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
      ...options
    }).trim();
  }
}
function gitFileExec(basePath, args, allowFailure = false) {
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
function nativeGetCurrentBranch(basePath) {
  const native = loadNative();
  if (native) {
    const branch = native.gitCurrentBranch(basePath);
    return branch ?? "";
  }
  return gitExec(basePath, ["branch", "--show-current"]);
}
function nativeDetectMainBranch(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitMainBranch(basePath);
  }
  const symbolic = gitExec(basePath, ["symbolic-ref", "refs/remotes/origin/HEAD"], true);
  if (symbolic) {
    const match = symbolic.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1];
  }
  const mainExists = gitExec(basePath, ["show-ref", "--verify", "refs/heads/main"], true);
  if (mainExists) return "main";
  const masterExists = gitExec(basePath, ["show-ref", "--verify", "refs/heads/master"], true);
  if (masterExists) return "master";
  const head = gitExec(basePath, ["rev-parse", "--verify", "--quiet", "HEAD"], true);
  if (!head && gitExec(basePath, ["rev-parse", "--git-dir"], true)) return "";
  return gitExec(basePath, ["branch", "--show-current"]);
}
function nativeBranchExists(basePath, branch) {
  const native = loadNative();
  if (native) {
    const refExists = native.gitBranchExists(basePath, branch);
    if (refExists) return true;
    return branchExistsIncludingUnborn(
      false,
      currentBranchIncludingUnborn(
        () => native.gitCurrentBranch(basePath),
        () => gitExec(basePath, ["symbolic-ref", "--quiet", "--short", "HEAD"], true)
      ),
      branch
    );
  }
  const result = gitExec(basePath, ["show-ref", "--verify", `refs/heads/${branch}`], true);
  const current = gitExec(basePath, ["symbolic-ref", "--quiet", "--short", "HEAD"], true);
  return branchExistsIncludingUnborn(result !== "", current, branch);
}
function currentBranchIncludingUnborn(nativeCurrentBranch, symbolicCurrentBranch) {
  try {
    const currentBranch = nativeCurrentBranch();
    if (currentBranch) return currentBranch;
  } catch {
  }
  return symbolicCurrentBranch() || null;
}
function branchExistsIncludingUnborn(refExists, currentBranch, branch) {
  return refExists || currentBranch === branch;
}
function nativeHasMergeConflicts(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitHasMergeConflicts(basePath);
  }
  const result = gitExec(basePath, ["diff", "--name-only", "--diff-filter=U"], true);
  return result !== "";
}
function nativeWorkingTreeStatus(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitWorkingTreeStatus(basePath);
  }
  return gitExec(basePath, ["status", "--porcelain"], true);
}
var _hasChangesCachedResult = false;
var _hasChangesCachedAt = 0;
var _hasChangesCachedPath = "";
var HAS_CHANGES_CACHE_TTL_MS = 1e4;
function nativeHasChanges(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitHasChanges(basePath);
  }
  const now = Date.now();
  if (basePath === _hasChangesCachedPath && now - _hasChangesCachedAt < HAS_CHANGES_CACHE_TTL_MS) {
    return _hasChangesCachedResult;
  }
  const result = gitExec(basePath, ["status", "--short"], true);
  const hasChanges = result !== "";
  _hasChangesCachedResult = hasChanges;
  _hasChangesCachedAt = now;
  _hasChangesCachedPath = basePath;
  return hasChanges;
}
function _resetHasChangesCache() {
  _hasChangesCachedResult = false;
  _hasChangesCachedAt = 0;
  _hasChangesCachedPath = "";
}
function nativeCommitCountBetween(basePath, fromRef, toRef) {
  const native = loadNative();
  if (native) {
    return native.gitCommitCountBetween(basePath, fromRef, toRef);
  }
  const result = gitExec(basePath, ["rev-list", "--count", `${fromRef}..${toRef}`], true);
  return parseInt(result, 10) || 0;
}
function nativeIsRepo(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitIsRepo(basePath);
  }
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd: basePath, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function nativeHasCommittedHead(basePath) {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: basePath,
      stdio: ["ignore", "ignore", "ignore"],
      env: GIT_NO_PROMPT_ENV
    });
    return true;
  } catch {
    return false;
  }
}
function nativeIsCurrentUnbornBranch(basePath, branch) {
  const native = loadNative();
  const currentBranch = currentBranchIncludingUnborn(
    () => native?.gitCurrentBranch(basePath) ?? null,
    () => gitExec(basePath, ["symbolic-ref", "--quiet", "--short", "HEAD"], true)
  );
  return currentBranch === branch && !nativeHasCommittedHead(basePath);
}
function nativeHasStagedChanges(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitHasStagedChanges(basePath);
  }
  const result = gitExec(basePath, ["diff", "--cached", "--stat"], true);
  return result !== "";
}
function nativeDiffStat(basePath, fromRef, toRef) {
  const native = loadNative();
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
function nativeDiffNameStatus(basePath, fromRef, toRef, pathspec, useMergeBase) {
  const native = loadNative();
  if (native) {
    return native.gitDiffNameStatus(basePath, fromRef, toRef, pathspec, useMergeBase);
  }
  const separator = useMergeBase ? "..." : " ";
  const args = ["diff", "--name-status", `${fromRef}${separator}${toRef}`];
  if (pathspec) args.push("--", pathspec);
  const result = gitExec(basePath, args, true);
  if (!result) return [];
  return result.split("\n").filter(Boolean).map((line) => {
    const [status, ...pathParts] = line.split("	");
    return { status: status ?? "", path: pathParts.join("	") };
  });
}
function nativeDiffNumstat(basePath, fromRef, toRef, useMergeBase) {
  const native = loadNative();
  if (native && !useMergeBase) {
    return native.gitDiffNumstat(basePath, fromRef, toRef);
  }
  const refspec = useMergeBase ? `${fromRef}...${toRef}` : void 0;
  const args = refspec ? ["diff", "--numstat", refspec] : ["diff", "--numstat", fromRef, toRef];
  const result = gitExec(basePath, args, true);
  if (!result) return [];
  return result.split("\n").filter(Boolean).map((line) => {
    const [a, r, ...pathParts] = line.split("	");
    return {
      added: a === "-" ? 0 : parseInt(a ?? "0", 10),
      removed: r === "-" ? 0 : parseInt(r ?? "0", 10),
      path: pathParts.join("	")
    };
  });
}
function nativeDiffContent(basePath, fromRef, toRef, pathspec, exclude, useMergeBase) {
  const native = loadNative();
  if (native) {
    return native.gitDiffContent(basePath, fromRef, toRef, pathspec, exclude, useMergeBase);
  }
  const separator = useMergeBase ? "..." : " ";
  const args = ["diff", `${fromRef}${separator}${toRef}`];
  if (pathspec) {
    args.push("--", pathspec);
  } else if (exclude) {
    args.push("--", ".", `:(exclude)${exclude}`);
  }
  return gitExec(basePath, args, true);
}
function nativeLogOneline(basePath, fromRef, toRef) {
  const native = loadNative();
  if (native) {
    return native.gitLogOneline(basePath, fromRef, toRef);
  }
  const result = gitExec(basePath, ["log", "--oneline", `${fromRef}..${toRef}`], true);
  if (!result) return [];
  return result.split("\n").filter(Boolean).map((line) => {
    const sha = line.substring(0, 7);
    const message = line.substring(8);
    return { sha, message };
  });
}
function nativeWorktreeList(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitWorktreeList(basePath);
  }
  const result = gitExec(basePath, ["worktree", "list", "--porcelain"], true);
  if (!result) return [];
  const entries = [];
  const blocks = result.replaceAll("\r\n", "\n").split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    const wtLine = lines.find((l) => l.startsWith("worktree "));
    const branchLine = lines.find((l) => l.startsWith("branch "));
    const isBare = lines.some((l) => l === "bare");
    if (wtLine) {
      entries.push({
        path: wtLine.replace("worktree ", ""),
        branch: branchLine ? branchLine.replace("branch refs/heads/", "") : "",
        isBare
      });
    }
  }
  return entries;
}
function nativeBranchList(basePath, pattern) {
  const native = loadNative();
  if (native) {
    return native.gitBranchList(basePath, pattern);
  }
  const args = ["branch", "--list"];
  if (pattern) args.push(pattern);
  const result = gitFileExec(basePath, args, true);
  if (!result) return [];
  return result.split("\n").map((b) => b.trim().replace(/^[*+]\s+/, "")).filter(Boolean);
}
function nativeBranchListMerged(basePath, target, pattern) {
  const native = loadNative();
  if (native) {
    return native.gitBranchListMerged(basePath, target, pattern);
  }
  const args = ["branch", "--merged", target];
  if (pattern) args.push("--list", pattern);
  const result = gitFileExec(basePath, args, true);
  if (!result) return [];
  return result.split("\n").map((b) => b.trim()).filter(Boolean);
}
function nativeLsFiles(basePath, pathspec) {
  const native = loadNative();
  if (native) {
    return native.gitLsFiles(basePath, pathspec);
  }
  const result = gitFileExec(basePath, ["ls-files", pathspec], true);
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}
function nativeForEachRef(basePath, prefix) {
  const native = loadNative();
  if (native) {
    return native.gitForEachRef(basePath, prefix);
  }
  const result = gitFileExec(basePath, ["for-each-ref", prefix, "--format=%(refname)"], true);
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}
function nativeConflictFiles(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitConflictFiles(basePath);
  }
  const result = gitExec(basePath, ["diff", "--name-only", "--diff-filter=U"], true);
  if (!result) return [];
  return result.split("\n").filter(Boolean);
}
function nativeBatchInfo(basePath) {
  const native = loadNative();
  if (native) {
    return native.gitBatchInfo(basePath);
  }
  const branch = gitExec(basePath, ["branch", "--show-current"], true);
  const status = gitExec(basePath, ["status", "--porcelain"], true);
  const hasChanges = status !== "";
  let stagedCount = 0;
  let unstagedCount = 0;
  if (status) {
    for (const line of status.split("\n")) {
      if (!line || line.length < 2) continue;
      const x = line[0];
      const y = line[1];
      if (x !== " " && x !== "?") stagedCount++;
      if (y !== " " && y !== "?") unstagedCount++;
      if (x === "?" && y === "?") unstagedCount++;
    }
  }
  return {
    branch,
    hasChanges,
    status,
    stagedCount,
    unstagedCount
  };
}
function nativeInit(basePath, initialBranch) {
  const native = loadNative();
  if (native) {
    native.gitInit(basePath, initialBranch);
    return;
  }
  const args = ["init"];
  if (initialBranch) args.push("-b", initialBranch);
  gitFileExec(basePath, args);
}
function nativeAddAll(basePath) {
  const native = loadNative();
  if (native) {
    native.gitAddAll(basePath);
    return;
  }
  gitFileExec(basePath, ["add", "-A"]);
}
function nativeAddTracked(basePath) {
  gitFileExec(basePath, ["add", "-u"]);
}
function nativeIsIgnored(basePath, path) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", path], {
      cwd: basePath,
      stdio: "pipe",
      env: GIT_NO_PROMPT_ENV
    });
    return true;
  } catch {
    return false;
  }
}
function isDotGsdIgnored(basePath) {
  return [".gsd", ".gsd/"].some((path) => nativeIsIgnored(basePath, path));
}
function isGitignoreManagementDisabled(basePath) {
  const prefsPath = join5(basePath, ".gsd", "PREFERENCES.md");
  if (!existsSync3(prefsPath)) return false;
  try {
    const content = readFileSync2(prefsPath, "utf-8");
    return /^\s*manage_gitignore\s*:\s*false\s*$/m.test(content);
  } catch {
    return false;
  }
}
function trySelfHealGsdGitignore(basePath) {
  if (isGitignoreManagementDisabled(basePath)) return false;
  const gitignorePath = join5(basePath, ".gitignore");
  try {
    const existing = existsSync3(gitignorePath) ? readFileSync2(gitignorePath, "utf-8") : "";
    const lines = new Set(
      existing.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    );
    if (lines.has(".gsd") || lines.has(".gsd/")) return true;
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    const block = `${prefix}
# \u2500\u2500 GSD self-heal: .gsd is a symlink to external state \u2500\u2500
.gsd
`;
    writeFileSync(gitignorePath, existing + block, "utf-8");
    return true;
  } catch {
    return false;
  }
}
function stageUntrackedExcludingDotGsd(basePath) {
  gitFileExec(basePath, ["add", "-u"]);
  const status = gitFileExec(basePath, ["status", "--porcelain=v1", "-z"], true);
  if (!status) return;
  const untracked = [];
  for (const entry of status.split("\0")) {
    if (!entry) continue;
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    if (code !== "??") continue;
    if (path === ".gsd" || path.startsWith(".gsd/")) continue;
    if (path === ".gsd-id" || path === ".gsd.migrating") continue;
    if (path === ".bg-shell" || path.startsWith(".bg-shell/")) continue;
    untracked.push(path);
  }
  if (untracked.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < untracked.length; i += CHUNK) {
    gitFileExec(basePath, ["add", "--", ...untracked.slice(i, i + CHUNK)]);
  }
}
function fallbackStageWithSymlinkedDotGsd(basePath) {
  if (isDotGsdIgnored(basePath)) {
    gitFileExec(basePath, ["add", "-A"]);
    return;
  }
  if (trySelfHealGsdGitignore(basePath)) {
    gitFileExec(basePath, ["add", "-A"]);
    return;
  }
  stageUntrackedExcludingDotGsd(basePath);
}
function nativeAddAllWithExclusions(basePath, exclusions) {
  if (exclusions.length === 0) {
    nativeAddAll(basePath);
    return;
  }
  const pathspecs = exclusions.map((e) => `:!${e}`);
  try {
    execFileSync("git", ["add", "-A", "--", ...pathspecs], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    });
  } catch (err) {
    const stderr = err?.stderr ?? "";
    const infraCode = isInfrastructureError(err) ?? isInfrastructureError(stderr);
    if (infraCode) {
      throw err;
    }
    if (stderr.includes("ignored by one of your .gitignore files")) {
      return;
    }
    if (stderr.includes("beyond a symbolic link")) {
      fallbackStageWithSymlinkedDotGsd(basePath);
      return;
    }
    const stderrDetail = stderr.trim() ? `; stderr: ${stderr.trim()}` : "";
    throw new GSDError(GSD_GIT_ERROR, `git add -A with exclusions failed in ${basePath}: ${getErrorMessage(err)}${stderrDetail}`);
  }
}
function nativeAddPaths(basePath, paths) {
  const native = loadNative();
  if (native) {
    native.gitAddPaths(basePath, paths);
    return;
  }
  gitFileExec(basePath, ["add", "--", ...paths]);
}
function nativeResetPaths(basePath, paths) {
  const native = loadNative();
  if (native) {
    native.gitResetPaths(basePath, paths);
    return;
  }
  for (const p of paths) {
    gitExec(basePath, ["reset", "HEAD", "--", p], true);
  }
}
function nativeCommit(basePath, message, options) {
  try {
    const args = ["commit", "-F", "-"];
    if (options?.allowEmpty) args.push("--allow-empty");
    const result = execGitFileSyncWithRetry(basePath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      input: message
    });
    return result;
  } catch (err) {
    const errObj = err;
    const combined = [errObj.stdout, errObj.stderr, errObj.message].filter(Boolean).join(" ");
    if (combined.includes("nothing to commit") || combined.includes("nothing added to commit") || combined.includes("no changes added")) {
      return null;
    }
    const commitDetail = errObj.stderr?.trim() || errObj.message || "git commit failed";
    const wrapped = new Error(`git commit failed: ${commitDetail}`);
    const typedWrapped = wrapped;
    typedWrapped.stdout = errObj.stdout;
    typedWrapped.stderr = errObj.stderr;
    typedWrapped.status = errObj.status;
    typedWrapped.signal = errObj.signal;
    throw wrapped;
  }
}
function nativeCheckoutBranch(basePath, branch) {
  if (nativeIsCurrentUnbornBranch(basePath, branch)) return;
  const native = loadNative();
  if (native) {
    native.gitCheckoutBranch(basePath, branch);
    return;
  }
  execFileSync("git", ["checkout", branch], {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8"
  });
}
function nativeCheckoutNewBranch(basePath, branch) {
  execFileSync("git", ["checkout", "-b", branch], {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: GIT_NO_PROMPT_ENV
  });
}
function nativeCheckoutTheirs(basePath, paths) {
  const native = loadNative();
  if (native) {
    native.gitCheckoutTheirs(basePath, paths);
    return;
  }
  for (const path of paths) {
    gitFileExec(basePath, ["checkout", "--theirs", "--", path]);
  }
}
function nativeMergeSquash(basePath, branch) {
  const native = loadNative();
  if (native) {
    return native.gitMergeSquash(basePath, branch);
  }
  try {
    execFileSync("git", ["merge", "--squash", branch], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    });
    return { success: true, conflicts: [] };
  } catch (err) {
    const stderr = err instanceof Error ? err.stderr ?? err.message : String(err);
    if (stderr.includes("local changes would be overwritten") || stderr.includes("not possible because you have unmerged files") || stderr.includes("overwritten by merge")) {
      const dirtyFiles = stderr.split("\n").filter((line) => line.startsWith("	")).map((line) => line.trim()).filter(Boolean);
      return { success: false, conflicts: ["__dirty_working_tree__"], dirtyFiles };
    }
    const conflictOutput = gitExec(basePath, ["diff", "--name-only", "--diff-filter=U"], true);
    const conflicts = conflictOutput ? conflictOutput.split("\n").filter(Boolean) : [];
    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }
    throw err;
  }
}
function nativeMergeRegular(basePath, branch) {
  try {
    execFileSync("git", ["merge", "--no-ff", "--no-commit", branch], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    });
    return { success: true, conflicts: [] };
  } catch (err) {
    const stderr = err instanceof Error ? err.stderr ?? err.message : String(err);
    if (stderr.includes("local changes would be overwritten") || stderr.includes("not possible because you have unmerged files") || stderr.includes("overwritten by merge")) {
      const dirtyFiles = stderr.split("\n").filter((line) => line.startsWith("	")).map((line) => line.trim()).filter(Boolean);
      return { success: false, conflicts: ["__dirty_working_tree__"], dirtyFiles };
    }
    const conflictOutput = gitExec(basePath, ["diff", "--name-only", "--diff-filter=U"], true);
    const conflicts = conflictOutput ? conflictOutput.split("\n").filter(Boolean) : [];
    if (conflicts.length > 0) {
      return { success: false, conflicts };
    }
    throw err;
  }
}
function nativeMergeAbort(basePath) {
  const native = loadNative();
  if (native) {
    native.gitMergeAbort(basePath);
    return;
  }
  gitExec(basePath, ["merge", "--abort"], true);
}
function nativeRebaseAbort(basePath) {
  const native = loadNative();
  if (native) {
    native.gitRebaseAbort(basePath);
    return;
  }
  gitExec(basePath, ["rebase", "--abort"], true);
}
function nativeResetHard(basePath) {
  const native = loadNative();
  if (native) {
    native.gitResetHard(basePath);
    return;
  }
  execFileSync("git", ["reset", "--hard", "HEAD"], { cwd: basePath, stdio: "pipe" });
}
function nativeResetSoft(basePath, target) {
  execFileSync("git", ["reset", "--soft", target], {
    cwd: basePath,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: GIT_NO_PROMPT_ENV
  });
}
function nativeCommitSubject(basePath, ref) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%s", ref], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    }).trim();
  } catch {
    return "";
  }
}
function nativeBranchDelete(basePath, branch, force = true) {
  const native = loadNative();
  if (native) {
    native.gitBranchDelete(basePath, branch, force);
    return;
  }
  gitFileExec(basePath, ["branch", force ? "-D" : "-d", branch]);
}
function nativeBranchForceReset(basePath, branch, target) {
  const native = loadNative();
  if (native) {
    native.gitBranchForceReset(basePath, branch, target);
    return;
  }
  gitExec(basePath, ["branch", "-f", branch, target]);
}
function nativeRmCached(basePath, paths, recursive = true) {
  const native = loadNative();
  if (native) {
    return native.gitRmCached(basePath, paths, recursive);
  }
  const removed = [];
  for (const path of paths) {
    const result = gitExec(
      basePath,
      ["rm", "--cached", ...recursive ? ["-r"] : [], "--ignore-unmatch", path],
      true
    );
    if (result) removed.push(result);
  }
  return removed;
}
function nativeRmForce(basePath, paths) {
  const native = loadNative();
  if (native) {
    native.gitRmForce(basePath, paths);
    return;
  }
  for (const path of paths) {
    gitFileExec(basePath, ["rm", "--force", "--", path], true);
  }
}
function runGitWorktreeAdd(basePath, wtPath, branch, createBranch, startPoint) {
  if (createBranch) {
    const branchRef = gitExec(basePath, ["show-ref", "--verify", `refs/heads/${branch}`], true);
    if (branchRef) {
      gitExec(basePath, ["worktree", "add", wtPath, branch]);
      return;
    }
    gitExec(basePath, ["worktree", "add", "-b", branch, wtPath, startPoint ?? "HEAD"]);
  } else {
    gitExec(basePath, ["worktree", "add", wtPath, branch]);
  }
}
function assertWorktreeMaterialized(wtPath) {
  if (existsSync3(join5(wtPath, ".git"))) return;
  throw new GSDError(
    GSD_GIT_ERROR,
    `git worktree add did not materialize a valid worktree at ${wtPath}: missing .git file`
  );
}
function nativeWorktreeAdd(basePath, wtPath, branch, createBranch, startPoint) {
  const native = loadNative();
  if (native) {
    native.gitWorktreeAdd(basePath, wtPath, branch, createBranch, startPoint);
    try {
      assertWorktreeMaterialized(wtPath);
      return;
    } catch {
      rmSync(wtPath, { recursive: true, force: true });
      gitExec(basePath, ["worktree", "prune"], true);
      runGitWorktreeAdd(basePath, wtPath, branch, createBranch, startPoint);
      assertWorktreeMaterialized(wtPath);
      return;
    }
  }
  runGitWorktreeAdd(basePath, wtPath, branch, createBranch, startPoint);
  assertWorktreeMaterialized(wtPath);
}
function nativeWorktreeRemove(basePath, wtPath, force = false) {
  const native = loadNative();
  if (native) {
    native.gitWorktreeRemove(basePath, wtPath, force);
    return;
  }
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(wtPath);
  gitExec(basePath, args, true);
}
function nativeWorktreePrune(basePath) {
  const native = loadNative();
  if (native) {
    native.gitWorktreePrune(basePath);
    return;
  }
  gitExec(basePath, ["worktree", "prune"], true);
}
function nativeRevertCommit(basePath, sha) {
  const native = loadNative();
  if (native) {
    native.gitRevertCommit(basePath, sha);
    return;
  }
  gitFileExec(basePath, ["revert", "--no-commit", sha]);
}
function nativeRevertAbort(basePath) {
  const native = loadNative();
  if (native) {
    native.gitRevertAbort(basePath);
    return;
  }
  gitFileExec(basePath, ["revert", "--abort"], true);
}
function nativeUpdateRef(basePath, refname, target) {
  const native = loadNative();
  if (native) {
    native.gitUpdateRef(basePath, refname, target);
    return;
  }
  if (target !== void 0) {
    gitExec(basePath, ["update-ref", refname, target]);
  } else {
    gitExec(basePath, ["update-ref", "-d", refname], true);
  }
}
function isNativeGitAvailable() {
  return loadNative() !== null;
}
function nativeIsAncestor(basePath, ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      env: GIT_NO_PROMPT_ENV
    });
    return true;
  } catch {
    return false;
  }
}
function nativeLastCommitEpoch(basePath, ref) {
  try {
    const result = execFileSync("git", ["log", "-1", "--format=%ct", ref], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    }).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return 0;
  }
}
function nativeUnpushedCount(basePath, branch) {
  try {
    const result = execFileSync("git", ["rev-list", branch, "--not", "--remotes", "--count"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV
    }).trim();
    return parseInt(result, 10) || 0;
  } catch {
    return -1;
  }
}
export {
  _resetHasChangesCache,
  assertWorktreeMaterialized,
  branchExistsIncludingUnborn,
  currentBranchIncludingUnborn,
  isNativeGitAvailable,
  nativeAddAll,
  nativeAddAllWithExclusions,
  nativeAddPaths,
  nativeAddTracked,
  nativeBatchInfo,
  nativeBranchDelete,
  nativeBranchExists,
  nativeBranchForceReset,
  nativeBranchList,
  nativeBranchListMerged,
  nativeCheckoutBranch,
  nativeCheckoutNewBranch,
  nativeCheckoutTheirs,
  nativeCommit,
  nativeCommitCountBetween,
  nativeCommitSubject,
  nativeConflictFiles,
  nativeDetectMainBranch,
  nativeDiffContent,
  nativeDiffNameStatus,
  nativeDiffNumstat,
  nativeDiffStat,
  nativeForEachRef,
  nativeGetCurrentBranch,
  nativeHasChanges,
  nativeHasCommittedHead,
  nativeHasMergeConflicts,
  nativeHasStagedChanges,
  nativeInit,
  nativeIsAncestor,
  nativeIsCurrentUnbornBranch,
  nativeIsIgnored,
  nativeIsRepo,
  nativeLastCommitEpoch,
  nativeLogOneline,
  nativeLsFiles,
  nativeMergeAbort,
  nativeMergeRegular,
  nativeMergeSquash,
  nativeRebaseAbort,
  nativeResetHard,
  nativeResetPaths,
  nativeResetSoft,
  nativeRevertAbort,
  nativeRevertCommit,
  nativeRmCached,
  nativeRmForce,
  nativeUnpushedCount,
  nativeUpdateRef,
  nativeWorkingTreeStatus,
  nativeWorktreeAdd,
  nativeWorktreeList,
  nativeWorktreePrune,
  nativeWorktreeRemove
};
