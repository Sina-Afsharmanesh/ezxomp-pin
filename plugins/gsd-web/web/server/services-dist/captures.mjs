import { createRequire as __gwbCreateRequireInit } from "node:module";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/captures.ts
import { existsSync as existsSync6, readFileSync as readFileSync7, mkdirSync as mkdirSync4 } from "node:fs";
import { join as join9, resolve as resolve9 } from "node:path";
import { randomUUID as randomUUID3 } from "node:crypto";

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
function projectRootFromWorktreePath(path) {
  const segment = findWorktreeSegment(path.replaceAll("\\", "/"));
  return segment ? path.slice(0, segment.gsdIdx) : null;
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
function gsdProjectionRoot(basePath) {
  const contract = resolveGsdPathContract(basePath);
  return normalizeRealPath(contract.worktreeGsd ?? contract.projectGsd);
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

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/atomic-write.ts
import { closeSync as closeSync2, constants as fsConstants, existsSync as existsSync5, fstatSync, fsyncSync as fsyncSync2, lstatSync as lstatSync3, openSync as openSync2, readdirSync as readdirSync3, readFileSync as readFileSync6, realpathSync as realpathSync5, rmSync, writeFileSync as writeFileSync4, renameSync as renameSync2, unlinkSync as unlinkSync3, mkdirSync as mkdirSync3, promises as fs } from "node:fs";
import { basename as basename6, dirname as dirname6, join as join8, relative as relative4, resolve as resolve8 } from "node:path";
import { createHash as createHash4, randomBytes } from "node:crypto";

// node_modules/@gsd/native/file-identity.mjs
var isNativeAddonLoaded = () => false;
var native = new Proxy({}, { get() {
  return void 0;
} });
function isProjectionRootIdentityLockAvailable() {
  return isNativeAddonLoaded() && typeof native.ProjectionRootIdentityLock === "function";
}
function acquireProjectionRootIdentityLock(path, expectedDevice, expectedInode) {
  const Lock = native.ProjectionRootIdentityLock;
  if (!isProjectionRootIdentityLockAvailable()) throw new Error("native projection root identity locking is unavailable");
  try {
    return new Lock(path, expectedDevice, expectedInode);
  } catch (error) {
    throw new Error("native projection root identity locking failed", { cause: error });
  }
}

// node_modules/@gsd/native/directory-sync.mjs
var isNativeAddonLoaded2 = () => false;
var native2 = new Proxy({}, { get() {
  return void 0;
} });
function syncDirectoryEntry(path) {
  const sync = native2.syncDirectoryEntry;
  if (!isNativeAddonLoaded2() || typeof sync !== "function") throw new Error("native directory durability is unavailable");
  try {
    sync(path);
  } catch (error) {
    throw new Error("native directory durability failed", { cause: error });
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/database-maintenance-fence.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync as readFileSync3,
  realpathSync as realpathSync3,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename as basename3, dirname as dirname3, join as join5, resolve as resolve5 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/errors.ts
var GSD_STALE_STATE = "GSD_STALE_STATE";
var GSDError = class extends Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "GSDError";
    this.code = code;
  }
};

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/database-replacement-paths.ts
import { basename as basename2, dirname as dirname2, join as join4, resolve as resolve4 } from "node:path";
function getDatabaseReplacementPaths(databasePath) {
  if (typeof databasePath !== "string" || databasePath.length === 0 || databasePath === ":memory:") {
    throw new GSDError(GSD_STALE_STATE, "gsd-db: Database replacement requires a file-backed database path");
  }
  const resolvedPath = resolve4(databasePath);
  const recoveryDirectory = join4(dirname2(resolvedPath), `${basename2(resolvedPath)}.recovery`);
  return Object.freeze({
    recoveryDirectory,
    activeIntentPath: join4(recoveryDirectory, "active.json")
  });
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/process-start-identity.ts
import { createHash } from "node:crypto";
import { readFileSync as readFileSync2 } from "node:fs";
import { createRequire } from "node:module";
var darwinProcessInfo;
var windowsProcessStartTime;
function loadDarwinProcessInfo() {
  if (darwinProcessInfo) return darwinProcessInfo;
  const require2 = createRequire(import.meta.url);
  const koffi = require2("koffi");
  const info = koffi.struct({
    pbi_flags: "uint32",
    pbi_status: "uint32",
    pbi_xstatus: "uint32",
    pbi_pid: "uint32",
    pbi_ppid: "uint32",
    pbi_uid: "uint32",
    pbi_gid: "uint32",
    pbi_ruid: "uint32",
    pbi_rgid: "uint32",
    pbi_svuid: "uint32",
    pbi_svgid: "uint32",
    pbi_rfu_1: "uint32",
    pbi_comm: koffi.array("char", 16),
    pbi_name: koffi.array("char", 32),
    pbi_nfiles: "uint32",
    pbi_pgid: "uint32",
    pbi_pjobc: "uint32",
    e_tdev: "uint32",
    e_tpgid: "uint32",
    pbi_nice: "int32",
    pbi_start_tvsec: "uint64",
    pbi_start_tvusec: "uint64"
  });
  const library = koffi.load("/usr/lib/libproc.dylib");
  const read = library.func("proc_pidinfo", "int", [
    "int",
    "int",
    "uint64",
    koffi.out(koffi.pointer(info)),
    "int"
  ]);
  const size = koffi.sizeof(info);
  darwinProcessInfo = (pid) => {
    const output = {};
    return read(pid, 3, 0, output, size) === size && output.pbi_pid === pid ? output : null;
  };
  return darwinProcessInfo;
}
function loadWindowsProcessStartTime() {
  if (windowsProcessStartTime) return windowsProcessStartTime;
  const require2 = createRequire(import.meta.url);
  const koffi = require2("koffi");
  const kernel32 = koffi.load("kernel32.dll");
  const openProcess = kernel32.func(
    "void* __stdcall OpenProcess(uint32 desired_access, bool inherit_handle, uint32 process_id)"
  );
  const getProcessTimes = kernel32.func(
    "bool __stdcall GetProcessTimes(void* process, _Out_ uint64* creation, _Out_ uint64* exit, _Out_ uint64* kernel, _Out_ uint64* user)"
  );
  const closeHandle = kernel32.func("bool __stdcall CloseHandle(void* handle)");
  windowsProcessStartTime = (pid) => {
    const handle = openProcess(4096, false, pid);
    if (!handle) return null;
    try {
      const creation = new BigUint64Array(1);
      const unused = new BigUint64Array(1);
      return getProcessTimes(handle, creation, unused, unused, unused) ? creation[0] : null;
    } finally {
      closeHandle(handle);
    }
  };
  return windowsProcessStartTime;
}
function processStartIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    let raw;
    if (process.platform === "linux") {
      const stat = readFileSync2(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      const bootId = readFileSync2("/proc/sys/kernel/random/boot_id", "utf8").trim();
      raw = bootId.length > 0 && fields[19] ? `${bootId}:${fields[19]}` : "";
    } else if (process.platform === "darwin") {
      const info = loadDarwinProcessInfo()(pid);
      raw = info ? `${info.pbi_start_tvsec}:${info.pbi_start_tvusec}` : "";
    } else if (process.platform === "freebsd") {
      return null;
    } else if (process.platform === "win32") {
      const startTime = loadWindowsProcessStartTime()(pid);
      raw = startTime === null ? "" : String(startTime);
    } else {
      return null;
    }
    if (raw.length === 0) return null;
    return `sha256:${createHash("sha256").update(`${process.platform}:${raw}`).digest("hex")}`;
  } catch {
    return null;
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/database-maintenance-fence.ts
var owners = new AsyncLocalStorage();
var PROJECTION_CLAIM_RETRY_MS = 5;
var PROJECTION_CLAIM_MAX_ATTEMPTS = 1e3;
var projectionClaimSleep = new Int32Array(new SharedArrayBuffer(4));
var cachedCurrentProcessIdentity;
var projectionClaimReleaseBoundaryForTest = null;
var projectionMutationBeforeClaimForTest = null;
function waitForProjectionClaim() {
  Atomics.wait(projectionClaimSleep, 0, 0, PROJECTION_CLAIM_RETRY_MS);
}
function currentProcessIdentity() {
  if (cachedCurrentProcessIdentity === void 0) {
    cachedCurrentProcessIdentity = processStartIdentity(process.pid);
  }
  return cachedCurrentProcessIdentity;
}
function pathExistsFailClosed(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
function canonicalDatabasePath(databasePath) {
  try {
    return realpathSync3.native(databasePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Cannot prove the database maintenance path", { cause: error });
    }
    try {
      return join5(realpathSync3.native(dirname3(resolve5(databasePath))), basename3(databasePath));
    } catch (parentError) {
      if (parentError.code !== "ENOENT") {
        throw new GSDError(GSD_STALE_STATE, "gsd-db: Cannot prove the database maintenance parent", { cause: parentError });
      }
      return resolve5(databasePath);
    }
  }
}
function databaseMaintenanceIntentPath(databasePath) {
  return `${canonicalDatabasePath(databasePath)}.maintenance.json`;
}
var projectionClaimRegistry = /* @__PURE__ */ new Map();
function registryEntryHeld(entry) {
  return entry.mutationDepth > 0 || entry.maintenanceDepth > 0 || entry.ownerDepth > 0;
}
function nestedProjectionOwnerActive(canonical) {
  if (!owners.getStore()?.has(canonical)) return false;
  const entry = projectionClaimRegistry.get(canonical);
  return entry !== void 0 && (entry.mutationDepth > 0 || entry.ownerDepth > 0);
}
function projectionClaimPath(databasePath) {
  return `${canonicalDatabasePath(databasePath)}.projection.lock`;
}
function syncClaimDirectory(path) {
  const directory = dirname3(path);
  if (process.platform === "win32") {
    syncDirectoryEntry(directory);
    return;
  }
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function readClaimOwner(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync3(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim is invalid", { cause: error });
  }
  const value = parsed;
  const pid = Number(value["pid"]);
  const identity = value["processStartIdentity"];
  if (!Number.isSafeInteger(pid) || pid <= 0 || typeof identity !== "string") {
    throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim is invalid");
  }
  return { pid, identity };
}
function claimOwnerIsActive(owner, registryKey) {
  if (owner.pid === process.pid && owner.identity === currentProcessIdentity()) {
    const entry = projectionClaimRegistry.get(registryKey);
    return entry !== void 0 && (entry.mutationDepth > 0 || entry.maintenanceDepth > 0);
  }
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") return false;
  }
  const current = processStartIdentity(owner.pid);
  return current === null || current === owner.identity;
}
function removeTransitionedClaim(path, transition) {
  let linked;
  try {
    linked = lstatSync(transition);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (pathExistsFailClosed(path)) {
    const current = lstatSync(path);
    if (current.dev !== linked.dev || current.ino !== linked.ino) {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim changed during recovery");
    }
    unlinkSync(path);
  }
  unlinkSync(transition);
  syncClaimDirectory(path);
}
function recoverProjectionTransition(path, transition, registryKey) {
  if (!pathExistsFailClosed(transition)) return true;
  const owner = readClaimOwner(transition);
  if (owner !== null && claimOwnerIsActive(owner, registryKey)) return false;
  removeTransitionedClaim(path, transition);
  return true;
}
function acquireProjectionClaim(databasePath, waitForActiveOwner = true) {
  const path = projectionClaimPath(databasePath);
  const registryKey = path.slice(0, -".projection.lock".length);
  const transition = `${path}.transition`;
  for (let attempt = 0; attempt < PROJECTION_CLAIM_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) waitForProjectionClaim();
    if (!recoverProjectionTransition(path, transition, registryKey)) {
      if (!waitForActiveOwner) {
        throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection authority changed during claim acquisition");
      }
      continue;
    }
    const temporary = `${path}.pending-${process.pid}-${randomUUID()}`;
    let descriptor;
    try {
      descriptor = openSync(temporary, "wx", 384);
      const identity = currentProcessIdentity();
      if (identity === null) throw new GSDError(GSD_STALE_STATE, "gsd-db: Cannot prove projection claim identity");
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, processStartIdentity: identity, nonce: randomUUID() }));
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = void 0;
      linkSync(temporary, path);
      unlinkSync(temporary);
      syncClaimDirectory(path);
      const stat = lstatSync(path);
      return { path, dev: stat.dev, ino: stat.ino };
    } catch (error) {
      if (descriptor !== void 0) closeSync(descriptor);
      if (pathExistsFailClosed(temporary)) unlinkSync(temporary);
      if (error.code !== "EEXIST") throw error;
      const owner = readClaimOwner(path);
      if (owner === null) continue;
      if (claimOwnerIsActive(owner, registryKey)) {
        if (!waitForActiveOwner) {
          throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection authority changed during claim acquisition");
        }
        waitForProjectionClaim();
        continue;
      }
      try {
        linkSync(path, transition);
      } catch (transitionError) {
        if (transitionError.code === "EEXIST") {
          waitForProjectionClaim();
          continue;
        }
        if (transitionError.code === "ENOENT") continue;
        throw transitionError;
      }
      const transitionOwner = readClaimOwner(transition);
      if (transitionOwner !== null && claimOwnerIsActive(transitionOwner, registryKey)) {
        unlinkSync(transition);
        throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim owner changed during recovery");
      }
      removeTransitionedClaim(path, transition);
    }
  }
  throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation remains fenced after the contention timeout");
}
function createProjectionClaimReleaseState(claim) {
  return {
    claim,
    transition: `${claim.path}.transition`,
    transitionLinked: false,
    primaryRemoved: false,
    transitionRemoved: false,
    directorySynced: false
  };
}
function continueProjectionClaimRelease(state) {
  const { claim, transition } = state;
  if (!state.transitionLinked) {
    const current = lstatSync(claim.path);
    if (current.dev !== claim.dev || current.ino !== claim.ino) {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim ownership changed");
    }
    linkSync(claim.path, transition);
    state.transitionLinked = true;
    projectionClaimReleaseBoundaryForTest?.("after-link");
  }
  if (!state.primaryRemoved) {
    const current = lstatSync(claim.path);
    if (current.dev !== claim.dev || current.ino !== claim.ino) {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim ownership changed");
    }
    unlinkSync(claim.path);
    state.primaryRemoved = true;
    projectionClaimReleaseBoundaryForTest?.("after-primary-unlink");
  }
  if (!state.transitionRemoved) {
    const linked = lstatSync(transition);
    if (linked.dev !== claim.dev || linked.ino !== claim.ino) {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim ownership changed");
    }
    unlinkSync(transition);
    state.transitionRemoved = true;
    projectionClaimReleaseBoundaryForTest?.("after-transition-unlink");
  }
  if (!state.directorySynced) {
    syncClaimDirectory(claim.path);
    state.directorySynced = true;
  }
}
function releaseProjectionClaim(claim) {
  continueProjectionClaimRelease(createProjectionClaimReleaseState(claim));
}
function acquireMutationEntry(databasePath, canonical) {
  const existing = projectionClaimRegistry.get(canonical);
  if (existing !== void 0) {
    if (existing.maintenanceDepth > 0) {
      throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation is fenced by active maintenance or publication");
    }
    existing.mutationDepth++;
    return;
  }
  const claim = acquireProjectionClaim(databasePath);
  projectionClaimRegistry.set(canonical, { mutationDepth: 1, maintenanceDepth: 0, ownerDepth: 0, claim });
}
function releaseMutationEntry(canonical) {
  const entry = projectionClaimRegistry.get(canonical);
  if (entry === void 0 || entry.mutationDepth === 0) {
    throw new GSDError(GSD_STALE_STATE, "gsd-db: Projection mutation claim ownership changed");
  }
  entry.mutationDepth--;
  if (entry.mutationDepth === 0 && entry.claim !== null) {
    const claim = entry.claim;
    entry.claim = null;
    try {
      releaseProjectionClaim(claim);
    } finally {
      if (!registryEntryHeld(entry)) projectionClaimRegistry.delete(canonical);
    }
    return;
  }
  if (!registryEntryHeld(entry)) projectionClaimRegistry.delete(canonical);
}
function runAsProjectionOwner(canonical, operation) {
  const active = new Set(owners.getStore() ?? []);
  active.add(canonical);
  return owners.run(active, operation);
}
function projectionDatabasePath(filePath) {
  let current = dirname3(resolve5(filePath));
  while (current !== dirname3(current)) {
    const name = basename3(current).toLocaleLowerCase("en-US");
    if (name === ".gsd") {
      return pathExistsFailClosed(current) ? join5(current, "gsd.db") : null;
    }
    if (name === ".planning") {
      const gsdPath = join5(dirname3(current), ".gsd");
      return pathExistsFailClosed(gsdPath) ? join5(gsdPath, "gsd.db") : null;
    }
    current = dirname3(current);
  }
  return null;
}
function withProjectionMutationSync(filePath, operation) {
  const databasePath = projectionDatabasePath(filePath);
  if (databasePath === null) return operation();
  const canonical = canonicalDatabasePath(databasePath);
  if (nestedProjectionOwnerActive(canonical)) return operation();
  assertProjectionWriteFencesAllowWrite(databasePath);
  projectionMutationBeforeClaimForTest?.();
  acquireMutationEntry(databasePath, canonical);
  try {
    assertProjectionWriteFencesAllowWrite(databasePath);
    return runAsProjectionOwner(canonical, operation);
  } finally {
    releaseMutationEntry(canonical);
  }
}
function assertDatabaseReplacementFenceAllowsWrite(databasePath) {
  if (databasePath === ":memory:") return;
  const activeIntentPath = getDatabaseReplacementPaths(databasePath).activeIntentPath;
  if (pathExistsFailClosed(activeIntentPath)) {
    throw new GSDError(
      GSD_STALE_STATE,
      `gsd-db: Projection mutation is fenced while database replacement intent exists at ${activeIntentPath}`
    );
  }
}
function assertDatabaseMaintenanceFenceAllowsWrite(databasePath) {
  if (databasePath === ":memory:") return;
  const canonical = canonicalDatabasePath(databasePath);
  if (nestedProjectionOwnerActive(canonical)) return;
  const marker = databaseMaintenanceIntentPath(databasePath);
  if (pathExistsFailClosed(marker)) {
    throw new GSDError(
      GSD_STALE_STATE,
      `gsd-db: Database writes are fenced while maintenance intent exists at ${marker}`
    );
  }
}
function assertProjectionWriteFencesAllowWrite(databasePath) {
  assertDatabaseMaintenanceFenceAllowsWrite(databasePath);
  assertDatabaseReplacementFenceAllowsWrite(databasePath);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/managed-projection-history.ts
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import {
  existsSync as existsSync3,
  lstatSync as lstatSync2,
  mkdirSync,
  readFileSync as readFileSync4,
  readdirSync as readdirSync2,
  realpathSync as realpathSync4,
  renameSync,
  rmdirSync,
  unlinkSync as unlinkSync2,
  writeFileSync as writeFileSync2
} from "node:fs";
import { basename as basename4, dirname as dirname4, join as join6, relative as relative2, resolve as resolve6 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/projection-path-policy.ts
var reservedNames = /* @__PURE__ */ new Set([
  ".compat.json",
  "active.json",
  "auto.lock",
  "gsd.db",
  "orchestrator.json",
  "slice-orchestrator.json",
  "unit-claims.db"
]);
var reservedDirectories = /* @__PURE__ */ new Set([
  "backups",
  "migration",
  "migration-applications",
  "recovery-applications",
  "runtime",
  "workflow",
  "workflows"
]);
var managedDirectories = /* @__PURE__ */ new Set([
  "artifact",
  "artifacts",
  "backlog",
  "capture",
  "captures",
  "milestone",
  "milestones",
  "milestones.migrating",
  "notes",
  "phases",
  "plans",
  "reports",
  "research",
  "roadmaps",
  "slices",
  "summaries",
  "tasks",
  "validation",
  "verification"
]);
var managedRootFiles = /* @__PURE__ */ new Set([
  "backlog.md",
  "decisions.md",
  "knowledge.md",
  "last-snapshot.md",
  "metrics.json",
  "project.md",
  "queue.md",
  "requirements.md",
  "roadmap.md",
  "state.md"
]);
function classifyGsdLogicalPath(logicalPath) {
  const parts = logicalPath.replaceAll("\\", "/").split("/");
  if (parts.length === 0 || parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    return "invalid";
  }
  const normalized = parts.map((part) => part.normalize("NFC").replace(/[. ]+$/u, "").toLocaleLowerCase("en-US"));
  if (normalized.some((part) => part.length === 0 || part.includes(":"))) return "invalid";
  const first = normalized[0];
  if (reservedDirectories.has(first) || reservedNames.has(first) || first.startsWith("gsd.db-")) {
    return "control";
  }
  return managedDirectories.has(first) || managedRootFiles.has(first) ? "managed" : "unmanaged";
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/managed-projection-history.ts
function journalRoot(targetRoot) {
  return join6(gsdProjectionRoot(targetRoot), "migration", "projection-mutations");
}
var HISTORY_LOGICAL_PATH = "migration/managed-outputs.json";
var JOURNAL_LOGICAL_ROOT = "migration/projection-mutations";
var UNBOUND_EVIDENCE_LOGICAL_PATH = "migration/unbound-projection-evidence.json";
var NATIVE_EVIDENCE_LOGICAL_ROOT = "migration/native-projection-evidence";
var PROJECTION_ROOT_LOCK_RETRY_DELAYS_MS = [5, 10, 20, 40];
var projectionRootLockRetrySleep = new Int32Array(new SharedArrayBuffer(4));
var managedProjectionApplyFaultForTest = null;
var managedProjectionWriteFaultForTest = null;
var legacyProjectionCleanupBoundaryForTest = null;
var legacyProjectionCleanupExchangeFaultForTest = null;
var unboundEvidenceCopyFaultForTest = null;
var unboundEvidenceGuardFaultForTest = null;
var unboundEvidenceRemovalFaultForTest = null;
var unboundEvidenceAcknowledgementFaultForTest = null;
function logicalProjectionPath(targetRoot, filePath) {
  const root = realpathSync4.native(gsdProjectionRoot(targetRoot));
  let ancestor = resolve6(filePath);
  const tail = [];
  while (!existsSync3(ancestor)) {
    tail.unshift(basename4(ancestor));
    ancestor = dirname4(ancestor);
  }
  const absolute = join6(realpathSync4.native(ancestor), ...tail);
  const logicalPath = relative2(root, absolute).replaceAll("\\", "/");
  if (logicalPath.length === 0 || logicalPath.startsWith("../") || logicalPath.includes("\0") || logicalPath.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("managed projection path is outside the GSD root");
  }
  return logicalPath;
}
function openManagedProjectionRoot(targetRoot) {
  const projectionRoot = gsdProjectionRoot(targetRoot);
  const stat = lstatSync2(projectionRoot, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("managed projection root is not an identity-stable directory");
  }
  return acquireProjectionRootIdentityLock(
    realpathSync4(projectionRoot),
    stat.dev.toString(),
    stat.ino.toString()
  );
}
function isTransientProjectionRootLockError(error) {
  const seen = /* @__PURE__ */ new Set();
  let current = error;
  while (current !== null && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current;
    if (candidate.code === "EBUSY") return true;
    if (typeof candidate.message === "string" && /\bEBUSY\b|sharing violation|os error 32|projection root is busy/iu.test(candidate.message)) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
function openManagedProjectionRootWithRetry(open, wait = (delayMs) => {
  Atomics.wait(projectionRootLockRetrySleep, 0, 0, delayMs);
}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return open();
    } catch (error) {
      const delay = PROJECTION_ROOT_LOCK_RETRY_DELAYS_MS[attempt];
      if (delay === void 0 || !isTransientProjectionRootLockError(error)) throw error;
      wait(delay);
    }
  }
}
function parseManagedProjectionPaths(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("managed projection history is invalid");
  }
  return [...new Set(value)].sort();
}
function readManagedProjectionPaths(handle) {
  if (!handle.pathExists(HISTORY_LOGICAL_PATH)) return [];
  return parseManagedProjectionPaths(JSON.parse(handle.readFile(HISTORY_LOGICAL_PATH).toString("utf8")));
}
function recordManagedProjectionLogicalPath(handle, logicalPath) {
  const paths = new Set(readManagedProjectionPaths(handle));
  if (paths.has(logicalPath)) return;
  paths.add(logicalPath);
  handle.writeFile(HISTORY_LOGICAL_PATH, Buffer.from(`${JSON.stringify([...paths].sort(), null, 2)}
`));
}
function evidenceId(evidencePath, kind, logicalPath, scope) {
  const digest = createHash2("sha256").update(JSON.stringify({ evidencePath, kind, logicalPath, scope })).digest("hex");
  return `evidence:sha256:${digest}`;
}
function fallbackProjectionPath(targetRoot, logicalPath) {
  const root = gsdProjectionRoot(targetRoot);
  const absolute = resolve6(root, logicalPath);
  if (relative2(root, absolute).replaceAll("\\", "/") !== logicalPath) {
    throw new Error("fallback projection evidence path is invalid");
  }
  return absolute;
}
function fallbackProjectionIdentity(path) {
  const stat = lstatSync2(path, { bigint: true });
  if (stat.isSymbolicLink()) throw new Error("fallback projection evidence is a symbolic link");
  return `${stat.dev}:${stat.ino}`;
}
function fallbackProjectionContentDigest(path, scope) {
  const hash = createHash2("sha256");
  const visit = (entryPath, entryName) => {
    const stat = lstatSync2(entryPath);
    if (stat.isSymbolicLink()) throw new Error("fallback projection evidence contains a symbolic link");
    let kind = null;
    if (stat.isDirectory()) kind = "directory";
    else if (stat.isFile()) kind = "file";
    if (kind === null) throw new Error("fallback projection evidence contains an unsupported entry");
    hash.update(`${entryName}\0${kind}\0`);
    if (kind === "file") {
      hash.update(readFileSync4(entryPath));
      hash.update("\0");
      return;
    }
    for (const name of readdirSync2(entryPath).sort()) {
      visit(join6(entryPath, name), entryName.length === 0 ? name : `${entryName}/${name}`);
    }
  };
  if (scope === "file") {
    const stat = lstatSync2(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("fallback projection evidence kind changed");
    hash.update(readFileSync4(path));
  } else {
    const stat = lstatSync2(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("fallback projection evidence kind changed");
    visit(path, "");
  }
  return `sha256:${hash.digest("hex")}`;
}
function readFallbackUnboundProjectionEvidence(targetRoot) {
  const path = join6(gsdProjectionRoot(targetRoot), UNBOUND_EVIDENCE_LOGICAL_PATH);
  if (!existsSync3(path)) return [];
  const value = JSON.parse(readFileSync4(path, "utf8"));
  if (!Array.isArray(value)) throw new Error("unbound projection evidence is invalid");
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object") throw new Error("unbound projection evidence is invalid");
    const evidence = entry;
    const scope = evidence.scope;
    const kind = evidence.kind;
    const evidencePath = evidence.evidencePath;
    const logicalPath = evidence.logicalPath;
    if (typeof evidencePath !== "string" || typeof logicalPath !== "string" || typeof evidence.evidenceIdentity !== "string" || typeof evidence.contentDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(evidence.contentDigest) || scope !== "file" && scope !== "tree" || kind !== "temporary" && kind !== "quarantine" && kind !== "canonical" || evidence.transition !== "retained" || classifyGsdLogicalPath(logicalPath) !== "managed" || kind === "canonical" && evidencePath !== logicalPath || evidence.evidenceId !== evidenceId(evidencePath, kind, logicalPath, scope)) {
      throw new Error("unbound projection evidence is invalid");
    }
    fallbackProjectionPath(targetRoot, evidencePath);
    return evidence;
  });
}
function writeFallbackUnboundProjectionEvidence(targetRoot, entries) {
  const path = join6(gsdProjectionRoot(targetRoot), UNBOUND_EVIDENCE_LOGICAL_PATH);
  mkdirSync(dirname4(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID2()}`;
  try {
    writeFileSync2(temporary, `${JSON.stringify(entries, null, 2)}
`, { flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync2(temporary);
    } catch {
    }
    throw error;
  }
}
function recordFallbackProjectionObstruction(targetRoot, logicalPath) {
  const path = fallbackProjectionPath(targetRoot, logicalPath);
  if (!existsSync3(path)) return;
  const stat = lstatSync2(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  const entries = readFallbackUnboundProjectionEvidence(targetRoot);
  if (entries.some((entry) => entry.evidencePath === logicalPath)) return;
  entries.push({
    evidenceId: evidenceId(logicalPath, "canonical", logicalPath, "tree"),
    evidencePath: logicalPath,
    evidenceIdentity: fallbackProjectionIdentity(path),
    contentDigest: fallbackProjectionContentDigest(path, "tree"),
    kind: "canonical",
    logicalPath,
    scope: "tree",
    transition: "retained"
  });
  entries.sort((left, right) => left.evidencePath.localeCompare(right.evidencePath));
  writeFallbackUnboundProjectionEvidence(targetRoot, entries);
}
function nativeEvidenceBinding(descriptor) {
  return [
    descriptor.version,
    descriptor.sequence,
    descriptor.phase,
    descriptor.kind,
    descriptor.scope,
    descriptor.evidencePath,
    descriptor.sourcePath,
    descriptor.evidenceIdentity,
    descriptor.logicalPath,
    descriptor.contentDigest,
    descriptor.reason
  ].join("\0");
}
function nativeEvidenceToken(descriptor) {
  const tokenBinding = [
    descriptor.version,
    descriptor.sequence,
    descriptor.kind,
    descriptor.scope,
    descriptor.evidenceIdentity,
    descriptor.sourcePath,
    descriptor.logicalPath,
    descriptor.contentDigest,
    descriptor.reason
  ].join("\0");
  const hex = createHash2("sha256").update(`native-evidence\0${tokenBinding}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function nativeControlLogicalPath(sourcePath, reason) {
  const directory = dirname4(sourcePath).replaceAll("\\", "/");
  const sourceName = basename4(sourcePath);
  const prefix = ".gsd-control-";
  const suffix = reason === "interrupted-control-temporary" ? ".temporary" : reason === "interrupted-control-replacement" ? ".replaced" : reason === "malformed-prepared-intent" ? ".intent.prepared" : null;
  if (reason === "later-control-target") {
    return `${directory === "." ? "" : `${directory}/`}${sourceName}`;
  }
  if (suffix === null || !sourceName.startsWith(prefix) || !sourceName.endsWith(suffix)) return null;
  const targetName = sourceName.slice(prefix.length, -suffix.length);
  if (targetName.length === 0) return null;
  return `${directory === "." ? "" : `${directory}/`}${targetName}`;
}
function parseNativeEvidenceDescriptor(name, value) {
  if (value === null || typeof value !== "object") throw new Error("native projection evidence is invalid");
  const descriptor = value;
  const base = {
    version: descriptor.version,
    sequence: descriptor.sequence,
    phase: descriptor.phase,
    kind: descriptor.kind,
    scope: descriptor.scope,
    evidencePath: descriptor.evidencePath,
    sourcePath: descriptor.sourcePath,
    evidenceIdentity: descriptor.evidenceIdentity,
    logicalPath: descriptor.logicalPath,
    contentDigest: descriptor.contentDigest,
    reason: descriptor.reason
  };
  if (base.version !== 2 || !Number.isSafeInteger(base.sequence) || base.sequence < 1 || base.phase !== "retained" && base.phase !== "resolving" || base.kind !== "quarantine" || base.scope !== "file" || typeof base.evidencePath !== "string" || typeof base.sourcePath !== "string" || typeof base.evidenceIdentity !== "string" || typeof base.logicalPath !== "string" || typeof base.contentDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(base.contentDigest) || typeof base.reason !== "string" || typeof descriptor.token !== "string" || typeof descriptor.checksum !== "string") {
    throw new Error("native projection evidence is invalid");
  }
  const binding = nativeEvidenceBinding(base);
  const token = nativeEvidenceToken(base);
  const checksum = `sha256:${createHash2("sha256").update(`native-evidence-checksum\0${token}\0${binding}`).digest("hex")}`;
  const evidenceDirectory = dirname4(base.evidencePath).replaceAll("\\", "/");
  const sourceDirectory = dirname4(base.sourcePath).replaceAll("\\", "/");
  const logicalDirectory = dirname4(base.logicalPath).replaceAll("\\", "/");
  if (name !== `${token}.json` || descriptor.token !== token || descriptor.checksum !== checksum) {
    throw new Error("native projection evidence is invalid");
  }
  if (basename4(base.evidencePath) !== `.gsd-projection-remove-${token}` || evidenceDirectory !== sourceDirectory || evidenceDirectory !== logicalDirectory || nativeControlLogicalPath(base.sourcePath, base.reason) !== base.logicalPath) {
    throw new Error("native projection evidence path is invalid");
  }
  return descriptor;
}
function persistedEvidenceDestination(action, logicalPath, id) {
  if (action === "discard") return null;
  if (action === "restore") return logicalPath;
  if (action === "preserve") {
    return `migration/preserved-projection-evidence/${id.slice("evidence:sha256:".length)}`;
  }
  return void 0;
}
function projectionContentDigest(handle, rootPath, scope, excludedRootNames = /* @__PURE__ */ new Set()) {
  const hash = createHash2("sha256");
  const visit = (path, relativePath) => {
    const kind = handle.pathKind(path);
    hash.update(`${relativePath}\0${kind}\0`);
    if (kind === "file") {
      hash.update(handle.readFile(path));
      hash.update("\0");
      return;
    }
    for (const name of handle.listDirectory(path)) {
      if (relativePath.length === 0 && excludedRootNames.has(name)) continue;
      visit(`${path}/${name}`, relativePath.length === 0 ? name : `${relativePath}/${name}`);
    }
  };
  if (scope === "file") {
    if (handle.pathKind(rootPath) !== "file") throw new Error("unbound projection evidence kind changed");
    hash.update(handle.readFile(rootPath));
  } else {
    if (handle.pathKind(rootPath) !== "directory") throw new Error("unbound projection evidence kind changed");
    visit(rootPath, "");
  }
  return `sha256:${hash.digest("hex")}`;
}
function writeUnboundProjectionEvidence(handle, entries) {
  handle.writeFile(
    UNBOUND_EVIDENCE_LOGICAL_PATH,
    Buffer.from(`${JSON.stringify(entries, null, 2)}
`)
  );
}
function parseNativeDeletionAcknowledgement(value, beforeContentDigest) {
  if (value === void 0) return null;
  if (value === null || typeof value !== "object") {
    throw new Error("unbound projection deletion acknowledgement is invalid");
  }
  const record = value;
  if (Object.keys(record).sort().join(",") !== "afterContentDigest,beforeContentDigest,phase" || record.phase !== "prepared" || record.beforeContentDigest !== beforeContentDigest || typeof record.afterContentDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(record.afterContentDigest)) {
    throw new Error("unbound projection deletion acknowledgement is invalid");
  }
  return record;
}
function readUnboundProjectionEvidence(handle) {
  const value = handle.pathExists(UNBOUND_EVIDENCE_LOGICAL_PATH) ? JSON.parse(handle.readFile(UNBOUND_EVIDENCE_LOGICAL_PATH).toString("utf8")) : [];
  if (!Array.isArray(value)) throw new Error("unbound projection evidence is invalid");
  const nativeEvidencePaths = /* @__PURE__ */ new Set();
  if (handle.pathExists(NATIVE_EVIDENCE_LOGICAL_ROOT)) {
    for (const name of handle.listDirectory(NATIVE_EVIDENCE_LOGICAL_ROOT)) {
      if (!/^[0-9a-f-]{36}\.json$/u.test(name)) throw new Error("native projection evidence is invalid");
      const descriptor = parseNativeEvidenceDescriptor(name, JSON.parse(
        handle.readFile(`${NATIVE_EVIDENCE_LOGICAL_ROOT}/${name}`).toString("utf8")
      ));
      const resolving = value.some((entry) => entry !== null && typeof entry === "object" && entry.evidencePath === descriptor.evidencePath && entry.transition === "resolving");
      if (descriptor.phase === "resolving" && !resolving) {
        if (handle.pathExists(descriptor.evidencePath)) {
          throw new Error("native projection evidence resolution is invalid");
        }
        const descriptorPath = `${NATIVE_EVIDENCE_LOGICAL_ROOT}/${name}`;
        handle.removeFileViaGuardExact(
          descriptorPath,
          handle.pathIdentity(descriptorPath),
          descriptorPath,
          false,
          projectionContentDigest(handle, descriptorPath, "file")
        );
        continue;
      }
      if (!resolving && (!handle.pathExists(descriptor.evidencePath) || handle.pathIdentity(descriptor.evidencePath) !== descriptor.evidenceIdentity || projectionContentDigest(handle, descriptor.evidencePath, "file") !== descriptor.contentDigest)) {
        throw new Error("native projection evidence is invalid");
      }
      if (descriptor.phase === "retained" && !value.some((entry) => entry !== null && typeof entry === "object" && entry.evidencePath === descriptor.evidencePath)) {
        value.push({
          contentDigest: descriptor.contentDigest,
          evidenceIdentity: descriptor.evidenceIdentity,
          evidencePath: descriptor.evidencePath,
          kind: descriptor.kind,
          logicalPath: descriptor.logicalPath,
          origin: "native-control",
          scope: descriptor.scope,
          transition: "retained"
        });
      }
      nativeEvidencePaths.add(descriptor.evidencePath);
    }
  }
  const parseEntries = () => value.map((entry) => {
    if (entry === null || typeof entry !== "object") throw new Error("unbound projection evidence is invalid");
    const {
      evidenceId: recordedEvidenceId,
      evidencePath,
      evidenceIdentity = null,
      contentDigest: recordedContentDigest,
      kind,
      logicalPath,
      scope = kind === "temporary" ? "file" : "tree",
      transition = "retained",
      origin,
      resolution
    } = entry;
    const evidenceDirectory = typeof evidencePath === "string" ? dirname4(evidencePath).replaceAll("\\", "/") : "";
    const logicalDirectory = typeof logicalPath === "string" ? dirname4(logicalPath).replaceAll("\\", "/") : "";
    const evidenceName = typeof evidencePath === "string" ? basename4(evidencePath) : "";
    const resolvedId = typeof evidencePath === "string" && typeof logicalPath === "string" && typeof kind === "string" ? evidenceId(evidencePath, kind, logicalPath, String(scope)) : "";
    const rawResolution = resolution;
    const recordedDestination = typeof rawResolution?.destinationPath === "string" ? rawResolution.destinationPath : null;
    const defaultResolutionPaths = resolvedId.length === 0 || typeof evidencePath !== "string" ? null : evidenceResolutionPaths(resolvedId, evidencePath, recordedDestination);
    const parsedResolution = rawResolution === void 0 || defaultResolutionPaths === null ? void 0 : {
      ...rawResolution,
      guardPath: rawResolution.guardPath ?? defaultResolutionPaths.guardPath,
      guardIdentity: rawResolution.guardIdentity ?? null,
      stagingPath: rawResolution.stagingPath ?? defaultResolutionPaths.stagingPath,
      stagingIdentity: rawResolution.stagingIdentity ?? null,
      exchangeIdentity: rawResolution.exchangeIdentity ?? null,
      phase: rawResolution.phase ?? "prepared"
    };
    const expectedDestination = persistedEvidenceDestination(
      parsedResolution?.action,
      typeof logicalPath === "string" ? logicalPath : "",
      resolvedId
    );
    if (typeof evidencePath !== "string" || typeof logicalPath !== "string" || evidenceIdentity !== null && typeof evidenceIdentity !== "string" || kind !== "temporary" && kind !== "quarantine" && kind !== "canonical" || classifyGsdLogicalPath(logicalPath) !== "managed" && (origin !== "native-control" || !nativeEvidencePaths.has(evidencePath)) || origin !== void 0 && origin !== "native-control" || origin !== "native-control" && (kind === "canonical" ? evidencePath !== logicalPath : evidenceDirectory !== logicalDirectory) || kind !== "canonical" && (kind === "temporary" ? !/^\.gsd-projection-tmp-[0-9a-f-]{36}$/u.test(evidenceName) : !(/^\.gsd-projection-remove-[0-9a-f-]{36}$/u.test(evidenceName) || /^\.gsd-projection-exchange-[0-9a-f-]{36}$/u.test(evidenceName) || /^\.gsd-projection-tmp-[0-9a-f-]{36}\.replaced$/u.test(evidenceName))) || scope !== "file" && scope !== "tree" || recordedEvidenceId !== void 0 && recordedEvidenceId !== resolvedId || recordedContentDigest !== void 0 && (typeof recordedContentDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(recordedContentDigest)) || transition !== "retained" && transition !== "resolving" || transition === "resolving" && (parsedResolution === void 0 || parsedResolution.action !== "discard" && parsedResolution.action !== "preserve" && parsedResolution.action !== "restore" || parsedResolution.destinationPath !== expectedDestination || recordedContentDigest !== parsedResolution.contentDigest || evidenceIdentity !== parsedResolution.currentIdentity || typeof parsedResolution.currentIdentity !== "string" || typeof parsedResolution.contentDigest !== "string" || parsedResolution.destinationPath !== null && typeof parsedResolution.destinationPath !== "string" || typeof parsedResolution.guardPath !== "string" || parsedResolution.guardPath !== defaultResolutionPaths?.guardPath || parsedResolution.guardIdentity !== null && typeof parsedResolution.guardIdentity !== "string" || parsedResolution.stagingPath !== null && typeof parsedResolution.stagingPath !== "string" || parsedResolution.stagingPath !== defaultResolutionPaths?.stagingPath || parsedResolution.stagingIdentity !== null && typeof parsedResolution.stagingIdentity !== "string" || parsedResolution.exchangeIdentity !== null && typeof parsedResolution.exchangeIdentity !== "string" || parsedResolution.phase !== "prepared" && parsedResolution.phase !== "guarded" && parsedResolution.phase !== "published" && parsedResolution.phase !== "deleting")) {
      throw new Error("unbound projection evidence is invalid");
    }
    const contentDigest = typeof recordedContentDigest === "string" ? recordedContentDigest : handle.pathExists(evidencePath) ? projectionContentDigest(handle, evidencePath, scope) : (() => {
      throw new Error("unbound projection evidence content is unavailable");
    })();
    return {
      evidenceId: resolvedId,
      evidencePath,
      evidenceIdentity,
      contentDigest,
      kind,
      logicalPath,
      scope,
      transition,
      ...origin === "native-control" ? { origin } : {},
      ...parsedResolution === void 0 ? {} : { resolution: parsedResolution }
    };
  });
  const parsedEntries = parseEntries();
  const deletionManifestNames = /* @__PURE__ */ new Set([".gsd-delete-manifest", ".gsd-delete-manifest.prepared"]);
  let preparedDeletionAcknowledgement = false;
  const deletionAcknowledgements = value.flatMap((raw, index) => {
    const entry = raw;
    if (entry.nativeDeletionAckPending !== true) return [];
    const parsed = parsedEntries[index];
    if (typeof entry.evidencePath !== "string" || typeof entry.evidenceIdentity !== "string" || entry.scope !== "tree" || parsed.evidencePath !== entry.evidencePath || parsed.evidenceIdentity !== entry.evidenceIdentity || parsed.scope !== "tree" || !handle.pathExists(entry.evidencePath) || handle.pathIdentity(entry.evidencePath) !== entry.evidenceIdentity) {
      throw new Error("unbound projection deletion acknowledgement is invalid");
    }
    const observedContentDigest = projectionContentDigest(handle, entry.evidencePath, "tree");
    const persistedAcknowledgement = parseNativeDeletionAcknowledgement(
      entry.nativeDeletionAck,
      parsed.contentDigest
    );
    const manifestPresent = [...deletionManifestNames].some(
      (name) => handle.pathExists(`${entry.evidencePath}/${name}`)
    );
    if (persistedAcknowledgement === null && (!manifestPresent || observedContentDigest !== parsed.contentDigest)) {
      throw new Error("unbound projection deletion acknowledgement content changed");
    }
    const acknowledgement = persistedAcknowledgement ?? {
      phase: "prepared",
      beforeContentDigest: parsed.contentDigest,
      afterContentDigest: projectionContentDigest(
        handle,
        entry.evidencePath,
        "tree",
        deletionManifestNames
      )
    };
    if (observedContentDigest !== acknowledgement.beforeContentDigest && (manifestPresent || observedContentDigest !== acknowledgement.afterContentDigest)) {
      throw new Error("unbound projection deletion acknowledgement content changed");
    }
    if (persistedAcknowledgement === null) {
      entry.nativeDeletionAck = acknowledgement;
      preparedDeletionAcknowledgement = true;
    }
    return [{
      acknowledgement,
      entry,
      evidencePath: entry.evidencePath,
      evidenceIdentity: entry.evidenceIdentity,
      manifestPresent
    }];
  });
  if (preparedDeletionAcknowledgement) {
    writeUnboundProjectionEvidence(handle, value);
  }
  let recoveredDeletionAcknowledgement = false;
  for (const acknowledgement of deletionAcknowledgements) {
    if (acknowledgement.manifestPresent) {
      handle.acknowledgeTreeDeletionEvidence(
        acknowledgement.evidencePath,
        acknowledgement.evidenceIdentity
      );
      if (projectionContentDigest(handle, acknowledgement.evidencePath, "tree") !== acknowledgement.acknowledgement.afterContentDigest) {
        throw new Error("unbound projection deletion acknowledgement content changed");
      }
      unboundEvidenceAcknowledgementFaultForTest?.();
    }
    acknowledgement.entry.contentDigest = acknowledgement.acknowledgement.afterContentDigest;
    delete acknowledgement.entry.nativeDeletionAckPending;
    delete acknowledgement.entry.nativeDeletionAck;
    recoveredDeletionAcknowledgement = true;
  }
  if (recoveredDeletionAcknowledgement) {
    writeUnboundProjectionEvidence(handle, value);
  }
  return parseEntries();
}
function recordUnboundProjectionEvidence(handle, evidence) {
  const entries = readUnboundProjectionEvidence(handle);
  if (entries.some((entry) => entry.evidencePath === evidence.evidencePath && entry.kind === evidence.kind && entry.logicalPath === evidence.logicalPath)) return;
  const identity = evidence.evidenceIdentity ?? (handle.pathExists(evidence.evidencePath) ? handle.pathIdentity(evidence.evidencePath) : null);
  entries.push({
    ...evidence,
    evidenceId: evidenceId(evidence.evidencePath, evidence.kind, evidence.logicalPath, evidence.scope),
    evidenceIdentity: identity,
    contentDigest: projectionContentDigest(handle, evidence.evidencePath, evidence.scope),
    transition: "retained"
  });
  entries.sort((left, right) => left.evidencePath.localeCompare(right.evidencePath));
  writeUnboundProjectionEvidence(handle, entries);
}
function removeNativeEvidenceDescriptor(handle, evidencePath) {
  if (!handle.pathExists(NATIVE_EVIDENCE_LOGICAL_ROOT)) return;
  for (const name of handle.listDirectory(NATIVE_EVIDENCE_LOGICAL_ROOT)) {
    if (!name.endsWith(".json")) continue;
    const path = `${NATIVE_EVIDENCE_LOGICAL_ROOT}/${name}`;
    const descriptor = JSON.parse(handle.readFile(path).toString("utf8"));
    if (descriptor.evidencePath === evidencePath) {
      handle.removeFileViaGuardExact(
        path,
        handle.pathIdentity(path),
        path,
        false,
        projectionContentDigest(handle, path, "file")
      );
    }
  }
}
function markNativeEvidenceDescriptorResolving(handle, evidencePath) {
  if (!handle.pathExists(NATIVE_EVIDENCE_LOGICAL_ROOT)) return;
  for (const name of handle.listDirectory(NATIVE_EVIDENCE_LOGICAL_ROOT)) {
    if (!name.endsWith(".json")) continue;
    const path = `${NATIVE_EVIDENCE_LOGICAL_ROOT}/${name}`;
    const descriptor = parseNativeEvidenceDescriptor(
      name,
      JSON.parse(handle.readFile(path).toString("utf8"))
    );
    if (descriptor.evidencePath !== evidencePath || descriptor.phase === "resolving") continue;
    const resolving = { ...descriptor, phase: "resolving" };
    const binding = nativeEvidenceBinding(resolving);
    const checksum = `sha256:${createHash2("sha256").update(
      `native-evidence-checksum\0${descriptor.token}\0${binding}`
    ).digest("hex")}`;
    handle.writeFile(path, Buffer.from(`${JSON.stringify({ ...resolving, checksum })}
`));
  }
}
function evidenceConflictsWithPath(evidence, logicalPath) {
  const affects = (protectedPath, scope) => protectedPath === logicalPath || protectedPath.startsWith(`${logicalPath}/`) || scope === "tree" && logicalPath.startsWith(`${protectedPath}/`);
  return affects(evidence.logicalPath, evidence.scope) || affects(evidence.evidencePath, evidence.scope);
}
function validateMutation(value, targetRoot, path) {
  if (value === null || typeof value !== "object") throw new Error("managed projection mutation is invalid");
  const mutation = value;
  const logicalPath = mutation["logicalPath"];
  const operation = mutation["operation"];
  const legacyCleanup = mutation["legacyCleanup"] ?? false;
  const content = mutation["content"];
  const encoding = mutation["encoding"];
  const temporaryPath = mutation["temporaryPath"];
  const temporaryIdentity = mutation["temporaryIdentity"] ?? null;
  const replacementPath = mutation["replacementPath"] ?? (typeof temporaryPath === "string" ? `${temporaryPath}.replaced` : null);
  const replacementIdentity = mutation["replacementIdentity"] ?? null;
  const quarantinePath = mutation["quarantinePath"] ?? ((operation === "remove-tree" || operation === "remove") && typeof logicalPath === "string" ? `${dirname4(logicalPath) === "." ? "" : `${dirname4(logicalPath)}/`}.gsd-projection-remove-${basename4(path, ".json")}` : null);
  const quarantineIdentity = mutation["quarantineIdentity"] ?? null;
  const placeholderIdentity = mutation["placeholderIdentity"] ?? null;
  const exchangeGuardPath = mutation["exchangeGuardPath"] ?? (typeof logicalPath === "string" ? `${dirname4(logicalPath) === "." ? "" : `${dirname4(logicalPath)}/`}.gsd-projection-exchange-${basename4(path, ".json")}` : null);
  const exchangeGuardIdentity = mutation["exchangeGuardIdentity"] ?? null;
  const exchangeState = mutation["exchangeState"] ?? null;
  const parsedExchange = exchangeState;
  const exchangeRightPaths = operation === "write" ? [temporaryPath, replacementPath] : [quarantinePath];
  let exchangeLeftIdentity;
  let exchangeRightIdentity;
  if (parsedExchange?.rightPath === temporaryPath) {
    exchangeLeftIdentity = placeholderIdentity;
    exchangeRightIdentity = temporaryIdentity;
  } else if (parsedExchange?.rightPath === replacementPath) {
    exchangeLeftIdentity = replacementIdentity;
    exchangeRightIdentity = placeholderIdentity;
  } else if (parsedExchange?.rightPath === quarantinePath) {
    exchangeLeftIdentity = quarantineIdentity;
    exchangeRightIdentity = placeholderIdentity;
  }
  const temporaryName = typeof temporaryPath === "string" ? basename4(temporaryPath) : "";
  const targetDirectory = typeof logicalPath === "string" ? dirname4(logicalPath).replaceAll("\\", "/") : "";
  const temporaryDirectory = typeof temporaryPath === "string" ? dirname4(temporaryPath).replaceAll("\\", "/") : "";
  const quarantineDirectory = typeof quarantinePath === "string" ? dirname4(quarantinePath).replaceAll("\\", "/") : "";
  if (typeof logicalPath !== "string" || logicalPath.length === 0 || logicalPath.startsWith("../") || logicalPath.includes("\0") || logicalPath.split("/").some((part) => part.length === 0 || part === "." || part === "..") || classifyGsdLogicalPath(logicalPath) !== "managed" || operation !== "write" && operation !== "remove" && operation !== "remove-tree" || typeof legacyCleanup !== "boolean" || legacyCleanup && operation !== "remove-tree" || (operation === "write" ? typeof content !== "string" || typeof encoding !== "string" || !Buffer.isEncoding(encoding) : content !== null || encoding !== null) || (operation === "write" ? typeof temporaryPath !== "string" || !/^\.gsd-projection-tmp-[0-9a-f-]{36}$/u.test(temporaryName) || temporaryDirectory !== targetDirectory : temporaryPath !== null) || temporaryIdentity !== null && typeof temporaryIdentity !== "string" || (operation === "write" ? typeof replacementPath !== "string" || replacementPath !== `${temporaryPath}.replaced` && !/^\.gsd-projection-remove-[0-9a-f-]{36}$/u.test(basename4(replacementPath)) || dirname4(replacementPath).replaceAll("\\", "/") !== targetDirectory : replacementPath !== null) || replacementIdentity !== null && typeof replacementIdentity !== "string" || (operation === "remove-tree" || operation === "remove" ? typeof quarantinePath !== "string" || !/^\.gsd-projection-remove-[0-9a-f-]{36}$/u.test(basename4(quarantinePath)) || quarantineDirectory !== targetDirectory : quarantinePath !== null) || quarantineIdentity !== null && typeof quarantineIdentity !== "string" || placeholderIdentity !== null && typeof placeholderIdentity !== "string" || typeof exchangeGuardPath !== "string" || !/^\.gsd-projection-exchange-[0-9a-f-]{36}$/u.test(basename4(exchangeGuardPath)) || dirname4(exchangeGuardPath).replaceAll("\\", "/") !== targetDirectory || exchangeGuardIdentity !== null && typeof exchangeGuardIdentity !== "string" || parsedExchange !== null && (typeof parsedExchange !== "object" || typeof parsedExchange.leftPath !== "string" || typeof parsedExchange.rightPath !== "string" || typeof parsedExchange.leftIdentity !== "string" || typeof parsedExchange.rightIdentity !== "string" || parsedExchange.leftPath !== logicalPath || !exchangeRightPaths.includes(parsedExchange.rightPath) || parsedExchange.leftIdentity !== exchangeLeftIdentity || parsedExchange.rightIdentity !== exchangeRightIdentity || parsedExchange.guardPath !== exchangeGuardPath || parsedExchange.guardIdentity !== exchangeGuardIdentity)) {
    throw new Error("managed projection mutation is invalid");
  }
  return {
    targetRoot,
    journalPath: path,
    logicalPath,
    operation,
    legacyCleanup,
    content,
    encoding,
    temporaryPath,
    temporaryIdentity,
    replacementPath,
    replacementIdentity,
    quarantinePath,
    quarantineIdentity,
    placeholderIdentity,
    exchangeGuardPath,
    exchangeGuardIdentity,
    exchangeState: parsedExchange
  };
}
function persistMutation(handle, mutation) {
  const path = `${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`;
  const { journalPath: _journalPath, targetRoot: _targetRoot, ...persisted } = mutation;
  handle.writeFile(path, Buffer.from(`${JSON.stringify(persisted)}
`));
}
function removePlaceholder(handle, path, identity, directory) {
  if (!handle.pathExists(path)) return;
  handle.removeFileViaGuardExact(
    path,
    identity,
    path,
    directory,
    projectionContentDigest(handle, path, directory ? "tree" : "file")
  );
}
function exchangeMutationPaths(handle, mutation, leftPath, rightPath, leftIdentity, rightIdentity, directory) {
  if (handle.pathExists(mutation.exchangeGuardPath) && mutation.exchangeGuardIdentity === null) {
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.exchangeGuardPath,
      kind: "quarantine",
      logicalPath: mutation.logicalPath,
      scope: directory ? "tree" : "file"
    });
    const parent = dirname4(mutation.exchangeGuardPath).replaceAll("\\", "/");
    mutation.exchangeGuardPath = `${parent === "." ? "" : `${parent}/`}.gsd-projection-exchange-${randomUUID2()}`;
    persistMutation(handle, mutation);
  }
  if (mutation.exchangeGuardIdentity === null) {
    mutation.exchangeGuardIdentity = directory ? handle.prepareDirectoryPlaceholder(mutation.exchangeGuardPath) : handle.prepareFileTemporary(mutation.exchangeGuardPath, Buffer.alloc(0));
    persistMutation(handle, mutation);
  }
  mutation.exchangeState = {
    leftPath,
    rightPath,
    leftIdentity,
    rightIdentity,
    guardPath: mutation.exchangeGuardPath,
    guardIdentity: mutation.exchangeGuardIdentity
  };
  persistMutation(handle, mutation);
  try {
    handle.exchangePaths(
      leftPath,
      rightPath,
      leftIdentity,
      rightIdentity,
      mutation.exchangeGuardPath,
      mutation.exchangeGuardIdentity
    );
  } catch (error) {
    retainFailedExchangeEvidence(handle, mutation, error, directory);
    throw error;
  }
  mutation.exchangeState = null;
  mutation.exchangeGuardIdentity = null;
  persistMutation(handle, mutation);
}
function resumeProjectionExchange(handle, mutation) {
  const exchange = mutation.exchangeState;
  if (exchange === null) return;
  try {
    handle.exchangePaths(
      exchange.leftPath,
      exchange.rightPath,
      exchange.leftIdentity,
      exchange.rightIdentity,
      exchange.guardPath,
      exchange.guardIdentity
    );
  } catch (error) {
    retainFailedExchangeEvidence(handle, mutation, error, mutation.operation === "remove-tree");
    throw error;
  }
  mutation.exchangeState = null;
  mutation.exchangeGuardIdentity = null;
  persistMutation(handle, mutation);
}
function retainFailedExchangeEvidence(handle, mutation, error, _directory) {
  if (!(error instanceof Error) || !error.message.includes("unexpected occupant retained in guard")) return;
  const exchange = mutation.exchangeState;
  if (exchange === null || !handle.pathExists(exchange.guardPath)) return;
  const actual = handle.pathIdentity(exchange.guardPath);
  if (actual === exchange.guardIdentity || actual === exchange.rightIdentity) return;
  const retain = (evidencePath, kind) => {
    if (evidencePath === null || !handle.pathExists(evidencePath)) return;
    const scope = handle.pathKind(evidencePath) === "directory" ? "tree" : "file";
    recordUnboundProjectionEvidence(handle, {
      evidencePath,
      evidenceIdentity: handle.pathIdentity(evidencePath),
      kind,
      logicalPath: mutation.logicalPath,
      scope
    });
  };
  retain(mutation.logicalPath, "canonical");
  retain(mutation.temporaryPath, "temporary");
  retain(mutation.replacementPath, "quarantine");
  retain(mutation.quarantinePath, "quarantine");
  retain(exchange.guardPath, "quarantine");
  handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
}
function applyWriteMutation(handle, mutation) {
  managedProjectionWriteFaultForTest?.(mutation.logicalPath);
  resumeProjectionExchange(handle, mutation);
  const expected = Buffer.from(mutation.content, mutation.encoding);
  if (handle.pathExists(mutation.logicalPath) && mutation.temporaryIdentity !== null && handle.pathIdentity(mutation.logicalPath) === mutation.temporaryIdentity && handle.readFile(mutation.logicalPath).equals(expected)) {
    if (mutation.placeholderIdentity !== null) {
      removePlaceholder(handle, mutation.temporaryPath, mutation.placeholderIdentity, false);
    }
    if (mutation.replacementIdentity !== null) {
      removePlaceholder(handle, mutation.replacementPath, mutation.replacementIdentity, false);
    }
    return;
  }
  if (handle.pathExists(mutation.temporaryPath) && mutation.temporaryIdentity === null) {
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.temporaryPath,
      kind: "temporary",
      logicalPath: mutation.logicalPath,
      scope: "file"
    });
    const directory = dirname4(mutation.temporaryPath).replaceAll("\\", "/");
    mutation.temporaryPath = `${directory === "." ? "" : `${directory}/`}.gsd-projection-tmp-${randomUUID2()}`;
    mutation.replacementPath = `${mutation.temporaryPath}.replaced`;
    persistMutation(handle, mutation);
  }
  if (!handle.pathExists(mutation.temporaryPath)) {
    mutation.temporaryIdentity = handle.prepareFileTemporary(mutation.temporaryPath, expected);
    persistMutation(handle, mutation);
  }
  if (handle.pathExists(mutation.logicalPath) && handle.pathKind(mutation.logicalPath) !== "file") {
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.logicalPath,
      evidenceIdentity: handle.pathIdentity(mutation.logicalPath),
      kind: "canonical",
      logicalPath: mutation.logicalPath,
      scope: "tree"
    });
    removePlaceholder(handle, mutation.temporaryPath, mutation.temporaryIdentity, false);
    handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
    throw new Error("managed projection target kind changed; recovery evidence retained");
  }
  if (handle.pathExists(mutation.replacementPath)) {
    const actualIdentity = handle.pathIdentity(mutation.replacementPath);
    if (mutation.replacementIdentity === null || actualIdentity !== mutation.replacementIdentity && actualIdentity !== mutation.placeholderIdentity) {
      recordUnboundProjectionEvidence(handle, {
        evidencePath: mutation.replacementPath,
        evidenceIdentity: actualIdentity,
        kind: "quarantine",
        logicalPath: mutation.logicalPath,
        scope: "file"
      });
      const directory = dirname4(mutation.replacementPath).replaceAll("\\", "/");
      mutation.replacementPath = `${directory === "." ? "" : `${directory}/`}.gsd-projection-remove-${randomUUID2()}`;
      mutation.replacementIdentity = handle.pathExists(mutation.logicalPath) ? handle.pathIdentity(mutation.logicalPath) : "-";
      mutation.placeholderIdentity = null;
      persistMutation(handle, mutation);
    }
  }
  if (mutation.replacementIdentity === "-" && mutation.placeholderIdentity !== null && handle.pathExists(mutation.logicalPath) && handle.pathIdentity(mutation.logicalPath) === mutation.placeholderIdentity) {
    exchangeMutationPaths(
      handle,
      mutation,
      mutation.logicalPath,
      mutation.temporaryPath,
      mutation.placeholderIdentity,
      mutation.temporaryIdentity,
      false
    );
    removePlaceholder(handle, mutation.temporaryPath, mutation.placeholderIdentity, false);
    return;
  }
  if (!handle.pathExists(mutation.logicalPath)) {
    if (mutation.replacementIdentity !== null && mutation.replacementIdentity !== "-") {
      throw new Error("managed projection target identity changed");
    }
    mutation.placeholderIdentity = handle.prepareFileTemporary(mutation.logicalPath, Buffer.alloc(0));
    persistMutation(handle, mutation);
    exchangeMutationPaths(
      handle,
      mutation,
      mutation.logicalPath,
      mutation.temporaryPath,
      mutation.placeholderIdentity,
      mutation.temporaryIdentity,
      false
    );
    if (handle.pathExists(mutation.temporaryPath)) {
      removePlaceholder(handle, mutation.temporaryPath, mutation.placeholderIdentity, false);
    }
    return;
  }
  if (mutation.replacementIdentity === null) {
    mutation.replacementIdentity = handle.pathIdentity(mutation.logicalPath);
    persistMutation(handle, mutation);
  }
  if (!handle.pathExists(mutation.replacementPath)) {
    mutation.placeholderIdentity = handle.prepareFileTemporary(mutation.replacementPath, Buffer.alloc(0));
    persistMutation(handle, mutation);
  } else if (mutation.placeholderIdentity === null) {
    throw new Error("managed projection replacement placeholder is not journal-bound");
  }
  const logicalIdentity = handle.pathIdentity(mutation.logicalPath);
  const replacementIdentity = handle.pathIdentity(mutation.replacementPath);
  if (logicalIdentity === mutation.replacementIdentity && replacementIdentity === mutation.placeholderIdentity) {
    exchangeMutationPaths(
      handle,
      mutation,
      mutation.logicalPath,
      mutation.replacementPath,
      mutation.replacementIdentity,
      mutation.placeholderIdentity,
      false
    );
  } else if (logicalIdentity !== mutation.placeholderIdentity || replacementIdentity !== mutation.replacementIdentity) {
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.logicalPath,
      evidenceIdentity: logicalIdentity,
      kind: "canonical",
      logicalPath: mutation.logicalPath,
      scope: "file"
    });
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.replacementPath,
      evidenceIdentity: replacementIdentity,
      kind: "quarantine",
      logicalPath: mutation.logicalPath,
      scope: "file"
    });
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.temporaryPath,
      evidenceIdentity: mutation.temporaryIdentity,
      kind: "temporary",
      logicalPath: mutation.logicalPath,
      scope: "file"
    });
    handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
    throw new Error("managed projection target identity changed; recovery evidence retained");
  }
  exchangeMutationPaths(
    handle,
    mutation,
    mutation.logicalPath,
    mutation.temporaryPath,
    mutation.placeholderIdentity,
    mutation.temporaryIdentity,
    false
  );
  removePlaceholder(handle, mutation.temporaryPath, mutation.placeholderIdentity, false);
  removePlaceholder(handle, mutation.replacementPath, mutation.replacementIdentity, false);
}
function applyRemoveMutation(handle, mutation) {
  resumeProjectionExchange(handle, mutation);
  const directory = mutation.operation === "remove-tree";
  if (handle.pathExists(mutation.exchangeGuardPath)) {
    const guardIdentity = handle.pathIdentity(mutation.exchangeGuardPath);
    if (mutation.placeholderIdentity === null || guardIdentity !== mutation.placeholderIdentity) {
      recordUnboundProjectionEvidence(handle, {
        evidencePath: mutation.exchangeGuardPath,
        evidenceIdentity: guardIdentity,
        kind: "quarantine",
        logicalPath: mutation.logicalPath,
        scope: directory ? "tree" : "file"
      });
      if (handle.pathExists(mutation.quarantinePath)) {
        recordUnboundProjectionEvidence(handle, {
          evidencePath: mutation.quarantinePath,
          evidenceIdentity: handle.pathIdentity(mutation.quarantinePath),
          kind: "quarantine",
          logicalPath: mutation.logicalPath,
          scope: directory ? "tree" : "file"
        });
      }
      return;
    }
    handle.removeFileViaGuardExact(
      mutation.logicalPath,
      mutation.placeholderIdentity,
      mutation.logicalPath,
      directory,
      projectionContentDigest(handle, mutation.logicalPath, directory ? "tree" : "file")
    );
  }
  if (!handle.pathExists(mutation.logicalPath)) {
    if (!handle.pathExists(mutation.quarantinePath)) return;
    if (mutation.quarantineIdentity === null || handle.pathIdentity(mutation.quarantinePath) !== mutation.quarantineIdentity) {
      recordUnboundProjectionEvidence(handle, {
        evidencePath: mutation.quarantinePath,
        evidenceIdentity: handle.pathIdentity(mutation.quarantinePath),
        kind: "quarantine",
        logicalPath: mutation.logicalPath,
        scope: directory ? "tree" : "file"
      });
      return;
    }
    removePlaceholder(handle, mutation.quarantinePath, mutation.quarantineIdentity, directory);
    return;
  }
  if (mutation.quarantineIdentity === null) {
    mutation.quarantineIdentity = handle.pathIdentity(mutation.logicalPath);
    persistMutation(handle, mutation);
  }
  if (!handle.pathExists(mutation.quarantinePath)) {
    mutation.placeholderIdentity = directory ? handle.prepareDirectoryPlaceholder(mutation.quarantinePath) : handle.prepareFileTemporary(mutation.quarantinePath, Buffer.alloc(0));
    persistMutation(handle, mutation);
  } else if (mutation.placeholderIdentity === null) {
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.quarantinePath,
      evidenceIdentity: handle.pathIdentity(mutation.quarantinePath),
      kind: "quarantine",
      logicalPath: mutation.logicalPath,
      scope: directory ? "tree" : "file"
    });
    const parent = dirname4(mutation.quarantinePath).replaceAll("\\", "/");
    mutation.quarantinePath = `${parent === "." ? "" : `${parent}/`}.gsd-projection-remove-${randomUUID2()}`;
    persistMutation(handle, mutation);
    mutation.placeholderIdentity = directory ? handle.prepareDirectoryPlaceholder(mutation.quarantinePath) : handle.prepareFileTemporary(mutation.quarantinePath, Buffer.alloc(0));
    persistMutation(handle, mutation);
  }
  const logicalIdentity = handle.pathIdentity(mutation.logicalPath);
  const quarantineIdentity = handle.pathIdentity(mutation.quarantinePath);
  if (logicalIdentity === mutation.quarantineIdentity && quarantineIdentity === mutation.placeholderIdentity) {
    exchangeMutationPaths(
      handle,
      mutation,
      mutation.logicalPath,
      mutation.quarantinePath,
      mutation.quarantineIdentity,
      mutation.placeholderIdentity,
      directory
    );
  } else if (logicalIdentity !== mutation.placeholderIdentity || quarantineIdentity !== mutation.quarantineIdentity) {
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.logicalPath,
      evidenceIdentity: logicalIdentity,
      kind: "canonical",
      logicalPath: mutation.logicalPath,
      scope: directory ? "tree" : "file"
    });
    recordUnboundProjectionEvidence(handle, {
      evidencePath: mutation.quarantinePath,
      evidenceIdentity: quarantineIdentity,
      kind: "quarantine",
      logicalPath: mutation.logicalPath,
      scope: directory ? "tree" : "file"
    });
    handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
    throw new Error("managed projection target identity changed; recovery evidence retained");
  }
  handle.removeFileViaGuardExact(
    mutation.logicalPath,
    mutation.placeholderIdentity,
    mutation.logicalPath,
    directory,
    projectionContentDigest(handle, mutation.logicalPath, directory ? "tree" : "file")
  );
  managedProjectionApplyFaultForTest?.();
  removePlaceholder(handle, mutation.quarantinePath, mutation.quarantineIdentity, directory);
}
function containsProjectionFile(handle, path) {
  return handle.listDirectory(path).some((name) => {
    const child = `${path}/${name}`;
    return handle.pathKind(child) === "file" || containsProjectionFile(handle, child);
  });
}
function applyLegacyCleanupMutation(handle, mutation) {
  resumeProjectionExchange(handle, mutation);
  const quarantinePath = mutation.quarantinePath;
  if (handle.pathExists(mutation.logicalPath)) {
    if (mutation.quarantineIdentity === null) {
      mutation.quarantineIdentity = handle.pathIdentity(mutation.logicalPath);
      persistMutation(handle, mutation);
    }
    if (!handle.pathExists(quarantinePath)) {
      mutation.placeholderIdentity = handle.prepareDirectoryPlaceholder(quarantinePath);
      persistMutation(handle, mutation);
    } else if (mutation.placeholderIdentity === null) {
      recordUnboundProjectionEvidence(handle, {
        evidencePath: quarantinePath,
        evidenceIdentity: handle.pathIdentity(quarantinePath),
        kind: "quarantine",
        logicalPath: mutation.logicalPath,
        scope: "tree"
      });
      const parent = dirname4(quarantinePath).replaceAll("\\", "/");
      mutation.quarantinePath = `${parent === "." ? "" : `${parent}/`}.gsd-projection-remove-${randomUUID2()}`;
      persistMutation(handle, mutation);
      mutation.placeholderIdentity = handle.prepareDirectoryPlaceholder(mutation.quarantinePath);
      persistMutation(handle, mutation);
    }
    const logicalIdentity = handle.pathIdentity(mutation.logicalPath);
    const quarantineIdentity = handle.pathIdentity(mutation.quarantinePath);
    if (logicalIdentity === mutation.quarantineIdentity && quarantineIdentity === mutation.placeholderIdentity) {
      exchangeMutationPaths(
        handle,
        mutation,
        mutation.logicalPath,
        mutation.quarantinePath,
        mutation.quarantineIdentity,
        mutation.placeholderIdentity,
        true
      );
    } else if (logicalIdentity !== mutation.placeholderIdentity || quarantineIdentity !== mutation.quarantineIdentity) {
      recordUnboundProjectionEvidence(handle, {
        evidencePath: mutation.logicalPath,
        evidenceIdentity: logicalIdentity,
        kind: "canonical",
        logicalPath: mutation.logicalPath,
        scope: "tree"
      });
      recordUnboundProjectionEvidence(handle, {
        evidencePath: mutation.quarantinePath,
        evidenceIdentity: quarantineIdentity,
        kind: "quarantine",
        logicalPath: mutation.logicalPath,
        scope: "tree"
      });
      handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
      throw new Error("managed projection target identity changed; recovery evidence retained");
    }
  }
  legacyProjectionCleanupExchangeFaultForTest?.();
  if (handle.pathExists(mutation.logicalPath)) {
    handle.removeFileViaGuardExact(
      mutation.logicalPath,
      mutation.placeholderIdentity,
      mutation.logicalPath,
      true,
      projectionContentDigest(handle, mutation.logicalPath, "tree")
    );
  }
  legacyProjectionCleanupBoundaryForTest?.();
  const milestone = basename4(mutation.logicalPath);
  const activeQuarantinePath = mutation.quarantinePath;
  const laterAuthority = handle.pathExists("gsd.db") || handle.pathExists(`worktrees/${milestone}`) || containsProjectionFile(handle, activeQuarantinePath);
  if (laterAuthority) {
    handle.restoreQuarantinedTreeExact(
      activeQuarantinePath,
      mutation.logicalPath,
      mutation.quarantineIdentity,
      projectionContentDigest(handle, activeQuarantinePath, "tree")
    );
    handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
    throw new Error("later authority appeared during orphan cleanup");
  }
  handle.removeFileViaGuardExact(
    activeQuarantinePath,
    mutation.quarantineIdentity,
    activeQuarantinePath,
    true,
    projectionContentDigest(handle, activeQuarantinePath, "tree")
  );
}
function recoverManagedProjectionMutations(targetRoot, handle) {
  if (!handle.pathExists(JOURNAL_LOGICAL_ROOT)) return;
  for (const name of handle.listDirectory(JOURNAL_LOGICAL_ROOT)) {
    if (!name.endsWith(".json")) {
      if (name.startsWith(".gsd")) throw new Error("managed projection mutation journal is invalid");
      console.warn(`gsd: skipping foreign file in managed projection mutation journal: ${name}`);
      continue;
    }
    const journalPath = `${JOURNAL_LOGICAL_ROOT}/${name}`;
    const mutation = validateMutation(
      JSON.parse(handle.readFile(journalPath).toString("utf8")),
      targetRoot,
      join6(journalRoot(targetRoot), name)
    );
    if (mutation.legacyCleanup) applyLegacyCleanupMutation(handle, mutation);
    else if (mutation.operation === "write") applyWriteMutation(handle, mutation);
    else applyRemoveMutation(handle, mutation);
    if (mutation.operation !== "remove-tree") {
      recordManagedProjectionLogicalPath(handle, mutation.logicalPath);
    }
    handle.removeFile(journalPath);
  }
}
function pathToken(value, label) {
  const hex = createHash2("sha256").update(`${label}\0${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function evidenceResolutionPaths(id, evidencePath, destinationPath) {
  const evidenceParent = dirname4(evidencePath).replaceAll("\\", "/");
  const destinationParent = destinationPath === null ? null : dirname4(destinationPath).replaceAll("\\", "/");
  const prefix = (parent) => parent === "." ? "" : `${parent}/`;
  return {
    guardPath: `${prefix(evidenceParent)}.gsd-projection-remove-${pathToken(id, "guard")}`,
    stagingPath: destinationParent === null ? null : `${prefix(destinationParent)}.gsd-projection-tmp-${pathToken(id, "staging")}`,
    exchangePath: `${prefix(evidenceParent)}.gsd-projection-exchange-${pathToken(id, "exchange")}`
  };
}
function copyEvidence(handle, sourcePath, destinationPath, scope) {
  if (scope === "file") {
    handle.writeFile(destinationPath, handle.readFile(sourcePath));
    unboundEvidenceCopyFaultForTest?.();
    return;
  }
  const copyTree = (source, destination) => {
    for (const name of handle.listDirectory(source)) {
      const childSource = `${source}/${name}`;
      const childDestination = `${destination}/${name}`;
      if (handle.pathKind(childSource) === "file") {
        handle.writeFile(childDestination, handle.readFile(childSource));
      } else {
        handle.createDirectory(childDestination);
        copyTree(childSource, childDestination);
      }
      unboundEvidenceCopyFaultForTest?.();
    }
  };
  copyTree(sourcePath, destinationPath);
}
function persistResolvingEvidence(handle, evidence) {
  const entries = readUnboundProjectionEvidence(handle);
  writeUnboundProjectionEvidence(
    handle,
    entries.map((entry) => entry.evidenceId === evidence.evidenceId ? evidence : entry)
  );
}
function removeResolutionPath(handle, path, identity, tree) {
  if (handle.pathExists(path)) {
    handle.removeFileViaGuardExact(
      path,
      identity,
      path,
      tree,
      projectionContentDigest(handle, path, tree ? "tree" : "file")
    );
  }
}
function moveEvidenceIntoGuard(handle, evidence) {
  const resolution = evidence.resolution;
  const paths = evidenceResolutionPaths(evidence.evidenceId, evidence.evidencePath, resolution.destinationPath);
  if (resolution.phase !== "prepared") return resolution.guardPath;
  if (!handle.pathExists(evidence.evidencePath)) {
    if (!handle.pathExists(resolution.guardPath) || handle.pathIdentity(resolution.guardPath) !== resolution.currentIdentity) {
      throw new Error("unbound projection evidence is unavailable");
    }
    resolution.guardIdentity = resolution.currentIdentity;
    resolution.phase = "guarded";
    persistResolvingEvidence(handle, evidence);
    return resolution.guardPath;
  }
  if (resolution.guardIdentity === null) {
    if (handle.pathExists(resolution.guardPath)) {
      throw new Error("unbound projection evidence guard is not journal-bound");
    }
    resolution.guardIdentity = evidence.scope === "tree" ? handle.prepareDirectoryPlaceholder(resolution.guardPath) : handle.prepareFileTemporary(resolution.guardPath, Buffer.alloc(0));
    persistResolvingEvidence(handle, evidence);
  }
  if (resolution.exchangeIdentity === null) {
    if (handle.pathExists(paths.exchangePath)) {
      throw new Error("unbound projection exchange guard is not journal-bound");
    }
    resolution.exchangeIdentity = evidence.scope === "tree" ? handle.prepareDirectoryPlaceholder(paths.exchangePath) : handle.prepareFileTemporary(paths.exchangePath, Buffer.alloc(0));
    persistResolvingEvidence(handle, evidence);
  }
  handle.exchangePaths(
    evidence.evidencePath,
    resolution.guardPath,
    resolution.currentIdentity,
    resolution.guardIdentity,
    paths.exchangePath,
    resolution.exchangeIdentity
  );
  resolution.exchangeIdentity = null;
  persistResolvingEvidence(handle, evidence);
  removeResolutionPath(
    handle,
    evidence.evidencePath,
    resolution.guardIdentity,
    evidence.scope === "tree"
  );
  resolution.guardIdentity = resolution.currentIdentity;
  resolution.phase = "guarded";
  persistResolvingEvidence(handle, evidence);
  return resolution.guardPath;
}
function publishEvidenceDestination(handle, evidence, sourcePath) {
  const resolution = evidence.resolution;
  if (resolution.action === "discard" || resolution.phase === "published") return;
  const destination = resolution.destinationPath;
  if (evidence.scope === "file") {
    if (!handle.pathExists(destination)) copyEvidence(handle, sourcePath, destination, "file");
  } else {
    const staging = resolution.stagingPath;
    if (handle.pathExists(staging)) {
      if (resolution.stagingIdentity === null || handle.pathIdentity(staging) !== resolution.stagingIdentity) {
        throw new Error("unbound projection evidence staging identity changed");
      }
      removeResolutionPath(handle, staging, resolution.stagingIdentity, true);
      resolution.stagingIdentity = null;
      persistResolvingEvidence(handle, evidence);
    }
    resolution.stagingIdentity = handle.prepareDirectoryPlaceholder(staging);
    persistResolvingEvidence(handle, evidence);
    copyEvidence(handle, sourcePath, staging, "tree");
    if (projectionContentDigest(handle, staging, "tree") !== resolution.contentDigest) {
      throw new Error("unbound projection evidence staging verification failed");
    }
    if (!handle.pathExists(destination)) {
      try {
        handle.restoreQuarantinedTreeExact(
          staging,
          destination,
          resolution.stagingIdentity,
          resolution.contentDigest
        );
      } catch (error) {
        const destinationPublished = handle.pathExists(destination) && projectionContentDigest(handle, destination, "tree") === resolution.contentDigest;
        if (handle.pathExists(destination) && !destinationPublished) {
          throw new Error("unbound projection evidence destination changed during publication");
        }
        if (handle.pathExists(staging) && (resolution.stagingIdentity === null || handle.pathIdentity(staging) !== resolution.stagingIdentity || projectionContentDigest(handle, staging, "tree") !== resolution.contentDigest)) {
          if (destinationPublished) {
            const logicalParent = dirname4(evidence.logicalPath).replaceAll("\\", "/");
            const replacementPath = `${logicalParent === "." ? "" : `${logicalParent}/`}.gsd-projection-remove-${randomUUID2()}`;
            const replacementIdentity = handle.quarantineTree(staging, replacementPath);
            recordUnboundProjectionEvidence(handle, {
              evidencePath: replacementPath,
              evidenceIdentity: replacementIdentity,
              kind: "quarantine",
              logicalPath: evidence.logicalPath,
              scope: "tree"
            });
            resolution.stagingIdentity = null;
            resolution.phase = "published";
            persistResolvingEvidence(handle, evidence);
          }
        }
        throw error;
      }
    } else if (projectionContentDigest(handle, destination, "tree") !== resolution.contentDigest) {
      throw new Error("unbound projection evidence destination already contains different content");
    } else {
      removeResolutionPath(handle, staging, resolution.stagingIdentity, true);
    }
    resolution.stagingIdentity = null;
  }
  if (!handle.pathExists(destination) || projectionContentDigest(handle, destination, evidence.scope) !== resolution.contentDigest) {
    throw new Error("unbound projection evidence destination verification failed");
  }
  resolution.phase = "published";
  persistResolvingEvidence(handle, evidence);
}
function applyEvidenceResolution(handle, evidence) {
  const resolution = evidence.resolution;
  if (evidence.origin === "native-control") {
    markNativeEvidenceDescriptorResolving(handle, evidence.evidencePath);
  }
  if ((resolution.phase === "published" || resolution.phase === "deleting") && !handle.pathExists(resolution.guardPath)) {
    if (resolution.destinationPath !== null && (!handle.pathExists(resolution.destinationPath) || projectionContentDigest(handle, resolution.destinationPath, evidence.scope) !== resolution.contentDigest)) {
      throw new Error("unbound projection evidence completed destination changed");
    }
    return;
  }
  const source = moveEvidenceIntoGuard(handle, evidence);
  unboundEvidenceGuardFaultForTest?.();
  if (resolution.phase !== "deleting" && (handle.pathIdentity(source) !== resolution.currentIdentity || projectionContentDigest(handle, source, evidence.scope) !== resolution.contentDigest)) {
    const changed = {
      evidenceId: evidenceId(source, "quarantine", evidence.logicalPath, evidence.scope),
      evidencePath: source,
      evidenceIdentity: handle.pathIdentity(source),
      contentDigest: projectionContentDigest(handle, source, evidence.scope),
      kind: "quarantine",
      logicalPath: evidence.logicalPath,
      scope: evidence.scope,
      transition: "retained"
    };
    const entries = readUnboundProjectionEvidence(handle);
    writeUnboundProjectionEvidence(
      handle,
      entries.map((entry) => entry.evidenceId === evidence.evidenceId ? changed : entry)
    );
    throw new Error("unbound projection evidence changed inside its private guard");
  }
  if (resolution.phase !== "deleting") publishEvidenceDestination(handle, evidence, source);
  if (resolution.phase !== "published" && resolution.phase !== "deleting") {
    resolution.phase = "published";
    persistResolvingEvidence(handle, evidence);
  }
  unboundEvidenceRemovalFaultForTest?.();
  resolution.phase = "deleting";
  persistResolvingEvidence(handle, evidence);
  try {
    handle.removeFileViaGuardExact(
      source,
      resolution.currentIdentity,
      source,
      evidence.scope === "tree",
      resolution.contentDigest,
      true
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("retained unexpected occupants") || !handle.pathExists(source)) throw error;
    const pending = {
      evidenceId: evidenceId(source, "quarantine", evidence.logicalPath, "tree"),
      evidencePath: source,
      evidenceIdentity: handle.pathIdentity(source),
      contentDigest: projectionContentDigest(handle, source, "tree"),
      kind: "quarantine",
      logicalPath: evidence.logicalPath,
      scope: "tree",
      transition: "retained",
      nativeDeletionAckPending: true
    };
    const entries = readUnboundProjectionEvidence(handle);
    writeUnboundProjectionEvidence(
      handle,
      entries.map((entry) => entry.evidenceId === evidence.evidenceId ? pending : entry)
    );
    readUnboundProjectionEvidence(handle);
    throw error;
  }
}
function recoverEvidenceResolutions(handle) {
  const entries = readUnboundProjectionEvidence(handle);
  const retained = [];
  let changed = false;
  for (const evidence of entries) {
    if (evidence.transition === "retained") {
      retained.push(evidence);
      continue;
    }
    applyEvidenceResolution(handle, evidence);
    changed = true;
  }
  if (changed) {
    writeUnboundProjectionEvidence(handle, retained);
    for (const evidence of entries) {
      if (evidence.transition === "resolving" && evidence.origin === "native-control") {
        removeNativeEvidenceDescriptor(handle, evidence.evidencePath);
      }
    }
  }
}
function managedProjectionTarget(filePath) {
  let current = dirname4(resolve6(filePath));
  while (current !== dirname4(current)) {
    if (basename4(current).toLocaleLowerCase("en-US") === ".gsd") {
      if (!existsSync3(join6(current, "gsd.db"))) return null;
      const targetRoot = dirname4(current);
      const logicalPath = logicalProjectionPath(targetRoot, filePath);
      return classifyGsdLogicalPath(logicalPath) === "managed" ? { targetRoot, logicalPath } : null;
    }
    current = dirname4(current);
  }
  return null;
}
function beginManagedProjectionMutation(filePath, operation, content, encoding) {
  const target = managedProjectionTarget(filePath);
  if (target === null) return null;
  if (!isProjectionRootIdentityLockAvailable()) {
    if (operation === "write") {
      recordFallbackProjectionObstruction(target.targetRoot, target.logicalPath);
    }
    return null;
  }
  const root = journalRoot(target.targetRoot);
  const handle = openManagedProjectionRootWithRetry(() => openManagedProjectionRoot(target.targetRoot));
  try {
    recoverManagedProjectionMutations(target.targetRoot, handle);
    recoverEvidenceResolutions(handle);
    const conflict = readUnboundProjectionEvidence(handle).find((entry) => evidenceConflictsWithPath(entry, target.logicalPath));
    if (conflict) {
      throw new Error(
        `managed projection target has unresolved recovery evidence: ${conflict.logicalPath} at ${conflict.evidencePath}; review it with /gsd doctor`
      );
    }
    if (handle.pathExists(target.logicalPath)) {
      const occupantKind = handle.pathKind(target.logicalPath);
      const requiredKind = operation === "remove-tree" ? "directory" : "file";
      if (occupantKind !== requiredKind) {
        throw new Error(
          `managed projection ${operation} target is obstructed by a ${occupantKind}: ${target.logicalPath}`
        );
      }
    }
    const name = `${randomUUID2()}.json`;
    const journalPath = join6(root, name);
    const targetDirectory = target.logicalPath.split("/").slice(0, -1).join("/");
    const temporaryPath = operation === "write" ? `${targetDirectory.length === 0 ? "" : `${targetDirectory}/`}.gsd-projection-tmp-${randomUUID2()}` : null;
    const quarantinePath = operation === "remove-tree" || operation === "remove" ? `${targetDirectory.length === 0 ? "" : `${targetDirectory}/`}.gsd-projection-remove-${randomUUID2()}` : null;
    const reviewedIdentity = handle.pathExists(target.logicalPath) ? handle.pathIdentity(target.logicalPath) : "-";
    const mutation = {
      ...target,
      journalPath,
      operation,
      legacyCleanup: false,
      content,
      encoding,
      temporaryPath,
      temporaryIdentity: null,
      replacementPath: temporaryPath === null ? null : `${temporaryPath}.replaced`,
      replacementIdentity: operation === "write" ? reviewedIdentity : null,
      quarantinePath,
      quarantineIdentity: operation === "write" ? null : reviewedIdentity,
      placeholderIdentity: null,
      exchangeGuardPath: `${targetDirectory.length === 0 ? "" : `${targetDirectory}/`}.gsd-projection-exchange-${basename4(name, ".json")}`,
      exchangeGuardIdentity: null,
      exchangeState: null,
      handle
    };
    persistMutation(handle, mutation);
    return mutation;
  } catch (error) {
    handle.close();
    throw error;
  }
}
function applyManagedProjectionMutation(mutation) {
  if (mutation === null) return false;
  if (mutation.operation === "write") {
    applyWriteMutation(mutation.handle, mutation);
    managedProjectionApplyFaultForTest?.();
  } else applyRemoveMutation(mutation.handle, mutation);
  return true;
}
function commitManagedProjectionMutation(mutation) {
  if (mutation === null) return;
  try {
    if (mutation.operation !== "remove-tree") {
      recordManagedProjectionLogicalPath(mutation.handle, mutation.logicalPath);
    }
    mutation.handle.removeFile(`${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`);
  } finally {
    mutation.handle.close();
  }
}
function retainManagedProjectionMutation(mutation) {
  mutation?.handle.close();
}
function abortManagedProjectionMutation(mutation) {
  if (mutation === null) return;
  try {
    const path = `${JOURNAL_LOGICAL_ROOT}/${basename4(mutation.journalPath)}`;
    if (mutation.handle.pathExists(path)) mutation.handle.removeFile(path);
  } finally {
    mutation.handle.close();
  }
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/projection-mutation-guard.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync3 } from "node:fs";
import { basename as basename5, dirname as dirname5, extname, join as join7, relative as relative3, resolve as resolve7 } from "node:path";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/projection-content-hash.ts
import { createHash as createHash3 } from "node:crypto";
function normalizeForHash(content) {
  return content.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
}
function computeProjectionSha(content) {
  return createHash3("sha256").update(normalizeForHash(content)).digest("hex").slice(0, 16);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/compat/compat-marker-validation.ts
import { isAbsolute, normalize as normalize2 } from "node:path";
function isSafeProjectionKey(key) {
  if (key.length === 0 || key.includes("\\") || key.includes("\0")) return false;
  if (isAbsolute(key) || /^[A-Za-z]:/.test(key)) return false;
  const normalized = normalize2(key);
  return normalized !== ".." && !normalized.startsWith("../") && !isAbsolute(normalized);
}
function isValidProjectionEntry(value) {
  if (typeof value !== "object" || value === null) return false;
  const entry = value;
  return typeof entry.sha === "string" && Array.isArray(entry.entities) && entry.entities.every((entity) => typeof entity === "string");
}
function isValidProjectionMap(value) {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).every(
    ([key, entry]) => isSafeProjectionKey(key) && isValidProjectionEntry(entry)
  );
}
function isValidPlanningMarker(value) {
  if (typeof value !== "object" || value === null) return false;
  const planning = value;
  return typeof planning.active === "boolean" && (planning.layout === null || planning.layout === "flat-phases" || planning.layout === "multi-milestone" || planning.layout === "legacy-milestone-dir") && isValidProjectionMap(planning.projections) && isValidProjectionMap(planning.passthrough);
}
function isValidCompatMarker(value) {
  if (typeof value !== "object" || value === null) return false;
  const marker = value;
  return marker.lastWriter === "gsd-pi" && typeof marker.schema === "number" && typeof marker.lastProjectedAt === "string" && typeof marker.piVersion === "string" && isValidProjectionMap(marker.projections) && (marker.planning === void 0 || isValidPlanningMarker(marker.planning));
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/projection-mutation-guard.ts
function projectionLocation(filePath) {
  const absolutePath = resolve7(filePath);
  let current = dirname5(absolutePath);
  while (current !== dirname5(current)) {
    const name = basename5(current).toLocaleLowerCase("en-US");
    if (name === ".gsd" || name === ".planning") {
      const rootName = name;
      return {
        basePath: dirname5(current),
        rootName,
        relPath: relative3(current, absolutePath).replace(/\\/g, "/")
      };
    }
    current = dirname5(current);
  }
  return null;
}
function isPlanningPassthrough(relPath) {
  if (relPath.startsWith("codebase/") || relPath.startsWith("research/")) return true;
  const name = relPath.split("/").pop() ?? relPath;
  return relPath === "config.json" || name === "PATTERNS.md" || name === "REVIEWS.md" || name.endsWith("-DISCUSSION-LOG.md") || name.endsWith("-RESEARCH.md") && !name.endsWith("-PLAN.md");
}
function baselineSha(basePath, rootName, relPath) {
  let marker;
  try {
    marker = JSON.parse(readFileSync5(join7(basePath, ".gsd", ".compat.json"), "utf-8"));
  } catch {
    return void 0;
  }
  if (!isValidCompatMarker(marker)) return void 0;
  if (rootName === ".gsd") return marker.projections[relPath]?.sha;
  return marker.planning?.projections[relPath]?.sha;
}
function uniqueQuarantinePath(basePath, rootName, relPath) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const path = join7(basePath, ".gsd", "quarantine", "projections", stamp, rootName.slice(1), relPath);
  if (!existsSync4(path)) return path;
  let suffix = 2;
  while (existsSync4(`${path}.${suffix}`)) suffix += 1;
  return `${path}.${suffix}`;
}
function preserveManagedProjectionBeforeMutation(filePath, nextContent) {
  const location = projectionLocation(filePath);
  if (!location || extname(location.relPath).toLocaleLowerCase("en-US") !== ".md") return false;
  if (location.rootName === ".gsd") {
    if (classifyGsdLogicalPath(location.relPath) !== "managed") return false;
  } else if (isPlanningPassthrough(location.relPath)) {
    return false;
  }
  if (!existsSync4(filePath)) return false;
  const current = readFileSync5(filePath);
  const currentSha = computeProjectionSha(current.toString("utf-8"));
  if (nextContent && currentSha === computeProjectionSha(nextContent.toString("utf-8"))) return false;
  if (currentSha === baselineSha(location.basePath, location.rootName, location.relPath)) return false;
  const target = uniqueQuarantinePath(location.basePath, location.rootName, location.relPath);
  mkdirSync2(dirname5(target), { recursive: true });
  writeFileSync3(target, current);
  return true;
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/atomic-write.ts
var TRANSIENT_LOCK_ERROR_CODES = /* @__PURE__ */ new Set(["EBUSY", "EPERM", "EACCES"]);
var MAX_RENAME_ATTEMPTS = 5;
var SYNC_SLEEP_BUFFER = new SharedArrayBuffer(4);
var SYNC_SLEEP_VIEW = new Int32Array(SYNC_SLEEP_BUFFER);
var managedMutationBoundaryForTest = null;
function defaultTempPath(filePath) {
  return filePath + `.tmp.${randomBytes(4).toString("hex")}`;
}
function computeRetryDelayMs(attempt) {
  const base = 8 * attempt;
  const jitter = randomBytes(1)[0] % 5;
  return base + jitter;
}
function sleepSync(ms) {
  Atomics.wait(SYNC_SLEEP_VIEW, 0, 0, ms);
}
function normalizeErrnoCode(error) {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    return typeof code === "string" ? code : void 0;
  }
  return void 0;
}
function isTransientLockError(error) {
  const code = normalizeErrnoCode(error);
  return typeof code === "string" && TRANSIENT_LOCK_ERROR_CODES.has(code);
}
function buildAtomicWriteError(filePath, attempts, error) {
  const code = normalizeErrnoCode(error) ?? "UNKNOWN";
  const message = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(
    `Atomic write to ${filePath} failed after ${attempts} attempts (last error code: ${code}): ${message}`
  );
  wrapped.code = code;
  if (error instanceof Error && "stack" in error && error.stack) {
    wrapped.stack = error.stack;
  }
  return wrapped;
}
function cleanupTempFileSync(tmpPath, ops) {
  try {
    ops.unlink(tmpPath);
  } catch {
  }
}
function atomicWriteSyncWithOps(filePath, content, encoding = "utf-8", ops) {
  ops.mkdir(dirname6(filePath), { recursive: true });
  const tmpPath = ops.createTempPath?.(filePath) ?? defaultTempPath(filePath);
  ops.writeFile(tmpPath, content, encoding);
  ops.fsyncFile?.(tmpPath);
  let lastError = null;
  let attempts = 0;
  for (attempts = 1; attempts <= MAX_RENAME_ATTEMPTS; attempts++) {
    try {
      ops.rename(tmpPath, filePath);
      ops.fsyncDirectory?.(dirname6(filePath));
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientLockError(error) || attempts === MAX_RENAME_ATTEMPTS) {
        break;
      }
      ops.sleep(computeRetryDelayMs(attempts));
    }
  }
  cleanupTempFileSync(tmpPath, ops);
  throw buildAtomicWriteError(filePath, attempts, lastError);
}
function fsyncFileSyncImpl(path) {
  const access = process.platform === "win32" ? fsConstants.O_RDWR : fsConstants.O_RDONLY;
  const fd = openSync2(path, access);
  try {
    fsyncSync2(fd);
  } finally {
    closeSync2(fd);
  }
}
function fsyncDirectorySyncImpl(path) {
  if (process.platform === "win32") {
    syncDirectoryEntry(path);
    return;
  }
  const fd = openSync2(path, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
  try {
    fsyncSync2(fd);
  } finally {
    closeSync2(fd);
  }
}
var DEFAULT_SYNC_OPS = {
  mkdir: (path, options) => mkdirSync3(path, options),
  writeFile: (path, content, encoding) => writeFileSync4(path, content, encoding),
  rename: (from, to) => renameSync2(from, to),
  unlink: (path) => unlinkSync3(path),
  sleep: sleepSync,
  fsyncFile: fsyncFileSyncImpl,
  fsyncDirectory: fsyncDirectorySyncImpl
};
function atomicWriteSync(filePath, content, encoding = "utf-8") {
  withProjectionMutationSync(filePath, () => {
    preserveManagedProjectionBeforeMutation(filePath, Buffer.from(content, encoding));
    const mutation = beginManagedProjectionMutation(filePath, "write", content, encoding);
    let managedApplyStarted = false;
    try {
      managedMutationBoundaryForTest?.("before-write", filePath);
      managedApplyStarted = mutation !== null;
      if (!applyManagedProjectionMutation(mutation)) {
        atomicWriteSyncWithOps(filePath, content, encoding, DEFAULT_SYNC_OPS);
      }
      managedMutationBoundaryForTest?.("after-write", filePath);
    } catch (error) {
      if (managedApplyStarted) retainManagedProjectionMutation(mutation);
      else abortManagedProjectionMutation(mutation);
      throw error;
    }
    commitManagedProjectionMutation(mutation);
  });
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/captures.ts
var CAPTURES_FILENAME = "CAPTURES.md";
var VALID_CLASSIFICATIONS = [
  "quick-task",
  "inject",
  "defer",
  "replan",
  "note",
  "stop",
  "backtrack"
];
function resolveCapturesPath(basePath) {
  const projectRoot = projectRootFromWorktreePath(resolve9(basePath));
  if (projectRoot) {
    return join9(projectRoot, ".gsd", CAPTURES_FILENAME);
  }
  return join9(gsdRoot(basePath), CAPTURES_FILENAME);
}
function appendCapture(basePath, text) {
  const filePath = resolveCapturesPath(basePath);
  const dir = join9(filePath, "..");
  if (!existsSync6(dir)) {
    mkdirSync4(dir, { recursive: true });
  }
  const id = `CAP-${randomUUID3().slice(0, 8)}`;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const entry = [
    `### ${id}`,
    `**Text:** ${text}`,
    `**Captured:** ${timestamp}`,
    `**Status:** pending`,
    ""
  ].join("\n");
  if (existsSync6(filePath)) {
    const existing = readFileSync7(filePath, "utf-8");
    atomicWriteSync(filePath, existing.trimEnd() + "\n\n" + entry, "utf-8");
  } else {
    const header = `# Captures

`;
    atomicWriteSync(filePath, header + entry, "utf-8");
  }
  return id;
}
function loadAllCaptures(basePath) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return [];
  const content = readFileSync7(filePath, "utf-8");
  return parseCapturesContent(content);
}
function loadPendingCaptures(basePath) {
  return loadAllCaptures(basePath).filter((c) => c.status === "pending");
}
function hasPendingCaptures(basePath) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return false;
  try {
    const content = readFileSync7(filePath, "utf-8");
    return /\*\*Status:\*\*\s*pending/i.test(content);
  } catch {
    return false;
  }
}
function countPendingCaptures(basePath) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return 0;
  try {
    const content = readFileSync7(filePath, "utf-8");
    const matches = content.match(/\*\*Status:\*\*\s*pending/gi);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}
