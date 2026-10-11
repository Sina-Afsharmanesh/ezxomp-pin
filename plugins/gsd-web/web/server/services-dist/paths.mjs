import { createRequire as __gwbCreateRequireInit } from "node:module";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
import { readdirSync, existsSync as existsSync2, realpathSync as realpathSync2, statSync as statSync2, Dirent } from "node:fs";
import { join as join3, dirname, normalize, relative, resolve as resolve3 } from "node:path";
import { homedir as homedir2 } from "node:os";
import { spawnSync } from "node:child_process";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/native-parser-bridge.ts
var NATIVE_GSD_PARSER_ENABLED = process.env.GSD_ENABLE_NATIVE_GSD_PARSER === "1";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/constants.ts
var DIR_CACHE_MAX = 200;

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

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/layout-policy.ts
var LAYOUT_SEGMENTS = {
  /** Was "milestones". A phase = one unit of work (gsd-core vocabulary). */
  level1: "phases"
};
function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}
function phaseDirName(phaseNum, slug) {
  return `${pad(phaseNum)}-${slug}`;
}
function milestoneIdToPhaseNum(milestoneId) {
  const m = milestoneId.match(/^M0*(\d+)/i);
  if (!m && /^\d+$/.test(milestoneId)) return Number.parseInt(milestoneId, 10);
  return m ? Number.parseInt(m[1], 10) : 1;
}
var TEAM_MILESTONE_ID_RE = /^M(\d{3})(?:-([a-z0-9]{6}))?$/i;
var LEADING_MILESTONE_ID_TOKENS = /^(?:M\d{3}(?:-[a-z0-9]{6})?(?:[\s:_-]+|$))+/i;
function milestoneIdUniqueSuffix(milestoneId) {
  return milestoneId.match(TEAM_MILESTONE_ID_RE)?.[2]?.toLowerCase();
}
var CANONICAL_SLICE_ID_RE = /^S0*(\d+)(?:-.*)?$/i;
function slicePlanSegment(sliceId) {
  const m = sliceId.match(CANONICAL_SLICE_ID_RE);
  if (m) return pad(Number.parseInt(m[1], 10));
  if (/^\d+$/.test(sliceId)) return pad(Number.parseInt(sliceId, 10));
  return sliceId;
}
function slicePlanFileName(phaseNum, sliceId, suffix) {
  return `${pad(phaseNum)}-${slicePlanSegment(sliceId)}-${suffix}.md`;
}
function derivePhaseSlug(title) {
  const trimmed = title.trim();
  const withoutIds = trimmed.replace(LEADING_MILESTONE_ID_TOKENS, "").trim();
  const source = withoutIds || trimmed;
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return slug || "phase";
}
function canonicalPhaseDirName(milestoneId, title) {
  const phaseNum = milestoneIdToPhaseNum(milestoneId);
  const suffix = milestoneIdUniqueSuffix(milestoneId);
  const idSlug = derivePhaseSlug(milestoneId);
  const slug = derivePhaseSlug(title || milestoneId);
  const rest = slug === idSlug ? "" : slug;
  if (suffix) {
    return phaseDirName(phaseNum, rest ? `${suffix}-${rest}` : suffix);
  }
  return phaseDirName(phaseNum, rest || idSlug);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/paths.ts
var dirEntryCache = /* @__PURE__ */ new Map();
var dirListCache = /* @__PURE__ */ new Map();
var nativeTreeCache = null;
var nativeTreeBase = null;
function nativeTreeKey(dirPath, gsdDir) {
  if (!dirPath.startsWith(gsdDir)) return null;
  const rel = dirPath.slice(gsdDir.length).replace(/^\//, "");
  return rel || ".";
}
function cachedReaddirWithTypes(dirPath) {
  const cached = dirEntryCache.get(dirPath);
  if (cached) return cached;
  if (nativeTreeBase) {
    const key = nativeTreeKey(dirPath, nativeTreeBase);
    if (key && nativeTreeCache) {
      const treeEntries = nativeTreeCache.get(key);
      if (treeEntries) {
        const dirents = treeEntries.map((e) => {
          const d = Object.create(Dirent.prototype);
          Object.assign(d, {
            name: e.name,
            parentPath: dirPath,
            path: dirPath
          });
          const isDir = e.isDir;
          d.isDirectory = () => isDir;
          d.isFile = () => !isDir;
          d.isSymbolicLink = () => false;
          d.isBlockDevice = () => false;
          d.isCharacterDevice = () => false;
          d.isFIFO = () => false;
          d.isSocket = () => false;
          return d;
        });
        if (dirEntryCache.size >= DIR_CACHE_MAX) dirEntryCache.clear();
        dirEntryCache.set(dirPath, dirents);
        return dirents;
      }
    }
  }
  const entries = readdirSync(dirPath, { withFileTypes: true });
  if (dirEntryCache.size >= DIR_CACHE_MAX) dirEntryCache.clear();
  dirEntryCache.set(dirPath, entries);
  return entries;
}
function cachedReaddir(dirPath) {
  const cached = dirListCache.get(dirPath);
  if (cached) return cached;
  if (nativeTreeBase) {
    const key = nativeTreeKey(dirPath, nativeTreeBase);
    if (key && nativeTreeCache) {
      const treeEntries = nativeTreeCache.get(key);
      if (treeEntries) {
        const names = treeEntries.map((e) => e.name);
        if (dirListCache.size >= DIR_CACHE_MAX) dirListCache.clear();
        dirListCache.set(dirPath, names);
        return names;
      }
    }
  }
  const entries = readdirSync(dirPath);
  if (dirListCache.size >= DIR_CACHE_MAX) dirListCache.clear();
  dirListCache.set(dirPath, entries);
  return entries;
}
function isExistingFile(path) {
  try {
    return statSync2(path).isFile();
  } catch {
    return false;
  }
}
function clearPathCache() {
  dirEntryCache.clear();
  dirListCache.clear();
  nativeTreeCache = null;
  nativeTreeBase = null;
}
var FRAMEWORK_METADATA_DIRS = [".gsd", ".planning", ".audits"];
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
function buildMilestoneFileName(milestoneId, suffix) {
  const phaseNum = milestoneIdToPhaseNum(milestoneId);
  return `${String(phaseNum).padStart(2, "0")}-${suffix}.md`;
}
function buildSliceFileName(sliceId, suffix) {
  return `${slicePlanSegment(sliceId)}-${suffix}.md`;
}
function buildTaskFileName(taskId, suffix) {
  return `${taskId}-${suffix}.md`;
}
function buildFlatTaskFileName(sliceId, taskId, suffix) {
  const redundantPrefix = `${sliceId}-`;
  const bareTaskId = taskId.toUpperCase().startsWith(redundantPrefix.toUpperCase()) ? taskId.slice(redundantPrefix.length) : taskId;
  return `${sliceId}-${bareTaskId}-${suffix}.md`;
}
function taskIdFromTaskFileName(fileName, suffix) {
  const flat = new RegExp(`^S\\d+-(T\\d+)-${suffix}\\.md$`, "i").exec(fileName);
  if (flat?.[1]) return flat[1].toUpperCase();
  const legacy = new RegExp(`^(T\\d+)(?:-.*)?-${suffix}\\.md$`, "i").exec(fileName);
  return legacy?.[1]?.toUpperCase() ?? null;
}
function resolveDir(parentDir, idPrefix) {
  if (!existsSync2(parentDir)) return null;
  try {
    const entries = cachedReaddirWithTypes(parentDir);
    const exact = entries.find((e) => e.isDirectory() && e.name === idPrefix);
    if (exact) return exact.name;
    const idLower = idPrefix.toLowerCase();
    const exactCaseInsensitive = entries.find(
      (e) => e.isDirectory() && e.name.toLowerCase() === idLower
    );
    if (exactCaseInsensitive) return exactCaseInsensitive.name;
    const prefixed = entries.find(
      (e) => e.isDirectory() && e.name.toLowerCase().startsWith(idLower + "-")
    );
    return prefixed ? prefixed.name : null;
  } catch {
    return null;
  }
}
function resolveFile(dir, idPrefix, suffix) {
  if (!existsSync2(dir)) return null;
  const target = `${idPrefix}-${suffix}.md`.toUpperCase();
  try {
    const entries = cachedReaddirWithTypes(dir).filter((e) => e.isFile()).map((e) => e.name);
    const direct = entries.find((e) => e.toUpperCase() === target);
    if (direct) return direct;
    const pattern = new RegExp(
      `^${idPrefix}-.*-${suffix}\\.md$`,
      "i"
    );
    const match = entries.find((e) => pattern.test(e));
    if (match) return match;
    const legacy = entries.find((e) => e.toLowerCase() === `${suffix.toLowerCase()}.md`);
    if (legacy) return legacy;
    return null;
  } catch {
    return null;
  }
}
function resolveTaskFiles(tasksDir, suffix) {
  if (!existsSync2(tasksDir)) return [];
  try {
    return cachedReaddirWithTypes(tasksDir).filter((e) => e.isFile()).map((e) => e.name).filter((f) => taskIdFromTaskFileName(f, suffix) !== null).sort();
  } catch {
    return [];
  }
}
function resolveTaskJsonFiles(tasksDir, suffix) {
  if (!existsSync2(tasksDir)) return [];
  try {
    const currentPattern = new RegExp(`^T\\d+-${suffix}\\.json$`, "i");
    const legacyPattern = new RegExp(`^T\\d+-.*-${suffix}\\.json$`, "i");
    return cachedReaddir(tasksDir).filter((f) => currentPattern.test(f) || legacyPattern.test(f)).sort();
  } catch {
    return [];
  }
}
var GSD_ROOT_FILES = {
  PROJECT: "PROJECT.md",
  DECISIONS: "DECISIONS.md",
  QUEUE: "QUEUE.md",
  STATE: "STATE.md",
  REQUIREMENTS: "REQUIREMENTS.md",
  OVERRIDES: "OVERRIDES.md",
  KNOWLEDGE: "KNOWLEDGE.md",
  CODEBASE: "CODEBASE.md"
};
var LEGACY_GSD_ROOT_FILES = {
  PROJECT: "project.md",
  DECISIONS: "decisions.md",
  QUEUE: "queue.md",
  STATE: "state.md",
  REQUIREMENTS: "requirements.md",
  OVERRIDES: "overrides.md",
  KNOWLEDGE: "knowledge.md",
  CODEBASE: "codebase.md"
};
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
function _clearGsdRootCache() {
  gsdRootCache.clear();
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
function legacyMilestonesHasSubdirs(basePath) {
  const legacy = join3(gsdProjectionRoot(basePath), "milestones");
  if (!existsSync2(legacy)) return false;
  try {
    return readdirSync(legacy).some((e) => statSync2(join3(legacy, e)).isDirectory() && dirIsContentBearingLegacyMilestone(join3(legacy, e)));
  } catch {
    return false;
  }
}
var LEGACY_MILESTONE_RUNTIME_DIRS = /* @__PURE__ */ new Set(["anchors"]);
function dirIsContentBearingLegacyMilestone(dir) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && !e.name.endsWith("-META.json"))) return true;
    return entries.some((e) => {
      if (!e.isDirectory()) return false;
      if (LEGACY_MILESTONE_RUNTIME_DIRS.has(e.name)) return false;
      try {
        return readdirSync(join3(dir, e.name)).length > 0;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
function dirIsMetaOnlyLegacyMilestone(dir) {
  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) return false;
    return entries.every((name) => name.endsWith("-META.json"));
  } catch {
    return false;
  }
}
function isLegacyMilestonesLayout(basePath) {
  return legacyMilestonesHasSubdirs(basePath);
}
function milestonesDir(basePath) {
  const root = gsdProjectionRoot(basePath);
  if (legacyMilestonesHasSubdirs(basePath)) {
    return join3(root, "milestones");
  }
  return join3(root, LAYOUT_SEGMENTS.level1);
}
function legacyMilestonesDir(basePath) {
  return join3(gsdProjectionRoot(basePath), "milestones");
}
function pickPreferredPhaseDir(phasesDir, matches) {
  if (matches.length === 1) return matches[0];
  let best = matches[0];
  let bestMtime = -1;
  for (const name of matches) {
    try {
      const mtime = statSync2(join3(phasesDir, name)).mtimeMs;
      if (mtime > bestMtime) {
        bestMtime = mtime;
        best = name;
      }
    } catch {
    }
  }
  return best;
}
function slugLooksLikeTeamSuffixProjection(slugPart) {
  return /^[a-z0-9]{6}(-|$)/.test(slugPart);
}
function phaseDirMatchesMilestoneId(dirName, milestoneId, phaseNum, allowTeamSuffixSlugs = false) {
  const numMatch = dirName.match(/^(\d+)-(.*)$/);
  if (!numMatch || parseInt(numMatch[1], 10) !== phaseNum) return false;
  const slugPart = numMatch[2];
  const suffix = milestoneIdUniqueSuffix(milestoneId);
  if (suffix) {
    return slugPart === suffix || slugPart.startsWith(`${suffix}-`);
  }
  if (slugLooksLikeTeamSuffixProjection(slugPart) && !allowTeamSuffixSlugs) return false;
  return true;
}
function resolvePhaseDir(basePath, milestoneId) {
  const phasesDir = join3(gsdProjectionRoot(basePath), LAYOUT_SEGMENTS.level1);
  if (existsSync2(phasesDir)) {
    const phaseNum = milestoneIdToPhaseNum(milestoneId);
    const canonical = canonicalPhaseDirName(milestoneId);
    if (existsSync2(join3(phasesDir, canonical))) {
      return join3(phasesDir, canonical);
    }
    const matches = [];
    try {
      for (const entry of readdirSync(phasesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (phaseDirMatchesMilestoneId(entry.name, milestoneId, phaseNum)) {
          matches.push(entry.name);
        }
      }
      if (matches.length === 0 && !milestoneIdUniqueSuffix(milestoneId)) {
        for (const entry of readdirSync(phasesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (phaseDirMatchesMilestoneId(entry.name, milestoneId, phaseNum, true)) {
            matches.push(entry.name);
          }
        }
      }
    } catch {
    }
    if (matches.length > 0) {
      const preferred = matches.includes(canonical) ? canonical : pickPreferredPhaseDir(phasesDir, matches);
      return join3(phasesDir, preferred);
    }
  }
  const legacyDir = legacyMilestonesDir(basePath);
  if (existsSync2(legacyDir)) {
    const candidate = resolveDir(legacyDir, milestoneId);
    if (candidate && dirIsContentBearingLegacyMilestone(join3(legacyDir, candidate))) {
      return join3(legacyDir, candidate);
    }
  }
  return null;
}
function resolveRuntimeFile(basePath) {
  return join3(gsdRoot(basePath), "RUNTIME.md");
}
function resolveGsdRootFile(basePath, key) {
  const root = gsdRoot(basePath);
  const canonical = join3(root, GSD_ROOT_FILES[key]);
  if (existsSync2(canonical)) return canonical;
  const legacy = join3(root, LEGACY_GSD_ROOT_FILES[key]);
  if (existsSync2(legacy)) return legacy;
  return canonical;
}
function relGsdRootFile(key) {
  return `.gsd/${GSD_ROOT_FILES[key]}`;
}
function resolveMilestonePath(basePath, milestoneId) {
  const phaseDir = resolvePhaseDir(basePath, milestoneId);
  if (phaseDir) return phaseDir;
  const oldMilestonesDir = join3(gsdProjectionRoot(basePath), "milestones");
  if (existsSync2(oldMilestonesDir)) {
    const legacyDir = resolveDir(oldMilestonesDir, milestoneId);
    if (legacyDir && dirIsContentBearingLegacyMilestone(join3(oldMilestonesDir, legacyDir))) {
      return join3(oldMilestonesDir, legacyDir);
    }
  }
  return null;
}
function milestoneDirExists(basePath, milestoneId) {
  if (resolveMilestonePath(basePath, milestoneId)) return true;
  const oldMilestonesDir = join3(gsdProjectionRoot(basePath), "milestones");
  if (existsSync2(oldMilestonesDir) && resolveDir(oldMilestonesDir, milestoneId)) {
    return true;
  }
  return false;
}
function resolveMilestoneFile(basePath, milestoneId, suffix) {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  if (!mDir) return null;
  const phaseNum = milestoneIdToPhaseNum(milestoneId);
  const prefix = `${String(phaseNum).padStart(2, "0")}`;
  const flatName = `${prefix}-${suffix}.md`;
  const flatPath = join3(mDir, flatName);
  if (isExistingFile(flatPath)) return flatPath;
  const file = resolveFile(mDir, milestoneId, suffix);
  return file ? join3(mDir, file) : null;
}
function resolveSlicePath(basePath, milestoneId, sliceId) {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  if (!mDir) return null;
  const slicesDir = join3(mDir, "slices");
  const dir = resolveDir(slicesDir, sliceId);
  if (dir) return join3(slicesDir, dir);
  return mDir;
}
function resolveSliceFile(basePath, milestoneId, sliceId, suffix) {
  const phaseDir = resolveMilestonePath(basePath, milestoneId);
  if (!phaseDir) return null;
  const phaseNum = milestoneIdToPhaseNum(milestoneId);
  const planSegment = slicePlanSegment(sliceId);
  const flatName = slicePlanFileName(phaseNum, sliceId, suffix);
  const flatPath = join3(phaseDir, flatName);
  if (isExistingFile(flatPath)) return flatPath;
  const planOnlyName = `${planSegment}-${suffix}.md`;
  const planOnlyPath = join3(phaseDir, planOnlyName);
  if (isExistingFile(planOnlyPath)) return planOnlyPath;
  const planPrefix = `${String(phaseNum).padStart(2, "0")}-${planSegment}-`;
  try {
    for (const entry of readdirSync(phaseDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith(planPrefix) && entry.name.endsWith(`-${suffix}.md`)) {
        return join3(phaseDir, entry.name);
      }
    }
  } catch {
  }
  const sDir = resolveSlicePath(basePath, milestoneId, sliceId);
  if (sDir && sDir !== phaseDir) {
    const file = resolveFile(sDir, sliceId, suffix);
    if (file) return join3(sDir, file);
  }
  return null;
}
function resolveTasksDir(basePath, milestoneId, sliceId) {
  const sDir = resolveSlicePath(basePath, milestoneId, sliceId);
  if (!sDir) return null;
  const tDir = join3(sDir, "tasks");
  return existsSync2(tDir) ? tDir : null;
}
function resolveTaskFile(basePath, milestoneId, sliceId, taskId, suffix) {
  const phaseDir = resolveMilestonePath(basePath, milestoneId);
  if (!phaseDir) return null;
  const legacyBase = legacyMilestonesDir(basePath);
  const isLegacy = phaseDir.startsWith(legacyBase + "/") || phaseDir.startsWith(legacyBase + "\\");
  if (suffix !== "PLAN" && !isLegacy) {
    const flatPath = join3(phaseDir, buildFlatTaskFileName(sliceId, taskId, suffix));
    if (isExistingFile(flatPath)) return flatPath;
    const legacyFlatPath = join3(phaseDir, buildTaskFileName(taskId, suffix));
    return isExistingFile(legacyFlatPath) ? legacyFlatPath : null;
  }
  const tDir = resolveTasksDir(basePath, milestoneId, sliceId);
  if (tDir) {
    const file = resolveFile(tDir, taskId, suffix);
    if (file) return join3(tDir, file);
  }
  return null;
}
function relMilestonePath(basePath, milestoneId, title) {
  const phaseDir = resolvePhaseDir(basePath, milestoneId);
  if (phaseDir) {
    const name = phaseDir.split(/[/\\]/).pop();
    const legacyBase = legacyMilestonesDir(basePath);
    if (phaseDir.startsWith(legacyBase + "/") || phaseDir.startsWith(legacyBase + "\\")) {
      return `.gsd/milestones/${name}`;
    }
    return `.gsd/${LAYOUT_SEGMENTS.level1}/${name}`;
  }
  return `.gsd/${LAYOUT_SEGMENTS.level1}/${canonicalPhaseDirName(milestoneId, title)}`;
}
function targetMilestoneFile(basePath, milestoneId, suffix, title) {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  const legacyBase = legacyMilestonesDir(basePath);
  const isLegacy = mDir ? mDir.startsWith(legacyBase + "/") || mDir.startsWith(legacyBase + "\\") : isLegacyMilestonesLayout(basePath);
  const dir = mDir ?? join3(
    isLegacy ? legacyBase : milestonesDir(basePath),
    isLegacy ? milestoneId : canonicalPhaseDirName(milestoneId, title)
  );
  const fileName = isLegacy ? `${milestoneId}-${suffix}.md` : `${String(milestoneIdToPhaseNum(milestoneId)).padStart(2, "0")}-${suffix}.md`;
  return join3(dir, fileName);
}
function relMilestoneFile(basePath, milestoneId, suffix, title) {
  const rel = relative(
    gsdProjectionRoot(basePath),
    resolveMilestoneFile(basePath, milestoneId, suffix) ?? targetMilestoneFile(basePath, milestoneId, suffix, title)
  ).replace(/\\/g, "/");
  return `.gsd/${rel}`;
}
function relSlicePath(basePath, milestoneId, sliceId, milestoneTitle) {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  if (mDir) {
    const legacyBase = legacyMilestonesDir(basePath);
    if (mDir.startsWith(legacyBase + "/") || mDir.startsWith(legacyBase + "\\")) {
      const mRel = relMilestonePath(basePath, milestoneId);
      const slicesDir = join3(mDir, "slices");
      const dir = resolveDir(slicesDir, sliceId);
      return `${mRel}/slices/${dir ?? sliceId}`;
    }
  }
  return relMilestonePath(basePath, milestoneId, milestoneTitle);
}
function targetSliceFile(basePath, milestoneId, sliceId, suffix, milestoneTitle) {
  const mDir = resolveMilestonePath(basePath, milestoneId);
  const legacyBase = legacyMilestonesDir(basePath);
  const isLegacy = mDir ? mDir.startsWith(legacyBase + "/") || mDir.startsWith(legacyBase + "\\") : isLegacyMilestonesLayout(basePath);
  const milestoneDir = mDir ?? dirname(targetMilestoneFile(basePath, milestoneId, "ROADMAP", milestoneTitle));
  const slicesDir = join3(milestoneDir, "slices");
  const dir = isLegacy ? join3(slicesDir, resolveDir(slicesDir, sliceId) ?? sliceId) : milestoneDir;
  const fileName = isLegacy ? `${sliceId}-${suffix}.md` : slicePlanFileName(milestoneIdToPhaseNum(milestoneId), sliceId, suffix);
  return join3(dir, fileName);
}
function targetTaskFile(basePath, milestoneId, sliceId, taskId, suffix, milestoneTitle) {
  if (suffix === "PLAN") {
    return targetSliceFile(basePath, milestoneId, sliceId, "PLAN", milestoneTitle);
  }
  const mDir = resolveMilestonePath(basePath, milestoneId);
  const legacyBase = legacyMilestonesDir(basePath);
  const isLegacy = mDir ? mDir.startsWith(legacyBase + "/") || mDir.startsWith(legacyBase + "\\") : isLegacyMilestonesLayout(basePath);
  const milestoneDir = mDir ?? dirname(targetMilestoneFile(basePath, milestoneId, "ROADMAP", milestoneTitle));
  if (isLegacy) {
    const slicesDir = join3(milestoneDir, "slices");
    const sliceDir = join3(slicesDir, resolveDir(slicesDir, sliceId) ?? sliceId);
    return join3(sliceDir, "tasks", buildTaskFileName(taskId, suffix));
  }
  return join3(milestoneDir, buildFlatTaskFileName(sliceId, taskId, suffix));
}
function relSliceFile(basePath, milestoneId, sliceId, suffix, milestoneTitle) {
  const rel = relative(
    gsdProjectionRoot(basePath),
    resolveSliceFile(basePath, milestoneId, sliceId, suffix) ?? targetSliceFile(basePath, milestoneId, sliceId, suffix, milestoneTitle)
  ).replace(/\\/g, "/");
  return `.gsd/${rel}`;
}
function relTaskFile(basePath, milestoneId, sliceId, taskId, suffix, milestoneTitle) {
  const sDir = resolveSlicePath(basePath, milestoneId, sliceId);
  const phaseDir = resolveMilestonePath(basePath, milestoneId);
  if (sDir && phaseDir && sDir !== phaseDir) {
    const relS2 = relSlicePath(basePath, milestoneId, sliceId);
    return `${relS2}/tasks/${taskId}-${suffix}.md`;
  }
  if (suffix === "PLAN") {
    return relSliceFile(basePath, milestoneId, sliceId, "PLAN");
  }
  const relS = relSlicePath(basePath, milestoneId, sliceId, milestoneTitle);
  return `${relS}/${buildFlatTaskFileName(sliceId, taskId, suffix)}`;
}
export {
  FRAMEWORK_METADATA_DIRS,
  GSD_ROOT_FILES,
  MIGRATION_STAGING_DIR_PREFIX,
  PLANNING_ARTIFACT_NAME_RE,
  PLANNING_ARTIFACT_SUFFIXES,
  _clearGsdRootCache,
  buildFlatTaskFileName,
  buildMilestoneFileName,
  buildSliceFileName,
  buildTaskFileName,
  canonicalPhaseDirName,
  clearPathCache,
  dirIsContentBearingLegacyMilestone,
  dirIsMetaOnlyLegacyMilestone,
  gsdProjectionRoot,
  gsdRoot,
  isLegacyMilestonesLayout,
  legacyMilestonesDir,
  milestoneDirExists,
  milestonesDir,
  normalizeRealPath,
  phaseDirMatchesMilestoneId,
  relGsdRootFile,
  relMilestoneFile,
  relMilestonePath,
  relSliceFile,
  relSlicePath,
  relTaskFile,
  resolveDir,
  resolveFile,
  resolveGsdPathContract,
  resolveGsdRootFile,
  resolveMilestoneFile,
  resolveMilestonePath,
  resolveRuntimeFile,
  resolveSliceFile,
  resolveSlicePath,
  resolveTaskFile,
  resolveTaskFiles,
  resolveTaskJsonFiles,
  resolveTasksDir,
  targetMilestoneFile,
  targetSliceFile,
  targetTaskFile,
  taskIdFromTaskFileName
};