function markCaptureResolved(basePath, captureId, classification, resolution, rationale, milestoneId) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return;
  const content = readFileSync7(filePath, "utf-8");
  const resolvedAt = (/* @__PURE__ */ new Date()).toISOString();
  const sectionRegex = new RegExp(
    `(### ${escapeRegex(captureId)}\\n(?:(?!### ).)*?)(?=### |$)`,
    "s"
  );
  const match = sectionRegex.exec(content);
  if (!match) return;
  let section = match[1];
  section = section.replace(
    /\*\*Status:\*\*\s*.+/,
    `**Status:** resolved`
  );
  const newFields = [
    `**Classification:** ${classification}`,
    `**Resolution:** ${resolution}`,
    `**Rationale:** ${rationale}`,
    `**Resolved:** ${resolvedAt}`
  ];
  if (milestoneId) {
    newFields.push(`**Milestone:** ${milestoneId}`);
  }
  section = section.replace(/\*\*Classification:\*\*\s*.+\n?/g, "");
  section = section.replace(/\*\*Resolution:\*\*\s*.+\n?/g, "");
  section = section.replace(/\*\*Rationale:\*\*\s*.+\n?/g, "");
  section = section.replace(/\*\*Resolved:\*\*\s*.+\n?/g, "");
  section = section.replace(/\*\*Milestone:\*\*\s*.+\n?/g, "");
  section = section.trimEnd() + "\n" + newFields.join("\n") + "\n";
  const updated = content.replace(sectionRegex, section);
  atomicWriteSync(filePath, updated, "utf-8");
}
function markCaptureExecuted(basePath, captureId) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return;
  const content = readFileSync7(filePath, "utf-8");
  const executedAt = (/* @__PURE__ */ new Date()).toISOString();
  const sectionRegex = new RegExp(
    `(### ${escapeRegex(captureId)}\\n(?:(?!### ).)*?)(?=### |$)`,
    "s"
  );
  const match = sectionRegex.exec(content);
  if (!match) return;
  let section = match[1];
  section = section.replace(/\*\*Executed:\*\*\s*.+\n?/g, "");
  section = section.trimEnd() + `
**Executed:** ${executedAt}
`;
  const updated = content.replace(sectionRegex, section);
  atomicWriteSync(filePath, updated, "utf-8");
}
function loadActionableCaptures(basePath, currentMilestoneId) {
  return loadAllCaptures(basePath).filter(
    (c) => c.status === "resolved" && !c.executed && (c.classification === "inject" || c.classification === "replan" || c.classification === "quick-task") && // Staleness gate: exclude captures resolved in a different milestone (#2872)
    (!currentMilestoneId || !c.resolvedInMilestone || c.resolvedInMilestone === currentMilestoneId)
  );
}
function loadStopCaptures(basePath) {
  return loadAllCaptures(basePath).filter(
    (c) => c.status === "resolved" && !c.executed && (c.classification === "stop" || c.classification === "backtrack")
  );
}
function loadBacktrackCaptures(basePath) {
  return loadAllCaptures(basePath).filter(
    (c) => c.status === "resolved" && !c.executed && c.classification === "backtrack"
  );
}
function revertExecutorResolvedCaptures(basePath) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return 0;
  let content = readFileSync7(filePath, "utf-8");
  let reverted = 0;
  const all = loadAllCaptures(basePath);
  for (const capture of all) {
    if (capture.status === "resolved" && !capture.classification) {
      const sectionRegex = new RegExp(
        `(### ${escapeRegex(capture.id)}\\n(?:(?!### ).)*?)(?=### |$)`,
        "s"
      );
      const match = sectionRegex.exec(content);
      if (match) {
        let section = match[1];
        section = section.replace(
          /\*\*Status:\*\*\s*resolved/i,
          "**Status:** pending"
        );
        content = content.replace(sectionRegex, section);
        reverted++;
      }
    }
  }
  if (reverted > 0) {
    atomicWriteSync(filePath, content, "utf-8");
  }
  return reverted;
}
function stampCaptureMilestone(basePath, captureId, milestoneId) {
  const filePath = resolveCapturesPath(basePath);
  if (!existsSync6(filePath)) return;
  const content = readFileSync7(filePath, "utf-8");
  const sectionRegex = new RegExp(
    `(### ${escapeRegex(captureId)}\\n(?:(?!### ).)*?)(?=### |$)`,
    "s"
  );
  const match = sectionRegex.exec(content);
  if (!match) return;
  let section = match[1];
  if (/\*\*Milestone:\*\*/.test(section)) return;
  const resolvedFieldEnd = section.search(/\*\*Resolved:\*\*\s*.+\n?/);
  if (resolvedFieldEnd !== -1) {
    const resolvedMatch = section.match(/\*\*Resolved:\*\*\s*.+\n?/);
    const insertPos = resolvedFieldEnd + (resolvedMatch?.[0]?.length ?? 0);
    section = section.slice(0, insertPos) + `**Milestone:** ${milestoneId}
` + section.slice(insertPos);
  } else {
    section = section.trimEnd() + `
**Milestone:** ${milestoneId}
`;
  }
  const updated = content.replace(sectionRegex, section);
  atomicWriteSync(filePath, updated, "utf-8");
}
function parseCapturesContent(content) {
  const entries = [];
  const sections = content.split(/^### /m).slice(1);
  for (const section of sections) {
    const lines = section.split("\n");
    const id = lines[0]?.trim();
    if (!id) continue;
    const body = lines.slice(1).join("\n");
    const text = extractBoldField(body, "Text");
    const timestamp = extractBoldField(body, "Captured");
    const statusRaw = extractBoldField(body, "Status");
    const classification = extractBoldField(body, "Classification");
    const resolution = extractBoldField(body, "Resolution");
    const rationale = extractBoldField(body, "Rationale");
    const resolvedAt = extractBoldField(body, "Resolved");
    const milestoneId = extractBoldField(body, "Milestone");
    const executedAt = extractBoldField(body, "Executed");
    if (!text || !timestamp) continue;
    const status = statusRaw === "resolved" || statusRaw === "triaged" ? statusRaw : "pending";
    entries.push({
      id,
      text,
      timestamp,
      status,
      ...classification && VALID_CLASSIFICATIONS.includes(classification) ? { classification } : {},
      ...resolution ? { resolution } : {},
      ...rationale ? { rationale } : {},
      ...resolvedAt ? { resolvedAt } : {},
      ...milestoneId ? { resolvedInMilestone: milestoneId } : {},
      ...executedAt ? { executed: true } : {}
    });
  }
  return entries;
}
function extractBoldField(text, key) {
  const regex = new RegExp(`^\\*\\*${escapeRegex(key)}:\\*\\*\\s*(.+)$`, "m");
  const match = regex.exec(text);
  return match ? match[1].trim() : null;
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseTriageOutput(llmResponse) {
  if (!llmResponse || !llmResponse.trim()) return [];
  const fenced = llmResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonStr = fenced ? fenced[1] : extractJsonSubstring(llmResponse);
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter(isValidTriageResult).map(normalizeTriageResult);
  } catch {
    return [];
  }
}
function extractJsonSubstring(text) {
  const arrStart = text.indexOf("[");
  const objStart = text.indexOf("{");
  let start;
  let openChar;
  let closeChar;
  if (arrStart === -1 && objStart === -1) return null;
  if (arrStart === -1) {
    start = objStart;
    openChar = "{";
    closeChar = "}";
  } else if (objStart === -1) {
    start = arrStart;
    openChar = "[";
    closeChar = "]";
  } else {
    start = Math.min(arrStart, objStart);
    openChar = start === arrStart ? "[" : "{";
    closeChar = start === arrStart ? "]" : "}";
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}
function isValidTriageResult(obj) {
  if (!obj || typeof obj !== "object") return false;
  const o = obj;
  return typeof o.captureId === "string" && typeof o.classification === "string" && VALID_CLASSIFICATIONS.includes(o.classification) && typeof o.rationale === "string";
}
function normalizeTriageResult(obj) {
  return {
    captureId: obj.captureId,
    classification: obj.classification,
    rationale: obj.rationale,
    ...Array.isArray(obj.affectedFiles) ? { affectedFiles: obj.affectedFiles } : {},
    ...typeof obj.targetSlice === "string" ? { targetSlice: obj.targetSlice } : {}
  };
}
export {
  appendCapture,
  countPendingCaptures,
  hasPendingCaptures,
  loadActionableCaptures,
  loadAllCaptures,
  loadBacktrackCaptures,
  loadPendingCaptures,
  loadStopCaptures,
  markCaptureExecuted,
  markCaptureResolved,
  parseTriageOutput,
  resolveCapturesPath,
  revertExecutorResolvedCaptures,
  stampCaptureMilestone
};
