#!/usr/bin/env node
// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = import.meta.require;

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/scanner.js
import { readdir, readFile, writeFile, stat } from "fs/promises";
import { join, relative, basename, extname } from "path";
async function readCodesightIgnore(root) {
  try {
    const content = await readFile(join(root, ".codesightignore"), "utf-8");
    return content.split(`
`).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}
async function collectFiles(root, maxDepth = 10, ignorePatterns = []) {
  const files = [];
  const positivePatterns = [];
  const negationPatterns = [];
  for (const raw of ignorePatterns) {
    if (raw.startsWith("!")) {
      negationPatterns.push(raw.slice(1));
    } else {
      positivePatterns.push(raw);
    }
  }
  const normalize = (p) => p.replace(/\/\*\*?$/, "").replace(/^\//, "");
  const extraIgnore = new Set(positivePatterns.map(normalize));
  const negationNames = new Set(negationPatterns.map(normalize));
  function isExplicitlyIncluded(name, fullPath) {
    if (negationNames.has(name))
      return true;
    const rel = fullPath.replace(root, "").replace(/^[/\\]/, "");
    for (const pattern of negationPatterns) {
      const clean = normalize(pattern);
      if (rel === clean)
        return true;
      if (pattern.endsWith("/**") || pattern.endsWith("/*")) {
        if (rel.startsWith(clean + "/") || rel.startsWith(clean + "\\"))
          return true;
      }
    }
    return false;
  }
  function shouldIgnoreDir(name, fullPath) {
    if (isExplicitlyIncluded(name, fullPath))
      return false;
    if (IGNORE_DIRS.has(name))
      return true;
    if (extraIgnore.has(name))
      return true;
    const rel = fullPath.replace(root, "").replace(/^[/\\]/, "");
    for (const pattern of positivePatterns) {
      const clean = normalize(pattern);
      if (rel === clean || rel.startsWith(clean + "/") || rel.startsWith(clean + "\\"))
        return true;
    }
    return false;
  }
  async function walk(dir, depth) {
    if (depth > maxDepth)
      return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.name.startsWith(".") && entry.name !== ".env" && entry.name !== ".env.example" && entry.name !== ".env.local" && !isExplicitlyIncluded(entry.name, fullPath))
        continue;
      if (entry.isDirectory()) {
        if (shouldIgnoreDir(entry.name, fullPath))
          continue;
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (CODE_EXTENSIONS.has(ext) || entry.name === ".env" || entry.name === ".env.example" || entry.name === ".env.local" || entry.name === "manifest") {
          files.push(fullPath);
        }
      }
    }
  }
  await walk(root, 0);
  return files;
}
async function readFileSafe(path) {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}
async function detectProject(root) {
  const pkgPath = join(root, "package.json");
  let pkg = {};
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  } catch {}
  const name = pkg.name || await resolveRepoName(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasPnpmWorkspace = await fileExists(join(root, "pnpm-workspace.yaml"));
  let isMonorepo = !!(pkg.workspaces || hasPnpmWorkspace);
  const workspaces = [];
  if (isMonorepo) {
    const wsPatterns = await getWorkspacePatterns(root, pkg);
    for (const pattern of wsPatterns) {
      if (pattern.includes("*")) {
        const wsRoot = join(root, pattern.replace("/*", ""));
        try {
          const wsDirs = await readdir(wsRoot, { withFileTypes: true });
          for (const d of wsDirs) {
            if (!d.isDirectory() || d.name.startsWith("."))
              continue;
            const wsPath = join(wsRoot, d.name);
            const wsInfo = await detectWorkspace(root, wsPath, d.name);
            if (wsInfo)
              workspaces.push(wsInfo);
          }
        } catch {}
      } else {
        const wsPath = join(root, pattern);
        try {
          const wsInfo = await detectWorkspace(root, wsPath, basename(pattern));
          if (wsInfo)
            workspaces.push(wsInfo);
        } catch {}
      }
    }
  }
  await discoverImplicitWorkspaces(root, workspaces);
  if (!isMonorepo && workspaces.length >= 2)
    isMonorepo = true;
  const repoType = await classifyRepoType(root, workspaces, isMonorepo);
  let allDeps = { ...deps };
  for (const ws of workspaces) {
    const wsPkg = await readJsonSafe(join(root, ws.path, "package.json"));
    Object.assign(allDeps, wsPkg.dependencies, wsPkg.devDependencies);
  }
  let language = await detectLanguage(root, allDeps);
  let frameworks = await detectFrameworks(root, pkg);
  let orms = await detectORMs(root, pkg);
  for (const ws of workspaces) {
    for (const fw of ws.frameworks) {
      if (!frameworks.includes(fw))
        frameworks.push(fw);
    }
    for (const orm of ws.orms) {
      if (!orms.includes(orm))
        orms.push(orm);
    }
  }
  if (frameworks.length > 1 && frameworks.includes("raw-http")) {
    frameworks = frameworks.filter((fw) => fw !== "raw-http");
  }
  if (workspaces.length >= 2) {
    const FW_LANG = {
      vapor: "swift",
      swiftui: "swift",
      flutter: "dart",
      django: "python",
      flask: "python",
      fastapi: "python",
      celery: "python",
      rails: "ruby",
      phoenix: "elixir",
      spring: "java",
      ktor: "kotlin",
      laravel: "php",
      php: "php",
      actix: "rust",
      axum: "rust",
      aspnet: "csharp",
      gin: "go",
      fiber: "go",
      echo: "go",
      chi: "go",
      "go-net-http": "go",
      "roku-scenegraph": "brightscript"
    };
    const wsLangs = new Set;
    if (language === "typescript" || language === "javascript" || allDeps["react"] || allDeps["typescript"]) {
      wsLangs.add(allDeps["typescript"] || deps["typescript"] ? "typescript" : "javascript");
    }
    for (const fw of frameworks) {
      const l = FW_LANG[fw];
      if (l)
        wsLangs.add(l);
    }
    if (wsLangs.size > 1) {
      if (language !== "mixed" && language !== "javascript" && wsLangs.has(language)) {} else {
        language = "mixed";
      }
    } else if (wsLangs.size === 1) {
      language = wsLangs.values().next().value;
    }
  }
  const jsOnlyFrameworks = new Set([
    "next-app",
    "next-pages",
    "hono",
    "express",
    "fastify",
    "koa",
    "nestjs",
    "elysia",
    "adonis",
    "trpc",
    "sveltekit",
    "remix",
    "nuxt",
    "raw-http",
    "angular"
  ]);
  const nonJSLangs = new Set(["go", "python", "ruby", "elixir", "java", "kotlin", "rust", "php", "dart", "swift", "csharp", "brightscript"]);
  if (nonJSLangs.has(language) && frameworks.some((f) => !jsOnlyFrameworks.has(f))) {
    frameworks = frameworks.filter((f) => !jsOnlyFrameworks.has(f));
  }
  return {
    root,
    name,
    frameworks,
    orms,
    componentFramework: detectComponentFramework(allDeps, frameworks),
    isMonorepo,
    repoType,
    workspaces,
    language
  };
}
async function discoverImplicitWorkspaces(repoRoot, workspaces) {
  try {
    const rokuMono = await detectRokuMonorepo(repoRoot);
    if (rokuMono) {
      const dirs = [rokuMono.commonDir, ...rokuMono.channelDirs];
      for (const dir of dirs) {
        const wsInfo = await detectNonJSWorkspace(repoRoot, dir, basename(dir));
        if (wsInfo && !workspaces.some((w) => w.path === wsInfo.path)) {
          workspaces.push(wsInfo);
        }
      }
    }
  } catch {}
  try {
    const topDirs = await readdir(repoRoot, { withFileTypes: true });
    for (const d of topDirs) {
      if (!d.isDirectory() || d.name.startsWith(".") || IGNORE_DIRS.has(d.name))
        continue;
      const wsPath = join(repoRoot, d.name);
      if (await hasDirectWorkspaceManifest(wsPath)) {
        const wsInfo = await detectWorkspace(repoRoot, wsPath, d.name);
        if (wsInfo && !workspaces.some((w) => w.path === wsInfo.path)) {
          workspaces.push(wsInfo);
        }
      }
      try {
        const nestedDirs = await readdir(wsPath, { withFileTypes: true });
        for (const n of nestedDirs) {
          if (!n.isDirectory() || n.name.startsWith(".") || IGNORE_DIRS.has(n.name))
            continue;
          const nestedPath = join(wsPath, n.name);
          if (!await hasDirectWorkspaceManifest(nestedPath))
            continue;
          const nestedInfo = await detectWorkspace(repoRoot, nestedPath, n.name);
          if (nestedInfo && !workspaces.some((w) => w.path === nestedInfo.path)) {
            workspaces.push(nestedInfo);
          }
        }
      } catch {}
    }
  } catch {}
}
async function classifyRepoType(root, workspaces, isMonorepo) {
  if (await fileExists(join(root, ".gitmodules")))
    return "meta";
  if (!isMonorepo || workspaces.length <= 1)
    return "single";
  const infraDirs = ["k8s", "kubernetes", "helm"];
  for (const dir of infraDirs) {
    if (await fileExists(join(root, dir)))
      return "microservices";
  }
  let dockerfileCount = 0;
  for (const ws of workspaces) {
    if (await fileExists(join(root, ws.path, "Dockerfile"))) {
      dockerfileCount++;
      if (dockerfileCount >= 2)
        return "microservices";
    }
  }
  return "monorepo";
}
async function hasDirectWorkspaceManifest(dir) {
  const directManifestNames = [
    "package.json",
    "composer.json",
    "pubspec.yaml",
    "Package.swift",
    "requirements.txt",
    "Pipfile",
    "pyproject.toml",
    "mix.exs",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Gemfile"
  ];
  for (const manifest of directManifestNames) {
    if (await fileExists(join(dir, manifest)))
      return true;
  }
  if (await hasRokuManifest(dir))
    return true;
  try {
    const entries = await readdir(dir);
    return entries.some((entry) => entry.endsWith(".xcodeproj") || entry.endsWith(".xcworkspace") || entry.endsWith(".csproj"));
  } catch {
    return false;
  }
}
async function detectFrameworks(root, pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  let frameworks = [];
  if (deps["next"]) {
    const hasAppDir = await fileExists(join(root, "app")) || await fileExists(join(root, "src/app"));
    const hasPagesDir = await fileExists(join(root, "pages")) || await fileExists(join(root, "src/pages"));
    if (hasAppDir)
      frameworks.push("next-app");
    if (hasPagesDir)
      frameworks.push("next-pages");
    if (!hasAppDir && !hasPagesDir)
      frameworks.push("next-app");
  }
  if (deps["hono"])
    frameworks.push("hono");
  if (deps["express"])
    frameworks.push("express");
  if (deps["fastify"])
    frameworks.push("fastify");
  if (deps["koa"])
    frameworks.push("koa");
  if (deps["@nestjs/core"] || deps["@nestjs/common"])
    frameworks.push("nestjs");
  if (deps["elysia"])
    frameworks.push("elysia");
  if (deps["@adonisjs/core"])
    frameworks.push("adonis");
  if (deps["@trpc/server"])
    frameworks.push("trpc");
  if (deps["@angular/core"])
    frameworks.push("angular");
  if (deps["@sveltejs/kit"])
    frameworks.push("sveltekit");
  if (deps["@remix-run/node"] || deps["@remix-run/react"])
    frameworks.push("remix");
  if (deps["nuxt"])
    frameworks.push("nuxt");
  const pyDeps = await getPythonDeps(root);
  if (pyDeps.includes("flask"))
    frameworks.push("flask");
  if (pyDeps.includes("fastapi"))
    frameworks.push("fastapi");
  if (pyDeps.includes("django"))
    frameworks.push("django");
  if (pyDeps.includes("celery"))
    frameworks.push("celery");
  const goDeps = await getGoDeps(root);
  const goFwCandidates = [
    { dep: "gin-gonic/gin", importStr: `"github.com/gin-gonic/gin"`, fw: "gin" },
    { dep: "gofiber/fiber", importStr: `"github.com/gofiber/fiber`, fw: "fiber" },
    { dep: "labstack/echo", importStr: `"github.com/labstack/echo`, fw: "echo" },
    { dep: "go-chi/chi", importStr: `"github.com/go-chi/chi`, fw: "chi" }
  ];
  for (const candidate of goFwCandidates) {
    if (!goDeps.some((d) => d.includes(candidate.dep)))
      continue;
    if (await goImportUsed(root, candidate.importStr)) {
      frameworks.push(candidate.fw);
    }
  }
  if (goDeps.some((d) => d.includes("net/http")))
    frameworks.push("go-net-http");
  const hasGemfile = await fileExists(join(root, "Gemfile"));
  if (hasGemfile) {
    try {
      const gemfile = await readFile(join(root, "Gemfile"), "utf-8");
      if (gemfile.includes("rails"))
        frameworks.push("rails");
    } catch {}
  }
  const hasMixFile = await fileExists(join(root, "mix.exs"));
  if (hasMixFile) {
    try {
      const mix = await readFile(join(root, "mix.exs"), "utf-8");
      if (mix.includes("phoenix"))
        frameworks.push("phoenix");
    } catch {}
  }
  const hasPomXml = await fileExists(join(root, "pom.xml"));
  const hasBuildGradle = await fileExists(join(root, "build.gradle")) || await fileExists(join(root, "build.gradle.kts"));
  if (hasPomXml || hasBuildGradle) {
    try {
      const buildFile = hasPomXml ? await readFile(join(root, "pom.xml"), "utf-8") : await readFile(join(root, hasBuildGradle ? "build.gradle.kts" : "build.gradle"), "utf-8");
      if (buildFile.includes("spring"))
        frameworks.push("spring");
      if (buildFile.includes("ktor"))
        frameworks.push("ktor");
    } catch {}
  }
  const hasCargoToml = await fileExists(join(root, "Cargo.toml"));
  if (hasCargoToml) {
    try {
      const cargo = await readFile(join(root, "Cargo.toml"), "utf-8");
      if (cargo.includes("actix-web"))
        frameworks.push("actix");
      else if (cargo.includes("axum"))
        frameworks.push("axum");
    } catch {}
  }
  const hasComposerJson = await fileExists(join(root, "composer.json"));
  if (hasComposerJson) {
    try {
      const composer = await readFile(join(root, "composer.json"), "utf-8");
      if (composer.includes("laravel/framework")) {
        frameworks.push("laravel");
      } else {
        frameworks.push("php");
      }
    } catch {
      frameworks.push("php");
    }
  } else {
    try {
      const hasPhpFiles = (await readdir(root)).some((e) => e.endsWith(".php"));
      if (hasPhpFiles)
        frameworks.push("php");
    } catch {}
  }
  const allCsproj = await findAllCsproj(root);
  for (const csprojPath of allCsproj) {
    try {
      const content = await readFile(csprojPath, "utf-8");
      if (content.includes("Microsoft.AspNetCore")) {
        frameworks.push("aspnet");
        break;
      }
    } catch {}
  }
  if (!frameworks.includes("aspnet") && allCsproj.length > 0) {
    try {
      const entries = await readdir(root);
      if (entries.some((e) => e.endsWith(".sln")))
        frameworks.push("aspnet");
    } catch {}
  }
  const hasPubspec = await fileExists(join(root, "pubspec.yaml"));
  if (hasPubspec) {
    try {
      const pubspec = await readFile(join(root, "pubspec.yaml"), "utf-8");
      if (pubspec.includes("flutter:") || pubspec.includes("flutter_")) {
        frameworks.push("flutter");
      }
    } catch {}
  }
  const hasPackageSwift = await fileExists(join(root, "Package.swift"));
  if (hasPackageSwift) {
    try {
      const pkg2 = await readFile(join(root, "Package.swift"), "utf-8");
      if (pkg2.includes("vapor/vapor") || pkg2.includes('"vapor"')) {
        frameworks.push("vapor");
      } else {
        frameworks.push("swiftui");
      }
    } catch {
      frameworks.push("swiftui");
    }
  } else {
    try {
      const entries = await readdir(root);
      if (entries.some((e) => e.endsWith(".xcodeproj") || e.endsWith(".xcworkspace"))) {
        frameworks.push("swiftui");
      }
    } catch {}
  }
  if (await hasRokuManifest(root) || await detectBrighterScriptTemplateRoot(root) || deps["brighterscript"]) {
    frameworks.push("roku-scenegraph");
  }
  const hasAndroidManifest = await fileExists(join(root, "app", "src", "main", "AndroidManifest.xml")) || await fileExists(join(root, "src", "main", "AndroidManifest.xml")) || await fileExists(join(root, "AndroidManifest.xml"));
  if (hasAndroidManifest) {
    frameworks.push("android");
  } else if (hasBuildGradle) {
    for (const gp of ["build.gradle.kts", "build.gradle", "app/build.gradle.kts", "app/build.gradle"]) {
      try {
        const gc = await readFile(join(root, gp), "utf-8");
        if (/com\.android\.(?:application|library)/.test(gc)) {
          frameworks.push("android");
          break;
        }
      } catch {}
    }
  }
  if (frameworks.length === 0) {
    frameworks.push("raw-http");
  }
  const specificGoFrameworks = new Set(["gin", "fiber", "echo", "chi"]);
  if (frameworks.some((f) => specificGoFrameworks.has(f))) {
    frameworks = frameworks.filter((f) => f !== "go-net-http");
  }
  return frameworks;
}
async function detectORMs(root, pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const orms = [];
  if (deps["drizzle-orm"])
    orms.push("drizzle");
  if (deps["prisma"] || deps["@prisma/client"])
    orms.push("prisma");
  if (deps["typeorm"])
    orms.push("typeorm");
  if (deps["mongoose"])
    orms.push("mongoose");
  if (deps["sequelize"])
    orms.push("sequelize");
  const pyDeps = await getPythonDeps(root);
  if (pyDeps.includes("sqlalchemy") || pyDeps.includes("sqlmodel"))
    orms.push("sqlalchemy");
  if (pyDeps.includes("django"))
    orms.push("django");
  const goDeps = await getGoDeps(root);
  if (goDeps.some((d) => d.includes("gorm")))
    orms.push("gorm");
  if (goDeps.some((d) => d.includes("entgo.io/ent")))
    orms.push("ent");
  const hasGemfile = await fileExists(join(root, "Gemfile"));
  if (hasGemfile) {
    try {
      const gemfile = await readFile(join(root, "Gemfile"), "utf-8");
      if (gemfile.includes("activerecord") || gemfile.includes("rails"))
        orms.push("activerecord");
    } catch {}
  }
  const hasMixFile = await fileExists(join(root, "mix.exs"));
  if (hasMixFile) {
    try {
      const mix = await readFile(join(root, "mix.exs"), "utf-8");
      if (mix.includes("ecto"))
        orms.push("ecto");
    } catch {}
  }
  const composerPath = join(root, "composer.json");
  if (await fileExists(composerPath)) {
    try {
      const composer = await readFile(composerPath, "utf-8");
      if (composer.includes("laravel/framework"))
        orms.push("eloquent");
    } catch {}
  }
  const hasBuildGradleKts = await fileExists(join(root, "build.gradle.kts"));
  const hasBuildGradleKotlin = hasBuildGradleKts || await fileExists(join(root, "build.gradle"));
  if (hasBuildGradleKotlin) {
    try {
      const gradleFile = hasBuildGradleKts ? await readFile(join(root, "build.gradle.kts"), "utf-8") : await readFile(join(root, "build.gradle"), "utf-8");
      if (gradleFile.includes("exposed"))
        orms.push("exposed");
    } catch {}
  }
  const androidDeps = await getAndroidDeps(root);
  if (androidDeps.some((d) => d.includes("androidx.room")))
    orms.push("room");
  if (await hasRokuManifest(root) || await detectBrighterScriptTemplateRoot(root)) {
    orms.push("scenegraph");
  }
  const allCsprojForOrm = await findAllCsproj(root);
  for (const cp of allCsprojForOrm) {
    try {
      const content = await readFile(cp, "utf-8");
      if (content.includes("EntityFramework") || content.includes("Microsoft.EntityFrameworkCore")) {
        orms.push("entity-framework");
        break;
      }
    } catch {}
  }
  return orms;
}
function detectComponentFramework(deps, frameworks = []) {
  if (deps["react"] || deps["react-dom"])
    return "react";
  if (deps["vue"])
    return "vue";
  if (deps["svelte"])
    return "svelte";
  if (frameworks.includes("flutter"))
    return "flutter";
  if (frameworks.includes("android"))
    return "jetpack-compose";
  if (frameworks.includes("angular"))
    return "angular";
  if (frameworks.includes("roku-scenegraph"))
    return "scenegraph";
  return "unknown";
}
async function detectLanguage(root, deps) {
  const hasTsConfig = await fileExists(join(root, "tsconfig.json"));
  const hasPyProject = await fileExists(join(root, "pyproject.toml")) || await fileExists(join(root, "backend/pyproject.toml"));
  const hasGoMod = await fileExists(join(root, "go.mod"));
  const hasRequirements = await fileExists(join(root, "requirements.txt")) || await fileExists(join(root, "backend/requirements.txt"));
  const hasGemfile = await fileExists(join(root, "Gemfile"));
  const hasMixExs = await fileExists(join(root, "mix.exs"));
  const hasPomXml = await fileExists(join(root, "pom.xml"));
  const hasBuildGradleKts = await fileExists(join(root, "build.gradle.kts"));
  const hasBuildGradle = hasBuildGradleKts || await fileExists(join(root, "build.gradle"));
  const isKotlinProject = hasBuildGradleKts || await fileExists(join(root, "src/main/kotlin")) || await (async () => {
    try {
      const gradle = await readFile(join(root, "build.gradle"), "utf-8");
      return gradle.includes("kotlin(") || gradle.includes("org.jetbrains.kotlin");
    } catch {
      return false;
    }
  })();
  const hasCargoToml = await fileExists(join(root, "Cargo.toml"));
  const hasComposerJson = await fileExists(join(root, "composer.json"));
  const hasPubspec = await fileExists(join(root, "pubspec.yaml"));
  const hasPackageSwift = await fileExists(join(root, "Package.swift"));
  const hasCsproj = await (async () => {
    try {
      return (await readdir(root)).some((e) => e.endsWith(".csproj") || e.endsWith(".sln"));
    } catch {
      return false;
    }
  })();
  const hasRokuChannel = await hasRokuManifest(root) || await detectBrighterScriptTemplateRoot(root) || !!deps["brighterscript"];
  const langs = [];
  if (hasTsConfig || deps["typescript"])
    langs.push("typescript");
  if (hasPyProject || hasRequirements)
    langs.push("python");
  if (hasGoMod)
    langs.push("go");
  if (hasGemfile)
    langs.push("ruby");
  if (hasMixExs)
    langs.push("elixir");
  if (hasBuildGradle && isKotlinProject)
    langs.push("kotlin");
  else if (hasBuildGradle || hasPomXml)
    langs.push("java");
  if (hasCargoToml)
    langs.push("rust");
  if (hasComposerJson)
    langs.push("php");
  if (hasPubspec)
    langs.push("dart");
  if (hasPackageSwift)
    langs.push("swift");
  if (hasCsproj)
    langs.push("csharp");
  if (hasRokuChannel)
    langs.push("brightscript");
  if (langs.length > 1) {
    const primaryManifests = [
      "go",
      "rust",
      "ruby",
      "elixir",
      "swift",
      "dart",
      "csharp",
      "java",
      "kotlin",
      "php",
      "python",
      "brightscript"
    ];
    const primary = langs.filter((l) => primaryManifests.includes(l));
    if (primary.length === 1)
      return primary[0];
    return "mixed";
  }
  if (langs.length === 1)
    return langs[0];
  try {
    const entries = await readdir(root);
    if (entries.some((e) => e.endsWith(".php")))
      return "php";
    if (entries.some((e) => e.endsWith(".swift")))
      return "swift";
    if (entries.some((e) => e.endsWith(".cs")))
      return "csharp";
    if (entries.some((e) => e.endsWith(".dart")))
      return "dart";
    if (entries.some((e) => e.endsWith(".brs") || e.endsWith(".bs")))
      return "brightscript";
  } catch {}
  return "javascript";
}
async function detectWorkspace(repoRoot, wsPath, dirName) {
  const wsPkg = await readJsonSafe(join(wsPath, "package.json"));
  if (wsPkg.name || wsPkg.dependencies || wsPkg.devDependencies) {
    return {
      name: wsPkg.name || dirName,
      path: relative(repoRoot, wsPath),
      frameworks: await detectFrameworks(wsPath, wsPkg),
      orms: await detectORMs(wsPath, wsPkg)
    };
  }
  return detectNonJSWorkspace(repoRoot, wsPath, dirName);
}
async function detectNonJSWorkspace(repoRoot, wsPath, dirName) {
  const frameworks = [];
  const orms = [];
  const composerPath = join(wsPath, "composer.json");
  if (await fileExists(composerPath)) {
    try {
      const composer = await readFile(composerPath, "utf-8");
      if (composer.includes("laravel/framework")) {
        frameworks.push("laravel");
        orms.push("eloquent");
      } else {
        frameworks.push("php");
      }
    } catch {
      frameworks.push("php");
    }
  }
  const pubspecPath = join(wsPath, "pubspec.yaml");
  if (await fileExists(pubspecPath)) {
    try {
      const pubspec = await readFile(pubspecPath, "utf-8");
      if (pubspec.includes("flutter:") || pubspec.includes("flutter_")) {
        frameworks.push("flutter");
      }
    } catch {
      frameworks.push("flutter");
    }
  }
  const packageSwiftPath = join(wsPath, "Package.swift");
  if (await fileExists(packageSwiftPath)) {
    try {
      const pkg = await readFile(packageSwiftPath, "utf-8");
      frameworks.push(pkg.includes("vapor/vapor") || pkg.includes('"vapor"') ? "vapor" : "swiftui");
    } catch {
      frameworks.push("swiftui");
    }
  } else {
    try {
      const entries = await readdir(wsPath);
      if (entries.some((e) => e.endsWith(".xcodeproj") || e.endsWith(".xcworkspace"))) {
        frameworks.push("swiftui");
      }
    } catch {}
  }
  try {
    const entries = await readdir(wsPath);
    const csproj = entries.find((e) => e.endsWith(".csproj"));
    if (csproj) {
      const content = await readFile(join(wsPath, csproj), "utf-8");
      if (content.includes("Microsoft.AspNetCore") || content.includes("web")) {
        frameworks.push("aspnet");
      }
      if (content.includes("EntityFramework") || content.includes("Microsoft.EntityFrameworkCore")) {
        orms.push("entity-framework");
      }
    }
  } catch {}
  try {
    const pyDeps = await getPythonDeps(wsPath);
    if (pyDeps.includes("fastapi"))
      frameworks.push("fastapi");
    if (pyDeps.includes("sqlalchemy") || pyDeps.includes("sqlmodel"))
      orms.push("sqlalchemy");
    if (pyDeps.includes("flask"))
      frameworks.push("flask");
    if (pyDeps.includes("django")) {
      frameworks.push("django");
      orms.push("django");
    }
    if (pyDeps.includes("celery"))
      frameworks.push("celery");
  } catch {}
  const mixExsPath = join(wsPath, "mix.exs");
  if (await fileExists(mixExsPath)) {
    try {
      const mix = await readFile(mixExsPath, "utf-8");
      if (mix.includes(":phoenix") || mix.includes("phoenix,"))
        frameworks.push("phoenix");
      if (mix.includes(":ecto") || mix.includes("ecto_sql") || mix.includes("ecto,"))
        orms.push("ecto");
    } catch {}
  }
  const cargoTomlPath = join(wsPath, "Cargo.toml");
  if (await fileExists(cargoTomlPath)) {
    try {
      const cargo = await readFile(cargoTomlPath, "utf-8");
      if (cargo.includes("actix-web"))
        frameworks.push("actix");
      else if (cargo.includes("axum"))
        frameworks.push("axum");
    } catch {}
  }
  const goModPath = join(wsPath, "go.mod");
  if (await fileExists(goModPath)) {
    try {
      const goMod = await readFile(goModPath, "utf-8");
      if (goMod.includes("gin-gonic/gin"))
        frameworks.push("gin");
      else if (goMod.includes("gofiber/fiber"))
        frameworks.push("fiber");
      else if (goMod.includes("labstack/echo"))
        frameworks.push("echo");
      else if (goMod.includes("go-chi/chi"))
        frameworks.push("chi");
      else
        frameworks.push("go-net-http");
      if (goMod.includes("gorm"))
        orms.push("gorm");
      if (goMod.includes("entgo.io/ent"))
        orms.push("ent");
    } catch {}
  }
  const pomXmlPath = join(wsPath, "pom.xml");
  const buildGradlePath = join(wsPath, "build.gradle");
  const buildGradleKtsPath = join(wsPath, "build.gradle.kts");
  const hasPom = await fileExists(pomXmlPath);
  const hasGradleKts = await fileExists(buildGradleKtsPath);
  const hasGradle = hasGradleKts || await fileExists(buildGradlePath);
  if (hasPom || hasGradle) {
    try {
      const buildFile = hasPom ? await readFile(pomXmlPath, "utf-8") : await readFile(hasGradleKts ? buildGradleKtsPath : buildGradlePath, "utf-8");
      if (buildFile.includes("spring"))
        frameworks.push("spring");
      if (buildFile.includes("ktor"))
        frameworks.push("ktor");
      if (buildFile.includes("exposed"))
        orms.push("exposed");
    } catch {}
  }
  const gemfilePath = join(wsPath, "Gemfile");
  if (await fileExists(gemfilePath)) {
    try {
      const gemfile = await readFile(gemfilePath, "utf-8");
      if (gemfile.includes("rails"))
        frameworks.push("rails");
      if (gemfile.includes("activerecord") || gemfile.includes("rails"))
        orms.push("activerecord");
    } catch {}
  }
  if (await hasRokuManifest(wsPath)) {
    frameworks.push("roku-scenegraph");
    orms.push("scenegraph");
  }
  if (frameworks.length === 0)
    return null;
  return {
    name: dirName,
    path: relative(repoRoot, wsPath),
    frameworks,
    orms
  };
}
async function getWorkspacePatterns(root, pkg) {
  try {
    const yaml = await readFile(join(root, "pnpm-workspace.yaml"), "utf-8");
    const patterns = [];
    for (const line of yaml.split(`
`)) {
      const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (match)
        patterns.push(match[1].trim());
    }
    if (patterns.length > 0)
      return patterns;
  } catch {}
  if (Array.isArray(pkg.workspaces))
    return pkg.workspaces;
  if (pkg.workspaces?.packages)
    return pkg.workspaces.packages;
  return [];
}
async function parsePythonRequirements(content, root, deps) {
  for (const line of content.split(`
`)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const includeMatch = trimmed.match(/^-r\s+(.+)/);
    if (includeMatch) {
      try {
        const included = await readFile(join(root, includeMatch[1].trim()), "utf-8");
        for (const subLine of included.split(`
`)) {
          const name2 = subLine.split(/[>=<\[#]/)[0].trim().toLowerCase().replace(/-/g, "-");
          if (name2 && !name2.startsWith("-") && !deps.includes(name2))
            deps.push(name2);
        }
      } catch {}
      continue;
    }
    const name = trimmed.split(/[>=<\[#]/)[0].trim().toLowerCase();
    if (name && !name.startsWith("-") && !deps.includes(name))
      deps.push(name);
  }
}
async function getPythonDeps(root) {
  const deps = [];
  const searchDirs = [root];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && !IGNORE_DIRS.has(entry.name)) {
        searchDirs.push(join(root, entry.name));
      }
    }
  } catch {}
  for (const dir of searchDirs) {
    try {
      const req = await readFile(join(dir, "requirements.txt"), "utf-8");
      await parsePythonRequirements(req, dir, deps);
    } catch {}
    try {
      const pipfile = await readFile(join(dir, "Pipfile"), "utf-8");
      let inPackages = false;
      for (const line of pipfile.split(`
`)) {
        const trimmed = line.trim();
        if (trimmed === "[packages]" || trimmed === "[dev-packages]") {
          inPackages = trimmed === "[packages]";
          continue;
        }
        if (trimmed.startsWith("[")) {
          inPackages = false;
          continue;
        }
        if (inPackages && trimmed.includes("=")) {
          const name = trimmed.split("=")[0].trim().toLowerCase().replace(/_/g, "-");
          if (name && !name.startsWith("#") && !deps.includes(name))
            deps.push(name);
        }
      }
    } catch {}
    try {
      const toml = await readFile(join(dir, "pyproject.toml"), "utf-8");
      parsePyprojectProjectDeps(toml, deps);
      parsePyprojectPoetryDeps(toml, deps);
    } catch {}
  }
  return deps;
}
function parsePyprojectProjectDeps(toml, deps) {
  const projectIdx = toml.indexOf("[project]");
  if (projectIdx < 0)
    return;
  const afterProject = toml.slice(projectIdx);
  const depMatch = afterProject.match(/\bdependencies\s*=\s*\[/);
  if (!depMatch)
    return;
  const arrStart = projectIdx + (depMatch.index ?? 0) + depMatch[0].length - 1;
  let depth = 1;
  let pos = arrStart + 1;
  let inStr = false;
  while (pos < toml.length && depth > 0) {
    const ch = toml[pos];
    if (ch === '"' && toml[pos - 1] !== "\\")
      inStr = !inStr;
    if (!inStr) {
      if (ch === "[")
        depth++;
      else if (ch === "]")
        depth--;
    }
    pos++;
  }
  const depsContent = toml.slice(arrStart + 1, pos - 1);
  for (const m of depsContent.matchAll(/"([^"]+)"/g)) {
    addPythonDep(m[1].split(/[>=<\[!~;]/)[0], deps);
  }
}
function parsePyprojectPoetryDeps(toml, deps) {
  const sectionMatch = toml.match(/^\[tool\.poetry\.dependencies\]\s*$/m);
  if (!sectionMatch)
    return;
  const sectionStart = (sectionMatch.index ?? 0) + sectionMatch[0].length;
  const sectionBody = toml.slice(sectionStart);
  for (const line of sectionBody.split(`
`)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    if (trimmed.startsWith("["))
      break;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0)
      continue;
    const rawName = trimmed.slice(0, eqIdx).trim().replace(/^['"]|['"]$/g, "");
    addPythonDep(rawName, deps);
  }
}
function addPythonDep(rawName, deps) {
  const name = rawName.trim().toLowerCase().replace(/_/g, "-");
  if (!name || name === "python" || name.startsWith("#") || deps.includes(name))
    return;
  deps.push(name);
}
async function goImportUsed(root, importStr) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "vendor" || entry.name === "node_modules" || entry.name.startsWith("."))
        continue;
      const fullPath = join(root, entry.name);
      if (entry.isDirectory()) {
        if (await goImportUsed(fullPath, importStr))
          return true;
      } else if (entry.name.endsWith(".go")) {
        try {
          const content = await readFile(fullPath, "utf-8");
          if (content.includes(importStr))
            return true;
        } catch {}
      }
    }
  } catch {}
  return false;
}
async function getGoDeps(root, includeIndirect = false) {
  const deps = [];
  try {
    const gomod = await readFile(join(root, "go.mod"), "utf-8");
    for (const line of gomod.split(`
`)) {
      if (!includeIndirect && line.includes("// indirect"))
        continue;
      let match = line.match(/^\s+([\w./-]+)\s+v/);
      if (!match) {
        match = line.match(/^require\s+([\w./-]+)\s+v/);
      }
      if (match)
        deps.push(match[1]);
    }
    try {
      const main = await readFile(join(root, "main.go"), "utf-8");
      if (main.includes("net/http"))
        deps.push("net/http");
    } catch {}
  } catch {}
  return deps;
}
async function getAndroidDeps(root) {
  const deps = [];
  const gradlePaths = [
    join(root, "build.gradle.kts"),
    join(root, "build.gradle"),
    join(root, "app", "build.gradle.kts"),
    join(root, "app", "build.gradle")
  ];
  for (const gp of gradlePaths) {
    try {
      const content = await readFile(gp, "utf-8");
      const depPat = /(?:implementation|api|kapt|ksp|annotationProcessor)\s*\(?["']([^"']+)["']\)?/g;
      let m;
      while ((m = depPat.exec(content)) !== null) {
        deps.push(m[1]);
      }
    } catch {}
  }
  return deps;
}
async function resolveRepoName(root) {
  try {
    const gitPath = join(root, ".git");
    const gitStat = await stat(gitPath);
    if (gitStat.isFile()) {
      const gitContent = await readFile(gitPath, "utf-8");
      const gitdirMatch = gitContent.match(/gitdir:\s*(.+)/);
      if (gitdirMatch) {
        const worktreeGitDir = gitdirMatch[1].trim();
        const mainGitDir = join(worktreeGitDir, "..", "..");
        const mainRepoRoot = join(mainGitDir, "..");
        return basename(mainRepoRoot);
      }
    }
  } catch {}
  return basename(root);
}
async function findAllCsproj(dir, depth = 0, results = []) {
  if (depth > 4)
    return results;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const skipDirs = new Set(["node_modules", ".git", "bin", "obj", "out", "dist", "build", ".vs"]);
    for (const e of entries) {
      if (e.name.endsWith(".csproj"))
        results.push(join(dir, e.name));
      else if (e.isDirectory() && !skipDirs.has(e.name)) {
        await findAllCsproj(join(dir, e.name), depth + 1, results);
      }
    }
  } catch {}
  return results;
}
async function hasRokuManifest(dir) {
  const manifestPath = join(dir, "manifest");
  try {
    const s = await stat(manifestPath);
    if (!s.isFile())
      return false;
    const content = await readFile(manifestPath, "utf-8");
    return /^\s*title\s*=/m.test(content) && /^\s*major_version\s*=/m.test(content);
  } catch {
    return false;
  }
}
async function detectBrighterScriptTemplateRoot(dir) {
  if (await hasRokuManifest(dir))
    return false;
  const bsConfigPath = join(dir, "bsconfig.json");
  try {
    await stat(bsConfigPath);
  } catch {
    return false;
  }
  if (await hasRokuManifest(join(dir, "src")))
    return true;
  const hasBrsIn = async (subdir) => {
    try {
      const entries = await readdir(join(dir, subdir), { withFileTypes: true });
      return entries.some((e) => e.isFile() && (e.name.endsWith(".brs") || e.name.endsWith(".bs")));
    } catch {
      return false;
    }
  };
  if (await hasBrsIn("source"))
    return true;
  if (await hasBrsIn("components"))
    return true;
  return false;
}
async function detectRokuMonorepo(root) {
  if (await hasRokuManifest(root))
    return null;
  try {
    const pkgRaw = await readFile(join(root, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);
    const deps = { ...pkg.dependencies ?? {}, ...pkg.devDependencies ?? {} };
    if (!deps["roku-deploy"])
      return null;
  } catch {
    return null;
  }
  const skip = new Set([
    "node_modules",
    ".git",
    "out",
    "dist",
    "build",
    ".roku-deploy-staging",
    "roku_modules",
    ".gradle"
  ]);
  const visit = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    const subdirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !skip.has(e.name) && !IGNORE_DIRS.has(e.name));
    const commonDir = subdirs.find((e) => e.name.toLowerCase() === "common");
    if (commonDir) {
      const channelDirs = [];
      for (const sub of subdirs) {
        if (sub === commonDir)
          continue;
        if (await hasRokuManifest(join(dir, sub.name))) {
          channelDirs.push(join(dir, sub.name));
        }
      }
      if (channelDirs.length >= 2) {
        return {
          containerDir: dir,
          channelDirs,
          commonDir: join(dir, commonDir.name)
        };
      }
    }
    return null;
  };
  const hit = await visit(root);
  if (hit)
    return hit;
  try {
    const topEntries = await readdir(root, { withFileTypes: true });
    for (const e of topEntries) {
      if (!e.isDirectory() || e.name.startsWith(".") || skip.has(e.name) || IGNORE_DIRS.has(e.name))
        continue;
      const firstLevel = join(root, e.name);
      const firstHit = await visit(firstLevel);
      if (firstHit)
        return firstHit;
      try {
        const nested = await readdir(firstLevel, { withFileTypes: true });
        for (const n of nested) {
          if (!n.isDirectory() || n.name.startsWith(".") || skip.has(n.name) || IGNORE_DIRS.has(n.name))
            continue;
          const secondLevel = join(firstLevel, n.name);
          const secondHit = await visit(secondLevel);
          if (secondHit)
            return secondHit;
        }
      } catch {}
    }
  } catch {}
  return null;
}
async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function readJsonSafe(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return {};
  }
}
var IGNORE_DIRS, CODE_EXTENSIONS;
var init_scanner = __esm(() => {
  IGNORE_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    "out",
    ".output",
    "coverage",
    ".turbo",
    ".vercel",
    ".codesight",
    ".codescope",
    ".ai-codex",
    "vendor",
    ".cache",
    ".parcel-cache",
    ".gradle",
    "deps",
    "_build",
    "target",
    ".roku-deploy-staging",
    "roku_modules"
  ]);
  CODE_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".vue",
    ".svelte",
    ".rb",
    ".ex",
    ".exs",
    ".java",
    ".kt",
    ".rs",
    ".php",
    ".dart",
    ".swift",
    ".cs",
    ".brs",
    ".bs",
    ".xml",
    ".graphql",
    ".gql",
    ".proto",
    ".sql",
    ".md"
  ]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/formatter.js
import { mkdir, writeFile as writeFile2 } from "fs/promises";
import { join as join2 } from "path";
async function writeOutput(result, outputDir) {
  await mkdir(outputDir, { recursive: true });
  if (result.crudGroups === undefined) {
    result.crudGroups = computeCrudGroups(result.routes);
  }
  const sections = [];
  if (result.routes.length > 0) {
    const content = formatRoutes(result);
    sections.push({ name: "routes", content });
    await writeFile2(join2(outputDir, "routes.md"), content);
  }
  if (result.schemas.length > 0) {
    const content = formatSchema(result);
    sections.push({ name: "schema", content });
    await writeFile2(join2(outputDir, "schema.md"), content);
  }
  if (result.components.length > 0) {
    const content = formatComponents(result);
    sections.push({ name: "components", content });
    await writeFile2(join2(outputDir, "components.md"), content);
  }
  if (result.libs.length > 0) {
    const content = formatLibs(result);
    sections.push({ name: "libs", content });
    await writeFile2(join2(outputDir, "libs.md"), content);
  }
  const configContent = formatConfig(result);
  if (configContent) {
    sections.push({ name: "config", content: configContent });
    await writeFile2(join2(outputDir, "config.md"), configContent);
  }
  if (result.middleware.length > 0) {
    const content = formatMiddleware(result);
    sections.push({ name: "middleware", content });
    await writeFile2(join2(outputDir, "middleware.md"), content);
  }
  if (result.graph.hotFiles.length > 0) {
    const content = formatGraph(result);
    sections.push({ name: "graph", content });
    await writeFile2(join2(outputDir, "graph.md"), content);
  }
  if (result.events && result.events.length > 0) {
    const content = formatEvents(result);
    sections.push({ name: "events", content });
    await writeFile2(join2(outputDir, "events.md"), content);
  }
  if (result.testCoverage && result.testCoverage.testFiles.length > 0) {
    const content = formatCoverage(result);
    sections.push({ name: "coverage", content });
    await writeFile2(join2(outputDir, "coverage.md"), content);
  }
  if (result.customSections) {
    const reserved = new Set(["routes", "schema", "components", "libs", "config", "middleware", "graph", "events", "coverage", "codesight"]);
    for (const cs of result.customSections) {
      const safeName = cs.name.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
      if (!safeName || reserved.has(safeName))
        continue;
      sections.push({ name: safeName, content: cs.content });
      await writeFile2(join2(outputDir, `${safeName}.md`), cs.content);
    }
  }
  const combined = formatCombined(result, sections);
  await writeFile2(join2(outputDir, "CODESIGHT.md"), combined);
  return combined;
}
function formatRoutes(result) {
  const lines = ["# Routes", ""];
  const httpRoutes = result.routes.filter((r) => !["QUERY", "MUTATION", "SUBSCRIPTION", "RPC", "WS", "WS-ROOM"].includes(r.method));
  const graphqlRoutes = result.routes.filter((r) => ["QUERY", "MUTATION", "SUBSCRIPTION"].includes(r.method));
  const grpcRoutes = result.routes.filter((r) => r.method === "RPC");
  const wsRoutes = result.routes.filter((r) => r.method === "WS" || r.method === "WS-ROOM");
  const crudGroupedPaths = new Set;
  if (result.crudGroups && result.crudGroups.length > 0) {
    for (const group of result.crudGroups) {
      for (const route of httpRoutes) {
        const base = route.path.replace(/\/:[^/]+$/, "").replace(/\/\{[^}]+\}$/, "");
        if (base === group.resource)
          crudGroupedPaths.add(`${route.method}:${route.path}`);
      }
    }
  }
  const byFramework = new Map;
  for (const route of httpRoutes) {
    const fw = route.framework;
    if (!byFramework.has(fw))
      byFramework.set(fw, []);
    byFramework.get(fw).push(route);
  }
  if (result.crudGroups && result.crudGroups.length > 0) {
    lines.push("## CRUD Resources", "");
    for (const group of result.crudGroups) {
      const modelStr = group.modelHint ? ` \u2192 ${group.modelHint}` : "";
      lines.push(`- **\`${group.resource}\`** ${group.methods.join(" | ")}${modelStr}`);
    }
    lines.push("");
  }
  const hasNonCrud = Array.from(byFramework.values()).some((routes) => routes.some((r) => !crudGroupedPaths.has(`${r.method}:${r.path}`)));
  if (hasNonCrud) {
    if (result.crudGroups && result.crudGroups.length > 0) {
      lines.push("## Other Routes", "");
    }
    for (const [fw, routes] of byFramework) {
      const nonCrud = routes.filter((r) => !crudGroupedPaths.has(`${r.method}:${r.path}`));
      if (nonCrud.length === 0)
        continue;
      if (byFramework.size > 1)
        lines.push(`### ${fw}`, "");
      for (const route of nonCrud) {
        const testMark = result.testCoverage?.testedRoutes.includes(`${route.method}:${route.path}`) ? " \u2713" : "";
        const tags = route.tags.length > 0 ? ` [${route.tags.join(", ")}]` : "";
        const params = route.params ? ` params(${route.params.join(", ")})` : "";
        const inferred = route.confidence === "regex" ? " `[inferred]`" : "";
        const contract = [];
        if (route.requestType)
          contract.push(`in: ${route.requestType}`);
        if (route.responseType)
          contract.push(`out: ${route.responseType}`);
        const contractStr = contract.length > 0 ? ` \u2192 ${contract.join(", ")}` : "";
        lines.push(`- \`${route.method}\` \`${route.path}\`${params}${contractStr}${tags}${inferred}${testMark}`);
      }
      lines.push("");
    }
  }
  if (graphqlRoutes.length > 0) {
    lines.push("## GraphQL", "");
    const byType = new Map;
    for (const r of graphqlRoutes) {
      if (!byType.has(r.method))
        byType.set(r.method, []);
      byType.get(r.method).push(r);
    }
    for (const [method, ops] of byType) {
      lines.push(`### ${method}`);
      for (const op of ops) {
        const contract = [];
        if (op.requestType)
          contract.push(`in: ${op.requestType}`);
        if (op.responseType)
          contract.push(`out: ${op.responseType}`);
        const contractStr = contract.length > 0 ? ` \u2192 ${contract.join(", ")}` : "";
        lines.push(`- \`${op.path}\`${contractStr}`);
      }
      lines.push("");
    }
  }
  if (grpcRoutes.length > 0) {
    lines.push("## gRPC", "");
    for (const r of grpcRoutes) {
      const contract = r.requestType && r.responseType ? ` (${r.requestType}) \u2192 ${r.responseType}` : "";
      lines.push(`- \`${r.path}\`${contract}`);
    }
    lines.push("");
  }
  if (wsRoutes.length > 0) {
    lines.push("## WebSocket Events", "");
    for (const r of wsRoutes) {
      lines.push(`- \`${r.method}\` \`${r.path}\` \u2014 \`${r.file}\``);
    }
    lines.push("");
  }
  return lines.join(`
`);
}
function formatSchema(result) {
  const lines = ["# Schema", ""];
  const byOrm = new Map;
  for (const model of result.schemas) {
    if (!byOrm.has(model.orm))
      byOrm.set(model.orm, []);
    byOrm.get(model.orm).push(model);
  }
  for (const [orm, models] of byOrm) {
    if (byOrm.size > 1)
      lines.push(`## ${orm}`, "");
    for (const model of models) {
      if (model.name.startsWith("enum:")) {
        const enumName = model.name.replace("enum:", "");
        const values = model.fields.map((f) => f.name).join(" | ");
        lines.push(`### enum ${enumName}: ${values}`, "");
        continue;
      }
      lines.push(`### ${model.name}`);
      for (const field of model.fields) {
        const flags = field.flags.length > 0 ? ` (${field.flags.join(", ")})` : "";
        lines.push(`- ${field.name}: ${field.type}${flags}`);
      }
      if (model.relations.length > 0) {
        lines.push(`- _relations_: ${model.relations.join(", ")}`);
      }
      lines.push("");
    }
  }
  return lines.join(`
`);
}
function formatComponents(result) {
  const lines = ["# Components", ""];
  for (const comp of result.components) {
    const markers = [];
    if (comp.isClient)
      markers.push("client");
    if (comp.isServer)
      markers.push("server");
    const markerStr = markers.length > 0 ? ` [${markers.join(", ")}]` : "";
    if (comp.props.length > 0) {
      lines.push(`- **${comp.name}**${markerStr} \u2014 props: ${comp.props.join(", ")} \u2014 \`${comp.file}\``);
    } else {
      lines.push(`- **${comp.name}**${markerStr} \u2014 \`${comp.file}\``);
    }
  }
  lines.push("");
  return lines.join(`
`);
}
function formatLibs(result) {
  const lines = ["# Libraries", ""];
  for (const lib of result.libs) {
    const maxExports = 6;
    const shown = lib.exports.slice(0, maxExports);
    const remaining = lib.exports.length - maxExports;
    if (lib.exports.length <= 2) {
      const exps = shown.map((e) => {
        const sig = e.signature ? `: ${e.signature}` : "";
        return `${e.kind} ${e.name}${sig}`;
      }).join(", ");
      lines.push(`- \`${lib.file}\` \u2014 ${exps}`);
    } else {
      lines.push(`- \`${lib.file}\``);
      for (const exp of shown) {
        const sig = exp.signature ? `: ${exp.signature}` : "";
        lines.push(`  - ${exp.kind} ${exp.name}${sig}`);
      }
      if (remaining > 0)
        lines.push(`  - _...${remaining} more_`);
    }
  }
  lines.push("");
  return lines.join(`
`);
}
function formatConfig(result) {
  const lines = ["# Config", ""];
  if (result.config.envVars.length > 0) {
    lines.push("## Environment Variables", "");
    for (const env of result.config.envVars) {
      const status = env.hasDefault ? "(has default)" : "**required**";
      lines.push(`- \`${env.name}\` ${status} \u2014 ${env.source}`);
    }
    lines.push("");
  }
  if (result.config.configFiles.length > 0) {
    lines.push("## Config Files", "");
    for (const f of result.config.configFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }
  const notableDeps = filterNotableDeps(result.config.dependencies);
  if (notableDeps.length > 0) {
    lines.push("## Key Dependencies", "");
    for (const [name, version] of notableDeps) {
      lines.push(`- ${name}: ${version}`);
    }
    lines.push("");
  }
  if (lines.length <= 2)
    return null;
  return lines.join(`
`);
}
function formatMiddleware(result) {
  const lines = ["# Middleware", ""];
  const byType = new Map;
  for (const mw of result.middleware) {
    if (!byType.has(mw.type))
      byType.set(mw.type, []);
    byType.get(mw.type).push(mw);
  }
  for (const [type, mws] of byType) {
    lines.push(`## ${type}`);
    for (const mw of mws) {
      lines.push(`- ${mw.name} \u2014 \`${mw.file}\``);
    }
    lines.push("");
  }
  return lines.join(`
`);
}
function formatGraph(result) {
  const lines = ["# Dependency Graph", ""];
  lines.push("## Most Imported Files (change these carefully)", "");
  for (const hf of result.graph.hotFiles) {
    lines.push(`- \`${hf.file}\` \u2014 imported by **${hf.importedBy}** files`);
  }
  lines.push("");
  const edgesByTarget = new Map;
  for (const edge of result.graph.edges) {
    if (!edgesByTarget.has(edge.to))
      edgesByTarget.set(edge.to, []);
    edgesByTarget.get(edge.to).push(edge.from);
  }
  const topTargets = Array.from(edgesByTarget.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  if (topTargets.length > 0) {
    lines.push("## Import Map (who imports what)", "");
    for (const [target, importers] of topTargets) {
      const shown = importers.slice(0, 5);
      const more = importers.length > 5 ? ` +${importers.length - 5} more` : "";
      lines.push(`- \`${target}\` \u2190 ${shown.map((i) => `\`${i}\``).join(", ")}${more}`);
    }
    lines.push("");
  }
  return lines.join(`
`);
}
function formatCombined(result, sections) {
  const lines = [];
  lines.push(`# ${result.project.name} \u2014 AI Context Map`);
  lines.push("");
  const fw = result.project.frameworks.join(", ") || "unknown";
  const orm = result.project.orms.join(", ") || "none";
  const lang = result.project.language;
  const compFw = result.project.componentFramework;
  lines.push(`> **Stack:** ${fw} | ${orm} | ${compFw} | ${lang}`);
  if (result.project.isMonorepo) {
    const wsNames = result.project.workspaces.map((w) => w.name).join(", ");
    const repoLabel = result.project.repoType === "meta" ? "Meta-repo" : result.project.repoType === "microservices" ? "Microservices" : "Monorepo";
    lines.push(`> **${repoLabel}:** ${wsNames}`);
  }
  lines.push("");
  const ts = result.tokenStats;
  const httpRouteCount = result.routes.filter((r) => !["QUERY", "MUTATION", "SUBSCRIPTION", "RPC", "WS", "WS-ROOM"].includes(r.method)).length;
  const gqlCount = result.routes.filter((r) => ["QUERY", "MUTATION", "SUBSCRIPTION"].includes(r.method)).length;
  const wsCount = result.routes.filter((r) => r.method === "WS" || r.method === "WS-ROOM").length;
  const grpcCount = result.routes.filter((r) => r.method === "RPC").length;
  const eventCount = result.events?.length ?? 0;
  const coveragePct = result.testCoverage?.coveragePercent;
  const inferredCount = result.routes.filter((r) => r.confidence === "regex").length;
  const inferredNote = inferredCount > 0 ? ` (${inferredCount} inferred)` : "";
  let routeStr = `${httpRouteCount} routes${inferredNote}`;
  if (gqlCount > 0)
    routeStr += ` + ${gqlCount} graphql`;
  if (grpcCount > 0)
    routeStr += ` + ${grpcCount} rpc`;
  if (wsCount > 0)
    routeStr += ` + ${wsCount} ws`;
  let extras = "";
  if (eventCount > 0)
    extras += ` | ${eventCount} events`;
  if (coveragePct !== undefined)
    extras += ` | ${coveragePct}% test coverage`;
  lines.push(`> ${routeStr} | ${result.schemas.length} models | ${result.components.length} components | ${result.libs.length} lib files | ${result.config.envVars.length} env vars | ${result.middleware.length} middleware${extras}`);
  const roundTo100 = (n) => Math.round(n / 100) * 100;
  lines.push(`> **Token savings:** this file is ~${roundTo100(ts.outputTokens).toLocaleString()} tokens. Without it, AI exploration would cost ~${roundTo100(ts.estimatedExplorationTokens).toLocaleString()} tokens. **Saves ~${roundTo100(ts.saved).toLocaleString()} tokens per conversation.**`);
  const scanTime = new Date().toISOString().slice(0, 16).replace("T", " ");
  lines.push(`> **Last scanned:** ${scanTime} \u2014 re-run after significant changes`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const section of sections) {
    lines.push(section.content);
    lines.push("---");
    lines.push("");
  }
  lines.push(`_Generated by [codesight](https://github.com/Houseofmvps/codesight) \u2014 see your codebase clearly_`);
  return lines.join(`
`);
}
function filterNotableDeps(deps) {
  const notable = new Set([
    "next",
    "react",
    "vue",
    "svelte",
    "hono",
    "express",
    "fastify",
    "koa",
    "@nestjs/core",
    "@nestjs/common",
    "elysia",
    "@adonisjs/core",
    "@sveltejs/kit",
    "@remix-run/node",
    "@remix-run/react",
    "nuxt",
    "drizzle-orm",
    "prisma",
    "@prisma/client",
    "typeorm",
    "mongoose",
    "sequelize",
    "pg",
    "mysql2",
    "better-sqlite3",
    "knex",
    "better-auth",
    "@clerk/nextjs",
    "next-auth",
    "lucia",
    "passport",
    "@auth/core",
    "stripe",
    "@polar-sh/sdk",
    "resend",
    "@lemonsqueezy/lemonsqueezy.js",
    "bullmq",
    "redis",
    "ioredis",
    "tailwindcss",
    "zod",
    "@trpc/server",
    "graphql",
    "@apollo/server",
    "@anthropic-ai/sdk",
    "openai",
    "ai",
    "langchain",
    "@google/generative-ai",
    "supabase",
    "@supabase/supabase-js",
    "firebase",
    "@firebase/app",
    "playwright",
    "puppeteer",
    "socket.io"
  ]);
  return Object.entries(deps).filter(([name]) => notable.has(name)).sort(([a], [b]) => a.localeCompare(b));
}
function formatEvents(result) {
  const events = result.events;
  if (!events || events.length === 0)
    return "";
  const lines = ["# Events & Queues", ""];
  const bySystem = new Map;
  for (const e of events) {
    if (!bySystem.has(e.system))
      bySystem.set(e.system, []);
    bySystem.get(e.system).push(e);
  }
  for (const [system, items] of bySystem) {
    if (bySystem.size > 1)
      lines.push(`## ${system}`, "");
    for (const item of items) {
      const payload = item.payloadType ? ` \u2192 ${item.payloadType}` : "";
      lines.push(`- \`${item.name}\` [${item.type}]${payload} \u2014 \`${item.file}\``);
    }
    lines.push("");
  }
  return lines.join(`
`);
}
function formatCoverage(result) {
  const cov = result.testCoverage;
  if (!cov || cov.testFiles.length === 0)
    return "";
  const lines = ["# Test Coverage", ""];
  lines.push(`> **${cov.coveragePercent}%** of routes and models are covered by tests`);
  lines.push(`> ${cov.testFiles.length} test files found`);
  lines.push("");
  if (cov.testedRoutes.length > 0) {
    lines.push("## Covered Routes", "");
    for (const r of cov.testedRoutes) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }
  if (cov.testedModels.length > 0) {
    lines.push("## Covered Models", "");
    for (const m of cov.testedModels) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }
  return lines.join(`
`);
}
function computeCrudGroups(routes) {
  const httpRoutes = routes.filter((r) => !["QUERY", "MUTATION", "SUBSCRIPTION", "RPC", "WS", "WS-ROOM"].includes(r.method));
  const byBase = new Map;
  for (const route of httpRoutes) {
    const base = route.path.replace(/\/:[^/]+$/, "").replace(/\/\{[^}]+\}$/, "");
    if (!byBase.has(base))
      byBase.set(base, []);
    byBase.get(base).push(route);
  }
  const groups = [];
  for (const [base, groupRoutes] of byBase) {
    const methods = new Set(groupRoutes.map((r) => r.method));
    const hasList = methods.has("GET") && groupRoutes.some((r) => r.path === base);
    const hasCreate = methods.has("POST");
    const hasGet = methods.has("GET") && groupRoutes.some((r) => r.path !== base);
    const hasUpdate = methods.has("PUT") || methods.has("PATCH");
    const hasDelete = methods.has("DELETE");
    const crudCount = [hasList, hasCreate, hasGet, hasUpdate, hasDelete].filter(Boolean).length;
    if (crudCount >= 3 && groupRoutes.length >= 3) {
      const methodLabels = [];
      if (hasList)
        methodLabels.push("GET");
      if (hasCreate)
        methodLabels.push("POST");
      if (hasGet)
        methodLabels.push("GET/:id");
      if (hasUpdate)
        methodLabels.push(methods.has("PUT") ? "PUT/:id" : "PATCH/:id");
      if (hasDelete)
        methodLabels.push("DELETE/:id");
      const segments = base.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1] || "";
      const modelHint = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/s$/, "");
      groups.push({
        resource: base,
        methods: methodLabels,
        modelHint
      });
    }
  }
  return groups;
}
function formatKnowledge(map, projectName, version) {
  const lines = [];
  const { notes, decisions, openQuestions, recurringThemes, people, projects, dateRange, hubNotes } = map;
  const dateStr = dateRange ? ` \xB7 ${dateRange.from} \u2192 ${dateRange.to}` : "";
  lines.push(`# Knowledge Map \u2014 ${projectName}`);
  lines.push(`> ${notes.length} notes \xB7 ${decisions.length} decisions \xB7 ${openQuestions.length} open questions${dateStr}`);
  lines.push("");
  {
    const parts = [];
    const topThemes = recurringThemes.slice(0, 4).join(", ");
    const topDecision = decisions[0] ? decisions[0].replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "") : null;
    const noteWord = notes.length === 1 ? "note" : "notes";
    if (dateRange) {
      parts.push(`This knowledge base spans ${dateRange.from} to ${dateRange.to} (${notes.length} ${noteWord}).`);
    } else {
      parts.push(`This knowledge base has ${notes.length} ${noteWord}.`);
    }
    if (topThemes)
      parts.push(`Key topics: ${topThemes}.`);
    if (topDecision) {
      const d = topDecision.length > 120 ? topDecision.slice(0, 120) + "\u2026" : topDecision;
      parts.push(`Most recent decision: ${d.replace(/\.+$/, "")}.`);
    }
    if (openQuestions.length > 0)
      parts.push(`${openQuestions.length} open question${openQuestions.length > 1 ? "s" : ""} remain.`);
    lines.push(`> **AI Primer:** ${parts.join(" ")}`);
    lines.push("");
  }
  if (decisions.length > 0) {
    lines.push(`## Key Decisions (${decisions.length})`);
    for (const d of decisions) {
      lines.push(`- ${d}`);
    }
    lines.push("");
  }
  if (openQuestions.length > 0) {
    lines.push(`## Open Questions (${openQuestions.length})`);
    for (const q of openQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }
  if (projects.length > 0) {
    lines.push(`## Projects`);
    lines.push(projects.map((p) => `\`${p}\``).join(" \xB7 "));
    lines.push("");
  }
  if (recurringThemes.length > 0) {
    lines.push(`## Recurring Themes`);
    lines.push(recurringThemes.join(" \xB7 "));
    lines.push("");
  }
  if (people.length > 0) {
    lines.push(`## People`);
    lines.push(people.map((p) => p.includes(" ") ? p : `@${p}`).join(" \xB7 "));
    lines.push("");
  }
  if (hubNotes && hubNotes.length > 0) {
    lines.push(`## Hub Notes (most referenced)`);
    for (const hub of hubNotes) {
      lines.push(`- \`${hub.file}\` \u2014 **${hub.refs}** incoming references \u2014 ${hub.title}`);
    }
    lines.push("");
  }
  const byType = new Map;
  for (const note of notes) {
    if (!byType.has(note.type))
      byType.set(note.type, []);
    byType.get(note.type).push(note);
  }
  const typeOrder = ["decision", "spec", "retro", "meeting", "research", "session", "backlog", "general"];
  lines.push(`## Note Index (${notes.length})`);
  for (const type of typeOrder) {
    const group = byType.get(type);
    if (!group || group.length === 0)
      continue;
    lines.push(`
### ${NOTE_TYPE_LABELS[type]} (${group.length})`);
    for (const note of group.slice(0, 20)) {
      const date = note.date ? ` \u2014 ${note.date}` : "";
      const refs = note.backlinks ? ` \u2190 ${note.backlinks} refs` : "";
      const summary = note.summary ? ` \u2014 ${note.summary}` : "";
      const display = `\`${note.file}\`${date}${refs}${summary}`;
      lines.push(`- ${display}`);
    }
    if (group.length > 20)
      lines.push(`- _\u2026and ${group.length - 20} more_`);
  }
  lines.push("");
  lines.push("---");
  lines.push(`_Generated by [codesight](https://github.com/Houseofmvps/codesight) v${version}_`);
  return lines.join(`
`);
}
async function writeKnowledgeOutput(map, outputDir, projectName, version) {
  await mkdir(outputDir, { recursive: true });
  const content = formatKnowledge(map, projectName, version);
  await writeFile2(join2(outputDir, "KNOWLEDGE.md"), content);
  return content;
}
var NOTE_TYPE_LABELS;
var init_formatter = __esm(() => {
  NOTE_TYPE_LABELS = {
    decision: "Decision Records",
    meeting: "Meeting Notes",
    retro: "Retrospectives",
    spec: "Specs & PRDs",
    backlog: "Backlogs",
    research: "Research",
    session: "Session Logs",
    general: "General Notes"
  };
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/generators/ai-config.js
var exports_ai_config = {};
__export(exports_ai_config, {
  generateProfileConfig: () => generateProfileConfig,
  generateMonorepoAIConfigs: () => generateMonorepoAIConfigs,
  generateAIConfigs: () => generateAIConfigs
});
import { writeFile as writeFile3, readFile as readFile2, stat as stat2 } from "fs/promises";
import { join as join3 } from "path";
async function fileExists2(path) {
  try {
    await stat2(path);
    return true;
  } catch {
    return false;
  }
}
function generateContext(result) {
  const { project, routes, schemas, components, middleware, config, graph } = result;
  const lines = [];
  const fw = project.frameworks.join(", ") || "generic";
  const orm = project.orms.join(", ") || "none";
  lines.push(`This is a ${project.language} project using ${fw}${orm !== "none" ? ` with ${orm}` : ""}.`);
  if (project.isMonorepo) {
    const repoLabel = project.repoType === "meta" ? "meta-repo" : project.repoType === "microservices" ? "microservices repo" : "monorepo";
    lines.push(`It is a ${repoLabel} with workspaces: ${project.workspaces.map((w) => `${w.name} (${w.path})`).join(", ")}.`);
  }
  lines.push("");
  if (routes.length > 0) {
    lines.push(`The API has ${routes.length} routes. See .codesight/routes.md for the full route map with methods, paths, and tags.`);
  }
  if (schemas.length > 0) {
    lines.push(`The database has ${schemas.length} models. See .codesight/schema.md for the full schema with fields, types, and relations.`);
  }
  if (components.length > 0) {
    lines.push(`The UI has ${components.length} components. See .codesight/components.md for the full list with props.`);
  }
  if (middleware.length > 0) {
    const types = [...new Set(middleware.map((m) => m.type))].join(", ");
    lines.push(`Middleware includes: ${types}.`);
  }
  lines.push("");
  if (graph.hotFiles.length > 0) {
    lines.push("High-impact files (most imported, changes here affect many other files):");
    for (const hf of graph.hotFiles.slice(0, 8)) {
      lines.push(`- ${hf.file} (imported by ${hf.importedBy} files)`);
    }
    lines.push("");
  }
  const requiredEnvs = config.envVars.filter((e) => !e.hasDefault);
  if (requiredEnvs.length > 0) {
    lines.push("Required environment variables (no defaults):");
    for (const env of requiredEnvs.slice(0, 15)) {
      lines.push(`- ${env.name} (${env.source})`);
    }
    lines.push("");
  }
  if (result.customSections) {
    for (const cs of result.customSections) {
      const safeName = cs.name.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
      if (!safeName)
        continue;
      lines.push(`See .codesight/${safeName}.md for additional ${safeName} context.`);
    }
    lines.push("");
  }
  lines.push("Read .codesight/wiki/index.md for orientation (WHERE things live). Then read actual source files before implementing. Wiki articles are navigation aids, not implementation guides.");
  lines.push("Read .codesight/CODESIGHT.md for the complete AI context map including all routes, schema, components, libraries, config, middleware, and dependency graph.");
  return lines.join(`
`);
}
async function generateAIConfigs(result, root) {
  const generated = [];
  const context = generateContext(result);
  const claudePath = join3(root, "CLAUDE.md");
  const claudeExists = await fileExists2(claudePath);
  if (!claudeExists) {
    const claudeContent = `# Project Context

${context}
`;
    await writeFile3(claudePath, claudeContent);
    generated.push("CLAUDE.md");
  } else {
    const existing = await readFile2(claudePath, "utf-8");
    if (!existing.includes("codesight") && !existing.includes("CODESIGHT")) {
      const appendSection = `

# AI Context (auto-generated by codesight)

${context}
`;
      await writeFile3(claudePath, existing + appendSection);
      generated.push("CLAUDE.md (appended)");
    }
  }
  const cursorPath = join3(root, ".cursorrules");
  const cursorExists = await fileExists2(cursorPath);
  if (!cursorExists) {
    const cursorContent = `# Project Context

${context}
`;
    await writeFile3(cursorPath, cursorContent);
    generated.push(".cursorrules");
  }
  const copilotDir = join3(root, ".github");
  const copilotPath = join3(copilotDir, "copilot-instructions.md");
  const copilotExists = await fileExists2(copilotPath);
  if (!copilotExists) {
    const ghDirExists = await fileExists2(copilotDir);
    if (ghDirExists) {
      const copilotContent = `# Project Context

${context}
`;
      await writeFile3(copilotPath, copilotContent);
      generated.push(".github/copilot-instructions.md");
    }
  }
  const codexPath = join3(root, "codex.md");
  const codexExists = await fileExists2(codexPath);
  if (!codexExists) {
    const codexContent = `# Project Context

${context}
`;
    await writeFile3(codexPath, codexContent);
    generated.push("codex.md");
  }
  const agentsPath = join3(root, "AGENTS.md");
  const agentsExists = await fileExists2(agentsPath);
  if (!agentsExists) {
    const agentsContent = `# Project Context

${context}
`;
    await writeFile3(agentsPath, agentsContent);
    generated.push("AGENTS.md");
  }
  return generated;
}
async function generateProfileConfig(result, root, profile) {
  const { project, routes, schemas, graph, config } = result;
  const summaryLines = [];
  summaryLines.push(`# ${project.name} \u2014 Project Context
`);
  summaryLines.push(`**Stack:** ${project.frameworks.join(", ") || "generic"} | ${project.orms.join(", ") || "none"} | ${project.language}`);
  if (project.isMonorepo) {
    const repoLabel = project.repoType === "meta" ? "Meta-repo" : project.repoType === "microservices" ? "Microservices" : "Monorepo";
    summaryLines.push(`**${repoLabel}:** ${project.workspaces.map((w) => w.name).join(", ")}`);
  }
  summaryLines.push(`
${routes.length} routes | ${schemas.length} models | ${config.envVars.length} env vars | ${graph.edges.length} import links
`);
  if (routes.length > 0) {
    const areas = [...new Set(routes.map((r) => r.path.split("/").slice(0, 3).join("/")))].slice(0, 10);
    summaryLines.push(`**API areas:** ${areas.join(", ")}`);
  }
  if (graph.hotFiles.length > 0) {
    summaryLines.push(`
**High-impact files** (change carefully):`);
    for (const hf of graph.hotFiles.slice(0, 5)) {
      summaryLines.push(`- ${hf.file} (imported by ${hf.importedBy} files)`);
    }
  }
  const required = config.envVars.filter((e) => !e.hasDefault);
  if (required.length > 0) {
    summaryLines.push(`
**Required env vars:** ${required.map((e) => e.name).join(", ")}`);
  }
  summaryLines.push(`
---
`);
  switch (profile) {
    case "claude-code": {
      summaryLines.push(`## Instructions for Claude Code
`);
      summaryLines.push(`### Two-Step Rule (mandatory)`);
      summaryLines.push(`**Step 1 \u2014 Orient:** Use wiki articles to find WHERE things live.`);
      summaryLines.push(`**Step 2 \u2014 Verify:** Read the actual source files listed in the wiki article BEFORE writing any code.
`);
      summaryLines.push(`Wiki articles are structural summaries extracted by AST. They show routes, models, and file locations.`);
      summaryLines.push(`They do NOT show full function logic, middleware internals, or dynamic runtime behavior.`);
      summaryLines.push(`**Never write or modify code based solely on wiki content \u2014 always read source files first.**
`);
      summaryLines.push(`Read in order at session start:`);
      summaryLines.push(`1. \`.codesight/wiki/index.md\` \u2014 orientation map (~200 tokens)`);
      summaryLines.push(`2. \`.codesight/wiki/overview.md\` \u2014 architecture overview (~500 tokens)`);
      summaryLines.push(`3. Domain article (e.g. \`.codesight/wiki/auth.md\`) \u2192 check "Source Files" section \u2192 read those files`);
      summaryLines.push(`4. \`.codesight/CODESIGHT.md\` \u2014 full context map for deep exploration
`);
      summaryLines.push(`Routes marked \`[inferred]\` in wiki articles were detected via regex \u2014 verify against source before trusting.`);
      summaryLines.push(`If any source file shows \u26A0 in the wiki, re-run \`npx codesight --wiki\` before proceeding.
`);
      summaryLines.push(`Or use the codesight MCP server for on-demand queries:`);
      summaryLines.push(`   - \`codesight_get_wiki_article\` \u2014 read a specific wiki article by name`);
      summaryLines.push(`   - \`codesight_get_wiki_index\` \u2014 get the wiki index`);
      summaryLines.push(`   - \`codesight_get_summary\` \u2014 quick project overview`);
      summaryLines.push(`   - \`codesight_get_routes --prefix /api/users\` \u2014 filtered routes`);
      summaryLines.push(`   - \`codesight_get_blast_radius --file src/lib/db.ts\` \u2014 impact analysis before changes`);
      summaryLines.push(`   - \`codesight_get_schema --model users\` \u2014 specific model details`);
      summaryLines.push(`
Only open specific files after consulting codesight context. This saves ~${result.tokenStats.saved.toLocaleString()} tokens per conversation.`);
      const outPath = join3(root, "CLAUDE.md");
      const existing = await fileExists2(outPath) ? await readFile2(outPath, "utf-8") : "";
      if (existing && existing.includes("codesight")) {
        await writeFile3(outPath, existing.replace(/# AI Context.*?(?=\n#|\n$|$)/s, summaryLines.join(`
`)));
      } else if (existing) {
        await writeFile3(outPath, existing + `

` + summaryLines.join(`
`));
      } else {
        await writeFile3(outPath, summaryLines.join(`
`));
      }
      return "CLAUDE.md";
    }
    case "cursor": {
      summaryLines.push(`## Instructions for Cursor
`);
      summaryLines.push(`When answering questions about this project:`);
      summaryLines.push(`1. Read \`.codesight/CODESIGHT.md\` first for full project structure`);
      summaryLines.push(`2. Use \`.codesight/routes.md\` to find relevant API handlers`);
      summaryLines.push(`3. Use \`.codesight/schema.md\` to understand data models`);
      summaryLines.push(`4. Use \`.codesight/graph.md\` to check blast radius before changes`);
      summaryLines.push(`
Do not crawl the file tree \u2014 the codesight context map already contains the full project structure.`);
      await writeFile3(join3(root, ".cursorrules"), summaryLines.join(`
`));
      return ".cursorrules";
    }
    case "codex": {
      summaryLines.push(`## Instructions for OpenAI Codex
`);
      summaryLines.push(`This project uses codesight for structured context. Read .codesight/CODESIGHT.md before exploring files.`);
      summaryLines.push(`Routes: .codesight/routes.md | Schema: .codesight/schema.md | Dependencies: .codesight/graph.md`);
      await writeFile3(join3(root, "codex.md"), summaryLines.join(`
`));
      return "codex.md";
    }
    case "copilot": {
      summaryLines.push(`## Instructions for GitHub Copilot
`);
      summaryLines.push(`Project context is pre-generated in .codesight/. Consult CODESIGHT.md for full architecture.`);
      const ghDir = join3(root, ".github");
      await fileExists2(ghDir) || await (await import("fs/promises")).mkdir(ghDir, { recursive: true });
      await writeFile3(join3(ghDir, "copilot-instructions.md"), summaryLines.join(`
`));
      return ".github/copilot-instructions.md";
    }
    case "windsurf": {
      summaryLines.push(`## Instructions for Windsurf
`);
      summaryLines.push(`Read .codesight/CODESIGHT.md for full project map before exploring files.`);
      summaryLines.push(`Use .codesight/routes.md for API structure and .codesight/graph.md for dependency analysis.`);
      await writeFile3(join3(root, ".windsurfrules"), summaryLines.join(`
`));
      return ".windsurfrules";
    }
    case "agents": {
      summaryLines.push(`## Agent Instructions
`);
      summaryLines.push(`This project uses codesight for structured AI context. Follow these steps before implementing:`);
      summaryLines.push(`1. Read \`.codesight/wiki/index.md\` for project orientation (~200 tokens)`);
      summaryLines.push(`2. Read \`.codesight/wiki/overview.md\` for architecture overview (~500 tokens)`);
      summaryLines.push(`3. Read the relevant domain article, then open the source files listed in it`);
      summaryLines.push(`4. Read \`.codesight/CODESIGHT.md\` for the full context map
`);
      summaryLines.push(`**Do not explore the file tree blindly.** The codesight context map already contains:`);
      summaryLines.push(`routes, schema, components, libraries, config, middleware, and dependency graph.
`);
      summaryLines.push(`**Before modifying any file:** check \`.codesight/graph.md\` for blast radius.`);
      summaryLines.push(`Files with high import counts affect many downstream modules \u2014 change carefully.
`);
      summaryLines.push(`Routes marked \`[inferred]\` were detected via regex and may have lower precision.`);
      summaryLines.push(`If any source file shows \u26A0 in a wiki article, re-run \`npx codesight --wiki\` before proceeding.`);
      await writeFile3(join3(root, "AGENTS.md"), summaryLines.join(`
`));
      return "AGENTS.md";
    }
    default: {
      const generated = await generateAIConfigs(result, root);
      return generated.join(", ") || "all configs already exist";
    }
  }
}
function generateMonorepoContext(packages, outputDirName) {
  const lines = [
    `This is a monorepo with ${packages.length} package${packages.length !== 1 ? "s" : ""} indexed by codesight.`,
    `Read \`.${outputDirName}/CODESIGHT.md\` for the full package index \u2014 it lists every package that has a context file.`,
    ``,
    `Before exploring a package directory, check if \`<package>/.${outputDirName}/CODESIGHT.md\` exists \u2014 faster than grep/find.`,
    `Use \`<package>/.${outputDirName}/deps.md\` to find cross-package dependencies.`,
    ``,
    `Do not crawl the file tree \u2014 use the codesight index instead.`
  ];
  return lines.join(`
`);
}
async function generateMonorepoAIConfigs(root, packages, outputDirName) {
  const generated = [];
  const context = generateMonorepoContext(packages, outputDirName);
  const claudePath = join3(root, "CLAUDE.md");
  if (!await fileExists2(claudePath)) {
    await writeFile3(claudePath, `# Project Context

${context}
`);
    generated.push("CLAUDE.md");
  } else {
    const existing = await readFile2(claudePath, "utf-8");
    if (!existing.includes("codesight") && !existing.includes("CODESIGHT")) {
      await writeFile3(claudePath, existing + `

# AI Context (auto-generated by codesight)

${context}
`);
      generated.push("CLAUDE.md (appended)");
    }
  }
  const cursorPath = join3(root, ".cursorrules");
  if (!await fileExists2(cursorPath)) {
    await writeFile3(cursorPath, `# Project Context

${context}
`);
    generated.push(".cursorrules");
  }
  const copilotDir = join3(root, ".github");
  const copilotPath = join3(copilotDir, "copilot-instructions.md");
  if (!await fileExists2(copilotPath) && await fileExists2(copilotDir)) {
    await writeFile3(copilotPath, `# Project Context

${context}
`);
    generated.push(".github/copilot-instructions.md");
  }
  const codexPath = join3(root, "codex.md");
  if (!await fileExists2(codexPath)) {
    await writeFile3(codexPath, `# Project Context

${context}
`);
    generated.push("codex.md");
  }
  const agentsPath = join3(root, "AGENTS.md");
  if (!await fileExists2(agentsPath)) {
    await writeFile3(agentsPath, `# Project Context

${context}
`);
    generated.push("AGENTS.md");
  }
  const windPath = join3(root, ".windsurfrules");
  if (!await fileExists2(windPath)) {
    await writeFile3(windPath, `# Project Context

${context}
`);
    generated.push(".windsurfrules");
  }
  return generated;
}
var init_ai_config = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/generators/wiki.js
import { mkdir as mkdir2, writeFile as writeFile5, readFile as readFile3 } from "fs/promises";
import { existsSync } from "fs";
import { join as join5 } from "path";
function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowTs() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
function confidenceBadge(c) {
  return c === "regex" ? " `[inferred]`" : "";
}
function domainFromFile(file) {
  if (!file)
    return null;
  const parts = file.replace(/\\/g, "/").split("/");
  let containerIdx = -1;
  for (let i = parts.length - 1;i >= 0; i--) {
    if (["routes", "routers", "handlers", "controllers", "endpoints"].includes(parts[i])) {
      containerIdx = i;
      break;
    }
  }
  if (containerIdx >= 0 && containerIdx + 1 < parts.length) {
    const name = parts[containerIdx + 1].replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt)$/, "");
    const generic2 = new Set(["index", "server", "app", "main", "router", "routes", "api", "handler", "handlers", "base"]);
    if (!generic2.has(name) && name.length > 1)
      return name;
  }
  const basename2 = parts[parts.length - 1].replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt)$/, "");
  const generic = new Set([
    "index",
    "server",
    "app",
    "main",
    "router",
    "routes",
    "api",
    "handler",
    "handlers",
    "rest",
    "cli",
    "server",
    "dashboard"
  ]);
  if (!generic.has(basename2) && basename2.length > 1 && !basename2.startsWith("_")) {
    return basename2;
  }
  return null;
}
function safeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").toLowerCase() || "section";
}
function detectDomains(routes) {
  const buckets = new Map;
  for (const route of routes) {
    const path = route.path.toLowerCase();
    let domain;
    if (route.framework === "trpc") {
      domain = route.path.split(".")[0] || "procedures";
    } else if (path === "/" || /^\/(health|healthz|metrics|status|ping|ready|readyz|live|livez|mcp|sse|messages)(\/|$)/.test(path)) {
      domain = "infra";
    } else if (/\/(auth|login|logout|signup|sign-in|sign-up|sign-out|register|oauth|sso|saml|token|refresh|password|forgot|reset|verify|confirm)(\/|$)/.test(path) || /\/(google|github|discord|twitter|reddit|microsoft|apple)(\/callback)?(\/|$)/.test(path)) {
      domain = "auth";
    } else if (/\/(payment|billing|stripe|polar|lemon|paddle|checkout|subscription|subscribe|invoice|webhook|webhooks|pricing)(\/|$)/.test(path)) {
      domain = "payments";
    } else if (/\/admin(\/|$)/.test(path)) {
      domain = "admin";
    } else {
      const fileDomain = domainFromFile(route.file);
      if (fileDomain) {
        domain = fileDomain;
      } else {
        const segments = route.path.split("/").filter((p) => p && !p.startsWith(":") && !p.startsWith("{") && !p.startsWith("<") && !["api", "v1", "v2", "v3"].includes(p));
        domain = segments[0]?.replace(/_/g, "-") || "api";
      }
    }
    if (!buckets.has(domain))
      buckets.set(domain, []);
    buckets.get(domain).push(route);
  }
  const order = ["auth", "payments"];
  const last = ["infra", "api"];
  const middle = [...buckets.keys()].filter((k) => !order.includes(k) && !last.includes(k)).sort();
  const sorted = [...order, ...middle, ...last].filter((k) => buckets.has(k));
  return sorted.map((name) => ({ name, routes: buckets.get(name) }));
}
function overviewArticle(result) {
  const { project, routes, schemas, components, middleware, config, graph } = result;
  const fw = project.frameworks.join(", ") || "generic";
  const orm = project.orms.join(", ") || "none";
  const lines = [];
  lines.push(`# ${project.name} \u2014 Overview`, "");
  lines.push(`> **Navigation aid.** This article shows WHERE things live (routes, models, files). Read actual source files before implementing new features or making changes.`, "");
  const parts = [`a ${project.language} project built with ${fw}`];
  if (orm !== "none")
    parts.push(`using ${orm} for data persistence`);
  if (project.repoType === "meta")
    parts.push(`organized as a meta-repo (aggregated independent projects)`);
  else if (project.repoType === "microservices")
    parts.push(`organized as a microservices repo`);
  else if (project.isMonorepo)
    parts.push(`organized as a monorepo`);
  lines.push(`**${project.name}** is ${parts.join(", ")}.`, "");
  if (project.isMonorepo && project.workspaces.length > 0) {
    const wsLabel = project.repoType === "meta" ? "Projects" : project.repoType === "microservices" ? "Services" : "Workspaces";
    lines.push(`**${wsLabel}:** ${project.workspaces.map((w) => `\`${w.name}\` (\`${w.path}\`)`).join(", ")}`, "");
  }
  const facts = [];
  if (routes.length > 0)
    facts.push(`${routes.length} API routes`);
  if (schemas.length > 0)
    facts.push(`${schemas.length} database models`);
  if (components.length > 0)
    facts.push(`${components.length} UI components`);
  if (result.libs.length > 0)
    facts.push(`${result.libs.length} library files`);
  if (middleware.length > 0)
    facts.push(`${middleware.length} middleware layers`);
  if (config.envVars.length > 0)
    facts.push(`${config.envVars.length} environment variables`);
  if (facts.length > 0) {
    lines.push("## Scale", "", facts.join(" \xB7 "), "");
  }
  const domains = detectDomains(routes);
  if (domains.length > 0) {
    lines.push("## Subsystems", "");
    for (const d of domains) {
      const allTags = [...new Set(d.routes.flatMap((r) => r.tags))].slice(0, 5);
      const tagStr = allTags.length > 0 ? ` \u2014 touches: ${allTags.join(", ")}` : "";
      const title = d.name.charAt(0).toUpperCase() + d.name.slice(1);
      const slug = safeFilename(d.name);
      lines.push(`- **[${title}](./${slug}.md)** \u2014 ${d.routes.length} routes${tagStr}`);
    }
    lines.push("");
  }
  if (schemas.length > 0) {
    const orms = [...new Set(schemas.map((s) => s.orm))];
    lines.push(`**Database:** ${orms.join(", ")}, ${schemas.length} models \u2014 see [database.md](./database.md)`, "");
  }
  if (components.length > 0) {
    lines.push(`**UI:** ${components.length} components (${project.componentFramework}) \u2014 see [ui.md](./ui.md)`, "");
  }
  if (result.libs.length >= 10) {
    lines.push(`**Libraries:** ${result.libs.length} files \u2014 see [libraries.md](./libraries.md)`, "");
  }
  if (graph.hotFiles.length > 0) {
    lines.push("## High-Impact Files", "");
    lines.push("Changes to these files have the widest blast radius across the codebase:", "");
    for (const hf of graph.hotFiles.slice(0, 6)) {
      lines.push(`- \`${hf.file}\` \u2014 imported by **${hf.importedBy}** files`);
    }
    lines.push("");
  }
  const required = config.envVars.filter((e) => !e.hasDefault);
  if (required.length > 0) {
    lines.push("## Required Environment Variables", "");
    for (const env of required.slice(0, 12)) {
      lines.push(`- \`${env.name}\` \u2014 \`${env.source}\``);
    }
    if (required.length > 12)
      lines.push(`- _...${required.length - 12} more_`);
    lines.push("");
  }
  lines.push("---", `_Back to [index.md](./index.md) \xB7 Generated ${today()}_`);
  return lines.join(`
`);
}
function domainArticle(domain, result, missingFiles = new Set) {
  const { schemas, middleware, graph } = result;
  const title = domain.name.charAt(0).toUpperCase() + domain.name.slice(1);
  const lines = [];
  lines.push(`# ${title}`, "");
  lines.push(`> **Navigation aid.** Route list and file locations extracted via AST. Read the source files listed below before implementing or modifying this subsystem.`, "");
  const allTags = [...new Set(domain.routes.flatMap((r) => r.tags))];
  const services = allTags.filter((t) => ["auth", "db", "cache", "payment", "email", "ai", "queue", "storage", "sms"].includes(t));
  if (services.length > 0) {
    lines.push(`The ${title} subsystem handles **${domain.routes.length} routes** and touches: ${services.join(", ")}.`, "");
  } else {
    lines.push(`The ${title} subsystem handles **${domain.routes.length} routes**.`, "");
  }
  lines.push("## Routes", "");
  for (const route of domain.routes) {
    const tags = route.tags.length > 0 ? ` [${route.tags.join(", ")}]` : "";
    const params = route.params && route.params.length > 0 ? ` params(${route.params.join(", ")})` : "";
    const contract = [];
    if (route.requestType)
      contract.push(`in: ${route.requestType}`);
    if (route.responseType)
      contract.push(`out: ${route.responseType}`);
    const contractStr = contract.length > 0 ? ` \u2192 ${contract.join(", ")}` : "";
    const mwChain = route.middleware && route.middleware.length > 0 ? ` \u2192 middleware: ${route.middleware.join(" \u2192 ")}` : "";
    const badge = confidenceBadge(route.confidence);
    const fileWarning = route.file && missingFiles.has(route.file) ? " \u26A0 _file not found \u2014 wiki stale, re-run `npx codesight --wiki`_" : "";
    lines.push(`- \`${route.method}\` \`${route.path}\`${params}${contractStr}${tags}${mwChain}${badge}`);
    lines.push(`  \`${route.file || "unknown"}\`${fileWarning}`);
  }
  lines.push("");
  const mwTypes = [];
  if (domain.name === "auth")
    mwTypes.push("auth");
  if (domain.name === "payments")
    mwTypes.push("validation");
  const relatedMw = middleware.filter((m) => mwTypes.includes(m.type));
  if (relatedMw.length > 0) {
    lines.push("## Middleware", "");
    for (const mw of relatedMw) {
      lines.push(`- **${mw.name}** (${mw.type}) \u2014 \`${mw.file}\``);
    }
    lines.push("");
  }
  const domainKeywords = domain.name.split(/[-_]/).filter((k) => k.length >= 4);
  const relatedModels = schemas.filter((s) => {
    if (s.name.startsWith("enum:"))
      return false;
    const modelWords = s.name.toLowerCase().split(/[_\-\s]/);
    return domainKeywords.some((kw) => modelWords.includes(kw));
  }).slice(0, 6);
  if (relatedModels.length > 0) {
    lines.push("## Related Models", "");
    for (const m of relatedModels) {
      lines.push(`- **${m.name}** (${m.fields.length} fields) \u2192 [database.md](./database.md)`);
    }
    lines.push("");
  }
  const domainFiles = [...new Set(domain.routes.map((r) => r.file))];
  const hotInDomain = graph.hotFiles.filter((hf) => domainFiles.includes(hf.file));
  if (hotInDomain.length > 0) {
    lines.push("## High-Impact Files", "");
    for (const hf of hotInDomain) {
      lines.push(`- \`${hf.file}\` \u2014 imported by ${hf.importedBy} files`);
    }
    lines.push("");
  }
  const sourceFiles = [...new Set(domain.routes.map((r) => r.file).filter(Boolean))];
  if (sourceFiles.length > 0) {
    lines.push("## Source Files", "");
    lines.push("Read these before implementing or modifying this subsystem:");
    for (const f of sourceFiles) {
      const stale = missingFiles.has(f) ? " \u26A0 _not found \u2014 re-run `npx codesight --wiki`_" : "";
      lines.push(`- \`${f}\`${stale}`);
    }
    lines.push("");
  }
  lines.push("---", `_Back to [overview.md](./overview.md)_`);
  return lines.join(`
`);
}
function databaseArticle(result) {
  const { schemas, graph } = result;
  const lines = [];
  lines.push("# Database", "");
  lines.push(`> **Navigation aid.** Schema shapes and field types extracted via AST. Read the actual schema source files before writing migrations or query logic.`, "");
  if (schemas.length === 0) {
    lines.push("No database models detected.");
    return lines.join(`
`);
  }
  const orms = [...new Set(schemas.map((s) => s.orm))];
  lines.push(`**${orms.join(", ")}** \u2014 ${schemas.length} models`, "");
  const byOrm = new Map;
  for (const model of schemas) {
    if (!byOrm.has(model.orm))
      byOrm.set(model.orm, []);
    byOrm.get(model.orm).push(model);
  }
  for (const [orm, models] of byOrm) {
    if (byOrm.size > 1) {
      lines.push(`## ${orm}`, "");
    }
    for (const model of models) {
      if (model.name.startsWith("enum:")) {
        const name = model.name.replace("enum:", "");
        const values = model.fields.map((f) => f.name).join(" | ");
        lines.push(`### enum ${name}`, "", values, "");
        continue;
      }
      lines.push(`### ${model.name}${confidenceBadge(model.confidence)}`, "");
      const pkField = model.fields.find((f) => f.flags.includes("pk"));
      const fkFields = model.fields.filter((f) => f.flags.includes("fk"));
      const meta = [];
      if (pkField)
        meta.push(`pk: \`${pkField.name}\` (${pkField.type})`);
      if (fkFields.length > 0)
        meta.push(`fk: ${fkFields.map((f) => f.name).join(", ")}`);
      if (meta.length > 0)
        lines.push(meta.join(" \xB7 "), "");
      for (const field of model.fields) {
        const flags = field.flags.length > 0 ? ` _(${field.flags.join(", ")})_` : "";
        lines.push(`- \`${field.name}\`: ${field.type}${flags}`);
      }
      if (model.relations.length > 0) {
        lines.push(`- _relations_: ${model.relations.join(", ")}`);
      }
      lines.push("");
    }
  }
  const dbSourceFiles = graph.hotFiles.filter((hf) => /\/(db|schema|model|drizzle|prisma|migrate)/.test(hf.file.toLowerCase()));
  if (dbSourceFiles.length > 0) {
    lines.push("## Schema Source Files", "");
    lines.push("Read and edit these files when adding columns, creating migrations, or changing relations:", "");
    for (const hf of dbSourceFiles) {
      lines.push(`- \`${hf.file}\` \u2014 imported by **${hf.importedBy}** files`);
    }
    lines.push("");
  } else {
    lines.push("## Schema Source Files", "");
    lines.push("Search for ORM schema declarations:");
    lines.push("- Drizzle: `pgTable` / `mysqlTable` / `sqliteTable`");
    lines.push("- Prisma: `prisma/schema.prisma`");
    lines.push("- TypeORM: `@Entity()` decorator");
    lines.push("- SQLAlchemy: class inheriting `Base`");
    lines.push("");
  }
  lines.push("---", `_Back to [overview.md](./overview.md)_`);
  return lines.join(`
`);
}
function uiArticle(result) {
  const { components, project } = result;
  const lines = [];
  lines.push("# UI", "");
  lines.push(`> **Navigation aid.** Component inventory and prop signatures extracted via AST. Read the source files before adding props or modifying component logic.`, "");
  lines.push(`**${components.length} components** (${project.componentFramework})`, "");
  const clientComponents = components.filter((c) => c.isClient);
  const serverComponents = components.filter((c) => c.isServer);
  const shared = components.filter((c) => !c.isClient && !c.isServer);
  if (serverComponents.length > 0) {
    lines.push("## Server Components", "");
    for (const c of serverComponents) {
      const props = c.props.length > 0 ? ` \u2014 props: ${c.props.join(", ")}` : "";
      lines.push(`- **${c.name}**${props} \u2014 \`${c.file}\``);
    }
    lines.push("");
  }
  if (clientComponents.length > 0) {
    lines.push("## Client Components", "");
    for (const c of clientComponents) {
      const props = c.props.length > 0 ? ` \u2014 props: ${c.props.join(", ")}` : "";
      lines.push(`- **${c.name}**${props} \u2014 \`${c.file}\``);
    }
    lines.push("");
  }
  if (shared.length > 0) {
    lines.push("## Components", "");
    for (const c of shared) {
      const props = c.props.length > 0 ? ` \u2014 props: ${c.props.join(", ")}` : "";
      lines.push(`- **${c.name}**${props} \u2014 \`${c.file}\``);
    }
    lines.push("");
  }
  lines.push("---", `_Back to [overview.md](./overview.md)_`);
  return lines.join(`
`);
}
function libGroupKey(file) {
  const parts = file.replace(/\\/g, "/").split("/");
  const GENERIC = new Set(["src", "lib", "source", "packages", "apps", "modules", "core", "internal"]);
  if (parts.length >= 2 && GENERIC.has(parts[0]))
    return parts[1];
  return parts[0];
}
function librariesArticle(libs) {
  const lines = [];
  lines.push("# Libraries", "");
  lines.push(`> **Navigation aid.** Library inventory extracted via AST. Read the source files listed here before modifying exported functions.`, "");
  const groups = new Map;
  for (const lib of libs) {
    const key = libGroupKey(lib.file);
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key).push(lib);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  lines.push(`**${libs.length} library files** across ${sorted.length} module${sorted.length !== 1 ? "s" : ""}`, "");
  for (const [group, files] of sorted) {
    const title = group.charAt(0).toUpperCase() + group.slice(1);
    lines.push(`## ${title} (${files.length} files)`, "");
    const byExports = [...files].sort((a, b) => b.exports.length - a.exports.length);
    const shown = byExports.slice(0, 25);
    for (const lib of shown) {
      const topExports = lib.exports.slice(0, 6).map((e) => e.name).join(", ");
      const exStr = topExports ? ` \u2014 ${topExports}${lib.exports.length > 6 ? ", \u2026" : ""}` : "";
      lines.push(`- \`${lib.file}\`${exStr}`);
    }
    if (byExports.length > 25)
      lines.push(`- _\u2026and ${byExports.length - 25} more files_`);
    lines.push("");
  }
  lines.push("---", `_Back to [overview.md](./overview.md)_`);
  return lines.join(`
`);
}
function indexFile(result, articles) {
  const { project, routes, schemas, components, config } = result;
  const lines = [];
  lines.push(`# ${project.name} \u2014 Wiki`, "");
  lines.push(`_Generated ${today()} \u2014 re-run \`npx codesight --wiki\` if the codebase has changed._`, "");
  lines.push(`Structural map compiled from source code via AST. No LLM \u2014 deterministic, 200ms.`, "");
  lines.push(`> **How to use safely:** These articles tell you WHERE things live and WHAT exists. They do not show full implementation logic. Always read the actual source files before implementing new features or making changes. Never infer how a function works from the wiki alone.`, "");
  lines.push("## Articles", "");
  for (const article of ["overview.md", ...articles.filter((a) => a !== "overview.md")]) {
    const name = article.replace(".md", "");
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`- [${title}](./${article})`);
  }
  lines.push("");
  lines.push("## Quick Stats", "");
  lines.push(`- Routes: **${routes.length}**`);
  lines.push(`- Models: **${schemas.length}**`);
  lines.push(`- Components: **${components.length}**`);
  const req = config.envVars.filter((e) => !e.hasDefault).length;
  const opt = config.envVars.filter((e) => e.hasDefault).length;
  lines.push(`- Env vars: **${req}** required, **${opt}** with defaults`);
  lines.push("");
  lines.push("## How to Use", "");
  lines.push("- **New session:** read `index.md` (this file) for orientation \u2014 WHERE things are");
  lines.push("- **Architecture question:** read `overview.md` (~500 tokens)");
  lines.push("- **Domain question:** read the relevant article, then **read those source files**");
  if (articles.includes("database.md")) {
    lines.push("- **Database question:** read `database.md`, then read the actual schema files");
  }
  if (articles.includes("libraries.md")) {
    lines.push("- **Library question:** read `libraries.md`, then read the listed source files");
  }
  lines.push("- **Before implementing anything:** read the source files listed in the article");
  lines.push("- **Full source context:** read `.codesight/CODESIGHT.md`");
  lines.push("");
  lines.push("## What the Wiki Does Not Cover", "");
  lines.push("These exist in your codebase but are **not** reflected in wiki articles:");
  lines.push("- Routes registered dynamically at runtime (loops, plugin factories, `app.use(dynamicRouter)`)");
  lines.push("- Internal routes from npm packages (e.g. Better Auth's built-in `/api/auth/*` endpoints)");
  lines.push("- WebSocket and SSE handlers");
  lines.push("- Raw SQL tables not declared through an ORM");
  lines.push("- Computed or virtual fields absent from schema declarations");
  lines.push("- TypeScript types that are not actual database columns");
  lines.push("- Routes marked `[inferred]` were detected via regex and may have lower precision");
  lines.push("- gRPC, tRPC, and GraphQL resolvers may be partially captured");
  lines.push("");
  lines.push("When in doubt, search the source. The wiki is a starting point, not a complete inventory.", "");
  lines.push("---", `_Last compiled: ${today()} \xB7 ${articles.length + 1} articles \xB7 [codesight](https://github.com/Houseofmvps/codesight)_`);
  return lines.join(`
`);
}
async function appendLog(logPath, entry) {
  const newEntry = `## [${nowTs()}] ${entry}`;
  let existing = "";
  try {
    existing = await readFile3(logPath, "utf-8");
  } catch {}
  const entries = existing.split(/\n(?=## \[)/).map((e) => e.trim()).filter((e) => e.startsWith("## ["));
  const recent = entries.slice(-19);
  recent.push(newEntry);
  const header = `# Wiki Log

History of \`npx codesight --wiki\` runs. Capped at 20 entries.

`;
  await writeFile5(logPath, header + recent.join(`

`) + `
`);
}
async function generateWiki(result, outputDir) {
  const wikiDir = join5(outputDir, "wiki");
  await mkdir2(wikiDir, { recursive: true });
  const projectRoot = result.project.root;
  const missingFiles = new Set;
  for (const route of result.routes) {
    if (route.file) {
      const abs = route.file.startsWith("/") ? route.file : join5(projectRoot, route.file);
      if (!existsSync(abs))
        missingFiles.add(route.file);
    }
  }
  const articles = [];
  let totalChars = 0;
  const overview = overviewArticle(result);
  await writeFile5(join5(wikiDir, "overview.md"), overview);
  articles.push("overview.md");
  totalChars += overview.length;
  if (result.schemas.length > 0) {
    const db = databaseArticle(result);
    await writeFile5(join5(wikiDir, "database.md"), db);
    articles.push("database.md");
    totalChars += db.length;
  }
  const domains = detectDomains(result.routes);
  const usedSlugs = new Set(articles);
  for (const domain of domains) {
    const content = domainArticle(domain, result, missingFiles);
    let slug = safeFilename(domain.name);
    let filename = `${slug}.md`;
    let n = 2;
    while (usedSlugs.has(filename)) {
      filename = `${slug}-${n++}.md`;
    }
    usedSlugs.add(filename);
    await writeFile5(join5(wikiDir, filename), content);
    articles.push(filename);
    totalChars += content.length;
  }
  if (result.components.length > 0) {
    const ui = uiArticle(result);
    await writeFile5(join5(wikiDir, "ui.md"), ui);
    articles.push("ui.md");
    totalChars += ui.length;
  }
  const LIB_THRESHOLD = 10;
  if (result.libs.length >= LIB_THRESHOLD) {
    const lib = librariesArticle(result.libs);
    await writeFile5(join5(wikiDir, "libraries.md"), lib);
    articles.push("libraries.md");
    totalChars += lib.length;
  }
  const index = indexFile(result, articles);
  await writeFile5(join5(wikiDir, "index.md"), index);
  totalChars += index.length;
  const logPath = join5(wikiDir, "log.md");
  const logEntry = `scan | ${result.routes.length} routes, ${result.schemas.length} models, ${result.components.length} components \u2192 ${articles.length + 1} articles`;
  await appendLog(logPath, logEntry);
  const tokenEstimate = Math.round(totalChars / 4);
  return { articles, wikiDir, tokenEstimate };
}
async function readWikiArticle(outputDir, article) {
  const { readFile: readFile4 } = await import("fs/promises");
  const { resolve, sep } = await import("path");
  const name = article.endsWith(".md") ? article : `${article}.md`;
  const wikiDir = resolve(outputDir, "wiki");
  const resolved = resolve(wikiDir, name);
  if (!resolved.startsWith(wikiDir + sep) && resolved !== wikiDir)
    return null;
  try {
    return await readFile4(resolved, "utf-8");
  } catch {
    return null;
  }
}
async function listWikiArticles(outputDir) {
  const { readdir: readdir2 } = await import("fs/promises");
  try {
    const files = await readdir2(join5(outputDir, "wiki"));
    return files.filter((f) => f.endsWith(".md") && f !== "log.md");
  } catch {
    return [];
  }
}
async function lintWiki(result, outputDir) {
  const { readFile: readFile4 } = await import("fs/promises");
  const wikiDir = join5(outputDir, "wiki");
  const articles = await listWikiArticles(outputDir);
  if (articles.length === 0) {
    return "Wiki not generated yet. Run `npx codesight --wiki` first.";
  }
  const issues = [];
  const suggestions = [];
  let indexContent = "";
  try {
    indexContent = await readFile4(join5(wikiDir, "index.md"), "utf-8");
  } catch {}
  for (const article of articles) {
    if (article === "index.md")
      continue;
    if (!indexContent.includes(article)) {
      issues.push(`Orphan: \`${article}\` not linked from index.md`);
    }
  }
  for (const article of articles) {
    if (article === "index.md" || article === "overview.md")
      continue;
    try {
      const content = await readFile4(join5(wikiDir, article), "utf-8");
      if (!content.includes("overview.md")) {
        issues.push(`Missing backlink: \`${article}\` does not link to overview.md`);
      }
    } catch {}
  }
  if (result.schemas.length > 0 && !articles.includes("database.md")) {
    suggestions.push("Suggestion: schema models found but database.md missing \u2014 re-run `--wiki`");
  }
  if (result.components.length > 0 && !articles.includes("ui.md")) {
    suggestions.push("Suggestion: UI components found but ui.md missing \u2014 re-run `--wiki`");
  }
  const lines = [];
  lines.push(`## Wiki Health Check`);
  lines.push(`Articles: ${articles.length} | Issues: ${issues.length} | Suggestions: ${suggestions.length}`);
  lines.push("");
  if (issues.length === 0 && suggestions.length === 0) {
    lines.push("Wiki is healthy. All articles are cross-linked.");
  } else {
    for (const issue of issues)
      lines.push(`- ${issue}`);
    for (const s of suggestions)
      lines.push(`- ${s}`);
  }
  return lines.join(`
`);
}
var init_wiki = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/config.js
import { readFile as readFile4, stat as stat3 } from "fs/promises";
import { join as join6 } from "path";
import { pathToFileURL } from "url";
async function fileExists3(path) {
  try {
    await stat3(path);
    return true;
  } catch {
    return false;
  }
}
async function loadConfig(root) {
  for (const filename of CONFIG_FILES) {
    const configPath = join6(root, filename);
    if (!await fileExists3(configPath))
      continue;
    try {
      const content = await readFile4(configPath, "utf-8");
      if (filename.endsWith(".json"))
        return JSON.parse(content);
      const parsed = safeParseConfigText(content);
      if (Object.keys(parsed).length > 0)
        return parsed;
      console.warn(`  Warning: ignored ${filename}: only JSON or static export default object literals are supported`);
      return {};
    } catch (err) {
      console.warn(`  Warning: failed to load ${filename}: ${err.message}`);
      return {};
    }
  }
  try {
    const pkgPath = join6(root, "package.json");
    if (await fileExists3(pkgPath)) {
      const pkg = JSON.parse(await readFile4(pkgPath, "utf-8"));
      if (pkg.codesight && typeof pkg.codesight === "object") {
        return pkg.codesight;
      }
    }
  } catch {}
  return {};
}
function safeParseConfigText(content) {
  const config = {};
  const match = content.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/m);
  if (!match)
    return config;
  const body = match[1];
  function extractString(field) {
    const m = body.match(new RegExp(`\\b${field}\\s*:\\s*['"\`]([^'"\`]*?)['"\`]`));
    return m ? m[1] : undefined;
  }
  function extractNumber(field) {
    const m = body.match(new RegExp(`\\b${field}\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : undefined;
  }
  function extractBoolean(field) {
    const m = body.match(new RegExp(`\\b${field}\\s*:\\s*(true|false)`));
    return m ? m[1] === "true" : undefined;
  }
  function extractStringArray(field) {
    const m = body.match(new RegExp(`\\b${field}\\s*:\\s*\\[([^\\]]*?)\\]`));
    if (!m)
      return;
    const items = m[1].match(/['"`]([^'"`]*?)['"`]/g);
    return items ? items.map((s) => s.slice(1, -1)) : [];
  }
  const maxDepth = extractNumber("maxDepth");
  if (maxDepth !== undefined)
    config.maxDepth = maxDepth;
  const outputDir = extractString("outputDir");
  if (outputDir !== undefined)
    config.outputDir = outputDir;
  const profile = extractString("profile");
  if (profile !== undefined)
    config.profile = profile;
  const blastRadiusDepth = extractNumber("blastRadiusDepth");
  if (blastRadiusDepth !== undefined)
    config.blastRadiusDepth = blastRadiusDepth;
  const hotFileThreshold = extractNumber("hotFileThreshold");
  if (hotFileThreshold !== undefined)
    config.hotFileThreshold = hotFileThreshold;
  const maxTokens = extractNumber("maxTokens");
  if (maxTokens !== undefined)
    config.maxTokens = maxTokens;
  const collapseCrud = extractBoolean("collapseCrud");
  if (collapseCrud !== undefined)
    config.collapseCrud = collapseCrud;
  const disableDetectors = extractStringArray("disableDetectors");
  if (disableDetectors !== undefined)
    config.disableDetectors = disableDetectors;
  const ignorePatterns = extractStringArray("ignorePatterns");
  if (ignorePatterns !== undefined)
    config.ignorePatterns = ignorePatterns;
  const nativeAst = extractNativeAst(body);
  if (nativeAst !== undefined)
    config.nativeAst = nativeAst;
  return config;
}
function extractNativeAst(body) {
  const block = body.match(/\bnativeAst\s*:\s*\{([\s\S]*?)\}/);
  if (!block)
    return;
  const sub = block[1];
  const cfg = {};
  const enabled = sub.match(/\benabled\s*:\s*(?:(true|false)|['"`](strict)['"`])/);
  if (enabled)
    cfg.enabled = enabled[2] ? "strict" : enabled[1] === "true";
  const langs = sub.match(/\blanguages\s*:\s*\[([^\]]*?)\]/);
  if (langs) {
    const items = langs[1].match(/['"`]([^'"`]+)['"`]/g);
    if (items)
      cfg.languages = items.map((s) => s.slice(1, -1));
  }
  const pluginDir = sub.match(/\bpluginDir\s*:\s*['"`]([^'"`]+)['"`]/);
  if (pluginDir)
    cfg.pluginDir = pluginDir[1];
  return Object.keys(cfg).length > 0 ? cfg : undefined;
}
async function loadTsConfig(configPath, _root) {
  const content = await readFile4(configPath, "utf-8");
  const parsed = safeParseConfigText(content);
  if (Object.keys(parsed).length > 0)
    return parsed;
  console.warn(`  Warning: ignored codesight.config.ts: only static export default object literals are supported`);
  return {};
}
function mergeCliConfig(config, cli) {
  return {
    ...config,
    maxDepth: cli.maxDepth ?? config.maxDepth,
    outputDir: cli.outputDir ?? config.outputDir,
    profile: cli.profile ?? config.profile,
    maxTokens: cli.maxTokens ?? config.maxTokens,
    nativeAst: cli.nativeAst ?? config.nativeAst
  };
}
var CONFIG_FILES;
var init_config = __esm(() => {
  CONFIG_FILES = [
    "codesight.config.ts",
    "codesight.config.js",
    "codesight.config.mjs",
    "codesight.config.json"
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/wasm/plugin-host.js
import { existsSync as existsSync2, readFileSync, readdirSync } from "fs";
import { join as join7 } from "path";
import { createRequire } from "module";
function listPluginFiles(pluginDirs) {
  const seen = new Set;
  const out = [];
  for (const dir of pluginDirs) {
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const name of entries) {
      const m = PLUGIN_FILENAME.exec(name);
      if (!m)
        continue;
      const lang = m[1];
      if (seen.has(lang))
        continue;
      seen.add(lang);
      out.push({ lang, path: join7(dir, name) });
    }
  }
  return out;
}
function suppressWasiExperimentalWarning() {
  if (wasiWarningSuppressed)
    return;
  wasiWarningSuppressed = true;
  const original = process.emitWarning.bind(process);
  process.emitWarning = (warning, ...args) => {
    const opt = args[0];
    const type = opt && typeof opt === "object" ? opt.type : opt;
    const message = typeof warning === "string" ? warning : warning?.message ?? "";
    if (type === "ExperimentalWarning" && String(message).includes("WASI"))
      return;
    return original(warning, ...args);
  };
}
function loadPlugin(lang, pluginDirs) {
  if (providerOverride)
    return providerOverride(lang, pluginDirs);
  const wasmName = `codesight-${lang}-${CAPABILITY}.wasm`;
  let wasmPath = null;
  for (const dir of pluginDirs) {
    const candidate = join7(dir, wasmName);
    if (existsSync2(candidate)) {
      wasmPath = candidate;
      break;
    }
  }
  if (!wasmPath)
    return null;
  if (cache.has(wasmPath))
    return cache.get(wasmPath) ?? null;
  let loaded = null;
  try {
    const bytes = readFileSync(wasmPath);
    const module = new WebAssembly.Module(bytes);
    suppressWasiExperimentalWarning();
    const { WASI } = nodeRequire("node:wasi");
    const wasi = new WASI({ version: "preview1" });
    const instance = new WebAssembly.Instance(module, wasi.getImportObject());
    if (typeof instance.exports._initialize === "function") {
      wasi.initialize(instance);
    }
    loaded = bindExports(instance.exports);
  } catch {
    loaded = null;
  }
  cache.set(wasmPath, loaded);
  return loaded;
}
function bindExports(rawExports) {
  const ex = rawExports;
  if (!(ex.memory instanceof WebAssembly.Memory))
    return null;
  if (typeof ex.alloc !== "function" || typeof ex.dealloc !== "function")
    return null;
  if (typeof ex.contractVersion !== "function")
    return null;
  let version;
  try {
    version = Number(ex.contractVersion());
  } catch {
    return null;
  }
  if (version !== CONTRACT_VERSION)
    return null;
  const dec = new TextDecoder;
  const enc = new TextEncoder;
  const readPacked = (packed) => {
    const p = BigInt(packed);
    const outPtr = Number(BigInt.asUintN(32, p >> 32n));
    const outLen = Number(BigInt.asUintN(32, p));
    if (outLen === 0)
      return null;
    const json = dec.decode(new Uint8Array(ex.memory.buffer, outPtr, outLen));
    ex.dealloc(outPtr, outLen);
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };
  const bind = (fn) => (source) => {
    const bytes = enc.encode(source);
    const ptr = ex.alloc(bytes.length) >>> 0;
    new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
    let packed;
    try {
      packed = fn(ptr, bytes.length);
    } finally {
      ex.dealloc(ptr, bytes.length);
    }
    return readPacked(packed);
  };
  const plugin = {};
  if (typeof ex.parseRoutes === "function")
    plugin.routes = bind(ex.parseRoutes);
  if (typeof ex.parseSchemas === "function")
    plugin.schemas = bind(ex.parseSchemas);
  if (typeof ex.parseImports === "function")
    plugin.imports = bind(ex.parseImports);
  if (typeof ex.describe === "function") {
    try {
      const meta = readPacked(ex.describe());
      if (meta && typeof meta === "object")
        plugin.metadata = meta;
    } catch {}
  }
  return plugin;
}
var nodeRequire, CAPABILITY = "ast", CONTRACT_VERSION = 1, PLUGIN_FILENAME, providerOverride = null, cache, wasiWarningSuppressed = false;
var init_plugin_host = __esm(() => {
  nodeRequire = createRequire(import.meta.url);
  PLUGIN_FILENAME = /^codesight-([a-z0-9_-]+)-ast\.wasm$/;
  cache = new Map;
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/native-loader.js
import { homedir } from "os";
import { join as join8, resolve, isAbsolute } from "path";
import { fileURLToPath } from "url";
function resolveNativeAst(cfg, projectRoot) {
  if (!cfg || !cfg.enabled)
    return DISABLED;
  const cached = resolvedCache.get(cfg);
  if (cached)
    return cached;
  const languages = new Set(cfg.languages ?? []);
  const resolved = {
    mode: cfg.enabled === "strict" ? "strict" : "on",
    languages,
    authoritative: languages.size > 0,
    pluginDirs: defaultPluginDirs(projectRoot, cfg.pluginDir),
    diagnostics: [],
    warnings: []
  };
  resolvedCache.set(cfg, resolved);
  return resolved;
}
function defaultPluginDirs(projectRoot, override) {
  const dirs = [];
  if (override) {
    dirs.push(isAbsolute(override) ? override : resolve(projectRoot, override));
  }
  dirs.push(join8(homedir(), ".codesight", "plugins"));
  const xdgData = process.env.XDG_DATA_HOME || join8(homedir(), ".local", "share");
  dirs.push(join8(xdgData, "codesight", "plugins"));
  try {
    const here = fileURLToPath(import.meta.url);
    dirs.push(resolve(here, "..", "..", "..", "plugins"));
  } catch {}
  return dirs;
}
function buildNativeRegistry(r) {
  const byExt = new Map;
  if (r.mode === false)
    return { byExt };
  const candidates = r.authoritative ? [...r.languages] : listPluginFiles(r.pluginDirs).map((f) => f.lang);
  for (const requested of candidates) {
    const loaded = loadPlugin(requested, r.pluginDirs);
    if (!loaded) {
      if (r.mode === "strict")
        recordUnavailableLang(r, requested);
      continue;
    }
    const reported = typeof loaded.metadata?.languageId === "string" ? loaded.metadata.languageId : undefined;
    const lang = reported && reported.length > 0 ? reported : requested;
    if (reported && reported.length > 0 && reported !== requested) {
      addWarning(r, `plugin "codesight-${requested}-ast.wasm" self-reports languageId "${reported}" \u2014 honoring "${reported}" (rename the file to match for explicit --native-ast=${reported})`);
      if (r.authoritative && !r.languages.has(lang)) {
        if (r.mode === "strict")
          recordUnavailableLang(r, requested);
        continue;
      }
    }
    const declared = Array.isArray(loaded.metadata?.extensions) ? loaded.metadata.extensions.filter((e) => typeof e === "string") : undefined;
    const exts = (declared && declared.length > 0 ? declared : DEFAULT_EXTENSIONS[lang]) ?? [];
    if (exts.length === 0) {
      if (r.mode === "strict") {
        r.diagnostics.push({
          lang,
          kind: "routes",
          reason: "no extensions declared (describe().extensions is required for non-built-in languages)"
        });
      }
      continue;
    }
    const entry = { lang, authoritative: r.authoritative, plugin: adaptPlugin(loaded) };
    for (const raw of exts) {
      const ext = (raw.startsWith(".") ? raw : "." + raw).toLowerCase();
      const existing = byExt.get(ext);
      if (!existing || existing.lang === entry.lang) {
        byExt.set(ext, entry);
        continue;
      }
      const winner = resolveCollision(existing, entry);
      byExt.set(ext, winner);
      addWarning(r, `extension "${ext}" claimed by both "${existing.lang}" and "${entry.lang}" \u2014 using "${winner.lang}"`);
    }
  }
  return { byExt };
}
function resolveCollision(existing, candidate) {
  if (candidate.authoritative && !existing.authoritative)
    return candidate;
  return existing;
}
function recordParseError(r, lang, kind, file, err) {
  if (r.mode !== "strict")
    return;
  r.diagnostics.push({ lang, kind, file, reason: errMessage(err) });
}
function reportNativeDiagnostics(diagnostics) {
  if (diagnostics.length === 0)
    return "";
  const lines = [
    `  Native-AST (strict): ${diagnostics.length} place(s) where a WASM plugin was expected but did not run:`
  ];
  for (const d of diagnostics) {
    lines.push(`    - ${d.lang}/${d.kind}${d.file ? ` (${d.file})` : ""}: ${d.reason}`);
  }
  return lines.join(`
`);
}
function recordUnavailableLang(r, lang) {
  const dup = r.diagnostics.some((d) => d.lang === lang && !d.file && d.reason === "plugin unavailable");
  if (!dup)
    r.diagnostics.push({ lang, kind: "routes", reason: "plugin unavailable" });
}
function addWarning(r, message) {
  if (!r.warnings.includes(message))
    r.warnings.push(message);
}
function adaptPlugin(loaded) {
  const np = {};
  if (loaded.routes) {
    np.routes = (file, content, framework, tags) => {
      const raw = loaded.routes(content);
      if (!Array.isArray(raw))
        return null;
      return raw.map((x) => {
        const path = String(x?.path ?? "");
        return {
          method: String(x?.method ?? "ALL"),
          path,
          file,
          tags,
          framework,
          params: Array.isArray(x?.params) ? x.params.map(String) : extractPathParams(path),
          confidence: "native",
          ...Array.isArray(x?.middleware) ? { middleware: x.middleware.map(String) } : {}
        };
      });
    };
  }
  if (loaded.schemas) {
    np.schemas = (_file, content) => {
      const raw = loaded.schemas(content);
      if (!Array.isArray(raw))
        return null;
      return raw.map((m) => ({
        name: String(m?.name ?? ""),
        fields: (Array.isArray(m?.fields) ? m.fields : []).map((f) => ({
          name: String(f?.name ?? ""),
          type: String(f?.type ?? "unknown"),
          flags: Array.isArray(f?.flags) ? f.flags.map(String) : []
        })),
        relations: (Array.isArray(m?.relations) ? m.relations : []).map(String),
        orm: m?.orm ?? "unknown",
        confidence: "native"
      }));
    };
  }
  if (loaded.imports) {
    np.imports = (file, content) => {
      const raw = loaded.imports(content);
      if (!Array.isArray(raw))
        return null;
      return raw.map((x) => ({
        from: file,
        to: typeof x === "string" ? x : String(x?.to ?? "")
      }));
    };
  }
  return np;
}
function extractPathParams(path) {
  const params = [];
  const regex = /[:{<](?:\w+:)?(\w+)[}>]?/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function errMessage(err) {
  if (err instanceof Error)
    return err.message;
  return String(err);
}
var DISABLED, DEFAULT_EXTENSIONS, resolvedCache;
var init_native_loader = __esm(() => {
  init_plugin_host();
  DISABLED = {
    mode: false,
    languages: new Set,
    authoritative: false,
    pluginDirs: [],
    diagnostics: [],
    warnings: []
  };
  DEFAULT_EXTENSIONS = {
    rust: [".rs"],
    go: [".go"],
    python: [".py"]
  };
  resolvedCache = new WeakMap;
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/loader.js
import { createRequire as createRequire2 } from "module";
import { readdirSync as readdirSync2 } from "fs";
import { join as join9 } from "path";
function loadTypeScript(projectRoot) {
  if (cached !== undefined && cachedRoot === projectRoot)
    return cached;
  cachedRoot = projectRoot;
  try {
    const req = createRequire2(join9(projectRoot, "package.json"));
    cached = req("typescript");
    return cached;
  } catch {}
  try {
    const directPath = join9(projectRoot, "node_modules", "typescript");
    const req = createRequire2(join9(directPath, "package.json"));
    cached = req(directPath);
    return cached;
  } catch {}
  try {
    const pnpmDir = join9(projectRoot, "node_modules", ".pnpm");
    const entries = readdirSync2(pnpmDir);
    const tsDir = entries.find((e) => e.startsWith("typescript@"));
    if (tsDir) {
      const tsPath = join9(pnpmDir, tsDir, "node_modules", "typescript");
      const req = createRequire2(join9(tsPath, "package.json"));
      cached = req(tsPath);
      return cached;
    }
  } catch {}
  cached = null;
  return null;
}
function parseSourceFile(ts, fileName, content) {
  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
}
function getDecorators(ts, node) {
  if (node.decorators)
    return Array.from(node.decorators);
  if (node.modifiers) {
    return node.modifiers.filter((m) => m.kind === ts.SyntaxKind.Decorator);
  }
  return [];
}
function parseDecorator(ts, sf, decorator) {
  const SK = ts.SyntaxKind;
  const expr = decorator.expression;
  if (!expr)
    return { name: "", arg: null };
  if (expr.kind === SK.CallExpression) {
    const callee = expr.expression;
    const name = callee.kind === SK.Identifier ? callee.getText(sf) : "";
    let arg = null;
    if (expr.arguments?.length > 0) {
      const first = expr.arguments[0];
      if (first.kind === SK.StringLiteral || first.kind === SK.NoSubstitutionTemplateLiteral) {
        arg = first.text;
      }
    }
    return { name, arg };
  }
  if (expr.kind === SK.Identifier) {
    return { name: expr.getText(sf), arg: null };
  }
  return { name: "", arg: null };
}
function getText(sf, node) {
  try {
    return node.getText(sf);
  } catch {
    return node.escapedText || node.text || "";
  }
}
var cached = undefined, cachedRoot = "";
var init_loader = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/route-tags.js
function stripCommentsForTags(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/(^|\s)#.*$/gm, "$1");
}
function detectTags(content) {
  const stripped = stripCommentsForTags(content);
  const tags = [];
  for (const [tag, patterns] of TAG_PATTERNS) {
    if (patterns.some((p) => p.test(stripped))) {
      tags.push(tag);
    }
  }
  return tags;
}
function detectTagsScoped(content, starts) {
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : Math.min(content.length, start + MAX_SCOPE_CHARS);
    return detectTags(content.slice(start, end));
  });
}
function detectTagsForLineSpan(lines, startLine, endLine) {
  const from = Math.max(0, startLine - 1);
  const to = Math.min(lines.length, Math.max(from + 1, endLine));
  return detectTags(lines.slice(from, to).join(`
`));
}
var TAG_PATTERNS, MAX_SCOPE_CHARS = 4000;
var init_route_tags = __esm(() => {
  TAG_PATTERNS = [
    [
      "auth",
      [
        /\bauth\b/i,
        /\bauthenticat/i,
        /\bauthoriz/i,
        /Auth\b/,
        /Auth[A-Z]/,
        /\bjwt\b/i,
        /\btoken\b/i,
        /Token\b/,
        /\bsession/i,
        /\bbearer\b/i,
        /\bpassport\b/i,
        /\bclerk\b/i,
        /betterAuth/,
        /better-auth/i
      ]
    ],
    [
      "db",
      [
        /\bprisma\b/i,
        /\bdrizzle\b/i,
        /\btypeorm\b/i,
        /\bsequelize\b/i,
        /\bmongoose\b/i,
        /\bknex\b/i,
        /\bsql\b/i,
        /\bpostgres/i,
        /\bmysql\b/i,
        /\bsqlite\b/i,
        /\.query\(/i,
        /\.execute\(/i,
        /\.findMany\(/i,
        /\.findFirst\(/i,
        /\.insert\(/i,
        /\.update\(/i,
        /\.delete\(/i
      ]
    ],
    ["cache", [/\bredis\b/i, /\bcache/i, /\bmemcache/i, /\.setex\(/i, /\.getex\(/i]],
    ["queue", [/\bbullmq\b/i, /\bbull\b/i, /\.add\(\s*['"`]/i, /\bqueue/i]],
    ["email", [/\bresend\b/i, /\bsendgrid\b/i, /\bnodemailer\b/i, /\.send\(\s*\{[\s\S]*?to:/i]],
    ["payment", [/\bstripe\b/i, /\bpolar\b/i, /\bpaddle\b/i, /\blemon/i, /\bcheckout\b/i]],
    ["webhook", [/\bwebhook/i]],
    ["upload", [/\bmulter\b/i, /\bformidable\b/i, /\bbusboy\b/i, /\bupload/i, /\bmultipart\b/i]],
    [
      "ai",
      [/\bopenai\b/i, /\banthropic\b/i, /\bclaude\b/i, /\.chat\.completions/i, /\.messages\.create/i]
    ]
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-routes.js
function extractPathParams2(path) {
  const params = [];
  const regex = /[:{}](\w+)/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function buildLocalFnMap(ts, sf) {
  const SK = ts.SyntaxKind;
  const map = new Map;
  for (const stmt of sf.statements || []) {
    if (stmt.kind === SK.FunctionDeclaration && stmt.name) {
      map.set(getText(sf, stmt.name), getText(sf, stmt));
    } else if (stmt.kind === SK.VariableStatement) {
      for (const decl of stmt.declarationList?.declarations || []) {
        if (!decl.name || decl.name.kind !== SK.Identifier || !decl.initializer)
          continue;
        const k = decl.initializer.kind;
        if (k === SK.ArrowFunction || k === SK.FunctionExpression || k === SK.CallExpression) {
          map.set(getText(sf, decl.name), getText(sf, decl));
        }
      }
    }
  }
  return map;
}
function scopedRouteTags(ts, sf, node, localFns) {
  const SK = ts.SyntaxKind;
  let text = getText(sf, node);
  for (const arg of node.arguments || []) {
    if (arg.kind === SK.Identifier) {
      const t = localFns.get(getText(sf, arg));
      if (t)
        text += `
` + t;
    }
  }
  return detectTags(text);
}
function extractRoutesAST(ts, filePath, content, framework) {
  try {
    const sf = parseSourceFile(ts, filePath, content);
    switch (framework) {
      case "express":
      case "hono":
      case "fastify":
      case "koa":
      case "elysia":
        return extractHttpFrameworkRoutes(ts, sf, filePath, content, framework);
      case "nestjs":
        return extractNestJSRoutes(ts, sf, filePath, content);
      case "trpc":
        return extractTRPCRoutes(ts, sf, filePath, content);
      default:
        return [];
    }
  } catch {
    return [];
  }
}
function extractHttpFrameworkRoutes(ts, sf, filePath, _content, framework) {
  const routes = [];
  const SK = ts.SyntaxKind;
  const localFns = buildLocalFnMap(ts, sf);
  const prefixMap = new Map;
  const routeDefMap = new Map;
  function visit(node) {
    if (node.kind === SK.VariableStatement) {
      for (const decl of node.declarationList?.declarations || []) {
        if (decl.initializer?.kind === SK.CallExpression) {
          const callee = decl.initializer.expression;
          if (callee?.kind === SK.Identifier && getText(sf, callee) === "createRoute") {
            const routeDef = extractCreateRouteArgs(ts, sf, decl.initializer);
            if (routeDef && decl.name?.kind === SK.Identifier) {
              routeDefMap.set(getText(sf, decl.name), routeDef);
            }
          }
        }
      }
    }
    if (node.kind === SK.CallExpression) {
      const expr = node.expression;
      if (expr?.kind === SK.PropertyAccessExpression) {
        const methodName = getText(sf, expr.name).toLowerCase();
        const receiverName = expr.expression?.kind === SK.Identifier ? getText(sf, expr.expression) : "";
        if (methodName === "use" && node.arguments?.length >= 2) {
          const first = node.arguments[0];
          const second = node.arguments[1];
          if ((first.kind === SK.StringLiteral || first.kind === SK.NoSubstitutionTemplateLiteral) && second.kind === SK.Identifier) {
            const prefix = first.text;
            const routerVar = getText(sf, second);
            prefixMap.set(routerVar, prefix);
          }
        }
        if (methodName === "openapi" && node.arguments?.length > 0) {
          const routeArg = node.arguments[0];
          if (routeArg.kind === SK.CallExpression) {
            const callee = routeArg.expression;
            if (callee?.kind === SK.Identifier && getText(sf, callee) === "createRoute") {
              const routeDef = extractCreateRouteArgs(ts, sf, routeArg);
              if (routeDef) {
                routes.push({
                  method: routeDef.method.toUpperCase(),
                  path: routeDef.path,
                  file: filePath,
                  tags: scopedRouteTags(ts, sf, node, localFns),
                  framework,
                  params: extractPathParams2(routeDef.path),
                  confidence: "ast"
                });
              }
            }
          }
          if (routeArg.kind === SK.Identifier) {
            const varName = getText(sf, routeArg);
            const routeDef = routeDefMap.get(varName);
            if (routeDef) {
              routes.push({
                method: routeDef.method.toUpperCase(),
                path: routeDef.path,
                file: filePath,
                tags: scopedRouteTags(ts, sf, node, localFns),
                framework,
                params: extractPathParams2(routeDef.path),
                confidence: "ast"
              });
            }
          }
        }
        if (HTTP_METHODS.has(methodName) && node.arguments?.length > 0) {
          const pathArg = node.arguments[0];
          let path = null;
          if (pathArg.kind === SK.StringLiteral || pathArg.kind === SK.NoSubstitutionTemplateLiteral) {
            path = pathArg.text;
          }
          if (path !== null) {
            if (!path.startsWith("/") && !path.startsWith(":")) {
              ts.forEachChild(node, visit);
              return;
            }
            const prefix = prefixMap.get(receiverName) || "";
            const fullPath = prefix ? (prefix + path).replace(/\/\//g, "/") : path;
            const middleware = [];
            for (let i = 1;i < node.arguments.length; i++) {
              const arg = node.arguments[i];
              if (arg.kind === SK.Identifier) {
                middleware.push(getText(sf, arg));
              }
            }
            routes.push({
              method: methodName.toUpperCase() === "ALL" ? "ALL" : methodName.toUpperCase(),
              path: fullPath,
              file: filePath,
              tags: scopedRouteTags(ts, sf, node, localFns),
              framework,
              params: extractPathParams2(fullPath),
              confidence: "ast",
              middleware
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return routes;
}
function extractCreateRouteArgs(ts, sf, callExpr) {
  const SK = ts.SyntaxKind;
  if (!callExpr.arguments?.length)
    return null;
  const arg = callExpr.arguments[0];
  if (arg.kind !== SK.ObjectLiteralExpression)
    return null;
  let method = null;
  let path = null;
  for (const prop of arg.properties || []) {
    if (prop.kind !== SK.PropertyAssignment || !prop.name)
      continue;
    const name = getText(sf, prop.name);
    const val = prop.initializer;
    if (name === "method" && (val.kind === SK.StringLiteral || val.kind === SK.NoSubstitutionTemplateLiteral)) {
      method = val.text;
    }
    if (name === "path" && (val.kind === SK.StringLiteral || val.kind === SK.NoSubstitutionTemplateLiteral)) {
      path = val.text;
    }
  }
  return method && path ? { method, path } : null;
}
function extractNestJSRoutes(ts, sf, filePath, _content) {
  const routes = [];
  const SK = ts.SyntaxKind;
  function visitNode(node) {
    if (node.kind === SK.ClassDeclaration) {
      const decorators = getDecorators(ts, node);
      let controllerPrefix = "";
      let isController = false;
      for (const dec of decorators) {
        const parsed = parseDecorator(ts, sf, dec);
        if (parsed.name === "Controller") {
          isController = true;
          controllerPrefix = parsed.arg || "";
          break;
        }
      }
      if (!isController) {
        ts.forEachChild(node, visitNode);
        return;
      }
      const classGuards = [];
      for (const dec of decorators) {
        const parsed = parseDecorator(ts, sf, dec);
        if (parsed.name === "UseGuards" && parsed.arg) {
          classGuards.push(parsed.arg);
        }
      }
      for (const member of node.members || []) {
        if (member.kind !== SK.MethodDeclaration)
          continue;
        const methodDecorators = getDecorators(ts, member);
        for (const dec of methodDecorators) {
          const parsed = parseDecorator(ts, sf, dec);
          if (!parsed.name || !NEST_METHOD_MAP[parsed.name])
            continue;
          const methodPath = parsed.arg || "";
          const combined = [controllerPrefix, methodPath].filter(Boolean).join("/");
          const fullPath = "/" + combined.replace(/^\/+/, "").replace(/\/+/g, "/");
          const normalizedPath = fullPath.replace(/\/$/, "") || "/";
          const params = [];
          const middleware = [...classGuards];
          for (const param of member.parameters || []) {
            const paramDecs = getDecorators(ts, param);
            for (const pd of paramDecs) {
              const pp = parseDecorator(ts, sf, pd);
              if (pp.name === "Param" && pp.arg)
                params.push(pp.arg);
            }
          }
          for (const mdec of methodDecorators) {
            const mp = parseDecorator(ts, sf, mdec);
            if (mp.name === "UseGuards" && mp.arg)
              middleware.push(mp.arg);
          }
          const scope = getText(sf, member) + (classGuards.length ? `
` + classGuards.join(" ") : "");
          routes.push({
            method: NEST_METHOD_MAP[parsed.name],
            path: normalizedPath,
            file: filePath,
            tags: detectTags(scope),
            framework: "nestjs",
            params: params.length > 0 ? params : extractPathParams2(normalizedPath),
            confidence: "ast",
            middleware: middleware.length > 0 ? middleware : undefined
          });
        }
      }
    }
    ts.forEachChild(node, visitNode);
  }
  visitNode(sf);
  return routes;
}
function extractTRPCRoutes(ts, sf, filePath, _content) {
  const routes = [];
  const SK = ts.SyntaxKind;
  const localFns = buildLocalFnMap(ts, sf);
  function propTags(prop, refName) {
    let text = getText(sf, prop);
    if (refName) {
      const t = localFns.get(refName);
      if (t)
        text += `
` + t;
    }
    return detectTags(text);
  }
  function isRouterCall(node) {
    if (node.kind !== SK.CallExpression)
      return false;
    const callee = node.expression;
    if (callee.kind === SK.Identifier) {
      const name = getText(sf, callee);
      return name === "router" || name === "createTRPCRouter";
    }
    if (callee.kind === SK.PropertyAccessExpression) {
      return getText(sf, callee.name) === "router";
    }
    return false;
  }
  function findProcedureMethod(node) {
    if (!node || node.kind !== SK.CallExpression)
      return null;
    const expr = node.expression;
    if (expr?.kind === SK.PropertyAccessExpression) {
      const name = getText(sf, expr.name);
      if (name === "query")
        return "QUERY";
      if (name === "mutation")
        return "MUTATION";
      if (name === "subscription")
        return "SUBSCRIPTION";
    }
    return null;
  }
  function extractFromRouter(node, prefix) {
    if (!isRouterCall(node) || !node.arguments?.length)
      return;
    const arg = node.arguments[0];
    if (arg.kind !== SK.ObjectLiteralExpression)
      return;
    for (const prop of arg.properties || []) {
      if (prop.kind === SK.PropertyAssignment) {
        const name = prop.name ? getText(sf, prop.name) : "";
        if (!name)
          continue;
        const init = prop.initializer;
        if (isRouterCall(init)) {
          extractFromRouter(init, prefix ? `${prefix}.${name}` : name);
          continue;
        }
        const method = findProcedureMethod(init);
        if (method) {
          routes.push({
            method,
            path: prefix ? `${prefix}.${name}` : name,
            file: filePath,
            tags: propTags(prop),
            framework: "trpc",
            confidence: "ast"
          });
          continue;
        }
        if (init.kind === SK.Identifier || init.kind === SK.PropertyAccessExpression) {
          const identName = init.kind === SK.Identifier ? getText(sf, init) : "";
          if (/[Rr]outer$|[Rr]outes$/.test(identName))
            continue;
          routes.push({
            method: "PROCEDURE",
            path: prefix ? `${prefix}.${name}` : name,
            file: filePath,
            tags: propTags(prop, identName || undefined),
            framework: "trpc",
            confidence: "ast"
          });
          continue;
        }
      }
      if (prop.kind === SK.ShorthandPropertyAssignment) {
        const name = prop.name ? getText(sf, prop.name) : "";
        if (!name)
          continue;
        routes.push({
          method: "PROCEDURE",
          path: prefix ? `${prefix}.${name}` : name,
          file: filePath,
          tags: propTags(prop, name),
          framework: "trpc",
          confidence: "ast"
        });
        continue;
      }
      if (prop.kind === SK.SpreadAssignment) {}
    }
  }
  function visit(node) {
    if (isRouterCall(node)) {
      extractFromRouter(node, "");
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return routes;
}
var HTTP_METHODS, NEST_METHOD_MAP;
var init_extract_routes = __esm(() => {
  init_loader();
  init_route_tags();
  HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all"]);
  NEST_METHOD_MAP = {
    Get: "GET",
    Post: "POST",
    Put: "PUT",
    Patch: "PATCH",
    Delete: "DELETE",
    Options: "OPTIONS",
    Head: "HEAD",
    All: "ALL"
  };
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-python.js
import { execFile } from "child_process";
import { promisify } from "util";
import { spawn } from "child_process";
async function findPython() {
  if (pythonAvailable !== null)
    return pythonAvailable;
  for (const cmd of ["python3", "python"]) {
    try {
      const { stdout } = await execFileP(cmd, ["--version"], { timeout: 3000 });
      if (stdout.includes("Python 3")) {
        pythonCmd = cmd;
        pythonAvailable = true;
        return true;
      }
    } catch {}
  }
  pythonAvailable = false;
  return false;
}
async function runPythonWithStdin(script, source, filename) {
  if (!await findPython())
    return null;
  return new Promise((resolve2) => {
    const proc = spawn(pythonCmd, ["-c", script, filename], {
      timeout: 1e4,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve2(null);
        return;
      }
      try {
        resolve2(JSON.parse(stdout.trim()));
      } catch {
        resolve2(null);
      }
    });
    proc.on("error", () => resolve2(null));
    proc.stdin.write(source);
    proc.stdin.end();
  });
}
async function extractPythonRoutesAST(filePath, content, framework, tags) {
  const result = await runPythonWithStdin(PYTHON_ROUTE_SCRIPT, content, filePath);
  if (!result || !Array.isArray(result) || result.length === 0)
    return null;
  const lines = content.split(`
`);
  return result.map((r) => ({
    method: r.method,
    path: r.path,
    file: filePath,
    tags: typeof r.lineno === "number" && typeof r.end_lineno === "number" ? detectTagsForLineSpan(lines, r.lineno, r.end_lineno) : tags,
    framework,
    params: extractPathParams3(r.path),
    confidence: "ast"
  }));
}
async function extractSQLAlchemyAST(filePath, content) {
  const result = await runPythonWithStdin(PYTHON_SCHEMA_SCRIPT, content, filePath);
  if (!result || !Array.isArray(result) || result.length === 0)
    return null;
  return result.map((m) => ({
    name: m.name,
    fields: (m.fields || []).map((f) => ({
      name: f.name,
      type: f.type || "unknown",
      flags: f.flags || []
    })),
    relations: (m.relations || []).map((r) => `${r.name}: ${r.target}`),
    orm: "sqlalchemy",
    confidence: "ast"
  }));
}
async function extractDjangoModelsAST(filePath, content) {
  const result = await runPythonWithStdin(PYTHON_DJANGO_SCRIPT, content, filePath);
  if (!result || !Array.isArray(result) || result.length === 0)
    return null;
  return result.map((m) => ({
    name: m.name,
    fields: (m.fields || []).map((f) => ({
      name: f.name,
      type: f.type || "unknown",
      flags: f.flags || []
    })),
    relations: (m.relations || []).map((r) => `${r.name}: ${r.type === "many" ? "many" : "one"}(${r.target})`),
    orm: "django",
    confidence: "ast"
  }));
}
async function extractSQLModelAST(filePath, content) {
  const result = await runPythonWithStdin(PYTHON_SQLMODEL_SCRIPT, content, filePath);
  if (!result || !Array.isArray(result) || result.length === 0)
    return null;
  return result.map((m) => ({
    name: m.name,
    fields: (m.fields || []).map((f) => ({
      name: f.name,
      type: f.type || "unknown",
      flags: f.flags || []
    })),
    relations: (m.relations || []).map((r) => `${r.name}: ${r.target}`),
    orm: "sqlalchemy",
    confidence: "ast"
  }));
}
function extractPathParams3(path) {
  const params = [];
  const regex = /[{<](?:\w+:)?(\w+)[}>]/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
var execFileP, PYTHON_ROUTE_SCRIPT = `
import ast, json, sys

def extract_routes(source, filename):
    try:
        tree = ast.parse(source, filename)
    except SyntaxError:
        return []

    routes = []

    for node in ast.walk(tree):
        # FastAPI/Flask style: @router.get("/path") or @app.route("/path", methods=["GET","POST"])
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = node.decorator_list[0].lineno if node.decorator_list else node.lineno
            end = getattr(node, 'end_lineno', None) or node.lineno
            for dec in node.decorator_list:
                route = parse_route_decorator(dec)
                if route:
                    for r in route:
                        r['lineno'] = start
                        r['end_lineno'] = end
                        routes.append(r)

        # Django: path("url", view) in urlpatterns list
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == 'urlpatterns':
                    if isinstance(node.value, (ast.List, ast.BinOp)):
                        routes.extend(parse_urlpatterns(node.value))

    return routes

def parse_route_decorator(dec):
    results = []

    # @router.get("/path") / @app.post("/path") \u2014 Attribute call
    if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
        method_name = dec.func.attr.upper()
        methods_map = {'GET':'GET','POST':'POST','PUT':'PUT','PATCH':'PATCH',
                       'DELETE':'DELETE','OPTIONS':'OPTIONS','HEAD':'HEAD'}

        if method_name in methods_map and dec.args:
            path = get_str(dec.args[0])
            if path is not None:
                results.append({'method': methods_map[method_name], 'path': path})

        # @app.route("/path", methods=["GET","POST"])
        if dec.func.attr == 'route' and dec.args:
            path = get_str(dec.args[0])
            if path is not None:
                methods = ['GET']
                for kw in dec.keywords:
                    if kw.arg == 'methods' and isinstance(kw.value, ast.List):
                        methods = [get_str(e) for e in kw.value.elts if get_str(e)]
                for m in methods:
                    results.append({'method': m.upper(), 'path': path})

    # @app.api_route("/path", methods=["GET","POST"]) \u2014 FastAPI api_route
    if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
        if dec.func.attr == 'api_route' and dec.args:
            path = get_str(dec.args[0])
            if path is not None:
                methods = ['GET']
                for kw in dec.keywords:
                    if kw.arg == 'methods' and isinstance(kw.value, ast.List):
                        methods = [get_str(e) for e in kw.value.elts if get_str(e)]
                for m in methods:
                    results.append({'method': m.upper(), 'path': path})

    return results if results else None

def parse_urlpatterns(node):
    routes = []
    elements = []
    if isinstance(node, ast.List):
        elements = node.elts
    elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        # urlpatterns = [...] + [...]
        if isinstance(node.left, ast.List):
            elements.extend(node.left.elts)
        if isinstance(node.right, ast.List):
            elements.extend(node.right.elts)

    for elt in elements:
        if isinstance(elt, ast.Call):
            func_name = ''
            if isinstance(elt.func, ast.Name):
                func_name = elt.func.id
            elif isinstance(elt.func, ast.Attribute):
                func_name = elt.func.attr

            if func_name in ('path', 're_path', 'url') and elt.args:
                path_str = get_str(elt.args[0])
                if path_str is not None:
                    routes.append({'method': 'ALL', 'path': '/' + path_str.lstrip('/')})

    return routes

def get_str(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Str):  # Python 3.7
        return node.s
    return None

source = sys.stdin.read()
filename = sys.argv[1] if len(sys.argv) > 1 else '<stdin>'
result = extract_routes(source, filename)
print(json.dumps(result))
`, PYTHON_SCHEMA_SCRIPT = `
import ast, json, sys

def extract_models(source, filename):
    try:
        tree = ast.parse(source, filename)
    except SyntaxError:
        return []

    models = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue

        # Check if inherits from Base, Model, DeclarativeBase, db.Model
        is_model = False
        for base in node.bases:
            name = ''
            if isinstance(base, ast.Name):
                name = base.id
            elif isinstance(base, ast.Attribute):
                name = base.attr
            if name in ('Base', 'Model', 'DeclarativeBase', 'AbstractBase'):
                is_model = True
                break
        if not is_model:
            continue

        fields = []
        relations = []

        for item in node.body:
            # Column assignments: field = Column(Type, ...) or field: Mapped[Type] = mapped_column(...)
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        field_info = parse_column_or_rel(target.id, item.value)
                        if field_info:
                            if field_info['kind'] == 'field':
                                fields.append(field_info)
                            else:
                                relations.append(field_info)

            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                field_name = item.target.id
                if field_name.startswith('__'):
                    continue
                if item.value:
                    field_info = parse_column_or_rel(field_name, item.value)
                    if field_info:
                        if field_info['kind'] == 'field':
                            # Try to get type from annotation
                            ann_type = extract_mapped_type(item.annotation)
                            if ann_type and field_info['type'] == 'unknown':
                                field_info['type'] = ann_type
                            fields.append(field_info)
                        else:
                            relations.append(field_info)

        if fields:
            models.append({
                'name': node.name,
                'fields': fields,
                'relations': relations,
            })

    return models

def parse_column_or_rel(name, value):
    if name.startswith('__'):
        return None

    # relationship("Model")
    if isinstance(value, ast.Call):
        func_name = get_func_name(value)

        if func_name in ('relationship', 'db.relationship'):
            target = ''
            if value.args:
                target = get_str(value.args[0]) or ''
            return {'kind': 'relation', 'name': name, 'target': target}

        if func_name in ('Column', 'db.Column', 'mapped_column'):
            col_type = 'unknown'
            flags = []

            for arg in value.args:
                t = get_type_name(arg)
                if t:
                    col_type = t
                if isinstance(arg, ast.Call) and get_func_name(arg) == 'ForeignKey':
                    flags.append('fk')

            for kw in value.keywords:
                if kw.arg == 'primary_key' and is_true(kw.value):
                    flags.append('pk')
                elif kw.arg == 'unique' and is_true(kw.value):
                    flags.append('unique')
                elif kw.arg == 'nullable' and is_true(kw.value):
                    flags.append('nullable')
                elif kw.arg == 'default':
                    flags.append('default')
                elif kw.arg == 'index' and is_true(kw.value):
                    flags.append('index')

            return {'kind': 'field', 'name': name, 'type': col_type, 'flags': flags}

    return None

def extract_mapped_type(annotation):
    # Mapped[int] or Mapped[Optional[str]]
    if isinstance(annotation, ast.Subscript):
        if isinstance(annotation.value, ast.Name) and annotation.value.id == 'Mapped':
            slice_node = annotation.slice
            if isinstance(slice_node, ast.Name):
                return slice_node.id
            if isinstance(slice_node, ast.Subscript) and isinstance(slice_node.value, ast.Name):
                if slice_node.value.id == 'Optional':
                    inner = slice_node.slice
                    if isinstance(inner, ast.Name):
                        return inner.id
    return None

def get_func_name(node):
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        if isinstance(node.func.value, ast.Name):
            return node.func.value.id + '.' + node.func.attr
        return node.func.attr
    return ''

def get_type_name(node):
    if isinstance(node, ast.Name):
        known = {'String','Integer','Boolean','Float','Text','DateTime','JSON',
                 'UUID','BigInteger','SmallInteger','Numeric','Date','Time',
                 'LargeBinary','Enum','ARRAY','JSONB'}
        if node.id in known:
            return node.id
    if isinstance(node, ast.Call):
        return get_type_name(node.func)
    if isinstance(node, ast.Attribute):
        return node.attr
    return None

def get_str(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None

def is_true(node):
    if isinstance(node, ast.Constant):
        return node.value is True
    if isinstance(node, ast.NameConstant):  # Python 3.7
        return node.value is True
    return False

source = sys.stdin.read()
filename = sys.argv[1] if len(sys.argv) > 1 else '<stdin>'
result = extract_models(source, filename)
print(json.dumps(result))
`, PYTHON_DJANGO_SCRIPT = `
import ast, json, sys

FIELD_TYPES = {
    'CharField': 'string', 'TextField': 'string', 'EmailField': 'string',
    'URLField': 'string', 'SlugField': 'string', 'FilePathField': 'string',
    'FileField': 'string', 'ImageField': 'string', 'IPAddressField': 'string',
    'GenericIPAddressField': 'string',
    'IntegerField': 'integer', 'SmallIntegerField': 'integer',
    'BigIntegerField': 'integer', 'PositiveIntegerField': 'integer',
    'PositiveSmallIntegerField': 'integer', 'AutoField': 'integer',
    'BigAutoField': 'integer', 'SmallAutoField': 'integer',
    'FloatField': 'float', 'DecimalField': 'decimal',
    'BooleanField': 'boolean', 'NullBooleanField': 'boolean',
    'DateField': 'date', 'DateTimeField': 'timestamp', 'TimeField': 'time',
    'DurationField': 'duration',
    'JSONField': 'json', 'UUIDField': 'uuid', 'BinaryField': 'bytes',
}
RELATION_FIELDS = {'ForeignKey', 'OneToOneField', 'ManyToManyField'}
AUDIT = {'created_at','updated_at','deleted_at','createdAt','updatedAt','deletedAt'}

def get_base_names(node):
    names = []
    for b in node.bases:
        if isinstance(b, ast.Name):
            names.append(b.id)
        elif isinstance(b, ast.Attribute):
            names.append(b.attr)
    return names

def is_abstract_model(node):
    for item in node.body:
        if isinstance(item, ast.ClassDef) and item.name == 'Meta':
            for stmt in item.body:
                if isinstance(stmt, ast.Assign):
                    for t in stmt.targets:
                        if isinstance(t, ast.Name) and t.id == 'abstract':
                            if isinstance(stmt.value, ast.Constant) and stmt.value.value:
                                return True
    return False

def extract_fields(node):
    fields = []
    relations = []
    for item in node.body:
        if not isinstance(item, ast.Assign):
            continue
        for target in item.targets:
            if not isinstance(target, ast.Name):
                continue
            fname = target.id
            if fname.startswith('_') or fname in AUDIT:
                continue
            if not isinstance(item.value, ast.Call):
                continue
            call = item.value
            fc = ''
            if isinstance(call.func, ast.Name):
                fc = call.func.id
            elif isinstance(call.func, ast.Attribute):
                fc = call.func.attr
            if not fc:
                continue
            if fc in RELATION_FIELDS:
                tgt = ''
                if call.args:
                    a = call.args[0]
                    if isinstance(a, ast.Constant) and isinstance(a.value, str):
                        tgt = a.value.split('.')[-1]
                    elif isinstance(a, ast.Name):
                        tgt = a.id
                rel_type = 'many' if fc == 'ManyToManyField' else 'one'
                relations.append({'name': fname, 'target': tgt, 'type': rel_type})
                if fc in ('ForeignKey', 'OneToOneField'):
                    fields.append({'name': fname + '_id', 'type': 'integer', 'flags': ['fk']})
            elif fc in FIELD_TYPES:
                ftype = FIELD_TYPES[fc]
                flags = []
                for kw in call.keywords:
                    if kw.arg == 'primary_key' and isinstance(kw.value, ast.Constant) and kw.value.value:
                        flags.append('pk')
                    elif kw.arg == 'unique' and isinstance(kw.value, ast.Constant) and kw.value.value:
                        flags.append('unique')
                    elif kw.arg == 'null' and isinstance(kw.value, ast.Constant) and kw.value.value:
                        flags.append('nullable')
                    elif kw.arg == 'default':
                        flags.append('default')
                fields.append({'name': fname, 'type': ftype, 'flags': flags})
    return fields, relations

def extract_django_models(source, filename):
    try:
        tree = ast.parse(source, filename)
    except SyntaxError:
        return []

    # Collect all class definitions in this file
    all_classes = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            all_classes[node.name] = node

    # Expand the set of known Django model classes transitively.
    # Start from 'Model' (covers models.Model, db.Model, etc.) then propagate.
    django_classes = {'Model'}
    changed = True
    while changed:
        changed = False
        for name, node in all_classes.items():
            if name not in django_classes:
                if any(b in django_classes for b in get_base_names(node)):
                    django_classes.add(name)
                    changed = True

    models = []
    for name, node in all_classes.items():
        if name == 'Model':
            continue
        # Must directly inherit from a known django class
        if not any(b in django_classes for b in get_base_names(node)):
            continue
        # Skip abstract base models (they have no table)
        if is_abstract_model(node):
            continue
        fields, relations = extract_fields(node)
        if fields or relations:
            models.append({'name': name, 'fields': fields, 'relations': relations})

    return models

source = sys.stdin.read()
filename = sys.argv[1] if len(sys.argv) > 1 else '<stdin>'
print(json.dumps(extract_django_models(source, filename)))
`, PYTHON_SQLMODEL_SCRIPT = `
import ast, json, sys

def map_type(t):
    m = {'str': 'string', 'int': 'integer', 'float': 'float', 'bool': 'boolean',
         'bytes': 'binary', 'datetime': 'datetime', 'date': 'date', 'Decimal': 'decimal',
         'UUID': 'uuid', 'dict': 'json', 'list': 'array'}
    return m.get(t, t.lower() if t else 'any')

def get_ann_type(ann):
    if isinstance(ann, ast.Name):
        return map_type(ann.id)
    if isinstance(ann, ast.Subscript):
        outer = ann.value.id if isinstance(ann.value, ast.Name) else ''
        inner = ann.slice
        if outer == 'Optional':
            return get_ann_type(inner)
        if outer in ('List', 'list'):
            return 'array'
    return 'any'

def get_inner_name(ann):
    if isinstance(ann, ast.Subscript):
        inner = ann.slice
        if isinstance(inner, ast.Name):
            return inner.id
    return ''

def extract_sqlmodel(source, filename):
    try:
        tree = ast.parse(source, filename)
    except SyntaxError:
        return []

    # Check if file imports from sqlmodel
    has_sqlmodel_import = any(
        (isinstance(n, ast.ImportFrom) and n.module and 'sqlmodel' in n.module) or
        (isinstance(n, ast.Import) and any('sqlmodel' in a.name for a in n.names))
        for n in ast.walk(tree)
    )
    if not has_sqlmodel_import:
        return []

    results = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        # Accept: direct SQLModel inheritance OR any base with table=True (common pattern)
        inherits = any(
            (isinstance(b, ast.Name) and b.id == 'SQLModel') or
            (isinstance(b, ast.Attribute) and b.attr == 'SQLModel')
            for b in node.bases
        )
        has_table = any(
            kw.arg == 'table' and isinstance(kw.value, ast.Constant) and kw.value.value is True
            for kw in node.keywords
        )
        # Must have table=True; direct SQLModel inheritance is optional (base class pattern)
        if not has_table:
            continue
        # Must have at least some bases (avoid bare classes with table=True from other libs)
        if not node.bases:
            continue

        fields = []
        relations = []
        for stmt in node.body:
            if not isinstance(stmt, ast.AnnAssign) or not isinstance(stmt.target, ast.Name):
                continue
            fname = stmt.target.id
            if fname.startswith('_'):
                continue
            ftype = get_ann_type(stmt.annotation)

            is_rel = False
            if stmt.value and isinstance(stmt.value, ast.Call):
                fn = stmt.value.func
                fn_name = fn.id if isinstance(fn, ast.Name) else (fn.attr if isinstance(fn, ast.Attribute) else '')
                if fn_name == 'Relationship':
                    is_rel = True
                    rel_target = get_inner_name(stmt.annotation)
                    if rel_target:
                        relations.append({'name': fname, 'target': rel_target, 'type': 'has_many'})

            if not is_rel:
                flags = []
                if stmt.value and isinstance(stmt.value, ast.Call):
                    fn = stmt.value.func
                    fn_name = fn.id if isinstance(fn, ast.Name) else ''
                    if fn_name == 'Field':
                        for kw in stmt.value.keywords:
                            if kw.arg == 'primary_key' and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                                flags.append('pk')
                            elif kw.arg == 'foreign_key':
                                flags.append('fk')
                fields.append({'name': fname, 'type': ftype, 'flags': flags})

        if fields or relations:
            results.append({'name': node.name, 'fields': fields, 'relations': relations})

    return results

source = sys.stdin.read()
filename = sys.argv[1] if len(sys.argv) > 1 else '<stdin>'
print(json.dumps(extract_sqlmodel(source, filename)))
`, pythonAvailable = null, pythonCmd = "python3";
var init_extract_python = __esm(() => {
  init_route_tags();
  execFileP = promisify(execFile);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-go.js
function extractGoRoutesStructured(filePath, content, framework, tags) {
  const routes = [];
  const groups = extractRouteGroups(content, framework);
  const groupVarNames = new Set;
  for (const group of groups) {
    if (group.varName)
      groupVarNames.add(group.varName);
    const groupRoutes = extractRoutesFromBlock(group.body, framework, filePath, tags);
    for (const route of groupRoutes) {
      route.path = normalizePath(group.prefix + "/" + route.path);
      routes.push(route);
    }
  }
  if (groupVarNames.size > 0) {
    const lines = content.split(`
`);
    const topLines = lines.filter((line) => {
      for (const v of groupVarNames) {
        if (line.includes(v + "."))
          return false;
      }
      return true;
    });
    const topContent = topLines.join(`
`);
    const topLevelRoutes = extractRoutesFromBlock(topContent, framework, filePath, tags);
    routes.push(...topLevelRoutes);
  } else {
    const topLevelRoutes = extractRoutesFromBlock(content, framework, filePath, tags);
    routes.push(...topLevelRoutes);
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function extractRouteGroups(content, framework) {
  const groups = [];
  if (framework === "chi") {
    const chiRoutePattern = /\.Route\s*\(\s*"([^"]+)"\s*,\s*func\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = chiRoutePattern.exec(content)) !== null) {
      const prefix = match[1];
      const bodyStart = match.index + match[0].length;
      const body = extractBraceBlock(content, bodyStart);
      if (body)
        groups.push({ prefix, body });
    }
  } else {
    const prefixMap = new Map;
    const groupPattern = /(\w+)\s*:?=\s*(\w+)\.Group\s*\(\s*"([^"]*)"/g;
    let match;
    while ((match = groupPattern.exec(content)) !== null) {
      const varName = match[1];
      const receiver = match[2];
      const prefix = match[3];
      const receiverPrefix = prefixMap.get(receiver) || "";
      const fullPrefix = normalizePath(receiverPrefix + "/" + prefix);
      prefixMap.set(varName, fullPrefix);
    }
    for (const [varName, fullPrefix] of prefixMap) {
      const varRoutes = [];
      const varPattern = new RegExp(`${escapeRegex(varName)}\\.\\s*(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Get|Post|Put|Patch|Delete|Options|Head)\\s*\\(\\s*"([^"]*)"`, "g");
      let routeMatch;
      while ((routeMatch = varPattern.exec(content)) !== null) {
        varRoutes.push(`${routeMatch[1]}:${routeMatch[2]}`);
      }
      const handlePattern = new RegExp(`${escapeRegex(varName)}\\.\\s*HandleFunc\\s*\\(\\s*"([^"]*)"`, "g");
      while ((routeMatch = handlePattern.exec(content)) !== null) {
        varRoutes.push(`ALL:${routeMatch[1]}`);
      }
      if (varRoutes.length > 0) {
        groups.push({
          prefix: fullPrefix,
          varName,
          body: varRoutes.map((r) => {
            const colonIdx = r.indexOf(":");
            const m = r.slice(0, colonIdx);
            const p = r.slice(colonIdx + 1);
            return `FAKE.${m}("${p}")`;
          }).join(`
`)
        });
      }
    }
  }
  return groups;
}
function extractRoutesFromBlock(block, framework, filePath, tags) {
  const routes = [];
  if (framework === "gin" || framework === "echo") {
    const pattern = /\.(?:FAKE\.)?(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(\s*"([^"]*)"/g;
    let match;
    while ((match = pattern.exec(block)) !== null) {
      routes.push({
        method: match[1],
        path: match[2],
        file: filePath,
        tags,
        framework,
        params: extractPathParams4(match[2]),
        confidence: "ast"
      });
    }
  } else if (framework === "fiber" || framework === "chi") {
    const pattern = /\.(?:FAKE\.)?(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*"([^"]*)"/g;
    let match;
    while ((match = pattern.exec(block)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: filePath,
        tags,
        framework,
        params: extractPathParams4(match[2]),
        confidence: "ast"
      });
    }
  }
  if (framework === "go-net-http" || framework === "chi") {
    const pattern = /\.(?:HandleFunc|Handle)\s*\(\s*"([^"]+)"/g;
    let match;
    while ((match = pattern.exec(block)) !== null) {
      const pathStr = match[1];
      let method = "ALL";
      let path = pathStr;
      const methodMatch = pathStr.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/.*)/);
      if (methodMatch) {
        method = methodMatch[1];
        path = methodMatch[2];
      }
      routes.push({
        method,
        path,
        file: filePath,
        tags,
        framework,
        params: extractPathParams4(path),
        confidence: "ast"
      });
    }
  }
  if (framework === "chi") {
    const methodPattern = /\.Method\s*\(\s*"(\w+)"\s*,\s*"([^"]+)"/g;
    let match;
    while ((match = methodPattern.exec(block)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: filePath,
        tags,
        framework,
        params: extractPathParams4(match[2]),
        confidence: "ast"
      });
    }
  }
  return routes;
}
function extractGORMModelsStructured(_filePath, content) {
  const models = [];
  const structPattern = /type\s+(\w+)\s+struct\s*\{/g;
  let match;
  while ((match = structPattern.exec(content)) !== null) {
    const name = match[1];
    const bodyStart = match.index + match[0].length;
    const body = extractBraceBlock(content, bodyStart);
    if (!body)
      continue;
    const isGormModel = body.includes("gorm.Model") || body.includes("gorm.DeletedAt") || body.includes("`gorm:");
    if (!isGormModel)
      continue;
    const fields = [];
    const relations = [];
    const lines = body.split(`
`);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed === "}" || trimmed === "{")
        continue;
      if (trimmed === "gorm.Model") {
        fields.push({ name: "ID", type: "uint", flags: ["pk"] });
        fields.push({ name: "CreatedAt", type: "time.Time", flags: [] });
        fields.push({ name: "UpdatedAt", type: "time.Time", flags: [] });
        fields.push({ name: "DeletedAt", type: "gorm.DeletedAt", flags: ["nullable"] });
        continue;
      }
      const fieldMatch = trimmed.match(/^(\w+)\s+([\w.*\[\]]+)\s*(?:`(.+)`)?/);
      if (!fieldMatch)
        continue;
      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const tagStr = fieldMatch[3] || "";
      if (fieldType.startsWith("*") || fieldType.includes(".")) {
        if (trimmed.includes('gorm:"foreignKey') || trimmed.includes('gorm:"many2many')) {
          relations.push(`${fieldName}: ${fieldType.replace("*", "").replace("[]", "")}`);
          continue;
        }
        if (fieldType.startsWith("[]") || fieldType.startsWith("*")) {
          const relType = fieldType.replace("*", "").replace("[]", "");
          if (relType[0] === relType[0]?.toUpperCase() && !relType.includes(".")) {
            relations.push(`${fieldName}: ${relType}`);
            continue;
          }
        }
      }
      const flags = [];
      const gormTag = tagStr.match(/gorm:"([^"]+)"/)?.[1] || "";
      if (gormTag) {
        if (gormTag.includes("primaryKey") || gormTag.includes("primarykey"))
          flags.push("pk");
        if (gormTag.includes("unique"))
          flags.push("unique");
        if (gormTag.includes("not null"))
          flags.push("required");
        if (gormTag.includes("default:"))
          flags.push("default");
        if (gormTag.includes("index"))
          flags.push("index");
        if (gormTag.includes("foreignKey") || gormTag.includes("foreignkey"))
          flags.push("fk");
      }
      fields.push({ name: fieldName, type: fieldType, flags });
    }
    if (fields.length > 0) {
      models.push({
        name,
        fields,
        relations,
        orm: "gorm",
        confidence: "ast"
      });
    }
  }
  return models;
}
function extractEntSchemasStructured(_filePath, content) {
  const models = [];
  const structPattern = /type\s+(\w+)\s+struct\s*\{\s*ent\.Schema\s*\}/g;
  let structMatch;
  while ((structMatch = structPattern.exec(content)) !== null) {
    const name = structMatch[1];
    const fields = [];
    const relations = [];
    const fieldsBlockMatch = content.match(new RegExp(`func\\s*\\(${name}\\)\\s*Fields\\s*\\(\\)\\s*\\[\\]ent\\.Field\\s*\\{`));
    if (fieldsBlockMatch && fieldsBlockMatch.index != null) {
      const bodyStart = fieldsBlockMatch.index + fieldsBlockMatch[0].length;
      const body = extractBraceBlock(content, bodyStart);
      if (body) {
        const fieldPattern = /field\.(\w+)\("(\w+)"\)/g;
        let fm;
        while ((fm = fieldPattern.exec(body)) !== null) {
          const fieldType = fm[1].toLowerCase();
          const fieldName = fm[2];
          const lineEnd = body.indexOf(`
`, fm.index);
          const fieldLine = body.slice(fm.index, lineEnd > -1 ? lineEnd : undefined);
          const flags = [];
          if (fieldLine.includes(".Optional()"))
            flags.push("nullable");
          if (fieldLine.includes(".Nillable()"))
            flags.push("nullable");
          if (fieldLine.includes(".Unique()"))
            flags.push("unique");
          if (fieldLine.includes(".Immutable()"))
            flags.push("immutable");
          if (fieldLine.includes(".NotEmpty()"))
            flags.push("required");
          if (fieldLine.includes(".Default("))
            flags.push("default");
          if (fieldLine.includes(".Positive()"))
            flags.push("positive");
          fields.push({ name: fieldName, type: fieldType, flags });
        }
        const enumFieldPattern = /field\.Enum\("(\w+)"\)\.\s*Values\(([^)]+)\)/g;
        let em;
        while ((em = enumFieldPattern.exec(body)) !== null) {
          const fieldName = em[1];
          const lineEnd = body.indexOf(`
`, em.index);
          const fieldLine = body.slice(em.index, lineEnd > -1 ? lineEnd : undefined);
          const flags = [];
          if (fieldLine.includes(".Default("))
            flags.push("default");
          if (fieldLine.includes(".Optional()"))
            flags.push("nullable");
          fields.push({ name: fieldName, type: "enum", flags });
        }
      }
    }
    const edgesBlockMatch = content.match(new RegExp(`func\\s*\\(${name}\\)\\s*Edges\\s*\\(\\)\\s*\\[\\]ent\\.Edge\\s*\\{`));
    if (edgesBlockMatch && edgesBlockMatch.index != null) {
      const bodyStart = edgesBlockMatch.index + edgesBlockMatch[0].length;
      const body = extractBraceBlock(content, bodyStart);
      if (body) {
        const edgePattern = /edge\.(To|From)\("(\w+)",\s*(\w+)\.Type\)/g;
        let edgeMatch;
        while ((edgeMatch = edgePattern.exec(body)) !== null) {
          const direction = edgeMatch[1].toLowerCase();
          const edgeName = edgeMatch[2];
          const targetType = edgeMatch[3];
          relations.push(`${edgeName} \u2192 ${targetType} (${direction})`);
        }
      }
    }
    if (fields.length > 0 || relations.length > 0) {
      models.push({
        name,
        fields,
        relations,
        orm: "ent",
        confidence: "ast"
      });
    }
  }
  return models;
}
function extractBraceBlock(content, startAfterOpenBrace) {
  let depth = 1;
  let i = startAfterOpenBrace;
  while (i < content.length && depth > 0) {
    if (content[i] === "{")
      depth++;
    else if (content[i] === "}")
      depth--;
    i++;
  }
  if (depth !== 0)
    return null;
  return content.slice(startAfterOpenBrace, i - 1);
}
function extractPathParams4(path) {
  const params = [];
  const regex = /[:{}](\w+)/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function normalizePath(path) {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-php.js
function extractPathParams5(path) {
  const params = [];
  const regex = /\{(\w+)\??}/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function extractLaravelRoutes(filePath, content, tags) {
  const routes = [];
  const verbPattern = /Route\s*::\s*(get|post|put|patch|delete|options|any)\s*\(\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = verbPattern.exec(content)) !== null) {
    const method = m[1].toUpperCase() === "ANY" ? "ALL" : m[1].toUpperCase();
    const path = m[2].startsWith("/") ? m[2] : "/" + m[2];
    routes.push({
      method,
      path,
      file: filePath,
      tags,
      framework: "laravel",
      params: extractPathParams5(path),
      confidence: "regex"
    });
  }
  const matchPattern = /Route\s*::\s*match\s*\(\s*\[([^\]]+)\]\s*,\s*['"]([^'"]+)['"]/gi;
  while ((m = matchPattern.exec(content)) !== null) {
    const methods = m[1].match(/['"](\w+)['"]/g)?.map((s) => s.replace(/['"]/g, "").toUpperCase()) ?? ["ALL"];
    const path = m[2].startsWith("/") ? m[2] : "/" + m[2];
    for (const method of methods) {
      routes.push({
        method,
        path,
        file: filePath,
        tags,
        framework: "laravel",
        params: extractPathParams5(path),
        confidence: "regex"
      });
    }
  }
  const resourcePattern = /Route\s*::\s*resource\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = resourcePattern.exec(content)) !== null) {
    const base = "/" + m[1].replace(/^\//, "");
    const restRoutes = [
      ["GET", base],
      ["GET", `${base}/create`],
      ["POST", base],
      ["GET", `${base}/{id}`],
      ["GET", `${base}/{id}/edit`],
      ["PUT", `${base}/{id}`],
      ["PATCH", `${base}/{id}`],
      ["DELETE", `${base}/{id}`]
    ];
    for (const [method, path] of restRoutes) {
      routes.push({ method, path, file: filePath, tags, framework: "laravel", params: extractPathParams5(path), confidence: "regex" });
    }
  }
  const apiResourcePattern = /Route\s*::\s*apiResource\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = apiResourcePattern.exec(content)) !== null) {
    const base = "/" + m[1].replace(/^\//, "");
    const apiRoutes = [
      ["GET", base],
      ["POST", base],
      ["GET", `${base}/{id}`],
      ["PUT", `${base}/{id}`],
      ["PATCH", `${base}/{id}`],
      ["DELETE", `${base}/{id}`]
    ];
    for (const [method, path] of apiRoutes) {
      routes.push({ method, path, file: filePath, tags, framework: "laravel", params: extractPathParams5(path), confidence: "regex" });
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function extractEloquentModels(_filePath, content) {
  const models = [];
  const classPattern = /class\s+(\w+)\s+extends\s+(?:\\?[\w\\]+\\)?(?:\w*Model)\b/g;
  let m;
  while ((m = classPattern.exec(content)) !== null) {
    const name = m[1];
    const fields = [];
    const relations = [];
    const fillableMatch = content.match(/\$fillable\s*=\s*\[([^\]]+)\]/);
    if (fillableMatch) {
      const items = fillableMatch[1].match(/['"]([^'"]+)['"]/g) ?? [];
      for (const item of items) {
        const fieldName = item.replace(/['"]/g, "");
        if (AUDIT_FIELDS.has(fieldName))
          continue;
        let type = "string";
        if (fieldName.endsWith("_id") || fieldName === "id")
          type = "integer";
        else if (fieldName.startsWith("is_") || fieldName.startsWith("has_"))
          type = "boolean";
        else if (fieldName.includes("_at") || fieldName.includes("date") || fieldName.includes("time"))
          type = "timestamp";
        else if (fieldName === "amount" || fieldName === "price" || fieldName === "total")
          type = "decimal";
        const flags = [];
        if (fieldName === "id")
          flags.push("pk");
        if (fieldName.endsWith("_id") && fieldName !== "id")
          flags.push("fk");
        fields.push({ name: fieldName, type, flags });
      }
    }
    const castsMatch = content.match(/\$casts\s*=\s*\[([^\]]+)\]/s);
    if (castsMatch) {
      const castPairs = castsMatch[1].matchAll(/['"]([^'"]+)['"]\s*=>\s*['"]([^'"]+)['"]/g);
      for (const pair of castPairs) {
        const fieldName = pair[1];
        const castType = pair[2];
        if (AUDIT_FIELDS.has(fieldName))
          continue;
        const existing = fields.find((f) => f.name === fieldName);
        if (existing) {
          existing.type = castType;
        } else {
          fields.push({ name: fieldName, type: castType, flags: [] });
        }
      }
    }
    for (const rel of ELOQUENT_RELATIONS) {
      const relPattern = new RegExp(`function\\s+(\\w+)\\s*\\(\\s*\\)[^{]*\\{[^}]*return\\s+\\$this->${rel}\\s*\\(\\s*([\\w:]+)`, "g");
      let relMatch;
      while ((relMatch = relPattern.exec(content)) !== null) {
        const methodName = relMatch[1];
        const relatedModel = relMatch[2].replace(/.*::class/, "").replace(/::/g, "");
        relations.push(`${methodName}: ${rel}(${relatedModel})`);
      }
    }
    if (fields.length > 0 || relations.length > 0) {
      models.push({ name, fields, relations, orm: "eloquent" });
    }
  }
  return models;
}
function extractPhpExports(content) {
  const exports = [];
  const typePattern = /(?:^|\n)\s*(?:abstract\s+|final\s+)?(?:(class|interface|trait|enum))\s+(\w+)/g;
  let m;
  while ((m = typePattern.exec(content)) !== null) {
    const kind = m[1] === "interface" ? "interface" : m[1] === "enum" ? "enum" : "class";
    exports.push({ name: m[2], kind });
  }
  const methodPattern = /public\s+(?:static\s+)?function\s+(\w+)\s*\(/g;
  while ((m = methodPattern.exec(content)) !== null) {
    if (!exports.some((e) => e.name === m[1])) {
      exports.push({ name: m[1], kind: "function" });
    }
  }
  return exports;
}
var ELOQUENT_RELATIONS, AUDIT_FIELDS;
var init_extract_php = __esm(() => {
  ELOQUENT_RELATIONS = ["hasMany", "hasOne", "belongsTo", "belongsToMany", "hasManyThrough", "hasOneThrough", "morphTo", "morphMany", "morphOne"];
  AUDIT_FIELDS = new Set(["created_at", "updated_at", "deleted_at", "createdAt", "updatedAt", "deletedAt"]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-csharp.js
function extractPathParams6(path) {
  const params = [];
  const regex = /\{(\w+)(?::[^}]*)?\}/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function extractAspNetControllerRoutes(filePath, content, tags) {
  const routes = [];
  const classRouteMatch = content.match(/\[Route(?:Prefix)?\s*\(\s*"([^"]*)"\s*\)\]/);
  const classPrefix = classRouteMatch ? classRouteMatch[1] : "";
  for (const method of CSHARP_HTTP_METHODS) {
    const pattern = new RegExp(`\\[Http${method}(?:\\s*\\(\\s*"([^"]*)"\\s*\\))?\\]`, "g");
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const subPath = match[1] ?? "";
      let fullPath;
      if (subPath.startsWith("/")) {
        fullPath = subPath;
      } else if (classPrefix && subPath) {
        fullPath = "/" + classPrefix.replace(/^\//, "") + "/" + subPath.replace(/^\//, "");
      } else if (classPrefix) {
        fullPath = "/" + classPrefix.replace(/^\//, "");
      } else if (subPath) {
        fullPath = "/" + subPath.replace(/^\//, "");
      } else {
        fullPath = "/";
      }
      fullPath = fullPath.replace(/\/\//g, "/");
      routes.push({
        method: method.toUpperCase(),
        path: fullPath,
        file: filePath,
        tags,
        framework: "aspnet",
        params: extractPathParams6(fullPath),
        confidence: "regex"
      });
    }
  }
  return routes;
}
function extractAspNetMinimalApiRoutes(filePath, content, tags) {
  const routes = [];
  const mapPattern = /\.Map(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*"([^"]+)"/gi;
  let match;
  while ((match = mapPattern.exec(content)) !== null) {
    const path = match[2];
    routes.push({
      method: match[1].toUpperCase(),
      path,
      file: filePath,
      tags,
      framework: "aspnet",
      params: extractPathParams6(path),
      confidence: "regex"
    });
  }
  return routes;
}
function extractEntityFrameworkModels(_filePath, content) {
  const models = [];
  if (!content.includes("DbContext") && !content.includes("DbSet<")) {
    return models;
  }
  const dbSetPattern = /DbSet\s*<\s*(\w+)\s*>/g;
  const modelNames = new Set;
  let m;
  while ((m = dbSetPattern.exec(content)) !== null) {
    modelNames.add(m[1]);
  }
  if (modelNames.size === 0)
    return models;
  for (const modelName of modelNames) {
    const classPattern = new RegExp(`class\\s+${modelName}\\s*(?::\\s*[\\w<>, ]+)?\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m");
    const classMatch = content.match(classPattern);
    if (classMatch) {
      const body = classMatch[1];
      const fields = extractCSharpProperties(body);
      if (fields.length > 0) {
        models.push({
          name: modelName,
          fields,
          relations: extractCSharpRelations(body),
          orm: "entity-framework"
        });
        continue;
      }
    }
    models.push({
      name: modelName,
      fields: [],
      relations: [],
      orm: "entity-framework"
    });
  }
  return models;
}
function extractCSharpProperties(body) {
  const fields = [];
  const AUDIT = new Set(["CreatedAt", "UpdatedAt", "DeletedAt", "Timestamp", "RowVersion"]);
  const propPattern = /(?:\[([^\]]*)\]\s*)?public\s+([\w?<>, \[\]]+?)\s+(\w+)\s*\{\s*get;\s*(?:set;|init;)/g;
  let m;
  while ((m = propPattern.exec(body)) !== null) {
    const attributes = m[1] || "";
    const rawType = m[2].trim();
    const name = m[3];
    if (AUDIT.has(name))
      continue;
    if (/^I?(?:Collection|List|Enumerable|Queryable)</.test(rawType))
      continue;
    const type = rawType.replace(/\?$/, "");
    const nullable = rawType.endsWith("?");
    const flags = [];
    if (attributes.includes("Key") || name === "Id" || name.endsWith("Id") && name === name) {
      if (name === "Id" || attributes.includes("Key"))
        flags.push("pk");
    }
    if (name.endsWith("Id") && name !== "Id")
      flags.push("fk");
    if (attributes.includes("Required"))
      flags.push("required");
    if (nullable)
      flags.push("nullable");
    if (attributes.includes("MaxLength") || attributes.includes("StringLength")) {
      const lenMatch = attributes.match(/(?:MaxLength|StringLength)\s*\(\s*(\d+)/);
      if (lenMatch)
        flags.push(`max:${lenMatch[1]}`);
    }
    fields.push({ name, type, flags });
  }
  return fields;
}
function extractCSharpRelations(body) {
  const relations = [];
  const navPattern = /public\s+virtual\s+(I?(?:Collection|List)<\s*(\w+)\s*>|(\w+))\s+(\w+)\s*\{/g;
  let m;
  while ((m = navPattern.exec(body)) !== null) {
    const collectionType = m[2];
    const singleType = m[3];
    const propName = m[4];
    if (collectionType) {
      relations.push(`${propName}: ${collectionType}[]`);
    } else if (singleType && singleType !== "string" && singleType !== "int" && singleType !== "bool") {
      relations.push(`${propName}: ${singleType}`);
    }
  }
  return relations;
}
function extractCSharpExports(content) {
  const exports = [];
  const typePattern = /public\s+(?:static\s+|abstract\s+|sealed\s+|partial\s+)*(?:(class|interface|enum|record|struct))\s+(\w+)/g;
  let m;
  while ((m = typePattern.exec(content)) !== null) {
    const kind = m[1] === "interface" ? "interface" : m[1] === "enum" ? "enum" : "class";
    exports.push({ name: m[2], kind });
  }
  const methodPattern = /public\s+(?:static\s+|async\s+|virtual\s+|override\s+)*(?:Task<?[\w<>, \[\]]*>?|[\w<>, \[\]]+)\s+(\w+)\s*\(/g;
  while ((m = methodPattern.exec(content)) !== null) {
    const name = m[1];
    if (name === "string" || name === "int" || name === "bool" || name === "void")
      continue;
    if (!exports.some((e) => e.name === name)) {
      exports.push({ name, kind: "function" });
    }
  }
  return exports;
}
var CSHARP_HTTP_METHODS;
var init_extract_csharp = __esm(() => {
  CSHARP_HTTP_METHODS = ["Get", "Post", "Put", "Patch", "Delete", "Options", "Head"];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-dart.js
function extractPathParams7(path) {
  const params = [];
  const regex = /:(\w+)/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function extractFlutterRoutes(filePath, content, tags) {
  const routes = [];
  if (!content.includes("go_router") && !content.includes("GoRoute") && !content.includes("GoRouter")) {
    return routes;
  }
  const pathConstants = new Map;
  const constPat = /static\s+(?:const\s+)?(?:String\s+)?(\w+)\s*=\s*['"]([/][^'"]*)['"]/g;
  let m;
  while ((m = constPat.exec(content)) !== null) {
    pathConstants.set(m[1], m[2]);
  }
  const seen = new Set;
  function addRoute(path) {
    if (!path || seen.has(path))
      return;
    seen.add(path);
    routes.push({
      method: "GET",
      path,
      file: filePath,
      tags,
      framework: "flutter",
      params: extractPathParams7(path),
      confidence: "regex"
    });
  }
  const goRoutePattern = /GoRoute\s*\([^)]*path\s*:\s*['"]([^'"]+)['"]/g;
  while ((m = goRoutePattern.exec(content)) !== null)
    addRoute(m[1]);
  const positionalPat = /\b(\w*Route)\s*\(\s*(?:(['"])([^'"]+)\2|([\w.]+))/g;
  while ((m = positionalPat.exec(content)) !== null) {
    const literal = m[3];
    const identifier = m[4];
    if (literal) {
      if (!literal.includes("://") && !literal.includes(" ") && literal.length <= 80) {
        addRoute(literal.startsWith("/") ? literal : "/" + literal);
      }
    } else if (identifier) {
      const key = identifier.split(".").pop();
      const resolved = pathConstants.get(key);
      if (resolved)
        addRoute(resolved);
    }
  }
  const shellRoutePattern = /StatefulShellRoute[^(]*\([^)]*path\s*:\s*['"]([^'"]+)['"]/g;
  while ((m = shellRoutePattern.exec(content)) !== null)
    addRoute(m[1]);
  return routes;
}
function extractFlutterWidgets(filePath, content) {
  const widgets = [];
  for (const base of WIDGET_BASE_CLASSES) {
    const pattern = new RegExp(`class\\s+(\\w+)\\s+extends\\s+(?:[\\w.]+\\.)?${base}\\b`, "g");
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const name = m[1];
      if (name.startsWith("_"))
        continue;
      const props = extractDartConstructorParams(content, name);
      widgets.push({
        name,
        file: filePath,
        props,
        isClient: true,
        isServer: false
      });
    }
  }
  return widgets;
}
function extractDartConstructorParams(content, className) {
  const props = [];
  const ctorPattern = new RegExp(`${className}\\s*\\(\\s*\\{([^}]+)\\}`, "s");
  const m = content.match(ctorPattern);
  if (!m)
    return props;
  const paramsBlock = m[1];
  const paramPattern = /(?:required\s+)?(?:final\s+)?(?:[\w<>?, \[\]]+\s+)?this\.(\w+)|(?:required\s+)?(?:final\s+)[\w<>?, \[\]]+\s+(\w+)/g;
  let pm;
  while ((pm = paramPattern.exec(paramsBlock)) !== null) {
    const name = pm[1] || pm[2];
    if (name && name !== "key" && !name.startsWith("_")) {
      props.push(name);
    }
  }
  return props.slice(0, 10);
}
function extractDartExports(content) {
  const exports = [];
  const typePattern = /(?:^|\n)\s*(?:abstract\s+|sealed\s+|final\s+|base\s+)?(?:(class|mixin|enum|extension))\s+([A-Z]\w*)/g;
  let m;
  while ((m = typePattern.exec(content)) !== null) {
    const kind = m[1] === "enum" ? "enum" : m[1] === "mixin" ? "class" : "class";
    exports.push({ name: m[2], kind });
  }
  const fnPattern = /(?:^|\n)\s*(?:Future<?[\w<>, \[\]]*>?|Stream<?[\w<>, \[\]]*>?|[\w<>?, \[\]]+)\s+([a-z]\w+)\s*\(/g;
  while ((m = fnPattern.exec(content)) !== null) {
    const name = m[1];
    if (name.startsWith("_"))
      continue;
    if (["if", "else", "for", "while", "switch", "return", "await", "async"].includes(name))
      continue;
    if (!exports.some((e) => e.name === name)) {
      exports.push({ name, kind: "function" });
    }
  }
  return exports;
}
var WIDGET_BASE_CLASSES;
var init_extract_dart = __esm(() => {
  WIDGET_BASE_CLASSES = [
    "StatelessWidget",
    "StatefulWidget",
    "ConsumerWidget",
    "HookWidget",
    "HookConsumerWidget",
    "ConsumerStatefulWidget",
    "InheritedWidget",
    "InheritedNotifier",
    "InheritedModel"
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-swift.js
function extractPathParams8(path) {
  const params = [];
  const regex = /:(\w+)/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function extractVaporRoutes(filePath, content, tags) {
  const routes = [];
  if (!content.includes("app.get") && !content.includes("app.post") && !content.includes("routes.get") && !content.includes("routes.post") && !content.includes("grouped") && !content.includes("RouteCollection")) {
    return routes;
  }
  for (const method of VAPOR_HTTP_METHODS) {
    const pattern = new RegExp(`(?:app|routes|router)\\s*\\.\\s*${method}\\s*\\(([^{]+?)(?:,\\s*use:|\\s*\\{)`, "g");
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const argsRaw = m[1];
      const segments = [];
      const segPattern = /["']([^"']+)["']/g;
      let seg;
      while ((seg = segPattern.exec(argsRaw)) !== null) {
        segments.push(seg[1]);
      }
      if (segments.length === 0)
        continue;
      const path = "/" + segments.join("/");
      routes.push({
        method: method.toUpperCase(),
        path,
        file: filePath,
        tags,
        framework: "vapor",
        params: extractPathParams8(path),
        confidence: "regex"
      });
    }
    const onPattern = new RegExp(`\\.on\\s*\\(\\s*\\.${method.toUpperCase()}\\s*,\\s*["']([^"']+)["']`, "gi");
    while ((m = onPattern.exec(content)) !== null) {
      const path = m[1].startsWith("/") ? m[1] : "/" + m[1];
      routes.push({
        method: method.toUpperCase(),
        path,
        file: filePath,
        tags,
        framework: "vapor",
        params: extractPathParams8(path),
        confidence: "regex"
      });
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function extractSwiftUIViews(filePath, content) {
  const views = [];
  for (const proto of SWIFTUI_PROTOCOLS) {
    if (proto === "PreviewProvider")
      continue;
    const pattern = new RegExp(`struct\\s+(\\w+)\\s*:\\s*(?:[\\w, .]*\\b)?${proto}\\b`, "g");
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const name = m[1];
      if (name.startsWith("_"))
        continue;
      const props = extractSwiftViewProps(content, name);
      views.push({
        name,
        file: filePath,
        props,
        isClient: true,
        isServer: false
      });
    }
  }
  return views;
}
function extractSwiftViewProps(content, _viewName) {
  const props = [];
  const propPattern = /(?:@(?:Binding|State|ObservedObject|EnvironmentObject|StateObject|Environment)\s+)?var\s+(\w+)\s*:\s*[\w<>?,\s\[\]]+/g;
  let m;
  while ((m = propPattern.exec(content)) !== null) {
    const name = m[1];
    if (name.startsWith("_") || name === "body" || name === "previews")
      continue;
    if (!props.includes(name))
      props.push(name);
  }
  return props.slice(0, 10);
}
function extractSwiftExports(content) {
  const exports = [];
  const typePattern = /(?:^|\n)\s*(?:public|open)\s+(?:final\s+|class\s+|struct\s+|enum\s+|protocol\s+|actor\s+)?(?:(class|struct|enum|protocol|actor))\s+(\w+)/g;
  let m;
  while ((m = typePattern.exec(content)) !== null) {
    const kind = m[1] === "protocol" ? "interface" : m[1] === "enum" ? "enum" : "class";
    exports.push({ name: m[2], kind });
  }
  const funcPattern = /(?:^|\n)\s*(?:public|open)\s+(?:static\s+|class\s+|mutating\s+)?func\s+(\w+)\s*[(<]/g;
  while ((m = funcPattern.exec(content)) !== null) {
    const name = m[1];
    if (!exports.some((e) => e.name === name)) {
      exports.push({ name, kind: "function" });
    }
  }
  return exports;
}
var VAPOR_HTTP_METHODS, SWIFTUI_PROTOCOLS;
var init_extract_swift = __esm(() => {
  VAPOR_HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];
  SWIFTUI_PROTOCOLS = [
    "View",
    "PreviewProvider",
    "UIViewRepresentable",
    "UIViewControllerRepresentable",
    "NSViewRepresentable"
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-android.js
function extractRetrofitParams(path) {
  const params = [];
  const regex = /\{(\w+)\}/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
function extractRetrofitRoutes(filePath, content, tags) {
  if (!content.includes("@GET") && !content.includes("@POST") && !content.includes("@PUT") && !content.includes("@DELETE") && !content.includes("@PATCH") && !content.includes("@HTTP"))
    return [];
  const routes = [];
  const retrofitPat = /@(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*"([^"]*)"\s*\)/g;
  let m;
  while ((m = retrofitPat.exec(content)) !== null) {
    routes.push({
      method: m[1],
      path: m[2].startsWith("/") ? m[2] : "/" + m[2],
      file: filePath,
      tags,
      framework: "android",
      params: extractRetrofitParams(m[2]),
      confidence: "regex"
    });
  }
  const httpPat = /@HTTP\s*\([^)]*method\s*=\s*"(\w+)"[^)]*path\s*=\s*"([^"]+)"/g;
  while ((m = httpPat.exec(content)) !== null) {
    routes.push({
      method: m[1].toUpperCase(),
      path: m[2].startsWith("/") ? m[2] : "/" + m[2],
      file: filePath,
      tags,
      framework: "android",
      params: extractRetrofitParams(m[2]),
      confidence: "regex"
    });
  }
  return routes;
}
function extractRoomEntities(_filePath, content) {
  if (!content.includes("@Entity"))
    return [];
  const models = [];
  const entityStartPat = /@Entity\s*(?:\([^)]*\))?\s*(?:data\s+)?class\s+(\w+)\s*\(/g;
  let m;
  while ((m = entityStartPat.exec(content)) !== null) {
    const name = m[1];
    const paramsStart = m.index + m[0].length;
    const paramsBody = extractParenBlock(content, paramsStart);
    if (!paramsBody)
      continue;
    const entityAnnotation = content.slice(content.lastIndexOf("@Entity", m.index), m.index + m[0].length);
    const tableMatch = entityAnnotation.match(/tableName\s*=\s*"([^"]+)"/);
    const fields = [];
    const relations = [];
    for (const line of paramsBody.split(",")) {
      const trimmed = line.trim();
      if (!trimmed)
        continue;
      const fieldMatch = trimmed.match(/(?:val|var)\s+(\w+)\s*:\s*([\w<>?.]+)/);
      if (!fieldMatch)
        continue;
      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const flags = [];
      if (/@PrimaryKey/.test(trimmed)) {
        flags.push("pk");
        if (/autoGenerate\s*=\s*true/.test(trimmed))
          flags.push("auto");
      }
      if (fieldType.endsWith("?"))
        flags.push("nullable");
      if (/=\s*\S/.test(trimmed) && !/@PrimaryKey/.test(trimmed))
        flags.push("default");
      if (/@Ignore/.test(trimmed))
        continue;
      if (/@Relation/.test(trimmed) || /@Embedded/.test(trimmed)) {
        relations.push(`${fieldName}: ${fieldType.replace("?", "")}`);
        continue;
      }
      fields.push({
        name: fieldName,
        type: fieldType.replace("?", ""),
        flags
      });
    }
    if (fields.length > 0) {
      models.push({
        name: tableMatch ? `${name} (${tableMatch[1]})` : name,
        fields,
        relations,
        orm: "room",
        confidence: "regex"
      });
    }
  }
  return models;
}
function extractParenBlock(content, startAfterOpenParen) {
  let depth = 1;
  let i = startAfterOpenParen;
  while (i < content.length && depth > 0) {
    if (content[i] === "(")
      depth++;
    else if (content[i] === ")")
      depth--;
    i++;
  }
  if (depth !== 0)
    return null;
  return content.slice(startAfterOpenParen, i - 1);
}
function extractComposeComponents(filePath, content) {
  if (!content.includes("@Composable"))
    return [];
  const components = [];
  const seen = new Set;
  const composablePat = /@Composable\s+(?:(?:private|internal|public)\s+)?fun\s+([A-Z]\w*)\s*\(([^)]*)\)/gs;
  let m;
  while ((m = composablePat.exec(content)) !== null) {
    const name = m[1];
    if (seen.has(name))
      continue;
    seen.add(name);
    const paramsStr = m[2];
    const props = [];
    const paramPat = /(\w+)\s*:\s*([\w<>().,?\s*]+?)(?:\s*=\s*[^,)]+)?(?:,|$)/g;
    let pm;
    while ((pm = paramPat.exec(paramsStr)) !== null) {
      const paramName = pm[1].trim();
      const paramType = pm[2].trim();
      if (paramName === "modifier" || paramType === "Modifier")
        continue;
      if (paramName)
        props.push(paramName);
    }
    components.push({
      name,
      file: filePath,
      props,
      isClient: true,
      isServer: false,
      confidence: "regex"
    });
  }
  return components;
}
function extractNavigationRoutes(filePath, content) {
  const routes = [];
  const destPat = /<(fragment|activity)\s+[^>]*android:name\s*=\s*"([^"]+)"[^>]*/g;
  let m;
  while ((m = destPat.exec(content)) !== null) {
    const type = m[1];
    const fullName = m[2];
    const segment = m[0];
    const labelMatch = segment.match(/android:label\s*=\s*"([^"]+)"/);
    const label = labelMatch ? labelMatch[1] : null;
    const shortName = fullName.split(".").pop() || fullName;
    const path = "/" + shortName;
    routes.push({
      method: type === "activity" ? "ACTIVITY" : "SCREEN",
      path,
      file: filePath,
      tags: label ? [label] : [],
      framework: "android",
      confidence: "regex"
    });
  }
  return routes;
}
function extractActivitiesFromManifest(filePath, content) {
  const routes = [];
  const seen = new Set;
  const activityPat = /<activity\s+[^>]*android:name\s*=\s*"([^"]+)"[^]*?(?:\/>|<\/activity>)/g;
  let m;
  while ((m = activityPat.exec(content)) !== null) {
    const fullName = m[1];
    const segment = m[0];
    const shortName = fullName.startsWith(".") ? fullName.slice(1) : fullName.split(".").pop() || fullName;
    if (seen.has(shortName))
      continue;
    seen.add(shortName);
    const isLauncher = segment.includes("android.intent.category.LAUNCHER");
    const tags = [];
    if (isLauncher)
      tags.push("launcher");
    routes.push({
      method: "ACTIVITY",
      path: "/" + shortName,
      file: filePath,
      tags,
      framework: "android",
      confidence: "regex"
    });
  }
  return routes;
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-scenegraph.js
var exports_extract_scenegraph = {};
__export(exports_extract_scenegraph, {
  isSceneGraphXml: () => isSceneGraphXml,
  extractSceneGraphComponent: () => extractSceneGraphComponent,
  extractMainSceneScreens: () => extractMainSceneScreens
});
function extractSceneGraphComponent(content) {
  const componentMatch = content.match(/<component\s+([^>]+?)\s*(?:>|\/>)/i);
  if (!componentMatch)
    return null;
  const attrs = componentMatch[1];
  const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!name)
    return null;
  const extendsType = attrs.match(/\bextends\s*=\s*["']([^"']+)["']/i)?.[1] ?? "Group";
  const interfaceFields = [];
  const interfaceFunctions = [];
  const interfaceBlock = content.match(/<interface\b[^>]*>([\s\S]*?)<\/interface>/i);
  if (interfaceBlock) {
    const body = interfaceBlock[1];
    const fieldPattern = /<field\s+([^>]+?)\s*\/?\s*>/gi;
    let m;
    while ((m = fieldPattern.exec(body)) !== null) {
      const fieldAttrs = m[1];
      const id = fieldAttrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!id)
        continue;
      const rawType = fieldAttrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? "unknown";
      const hasDefault = /\bvalue\s*=/i.test(fieldAttrs) || /\bdefault\s*=/i.test(fieldAttrs);
      const isAlias = /\balias\s*=/i.test(fieldAttrs);
      const flags = [];
      if (hasDefault)
        flags.push("default");
      if (isAlias)
        flags.push("alias");
      interfaceFields.push({ name: id, type: normalizeSceneGraphType(rawType), flags });
    }
    const functionPattern = /<function\s+([^>]+?)\s*\/?\s*>/gi;
    while ((m = functionPattern.exec(body)) !== null) {
      const fnName = m[1].match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
      if (fnName)
        interfaceFunctions.push(fnName);
    }
  }
  const scriptIncludes = [];
  const scriptPattern = /<script\s+([^>]+?)\s*\/?\s*>/gi;
  let s;
  while ((s = scriptPattern.exec(content)) !== null) {
    const uri = s[1].match(/\buri\s*=\s*["']([^"']+)["']/i)?.[1];
    if (uri)
      scriptIncludes.push(uri);
  }
  const childComponents = [];
  const childrenBlock = content.match(/<children\b[^>]*>([\s\S]*?)<\/children>/i);
  if (childrenBlock) {
    const body = childrenBlock[1];
    const childPattern = /<([A-Z][\w:-]*)\b/g;
    let c;
    while ((c = childPattern.exec(body)) !== null) {
      childComponents.push(c[1]);
    }
  }
  return { name, extendsType, interfaceFields, interfaceFunctions, scriptIncludes, childComponents };
}
function extractMainSceneScreens(content) {
  const result = {};
  const childrenBlock = content.match(/<children\b[^>]*>([\s\S]*?)<\/children>/i);
  if (!childrenBlock)
    return result;
  const body = childrenBlock[1];
  const elementPattern = /<([A-Z][\w:-]*)\b([^>]*)\/?>/g;
  let m;
  while ((m = elementPattern.exec(body)) !== null) {
    const componentType = m[1];
    const attrs = m[2];
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!id)
      continue;
    result[id] = componentType;
  }
  return result;
}
function isSceneGraphXml(content) {
  if (!/<component\b/i.test(content))
    return false;
  if (!/\bname\s*=/i.test(content))
    return false;
  if (/xmlns:android\s*=/.test(content))
    return false;
  return true;
}
function normalizeSceneGraphType(raw) {
  const t = raw.trim().toLowerCase();
  switch (t) {
    case "string":
    case "str":
      return "string";
    case "integer":
    case "int":
      return "int";
    case "float":
      return "float";
    case "boolean":
    case "bool":
      return "bool";
    case "double":
      return "double";
    case "longinteger":
      return "longInteger";
    case "node":
      return "node-ref";
    case "nodearray":
      return "node-ref[]";
    case "array":
      return "array";
    case "assocarray":
      return "object";
    case "color":
      return "color";
    case "vector2d":
      return "vector2d";
    case "rect2d":
      return "rect2d";
    case "time":
      return "time";
    default:
      return raw;
  }
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-brightscript.js
var exports_extract_brightscript = {};
__export(exports_extract_brightscript, {
  extractFindNodeBindings: () => extractFindNodeBindings,
  extractBrightScriptShowScreenCalls: () => extractBrightScriptShowScreenCalls,
  extractBrightScriptRudderstackEvents: () => extractBrightScriptRudderstackEvents,
  extractBrightScriptObservers: () => extractBrightScriptObservers,
  extractBrightScriptNavigationCalls: () => extractBrightScriptNavigationCalls,
  extractBrightScriptGraphqlCalls: () => extractBrightScriptGraphqlCalls,
  extractBrightScriptGlobalFields: () => extractBrightScriptGlobalFields,
  extractBrightScriptFunctions: () => extractBrightScriptFunctions
});
function extractBrightScriptFunctions(content) {
  const exports = [];
  const lines = content.split(`
`);
  const declPattern = /^(function|sub)\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/i;
  const seen = new Set;
  for (const line of lines) {
    const m = line.match(declPattern);
    if (!m)
      continue;
    const kind = m[1].toLowerCase() === "sub" ? "sub" : "function";
    const name = m[2];
    const params = m[3].trim();
    if (seen.has(name))
      continue;
    seen.add(name);
    exports.push({
      name,
      kind: "function",
      signature: `${kind} ${name}(${params})`
    });
  }
  return exports;
}
function extractBrightScriptObservers(content) {
  const out = [];
  const lines = content.split(`
`);
  const pattern = /(\bm\.top|\bm\.global|\b[\w.]+?)\.observeField(?:Scoped)?\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/gi;
  for (let i = 0;i < lines.length; i++) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(lines[i])) !== null) {
      const receiver = match[1];
      let scope = "other";
      if (/^m\.top$/i.test(receiver))
        scope = "top";
      else if (/^m\.global$/i.test(receiver))
        scope = "global";
      out.push({ field: match[2], handler: match[3], scope, line: i + 1 });
    }
  }
  return out;
}
function extractBrightScriptNavigationCalls(content, helperNames) {
  const out = [];
  if (helperNames.length === 0)
    return out;
  const lines = content.split(`
`);
  const alternation = helperNames.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`\\b(?:${alternation})\\s*\\(\\s*([^),]+?)\\s*(?:,\\s*(true|false|\\w+))?\\s*\\)`, "gi");
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(line)) !== null) {
      const target = m[1].trim();
      if (!target || /^["']/.test(target) || /^\d/.test(target))
        continue;
      const second = (m[2] ?? "").trim().toLowerCase();
      out.push({
        target,
        modal: second === "true",
        helper: "show",
        line: i + 1
      });
    }
  }
  return out;
}
function extractBrightScriptShowScreenCalls(content) {
  const out = [];
  const lines = content.split(`
`);
  const showPattern = /\bShowScreen\s*\(\s*([^),]+?)\s*(?:,\s*(true|false|\w+))?\s*\)/gi;
  const closePattern = /\bCloseScreen\s*\(\s*\)/gi;
  const currentPattern = /\bGetCurrentScreen\s*\(\s*\)/gi;
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    let m;
    showPattern.lastIndex = 0;
    while ((m = showPattern.exec(line)) !== null) {
      const target = m[1].trim();
      const second = (m[2] ?? "").trim().toLowerCase();
      out.push({
        target,
        modal: second === "true",
        helper: "show",
        line: i + 1
      });
    }
    closePattern.lastIndex = 0;
    while ((m = closePattern.exec(line)) !== null) {
      out.push({ target: "", modal: false, helper: "close", line: i + 1 });
    }
    currentPattern.lastIndex = 0;
    while ((m = currentPattern.exec(line)) !== null) {
      out.push({ target: "", modal: false, helper: "current", line: i + 1 });
    }
  }
  return out;
}
function extractBrightScriptGraphqlCalls(content) {
  const out = [];
  const lines = content.split(`
`);
  const gqlPattern = /\bmakeGraphqlCall\s*\(\s*([^,]+?)\s*,/gi;
  const urlXferPattern = /\bCreateObject\s*\(\s*["']roUrlTransfer["']\s*\)/gi;
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    let m;
    gqlPattern.lastIndex = 0;
    while ((m = gqlPattern.exec(line)) !== null) {
      out.push({ url: m[1].trim(), line: i + 1 });
    }
    urlXferPattern.lastIndex = 0;
    while ((m = urlXferPattern.exec(line)) !== null) {
      out.push({ url: "roUrlTransfer", line: i + 1 });
    }
  }
  return out;
}
function extractBrightScriptGlobalFields(content) {
  const out = [];
  const lines = content.split(`
`);
  const pattern = /\bm\.global\.(?:AddField|addField)\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/gi;
  for (let i = 0;i < lines.length; i++) {
    let m;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(lines[i])) !== null) {
      out.push({ name: m[1], type: m[2], line: i + 1 });
    }
  }
  return out;
}
function extractBrightScriptRudderstackEvents(content) {
  const out = [];
  const lines = content.split(`
`);
  const eventFieldPattern = /\bevent\s*:\s*["']([^"']+)["']/gi;
  const callFuncPattern = /rudderstack[\w.]*\.callFunc\s*\(\s*["'][^"']*["']\s*,\s*["']([^"']+)["']/gi;
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    if (/rudderstack/i.test(line) || /\btrackEvent\b/i.test(line)) {
      let m2;
      eventFieldPattern.lastIndex = 0;
      while ((m2 = eventFieldPattern.exec(line)) !== null) {
        out.push({ name: m2[1], line: i + 1 });
      }
    }
    let m;
    callFuncPattern.lastIndex = 0;
    while ((m = callFuncPattern.exec(line)) !== null) {
      out.push({ name: m[1], line: i + 1 });
    }
  }
  return out;
}
function extractFindNodeBindings(content) {
  const result = {};
  const lines = content.split(`
`);
  const pattern = /\bm\.(\w+)\s*=\s*m\.top\.findNode\s*\(\s*["']([^"']+)["']\s*\)/i;
  for (const line of lines) {
    const m = line.match(pattern);
    if (!m)
      continue;
    result[`m.${m[1]}`] = m[2];
  }
  return result;
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/routes.js
import { relative as relative3, basename as basename2 } from "path";
async function detectRoutes(files, project, config) {
  const routes = [];
  for (const fw of project.frameworks) {
    switch (fw) {
      case "next-app":
        routes.push(...await detectNextAppRoutes(files, project));
        break;
      case "next-pages":
        routes.push(...await detectNextPagesApi(files, project));
        break;
      case "hono":
        routes.push(...await detectHonoRoutes(files, project));
        break;
      case "express":
        routes.push(...await detectExpressRoutes(files, project));
        break;
      case "fastify":
        routes.push(...await detectFastifyRoutes(files, project));
        break;
      case "koa":
        routes.push(...await detectKoaRoutes(files, project));
        break;
      case "nestjs":
        routes.push(...await detectNestJSRoutes(files, project));
        break;
      case "elysia":
        routes.push(...await detectElysiaRoutes(files, project));
        break;
      case "adonis":
        routes.push(...await detectAdonisRoutes(files, project));
        break;
      case "trpc":
        routes.push(...await detectTRPCRoutes(files, project));
        break;
      case "sveltekit":
        routes.push(...await detectSvelteKitRoutes(files, project));
        break;
      case "remix":
        routes.push(...await detectRemixRoutes(files, project));
        break;
      case "nuxt":
        routes.push(...await detectNuxtRoutes(files, project));
        break;
      case "fastapi":
        routes.push(...await detectFastAPIRoutes(files, project));
        break;
      case "flask":
        routes.push(...await detectFlaskRoutes(files, project));
        break;
      case "django":
        routes.push(...await detectDjangoRoutes(files, project));
        break;
      case "gin":
      case "go-net-http":
      case "fiber":
      case "echo":
      case "chi":
        routes.push(...await detectGoRoutes(files, project, fw));
        break;
      case "rails":
        routes.push(...await detectRailsRoutes(files, project));
        break;
      case "phoenix":
        routes.push(...await detectPhoenixRoutes(files, project));
        break;
      case "spring":
        routes.push(...await detectSpringRoutes(files, project));
        break;
      case "ktor":
        routes.push(...await detectKtorRoutes(files, project));
        break;
      case "actix":
      case "axum":
        routes.push(...await detectRustRoutes(files, project, fw));
        break;
      case "raw-http":
        routes.push(...await detectRawHttpRoutes(files, project));
        break;
      case "php":
        routes.push(...await detectPHPRoutes(files, project));
        break;
      case "laravel":
        routes.push(...await detectLaravelRoutes(files, project));
        break;
      case "aspnet":
        routes.push(...await detectAspNetRoutes(files, project));
        break;
      case "flutter":
        routes.push(...await detectFlutterGoRoutes(files, project));
        break;
      case "vapor":
        routes.push(...await detectVaporRoutes(files, project));
        break;
      case "android":
        routes.push(...await detectAndroidRoutes(files, project));
        break;
      case "angular":
        routes.push(...await detectAngularRoutes(files, project));
        break;
      case "roku-scenegraph":
        routes.push(...await detectRokuScreens(files, project, config));
        break;
    }
  }
  const prefixed = await resolveRoutePrefixes(routes, files, project);
  const seen = new Set;
  const deduped = [];
  for (const route of prefixed) {
    const key = `${route.method}:${route.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(route);
    }
  }
  if (config?.customRoutePatterns?.length) {
    for (const file of files) {
      const content = await readFileSafe(file);
      if (!content)
        continue;
      const rel = relative3(process.cwd(), file);
      for (const { pattern, method = "ALL" } of config.customRoutePatterns) {
        let re;
        try {
          re = new RegExp(pattern, "g");
        } catch {
          continue;
        }
        for (const match of content.matchAll(re)) {
          const extractedPath = match[1] ?? `/${rel}`;
          const routeKey = `${method}:${extractedPath}`;
          if (!seen.has(routeKey)) {
            seen.add(routeKey);
            deduped.push({
              method,
              path: extractedPath,
              file: rel,
              tags: detectTags(content),
              framework: project.frameworks[0] ?? "raw-http",
              confidence: "regex"
            });
          }
        }
      }
    }
  }
  return deduped;
}
async function detectNextAppRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/[/\\]app[/\\].*[/\\]route\.(ts|js|tsx|jsx)$/) || f.match(/[/\\]app[/\\]route\.(ts|js|tsx|jsx)$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const pathMatch = rel.match(/(?:^|\/)(?:src\/)?app(?=\/)(\/.*?)\/route\./);
    let apiPath = pathMatch ? pathMatch[1] || "/" : "/";
    apiPath = apiPath.replace(/\/\([^)]+\)/g, "") || "/";
    for (const method of HTTP_METHODS2) {
      const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
      if (pattern.test(content)) {
        routes.push({
          method,
          path: apiPath,
          file: rel,
          tags: detectTags(content),
          framework: "next-app"
        });
      }
    }
  }
  return routes;
}
async function detectNextPagesApi(files, project) {
  const apiFiles = files.filter((f) => f.match(/[/\\]pages[/\\]api[/\\].*\.(ts|js|tsx|jsx)$/));
  const routes = [];
  for (const file of apiFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const pathMatch = rel.match(/(?:src\/)?pages(\/api\/.*)\.(?:ts|js|tsx|jsx)$/);
    let apiPath = pathMatch ? pathMatch[1] : "/api";
    apiPath = apiPath.replace(/\/index$/, "").replace(/\[([^\]]+)\]/g, ":$1");
    const methods = [];
    for (const method of HTTP_METHODS2) {
      if (content.includes(`req.method === '${method}'`) || content.includes(`req.method === "${method}"`)) {
        methods.push(method);
      }
    }
    if (methods.length === 0)
      methods.push("ALL");
    for (const method of methods) {
      routes.push({
        method,
        path: apiPath,
        file: rel,
        tags: detectTags(content),
        framework: "next-pages"
      });
    }
  }
  return routes;
}
async function detectHonoRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js|tsx|jsx|mjs)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("hono") && !content.includes("Hono"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "hono");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const routePattern = /\.\s*(get|post|put|patch|delete|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      const path = match[2];
      if (!path.startsWith("/") && !path.startsWith(":"))
        return;
      routes.push({
        method: match[1].toUpperCase(),
        path,
        file: rel,
        tags: scopedTags[i],
        framework: "hono",
        confidence: "regex"
      });
    });
  }
  return routes;
}
async function detectExpressRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js|mjs|cjs)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("express") && !content.includes("Router"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "express");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const routePattern = /(?:app|router|server)\s*\.\s*(get|post|put|patch|delete|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: scopedTags[i],
        framework: "express",
        confidence: "regex"
      });
    });
  }
  return routes;
}
async function detectFastifyRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js|mjs|cjs)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("fastify"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "fastify");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const routePattern = /(?:fastify|server|app)\s*\.\s*(get|post|put|patch|delete|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: scopedTags[i],
        framework: "fastify",
        confidence: "regex"
      });
    });
    const objPattern = /\.route\s*\(\s*\{[\s\S]*?method:\s*['"`](\w+)['"`][\s\S]*?url:\s*['"`]([^'"`]+)['"`]/gi;
    const objMatches = Array.from(content.matchAll(objPattern));
    const objTags = detectTagsScoped(content, objMatches.map((m) => m.index));
    objMatches.forEach((match, i) => {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: objTags[i],
        framework: "fastify",
        confidence: "regex"
      });
    });
  }
  return routes;
}
async function detectKoaRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js|mjs|cjs)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("koa") && !content.includes("Router"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "koa");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const routePattern = /router\s*\.\s*(get|post|put|patch|delete|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: scopedTags[i],
        framework: "koa",
        confidence: "regex"
      });
    });
  }
  return routes;
}
async function detectNestJSRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("@Controller") && !content.includes("@Get") && !content.includes("@Post"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "nestjs");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
    const basePath = controllerMatch ? "/" + controllerMatch[1].replace(/^\//, "") : "";
    const decoratorPattern = /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/gi;
    const matches = Array.from(content.matchAll(decoratorPattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      const method = match[1].toUpperCase();
      const subPath = match[2] || "";
      const fullPath = basePath + (subPath ? "/" + subPath.replace(/^\//, "") : "") || "/";
      routes.push({
        method,
        path: fullPath,
        file: rel,
        tags: scopedTags[i],
        framework: "nestjs",
        confidence: "regex"
      });
    });
  }
  return routes;
}
async function detectElysiaRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js|mjs)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("elysia") && !content.includes("Elysia"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "elysia");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const routePattern = /\.\s*(get|post|put|patch|delete|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      const path = match[2];
      if (!path.startsWith("/") && !path.startsWith(":"))
        return;
      routes.push({
        method: match[1].toUpperCase(),
        path,
        file: rel,
        tags: scopedTags[i],
        framework: "elysia",
        confidence: "regex"
      });
    });
  }
  return routes;
}
async function detectAdonisRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/routes\.(ts|js)$/) || f.match(/\/routes\/.*\.(ts|js)$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file);
    const routePattern = /(?:Route|router)\s*\.\s*(get|post|put|patch|delete|any)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      routes.push({
        method: match[1].toUpperCase() === "ANY" ? "ALL" : match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: scopedTags[i],
        framework: "adonis"
      });
    });
  }
  return routes;
}
async function detectTRPCRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js)$/));
  const routes = [];
  const ts = loadTypeScript(project.root);
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("Procedure") && !content.includes("procedure") && !content.includes("router"))
      continue;
    if (!content.includes("trpc") && !content.includes("TRPC") && !content.includes("createTRPCRouter") && !content.includes("publicProcedure") && !content.includes("protectedProcedure"))
      continue;
    const rel = relative3(project.root, file);
    if (ts) {
      const astRoutes = extractRoutesAST(ts, rel, content, "trpc");
      if (astRoutes.length > 0) {
        routes.push(...astRoutes);
        continue;
      }
    }
    const lines = content.split(`
`);
    const found = [];
    let offset = 0;
    for (const line of lines) {
      const queryMatch = line.match(/^\s*(\w+)\s*:\s*.*\.(query)\s*\(/);
      const mutationMatch = line.match(/^\s*(\w+)\s*:\s*.*\.(mutation)\s*\(/);
      const m = queryMatch || mutationMatch;
      if (m)
        found.push({ procName: m[1], isQuery: m[2] === "query", offset });
      offset += line.length + 1;
    }
    const scopedTags = detectTagsScoped(content, found.map((f) => f.offset));
    found.forEach((f, i) => {
      if (!routes.some((r) => r.path === f.procName && r.file === rel)) {
        routes.push({
          method: f.isQuery ? "QUERY" : "MUTATION",
          path: f.procName,
          file: rel,
          tags: scopedTags[i],
          framework: "trpc",
          confidence: "regex"
        });
      }
    });
  }
  return routes;
}
async function detectSvelteKitRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/[/\\]routes[/\\].*\+server\.(ts|js)$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const pathMatch = rel.match(/(?:src\/)?routes(.*)\/\+server\./);
    let apiPath = pathMatch ? pathMatch[1] || "/" : "/";
    apiPath = apiPath.replace(/\[([^\]]+)\]/g, ":$1");
    for (const method of HTTP_METHODS2) {
      const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
      if (pattern.test(content)) {
        routes.push({
          method,
          path: apiPath,
          file: rel,
          tags: detectTags(content),
          framework: "sveltekit"
        });
      }
    }
    for (const method of HTTP_METHODS2) {
      const constPattern = new RegExp(`export\\s+const\\s+${method}\\s*[=:]`);
      if (constPattern.test(content) && !routes.some((r) => r.method === method && r.path === apiPath)) {
        routes.push({
          method,
          path: apiPath,
          file: rel,
          tags: detectTags(content),
          framework: "sveltekit"
        });
      }
    }
  }
  return routes;
}
async function detectRemixRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/[/\\]routes[/\\].*\.(ts|tsx|js|jsx)$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const pathMatch = rel.match(/(?:app\/)?routes\/(.+)\.(ts|tsx|js|jsx)$/);
    if (!pathMatch)
      continue;
    let routePath = "/" + pathMatch[1].replace(/\./g, "/").replace(/_index$/, "").replace(/\$/g, ":").replace(/\[([^\]]+)\]/g, ":$1");
    if (content.match(/export\s+(?:async\s+)?function\s+loader\b/) || content.match(/export\s+const\s+loader\b/)) {
      routes.push({
        method: "GET",
        path: routePath,
        file: rel,
        tags: detectTags(content),
        framework: "remix"
      });
    }
    if (content.match(/export\s+(?:async\s+)?function\s+action\b/) || content.match(/export\s+const\s+action\b/)) {
      routes.push({
        method: "POST",
        path: routePath,
        file: rel,
        tags: detectTags(content),
        framework: "remix"
      });
    }
  }
  return routes;
}
async function detectNuxtRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/[/\\]server[/\\](?:api|routes)[/\\].*\.(ts|js|mjs)$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const pathMatch = rel.match(/server\/((?:api|routes)\/.+)\.(ts|js|mjs)$/);
    if (!pathMatch)
      continue;
    let routePath = "/" + pathMatch[1].replace(/\/index$/, "").replace(/\[([^\]]+)\]/g, ":$1");
    const methodFromFile = basename2(file).match(/\.(get|post|put|patch|delete)\.(ts|js|mjs)$/);
    const method = methodFromFile ? methodFromFile[1].toUpperCase() : "ALL";
    if (methodFromFile) {
      routePath = routePath.replace(new RegExp(`\\.${methodFromFile[1]}$`), "");
    }
    routes.push({
      method,
      path: routePath,
      file: rel,
      tags: detectTags(content),
      framework: "nuxt"
    });
  }
  return routes;
}
async function detectFastAPIRoutes(files, project) {
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  const routes = [];
  for (const file of pyFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("fastapi") && !content.includes("FastAPI") && !content.includes("APIRouter"))
      continue;
    const rel = relative3(project.root, file);
    const tags = detectTags(content);
    const astRoutes = await extractPythonRoutesAST(rel, content, "fastapi", tags);
    if (astRoutes && astRoutes.length > 0) {
      routes.push(...astRoutes);
      continue;
    }
    const routePattern = /@\w+\s*\.\s*(get|post|put|patch|delete|options)\s*\(\s*['"]([^'"]+)['"]/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: scopedTags[i],
        framework: "fastapi"
      });
    });
  }
  return routes;
}
async function detectFlaskRoutes(files, project) {
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  const routes = [];
  for (const file of pyFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("flask") && !content.includes("Flask") && !content.includes("Blueprint"))
      continue;
    const rel = relative3(project.root, file);
    const tags = detectTags(content);
    const astRoutes = await extractPythonRoutesAST(rel, content, "flask", tags);
    if (astRoutes && astRoutes.length > 0) {
      routes.push(...astRoutes);
      continue;
    }
    const routePattern = /@(?:app|bp|blueprint|\w+)\s*\.\s*route\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)/gi;
    const matches = Array.from(content.matchAll(routePattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      const path = match[1];
      const methods = match[2] ? match[2].match(/['"](\w+)['"]/g)?.map((m) => m.replace(/['"]/g, "").toUpperCase()) || ["GET"] : ["GET"];
      for (const method of methods) {
        routes.push({
          method,
          path,
          file: rel,
          tags: scopedTags[i],
          framework: "flask"
        });
      }
    });
  }
  return routes;
}
async function detectDjangoRoutes(files, project) {
  const pyFiles = files.filter((f) => f.endsWith(".py") && (basename2(f) === "urls.py" || basename2(f) === "views.py"));
  const routes = [];
  for (const file of pyFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file);
    const tags = detectTags(content);
    const astRoutes = await extractPythonRoutesAST(rel, content, "django", tags);
    if (astRoutes && astRoutes.length > 0) {
      routes.push(...astRoutes);
      continue;
    }
    const pathPattern = /path\s*\(\s*['"]([^'"]*)['"]\s*,/g;
    const matches = Array.from(content.matchAll(pathPattern));
    const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
    matches.forEach((match, i) => {
      routes.push({
        method: "ALL",
        path: "/" + match[1],
        file: rel,
        tags: scopedTags[i],
        framework: "django"
      });
    });
  }
  return routes;
}
async function detectGoRoutes(files, project, fw) {
  const goFiles = files.filter((f) => f.endsWith(".go"));
  const routes = [];
  for (const file of goFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file);
    const tags = detectTags(content);
    const structuredRoutes = extractGoRoutesStructured(rel, content, fw, tags);
    if (structuredRoutes.length > 0) {
      routes.push(...structuredRoutes);
      continue;
    }
    if (fw === "gin" || fw === "echo") {
      const pattern = /\.\s*(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(\s*["']([^"']+)["']/g;
      const matches = Array.from(content.matchAll(pattern));
      const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
      matches.forEach((match, i) => {
        routes.push({ method: match[1], path: match[2], file: rel, tags: scopedTags[i], framework: fw });
      });
    } else if (fw === "fiber" || fw === "chi") {
      const pattern = /\.\s*(Get|Post|Put|Patch|Delete|Options|Head)\s*\(\s*["']([^"']+)["']/g;
      const matches = Array.from(content.matchAll(pattern));
      const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
      matches.forEach((match, i) => {
        routes.push({ method: match[1].toUpperCase(), path: match[2], file: rel, tags: scopedTags[i], framework: fw });
      });
    } else {
      const pattern = /(?:HandleFunc|Handle)\s*\(\s*["']([^"']+)["']/g;
      const matches = Array.from(content.matchAll(pattern));
      const scopedTags = detectTagsScoped(content, matches.map((m) => m.index));
      matches.forEach((match, i) => {
        const pathStr = match[1];
        let method = "ALL";
        let path = pathStr;
        const methodMatch = pathStr.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\/.*)/);
        if (methodMatch) {
          method = methodMatch[1];
          path = methodMatch[2];
        }
        routes.push({ method, path, file: rel, tags: scopedTags[i], framework: fw });
      });
    }
  }
  return routes;
}
async function detectRailsRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/routes\.rb$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file);
    const routePattern = /\b(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/gi;
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: detectTags(content),
        framework: "rails"
      });
    }
    const resourcePattern = /resources?\s+:(\w+)/g;
    while ((match = resourcePattern.exec(content)) !== null) {
      const name = match[1];
      for (const [method, suffix] of [
        ["GET", ""],
        ["GET", "/:id"],
        ["POST", ""],
        ["PUT", "/:id"],
        ["PATCH", "/:id"],
        ["DELETE", "/:id"]
      ]) {
        routes.push({
          method,
          path: `/${name}${suffix}`,
          file: rel,
          tags: detectTags(content),
          framework: "rails"
        });
      }
    }
  }
  return routes;
}
async function detectPhoenixRoutes(files, project) {
  const routeFiles = files.filter((f) => f.match(/router\.ex$/) || f.match(/_routes\.ex$/) || f.match(/\/router\/[^/]+\.ex$/));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file);
    const routePattern = /\b(get|post|put|patch|delete)\s+["']([^"']+)["']/gi;
    let match;
    while ((match = routePattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: detectTags(content),
        framework: "phoenix"
      });
    }
    const resourcePattern = /resources\s+["']([^"']+)["']/g;
    while ((match = resourcePattern.exec(content)) !== null) {
      const basePath = match[1];
      for (const [method, suffix] of [
        ["GET", ""],
        ["GET", "/:id"],
        ["POST", ""],
        ["PUT", "/:id"],
        ["PATCH", "/:id"],
        ["DELETE", "/:id"]
      ]) {
        routes.push({
          method,
          path: `${basePath}${suffix}`,
          file: rel,
          tags: detectTags(content),
          framework: "phoenix"
        });
      }
    }
  }
  return routes;
}
async function detectSpringRoutes(files, project) {
  const javaFiles = files.filter((f) => f.match(/\.(java|kt)$/));
  const routes = [];
  for (const file of javaFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("@RestController") && !content.includes("@Controller") && !content.includes("@RequestMapping"))
      continue;
    const rel = relative3(project.root, file);
    const classMapping = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
    const basePath = classMapping ? classMapping[1] : "";
    const mappingPattern = /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["'])?\s*\)/gi;
    let match;
    while ((match = mappingPattern.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const subPath = match[2] || "";
      routes.push({
        method,
        path: basePath + subPath || "/",
        file: rel,
        tags: detectTags(content),
        framework: "spring"
      });
    }
    const reqMappingPattern = /@RequestMapping\s*\([^)]*method\s*=\s*RequestMethod\.(\w+)[^)]*value\s*=\s*["']([^"']+)["']/gi;
    while ((match = reqMappingPattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: basePath + match[2],
        file: rel,
        tags: detectTags(content),
        framework: "spring"
      });
    }
  }
  return routes;
}
async function detectKtorRoutes(files, project) {
  const ktFiles = files.filter((f) => f.endsWith(".kt"));
  const routes = [];
  for (const file of ktFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("routing") && !content.includes("route(") && !content.includes("get(") && !content.includes("post("))
      continue;
    const rel = relative3(project.root, file);
    const prefixes = new Map;
    const routeBlockPat = /\.?route\s*\(\s*"([^"]+)"\s*\)\s*\{/g;
    let rm;
    while ((rm = routeBlockPat.exec(content)) !== null) {
      prefixes.set(rm.index + rm[0].length, rm[1]);
    }
    const methodPat = /\b(get|post|put|patch|delete|head|options)\s*\(\s*"([^"]+)"\s*\)/gi;
    let mm;
    while ((mm = methodPat.exec(content)) !== null) {
      const method = mm[1].toUpperCase();
      const path = mm[2];
      const offset = mm.index;
      let prefix = "";
      for (const [pOffset, pPath] of prefixes) {
        if (pOffset <= offset)
          prefix = pPath;
      }
      routes.push({
        method,
        path: prefix ? normalizePath2(prefix + "/" + path) : path,
        file: rel,
        tags: detectTags(content),
        framework: "ktor",
        params: extractKtorParams(path),
        confidence: "regex"
      });
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function normalizePath2(path) {
  return ("/" + path).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
function extractKtorParams(path) {
  const params = [];
  const regex = /\{(\w+)\}/g;
  let m;
  while ((m = regex.exec(path)) !== null)
    params.push(m[1]);
  return params;
}
async function detectRustRoutes(files, project, fw) {
  const rsFiles = files.filter((f) => f.endsWith(".rs"));
  const routes = [];
  for (const file of rsFiles) {
    const content = await readFileSafe(file);
    const rel = relative3(project.root, file);
    if (fw === "actix") {
      const attrPattern = /#\[(get|post|put|patch|delete)\s*\(\s*"([^"]+)"\s*\)\s*\]/gi;
      let match;
      while ((match = attrPattern.exec(content)) !== null) {
        routes.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file: rel,
          tags: detectTags(content),
          framework: "actix"
        });
      }
      const routePattern = /\.route\s*\(\s*"([^"]+)"\s*,\s*(?:web::)?(get|post|put|patch|delete)\s*\(\s*\)(?:\.to\s*\([^)]*\))?/gi;
      while ((match = routePattern.exec(content)) !== null) {
        routes.push({
          method: match[2].toUpperCase(),
          path: match[1],
          file: rel,
          tags: detectTags(content),
          framework: "actix"
        });
      }
    } else if (fw === "axum") {
      const routePattern = /\.route\s*\(\s*"([^"]+)"\s*,\s*([^\n]+)/g;
      let match;
      while ((match = routePattern.exec(content)) !== null) {
        const path = match[1];
        const chain = match[2];
        const methodPat = /\b(get|post|put|patch|delete|options|head)\s*\(/gi;
        let mm;
        while ((mm = methodPat.exec(chain)) !== null) {
          routes.push({
            method: mm[1].toUpperCase(),
            path,
            file: rel,
            tags: detectTags(content),
            framework: "axum"
          });
        }
      }
    }
  }
  return routes;
}
async function detectRawHttpRoutes(files, project) {
  const tsFiles = files.filter((f) => f.match(/\.(ts|js|mjs|cjs)$/));
  const routes = [];
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content.match(/(?:createServer|http\.|req\.|request\.|url|pathname|Bun\.serve|Deno\.serve)/))
      continue;
    const rel = relative3(project.root, file);
    const patterns = [
      /(?:url|pathname|parsedUrl\.pathname)\s*===?\s*['"`](\/[a-zA-Z0-9/_:.\-]+)['"`]/g,
      /(?:url|pathname)\s*\.startsWith\s*\(\s*['"`](\/[a-zA-Z0-9/_:.\-]+)['"`]\s*\)/g,
      /case\s+['"`](\/[a-zA-Z0-9/_:.\-]+)['"`]\s*:/g
    ];
    const fileTags = detectTags(content);
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const path = match[1];
        if (path.includes("\\") || path.length > 100 || path.includes(".."))
          continue;
        if (path.match(/\.\w{2,4}$/))
          continue;
        const lineStart = content.lastIndexOf(`
`, match.index) + 1;
        const lineEnd = content.indexOf(`
`, match.index + match[0].length);
        const lineContext = content.substring(Math.max(0, lineStart - 50), Math.min(content.length, (lineEnd === -1 ? content.length : lineEnd) + 50));
        let method = "ALL";
        const methodMatch = lineContext.match(/method\s*===?\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
        if (methodMatch) {
          method = methodMatch[1].toUpperCase();
        }
        routes.push({
          method,
          path,
          file: rel,
          tags: fileTags,
          framework: "raw-http",
          confidence: "regex"
        });
      }
    }
  }
  return routes;
}
async function detectPHPRoutes(files, project) {
  const phpFiles = files.filter((f) => f.endsWith(".php"));
  const routes = [];
  for (const file of phpFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const routeArrayPattern = /['"](\/[a-zA-Z0-9/_\-{}:.*]*)['"]\s*=>\s*\[/g;
    let match;
    while ((match = routeArrayPattern.exec(content)) !== null) {
      const path = match[1];
      if (path.length > 100)
        continue;
      const ctx = content.substring(Math.max(0, match.index - 200), match.index + 200);
      const methodMatch = ctx.match(/['"]method['"]\s*=>\s*['"](\w+)['"]/i);
      const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
      routes.push({ method, path, file: rel, tags: detectTags(content), framework: "php" });
    }
    const routerPattern = /(?:->|::)\s*(get|post|put|patch|delete|any)\s*\(\s*['"](\/[a-zA-Z0-9/_\-{}:.*]*)['"]/gi;
    while ((match = routerPattern.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase() === "ANY" ? "ALL" : match[1].toUpperCase(),
        path: match[2],
        file: rel,
        tags: detectTags(content),
        framework: "php"
      });
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
async function detectLaravelRoutes(files, project) {
  const routeFiles = files.filter((f) => f.endsWith(".php") && (f.match(/[/\\]routes[/\\]/) || basename2(f) === "api.php" || basename2(f) === "web.php"));
  const routes = [];
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const tags = detectTags(content);
    routes.push(...extractLaravelRoutes(rel, content, tags));
  }
  return routes;
}
async function detectAspNetRoutes(files, project) {
  const csFiles = files.filter((f) => f.endsWith(".cs"));
  const routes = [];
  for (const file of csFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const tags = detectTags(content);
    if (content.includes("[HttpGet") || content.includes("[HttpPost") || content.includes("[HttpPut") || content.includes("[HttpPatch") || content.includes("[HttpDelete") || content.includes("ControllerBase") || content.includes("Controller")) {
      routes.push(...extractAspNetControllerRoutes(rel, content, tags));
    }
    if (content.includes(".Map")) {
      routes.push(...extractAspNetMinimalApiRoutes(rel, content, tags));
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
async function detectFlutterGoRoutes(files, project) {
  const dartFiles = files.filter((f) => f.endsWith(".dart"));
  const routes = [];
  for (const file of dartFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    if (!content.includes("GoRoute") && !content.includes("go_router"))
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    routes.push(...extractFlutterRoutes(rel, content, detectTags(content)));
  }
  return routes;
}
async function detectVaporRoutes(files, project) {
  const swiftFiles = files.filter((f) => f.endsWith(".swift"));
  const routes = [];
  for (const file of swiftFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    routes.push(...extractVaporRoutes(rel, content, detectTags(content)));
  }
  return routes;
}
async function detectAndroidRoutes(files, project) {
  const { readdir: readdir2 } = await import("fs/promises");
  const { join: join10 } = await import("path");
  const routes = [];
  const ktFiles = files.filter((f) => f.endsWith(".kt"));
  for (const file of ktFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    routes.push(...extractRetrofitRoutes(rel, content, detectTags(content)));
  }
  const navDirs = [
    join10(project.root, "app", "src", "main", "res", "navigation"),
    join10(project.root, "src", "main", "res", "navigation")
  ];
  for (const navDir of navDirs) {
    try {
      const entries = await readdir2(navDir);
      for (const entry of entries) {
        if (!entry.endsWith(".xml"))
          continue;
        const content = await readFileSafe(join10(navDir, entry));
        if (!content)
          continue;
        const rel = relative3(project.root, join10(navDir, entry)).replace(/\\/g, "/");
        routes.push(...extractNavigationRoutes(rel, content));
      }
    } catch {}
  }
  const manifestPaths = [
    join10(project.root, "app", "src", "main", "AndroidManifest.xml"),
    join10(project.root, "src", "main", "AndroidManifest.xml"),
    join10(project.root, "AndroidManifest.xml")
  ];
  for (const mp of manifestPaths) {
    const content = await readFileSafe(mp);
    if (!content)
      continue;
    const rel = relative3(project.root, mp).replace(/\\/g, "/");
    routes.push(...extractActivitiesFromManifest(rel, content));
    break;
  }
  return routes;
}
async function detectAngularRoutes(files, project) {
  const tsFiles = files.filter((f) => f.endsWith(".ts") && !f.includes("node_modules") && !f.endsWith(".spec.ts") && !f.endsWith(".d.ts"));
  const routes = [];
  const seen = new Set;
  for (const file of tsFiles) {
    if (file.endsWith(".service.ts") || file.endsWith(".component.ts") || file.endsWith(".guard.ts") || file.endsWith(".pipe.ts") || file.endsWith(".directive.ts") || file.endsWith(".interceptor.ts"))
      continue;
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const isRoutingFile = /[/\\].*(?:routing|\.routes)\./i.test(file) || content.includes("RouterModule.forRoot(") || content.includes("RouterModule.forChild(") || content.includes("provideRouter(") || /:\s*Routes\b/.test(content);
    if (!isRoutingFile)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const tags = detectTags(content);
    const pathPattern = /\bpath\s*:\s*['"]([^'"]*)['"]/g;
    let m;
    while ((m = pathPattern.exec(content)) !== null) {
      const routePath = `/${m[1]}`.replace(/\/+/g, "/");
      const key = `GET:${routePath}:${rel}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      routes.push({
        method: "GET",
        path: routePath,
        file: rel,
        tags,
        framework: "angular",
        confidence: "regex"
      });
    }
  }
  return routes;
}
async function detectRokuScreens(files, project, config) {
  const { extractSceneGraphComponent: extractSceneGraphComponent2, extractMainSceneScreens: extractMainSceneScreens2, isSceneGraphXml: isSceneGraphXml2 } = await Promise.resolve().then(() => exports_extract_scenegraph);
  const { extractBrightScriptNavigationCalls: extractBrightScriptNavigationCalls2, extractFindNodeBindings: extractFindNodeBindings2 } = await Promise.resolve().then(() => exports_extract_brightscript);
  const xmlFiles = files.filter((f) => f.endsWith(".xml"));
  const brsFiles = files.filter((f) => f.endsWith(".brs") || f.endsWith(".bs"));
  const helperNames = config?.rokuScreenHelpers ?? DEFAULT_ROKU_SCREEN_HELPERS;
  const componentToFile = new Map;
  const sceneXmls = [];
  for (const file of xmlFiles) {
    const content = await readFileSafe(file);
    if (!content || !isSceneGraphXml2(content))
      continue;
    const comp = extractSceneGraphComponent2(content);
    if (!comp)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    componentToFile.set(comp.name, rel);
    if (comp.extendsType.toLowerCase() === "scene" || comp.name.toLowerCase().endsWith("scene")) {
      sceneXmls.push({ file: rel, content, name: comp.name });
    }
  }
  const routes = [];
  const seen = new Map;
  for (const scene of sceneXmls) {
    const slotToType = extractMainSceneScreens2(scene.content);
    for (const [slot, componentType] of Object.entries(slotToType)) {
      const routeFile = componentToFile.get(componentType) ?? scene.file;
      const path = `/${slot}`;
      if (seen.has(path))
        continue;
      const route = {
        method: "VIEW",
        path,
        file: routeFile,
        tags: [],
        framework: "roku-scenegraph",
        confidence: "regex"
      };
      seen.set(path, route);
      routes.push(route);
    }
    const stem = scene.file.replace(/\.xml$/i, "");
    const pairedBrs = brsFiles.find((f) => {
      const rel = relative3(project.root, f).replace(/\\/g, "/").replace(/\.(brs|bs)$/i, "");
      return rel === stem;
    });
    const brsSources = [];
    if (pairedBrs) {
      const pc = await readFileSafe(pairedBrs);
      if (pc)
        brsSources.push({ file: pairedBrs, content: pc });
    }
    const varToSlot = {};
    for (const src of brsSources) {
      Object.assign(varToSlot, extractFindNodeBindings2(src.content));
    }
    for (const src of brsSources) {
      const calls = extractBrightScriptNavigationCalls2(src.content, helperNames);
      const tags = detectTags(src.content);
      for (const call of calls) {
        const slot = varToSlot[call.target] ?? call.target.replace(/^m\./, "");
        const path = `/${slot}`;
        const existing = seen.get(path);
        if (existing) {
          if (call.modal && existing.method !== "MODAL") {
            existing.method = "MODAL";
          }
          for (const tag of tags) {
            if (!existing.tags.includes(tag))
              existing.tags.push(tag);
          }
          continue;
        }
        const componentType = slotToType[slot];
        const routeFile = componentType ? componentToFile.get(componentType) ?? scene.file : scene.file;
        const route = {
          method: call.modal ? "MODAL" : "VIEW",
          path,
          file: routeFile,
          tags: [...tags],
          framework: "roku-scenegraph",
          confidence: "regex"
        };
        seen.set(path, route);
        routes.push(route);
      }
    }
  }
  return routes;
}
async function resolveRoutePrefixes(routes, files, project) {
  const mountEdges = new Map;
  const sourceFiles = files.filter((f) => f.match(/\.(ts|js|mjs|cjs|py)$/));
  for (const file of sourceFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative3(project.root, file).replace(/\\/g, "/");
    const dir = rel.includes("/") ? rel.split("/").slice(0, -1).join("/") : "";
    if (file.endsWith(".py")) {
      if (content.includes("include_router")) {
        parsePythonMountsToGraph(content, dir, files, project, mountEdges, rel);
      }
    } else {
      if (content.includes(".route(") || content.includes(".use(")) {
        parseJSMountsToGraph(content, dir, files, project, mountEdges, rel);
      }
    }
  }
  if (mountEdges.size === 0)
    return routes;
  const resolvedCache2 = new Map;
  function resolveFullPrefix(file, visited) {
    if (resolvedCache2.has(file))
      return resolvedCache2.get(file);
    if (visited.has(file))
      return "";
    visited.add(file);
    const edge = mountEdges.get(file);
    if (!edge) {
      resolvedCache2.set(file, "");
      return "";
    }
    const parentPrefix = resolveFullPrefix(edge.mountedBy, new Set(visited));
    const full = (parentPrefix + edge.prefix).replace(/\/\//g, "/");
    resolvedCache2.set(file, full);
    return full;
  }
  return routes.map((route) => {
    const routeFile = route.file.replace(/\\/g, "/");
    const prefix = resolveFullPrefix(routeFile, new Set);
    if (!prefix || prefix === "/")
      return route;
    if (route.path.startsWith(prefix + "/") || route.path === prefix)
      return route;
    const base = prefix.replace(/\/$/, "");
    const newPath = route.path === "/" ? base : base + route.path;
    return { ...route, path: newPath };
  });
}
function parseJSMountsToGraph(content, entryDir, files, project, mountEdges, sourceFile) {
  const importMap = new Map;
  const namedRe = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = namedRe.exec(content)) !== null) {
    const importPath = m[2];
    const resolved = resolveJSImport(importPath, entryDir, files, project);
    if (!resolved)
      continue;
    for (const part of m[1].split(",")) {
      const name = (part.includes(" as ") ? part.split(" as ").pop() : part).trim();
      if (name && /^\w+$/.test(name))
        importMap.set(name, resolved);
    }
  }
  const defaultRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = defaultRe.exec(content)) !== null) {
    const resolved = resolveJSImport(m[2], entryDir, files, project);
    if (resolved)
      importMap.set(m[1], resolved);
  }
  const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(content)) !== null) {
    const resolved = resolveJSImport(m[2], entryDir, files, project);
    if (resolved)
      importMap.set(m[1], resolved);
  }
  const mountRe = /\.\s*(?:route|use)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)/g;
  while ((m = mountRe.exec(content)) !== null) {
    const prefix = m[1];
    const varName = m[2];
    if (!prefix || prefix === "/" || prefix === "*")
      continue;
    const targetFile = importMap.get(varName);
    if (targetFile && !mountEdges.has(targetFile)) {
      mountEdges.set(targetFile, { prefix, mountedBy: sourceFile });
    }
  }
}
function resolveJSImport(importPath, entryDir, files, project) {
  if (!importPath.startsWith("."))
    return null;
  const base = entryDir ? `${entryDir}/${importPath}` : importPath;
  const parts = base.split("/");
  const norm = [];
  for (const p of parts) {
    if (p === "..")
      norm.pop();
    else if (p !== ".")
      norm.push(p);
  }
  const stemWithExt = norm.join("/");
  const stem = stemWithExt.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  for (const ext of [".ts", ".tsx", ".js", ".mjs", ".jsx"]) {
    const candidate = `${stem}${ext}`;
    const hit = files.find((f) => f.replace(/\\/g, "/").endsWith(candidate));
    if (hit)
      return relative3(project.root, hit).replace(/\\/g, "/");
  }
  for (const ext of [".ts", ".js", ".mjs"]) {
    const candidate = `${stem}/index${ext}`;
    const hit = files.find((f) => f.replace(/\\/g, "/").endsWith(candidate));
    if (hit)
      return relative3(project.root, hit).replace(/\\/g, "/");
  }
  return null;
}
function parsePythonMountsToGraph(content, _entryDir, files, project, mountEdges, sourceFile) {
  const aliasRe = /from\s+([\w.]+)\s+import\s+router\s+as\s+(\w+)/g;
  const aliasMap = new Map;
  let m;
  while ((m = aliasRe.exec(content)) !== null) {
    const moduleDots = m[1];
    const alias = m[2];
    const modPath = moduleDots.replace(/\./g, "/");
    const hit = files.find((f) => {
      const rel = f.replace(/\\/g, "/");
      return rel.endsWith(`/${modPath}.py`) || rel.endsWith(`${modPath}.py`);
    });
    if (hit)
      aliasMap.set(alias, relative3(project.root, hit).replace(/\\/g, "/"));
  }
  const noAliasRe = /from\s+([\w.]+)\s+import\s+router(?!\s+as)\b/g;
  while ((m = noAliasRe.exec(content)) !== null) {
    const modPath = m[1].replace(/\./g, "/");
    const hit = files.find((f) => f.replace(/\\/g, "/").endsWith(`${modPath}.py`));
    if (hit)
      aliasMap.set("router", relative3(project.root, hit).replace(/\\/g, "/"));
  }
  const prefixRouterRe = /(\w+)\s*=\s*APIRouter\s*\([^)]*prefix\s*=\s*['"]([^'"]+)['"]/g;
  const routerPrefixes = new Map;
  while ((m = prefixRouterRe.exec(content)) !== null) {
    routerPrefixes.set(m[1], m[2]);
  }
  const includeRe = /(\w+)\s*\.\s*include_router\s*\(\s*(\w+)(?:[^)]*prefix\s*=\s*['"]([^'"]+)['"])?\s*\)/g;
  while ((m = includeRe.exec(content)) !== null) {
    const parentVar = m[1];
    const childVar = m[2];
    const extraPrefix = m[3] || "";
    const parentPrefix = routerPrefixes.get(parentVar) || "";
    const fullPrefix = parentPrefix + extraPrefix;
    const targetFile = aliasMap.get(childVar);
    if (targetFile && fullPrefix && !mountEdges.has(targetFile)) {
      mountEdges.set(targetFile, { prefix: fullPrefix, mountedBy: sourceFile });
    }
  }
}
var HTTP_METHODS2, DEFAULT_ROKU_SCREEN_HELPERS;
var init_routes = __esm(() => {
  init_scanner();
  init_loader();
  init_extract_routes();
  init_extract_python();
  init_extract_php();
  init_extract_csharp();
  init_extract_dart();
  init_extract_swift();
  init_route_tags();
  init_route_tags();
  HTTP_METHODS2 = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
  DEFAULT_ROKU_SCREEN_HELPERS = [
    "ShowScreen",
    "showScreen",
    "pushScreen",
    "PushScreen",
    "NavigateTo",
    "navigateTo",
    "showView",
    "ShowView"
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-schema.js
function extractDrizzleSchemaAST(ts, filePath, content) {
  try {
    const sf = parseSourceFile(ts, filePath, content);
    return extractDrizzleTables(ts, sf, content);
  } catch {
    return [];
  }
}
function extractTypeORMSchemaAST(ts, filePath, content) {
  try {
    const sf = parseSourceFile(ts, filePath, content);
    return extractTypeORMEntities(ts, sf);
  } catch {
    return [];
  }
}
function extractDrizzleTables(ts, sf, _content) {
  const models = [];
  const SK = ts.SyntaxKind;
  function visit(node) {
    if (node.kind === SK.CallExpression) {
      const callee = node.expression;
      const funcName = callee?.kind === SK.Identifier ? getText(sf, callee) : "";
      if (DRIZZLE_TABLE_FUNCS.has(funcName) && node.arguments?.length >= 2) {
        const nameArg = node.arguments[0];
        const fieldsArg = node.arguments[1];
        let tableName = "";
        if (nameArg.kind === SK.StringLiteral || nameArg.kind === SK.NoSubstitutionTemplateLiteral) {
          tableName = nameArg.text;
        }
        if (!tableName) {
          ts.forEachChild(node, visit);
          return;
        }
        let fieldsObj = null;
        if (fieldsArg.kind === SK.ObjectLiteralExpression) {
          fieldsObj = fieldsArg;
        } else if (fieldsArg.kind === SK.ArrowFunction || fieldsArg.kind === SK.FunctionExpression) {
          const body = fieldsArg.body;
          if (body?.kind === SK.ObjectLiteralExpression) {
            fieldsObj = body;
          } else if (body?.kind === SK.ParenthesizedExpression && body.expression?.kind === SK.ObjectLiteralExpression) {
            fieldsObj = body.expression;
          }
        }
        if (!fieldsObj) {
          ts.forEachChild(node, visit);
          return;
        }
        const fields = [];
        const relations = [];
        for (const prop of fieldsObj.properties || []) {
          if (prop.kind !== SK.PropertyAssignment)
            continue;
          const fieldName = prop.name ? getText(sf, prop.name) : "";
          if (!fieldName || AUDIT_FIELDS2.has(fieldName))
            continue;
          const { type, flags, refTarget } = parseFieldChain(ts, sf, prop.initializer);
          if (refTarget) {
            relations.push(`${fieldName} -> ${refTarget}`);
          }
          if (fieldName.endsWith("Id") || fieldName.endsWith("_id")) {
            if (!flags.includes("fk"))
              flags.push("fk");
          }
          fields.push({ name: fieldName, type, flags });
        }
        if (fields.length > 0) {
          models.push({ name: tableName, fields, relations, orm: "drizzle", confidence: "ast" });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  extractDrizzleRelations(ts, sf, models);
  return models;
}
function parseFieldChain(ts, sf, node) {
  const SK = ts.SyntaxKind;
  const flags = [];
  let type = "unknown";
  let refTarget = null;
  function walkChain(n) {
    if (!n)
      return;
    if (n.kind === SK.CallExpression) {
      const expr = n.expression;
      if (expr?.kind === SK.PropertyAccessExpression) {
        const methodName = getText(sf, expr.name);
        switch (methodName) {
          case "primaryKey":
            flags.push("pk");
            break;
          case "notNull":
            flags.push("required");
            break;
          case "unique":
            flags.push("unique");
            break;
          case "default":
          case "defaultNow":
          case "$default":
          case "$defaultFn":
            flags.push("default");
            break;
          case "references":
            flags.push("fk");
            if (n.arguments?.length > 0) {
              const refArg = n.arguments[0];
              if (refArg.kind === SK.ArrowFunction || refArg.kind === SK.FunctionExpression) {
                const refBody = refArg.body;
                if (refBody?.kind === SK.PropertyAccessExpression) {
                  refTarget = getText(sf, refBody);
                }
              }
            }
            break;
        }
        walkChain(expr.expression);
      } else if (expr?.kind === SK.Identifier) {
        type = getText(sf, expr);
      } else if (expr?.kind === SK.PropertyAccessExpression) {
        type = getText(sf, expr.name);
      }
    }
  }
  walkChain(node);
  return { type, flags, refTarget };
}
function extractDrizzleRelations(ts, sf, models) {
  const SK = ts.SyntaxKind;
  function visit(node) {
    if (node.kind === SK.CallExpression) {
      const callee = node.expression;
      const funcName = callee?.kind === SK.Identifier ? getText(sf, callee) : "";
      if (funcName === "relations" && node.arguments?.length >= 2) {
        const tableArg = node.arguments[0];
        const tableName = tableArg?.kind === SK.Identifier ? getText(sf, tableArg) : "";
        const model = models.find((m) => m.name === tableName || m.name === tableName.replace(/s$/, "") || tableName.startsWith(m.name));
        if (!model) {
          ts.forEachChild(node, visit);
          return;
        }
        const relArg = node.arguments[1];
        let relObj = null;
        if (relArg?.kind === SK.ArrowFunction) {
          const body = relArg.body;
          if (body?.kind === SK.ObjectLiteralExpression) {
            relObj = body;
          } else if (body?.kind === SK.ParenthesizedExpression && body.expression?.kind === SK.ObjectLiteralExpression) {
            relObj = body.expression;
          }
        }
        if (!relObj) {
          ts.forEachChild(node, visit);
          return;
        }
        for (const prop of relObj.properties || []) {
          if (prop.kind !== SK.PropertyAssignment)
            continue;
          const relName = prop.name ? getText(sf, prop.name) : "";
          if (!relName)
            continue;
          const init = prop.initializer;
          if (init?.kind === SK.CallExpression && init.expression?.kind === SK.Identifier) {
            const relType = getText(sf, init.expression);
            const targetArg = init.arguments?.[0];
            const target = targetArg?.kind === SK.Identifier ? getText(sf, targetArg) : "?";
            const existing = model.relations.find((r) => r.startsWith(`${relName}:`));
            if (!existing) {
              model.relations.push(`${relName}: ${relType}(${target})`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}
function extractTypeORMEntities(ts, sf) {
  const models = [];
  const SK = ts.SyntaxKind;
  function visitNode(node) {
    if (node.kind === SK.ClassDeclaration) {
      const decorators = getDecorators(ts, node);
      let isEntity = false;
      let entityName = "";
      for (const dec of decorators) {
        const parsed = parseDecorator(ts, sf, dec);
        if (parsed.name === "Entity") {
          isEntity = true;
          entityName = parsed.arg || "";
          break;
        }
      }
      if (!isEntity) {
        ts.forEachChild(node, visitNode);
        return;
      }
      const className = node.name ? getText(sf, node.name) : "Unknown";
      const name = entityName || className;
      const fields = [];
      const relations = [];
      for (const member of node.members || []) {
        if (member.kind !== SK.PropertyDeclaration)
          continue;
        const memberDecs = getDecorators(ts, member);
        const memberName = member.name ? getText(sf, member.name) : "";
        if (!memberName || AUDIT_FIELDS2.has(memberName))
          continue;
        const memberType = member.type ? getText(sf, member.type) : "unknown";
        for (const dec of memberDecs) {
          const parsed = parseDecorator(ts, sf, dec);
          if (parsed.name === "PrimaryGeneratedColumn" || parsed.name === "PrimaryColumn") {
            const flags = ["pk"];
            if (parsed.name === "PrimaryGeneratedColumn")
              flags.push("default");
            fields.push({ name: memberName, type: parsed.arg || memberType, flags });
            break;
          }
          if (parsed.name === "Column" || parsed.name === "CreateDateColumn" || parsed.name === "UpdateDateColumn") {
            const flags = [];
            const decExpr = dec.expression;
            if (decExpr?.kind === SK.CallExpression && decExpr.arguments?.length > 0) {
              const optArg = decExpr.arguments[0];
              const optText = getText(sf, optArg);
              if (optText.includes("unique: true") || optText.includes("unique:true"))
                flags.push("unique");
              if (optText.includes("nullable: true") || optText.includes("nullable:true"))
                flags.push("nullable");
              if (optText.includes("default:"))
                flags.push("default");
            }
            fields.push({ name: memberName, type: parsed.arg || memberType, flags });
            break;
          }
          if (["OneToMany", "ManyToOne", "OneToOne", "ManyToMany"].includes(parsed.name)) {
            relations.push(`${memberName}: ${parsed.name}(${memberType})`);
            break;
          }
        }
      }
      if (fields.length > 0) {
        models.push({ name, fields, relations, orm: "typeorm", confidence: "ast" });
      }
    }
    ts.forEachChild(node, visitNode);
  }
  visitNode(sf);
  return models;
}
var AUDIT_FIELDS2, DRIZZLE_TABLE_FUNCS;
var init_extract_schema = __esm(() => {
  init_loader();
  AUDIT_FIELDS2 = new Set([
    "createdAt",
    "updatedAt",
    "deletedAt",
    "created_at",
    "updated_at",
    "deleted_at"
  ]);
  DRIZZLE_TABLE_FUNCS = new Set(["pgTable", "mysqlTable", "sqliteTable"]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/schema.js
import { join as join10, relative as relative4 } from "path";
async function detectSchemas(files, project, config) {
  const models = [];
  for (const orm of project.orms) {
    switch (orm) {
      case "drizzle":
        models.push(...await detectDrizzleSchemas(files, project));
        break;
      case "prisma":
        models.push(...await detectPrismaSchemas(files, project));
        break;
      case "typeorm":
        models.push(...await detectTypeORMSchemas(files, project));
        break;
      case "sqlalchemy":
        models.push(...await detectSQLAlchemySchemas(files, project));
        break;
      case "gorm":
        models.push(...await detectGORMSchemas(files, project));
        break;
      case "ent":
        models.push(...await detectEntSchemas(files, project));
        break;
      case "activerecord":
        models.push(...await detectActiveRecordSchemas(project));
        break;
      case "ecto":
        models.push(...await detectEctoSchemas(files, project));
        break;
      case "django":
        models.push(...await detectDjangoSchemas(files, project));
        break;
      case "eloquent":
        models.push(...await detectEloquentSchemas(files, project));
        break;
      case "entity-framework":
        models.push(...await detectEntityFrameworkSchemas(files, project));
        break;
      case "mongoose":
        models.push(...await detectMongooseSchemas(files, project));
        break;
      case "sequelize":
        models.push(...await detectSequelizeSchemas(files, project));
        break;
      case "exposed":
        models.push(...await detectExposedSchemas(files, project));
        break;
      case "room":
        models.push(...await detectRoomSchemas(files, project));
        break;
      case "scenegraph":
        models.push(...await detectSceneGraphSchemas(files, project));
        break;
    }
  }
  const ormNames = new Set(project.orms);
  const hasSchemaORM = ormNames.size > 0 && !ormNames.has("unknown");
  if (!hasSchemaORM || models.length === 0) {
    const sqlModels = await detectRawSQLSchemas(files, project);
    const existingNames = new Set(models.map((m) => m.name.toLowerCase()));
    for (const m of sqlModels) {
      if (!existingNames.has(m.name.toLowerCase()))
        models.push(m);
    }
  }
  return models;
}
async function detectDrizzleSchemas(files, project) {
  const schemaFiles = files.filter((f) => f.match(/schema\.(ts|js)$/) || f.match(/\/schema\/.*\.(ts|js)$/) || f.match(/\.schema\.(ts|js)$/) || f.match(/\/db\/.*\.(ts|js)$/));
  const models = [];
  const ts = loadTypeScript(project.root);
  for (const file of schemaFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("pgTable") && !content.includes("mysqlTable") && !content.includes("sqliteTable"))
      continue;
    if (ts) {
      const astModels = extractDrizzleSchemaAST(ts, file, content);
      if (astModels.length > 0) {
        models.push(...astModels);
        continue;
      }
    }
    const tablePattern = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`](\w+)['"`]\s*,\s*(?:\(\s*\)\s*=>\s*\(?\s*)?\{([\s\S]*?)\}\s*\)?\s*(?:,|\))/g;
    let match;
    while ((match = tablePattern.exec(content)) !== null) {
      const tableName = match[2];
      const body = match[3];
      const fields = [];
      const relations = [];
      const fieldPattern = /(\w+)\s*:\s*([\w.]+)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)([^,\n]*)/g;
      let fieldMatch;
      while ((fieldMatch = fieldPattern.exec(body)) !== null) {
        const name = fieldMatch[1];
        if (AUDIT_FIELDS3.has(name))
          continue;
        const type = fieldMatch[2].replace(/.*\./, "");
        const chain = fieldMatch[4] || "";
        const flags = [];
        if (chain.includes("primaryKey"))
          flags.push("pk");
        if (chain.includes("unique"))
          flags.push("unique");
        if (chain.includes("notNull"))
          flags.push("required");
        if (chain.includes("default"))
          flags.push("default");
        if (chain.includes("references")) {
          flags.push("fk");
          const refMatch = chain.match(/references\s*\(\s*\(\s*\)\s*=>\s*(\w+)\.(\w+)/);
          if (refMatch)
            relations.push(`${name} -> ${refMatch[1]}.${refMatch[2]}`);
        }
        if (name.endsWith("Id") || name.endsWith("_id")) {
          if (!flags.includes("fk"))
            flags.push("fk");
        }
        fields.push({ name, type, flags });
      }
      if (fields.length > 0) {
        models.push({
          name: tableName,
          fields,
          relations,
          orm: "drizzle"
        });
      }
    }
    const relPattern = /relations\s*\(\s*(\w+)\s*,\s*\(\s*\{([^}]+)\}\s*\)\s*=>\s*\(?\s*\{([\s\S]*?)\}\s*\)?\s*\)/g;
    let relMatch;
    while ((relMatch = relPattern.exec(content)) !== null) {
      const tableName = relMatch[1];
      const relBody = relMatch[3];
      const model = models.find((m) => m.name === tableName);
      if (!model)
        continue;
      const relEntries = /(\w+)\s*:\s*(one|many)\s*\(\s*(\w+)/g;
      let entry;
      while ((entry = relEntries.exec(relBody)) !== null) {
        model.relations.push(`${entry[1]}: ${entry[2]}(${entry[3]})`);
      }
    }
  }
  return models;
}
async function detectPrismaSchemas(_files, project) {
  const candidateSet = new Set([
    join10(project.root, "prisma/schema.prisma"),
    join10(project.root, "schema.prisma"),
    join10(project.root, "prisma/schema")
  ]);
  for (const ws of project.workspaces) {
    const wsAbs = join10(project.root, ws.path);
    candidateSet.add(join10(wsAbs, "schema.prisma"));
    candidateSet.add(join10(wsAbs, "prisma/schema.prisma"));
    candidateSet.add(join10(wsAbs, "prisma/schema"));
  }
  const allModels = [];
  const seenNames = new Set;
  for (const p of candidateSet) {
    const content = await readFileSafe(p);
    if (!content)
      continue;
    const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let match;
    while ((match = modelPattern.exec(content)) !== null) {
      const name = match[1];
      if (seenNames.has(name))
        continue;
      const body = match[2];
      const fields = [];
      const relations = [];
      for (const line of body.split(`
`)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@"))
          continue;
        const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)/);
        if (!fieldMatch)
          continue;
        const [, fieldName, fieldType, modifier, rest] = fieldMatch;
        if (AUDIT_FIELDS3.has(fieldName))
          continue;
        if (rest.includes("@relation")) {
          relations.push(`${fieldName}: ${fieldType}${modifier || ""}`);
          continue;
        }
        if (modifier === "[]") {
          relations.push(`${fieldName}: ${fieldType}[]`);
          continue;
        }
        const flags = [];
        if (rest.includes("@id"))
          flags.push("pk");
        if (rest.includes("@unique"))
          flags.push("unique");
        if (rest.includes("@default"))
          flags.push("default");
        if (modifier === "?")
          flags.push("nullable");
        if (fieldName.endsWith("Id") || fieldName.endsWith("_id"))
          flags.push("fk");
        fields.push({ name: fieldName, type: fieldType, flags });
      }
      if (fields.length > 0) {
        seenNames.add(name);
        allModels.push({ name, fields, relations, orm: "prisma" });
      }
    }
    const enumPattern = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    while ((match = enumPattern.exec(content)) !== null) {
      const enumKey = `enum:${match[1]}`;
      if (seenNames.has(enumKey))
        continue;
      const values = match[2].split(`
`).map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
      seenNames.add(enumKey);
      allModels.push({
        name: enumKey,
        fields: values.map((v) => ({ name: v, type: "enum", flags: [] })),
        relations: [],
        orm: "prisma"
      });
    }
  }
  return allModels;
}
async function detectTypeORMSchemas(files, project) {
  const entityFiles = files.filter((f) => f.match(/\.entity\.(ts|js)$/) || f.match(/entities\/.*\.(ts|js)$/));
  const models = [];
  const ts = loadTypeScript(project.root);
  for (const file of entityFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("@Entity") && !content.includes("@Column"))
      continue;
    if (ts) {
      const astModels = extractTypeORMSchemaAST(ts, file, content);
      if (astModels.length > 0) {
        models.push(...astModels);
        continue;
      }
    }
    const entityMatch = content.match(/@Entity\s*\(\s*(?:['"`](\w+)['"`])?\s*\)/);
    const classMatch = content.match(/class\s+(\w+)/);
    const name = entityMatch?.[1] || classMatch?.[1] || "Unknown";
    const fields = [];
    const relations = [];
    const colPattern = /@(?:PrimaryGeneratedColumn|PrimaryColumn|Column|CreateDateColumn|UpdateDateColumn)\s*\(([^)]*)\)\s*\n\s*(\w+)\s*[!?]?\s*:\s*(\w+)/g;
    let match;
    while ((match = colPattern.exec(content)) !== null) {
      const decorator = match[0];
      const fieldName = match[2];
      const fieldType = match[3];
      if (AUDIT_FIELDS3.has(fieldName))
        continue;
      const flags = [];
      if (decorator.includes("PrimaryGeneratedColumn") || decorator.includes("PrimaryColumn"))
        flags.push("pk");
      if (decorator.includes("unique: true"))
        flags.push("unique");
      if (decorator.includes("nullable: true"))
        flags.push("nullable");
      if (decorator.includes("default:"))
        flags.push("default");
      fields.push({ name: fieldName, type: fieldType, flags });
    }
    const relPattern = /@(?:OneToMany|ManyToOne|OneToOne|ManyToMany)\s*\([^)]*\)\s*\n\s*(\w+)\s*[!?]?\s*:\s*(\w+)/g;
    while ((match = relPattern.exec(content)) !== null) {
      relations.push(`${match[1]}: ${match[2]}`);
    }
    if (fields.length > 0) {
      models.push({ name, fields, relations, orm: "typeorm" });
    }
  }
  return models;
}
async function detectSQLAlchemySchemas(files, project) {
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  const models = [];
  for (const file of pyFiles) {
    const content = await readFileSafe(file);
    const rel = relative4(project.root, file);
    if (content.includes("SQLModel") && content.includes("table=True")) {
      const sqlmodelModels = await extractSQLModelAST(rel, content);
      if (sqlmodelModels && sqlmodelModels.length > 0) {
        models.push(...sqlmodelModels);
        continue;
      }
    }
    if (!content.includes("Column") && !content.includes("mapped_column"))
      continue;
    if (!content.includes("Base") && !content.includes("DeclarativeBase") && !content.includes("Model"))
      continue;
    const astModels = await extractSQLAlchemyAST(rel, content);
    if (astModels && astModels.length > 0) {
      models.push(...astModels);
      continue;
    }
    const classPattern = /class\s+(\w+)\s*\([^)]*(?:Base|Model|DeclarativeBase)[^)]*\)\s*:([\s\S]*?)(?=\nclass\s|\n[^\s]|$)/g;
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      const name = match[1];
      const body = match[2];
      const fields = [];
      const relations = [];
      const colPattern = /(\w+)\s*(?::\s*Mapped\[([^\]]+)\]\s*=\s*mapped_column|=\s*(?:db\.)?Column)\s*\(([^)]*)\)/g;
      let colMatch;
      while ((colMatch = colPattern.exec(body)) !== null) {
        const fieldName = colMatch[1];
        if (AUDIT_FIELDS3.has(fieldName))
          continue;
        const mappedType = colMatch[2] || "";
        const args = colMatch[3];
        const flags = [];
        if (args.includes("primary_key=True"))
          flags.push("pk");
        if (args.includes("unique=True"))
          flags.push("unique");
        if (args.includes("nullable=True"))
          flags.push("nullable");
        if (args.includes("ForeignKey"))
          flags.push("fk");
        if (args.includes("default="))
          flags.push("default");
        const typeMatch = args.match(/(?:String|Integer|Boolean|Float|Text|DateTime|JSON|UUID)/);
        const type = mappedType || typeMatch?.[0] || "unknown";
        fields.push({ name: fieldName, type, flags });
      }
      const relPattern = /(\w+)\s*=\s*relationship\s*\(\s*['"](\w+)['"]/g;
      let relMatch;
      while ((relMatch = relPattern.exec(body)) !== null) {
        relations.push(`${relMatch[1]}: ${relMatch[2]}`);
      }
      if (fields.length > 0) {
        models.push({ name, fields, relations, orm: "sqlalchemy" });
      }
    }
  }
  return models;
}
async function detectGORMSchemas(files, _project) {
  const goFiles = files.filter((f) => f.endsWith(".go"));
  const models = [];
  for (const file of goFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("gorm") && !content.includes("Model") && !content.includes("`json:"))
      continue;
    const rel = relative4(_project.root, file);
    const structModels = extractGORMModelsStructured(rel, content);
    models.push(...structModels);
  }
  return models;
}
async function detectEntSchemas(files, _project) {
  const goFiles = files.filter((f) => f.endsWith(".go") && (f.includes("/ent/schema/") || f.includes("/schema/")));
  const models = [];
  for (const file of goFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("ent.Schema"))
      continue;
    const rel = relative4(_project.root, file);
    const structModels = extractEntSchemasStructured(rel, content);
    models.push(...structModels);
  }
  return models;
}
async function detectEctoSchemas(files, _project) {
  const exFiles = files.filter((f) => f.endsWith(".ex") || f.endsWith(".exs"));
  const models = [];
  for (const file of exFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("use Ecto.Schema") && !content.includes("Ecto.Schema"))
      continue;
    const schemaPattern = /schema\s+["'](\w+)["']\s+do([\s\S]*?)(?:\n\s*end\b)/g;
    let m;
    while ((m = schemaPattern.exec(content)) !== null) {
      const tableName = m[1];
      const body = m[2];
      const fields = [];
      const relations = [];
      const fieldPat = /field\s+:(\w+),\s*(?::(\w+)|[\w.]+\.(\w+))/g;
      let fm;
      while ((fm = fieldPat.exec(body)) !== null) {
        const fname = fm[1];
        const ftype = fm[2] || fm[3] || "unknown";
        if (AUDIT_FIELDS3.has(fname) || fname === "inserted_at" || fname === "updated_at")
          continue;
        const ectoTypeMap = {
          string: "string",
          binary: "bytes",
          boolean: "boolean",
          integer: "integer",
          float: "float",
          decimal: "decimal",
          date: "date",
          time: "time",
          naive_datetime: "timestamp",
          utc_datetime: "timestamp",
          datetime: "timestamp",
          map: "map",
          array: "array",
          uuid: "uuid",
          binary_id: "uuid",
          id: "integer",
          Enum: "enum",
          INET: "inet"
        };
        const flags = [];
        if (fname.endsWith("_id"))
          flags.push("fk");
        fields.push({ name: fname, type: ectoTypeMap[ftype] ?? ftype, flags });
      }
      const belongsPat = /belongs_to\s+:(\w+),\s*(\w[\w.]*)/g;
      while ((fm = belongsPat.exec(body)) !== null) {
        relations.push(`${fm[1]}: belongs_to(${fm[2]})`);
        fields.push({ name: fm[1] + "_id", type: "integer", flags: ["fk"] });
      }
      const hasPat = /(has_many|has_one|many_to_many)\s+:(\w+),\s*(\w[\w.]*)/g;
      while ((fm = hasPat.exec(body)) !== null) {
        relations.push(`${fm[2]}: ${fm[1]}(${fm[3]})`);
      }
      if (fields.length > 0 || relations.length > 0) {
        const modMatch = content.match(/defmodule\s+([\w.]+)/);
        const modelName = modMatch ? modMatch[1].split(".").pop() : tableName;
        models.push({ name: modelName, fields, relations, orm: "ecto" });
      }
    }
  }
  return models;
}
async function detectActiveRecordSchemas(project) {
  const schemaPath = join10(project.root, "db/schema.rb");
  const content = await readFileSafe(schemaPath);
  if (!content)
    return [];
  const models = [];
  const tablePattern = /create_table\s+["'](\w+)["'][^\n]*\bdo\s*\|t\|([\s\S]*?)^\s*end/gm;
  let m;
  while ((m = tablePattern.exec(content)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = [];
    const relations = [];
    const fieldPat = /t\.(\w+)\s+["'](\w+)["']([^\n]*)/g;
    let fm;
    while ((fm = fieldPat.exec(body)) !== null) {
      const rbType = fm[1];
      const fieldName = fm[2];
      const opts = fm[3];
      if (["index", "timestamps", "primary_key"].includes(rbType))
        continue;
      if (AUDIT_FIELDS3.has(fieldName))
        continue;
      const typeMap = {
        string: "string",
        text: "text",
        citext: "string",
        integer: "integer",
        bigint: "integer",
        smallint: "integer",
        float: "float",
        decimal: "decimal",
        numeric: "decimal",
        boolean: "boolean",
        date: "date",
        datetime: "timestamp",
        timestamp: "timestamp",
        time: "time",
        json: "json",
        jsonb: "jsonb",
        uuid: "uuid",
        binary: "bytes",
        inet: "string",
        ltree: "string"
      };
      const flags = [];
      if (opts.includes("null: false"))
        flags.push("required");
      if (opts.includes("default:"))
        flags.push("default");
      if (fieldName.endsWith("_id")) {
        flags.push("fk");
        relations.push(`${fieldName} -> ?`);
      }
      fields.push({ name: fieldName, type: typeMap[rbType] ?? rbType, flags });
    }
    if (fields.length > 0) {
      models.push({ name, fields, relations, orm: "activerecord" });
    }
  }
  return models;
}
async function detectDjangoSchemas(files, project) {
  const modelFiles = files.filter((f) => f.endsWith("/models.py") || f.includes("/models/") && f.endsWith(".py"));
  const models = [];
  for (const file of modelFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("models.Model") && !content.includes("(Model)"))
      continue;
    const rel = relative4(project.root, file);
    const astModels = await extractDjangoModelsAST(rel, content);
    if (astModels && astModels.length > 0) {
      models.push(...astModels);
      continue;
    }
    const classPattern = /class\s+(\w+)\s*\(\s*(?:\w+\.)?Model\s*\)\s*:/g;
    let m;
    while ((m = classPattern.exec(content)) !== null) {
      const name = m[1];
      if (name === "Meta")
        continue;
      const fields = [];
      const relations = [];
      const classStart = m.index + m[0].length;
      const nextClassMatch = /\nclass\s+\w+/.exec(content.slice(classStart));
      const classBody = nextClassMatch ? content.slice(classStart, classStart + nextClassMatch.index) : content.slice(classStart);
      const fieldPat = /^\s{4}(\w+)\s*=\s*(?:models\.)?(CharField|TextField|EmailField|IntegerField|BigIntegerField|FloatField|DecimalField|BooleanField|DateField|DateTimeField|TimeField|JSONField|UUIDField|AutoField|BigAutoField|PositiveIntegerField|SlugField|URLField|FileField|ImageField|ForeignKey|OneToOneField|ManyToManyField)\s*\(/gm;
      let fm;
      while ((fm = fieldPat.exec(classBody)) !== null) {
        const fname = fm[1];
        const fclass = fm[2];
        if (AUDIT_FIELDS3.has(fname))
          continue;
        if (fclass === "ForeignKey" || fclass === "OneToOneField") {
          relations.push(`${fname}: ${fclass}`);
          fields.push({ name: fname + "_id", type: "integer", flags: ["fk"] });
        } else if (fclass === "ManyToManyField") {
          relations.push(`${fname}: ManyToMany`);
        } else {
          const typeMap = {
            CharField: "string",
            TextField: "string",
            EmailField: "string",
            SlugField: "string",
            URLField: "string",
            FileField: "string",
            ImageField: "string",
            IntegerField: "integer",
            BigIntegerField: "integer",
            PositiveIntegerField: "integer",
            AutoField: "integer",
            BigAutoField: "integer",
            FloatField: "float",
            DecimalField: "decimal",
            BooleanField: "boolean",
            DateField: "date",
            DateTimeField: "timestamp",
            TimeField: "time",
            JSONField: "json",
            UUIDField: "uuid"
          };
          fields.push({ name: fname, type: typeMap[fclass] ?? "string", flags: [] });
        }
      }
      if (fields.length > 0 || relations.length > 0) {
        models.push({ name, fields, relations, orm: "django" });
      }
    }
  }
  return models;
}
async function detectEloquentSchemas(files, project) {
  const phpFiles = files.filter((f) => f.endsWith(".php"));
  const models = [];
  for (const file of phpFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("extends") || !content.includes("Model"))
      continue;
    const hasEloquentMarker = content.includes("Illuminate\\Database\\Eloquent") || content.includes("$fillable") || content.includes("$table") || content.includes("$this->hasMany") || content.includes("$this->belongsTo") || content.includes("$this->hasOne") || content.includes("$this->belongsToMany");
    if (!hasEloquentMarker)
      continue;
    const rel = relative4(project.root, file);
    models.push(...extractEloquentModels(rel, content));
  }
  return models;
}
async function detectEntityFrameworkSchemas(files, project) {
  const csFiles = files.filter((f) => f.endsWith(".cs"));
  const models = [];
  for (const file of csFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("DbContext") && !content.includes("DbSet<"))
      continue;
    const rel = relative4(project.root, file);
    models.push(...extractEntityFrameworkModels(rel, content));
  }
  return models;
}
async function detectMongooseSchemas(files, _project) {
  const jstsFiles = files.filter((f) => f.match(/\.(js|ts|mjs|cjs)$/));
  const models = [];
  const seenNames = new Set;
  for (const file of jstsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("mongoose") && !content.includes("Schema"))
      continue;
    if (content.includes("@Schema") && content.includes("SchemaFactory")) {
      const nestPat = /SchemaFactory\.createForClass\s*\(\s*(\w+)\s*\)/g;
      let nm;
      while ((nm = nestPat.exec(content)) !== null) {
        const rawName = nm[1].replace(/(?:SchemaClass|Schema|Document)$/, "");
        const modelName = rawName || nm[1];
        if (seenNames.has(modelName))
          continue;
        seenNames.add(modelName);
        const fields = [];
        const propPat = /@Prop[^)]*\)\s*(?:readonly\s+)?(\w+)\??\s*:\s*([\w<>[\]|]+)/g;
        let pm;
        while ((pm = propPat.exec(content)) !== null) {
          const name = pm[1];
          if (AUDIT_FIELDS3.has(name))
            continue;
          fields.push({ name, type: pm[2].toLowerCase(), flags: [] });
        }
        models.push({ name: modelName, fields, relations: [], orm: "mongoose" });
      }
      continue;
    }
    if (!content.includes("model(") && !content.includes(".model("))
      continue;
    const modelPat = /(?:mongoose\.)?model\s*(?:<[^>]+>)?\s*\(\s*['"`]([A-Z]\w*)['"`]/g;
    let m;
    while ((m = modelPat.exec(content)) !== null) {
      const modelName = m[1];
      if (seenNames.has(modelName))
        continue;
      seenNames.add(modelName);
      const fields = [];
      const relations = [];
      const candidates = [modelName + "Schema", modelName.toLowerCase() + "Schema", "schema", "Schema"];
      let schemaBody = null;
      for (const cand of candidates) {
        const varPat = new RegExp(`(?:const|let|var)\\s+${cand}\\s*=\\s*new\\s+(?:mongoose\\.)?Schema\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*[,)]`, "i");
        const hit = varPat.exec(content);
        if (hit) {
          schemaBody = hit[1];
          break;
        }
      }
      if (schemaBody) {
        const typeMap = {
          string: "string",
          number: "number",
          boolean: "boolean",
          date: "datetime",
          objectid: "string",
          buffer: "binary",
          mixed: "any",
          map: "map"
        };
        const fieldPat = /^\s*(\w+)\s*:\s*(?:\{[^}]*\btype\s*:\s*(String|Number|Boolean|Date|ObjectId|Buffer|Mixed|Map)\b|\[\s*(String|Number|Boolean|Date|ObjectId|Buffer|Mixed)\s*\]|(String|Number|Boolean|Date|ObjectId|Buffer|Mixed)\b)/gm;
        let fm;
        while ((fm = fieldPat.exec(schemaBody)) !== null) {
          const name = fm[1];
          if (["type", "default", "ref", "required", "unique", "index", "enum"].includes(name))
            continue;
          if (AUDIT_FIELDS3.has(name))
            continue;
          const rawType = (fm[2] || fm[3] || fm[4] || "mixed").toLowerCase();
          fields.push({ name, type: typeMap[rawType] || rawType, flags: [] });
        }
        const refPat = /(\w+)\s*:\s*\{[^}]*ref\s*:\s*['"`](\w+)['"`]/g;
        while ((fm = refPat.exec(schemaBody)) !== null) {
          relations.push(`${fm[1]}: ${fm[2]}`);
        }
      }
      if (fields.length === 0) {
        const ifacePat = new RegExp(`interface\\s+I${modelName}\\s*(?:extends[^{]+)?\\{([^}]+)\\}`, "s");
        const ifaceMatch = content.match(ifacePat);
        if (ifaceMatch) {
          const fieldPat = /^\s*(\w+)\??\s*:\s*([\w<>[\]|' "]+)/gm;
          let fm;
          while ((fm = fieldPat.exec(ifaceMatch[1])) !== null) {
            const name = fm[1];
            if (name.startsWith("_") || AUDIT_FIELDS3.has(name))
              continue;
            fields.push({ name, type: fm[2].trim(), flags: [] });
          }
        }
      }
      models.push({ name: modelName, fields, relations, orm: "mongoose" });
    }
  }
  return models;
}
function parseSequelizeFields(body) {
  const seqTypeMap = {
    STRING: "string",
    TEXT: "string",
    CHAR: "string",
    CITEXT: "string",
    INTEGER: "integer",
    BIGINT: "integer",
    SMALLINT: "integer",
    FLOAT: "float",
    DOUBLE: "float",
    REAL: "float",
    DECIMAL: "decimal",
    NUMERIC: "decimal",
    BOOLEAN: "boolean",
    DATE: "datetime",
    DATEONLY: "date",
    TIME: "time",
    JSON: "json",
    JSONB: "json",
    UUID: "string",
    UUIDV1: "string",
    UUIDV4: "string",
    BLOB: "binary",
    ARRAY: "array",
    ENUM: "enum",
    VIRTUAL: "virtual"
  };
  const skip = new Set(["type", "defaultValue", "allowNull", "unique", "primaryKey", "references", "onDelete", "onUpdate"]);
  const fields = [];
  const fieldPat = /^\s*(\w+)\s*:\s*(?:DataTypes?\.(\w+)|\{\s*(?:[^}]*\btype\s*:\s*DataTypes?\.(\w+)))/gm;
  let fm;
  while ((fm = fieldPat.exec(body)) !== null) {
    const name = fm[1];
    if (skip.has(name) || AUDIT_FIELDS3.has(name))
      continue;
    const raw = (fm[2] || fm[3] || "unknown").toUpperCase();
    fields.push({ name, type: seqTypeMap[raw] || raw.toLowerCase(), flags: [] });
  }
  return fields;
}
async function detectSequelizeSchemas(files, _project) {
  const jstsFiles = files.filter((f) => f.match(/\.(js|ts|mjs|cjs)$/));
  const models = [];
  const seenNames = new Set;
  for (const file of jstsFiles) {
    const content = await readFileSafe(file);
    if (!content.includes("sequelize") && !content.includes("Sequelize") && !content.includes("DataTypes"))
      continue;
    const classInitPat = /class\s+(\w+)\s+extends\s+Model[\s\S]*?\1\.init\s*\(\s*\{([\s\S]*?)\}\s*,\s*\{/g;
    let m;
    while ((m = classInitPat.exec(content)) !== null) {
      const name = m[1];
      if (seenNames.has(name))
        continue;
      seenNames.add(name);
      models.push({ name, fields: parseSequelizeFields(m[2]), relations: [], orm: "sequelize" });
    }
    const definePat = /sequelize\.define\s*\(\s*['"`](\w+)['"`]\s*,\s*\{([\s\S]*?)\}\s*[,)]/g;
    while ((m = definePat.exec(content)) !== null) {
      const name = m[1];
      if (seenNames.has(name))
        continue;
      seenNames.add(name);
      models.push({ name, fields: parseSequelizeFields(m[2]), relations: [], orm: "sequelize" });
    }
  }
  return models;
}
async function detectExposedSchemas(files, _project) {
  const ktFiles = files.filter((f) => f.endsWith(".kt"));
  const models = [];
  const EXPOSED_TABLE_BASES = ["Table", "IntIdTable", "LongIdTable", "UUIDTable", "IdTable"];
  const EXPOSED_TYPE_MAP = {
    integer: "integer",
    long: "bigint",
    short: "smallint",
    float: "float",
    double: "double",
    decimal: "decimal",
    varchar: "string",
    char: "char",
    text: "text",
    bool: "boolean",
    date: "date",
    datetime: "datetime",
    timestamp: "timestamp",
    binary: "bytes",
    blob: "bytes",
    uuid: "uuid",
    json: "json",
    jsonb: "json",
    reference: "integer",
    optReference: "integer"
  };
  for (const file of ktFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    if (!EXPOSED_TABLE_BASES.some((b) => content.includes(`: ${b}(`)))
      continue;
    const objectPat = /object\s+(\w+)\s*:\s*(?:\w+\.)?(\w+)\s*\([^)]*\)\s*\{/g;
    let om;
    while ((om = objectPat.exec(content)) !== null) {
      const name = om[1];
      const base = om[2];
      if (!EXPOSED_TABLE_BASES.includes(base))
        continue;
      const blockStart = om.index + om[0].length;
      let depth = 1;
      let i = blockStart;
      while (i < content.length && depth > 0) {
        if (content[i] === "{")
          depth++;
        else if (content[i] === "}")
          depth--;
        i++;
      }
      const block = content.slice(blockStart, i - 1);
      const fields = [];
      const relations = [];
      const colPat = /val\s+(\w+)\s*=\s*(\w+)\s*\(/g;
      let cm;
      while ((cm = colPat.exec(block)) !== null) {
        const fieldName = cm[1];
        const typeFn = cm[2];
        if (fieldName === "primaryKey")
          continue;
        const colType = EXPOSED_TYPE_MAP[typeFn] || typeFn.toLowerCase();
        const flags = [];
        const lineEnd = block.indexOf(`
`, cm.index);
        const line = block.slice(cm.index, lineEnd > -1 ? lineEnd : undefined);
        if (line.includes(".uniqueIndex()") || line.includes(".unique()"))
          flags.push("unique");
        if (line.includes(".nullable()"))
          flags.push("nullable");
        if (line.includes(".autoIncrement()"))
          flags.push("pk");
        if (typeFn === "reference" || typeFn === "optReference") {
          const refMatch = line.match(/reference\s*\(\s*"[^"]+"\s*,\s*(\w+)/);
          if (refMatch) {
            relations.push(`${fieldName}: ${refMatch[1]}`);
            flags.push("fk");
          }
        }
        fields.push({ name: fieldName, type: colType, flags });
      }
      if (fields.length > 0) {
        models.push({ name, fields, relations, orm: "exposed", confidence: "regex" });
      }
    }
  }
  return models;
}
async function detectRawSQLSchemas(files, _project) {
  const sqlFiles = files.filter((f) => f.endsWith(".sql"));
  const models = [];
  const seenNames = new Set;
  for (const file of sqlFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const createTablePat = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w"]+\.)?\s*["']?([\w]+)["']?\s*\(([\s\S]*?)(?:\)\s*;|\)\s*\n)/gi;
    let m;
    while ((m = createTablePat.exec(content)) !== null) {
      const tableName = m[1];
      if (seenNames.has(tableName.toLowerCase()))
        continue;
      if (tableName.toLowerCase().startsWith("pg_") || tableName.toLowerCase() === "schema_migrations")
        continue;
      seenNames.add(tableName.toLowerCase());
      const body = m[2];
      const fields = [];
      const relations = [];
      for (const rawLine of body.split(",")) {
        const line = rawLine.trim().replace(/--.*$/, "").trim();
        if (!line)
          continue;
        if (/^(PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY|CONSTRAINT|INDEX)/i.test(line)) {
          const fkMatch = line.match(/FOREIGN\s+KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)/i);
          if (fkMatch)
            relations.push(`${fkMatch[1]} -> ${fkMatch[2]}.${fkMatch[3]}`);
          continue;
        }
        const colMatch = line.match(/^["']?(\w+)["']?\s+([\w\s()]+?)(?:\s+(NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|DEFAULT|REFERENCES|GENERATED)[\s\S]*)?$/i);
        if (!colMatch)
          continue;
        const colName = colMatch[1];
        if (["CONSTRAINT", "INDEX", "KEY", "UNIQUE", "CHECK", "PRIMARY"].includes(colName.toUpperCase()))
          continue;
        const rawType = colMatch[2].trim().toLowerCase().replace(/\s*\([^)]*\)/, "");
        const mappedType = SQL_TYPE_MAP[rawType] || rawType;
        const rest = colMatch[3] || "";
        const flags = [];
        if (/PRIMARY\s+KEY/i.test(rest) || /PRIMARY\s+KEY/i.test(line))
          flags.push("pk");
        if (/NOT\s+NULL/i.test(rest))
          flags.push("required");
        if (/UNIQUE/i.test(rest))
          flags.push("unique");
        if (/DEFAULT/i.test(rest))
          flags.push("default");
        if (/REFERENCES/i.test(rest)) {
          flags.push("fk");
          const refMatch = rest.match(/REFERENCES\s+(\w+)/i);
          if (refMatch)
            relations.push(`${colName} -> ${refMatch[1]}`);
        }
        if (colName.endsWith("_id") || colName.endsWith("Id")) {
          if (!flags.includes("fk"))
            flags.push("fk");
        }
        if (!AUDIT_FIELDS3.has(colName)) {
          fields.push({ name: colName, type: mappedType, flags });
        }
      }
      if (fields.length > 0) {
        models.push({ name: tableName, fields, relations, orm: "unknown", confidence: "ast" });
      }
    }
  }
  return models;
}
async function detectRoomSchemas(files, project) {
  const ktFiles = files.filter((f) => f.endsWith(".kt"));
  const models = [];
  for (const file of ktFiles) {
    const content = await readFileSafe(file);
    if (!content || !content.includes("@Entity"))
      continue;
    const rel = relative4(project.root, file).replace(/\\/g, "/");
    models.push(...extractRoomEntities(rel, content));
  }
  return models;
}
async function detectSceneGraphSchemas(files, project) {
  const { extractSceneGraphComponent: extractSceneGraphComponent2, isSceneGraphXml: isSceneGraphXml2 } = await Promise.resolve().then(() => exports_extract_scenegraph);
  const xmlFiles = files.filter((f) => f.endsWith(".xml"));
  const models = [];
  const seen = new Set;
  for (const file of xmlFiles) {
    const content = await readFileSafe(file);
    if (!content || !isSceneGraphXml2(content))
      continue;
    const comp = extractSceneGraphComponent2(content);
    if (!comp)
      continue;
    if (comp.interfaceFields.length === 0)
      continue;
    if (seen.has(comp.name))
      continue;
    seen.add(comp.name);
    models.push({
      name: comp.name,
      fields: comp.interfaceFields,
      relations: [],
      orm: "scenegraph",
      confidence: "regex"
    });
  }
  return models;
}
var AUDIT_FIELDS3, SQL_TYPE_MAP;
var init_schema = __esm(() => {
  init_scanner();
  init_loader();
  init_extract_schema();
  init_extract_python();
  init_extract_php();
  init_extract_csharp();
  AUDIT_FIELDS3 = new Set([
    "createdAt",
    "updatedAt",
    "deletedAt",
    "created_at",
    "updated_at",
    "deleted_at"
  ]);
  SQL_TYPE_MAP = {
    serial: "integer(auto)",
    bigserial: "bigint(auto)",
    int: "integer",
    integer: "integer",
    bigint: "bigint",
    smallint: "smallint",
    text: "text",
    varchar: "varchar",
    char: "char",
    "character varying": "varchar",
    boolean: "boolean",
    bool: "boolean",
    timestamp: "timestamp",
    timestamptz: "timestamp(tz)",
    date: "date",
    time: "time",
    uuid: "uuid",
    json: "json",
    jsonb: "jsonb",
    float: "float",
    real: "real",
    "double precision": "float8",
    numeric: "numeric",
    decimal: "decimal",
    bytea: "bytes",
    blob: "bytes"
  };
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-components.js
function extractReactComponentsAST(ts, filePath, content, relPath) {
  try {
    const sf = parseSourceFile(ts, filePath, content);
    return extractComponents(ts, sf, content, relPath);
  } catch {
    return [];
  }
}
function extractComponents(ts, sf, content, relPath) {
  const components = [];
  const SK = ts.SyntaxKind;
  const isClient = content.slice(0, 80).includes("use client");
  const isServer = content.slice(0, 80).includes("use server");
  const propsTypes = new Map;
  function collectPropsTypes(node) {
    if (node.kind === SK.InterfaceDeclaration || node.kind === SK.TypeAliasDeclaration) {
      const name = node.name ? getText(sf, node.name) : "";
      if (!name.includes("Props") && !name.includes("props")) {
        ts.forEachChild(node, collectPropsTypes);
        return;
      }
      const props = [];
      if (node.members) {
        for (const member of node.members) {
          if (member.kind === SK.PropertySignature && member.name) {
            const propName = getText(sf, member.name);
            if (propName !== "children")
              props.push(propName);
          }
        }
      }
      if (node.type?.kind === SK.TypeLiteral && node.type.members) {
        for (const member of node.type.members) {
          if (member.kind === SK.PropertySignature && member.name) {
            const propName = getText(sf, member.name);
            if (propName !== "children")
              props.push(propName);
          }
        }
      }
      if (props.length > 0)
        propsTypes.set(name, props);
    }
    ts.forEachChild(node, collectPropsTypes);
  }
  collectPropsTypes(sf);
  function findComponents(node) {
    if (node.kind === SK.FunctionDeclaration) {
      const name = node.name ? getText(sf, node.name) : "";
      if (!name || !/^[A-Z]/.test(name)) {
        ts.forEachChild(node, findComponents);
        return;
      }
      const isExported = node.modifiers?.some((m) => m.kind === SK.ExportKeyword || m.kind === SK.DefaultKeyword);
      if (!isExported) {
        ts.forEachChild(node, findComponents);
        return;
      }
      const props = extractPropsFromParams(ts, sf, node.parameters, propsTypes);
      components.push({
        name,
        file: relPath,
        props: props.slice(0, 10),
        isClient,
        isServer,
        confidence: "ast"
      });
    }
    if (node.kind === SK.VariableStatement) {
      const isExported = node.modifiers?.some((m) => m.kind === SK.ExportKeyword);
      if (!isExported) {
        ts.forEachChild(node, findComponents);
        return;
      }
      for (const decl of node.declarationList?.declarations || []) {
        if (decl.kind !== SK.VariableDeclaration)
          continue;
        const name = decl.name ? getText(sf, decl.name) : "";
        if (!name || !/^[A-Z]/.test(name))
          continue;
        const init = decl.initializer;
        if (!init)
          continue;
        let params = null;
        if (init.kind === SK.ArrowFunction || init.kind === SK.FunctionExpression) {
          params = init.parameters;
        }
        if (init.kind === SK.CallExpression) {
          const callee = init.expression;
          const calleeName = callee?.kind === SK.PropertyAccessExpression ? getText(sf, callee.name) : callee?.kind === SK.Identifier ? getText(sf, callee) : "";
          if (calleeName === "forwardRef" || calleeName === "memo") {
            const innerFn = init.arguments?.[0];
            if (innerFn && (innerFn.kind === SK.ArrowFunction || innerFn.kind === SK.FunctionExpression)) {
              params = innerFn.parameters;
            }
          }
        }
        if (params) {
          const props = extractPropsFromParams(ts, sf, params, propsTypes);
          components.push({
            name,
            file: relPath,
            props: props.slice(0, 10),
            isClient,
            isServer,
            confidence: "ast"
          });
        }
      }
    }
    ts.forEachChild(node, findComponents);
  }
  findComponents(sf);
  return components;
}
function extractPropsFromParams(ts, sf, params, propsTypes) {
  if (!params || params.length === 0)
    return [];
  const SK = ts.SyntaxKind;
  const firstParam = params[0];
  if (firstParam.name?.kind === SK.ObjectBindingPattern) {
    const props = [];
    for (const element of firstParam.name.elements || []) {
      if (element.dotDotDotToken)
        continue;
      const propName = element.name ? getText(sf, element.name) : "";
      if (propName && propName !== "children")
        props.push(propName);
    }
    if (props.length > 0)
      return props;
  }
  if (firstParam.type) {
    if (firstParam.type.kind === SK.TypeReference) {
      const typeName = firstParam.type.typeName ? getText(sf, firstParam.type.typeName) : "";
      const typeProps = propsTypes.get(typeName);
      if (typeProps)
        return typeProps;
    }
    if (firstParam.type.kind === SK.TypeLiteral) {
      const props = [];
      for (const member of firstParam.type.members || []) {
        if (member.kind === SK.PropertySignature && member.name) {
          const propName = getText(sf, member.name);
          if (propName !== "children")
            props.push(propName);
        }
      }
      return props;
    }
  }
  return [];
}
var init_extract_components = __esm(() => {
  init_loader();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/components.js
import { relative as relative5, basename as basename3, extname as extname2 } from "path";
function isUIPrimitive(filePath) {
  const name = basename3(filePath, extname2(filePath)).toLowerCase();
  return UI_PRIMITIVES.has(name) || filePath.includes("/ui/") || filePath.includes("/components/ui/") || filePath.includes("@radix-ui") || filePath.includes("@shadcn");
}
async function detectComponents(files, project, _config) {
  switch (project.componentFramework) {
    case "react":
      return detectReactComponents(files, project);
    case "vue":
      return detectVueComponents(files, project);
    case "svelte":
      return detectSvelteComponents(files, project);
    case "flutter":
      return detectFlutterComponents(files, project);
    case "jetpack-compose":
      return detectComposeComponentsFromFiles(files, project);
    case "angular":
      return detectAngularComponents(files, project);
    case "scenegraph":
      return detectSceneGraphComponents(files, project);
    default: {
      if (project.frameworks.includes("swiftui") || project.frameworks.includes("vapor")) {
        return detectSwiftUIComponents(files, project);
      }
      return [];
    }
  }
}
async function detectReactComponents(files, project) {
  const componentFiles = files.filter((f) => (f.endsWith(".tsx") || f.endsWith(".jsx")) && !f.includes("node_modules") && !f.endsWith(".test.tsx") && !f.endsWith(".test.jsx") && !f.endsWith(".spec.tsx") && !f.endsWith(".spec.jsx") && !f.endsWith(".stories.tsx") && !f.endsWith(".stories.jsx"));
  const components = [];
  const ts = loadTypeScript(project.root);
  for (const file of componentFiles) {
    if (isUIPrimitive(file))
      continue;
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative5(project.root, file);
    if (ts) {
      const astComponents = extractReactComponentsAST(ts, file, content, rel);
      if (astComponents.length > 0) {
        components.push(...astComponents);
        continue;
      }
    }
    let name = "";
    const defaultFnMatch = content.match(/export\s+default\s+function\s+(\w+)/);
    if (defaultFnMatch) {
      name = defaultFnMatch[1];
    }
    if (!name) {
      const namedFnMatch = content.match(/export\s+(?:async\s+)?function\s+([A-Z]\w+)/);
      if (namedFnMatch)
        name = namedFnMatch[1];
    }
    if (!name) {
      const constMatch = content.match(/export\s+const\s+([A-Z]\w+)\s*(?::\s*\w+)?\s*=/);
      if (constMatch)
        name = constMatch[1];
    }
    if (!name) {
      const anyComponent = content.match(/(?:function|const)\s+([A-Z]\w+)/);
      if (anyComponent && (content.includes("<") || content.includes("jsx"))) {
        name = anyComponent[1];
      }
    }
    if (!name)
      continue;
    const props = [];
    const propsPattern = /(?:interface|type)\s+(\w*Props\w*)\s*(?:=\s*)?\{([^}]*)}/g;
    let propsMatch;
    while ((propsMatch = propsPattern.exec(content)) !== null) {
      for (const line of propsMatch[2].split(`
`)) {
        const propMatch = line.match(/^\s*(\w+)\s*[?]?\s*:/);
        if (propMatch && propMatch[1] !== "children") {
          if (!props.includes(propMatch[1]))
            props.push(propMatch[1]);
        }
      }
      if (props.length > 0)
        break;
    }
    if (props.length === 0) {
      const fcMatch = content.match(/:\s*React\.(?:FC|FunctionComponent)<\{([^}>]*)}/);
      if (fcMatch) {
        for (const line of fcMatch[1].split(";")) {
          const propMatch = line.match(/^\s*(\w+)\s*[?]?\s*:/);
          if (propMatch && propMatch[1] !== "children")
            props.push(propMatch[1]);
        }
      }
    }
    if (props.length === 0) {
      const forwardRefMatch = content.match(/forwardRef\s*(?:<[^>]*>)?\s*\(\s*\(\s*\{([^}]*)\}/);
      if (forwardRefMatch) {
        for (const prop of forwardRefMatch[1].split(",")) {
          const trimmed = prop.trim().split(/[=:]/)[0].trim();
          if (trimmed && trimmed !== "children" && !trimmed.startsWith("..."))
            props.push(trimmed);
        }
      }
    }
    if (props.length === 0) {
      const destructuredMatch = content.match(new RegExp(`function\\s+${name}\\s*\\(\\s*\\{([^}]*)\\}`));
      if (destructuredMatch) {
        for (const prop of destructuredMatch[1].split(",")) {
          const trimmed = prop.trim().split(/[=:]/)[0].trim();
          if (trimmed && trimmed !== "children" && !trimmed.startsWith("...")) {
            props.push(trimmed);
          }
        }
      }
    }
    if (props.length === 0) {
      const arrowDestructuredMatch = content.match(new RegExp(`const\\s+${name}[^=]*=\\s*\\(\\s*\\{([^}]*)\\}`));
      if (arrowDestructuredMatch) {
        for (const prop of arrowDestructuredMatch[1].split(",")) {
          const trimmed = prop.trim().split(/[=:]/)[0].trim();
          if (trimmed && trimmed !== "children" && !trimmed.startsWith("...")) {
            props.push(trimmed);
          }
        }
      }
    }
    const isClient = content.slice(0, 50).includes("use client");
    const isServer = content.slice(0, 50).includes("use server");
    components.push({
      name,
      file: rel,
      props: props.slice(0, 10),
      isClient,
      isServer
    });
  }
  return components;
}
async function detectVueComponents(files, project) {
  const vueFiles = files.filter((f) => f.endsWith(".vue") && !f.includes("node_modules"));
  const components = [];
  for (const file of vueFiles) {
    if (isUIPrimitive(file))
      continue;
    const content = await readFileSafe(file);
    const rel = relative5(project.root, file);
    const name = basename3(file, ".vue");
    const props = [];
    const definePropsMatch = content.match(/defineProps\s*[<(]\s*\{([^}]*)\}/);
    if (definePropsMatch) {
      for (const line of definePropsMatch[1].split(`
`)) {
        const propMatch = line.match(/^\s*(\w+)\s*[?]?\s*:/);
        if (propMatch)
          props.push(propMatch[1]);
      }
    }
    if (props.length === 0) {
      const optionsPropsMatch = content.match(/props\s*:\s*\{([^}]*)\}/);
      if (optionsPropsMatch) {
        for (const line of optionsPropsMatch[1].split(`
`)) {
          const propMatch = line.match(/^\s*(\w+)\s*[?]?\s*:/);
          if (propMatch)
            props.push(propMatch[1]);
        }
      }
    }
    components.push({
      name,
      file: rel,
      props: props.slice(0, 10),
      isClient: true,
      isServer: false
    });
  }
  return components;
}
async function detectSvelteComponents(files, project) {
  const svelteFiles = files.filter((f) => f.endsWith(".svelte") && !f.includes("node_modules"));
  const components = [];
  for (const file of svelteFiles) {
    if (isUIPrimitive(file))
      continue;
    const content = await readFileSafe(file);
    const rel = relative5(project.root, file);
    const name = basename3(file, ".svelte");
    const props = [];
    const exportLetPattern = /export\s+let\s+(\w+)/g;
    let match;
    while ((match = exportLetPattern.exec(content)) !== null) {
      props.push(match[1]);
    }
    const propsMatch = content.match(/let\s+\{([^}]*)\}\s*=\s*\$props\(\)/);
    if (propsMatch) {
      for (const prop of propsMatch[1].split(",")) {
        const trimmed = prop.trim().split(/[=:]/)[0].trim();
        if (trimmed && !trimmed.startsWith("...")) {
          props.push(trimmed);
        }
      }
    }
    components.push({
      name,
      file: rel,
      props: props.slice(0, 10),
      isClient: true,
      isServer: false
    });
  }
  return components;
}
async function detectFlutterComponents(files, project) {
  const dartFiles = files.filter((f) => f.endsWith(".dart") && !f.includes("_test.dart") && !f.includes(".g.dart"));
  const components = [];
  for (const file of dartFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative5(project.root, file);
    components.push(...extractFlutterWidgets(rel, content));
  }
  return components;
}
async function detectComposeComponentsFromFiles(files, project) {
  const ktFiles = files.filter((f) => f.endsWith(".kt") && !f.includes("Test") && !f.includes("_test"));
  const components = [];
  for (const file of ktFiles) {
    const content = await readFileSafe(file);
    if (!content || !content.includes("@Composable"))
      continue;
    const rel = relative5(project.root, file);
    components.push(...extractComposeComponents(rel, content));
  }
  return components;
}
async function detectAngularComponents(files, project) {
  const tsFiles = files.filter((f) => f.endsWith(".ts") && !f.includes("node_modules") && !f.endsWith(".spec.ts") && !f.endsWith(".d.ts"));
  const components = [];
  for (const file of tsFiles) {
    const content = await readFileSafe(file);
    if (!content || !content.includes("@Component"))
      continue;
    const rel = relative5(project.root, file);
    const classMatch = content.match(/@Component[\s\S]*?class\s+(\w+)/);
    if (!classMatch)
      continue;
    const name = classMatch[1];
    const props = [];
    const decoratorInputPattern = /@Input\s*\([^)]*\)\s+(?:\w+\s+)*(\w+)\s*[!?]?\s*:/g;
    let m;
    while ((m = decoratorInputPattern.exec(content)) !== null) {
      if (!props.includes(m[1]))
        props.push(m[1]);
    }
    const signalInputPattern = /\b(\w+)\s*=\s*input(?:\.required)?\s*(?:<[^>]*>)?\s*\(/g;
    while ((m = signalInputPattern.exec(content)) !== null) {
      const propName = m[1];
      if (!["const", "let", "var", "return", "await"].includes(propName) && !props.includes(propName)) {
        props.push(propName);
      }
    }
    components.push({
      name,
      file: rel,
      props: props.slice(0, 10),
      isClient: true,
      isServer: false
    });
  }
  return components;
}
async function detectSwiftUIComponents(files, project) {
  const swiftFiles = files.filter((f) => f.endsWith(".swift") && !f.includes("Tests/") && !f.includes("_test.swift"));
  const components = [];
  for (const file of swiftFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    if (!content.includes(": View") && !content.includes(":View"))
      continue;
    const rel = relative5(project.root, file);
    components.push(...extractSwiftUIViews(rel, content));
  }
  return components;
}
async function detectSceneGraphComponents(files, project) {
  const { extractSceneGraphComponent: extractSceneGraphComponent2, isSceneGraphXml: isSceneGraphXml2 } = await Promise.resolve().then(() => exports_extract_scenegraph);
  const xmlFiles = files.filter((f) => f.endsWith(".xml"));
  const components = [];
  const seen = new Set;
  for (const file of xmlFiles) {
    const content = await readFileSafe(file);
    if (!content || !isSceneGraphXml2(content))
      continue;
    const comp = extractSceneGraphComponent2(content);
    if (!comp)
      continue;
    if (seen.has(comp.name))
      continue;
    seen.add(comp.name);
    const rel = relative5(project.root, file).replace(/\\/g, "/");
    components.push({
      name: comp.name,
      file: rel,
      confidence: "regex",
      props: comp.interfaceFields.map((f) => f.name),
      isClient: true,
      isServer: false
    });
  }
  return components;
}
var UI_PRIMITIVES;
var init_components = __esm(() => {
  init_scanner();
  init_loader();
  init_extract_components();
  init_extract_dart();
  init_extract_swift();
  UI_PRIMITIVES = new Set([
    "accordion",
    "alert",
    "alert-dialog",
    "aspect-ratio",
    "avatar",
    "badge",
    "breadcrumb",
    "button",
    "calendar",
    "card",
    "carousel",
    "chart",
    "checkbox",
    "collapsible",
    "command",
    "context-menu",
    "data-table",
    "date-picker",
    "dialog",
    "drawer",
    "dropdown-menu",
    "form",
    "hover-card",
    "input",
    "input-otp",
    "label",
    "menubar",
    "navigation-menu",
    "pagination",
    "popover",
    "progress",
    "radio-group",
    "resizable",
    "scroll-area",
    "select",
    "separator",
    "sheet",
    "sidebar",
    "skeleton",
    "slider",
    "sonner",
    "switch",
    "table",
    "tabs",
    "textarea",
    "toast",
    "toaster",
    "toggle",
    "toggle-group",
    "tooltip"
  ]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/ast/extract-brighterscript.js
function extractBrighterScriptExports(content) {
  const exports = [];
  const seen = new Set;
  const push = (name, kind, signature) => {
    const key = `${kind}:${name}`;
    if (seen.has(key))
      return;
    seen.add(key);
    exports.push({ name, kind, signature });
  };
  const lines = content.split(`
`);
  for (const line of lines) {
    const trimmed = line.trim();
    const classMatch = trimmed.match(/^class\s+([A-Za-z_][\w]*)(?:\s+extends\s+([A-Za-z_][\w.]*))?/i);
    if (classMatch) {
      const name = classMatch[1];
      const parent = classMatch[2];
      push(name, "class", parent ? `class ${name} extends ${parent}` : `class ${name}`);
      continue;
    }
    const nsMatch = trimmed.match(/^namespace\s+([A-Za-z_][\w.]*)/i);
    if (nsMatch) {
      push(nsMatch[1], "const", `namespace ${nsMatch[1]}`);
      continue;
    }
    const enumMatch = trimmed.match(/^enum\s+([A-Za-z_][\w]*)/i);
    if (enumMatch) {
      push(enumMatch[1], "enum", `enum ${enumMatch[1]}`);
      continue;
    }
    const ifaceMatch = trimmed.match(/^interface\s+([A-Za-z_][\w]*)/i);
    if (ifaceMatch) {
      push(ifaceMatch[1], "interface", `interface ${ifaceMatch[1]}`);
      continue;
    }
  }
  for (const item of extractBrightScriptFunctions(content)) {
    push(item.name, item.kind, item.signature);
  }
  return exports;
}
var init_extract_brighterscript = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/libs.js
import { relative as relative6, extname as extname3 } from "path";
async function detectLibs(files, project) {
  const libFiles = files.filter((f) => {
    const ext = extname3(f);
    if (![".ts", ".js", ".mjs", ".py", ".go", ".dart", ".swift", ".cs", ".php", ".brs", ".bs"].includes(ext))
      return false;
    if (f.endsWith(".test.ts") || f.endsWith(".spec.ts"))
      return false;
    if (f.endsWith(".test.js") || f.endsWith(".spec.js"))
      return false;
    if (f.endsWith(".d.ts"))
      return false;
    if (f.endsWith("_test.py") || f.endsWith("_test.go"))
      return false;
    if (f.endsWith("_test.dart") || f.endsWith(".g.dart"))
      return false;
    if (f.endsWith("Tests.swift") || f.endsWith("_test.swift"))
      return false;
    const relForFilter = "/" + relative6(project.root, f).replace(/\\/g, "/");
    if (ext === ".brs" || ext === ".bs") {
      if (/\/tests?\//i.test(relForFilter))
        return false;
      if (/\/components\//i.test(relForFilter))
        return false;
    }
    if (f.endsWith(".tsx") || f.endsWith(".jsx"))
      return false;
    if (SKIP_DIRS.some((d) => relForFilter.includes(d)))
      return false;
    return true;
  });
  const libs = [];
  for (const file of libFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative6(project.root, file);
    const ext = extname3(file);
    let exports;
    if (ext === ".py") {
      exports = extractPythonExports(content);
    } else if (ext === ".go") {
      exports = extractGoExports(content);
    } else if (ext === ".dart") {
      exports = extractDartExports(content);
    } else if (ext === ".swift") {
      exports = extractSwiftExports(content);
    } else if (ext === ".cs") {
      exports = extractCSharpExports(content);
    } else if (ext === ".php") {
      exports = extractPhpExports(content);
    } else if (ext === ".brs") {
      exports = extractBrightScriptFunctions(content);
    } else if (ext === ".bs") {
      exports = extractBrighterScriptExports(content);
    } else {
      exports = extractTSExports(content);
    }
    const hasMeaningful = exports.some((e) => e.kind === "function" || e.kind === "class");
    if (hasMeaningful && exports.length > 0) {
      libs.push({ file: rel, exports });
    }
  }
  return libs;
}
function extractTSExports(content) {
  const exports = [];
  const fnPattern = /export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\n{]+))?/g;
  let match;
  while ((match = fnPattern.exec(content)) !== null) {
    const params = compactParams(match[2]);
    const ret = match[3]?.trim() || "void";
    exports.push({
      name: match[1],
      kind: "function",
      signature: `(${params}) => ${ret}`
    });
  }
  const constFnPattern = /export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|(\w+))\s*(?::\s*[^=]+)?\s*=>/g;
  while ((match = constFnPattern.exec(content)) !== null) {
    exports.push({
      name: match[1],
      kind: "function"
    });
  }
  const classPattern = /export\s+(?:abstract\s+)?class\s+(\w+)/g;
  while ((match = classPattern.exec(content)) !== null) {
    exports.push({ name: match[1], kind: "class" });
  }
  const ifacePattern = /export\s+interface\s+(\w+)/g;
  while ((match = ifacePattern.exec(content)) !== null) {
    exports.push({ name: match[1], kind: "interface" });
  }
  const typePattern = /export\s+type\s+(\w+)/g;
  while ((match = typePattern.exec(content)) !== null) {
    exports.push({ name: match[1], kind: "type" });
  }
  const enumPattern = /export\s+(?:const\s+)?enum\s+(\w+)/g;
  while ((match = enumPattern.exec(content)) !== null) {
    exports.push({ name: match[1], kind: "enum" });
  }
  const constPattern = /export\s+const\s+(\w+)\s*(?::\s*([^=\n]+))?\s*=/g;
  while ((match = constPattern.exec(content)) !== null) {
    if (exports.some((e) => e.name === match[1]))
      continue;
    const type = match[2]?.trim();
    exports.push({
      name: match[1],
      kind: "const",
      signature: type || undefined
    });
  }
  return exports;
}
function extractPythonExports(content) {
  const exports = [];
  const fnPattern = /^def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\n:]+))?:/gm;
  let match;
  while ((match = fnPattern.exec(content)) !== null) {
    if (match[1].startsWith("_"))
      continue;
    const params = compactParams(match[2]);
    const ret = match[3]?.trim() || "";
    exports.push({
      name: match[1],
      kind: "function",
      signature: ret ? `(${params}) -> ${ret}` : `(${params})`
    });
  }
  const asyncFnPattern = /^async\s+def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\n:]+))?:/gm;
  while ((match = asyncFnPattern.exec(content)) !== null) {
    if (match[1].startsWith("_"))
      continue;
    const params = compactParams(match[2]);
    const ret = match[3]?.trim() || "";
    exports.push({
      name: match[1],
      kind: "function",
      signature: ret ? `(${params}) -> ${ret}` : `(${params})`
    });
  }
  const classPattern = /^class\s+(\w+)/gm;
  while ((match = classPattern.exec(content)) !== null) {
    if (match[1].startsWith("_"))
      continue;
    exports.push({ name: match[1], kind: "class" });
  }
  return exports;
}
function extractGoExports(content) {
  const exports = [];
  const fnPattern = /^func\s+(\w+)\s*\(([^)]*)\)\s*([^\n{]*)/gm;
  let match;
  while ((match = fnPattern.exec(content)) !== null) {
    if (match[1][0] !== match[1][0].toUpperCase())
      continue;
    const params = compactParams(match[2]);
    const ret = match[3]?.trim() || "";
    exports.push({
      name: match[1],
      kind: "function",
      signature: `(${params}) ${ret}`.trim()
    });
  }
  const structPattern = /^type\s+(\w+)\s+struct/gm;
  while ((match = structPattern.exec(content)) !== null) {
    if (match[1][0] !== match[1][0].toUpperCase())
      continue;
    exports.push({ name: match[1], kind: "class" });
  }
  const ifacePattern = /^type\s+(\w+)\s+interface/gm;
  while ((match = ifacePattern.exec(content)) !== null) {
    if (match[1][0] !== match[1][0].toUpperCase())
      continue;
    exports.push({ name: match[1], kind: "interface" });
  }
  return exports;
}
function compactParams(params) {
  if (!params.trim())
    return "";
  return params.split(",").map((p) => {
    const trimmed = p.trim();
    if (trimmed.startsWith("{"))
      return "{...}";
    const name = trimmed.split(/[=:]/)[0].trim();
    return name;
  }).filter(Boolean).join(", ");
}
var SKIP_DIRS;
var init_libs = __esm(() => {
  init_scanner();
  init_extract_dart();
  init_extract_swift();
  init_extract_csharp();
  init_extract_php();
  init_extract_brighterscript();
  SKIP_DIRS = [
    "/components/",
    "/pages/",
    "/app/",
    "/routes/",
    "/views/",
    "/templates/",
    "/__tests__/",
    "/__mocks__/",
    "/test/",
    "/tests/",
    "/stories/"
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/config.js
import { readFile as readFile5 } from "fs/promises";
import { relative as relative7, join as join11, basename as basename4 } from "path";
async function detectConfig(files, project) {
  const configFiles = files.filter((f) => {
    const name = basename4(f);
    return CONFIG_FILES2.includes(name);
  }).map((f) => relative7(project.root, f));
  for (const cf of CONFIG_FILES2) {
    const content = await readFileSafe(join11(project.root, cf));
    if (content) {
      const rel = cf;
      if (!configFiles.includes(rel))
        configFiles.push(rel);
    }
  }
  if (project.frameworks.includes("roku-scenegraph")) {
    const manifestHits = files.filter((f) => basename4(f) === "manifest");
    for (const m of manifestHits) {
      const rel = relative7(project.root, m);
      if (!configFiles.includes(rel))
        configFiles.push(rel);
    }
    const rootManifest = await readFileSafe(join11(project.root, "manifest"));
    if (rootManifest && /^\s*title\s*=/m.test(rootManifest) && !configFiles.includes("manifest")) {
      configFiles.push("manifest");
    }
  }
  const envVars = await detectEnvVars(files, project);
  let dependencies = {};
  let devDependencies = {};
  try {
    const pkg = JSON.parse(await readFile5(join11(project.root, "package.json"), "utf-8"));
    dependencies = pkg.dependencies || {};
    devDependencies = pkg.devDependencies || {};
  } catch {}
  return {
    envVars,
    configFiles: configFiles.sort(),
    dependencies,
    devDependencies
  };
}
async function detectEnvVars(files, project) {
  const envMap = new Map;
  const envFiles = files.filter((f) => basename4(f) === ".env" || basename4(f) === ".env.example" || basename4(f) === ".env.local");
  for (const file of envFiles) {
    const content = await readFileSafe(file);
    for (const line of content.split(`
`)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#"))
        continue;
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
      if (match) {
        const name = match[1];
        const hasDefault = trimmed.includes("=") && trimmed.split("=")[1].trim().length > 0;
        envMap.set(name, {
          name,
          source: relative7(project.root, file),
          hasDefault
        });
      }
    }
  }
  const codeFiles = files.filter((f) => f.match(/\.(ts|js|tsx|jsx|mjs|cjs|py|go)$/) && !f.includes("node_modules"));
  for (const file of codeFiles) {
    const content = await readFileSafe(file);
    const rel = relative7(project.root, file);
    const addEnv = (name, hasDefault) => {
      if (!envMap.has(name)) {
        envMap.set(name, { name, source: rel, hasDefault });
      }
    };
    const nodeEnvPattern = /process\.env\.([A-Z_][A-Z0-9_]*)(\s*(?:\?\?|\|\|))?/g;
    let match;
    while ((match = nodeEnvPattern.exec(content)) !== null) {
      addEnv(match[1], Boolean(match[2]));
    }
    const nodeEnvBracket = /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\](\s*(?:\?\?|\|\|))?/g;
    while ((match = nodeEnvBracket.exec(content)) !== null) {
      addEnv(match[1], Boolean(match[2]));
    }
    const bunEnvPattern = /Bun\.env\.([A-Z_][A-Z0-9_]*)(\s*(?:\?\?|\|\|))?/g;
    while ((match = bunEnvPattern.exec(content)) !== null) {
      addEnv(match[1], Boolean(match[2]));
    }
    const viteEnvPattern = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)(\s*(?:\?\?|\|\|))?/g;
    while ((match = viteEnvPattern.exec(content)) !== null) {
      addEnv(match[1], Boolean(match[2]));
    }
    const pyEnvGetPattern = /os\.(?:environ\.get|getenv)\s*\(\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*(,\s*[^)]+)?\)/g;
    while ((match = pyEnvGetPattern.exec(content)) !== null) {
      addEnv(match[1], Boolean(match[2]));
    }
    const pyEnvBracket = /os\.environ\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g;
    while ((match = pyEnvBracket.exec(content)) !== null) {
      addEnv(match[1], false);
    }
    const goEnvPattern = /os\.Getenv\(["']([A-Z_][A-Z0-9_]*)["']\)/g;
    while ((match = goEnvPattern.exec(content)) !== null) {
      addEnv(match[1], false);
    }
  }
  if (project.frameworks.includes("roku-scenegraph")) {
    const manifestFiles = files.filter((f) => basename4(f) === "manifest");
    const rootManifestPath = join11(project.root, "manifest");
    try {
      const rootManifest = await readFileSafe(rootManifestPath);
      if (rootManifest && /^\s*title\s*=/m.test(rootManifest)) {
        manifestFiles.push(rootManifestPath);
      }
    } catch {}
    for (const mfile of manifestFiles) {
      const content = await readFileSafe(mfile);
      if (!content)
        continue;
      const source = relative7(project.root, mfile) || "manifest";
      for (const line of content.split(`
`)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
          continue;
        const m = trimmed.match(/^([A-Za-z_][\w]*)\s*=\s*(.*)$/);
        if (!m)
          continue;
        const name = `manifest.${m[1]}`;
        const hasDefault = m[2].trim().length > 0;
        if (!envMap.has(name))
          envMap.set(name, { name, source, hasDefault });
      }
    }
    const appConfigFiles = files.filter((f) => /appConfig\.brs$/i.test(f));
    const constPattern = /\b([A-Z][A-Z0-9_]{2,})\s*[:=]\s*["']([^"']*)["']/g;
    for (const file of appConfigFiles) {
      const content = await readFileSafe(file);
      if (!content)
        continue;
      const source = relative7(project.root, file).replace(/\\/g, "/");
      let m;
      while ((m = constPattern.exec(content)) !== null) {
        const name = m[1];
        if (envMap.has(name))
          continue;
        envMap.set(name, { name, source, hasDefault: m[2].length > 0 });
      }
    }
  }
  return Array.from(envMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
var CONFIG_FILES2;
var init_config2 = __esm(() => {
  init_scanner();
  CONFIG_FILES2 = [
    "tsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "vite.config.ts",
    "vite.config.js",
    "tailwind.config.ts",
    "tailwind.config.js",
    "drizzle.config.ts",
    "wrangler.toml",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".env.example",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
    "railway.json",
    "vercel.json",
    "fly.toml",
    "render.yaml"
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/middleware.js
import { relative as relative8, basename as basename5 } from "path";
function classifyMiddleware(name, content) {
  const combined = name + " " + content.slice(0, 500);
  for (const [type, patterns] of MIDDLEWARE_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) {
      return type;
    }
  }
  return "custom";
}
async function detectMiddleware(files, project) {
  const middleware = [];
  const middlewareFiles = files.filter((f) => {
    if (f.includes("middleware") || f.includes("guard") || f.includes("interceptor"))
      return true;
    if (/[\\/](?:routes?|controllers?|handlers?|pages|app)[\\/]/.test(f))
      return false;
    return basename5(f).startsWith("auth") || basename5(f).includes("rate") || basename5(f).includes("cors");
  });
  for (const file of middlewareFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative8(project.root, file);
    const name = basename5(file).replace(/\.[^.]+$/, "");
    middleware.push({
      name,
      file: rel,
      type: classifyMiddleware(name, content)
    });
  }
  const coveredTypes = new Set(middleware.map((m) => m.type).filter((t) => t !== "custom"));
  const pushScanned = (name, file, type) => {
    if (type === "custom" || coveredTypes.has(type))
      return;
    if (middleware.some((m) => m.name === name))
      return;
    middleware.push({ name, file, type });
    coveredTypes.add(type);
  };
  const routeFiles = files.filter((f) => f.match(/\.(ts|js|mjs|py|go)$/) && !f.includes("node_modules") && !middlewareFiles.includes(f));
  for (const file of routeFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative8(project.root, file);
    const usePattern = /\.use\s*\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?([\w.]+)\s*[\(,)]/g;
    let match;
    while ((match = usePattern.exec(content)) !== null) {
      const fnName = match[1];
      if (/router$|routes$/i.test(fnName))
        continue;
      pushScanned(fnName, rel, classifyMiddleware(fnName, ""));
    }
    const inlineArrayPat = /\.(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*\[([^\]]+)\]/gi;
    while ((match = inlineArrayPat.exec(content)) !== null) {
      const arrayContent = match[2];
      for (const part of arrayContent.split(",")) {
        const mwName = part.trim().replace(/\(.*$/, "");
        if (!mwName || mwName.length < 3)
          continue;
        pushScanned(mwName, rel, classifyMiddleware(mwName, ""));
      }
    }
    const inlineArgsPat = /\.(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(\w+)\s*,\s*(\w+)/gi;
    while ((match = inlineArgsPat.exec(content)) !== null) {
      const mwName = match[2];
      if (!mwName || mwName.length < 3)
        continue;
      pushScanned(mwName, rel, classifyMiddleware(mwName, ""));
    }
  }
  if (project.frameworks.includes("roku-scenegraph")) {
    const { extractBrightScriptObservers: extractBrightScriptObservers2, extractBrightScriptGlobalFields: extractBrightScriptGlobalFields2 } = await Promise.resolve().then(() => exports_extract_brightscript);
    const brsFiles = files.filter((f) => f.endsWith(".brs") || f.endsWith(".bs"));
    for (const file of brsFiles) {
      const content = await readFileSafe(file);
      if (!content)
        continue;
      const rel = relative8(project.root, file).replace(/\\/g, "/");
      for (const obs of extractBrightScriptObservers2(content)) {
        const name = `observeField(${obs.field}) -> ${obs.handler}`;
        if (middleware.some((m) => m.name === name && m.file === rel))
          continue;
        middleware.push({
          name,
          file: rel,
          type: obs.scope === "global" ? "custom" : "custom"
        });
      }
      for (const gf of extractBrightScriptGlobalFields2(content)) {
        const name = `m.global.${gf.name}: ${gf.type}`;
        if (middleware.some((m) => m.name === name))
          continue;
        middleware.push({ name, file: rel, type: "custom" });
      }
      if (/bugsnag/i.test(content) && /\bBugsnagTask\b/.test(content)) {
        const name = "BugsnagTask";
        if (!middleware.some((m) => m.name === name)) {
          middleware.push({ name, file: rel, type: "error-handler" });
        }
      }
      if (/RudderstackTask/.test(content)) {
        const name = "RudderstackTask";
        if (!middleware.some((m) => m.name === name)) {
          middleware.push({ name, file: rel, type: "logging" });
        }
      }
    }
  }
  return middleware;
}
var MIDDLEWARE_PATTERNS;
var init_middleware = __esm(() => {
  init_scanner();
  MIDDLEWARE_PATTERNS = [
    [
      "auth",
      [
        /auth/i,
        /jwt/i,
        /bearer/i,
        /passport/i,
        /clerk/i,
        /better-?auth/i,
        /session/i,
        /requireAuth/i,
        /isAuthenticated/i,
        /verifyToken/i,
        /protect/i
      ]
    ],
    [
      "rate-limit",
      [
        /rate.?limit/i,
        /throttle/i,
        /rateLimit/i,
        /rateLimiter/i,
        /slowDown/i
      ]
    ],
    ["cors", [/cors/i, /cross.?origin/i, /Access-Control/i]],
    [
      "validation",
      [
        /zod/i,
        /joi/i,
        /yup/i,
        /validator/i,
        /validate/i,
        /pydantic/i,
        /valibot/i
      ]
    ],
    [
      "logging",
      [
        /logger/i,
        /morgan/i,
        /pino/i,
        /winston/i,
        /requestLogger/i,
        /httpLogger/i
      ]
    ],
    [
      "error-handler",
      [
        /errorHandler/i,
        /error.?middleware/i,
        /onError/i,
        /exception.?handler/i
      ]
    ]
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/graph.js
import { relative as relative9, dirname, resolve as resolve2, extname as extname4 } from "path";
async function detectDependencyGraph(files, project, _config) {
  const edges = [];
  const importCount = new Map;
  const codeFiles = files.filter((f) => f.match(/\.(ts|tsx|js|jsx|mjs|py|go|rb|ex|exs|java|kt|rs|php|brs|bs|xml)$/));
  const relPathSet = new Set;
  const relPaths = [];
  const normalizedPaths = new Map;
  for (const file of files) {
    const rel = relative9(project.root, file);
    relPathSet.add(rel);
    relPaths.push(rel);
    normalizedPaths.set(rel.replace(/\\/g, "/"), rel);
  }
  for (const file of codeFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative9(project.root, file);
    const ext = extname4(file);
    if (ext === ".py") {
      extractPythonImports(content, rel, edges, importCount, normalizedPaths);
    } else if (ext === ".go") {
      extractGoImports(content, rel, edges, importCount);
    } else if (ext === ".rb") {
      extractRubyImports(content, rel, edges, importCount);
    } else if (ext === ".ex" || ext === ".exs") {
      extractElixirImports(content, rel, edges, importCount);
    } else if (ext === ".java" || ext === ".kt") {
      extractJavaImports(content, rel, edges, importCount, relPaths);
    } else if (ext === ".rs") {
      extractRustImports(content, rel, edges, importCount);
    } else if (ext === ".brs") {} else if (ext === ".bs") {
      extractBrighterScriptImportsInline(content, rel, edges, importCount, relPathSet);
    } else if (ext === ".xml") {
      extractSceneGraphImportsInline(content, rel, edges, importCount, relPathSet);
    } else {
      extractTSImports(content, rel, file, project, relPathSet, edges, importCount);
    }
  }
  const hotFiles = Array.from(importCount.entries()).map(([file, count]) => ({ file, importedBy: count })).sort((a, b) => b.importedBy - a.importedBy).slice(0, 20);
  return { edges, hotFiles };
}
function extractTSImports(content, rel, absPath, project, relPathSet, edges, importCount) {
  const patterns = [
    /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("~/"))
        continue;
      let resolvedPath;
      if (importPath.startsWith("@/") || importPath.startsWith("~/")) {
        resolvedPath = importPath.replace(/^[@~]\//, "src/");
      } else {
        const dir = dirname(absPath);
        resolvedPath = relative9(project.root, resolve2(dir, importPath));
      }
      const stripped = resolvedPath.replace(/\.(js|mjs|cjs)$/, "");
      const normalized = normalizeImportPath(stripped, relPathSet);
      if (normalized && normalized !== rel) {
        edges.push({ from: rel, to: normalized });
        importCount.set(normalized, (importCount.get(normalized) || 0) + 1);
      }
    }
  }
}
function extractPythonImports(content, rel, edges, importCount, normalizedPaths) {
  const relNorm = rel.replace(/\\/g, "/");
  const dir = dirname(relNorm) === "." ? "" : dirname(relNorm);
  const seen = new Set;
  const addEdge = (target) => {
    if (target === rel || seen.has(target))
      return;
    seen.add(target);
    edges.push({ from: rel, to: target });
    importCount.set(target, (importCount.get(target) || 0) + 1);
  };
  const resolveModule = (base) => {
    if (!base)
      return null;
    return normalizedPaths.get(base + ".py") ?? normalizedPaths.get(base + "/__init__.py") ?? null;
  };
  const ancestors = [];
  for (let d = dir;d; ) {
    ancestors.push(d);
    const idx = d.lastIndexOf("/");
    d = idx === -1 ? "" : d.slice(0, idx);
  }
  ancestors.push("");
  const resolveAbsolute = (modulePath) => {
    for (const a of ancestors) {
      const hit = resolveModule(a ? `${a}/${modulePath}` : modulePath);
      if (hit)
        return hit;
    }
    return null;
  };
  const parseNames = (names) => names.split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter((n) => /^[A-Za-z_]\w*$/.test(n));
  const fromPattern = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(.+)$/gm;
  let match;
  while ((match = fromPattern.exec(content)) !== null) {
    const dots = match[1];
    const modPath = match[2].replace(/\./g, "/");
    const names = parseNames(match[3]);
    const isRelative = dots.length > 0;
    let base;
    if (isRelative) {
      let d = dir;
      for (let i = 1;i < dots.length && d !== null; i++) {
        d = d === "" ? null : d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "";
      }
      if (d === null)
        continue;
      base = modPath ? d ? `${d}/${modPath}` : modPath : d;
    } else {
      base = modPath;
    }
    const tryResolve = (p) => isRelative ? resolveModule(p) : resolveAbsolute(p);
    let sawSymbol = names.length === 0;
    let resolvedAny = false;
    for (const name of names) {
      const hit = base !== "" ? tryResolve(`${base}/${name}`) : isRelative ? resolveModule(name) : resolveAbsolute(name);
      if (hit) {
        addEdge(hit);
        resolvedAny = true;
      } else {
        sawSymbol = true;
      }
    }
    if ((sawSymbol || !resolvedAny) && base) {
      const baseHit = tryResolve(base);
      if (baseHit)
        addEdge(baseHit);
    }
  }
  const importPattern = /^[ \t]*import[ \t]+([\w. \t,]+)$/gm;
  while ((match = importPattern.exec(content)) !== null) {
    for (const name of parseNamesDotted(match[1])) {
      const hit = resolveAbsolute(name.replace(/\./g, "/"));
      if (hit)
        addEdge(hit);
    }
  }
}
function parseNamesDotted(names) {
  return names.split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter((n) => /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(n));
}
function extractGoImports(content, rel, edges, importCount) {
  const importBlock = content.match(/import\s*\(([\s\S]*?)\)/);
  if (!importBlock)
    return;
  const lines = importBlock[1].split(`
`);
  for (const line of lines) {
    const pathMatch = line.match(/["']([^"']+)["']/);
    if (pathMatch && pathMatch[1].includes("/") && !pathMatch[1].startsWith("github.com") && !pathMatch[1].includes(".")) {
      const target = pathMatch[1];
      edges.push({ from: rel, to: target });
      importCount.set(target, (importCount.get(target) || 0) + 1);
    }
  }
}
function extractRubyImports(content, rel, edges, importCount) {
  const pattern = /require_relative\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const target = match[1].replace(/^\.\//, "") + ".rb";
    edges.push({ from: rel, to: target });
    importCount.set(target, (importCount.get(target) || 0) + 1);
  }
}
function extractElixirImports(content, rel, edges, importCount) {
  const pattern = /(?:alias|import|use)\s+([\w.]+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const mod = match[1];
    if (mod.includes(".") && !mod.startsWith("Ecto") && !mod.startsWith("Phoenix") && !mod.startsWith("Plug")) {
      const target = "lib/" + mod.split(".").map((s) => s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")).join("/") + ".ex";
      edges.push({ from: rel, to: target });
      importCount.set(target, (importCount.get(target) || 0) + 1);
    }
  }
}
function extractJavaImports(content, rel, edges, importCount, relPaths) {
  const pattern = /^import\s+([\w.]+);/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const imp = match[1];
    if (imp.startsWith("java.") || imp.startsWith("javax.") || imp.startsWith("org.springframework") || imp.startsWith("org.apache"))
      continue;
    const className = imp.split(".").pop();
    const found = relPaths.find((p) => p.endsWith(`/${className}.java`) || p.endsWith(`/${className}.kt`));
    if (found && found !== rel) {
      edges.push({ from: rel, to: found });
      importCount.set(found, (importCount.get(found) || 0) + 1);
    }
  }
}
function extractRustImports(content, rel, edges, importCount) {
  const modPattern = /^mod\s+(\w+)\s*;/gm;
  let match;
  while ((match = modPattern.exec(content)) !== null) {
    const dir = dirname(rel);
    const target = dir === "." ? `${match[1]}.rs` : `${dir}/${match[1]}.rs`;
    edges.push({ from: rel, to: target });
    importCount.set(target, (importCount.get(target) || 0) + 1);
  }
}
function normalizeImportPath(importPath, relPathSet) {
  if (relPathSet.has(importPath))
    return importPath;
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
  for (const ext of extensions) {
    if (relPathSet.has(importPath + ext))
      return importPath + ext;
  }
  for (const ext of extensions) {
    if (relPathSet.has(importPath + "/index" + ext))
      return importPath + "/index" + ext;
  }
  return null;
}
function extractSceneGraphImportsInline(content, rel, edges, importCount, relPathSet) {
  if (!/<component\b/i.test(content) && !/<script\b/i.test(content))
    return;
  const pattern = /<script\s+[^>]*\buri\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = pattern.exec(content)) !== null) {
    const target = resolveRokuImport(m[1], relPathSet);
    if (target && target !== rel) {
      edges.push({ from: rel, to: target });
      importCount.set(target, (importCount.get(target) || 0) + 1);
    }
  }
}
function extractBrighterScriptImportsInline(content, rel, edges, importCount, relPathSet) {
  const pattern = /^\s*import\s+["']([^"']+)["']/gim;
  let m;
  while ((m = pattern.exec(content)) !== null) {
    const target = resolveRokuImport(m[1], relPathSet);
    if (target && target !== rel) {
      edges.push({ from: rel, to: target });
      importCount.set(target, (importCount.get(target) || 0) + 1);
    }
  }
}
function resolveRokuImport(uri, relPathSet) {
  const stripped = uri.replace(/^pkg:\/+/, "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!stripped)
    return null;
  if (relPathSet.has(stripped))
    return stripped;
  for (const candidate of relPathSet) {
    const normalized = candidate.replace(/\\/g, "/");
    if (normalized.endsWith("/" + stripped) || normalized === stripped) {
      return candidate;
    }
  }
  return null;
}
var init_graph = __esm(() => {
  init_scanner();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/contracts.js
import { join as join12 } from "path";
async function enrichRouteContracts(routes, project) {
  const fileCache = new Map;
  for (const route of routes) {
    const absPath = join12(project.root, route.file);
    let content = fileCache.get(route.file);
    if (!content) {
      content = await readFileSafe(absPath);
      fileCache.set(route.file, content);
    }
    const params = [];
    const paramPatterns = [
      /:(\w+)/g,
      /\[(\w+)\]/g,
      /\{(\w+)\}/g,
      /<(\w+)>/g
    ];
    for (const pattern of paramPatterns) {
      let match;
      while ((match = pattern.exec(route.path)) !== null) {
        params.push(match[1]);
      }
    }
    if (params.length > 0)
      route.params = params;
    switch (route.framework) {
      case "hono":
      case "express":
      case "fastify":
      case "koa":
      case "nestjs":
      case "elysia":
      case "adonis":
      case "raw-http":
        enrichTSRoute(route, content);
        break;
      case "next-app":
      case "sveltekit":
      case "remix":
      case "nuxt":
        enrichNextRoute(route, content);
        break;
      case "fastapi":
        enrichFastAPIRoute(route, content);
        break;
      case "flask":
        enrichFlaskRoute(route, content);
        break;
    }
  }
  return routes;
}
function enrichTSRoute(route, content) {
  const jsonTypeMatch = content.match(/c\.json\s*<\s*([^>]+)\s*>/);
  if (jsonTypeMatch) {
    route.responseType = jsonTypeMatch[1].trim();
    return;
  }
  const zodInputMatch = content.match(/zValidator\s*\(\s*['"](?:json|form)['"],\s*(\w+)/);
  if (zodInputMatch) {
    route.requestType = zodInputMatch[1];
  }
  const handlerReturnMatch = content.match(/:\s*Promise\s*<\s*Response\s*<\s*([^>]+)\s*>\s*>/);
  if (handlerReturnMatch) {
    route.responseType = handlerReturnMatch[1].trim();
  }
}
function enrichNextRoute(route, content) {
  const responseMatch = content.match(/(?:NextResponse|Response)\.json\s*\(\s*\{([^}]{1,200})\}/);
  if (responseMatch) {
    const keys = responseMatch[1].split(",").map((s) => s.trim().split(/[:\s]/)[0]).filter(Boolean);
    if (keys.length > 0 && keys.length <= 8) {
      route.responseType = `{ ${keys.join(", ")} }`;
    }
  }
}
function enrichFastAPIRoute(route, content) {
  const responseModelMatch = content.match(new RegExp(`response_model\\s*=\\s*(\\w+)`));
  if (responseModelMatch) {
    route.responseType = responseModelMatch[1];
  }
  const funcPattern = new RegExp(`@\\w+\\.${route.method.toLowerCase()}\\s*\\([^)]*\\)\\s*\\n\\s*(?:async\\s+)?def\\s+\\w+\\s*\\(([^)]+)\\)`);
  const funcMatch = content.match(funcPattern);
  if (funcMatch) {
    const params = funcMatch[1];
    const bodyParam = params.match(/(\w+)\s*:\s*(\w+)(?!\s*=\s*(?:Depends|Query|Path|Header))/);
    if (bodyParam && !["Session", "Request", "Response", "str", "int", "float", "bool"].includes(bodyParam[2])) {
      route.requestType = bodyParam[2];
    }
  }
}
function enrichFlaskRoute(route, content) {
  const jsonifyMatch = content.match(/jsonify\s*\(\s*\{([^}]{1,200})\}/);
  if (jsonifyMatch) {
    const keys = jsonifyMatch[1].split(",").map((s) => s.trim().split(/['":\s]/)[0].replace(/['"]/g, "")).filter(Boolean);
    if (keys.length > 0 && keys.length <= 8) {
      route.responseType = `{ ${keys.join(", ")} }`;
    }
  }
}
var init_contracts = __esm(() => {
  init_scanner();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/tokens.js
function estimateTokens(text) {
  if (!text)
    return 0;
  let prose = 0;
  let code = 0;
  let whitespace = 0;
  for (const line of text.split(`
`)) {
    const trimmed = line.trimStart();
    if (!trimmed) {
      whitespace += 1;
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith(">") || trimmed.startsWith("_")) {
      prose += trimmed.length;
    } else if (trimmed.startsWith("- `") || trimmed.startsWith("  - ") || trimmed.includes(": ") || trimmed.startsWith("| ")) {
      code += Math.floor(trimmed.length * 0.5);
      prose += Math.floor(trimmed.length * 0.5);
    } else {
      code += trimmed.length;
    }
  }
  const proseTokens = Math.ceil(prose / 4);
  const codeTokens = Math.ceil(code / 3);
  const wsTokens = Math.ceil(whitespace / 8);
  return proseTokens + codeTokens + wsTokens;
}
function calculateTokenStats(result, outputText, fileCount) {
  const outputTokens = estimateTokens(outputText);
  const httpRoutes = result.routes.filter((r) => !["QUERY", "MUTATION", "SUBSCRIPTION", "RPC", "WS", "WS-ROOM"].includes(r.method));
  const specialRoutes = result.routes.filter((r) => ["QUERY", "MUTATION", "SUBSCRIPTION", "RPC"].includes(r.method));
  const wsRoutes = result.routes.filter((r) => r.method === "WS" || r.method === "WS-ROOM");
  const routeCost = httpRoutes.length * 400;
  const specialRouteCost = specialRoutes.length * 350;
  const wsCost = wsRoutes.length * 150;
  const schemaCost = result.schemas.filter((s) => !s.name.startsWith("enum:")).length * 300;
  const componentCost = result.components.length * 250;
  const libCost = result.libs.length * 200;
  const envVarCost = result.config.envVars.length * 100;
  const middlewareCost = result.middleware.length * 200;
  const hotFileCost = result.graph.hotFiles.length * 150;
  const searchOverhead = Math.min(fileCount, 50) * 80;
  const eventCost = (result.events?.length ?? 0) * 150;
  const rawExploration = routeCost + specialRouteCost + wsCost + schemaCost + componentCost + libCost + envVarCost + middlewareCost + hotFileCost + searchOverhead + eventCost;
  const estimatedExplorationTokens = Math.round(rawExploration * 1.3);
  const saved = Math.max(0, estimatedExplorationTokens - outputTokens);
  return { outputTokens, estimatedExplorationTokens, saved, fileCount };
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/graphql.js
import { relative as relative10 } from "path";
async function detectGraphQLRoutes(files, project) {
  const routes = [];
  const sdlFiles = files.filter((f) => f.endsWith(".graphql") || f.endsWith(".gql"));
  for (const file of sdlFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative10(project.root, file).replace(/\\/g, "/");
    routes.push(...extractSDLOperations(content, rel));
  }
  const tsJsFiles = files.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !f.includes("node_modules"));
  for (const file of tsJsFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    if (!content.includes("graphql") && !content.includes("gql`") && !content.includes("typeDefs") && !content.includes("SchemaBuilder") && !content.includes("buildSchema"))
      continue;
    const rel = relative10(project.root, file).replace(/\\/g, "/");
    const gqlTagPattern = /gql`([\s\S]*?)`/g;
    let match;
    while ((match = gqlTagPattern.exec(content)) !== null) {
      routes.push(...extractSDLOperations(match[1], rel));
    }
    const typeDefsPattern = /typeDefs\s*=\s*[`'"]([\s\S]*?)[`'"]/g;
    while ((match = typeDefsPattern.exec(content)) !== null) {
      routes.push(...extractSDLOperations(match[1], rel));
    }
    const pothosMethods = ["queryField", "mutationField", "subscriptionField", "queryFields", "mutationFields"];
    for (const method of pothosMethods) {
      const re = new RegExp(`\\.${method}\\s*\\(\\s*["'\`]([\\w]+)["'\`]`, "g");
      while ((match = re.exec(content)) !== null) {
        const operationType = method.startsWith("query") ? "QUERY" : method.startsWith("mutation") ? "MUTATION" : "SUBSCRIPTION";
        routes.push({
          method: operationType,
          path: match[1],
          file: rel,
          tags: [],
          framework: "graphql",
          confidence: "regex"
        });
      }
    }
  }
  const pyFiles = files.filter((f) => f.endsWith(".py"));
  for (const file of pyFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    if (!content.includes("strawberry") && !content.includes("graphene"))
      continue;
    const rel = relative10(project.root, file).replace(/\\/g, "/");
    const strawberryOps = [
      { decorator: "@strawberry.query", method: "QUERY" },
      { decorator: "@strawberry.mutation", method: "MUTATION" },
      { decorator: "@strawberry.subscription", method: "SUBSCRIPTION" }
    ];
    for (const { decorator, method } of strawberryOps) {
      const idx = content.indexOf(decorator);
      if (idx === -1)
        continue;
      const after = content.slice(idx + decorator.length, idx + decorator.length + 200);
      const fnMatch = after.match(/def\s+(\w+)/);
      if (fnMatch) {
        routes.push({
          method,
          path: fnMatch[1],
          file: rel,
          tags: [],
          framework: "graphql",
          confidence: "regex"
        });
      }
    }
    const typeClassPat = /@strawberry\.type[\s\S]{0,20}class\s+Query\b|@strawberry\.type[\s\S]{0,20}class\s+Mutation\b/;
    if (typeClassPat.test(content)) {
      const queryMethods = content.matchAll(/\bdef\s+(\w+)\s*\(self/g);
      for (const m of queryMethods) {
        if (m[1] !== "__init__") {
          const isInMutation = isInsideMutationClass(content, m.index ?? 0);
          routes.push({
            method: isInMutation ? "MUTATION" : "QUERY",
            path: m[1],
            file: rel,
            tags: [],
            framework: "graphql",
            confidence: "regex"
          });
        }
      }
    }
    const grapheneResolvers = content.matchAll(/def\s+resolve_(\w+)\s*\(/g);
    for (const m of grapheneResolvers) {
      routes.push({
        method: "QUERY",
        path: m[1],
        file: rel,
        tags: [],
        framework: "graphql",
        confidence: "regex"
      });
    }
    const grapheneMutations = content.matchAll(/class\s+(\w+)\s*\(graphene\.Mutation\)/g);
    for (const m of grapheneMutations) {
      routes.push({
        method: "MUTATION",
        path: m[1],
        file: rel,
        tags: [],
        framework: "graphql",
        confidence: "regex"
      });
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function extractSDLOperations(sdl, file) {
  const routes = [];
  const typeBlocks = [];
  const typeBlockPat = /\b(type|extend type)\s+(Query|Mutation|Subscription)\s*\{([^}]*)\}/gi;
  let m;
  while ((m = typeBlockPat.exec(sdl)) !== null) {
    typeBlocks.push({ type: m[2], body: m[3] });
  }
  for (const { type, body } of typeBlocks) {
    const method = type.toLowerCase() === "query" ? "QUERY" : type.toLowerCase() === "mutation" ? "MUTATION" : "SUBSCRIPTION";
    for (const line of body.split(`
`)) {
      const cleaned = line.trim().replace(/#.*$/, "");
      if (!cleaned)
        continue;
      const fieldMatch = cleaned.match(/^(\w+)\s*[:(]/);
      if (fieldMatch) {
        routes.push({
          method,
          path: fieldMatch[1],
          file,
          tags: [],
          framework: "graphql",
          confidence: "ast"
        });
      }
    }
  }
  return routes;
}
function isInsideMutationClass(content, idx) {
  const before = content.slice(0, idx);
  const lastClass = before.lastIndexOf("class ");
  if (lastClass === -1)
    return false;
  const classLine = content.slice(lastClass, lastClass + 100);
  return /class\s+Mutation\b/.test(classLine);
}
async function detectGRPCRoutes(files, project) {
  const routes = [];
  const protoFiles = files.filter((f) => f.endsWith(".proto"));
  for (const file of protoFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative10(project.root, file).replace(/\\/g, "/");
    const serviceBlocks = content.matchAll(/service\s+(\w+)\s*\{([^}]*)\}/g);
    for (const serviceMatch of serviceBlocks) {
      const serviceName = serviceMatch[1];
      const body = serviceMatch[2];
      const rpcDefs = body.matchAll(/rpc\s+(\w+)\s*\((\w+)\)\s+returns\s+\((\w+)\)/g);
      for (const rpc of rpcDefs) {
        routes.push({
          method: "RPC",
          path: `/${serviceName}/${rpc[1]}`,
          file: rel,
          tags: [],
          framework: "grpc",
          requestType: rpc[2],
          responseType: rpc[3],
          confidence: "ast"
        });
      }
    }
  }
  return routes;
}
async function detectWebSocketRoutes(files, project) {
  const routes = [];
  const relevantFiles = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|py|rb)$/.test(f) && !f.includes("node_modules"));
  for (const file of relevantFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    if (!content.includes("socket") && !content.includes("WebSocket") && !content.includes("ws.") && !content.includes("channel") && !content.includes("Channel"))
      continue;
    const rel = relative10(project.root, file).replace(/\\/g, "/");
    const socketOnPat = /(?:socket|io|ws)\.on\s*\(\s*["'`]([^"'`]+)["'`]/g;
    let m;
    while ((m = socketOnPat.exec(content)) !== null) {
      const eventName = m[1];
      if (eventName === "connection" || eventName === "disconnect")
        continue;
      routes.push({
        method: "WS",
        path: eventName,
        file: rel,
        tags: [],
        framework: "websocket",
        confidence: "regex"
      });
    }
    const roomPat = /socket\.join\s*\(\s*["'`]([^"'`]+)["'`]/g;
    const seenRooms = new Set;
    while ((m = roomPat.exec(content)) !== null) {
      if (!seenRooms.has(m[1])) {
        seenRooms.add(m[1]);
        routes.push({
          method: "WS-ROOM",
          path: m[1],
          file: rel,
          tags: [],
          framework: "websocket",
          confidence: "regex"
        });
      }
    }
    const phoenixChannelPat = /channel\s+"([^"]+)"/g;
    while ((m = phoenixChannelPat.exec(content)) !== null) {
      routes.push({
        method: "WS",
        path: m[1],
        file: rel,
        tags: [],
        framework: "websocket",
        confidence: "regex"
      });
    }
    if (file.endsWith(".rb")) {
      const acPat = /class\s+(\w+Channel)\s*<\s*(?:\w+::)*Channel/g;
      while ((m = acPat.exec(content)) !== null) {
        routes.push({
          method: "WS",
          path: m[1].replace(/Channel$/, "").replace(/([A-Z])/g, (_, c, i) => (i > 0 ? "_" : "") + c.toLowerCase()),
          file: rel,
          tags: ["ActionCable"],
          framework: "websocket",
          confidence: "regex"
        });
      }
    }
  }
  const seen = new Set;
  return routes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
var init_graphql = __esm(() => {
  init_scanner();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/events.js
import { relative as relative11 } from "path";
async function detectEvents(files, project) {
  const events = [];
  const relevantFiles = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|py|rb|ex|exs|brs|bs)$/.test(f) && !f.includes("node_modules"));
  for (const file of relevantFiles) {
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative11(project.root, file).replace(/\\/g, "/");
    const bullmqPattern = /new\s+(?:Queue|Worker|FlowProducer)\s*\(\s*["'`]([^"'`]+)["'`]/g;
    let m;
    while ((m = bullmqPattern.exec(content)) !== null) {
      events.push({
        name: m[1],
        type: "queue",
        system: "bullmq",
        file: rel
      });
    }
    const bullJobPattern = /\.add\s*\(\s*["'`]([^"'`]+)["'`]\s*,/g;
    while ((m = bullJobPattern.exec(content)) !== null) {
      if (content.includes("Queue") || content.includes("Worker")) {
        events.push({
          name: m[1],
          type: "queue",
          system: "bullmq",
          file: rel
        });
      }
    }
    const kafkaTopicPattern = /topic\s*:\s*["'`]([^"'`]+)["'`]/g;
    if (content.includes("kafka") || content.includes("Kafka")) {
      while ((m = kafkaTopicPattern.exec(content)) !== null) {
        events.push({
          name: m[1],
          type: "topic",
          system: "kafka",
          file: rel
        });
      }
    }
    const redisPubSubPattern = /(?:publish|subscribe|psubscribe)\s*\(\s*["'`]([^"'`]+)["'`]/g;
    if (content.includes("redis") || content.includes("Redis") || content.includes("ioredis")) {
      while ((m = redisPubSubPattern.exec(content)) !== null) {
        events.push({
          name: m[1],
          type: "channel",
          system: "redis-pub-sub",
          file: rel
        });
      }
    }
    const emitterPattern = /(?:emit|on|once|addListener)\s*\(\s*["'`]([^"'`]+)["'`]/g;
    if (content.includes("EventEmitter") || content.includes(".emit(") || content.includes("eventBus")) {
      while ((m = emitterPattern.exec(content)) !== null) {
        const eventName = m[1];
        if (["error", "close", "connect", "disconnect", "connection", "data", "end", "drain"].includes(eventName))
          continue;
        events.push({
          name: eventName,
          type: "event",
          system: "eventemitter",
          file: rel
        });
      }
    }
    if (file.endsWith(".py") && (content.includes("celery") || content.includes("Celery"))) {
      const moduleName = rel.endsWith("/__init__.py") ? rel.slice(0, -"/__init__.py".length).replace(/\//g, ".") : rel.replace(/\.py$/, "").replace(/\//g, ".");
      const celeryTaskPat = /@(?:(?:\w+)\.task|shared_task)\s*(?:\(([\s\S]{0,300}?)\))?\s*\n\s*def\s+(\w+)/g;
      let celeryMatch;
      while ((celeryMatch = celeryTaskPat.exec(content)) !== null) {
        const decoratorArgs = celeryMatch[1] || "";
        const functionName = celeryMatch[2];
        const explicitName = decoratorArgs.match(/\bname\s*=\s*["']([^"']+)["']/)?.[1];
        events.push({
          name: explicitName || `${moduleName}.${functionName}`,
          type: "queue",
          system: "celery",
          file: rel,
          payloadType: "celery-task"
        });
      }
    }
    if (file.endsWith(".ex") || file.endsWith(".exs")) {
      const elixirPubSubPat = /PubSub\.(?:broadcast|subscribe)\s*\([^,]+,\s*"([^"]+)"/g;
      while ((m = elixirPubSubPat.exec(content)) !== null) {
        events.push({
          name: m[1],
          type: "channel",
          system: "redis-pub-sub",
          file: rel
        });
      }
    }
    if (file.endsWith(".brs") || file.endsWith(".bs")) {
      const { extractBrightScriptObservers: extractBrightScriptObservers2, extractBrightScriptRudderstackEvents: extractBrightScriptRudderstackEvents2 } = await Promise.resolve().then(() => exports_extract_brightscript);
      for (const obs of extractBrightScriptObservers2(content)) {
        events.push({
          name: obs.field,
          type: "event",
          system: "scenegraph-observer",
          file: rel,
          payloadType: obs.scope === "global" ? "m.global" : "node-field"
        });
      }
      for (const evt of extractBrightScriptRudderstackEvents2(content)) {
        events.push({
          name: evt.name,
          type: "topic",
          system: "rudderstack",
          file: rel
        });
      }
    }
  }
  const seen = new Set;
  return events.filter((e) => {
    const key = `${e.system}:${e.type}:${e.name}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
var init_events = __esm(() => {
  init_scanner();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/coverage.js
import { relative as relative12, basename as basename6 } from "path";
function isTestFile(file) {
  return TEST_FILE_PATTERNS.some((p) => p.test(file)) || file.includes("/__tests__/") || file.includes("/test/") || file.includes("/tests/") || file.includes("/spec/");
}
async function detectTestCoverage(files, routes, schemas, projectRoot) {
  const testFiles = files.filter(isTestFile);
  const testedRoutes = new Set;
  const testedModels = new Set;
  const testContents = [];
  for (const tf of testFiles) {
    const content = await readFileSafe(tf);
    if (content)
      testContents.push(content.toLowerCase());
  }
  const allTestContent = testContents.join(`
`);
  for (const route of routes) {
    const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRegex = new RegExp(`["'\`]${escapedPath}["'\`]`);
    if (pathRegex.test(allTestContent)) {
      testedRoutes.add(`${route.method}:${route.path}`);
      continue;
    }
    const routeBase = basename6(route.file).replace(/\.(ts|tsx|js|jsx|py|rb|go|ex)$/, "");
    if (testFiles.some((tf) => {
      const testBase = basename6(tf).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, "").replace(/_(test|spec)$/, "").replace(/^test_/, "");
      return testBase === routeBase;
    })) {
      testedRoutes.add(`${route.method}:${route.path}`);
    }
  }
  for (const model of schemas) {
    const modelNameLower = model.name.toLowerCase();
    if (allTestContent.includes(modelNameLower)) {
      testedModels.add(model.name);
    }
  }
  const totalRoutes = routes.filter((r) => r.method !== "WS" && r.method !== "WS-ROOM").length;
  const totalModels = schemas.filter((s) => !s.name.startsWith("enum:")).length;
  const totalCoverable = totalRoutes + totalModels;
  const totalCovered = testedRoutes.size + testedModels.size;
  const coveragePercent = totalCoverable > 0 ? Math.round(totalCovered / totalCoverable * 100) : 0;
  return {
    testedRoutes: Array.from(testedRoutes),
    testedModels: Array.from(testedModels),
    testFiles: testFiles.map((f) => relative12(projectRoot, f).replace(/\\/g, "/")),
    coveragePercent
  };
}
var TEST_FILE_PATTERNS;
var init_coverage = __esm(() => {
  init_scanner();
  TEST_FILE_PATTERNS = [
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(ts|tsx|js|jsx)$/,
    /_test\.(py|rb|go|rs|ex|exs|java|kt)$/,
    /test_.*\.(py)$/,
    /_spec\.(rb)$/,
    /_test\.(go)$/
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/openapi.js
import { readFile as readFile6 } from "fs/promises";
import { join as join13, relative as relative13 } from "path";
async function detectOpenAPISpec(root, project) {
  let specContent = null;
  let specFile = null;
  outer:
    for (const dir of SEARCH_DIRS) {
      for (const name of SPEC_FILENAMES) {
        const fullPath = dir ? join13(root, dir, name) : join13(root, name);
        try {
          const content = await readFile6(fullPath, "utf-8");
          if (content.includes("openapi") || content.includes("swagger")) {
            specContent = content;
            specFile = relative13(root, fullPath).replace(/\\/g, "/");
            break outer;
          }
        } catch {}
      }
    }
  if (!specContent || !specFile) {
    return { routes: [], schemas: [], specFile: null };
  }
  let spec = null;
  try {
    spec = JSON.parse(specContent);
  } catch {
    spec = parseMinimalYAML(specContent);
  }
  if (!spec || typeof spec !== "object") {
    return { routes: [], schemas: [], specFile };
  }
  const routes = [];
  const schemas = [];
  const paths = spec.paths || {};
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object")
      continue;
    const httpMethods = ["get", "post", "put", "patch", "delete", "options", "head"];
    for (const method of httpMethods) {
      const operation = pathItem[method];
      if (!operation)
        continue;
      const tags = [];
      if (operation.tags)
        tags.push(...operation.tags.map((t) => t.toLowerCase()));
      if (path.includes("/auth") || path.includes("/login"))
        tags.push("auth");
      if (path.includes("/payment") || path.includes("/checkout"))
        tags.push("payment");
      let requestType;
      let responseType;
      const requestBody = operation.requestBody;
      if (requestBody?.content?.["application/json"]?.schema) {
        const schema = requestBody.content["application/json"].schema;
        requestType = extractSchemaRef(schema);
      }
      const responses = operation.responses || {};
      const successResponse = responses["200"] || responses["201"] || responses["202"];
      if (successResponse?.content?.["application/json"]?.schema) {
        const schema = successResponse.content["application/json"].schema;
        responseType = extractSchemaRef(schema);
      }
      const normalizedPath = path.replace(/\{(\w+)\}/g, ":$1");
      const params = (path.match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1));
      routes.push({
        method: method.toUpperCase(),
        path: normalizedPath,
        file: specFile,
        tags,
        framework: project.frameworks[0] ?? "raw-http",
        requestType,
        responseType,
        params: params.length > 0 ? params : undefined,
        confidence: "ast"
      });
    }
  }
  const schemaMap = spec.components?.schemas || spec.definitions || {};
  for (const [name, schemaDef] of Object.entries(schemaMap)) {
    if (!schemaDef || typeof schemaDef !== "object")
      continue;
    const fields = [];
    const required = new Set(schemaDef.required || []);
    const props = schemaDef.properties || {};
    for (const [fieldName, fieldDef] of Object.entries(props)) {
      if (!fieldDef)
        continue;
      const type = resolveFieldType(fieldDef);
      const flags = [];
      if (required.has(fieldName))
        flags.push("required");
      if (fieldDef.readOnly)
        flags.push("readonly");
      if (fieldDef.format === "uuid")
        flags.push("uuid");
      fields.push({ name: fieldName, type, flags });
    }
    if (fields.length > 0 || schemaDef.type === "object") {
      schemas.push({
        name,
        fields,
        relations: [],
        orm: "unknown",
        confidence: "ast"
      });
    }
  }
  return { routes, schemas, specFile };
}
function extractSchemaRef(schema) {
  if (!schema)
    return;
  if (schema.$ref) {
    return schema.$ref.split("/").pop();
  }
  if (schema.type === "array" && schema.items?.$ref) {
    return `${schema.items.$ref.split("/").pop()}[]`;
  }
  if (schema.type)
    return schema.type;
  return;
}
function resolveFieldType(fieldDef) {
  if (!fieldDef)
    return "unknown";
  if (fieldDef.$ref)
    return fieldDef.$ref.split("/").pop() ?? "ref";
  if (fieldDef.type === "array") {
    const itemType = fieldDef.items?.$ref ? fieldDef.items.$ref.split("/").pop() : fieldDef.items?.type || "any";
    return `${itemType}[]`;
  }
  if (fieldDef.format)
    return `${fieldDef.type}(${fieldDef.format})`;
  return fieldDef.type || "unknown";
}
function parseMinimalYAML(yaml) {
  const lines = yaml.split(`
`);
  return parseYAMLBlock(lines, 0, 0).value;
}
function parseYAMLBlock(lines, startIdx, baseIndent) {
  const obj = {};
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    const indent = line.length - trimmed.length;
    if (indent < baseIndent)
      break;
    if (indent > baseIndent) {
      i++;
      continue;
    }
    if (trimmed.startsWith("- ")) {
      break;
    }
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    if (rawValue && rawValue !== "|" && rawValue !== ">") {
      obj[key] = parseYAMLScalar(rawValue);
      i++;
    } else {
      const nextLineIdx = i + 1;
      if (nextLineIdx < lines.length) {
        const nextTrimmed = lines[nextLineIdx].trimStart();
        const nextIndent = lines[nextLineIdx].length - nextTrimmed.length;
        if (nextIndent > baseIndent) {
          if (nextTrimmed.startsWith("- ")) {
            const arr = [];
            let j = nextLineIdx;
            while (j < lines.length) {
              const lt = lines[j].trimStart();
              const li = lines[j].length - lt.length;
              if (li < nextIndent)
                break;
              if (lt.startsWith("- ")) {
                arr.push(parseYAMLScalar(lt.slice(2).trim()));
              }
              j++;
            }
            obj[key] = arr;
            i = j;
          } else {
            const nested = parseYAMLBlock(lines, nextLineIdx, nextIndent);
            obj[key] = nested.value;
            i = nested.nextIdx;
          }
        } else {
          obj[key] = null;
          i++;
        }
      } else {
        obj[key] = null;
        i++;
      }
    }
  }
  return { value: obj, nextIdx: i };
}
function parseYAMLScalar(s) {
  if (s === "true")
    return true;
  if (s === "false")
    return false;
  if (s === "null" || s === "~")
    return null;
  if (!isNaN(Number(s)) && s !== "")
    return Number(s);
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  return s;
}
var SPEC_FILENAMES, SEARCH_DIRS;
var init_openapi = __esm(() => {
  SPEC_FILENAMES = [
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "swagger.yaml",
    "swagger.yml",
    "swagger.json",
    "api.yaml",
    "api.yml",
    "api.json",
    "spec.yaml",
    "spec.yml",
    "spec.json"
  ];
  SEARCH_DIRS = ["", "docs", "api", "src", "spec", "openapi", "swagger"];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/cicd/yaml-parser.js
function parseYAML(text) {
  const lines = text.split(`
`);
  let start = 0;
  if (lines[start]?.trim() === "---")
    start++;
  start = skipEmpty(lines, start);
  if (start >= lines.length)
    return {};
  const { value } = parseBlock(lines, start, indentOf(lines[start]));
  return value;
}
function parseBlock(lines, startIdx, baseIndent) {
  const idx = skipEmpty(lines, startIdx);
  if (idx >= lines.length)
    return { value: {}, nextIdx: idx };
  const trimmed = lines[idx].trimStart();
  if (trimmed.startsWith("- ") || trimmed === "-") {
    return parseSequence(lines, idx, baseIndent);
  }
  return parseMapping(lines, idx, baseIndent);
}
function parseMapping(lines, startIdx, baseIndent) {
  const obj = Object.create(null);
  let i = startIdx;
  while (i < lines.length) {
    const ci = skipEmpty(lines, i);
    if (ci >= lines.length) {
      i = ci;
      break;
    }
    const line = lines[ci];
    const indent = indentOf(line);
    if (indent < baseIndent) {
      i = ci;
      break;
    }
    if (indent > baseIndent) {
      i = ci + 1;
      continue;
    }
    const trimmed = line.trimStart();
    if (trimmed.startsWith("- ")) {
      i = ci;
      break;
    }
    const colonIdx = findKeyColon(trimmed);
    if (colonIdx === -1) {
      i = ci + 1;
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();
    if (rawValue === "|" || rawValue === "|-" || rawValue === "|+" || rawValue === ">" || rawValue === ">-" || rawValue === ">+") {
      const fold = rawValue.startsWith(">");
      const { value, nextIdx } = consumeBlockScalar(lines, ci + 1, indent);
      obj[key] = fold ? value.replace(/\n/g, " ").trim() : value;
      i = nextIdx;
    } else if (rawValue) {
      obj[key] = parseInlineValue(rawValue);
      i = ci + 1;
    } else {
      const nextContent = skipEmpty(lines, ci + 1);
      if (nextContent < lines.length && indentOf(lines[nextContent]) > baseIndent) {
        const nested = parseBlock(lines, nextContent, indentOf(lines[nextContent]));
        obj[key] = nested.value;
        i = nested.nextIdx;
      } else {
        obj[key] = null;
        i = ci + 1;
      }
    }
  }
  return { value: obj, nextIdx: i };
}
function parseSequence(lines, startIdx, baseIndent) {
  const arr = [];
  let i = startIdx;
  while (i < lines.length) {
    const ci = skipEmpty(lines, i);
    if (ci >= lines.length) {
      i = ci;
      break;
    }
    const line = lines[ci];
    const indent = indentOf(line);
    if (indent < baseIndent) {
      i = ci;
      break;
    }
    if (indent > baseIndent) {
      i = ci + 1;
      continue;
    }
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("- ") && trimmed !== "-") {
      i = ci;
      break;
    }
    const afterDash = trimmed === "-" ? "" : trimmed.slice(2);
    const itemIndent = indent + 2;
    if (!afterDash.trim()) {
      const nextContent = skipEmpty(lines, ci + 1);
      if (nextContent < lines.length && indentOf(lines[nextContent]) >= itemIndent) {
        const nested = parseBlock(lines, nextContent, indentOf(lines[nextContent]));
        arr.push(nested.value);
        i = nested.nextIdx;
      } else {
        arr.push(null);
        i = ci + 1;
      }
    } else {
      const colonIdx = findKeyColon(afterDash);
      if (colonIdx !== -1) {
        const key = afterDash.slice(0, colonIdx).trim();
        const rawVal = afterDash.slice(colonIdx + 1).trim();
        const itemObj = {};
        if (rawVal === "|" || rawVal === "|-" || rawVal === "|+" || rawVal === ">" || rawVal === ">-" || rawVal === ">+") {
          const fold = rawVal.startsWith(">");
          const { value, nextIdx } = consumeBlockScalar(lines, ci + 1, indent);
          itemObj[key] = fold ? value.replace(/\n/g, " ").trim() : value;
          i = nextIdx;
        } else if (rawVal) {
          itemObj[key] = parseInlineValue(rawVal);
          i = ci + 1;
        } else {
          const nextContent = skipEmpty(lines, ci + 1);
          if (nextContent < lines.length && indentOf(lines[nextContent]) >= itemIndent) {
            const nested = parseBlock(lines, nextContent, indentOf(lines[nextContent]));
            itemObj[key] = nested.value;
            i = nested.nextIdx;
          } else {
            itemObj[key] = null;
            i = ci + 1;
          }
        }
        while (i < lines.length) {
          const si = skipEmpty(lines, i);
          if (si >= lines.length) {
            i = si;
            break;
          }
          const sLine = lines[si];
          const sIndent = indentOf(sLine);
          if (sIndent < itemIndent)
            break;
          if (sIndent > itemIndent) {
            i = si + 1;
            continue;
          }
          const sTrimmed = sLine.trimStart();
          if (sTrimmed.startsWith("- "))
            break;
          const sColon = findKeyColon(sTrimmed);
          if (sColon === -1) {
            i = si + 1;
            continue;
          }
          const sKey = sTrimmed.slice(0, sColon).trim();
          const sRaw = sTrimmed.slice(sColon + 1).trim();
          if (sRaw === "|" || sRaw === "|-" || sRaw === "|+" || sRaw === ">" || sRaw === ">-" || sRaw === ">+") {
            const fold = sRaw.startsWith(">");
            const { value, nextIdx } = consumeBlockScalar(lines, si + 1, sIndent);
            itemObj[sKey] = fold ? value.replace(/\n/g, " ").trim() : value;
            i = nextIdx;
          } else if (sRaw) {
            itemObj[sKey] = parseInlineValue(sRaw);
            i = si + 1;
          } else {
            const nextContent = skipEmpty(lines, si + 1);
            if (nextContent < lines.length && indentOf(lines[nextContent]) > sIndent) {
              const nested = parseBlock(lines, nextContent, indentOf(lines[nextContent]));
              itemObj[sKey] = nested.value;
              i = nested.nextIdx;
            } else {
              itemObj[sKey] = null;
              i = si + 1;
            }
          }
        }
        arr.push(itemObj);
      } else {
        arr.push(parseScalar(afterDash));
        i = ci + 1;
      }
    }
  }
  return { value: arr, nextIdx: i };
}
function consumeBlockScalar(lines, startIdx, parentIndent) {
  const collected = [];
  let i = startIdx;
  let scalarIndent = -1;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (scalarIndent !== -1)
        collected.push("");
      i++;
      continue;
    }
    const indent = indentOf(line);
    if (indent <= parentIndent)
      break;
    if (scalarIndent === -1)
      scalarIndent = indent;
    if (indent < scalarIndent)
      break;
    collected.push(line.slice(scalarIndent));
    i++;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  return { value: collected.join(`
`), nextIdx: i };
}
function parseInlineValue(raw) {
  if (raw.startsWith("["))
    return parseFlowSequence(raw);
  return parseScalar(raw);
}
function parseFlowSequence(s) {
  let depth = 0;
  let end = -1;
  let inQuote = null;
  for (let i = 0;i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === inQuote && s[i - 1] !== "\\")
        inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      continue;
    }
    if (c === "[")
      depth++;
    if (c === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1)
    end = s.length;
  const inner = s.slice(1, end).trim();
  if (!inner)
    return [];
  const items = [];
  let current = "";
  let bracketDepth = 0;
  inQuote = null;
  for (let i = 0;i < inner.length; i++) {
    const c = inner[i];
    if (inQuote) {
      current += c;
      if (c === inQuote && inner[i - 1] !== "\\")
        inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      current += c;
      continue;
    }
    if (c === "[") {
      bracketDepth++;
      current += c;
      continue;
    }
    if (c === "]") {
      bracketDepth--;
      current += c;
      continue;
    }
    if (c === "," && bracketDepth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim())
    items.push(current.trim());
  return items.map(parseScalar);
}
function parseScalar(s) {
  s = stripComment(s).trim();
  if (!s)
    return null;
  if (s === "true" || s === "True" || s === "TRUE")
    return true;
  if (s === "false" || s === "False" || s === "FALSE")
    return false;
  if (s === "null" || s === "~")
    return null;
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  const isNumeric = /^-?\d+(\.\d+)?$/.test(s);
  const isLeadingZeroInteger = /^-?0\d+$/.test(s);
  if (isNumeric && !isLeadingZeroInteger) {
    const n = Number(s);
    if (!isNaN(n))
      return n;
  }
  return s;
}
function stripComment(s) {
  let inQuote = null;
  for (let i = 0;i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === "\\" && inQuote === '"') {
        i++;
        continue;
      }
      if (c === inQuote)
        inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      continue;
    }
    if (c === "$" && s[i + 1] === "{" && s[i + 2] === "{") {
      const closeIdx = s.indexOf("}}", i + 3);
      if (closeIdx !== -1) {
        i = closeIdx + 1;
        continue;
      }
    }
    if (c === "#" && (i === 0 || s[i - 1] === " " || s[i - 1] === "\t")) {
      return s.slice(0, i).trimEnd();
    }
  }
  return s;
}
function findKeyColon(s) {
  let inQuote = null;
  for (let i = 0;i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === "\\" && inQuote === '"') {
        i++;
        continue;
      }
      if (c === inQuote)
        inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      continue;
    }
    if (c === ":" && (i + 1 >= s.length || s[i + 1] === " " || s[i + 1] === `
`)) {
      return i;
    }
  }
  return -1;
}
function indentOf(line) {
  let n = 0;
  for (let i = 0;i < line.length; i++) {
    if (line[i] === " ")
      n++;
    else
      break;
  }
  return n;
}
function skipEmpty(lines, startIdx) {
  let i = startIdx;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith("#"))
      return i;
    i++;
  }
  return i;
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/cicd/github-actions.js
import { basename as basename7, extname as extname5 } from "path";
function extractGitHubActionsWorkflow(parsed, relPath, rawContent) {
  if (!parsed || typeof parsed !== "object")
    return null;
  const name = parsed.name || basename7(relPath, extname5(relPath)).replace(/-/g, " ");
  const triggers = extractTriggers(parsed.on || parsed.true);
  const jobs = extractJobs(parsed.jobs);
  const reusableWorkflows = collectReusableWorkflowRefs(parsed.jobs);
  const isReusable = triggers.some((t) => t.event === "workflow_call");
  const secrets = extractSecrets(rawContent);
  const envVars = parsed.env ? Object.keys(parsed.env) : undefined;
  const environments = [
    ...new Set(jobs.map((j) => j.environment).filter(Boolean))
  ];
  const concurrencyGroup = typeof parsed.concurrency === "string" ? parsed.concurrency : parsed.concurrency?.group || undefined;
  const pipeline = {
    file: relPath,
    system: "github-actions",
    name: String(name),
    triggers,
    jobs
  };
  if (reusableWorkflows.length > 0)
    pipeline.reusableWorkflows = reusableWorkflows;
  if (isReusable)
    pipeline.isReusable = true;
  if (environments.length > 0)
    pipeline.environments = environments;
  if (secrets && secrets.length > 0)
    pipeline.secrets = secrets;
  if (envVars && envVars.length > 0)
    pipeline.envVars = envVars;
  if (concurrencyGroup)
    pipeline.concurrencyGroup = String(concurrencyGroup);
  return pipeline;
}
function extractTriggers(on) {
  if (!on)
    return [];
  if (typeof on === "string")
    return [{ event: on }];
  if (Array.isArray(on))
    return on.map((e) => ({ event: String(e) }));
  if (typeof on === "object") {
    return Object.entries(on).map(([event, config]) => {
      const trigger = { event };
      if (typeof config === "string") {
        trigger.schedule = config;
      } else if (Array.isArray(config) && config[0]?.cron) {
        trigger.schedule = config[0].cron;
      } else if (config && typeof config === "object") {
        if (config.branches)
          trigger.branches = asArray(config.branches);
        if (config.paths)
          trigger.paths = asArray(config.paths);
        if (config.inputs)
          trigger.inputs = Object.keys(config.inputs);
      }
      return trigger;
    });
  }
  return [];
}
function extractJobs(jobs) {
  if (!jobs || typeof jobs !== "object")
    return [];
  return Object.entries(jobs).map(([name, job]) => {
    if (!job || typeof job !== "object") {
      return { name, stepCount: 0 };
    }
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const actions = steps.filter((s) => s && s.uses).map((s) => String(s.uses));
    const result = {
      name,
      stepCount: steps.length
    };
    if (job["runs-on"]) {
      result.runner = stringifyRunner(job["runs-on"]);
    }
    if (job.uses && typeof job.uses === "string") {
      result.actions = [job.uses];
      result.stepCount = 1;
    } else if (actions.length > 0) {
      result.actions = actions;
    }
    if (job.needs)
      result.needs = asArray(job.needs);
    if (job.environment) {
      result.environment = typeof job.environment === "string" ? job.environment : job.environment?.name;
    }
    if (job.services && typeof job.services === "object") {
      result.services = Object.keys(job.services);
    }
    if (job.strategy?.matrix && typeof job.strategy.matrix === "object") {
      result.matrix = Object.keys(job.strategy.matrix).filter((k) => k !== "include" && k !== "exclude");
    }
    result.deployTarget = inferDeployTarget(result.actions || [], steps);
    return result;
  });
}
function collectReusableWorkflowRefs(jobs) {
  if (!jobs || typeof jobs !== "object")
    return [];
  const refs = [];
  for (const job of Object.values(jobs)) {
    if (job?.uses && typeof job.uses === "string" && job.uses.startsWith("./")) {
      refs.push(job.uses);
    }
    if (Array.isArray(job?.steps)) {
      for (const step of job.steps) {
        if (step?.uses && typeof step.uses === "string" && step.uses.startsWith("./")) {
          refs.push(step.uses);
        }
      }
    }
  }
  return [...new Set(refs)];
}
function extractSecrets(rawContent) {
  const pattern = /\$\{\{\s*secrets\.(\w+)\s*\}\}/g;
  const secrets = new Set;
  let m;
  while ((m = pattern.exec(rawContent)) !== null) {
    secrets.add(m[1]);
  }
  return [...secrets].sort();
}
function inferDeployTarget(actions, steps) {
  const allText = [
    ...actions,
    ...steps.map((s) => String(s?.run || ""))
  ].join(" ").toLowerCase();
  if (allText.includes("ecs") || allText.includes("amazon-ecs"))
    return "ecs";
  if (allText.includes("lambda") && allText.includes("deploy"))
    return "lambda";
  if (allText.includes("s3") && (allText.includes("deploy") || allText.includes("sync")))
    return "s3";
  if (allText.includes("vercel"))
    return "vercel";
  if (allText.includes("fly deploy") || allText.includes("flyctl"))
    return "fly";
  if (allText.includes("netlify"))
    return "netlify";
  if (allText.includes("heroku"))
    return "heroku";
  if (allText.includes("wrangler") || allText.includes("cloudflare"))
    return "cloudflare";
  if (allText.includes("gcloud") || allText.includes("cloud run"))
    return "gcp";
  if (allText.includes("azure") && allText.includes("deploy"))
    return "azure";
  if (allText.includes("docker push") || allText.includes("ecr-login") || allText.includes("amazon-ecr"))
    return "container-registry";
  return;
}
function asArray(val) {
  if (Array.isArray(val))
    return val.map(String);
  if (typeof val === "string")
    return [val];
  return [];
}
function stringifyRunner(val) {
  if (Array.isArray(val))
    return `[${val.join(", ")}]`;
  return String(val);
}
var init_github_actions = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/cicd/circleci.js
function extractCircleCIWorkflows(parsed, relPath, rawContent) {
  if (!parsed || typeof parsed !== "object")
    return [];
  const jobDefs = parsed.jobs || {};
  const workflows = parsed.workflows || {};
  const orbs = parsed.orbs ? Object.keys(parsed.orbs) : [];
  const parameters = parsed.parameters || {};
  const pipelines = [];
  for (const [name, wf] of Object.entries(workflows)) {
    if (name === "version")
      continue;
    if (!wf || typeof wf !== "object")
      continue;
    const wfObj = wf;
    const jobRefs = Array.isArray(wfObj.jobs) ? wfObj.jobs : [];
    const jobs = extractJobs2(jobRefs, jobDefs);
    const triggers = extractTriggers2(jobRefs, parameters, wfObj);
    const environments = collectEnvironments(jobRefs);
    const secrets = extractSecrets2(rawContent);
    const pipeline = {
      file: relPath,
      system: "circleci",
      name,
      triggers,
      jobs
    };
    if (environments.length > 0)
      pipeline.environments = environments;
    if (secrets.length > 0)
      pipeline.secrets = secrets;
    if (orbs.length > 0)
      pipeline.envVars = orbs.map((o) => `orb:${o}`);
    pipelines.push(pipeline);
  }
  return pipelines;
}
function extractJobs2(jobRefs, jobDefs) {
  return jobRefs.map((ref) => {
    const [jobName, jobConfig] = parseJobRef(ref);
    const jobDef = jobDefs[jobName] || {};
    const steps = Array.isArray(jobDef.steps) ? jobDef.steps : [];
    const result = {
      name: jobConfig?.name || jobName,
      stepCount: steps.length
    };
    if (Array.isArray(jobDef.docker) && jobDef.docker[0]?.image) {
      result.runner = String(jobDef.docker[0].image);
    } else if (jobDef.machine) {
      result.runner = typeof jobDef.machine === "string" ? jobDef.machine : jobDef.machine?.image || "machine";
    } else if (jobDef.macos) {
      result.runner = `macos:${jobDef.macos.xcode || "latest"}`;
    } else if (jobDef.resource_class) {
      result.runner = String(jobDef.resource_class);
    }
    if (jobConfig?.requires) {
      result.needs = asArray2(jobConfig.requires);
    }
    if (jobConfig?.context) {
      const contexts = asArray2(jobConfig.context);
      if (contexts.length > 0)
        result.environment = contexts.join(", ");
    }
    if (jobConfig?.type === "approval") {
      result.stepCount = 0;
      result.runner = "approval-gate";
    }
    const actions = [];
    for (const step of steps) {
      if (typeof step === "string" && step !== "checkout") {
        actions.push(step);
      } else if (step && typeof step === "object") {
        const stepKeys = Object.keys(step);
        for (const k of stepKeys) {
          if (k !== "run" && k !== "checkout" && k !== "when" && k !== "unless") {
            actions.push(k);
          }
        }
      }
    }
    if (actions.length > 0)
      result.actions = actions;
    return result;
  });
}
function extractTriggers2(jobRefs, parameters, workflow) {
  const triggers = [];
  const seenEvents = new Set;
  const paramInputs = [];
  for (const [pName, pDef] of Object.entries(parameters)) {
    if (pDef && typeof pDef === "object" && pDef.type === "boolean") {
      paramInputs.push(pName);
    }
  }
  if (paramInputs.length > 0) {
    triggers.push({ event: "parameter", inputs: paramInputs });
    seenEvents.add("parameter");
  }
  for (const ref of jobRefs) {
    const [, jobConfig] = parseJobRef(ref);
    if (!jobConfig?.filters)
      continue;
    const filters = jobConfig.filters;
    if (filters.branches) {
      if (!seenEvents.has("push")) {
        const trigger = { event: "push" };
        if (filters.branches.only)
          trigger.branches = asArray2(filters.branches.only);
        triggers.push(trigger);
        seenEvents.add("push");
      }
    }
    if (filters.tags) {
      if (!seenEvents.has("tag")) {
        const trigger = { event: "tag" };
        if (filters.tags.only)
          trigger.tags = asArray2(filters.tags.only);
        triggers.push(trigger);
        seenEvents.add("tag");
      }
    }
  }
  if (triggers.length === 0) {
    triggers.push({ event: "push" });
  }
  if (workflow.triggers) {
    const wfTriggers = Array.isArray(workflow.triggers) ? workflow.triggers : [workflow.triggers];
    for (const t of wfTriggers) {
      if (t?.schedule?.cron) {
        triggers.push({ event: "schedule", schedule: t.schedule.cron });
      }
    }
  }
  return triggers;
}
function collectEnvironments(jobRefs) {
  const envs = new Set;
  for (const ref of jobRefs) {
    const [, jobConfig] = parseJobRef(ref);
    if (jobConfig?.context) {
      for (const ctx of asArray2(jobConfig.context)) {
        envs.add(ctx);
      }
    }
  }
  return [...envs];
}
function extractSecrets2(rawContent) {
  const secrets = new Set;
  const patterns = [
    /\$(\w+_(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|ARN))\b/g,
    /\$\{(\w+_(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|ARN))\}/g
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(rawContent)) !== null) {
      secrets.add(m[1]);
    }
  }
  return [...secrets].sort();
}
function parseJobRef(ref) {
  if (typeof ref === "string")
    return [ref, null];
  if (ref && typeof ref === "object") {
    const keys = Object.keys(ref);
    if (keys.length > 0)
      return [keys[0], ref[keys[0]] || {}];
  }
  return ["unknown", null];
}
function asArray2(val) {
  if (Array.isArray(val))
    return val.map(String);
  if (typeof val === "string")
    return [val];
  return [];
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/cicd/formatter.js
function formatCICD(pipelines) {
  const lines = [];
  lines.push("# CI/CD Pipelines", "");
  const bySystem = new Map;
  for (const p of pipelines) {
    if (!bySystem.has(p.system))
      bySystem.set(p.system, []);
    bySystem.get(p.system).push(p);
  }
  for (const [system, items] of bySystem) {
    const label = systemLabel(system);
    lines.push(`## ${label} (${items.length} workflow${items.length > 1 ? "s" : ""})`, "");
    const reusable = items.filter((p) => p.isReusable);
    const regular = items.filter((p) => !p.isReusable);
    if (regular.length > 0) {
      lines.push("| Workflow | Triggers | Jobs | Deploy | Environments |");
      lines.push("|---|---|---|---|---|");
      for (const p of regular) {
        const name = escapeTableCell(p.name);
        const triggers = escapeTableCell(p.triggers.map((t) => t.event).join(", ") || "\u2014");
        const jobCount = String(p.jobs.length);
        const deploys = escapeTableCell(uniqueNonEmpty(p.jobs.map((j) => j.deployTarget)).join(", ") || "\u2014");
        const envs = escapeTableCell(p.environments?.join(", ") || "\u2014");
        lines.push(`| ${name} | ${triggers} | ${jobCount} | ${deploys} | ${envs} |`);
      }
      lines.push("");
    }
    for (const p of regular.filter((p2) => p2.jobs.length > 1)) {
      lines.push(`### ${p.name}`, "");
      lines.push(`> \`${p.file}\``, "");
      if (p.concurrencyGroup) {
        lines.push(`> Concurrency: \`${p.concurrencyGroup}\``, "");
      }
      for (const j of p.jobs) {
        const needs = j.needs?.length ? ` (needs: ${j.needs.join(", ")})` : "";
        const runner = j.runner ? ` on \`${j.runner}\`` : "";
        const steps = j.runner === "approval-gate" ? "approval gate" : `${j.stepCount} steps`;
        const deploy = j.deployTarget ? ` \u2192 **${j.deployTarget}**` : "";
        lines.push(`- **${j.name}**${runner} \u2014 ${steps}${needs}${deploy}`);
        if (j.actions?.length) {
          for (const a of j.actions.slice(0, MAX_DISPLAYED_ACTIONS)) {
            lines.push(`  - \`${a}\``);
          }
          if (j.actions.length > MAX_DISPLAYED_ACTIONS) {
            lines.push(`  - _...and ${j.actions.length - MAX_DISPLAYED_ACTIONS} more_`);
          }
        }
      }
      lines.push("");
    }
    if (reusable.length > 0) {
      lines.push("### Reusable Workflows", "");
      for (const p of reusable) {
        const jobNames = p.jobs.map((j) => j.name).join(", ");
        lines.push(`- \`${p.file}\` \u2014 ${p.name} (${jobNames})`);
      }
      lines.push("");
    }
    const allSecrets = [...new Set(items.flatMap((p) => p.secrets || []))].sort();
    if (allSecrets.length > 0) {
      lines.push("### Secrets", "");
      for (const s of allSecrets) {
        lines.push(`- \`${s}\``);
      }
      lines.push("");
    }
  }
  lines.push("---");
  const files = [...new Set(pipelines.map((p) => p.file))].sort();
  lines.push(`_Source: ${files.join(", ")}_`);
  lines.push("_Generated by codesight-cicd-plugin_");
  lines.push("");
  return lines.join(`
`);
}
function systemLabel(system) {
  switch (system) {
    case "github-actions":
      return "GitHub Actions";
    case "circleci":
      return "CircleCI";
    default:
      return system;
  }
}
function uniqueNonEmpty(arr) {
  return [...new Set(arr.filter(Boolean))];
}
function escapeTableCell(s) {
  return s.replace(/\|/g, "\\|");
}
var MAX_DISPLAYED_ACTIONS = 8;

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/cicd/index.js
import { readFile as readFile7, readdir as readdir2 } from "fs/promises";
import { relative as relative14, join as join14 } from "path";
function createCICDPlugin(config = {}) {
  const systems = new Set(config.systems || ["github-actions", "circleci"]);
  return {
    name: "cicd",
    detector: async (_files, project) => {
      const pipelines = [];
      if (systems.has("github-actions")) {
        const ghFiles = await collectGitHubActionsFiles(project.root);
        for (const file of ghFiles) {
          const content = await readFileSafe2(file);
          if (!content)
            continue;
          try {
            const parsed = parseYAML(content);
            const relPath = relative14(project.root, file).replace(/\\/g, "/");
            const pipeline = extractGitHubActionsWorkflow(parsed, relPath, content);
            if (pipeline)
              pipelines.push(pipeline);
          } catch {}
        }
      }
      if (systems.has("circleci")) {
        for (const ext of ["config.yml", "config.yaml"]) {
          const circleFile = join14(project.root, ".circleci", ext);
          const content = await readFileSafe2(circleFile);
          if (content) {
            try {
              const parsed = parseYAML(content);
              const relPath = relative14(project.root, circleFile).replace(/\\/g, "/");
              const extracted = extractCircleCIWorkflows(parsed, relPath, content);
              pipelines.push(...extracted);
            } catch {}
            break;
          }
        }
      }
      if (pipelines.length === 0)
        return {};
      return {
        customSections: [{ name: "cicd", content: formatCICD(pipelines) }]
      };
    }
  };
}
async function collectGitHubActionsFiles(root) {
  const workflowsDir = join14(root, ".github", "workflows");
  try {
    const entries = await readdir2(workflowsDir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && /\.ya?ml$/.test(e.name)).map((e) => join14(workflowsDir, e.name));
  } catch {
    return [];
  }
}
async function readFileSafe2(path) {
  try {
    return await readFile7(path, "utf-8");
  } catch {
    return "";
  }
}
var init_cicd = __esm(() => {
  init_github_actions();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/githooks/lefthook.js
import { readFile as readFile8 } from "fs/promises";
import { join as join15 } from "path";
async function parseLefthook(root) {
  for (const name of ["lefthook.yml", "lefthook.yaml", "lefthook.json"]) {
    try {
      const content = await readFile8(join15(root, name), "utf-8");
      return name.endsWith(".json") ? parseJson(JSON.parse(content), name) : parseYaml(content, name);
    } catch {}
  }
  return [];
}
function parseYaml(content, source) {
  const commandsByLifecycle = new Map;
  let currentLifecycle = null;
  let inCommands = false;
  let currentCommand = null;
  for (const raw of content.split(`
`)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const indent = raw.search(/\S/);
    if (indent === 0 && trimmed.endsWith(":")) {
      const key = trimmed.slice(0, -1);
      currentLifecycle = HOOK_NAMES.has(key) ? key : null;
      inCommands = false;
      currentCommand = null;
      if (currentLifecycle && !commandsByLifecycle.has(key)) {
        commandsByLifecycle.set(key, []);
      }
      continue;
    }
    if (!currentLifecycle)
      continue;
    if (indent === 2 && (trimmed === "commands:" || trimmed === "scripts:")) {
      inCommands = true;
      continue;
    }
    if (inCommands && indent === 4 && trimmed.endsWith(":") && !trimmed.startsWith("run:")) {
      currentCommand = trimmed.slice(0, -1);
      continue;
    }
    if (inCommands && currentCommand && indent === 6 && trimmed.startsWith("run:")) {
      const run = trimmed.slice(4).trim().replace(/^['"]|['"]$/g, "");
      commandsByLifecycle.get(currentLifecycle).push({ name: currentCommand, run });
      continue;
    }
    if (!inCommands && indent === 2 && trimmed.startsWith("run:")) {
      const run = trimmed.slice(4).trim().replace(/^['"]|['"]$/g, "");
      commandsByLifecycle.get(currentLifecycle).push({ name: currentLifecycle, run });
    }
  }
  return [...commandsByLifecycle.entries()].filter(([, cmds]) => cmds.length > 0).map(([lifecycle, commands]) => ({ lifecycle, tool: "lefthook", commands, source }));
}
function parseJson(obj, source) {
  const hooks = [];
  for (const lifecycle of HOOK_NAMES) {
    const hook = obj[lifecycle];
    if (!hook)
      continue;
    const commands = [];
    const block = hook.commands ?? hook.scripts;
    if (block && typeof block === "object") {
      for (const [name, cmd] of Object.entries(block)) {
        const c = cmd;
        if (typeof c?.run === "string")
          commands.push({ name, run: c.run });
      }
    }
    if (commands.length > 0)
      hooks.push({ lifecycle, tool: "lefthook", commands, source });
  }
  return hooks;
}
var HOOK_NAMES;
var init_lefthook = __esm(() => {
  HOOK_NAMES = new Set([
    "pre-commit",
    "commit-msg",
    "prepare-commit-msg",
    "post-commit",
    "pre-push",
    "post-merge",
    "post-checkout",
    "pre-rebase",
    "post-rewrite"
  ]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/githooks/husky.js
import { readdir as readdir3, readFile as readFile9 } from "fs/promises";
import { join as join16 } from "path";
async function parseHusky(root) {
  const hooks = [];
  try {
    const entries = await readdir3(join16(root, ".husky"), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !HOOK_NAMES2.has(entry.name))
        continue;
      const content = await readFile9(join16(root, ".husky", entry.name), "utf-8");
      const commands = extractShellCommands(content);
      if (commands.length > 0) {
        hooks.push({ lifecycle: entry.name, tool: "husky", commands, source: `.husky/${entry.name}` });
      }
    }
  } catch {}
  return hooks;
}
function extractShellCommands(content) {
  return content.split(`
`).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^#!/.test(l) && !l.startsWith(". ")).map((run) => ({ name: run.split(/\s+/)[0], run }));
}
var HOOK_NAMES2;
var init_husky = __esm(() => {
  HOOK_NAMES2 = new Set([
    "pre-commit",
    "commit-msg",
    "prepare-commit-msg",
    "post-commit",
    "pre-push",
    "post-merge",
    "post-checkout",
    "pre-rebase",
    "post-rewrite"
  ]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/githooks/raw.js
import { readdir as readdir4, readFile as readFile10, stat as stat4 } from "fs/promises";
import { join as join17 } from "path";
async function parseRawHooks(root) {
  const hooks = [];
  const hooksDir = join17(root, ".git", "hooks");
  try {
    const entries = await readdir4(hooksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith(".sample") || !HOOK_NAMES3.has(entry.name))
        continue;
      const fullPath = join17(hooksDir, entry.name);
      const s = await stat4(fullPath).catch(() => null);
      if (!s || !(s.mode & 73))
        continue;
      const content = await readFile10(fullPath, "utf-8").catch(() => "");
      const commands = extractShellCommands2(content);
      if (commands.length > 0) {
        hooks.push({ lifecycle: entry.name, tool: "raw", commands, source: `.git/hooks/${entry.name}` });
      }
    }
  } catch {}
  return hooks;
}
function extractShellCommands2(content) {
  return content.split(`
`).map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !/^#!/.test(l)).map((run) => ({ name: run.split(/\s+/)[0], run }));
}
var HOOK_NAMES3;
var init_raw = __esm(() => {
  HOOK_NAMES3 = new Set([
    "pre-commit",
    "commit-msg",
    "prepare-commit-msg",
    "post-commit",
    "pre-push",
    "post-merge",
    "post-checkout",
    "pre-rebase",
    "post-rewrite"
  ]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/githooks/formatter.js
function formatGitHooks(hooks) {
  const lines = [];
  lines.push("# Git Hooks", "");
  lines.push("> **Note for agents:** These hooks fire automatically on git operations and will block the operation if they fail.", "");
  const sorted = [...hooks].sort((a, b) => {
    const ai = LIFECYCLE_ORDER.indexOf(a.lifecycle);
    const bi = LIFECYCLE_ORDER.indexOf(b.lifecycle);
    if (ai === -1 && bi === -1)
      return a.lifecycle.localeCompare(b.lifecycle);
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  });
  for (const hook of sorted) {
    lines.push(`## \`${hook.lifecycle}\` \u2014 ${TOOL_LABEL[hook.tool] ?? hook.tool}`, "");
    for (const cmd of hook.commands) {
      lines.push(`- **${cmd.name}**: \`${cmd.run}\``);
    }
    lines.push("");
  }
  const sources = [...new Set(hooks.map((h) => h.source))].sort();
  lines.push(`_Source: ${sources.join(", ")}_`, "");
  return lines.join(`
`);
}
var LIFECYCLE_ORDER, TOOL_LABEL;
var init_formatter2 = __esm(() => {
  LIFECYCLE_ORDER = [
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "pre-rebase",
    "post-checkout",
    "post-merge",
    "pre-push",
    "post-rewrite"
  ];
  TOOL_LABEL = {
    lefthook: "lefthook",
    husky: "husky",
    raw: "raw git hook"
  };
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/githooks/index.js
function createGitHooksPlugin() {
  return {
    name: "githooks",
    detector: async (_files, project) => {
      const [lefthookHooks, huskyHooks, rawHooks] = await Promise.all([
        parseLefthook(project.root),
        parseHusky(project.root),
        parseRawHooks(project.root)
      ]);
      const managedLifecycles = new Set([
        ...lefthookHooks.map((h) => h.lifecycle),
        ...huskyHooks.map((h) => h.lifecycle)
      ]);
      const filteredRaw = rawHooks.filter((h) => !managedLifecycles.has(h.lifecycle));
      const allHooks = [...lefthookHooks, ...huskyHooks, ...filteredRaw];
      if (allHooks.length === 0)
        return {};
      return {
        customSections: [{ name: "githooks", content: formatGitHooks(allHooks) }]
      };
    }
  };
}
var init_githooks = __esm(() => {
  init_lefthook();
  init_husky();
  init_raw();
  init_formatter2();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/skills/formatter.js
function formatSkills(skills) {
  const lines = [];
  lines.push("# Claude Skills", "");
  lines.push("Project-local slash commands available to Claude Code agents:", "");
  for (const skill of [...skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const desc = skill.description ? ` \u2014 ${skill.description}` : "";
    lines.push(`- \`/${skill.name}\`${desc}`);
  }
  const dirs = [...new Set(skills.map((s) => s.path.split("/").slice(0, -1).join("/")))].sort();
  lines.push("", `_Source: ${dirs.join(", ")}_`, "");
  return lines.join(`
`);
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/skills/index.js
import { readdir as readdir5, readFile as readFile11 } from "fs/promises";
import { join as join18, basename as basename8, extname as extname6, relative as relative15 } from "path";
function createSkillsPlugin() {
  return {
    name: "skills",
    detector: async (_files, project) => {
      const skills = [];
      for (const dir of SKILL_DIRS) {
        const found = await readSkillsDir(join18(project.root, dir), project.root);
        skills.push(...found);
      }
      if (skills.length === 0)
        return {};
      return {
        customSections: [{ name: "skills", content: formatSkills(skills) }]
      };
    }
  };
}
async function readSkillsDir(dir, root) {
  const skills = [];
  try {
    const entries = await readdir5(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(md|txt)$/.test(entry.name))
        continue;
      const fullPath = join18(dir, entry.name);
      const content = await readFile11(fullPath, "utf-8");
      skills.push({
        name: basename8(entry.name, extname6(entry.name)),
        description: extractDescription(content),
        path: relative15(root, fullPath).replace(/\\/g, "/")
      });
    }
  } catch {}
  return skills;
}
function extractDescription(content) {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/^description:\s*(.+)$/m);
    if (descMatch)
      return descMatch[1].trim();
  }
  const body = fmMatch ? content.slice(fmMatch[0].length) : content;
  for (const line of body.split(`
`)) {
    const trimmed = line.trim().replace(/^#+\s*/, "");
    if (trimmed)
      return trimmed;
  }
  return "";
}
var SKILL_DIRS;
var init_skills = __esm(() => {
  SKILL_DIRS = [".claude/commands", ".claude/skills"];
});
// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/terraform/file-collector.js
var SKIP_DIRS2;
var init_file_collector = __esm(() => {
  SKIP_DIRS2 = new Set([".terraform", ".git", "node_modules", ".terragrunt-cache"]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/terraform/service-matcher.js
var init_service_matcher = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/terraform/extractor.js
var init_extractor = __esm(() => {
  init_service_matcher();
  init_file_collector();
});
// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/terraform/index.js
var init_terraform = __esm(() => {
  init_file_collector();
  init_service_matcher();
  init_extractor();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/plugins/index.js
function createBuiltinPlugins(disabled = new Set) {
  const all = [
    createCICDPlugin(),
    createGitHooksPlugin(),
    createSkillsPlugin()
  ];
  return all.filter((p) => !disabled.has(p.name));
}
var init_plugins = __esm(() => {
  init_cicd();
  init_githooks();
  init_skills();
  init_terraform();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/native.js
import { relative as relative16, extname as extname7 } from "path";
async function detectNative(files, project, resolved) {
  const registry = buildNativeRegistry(resolved);
  const routes = [];
  const schemas = [];
  if (registry.byExt.size === 0)
    return { routes, schemas, registry };
  for (const file of files) {
    const ext = extname7(file).toLowerCase();
    const entry = registry.byExt.get(ext);
    if (!entry)
      continue;
    const content = await readFileSafe(file);
    if (!content)
      continue;
    const rel = relative16(project.root, file);
    if (entry.plugin.routes) {
      try {
        const r = entry.plugin.routes(rel, content, "unknown", detectTags(content));
        if (r && r.length)
          routes.push(...r);
      } catch (e) {
        recordParseError(resolved, entry.lang, "routes", rel, e);
      }
    }
    if (entry.plugin.schemas) {
      try {
        const s = entry.plugin.schemas(rel, content);
        if (s && s.length)
          schemas.push(...s);
      } catch (e) {
        recordParseError(resolved, entry.lang, "schemas", rel, e);
      }
    }
  }
  return { routes, schemas, registry };
}
function mergeNativeRoutes(builtin, native, resolved, registry) {
  if (native.length === 0 && !resolved.authoritative)
    return builtin;
  const seen = new Set;
  const result = [];
  const add = (r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key))
      return;
    seen.add(key);
    result.push(r);
  };
  for (const r of native)
    add(r);
  if (resolved.authoritative) {
    const nativeFiles = new Set(native.map((r) => r.file));
    const warned = new Set;
    for (const r of builtin) {
      const owned = registry.byExt.has(extname7(r.file).toLowerCase());
      if (owned) {
        if (nativeFiles.has(r.file))
          continue;
        if (!warned.has(r.file)) {
          warned.add(r.file);
          warn(resolved, `native plugin found nothing in ${r.file}; using built-in extraction`);
        }
      }
      add(r);
    }
  } else {
    for (const r of builtin)
      add(r);
  }
  return result;
}
function mergeNativeSchemas(builtin, native) {
  if (native.length === 0)
    return builtin;
  const seen = new Set;
  const result = [];
  const add = (m) => {
    const key = m.name.toLowerCase();
    if (seen.has(key))
      return;
    seen.add(key);
    result.push(m);
  };
  for (const m of native)
    add(m);
  for (const m of builtin)
    add(m);
  return result;
}
function warn(resolved, message) {
  if (!resolved.warnings.includes(message))
    resolved.warnings.push(message);
}
var init_native = __esm(() => {
  init_scanner();
  init_routes();
  init_native_loader();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/core.js
import { join as join19 } from "path";
import { createRequire as createRequire3 } from "module";
async function scan(root, outputDirName, maxDepth, userConfig = {}, quiet = false) {
  const outputDir = join19(root, outputDirName);
  if (!quiet) {
    console.log(`
  ${BRAND} v${VERSION}`);
    console.log(`  Scanning: ${root}
`);
  }
  const startTime = Date.now();
  if (!quiet)
    process.stdout.write("  Detecting project...");
  const project = await detectProject(root);
  if (!quiet) {
    console.log(` ${project.frameworks.length > 0 ? project.frameworks.join(", ") : "generic"} | ${project.orms.length > 0 ? project.orms.join(", ") : "no ORM"} | ${project.language}`);
    if (project.isMonorepo) {
      const repoLabel = project.repoType === "meta" ? "Meta-repo" : project.repoType === "microservices" ? "Microservices" : "Monorepo";
      console.log(`  ${repoLabel}: ${project.workspaces.map((w) => w.name).join(", ")}`);
    }
  }
  if (!quiet)
    process.stdout.write("  Collecting files...");
  const ignoreFromFile = await readCodesightIgnore(root);
  const allIgnorePatterns = [...userConfig.ignorePatterns ?? [], ...ignoreFromFile];
  const files = await collectFiles(root, maxDepth, allIgnorePatterns);
  if (!quiet)
    console.log(` ${files.length} files`);
  if (!quiet)
    process.stdout.write("  Analyzing...");
  const disabled = new Set(userConfig.disableDetectors || []);
  const nativeResolved = resolveNativeAst(userConfig.nativeAst, project.root);
  const [rawHttpRoutes, builtinSchemas, components, libs, configResult, middleware, graph, graphqlRoutes, grpcRoutes, wsRoutes, events, openapi] = await Promise.all([
    disabled.has("routes") ? Promise.resolve([]) : detectRoutes(files, project, userConfig),
    disabled.has("schema") ? Promise.resolve([]) : detectSchemas(files, project, userConfig),
    disabled.has("components") ? Promise.resolve([]) : detectComponents(files, project, userConfig),
    disabled.has("libs") ? Promise.resolve([]) : detectLibs(files, project),
    disabled.has("config") ? Promise.resolve({ envVars: [], configFiles: [], dependencies: {}, devDependencies: {} }) : detectConfig(files, project),
    disabled.has("middleware") ? Promise.resolve([]) : detectMiddleware(files, project),
    disabled.has("graph") ? Promise.resolve({ edges: [], hotFiles: [] }) : detectDependencyGraph(files, project, userConfig),
    disabled.has("graphql") ? Promise.resolve([]) : detectGraphQLRoutes(files, project),
    disabled.has("graphql") ? Promise.resolve([]) : detectGRPCRoutes(files, project),
    disabled.has("graphql") ? Promise.resolve([]) : detectWebSocketRoutes(files, project),
    disabled.has("events") ? Promise.resolve([]) : detectEvents(files, project),
    detectOpenAPISpec(root, project)
  ]);
  const native = await detectNative(files, project, nativeResolved);
  const httpRoutes = disabled.has("routes") ? rawHttpRoutes : mergeNativeRoutes(rawHttpRoutes, native.routes, nativeResolved, native.registry);
  const schemas = disabled.has("schema") ? builtinSchemas : mergeNativeSchemas(builtinSchemas, native.schemas);
  const rawRoutes = [...httpRoutes, ...graphqlRoutes, ...grpcRoutes, ...wsRoutes];
  if (openapi.routes.length > 0) {
    if (rawRoutes.length === 0)
      rawRoutes.push(...openapi.routes);
    const existingModelNames = new Set(schemas.map((m) => m.name.toLowerCase()));
    for (const m of openapi.schemas) {
      if (!existingModelNames.has(m.name.toLowerCase()))
        schemas.push(m);
    }
  }
  const customSections = [];
  const activePlugins = [...createBuiltinPlugins(disabled), ...userConfig.plugins ?? []];
  if (activePlugins.length > 0) {
    for (const plugin of activePlugins) {
      if (plugin.detector) {
        try {
          const pluginResult = await plugin.detector(files, project);
          if (pluginResult.routes)
            rawRoutes.push(...pluginResult.routes);
          if (pluginResult.schemas)
            schemas.push(...pluginResult.schemas);
          if (pluginResult.components)
            components.push(...pluginResult.components);
          if (pluginResult.middleware)
            middleware.push(...pluginResult.middleware);
          if (pluginResult.customSections)
            customSections.push(...pluginResult.customSections);
        } catch (err) {
          if (!quiet)
            console.warn(`
  Warning: plugin "${plugin.name}" failed: ${err.message}`);
        }
      }
    }
  }
  const routes = await enrichRouteContracts(rawRoutes, project);
  const testCoverage = await detectTestCoverage(files, routes, schemas, root);
  const crudGroups = computeCrudGroups(routes);
  if (!quiet) {
    const astRoutes = routes.filter((r) => r.confidence === "ast").length;
    const astSchemas = schemas.filter((s) => s.confidence === "ast").length;
    const astComponents = components.filter((c) => c.confidence === "ast").length;
    const totalAST = astRoutes + astSchemas + astComponents;
    const nativeRoutes = routes.filter((r) => r.confidence === "native").length;
    const nativeSchemas = schemas.filter((s) => s.confidence === "native").length;
    const nativeComponents = components.filter((c) => c.confidence === "native").length;
    const totalNative = nativeRoutes + nativeSchemas + nativeComponents;
    const specialCounts = [];
    const gqlCount = routes.filter((r) => ["QUERY", "MUTATION", "SUBSCRIPTION"].includes(r.method)).length;
    const grpcCount = routes.filter((r) => r.method === "RPC").length;
    const wsCount = routes.filter((r) => r.method === "WS" || r.method === "WS-ROOM").length;
    if (gqlCount > 0)
      specialCounts.push(`${gqlCount} graphql`);
    if (grpcCount > 0)
      specialCounts.push(`${grpcCount} rpc`);
    if (wsCount > 0)
      specialCounts.push(`${wsCount} ws`);
    if (events.length > 0)
      specialCounts.push(`${events.length} events`);
    const specialStr = specialCounts.length > 0 ? `, ${specialCounts.join(", ")}` : "";
    const detail = [];
    if (totalNative > 0)
      detail.push(`native: ${nativeRoutes} routes, ${nativeSchemas} models, ${nativeComponents} components`);
    if (totalAST > 0)
      detail.push(`AST: ${astRoutes} routes, ${astSchemas} models, ${astComponents} components`);
    if (detail.length > 0) {
      console.log(` done (${detail.join(" | ")}${specialStr})`);
    } else if (specialCounts.length > 0) {
      console.log(` done (${specialCounts.join(", ")})`);
    } else {
      console.log(" done");
    }
    for (const w of nativeResolved.warnings)
      console.warn(`  Native-AST: ${w}`);
  }
  if (!quiet)
    process.stdout.write("  Writing output...");
  const tempResult = {
    project,
    routes,
    schemas,
    components,
    libs,
    config: configResult,
    middleware,
    graph,
    tokenStats: { outputTokens: 0, estimatedExplorationTokens: 0, saved: 0, fileCount: files.length },
    events: events.length > 0 ? events : undefined,
    testCoverage: testCoverage.testFiles.length > 0 ? testCoverage : undefined,
    crudGroups: crudGroups.length > 0 ? crudGroups : undefined,
    customSections: customSections.length > 0 ? customSections : undefined,
    nativeDiagnostics: nativeResolved.diagnostics.length > 0 ? nativeResolved.diagnostics : undefined
  };
  const outputContent = await writeOutput(tempResult, outputDir);
  const tokenStats = calculateTokenStats(tempResult, outputContent, files.length);
  const result = { ...tempResult, tokenStats };
  await writeOutput(result, outputDir);
  const elapsed = Date.now() - startTime;
  if (!quiet) {
    console.log(` ${outputDirName}/`);
    console.log(`
  Results:
    Routes:       ${routes.length}
    Models:       ${schemas.length}
    Components:   ${components.length}
    Libraries:    ${libs.length}
    Env vars:     ${configResult.envVars.length}
    Middleware:    ${middleware.length}
    Import links: ${graph.edges.length}
    Hot files:    ${graph.hotFiles.length}

  Tokens:
    Output size:     ~${tokenStats.outputTokens.toLocaleString()} tokens
    Exploration cost: ~${tokenStats.estimatedExplorationTokens.toLocaleString()} tokens
    Saved:           ~${tokenStats.saved.toLocaleString()} tokens per conversation

  Done in ${elapsed}ms
`);
  }
  return result;
}
var _require, _pkg, VERSION, BRAND = "codesight";
var init_core = __esm(() => {
  init_scanner();
  init_routes();
  init_schema();
  init_components();
  init_libs();
  init_config2();
  init_middleware();
  init_graph();
  init_contracts();
  init_graphql();
  init_events();
  init_coverage();
  init_openapi();
  init_formatter();
  init_native_loader();
  init_plugins();
  init_native();
  _require = createRequire3(import.meta.url);
_pkg = /* codesight-pkg-stub (build-time) */ { name: "codesight", version: "1.19.0" };
  VERSION = _pkg.version;
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/blast-radius.js
var exports_blast_radius = {};
__export(exports_blast_radius, {
  analyzeMultiFileBlastRadius: () => analyzeMultiFileBlastRadius,
  analyzeBlastRadius: () => analyzeBlastRadius
});
function analyzeBlastRadius(filePath, result, maxDepth = 3) {
  const { graph, routes, schemas, middleware } = result;
  const sep = graph.edges.length > 0 && graph.edges[0].from.includes("\\") ? "\\" : "/";
  const normPath = (p) => sep === "\\" ? p.replace(/\//g, "\\") : p.replace(/\\/g, "/");
  filePath = normPath(filePath);
  const importedBy = new Map;
  const imports = new Map;
  for (const edge of graph.edges) {
    if (!importedBy.has(edge.to))
      importedBy.set(edge.to, new Set);
    importedBy.get(edge.to).add(edge.from);
    if (!imports.has(edge.from))
      imports.set(edge.from, new Set);
    imports.get(edge.from).add(edge.to);
  }
  const affected = new Set;
  const queue = [{ file: filePath, depth: 0 }];
  while (queue.length > 0) {
    const { file, depth } = queue.shift();
    if (depth > maxDepth)
      continue;
    const dependents = importedBy.get(file);
    if (!dependents)
      continue;
    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.add(dep);
        queue.push({ file: dep, depth: depth + 1 });
      }
    }
  }
  affected.add(filePath);
  const affectedRoutes = routes.filter((r) => affected.has(r.file));
  const affectedModels = [];
  for (const schema of schemas) {
    for (const file of affected) {
      const routesInFile = routes.filter((r) => r.file === file);
      if (routesInFile.some((r) => r.tags.includes("db"))) {
        if (!affectedModels.includes(schema.name)) {
          affectedModels.push(schema.name);
        }
        break;
      }
    }
  }
  const affectedMiddleware = middleware.filter((m) => affected.has(m.file)).map((m) => m.name);
  return {
    file: filePath,
    affectedFiles: Array.from(affected).filter((f) => f !== filePath),
    affectedRoutes,
    affectedModels,
    affectedMiddleware,
    depth: maxDepth
  };
}
function analyzeMultiFileBlastRadius(files, result, maxDepth = 3) {
  const combined = new Set;
  const combinedRoutes = [];
  const combinedModels = new Set;
  const combinedMiddleware = new Set;
  const sep = result.graph.edges.length > 0 && result.graph.edges[0].from.includes("\\") ? "\\" : "/";
  const normPath = (p) => sep === "\\" ? p.replace(/\//g, "\\") : p.replace(/\\/g, "/");
  files = files.map(normPath);
  for (const file of files) {
    const br = analyzeBlastRadius(file, result, maxDepth);
    for (const f of br.affectedFiles)
      combined.add(f);
    for (const r of br.affectedRoutes) {
      if (!combinedRoutes.some((cr) => cr.path === r.path && cr.method === r.method)) {
        combinedRoutes.push(r);
      }
    }
    for (const m of br.affectedModels)
      combinedModels.add(m);
    for (const mw of br.affectedMiddleware)
      combinedMiddleware.add(mw);
  }
  for (const file of files)
    combined.delete(file);
  return {
    file: files.join(", "),
    affectedFiles: Array.from(combined),
    affectedRoutes: combinedRoutes,
    affectedModels: Array.from(combinedModels),
    affectedMiddleware: Array.from(combinedMiddleware),
    depth: maxDepth
  };
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/mcp-server.js
var exports_mcp_server = {};
__export(exports_mcp_server, {
  startMCPServer: () => startMCPServer
});
import { resolve as resolve3, join as join20 } from "path";
import { readFile as readFile12 } from "fs/promises";
function looksLikeFramedTransport(buffer) {
  return /^Content-Length\s*:/i.test(buffer);
}
function send(msg) {
  const json = JSON.stringify(msg);
  if (transportMode === "newline") {
    process.stdout.write(`${json}
`);
    return;
  }
  const header = `Content-Length: ${Buffer.byteLength(json)}\r
\r
`;
  process.stdout.write(header + json);
}
async function getScanResult(directory) {
  const root = resolve3(directory || process.cwd());
  if (cachedResult && cachedRoot2 === root)
    return cachedResult;
  const project = await detectProject(root);
  const userConfig = await loadConfig(root);
  const ignoreFromFile = await readCodesightIgnore(root);
  const allIgnore = [...userConfig.ignorePatterns ?? [], ...ignoreFromFile];
  const files = await collectFiles(root, userConfig.maxDepth ?? 10, allIgnore);
  const [rawHttpRoutes, schemas, components, libs, config, middleware, graph, graphqlRoutes, grpcRoutes, wsRoutes, events] = await Promise.all([
    detectRoutes(files, project),
    detectSchemas(files, project),
    detectComponents(files, project),
    detectLibs(files, project),
    detectConfig(files, project),
    detectMiddleware(files, project),
    detectDependencyGraph(files, project),
    detectGraphQLRoutes(files, project),
    detectGRPCRoutes(files, project),
    detectWebSocketRoutes(files, project),
    detectEvents(files, project)
  ]);
  const rawRoutes = [...rawHttpRoutes, ...graphqlRoutes, ...grpcRoutes, ...wsRoutes];
  const routes = await enrichRouteContracts(rawRoutes, project);
  const crudGroups = computeCrudGroups(routes);
  const tempResult = {
    project,
    routes,
    schemas,
    components,
    libs,
    config,
    middleware,
    graph,
    tokenStats: { outputTokens: 0, estimatedExplorationTokens: 0, saved: 0, fileCount: files.length },
    events: events.length > 0 ? events : undefined,
    crudGroups: crudGroups.length > 0 ? crudGroups : undefined
  };
  const outputContent = await writeOutput(tempResult, resolve3(root, ".codesight"));
  const tokenStats = calculateTokenStats(tempResult, outputContent, files.length);
  cachedResult = { ...tempResult, tokenStats };
  cachedRoot2 = root;
  return cachedResult;
}
async function toolScan(args) {
  const result = await getScanResult(args.directory);
  const outputContent = await writeOutput(result, resolve3(cachedRoot2, ".codesight"));
  return outputContent.replace(/Saves ~\d[\d,]* tokens/, `Saves ~${result.tokenStats.saved.toLocaleString()} tokens`);
}
async function toolGetRoutes(args) {
  const result = await getScanResult(args.directory);
  let routes = result.routes;
  if (args.prefix) {
    routes = routes.filter((r) => r.path.startsWith(args.prefix));
  }
  if (args.tag) {
    routes = routes.filter((r) => r.tags.includes(args.tag));
  }
  if (args.method) {
    routes = routes.filter((r) => r.method === args.method.toUpperCase());
  }
  const lines = routes.map((r) => {
    const tags = r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : "";
    const params = r.params ? ` params(${r.params.join(", ")})` : "";
    return `${r.method} ${r.path}${params}${tags} \u2014 ${r.file}`;
  });
  return lines.length > 0 ? `${lines.length} routes:
${lines.join(`
`)}` : "No routes found matching filters.";
}
async function toolGetSchema(args) {
  const result = await getScanResult(args.directory);
  let models = result.schemas;
  if (args.model) {
    models = models.filter((m) => m.name.toLowerCase().includes(args.model.toLowerCase()));
  }
  const lines = [];
  for (const model of models) {
    lines.push(`### ${model.name} (${model.orm})`);
    for (const field of model.fields) {
      const flags = field.flags.length > 0 ? ` (${field.flags.join(", ")})` : "";
      lines.push(`  ${field.name}: ${field.type}${flags}`);
    }
    if (model.relations.length > 0) {
      lines.push(`  relations: ${model.relations.join(", ")}`);
    }
    lines.push("");
  }
  return lines.length > 0 ? `${models.length} models:
${lines.join(`
`)}` : "No models found.";
}
async function toolGetBlastRadius(args) {
  const result = await getScanResult(args.directory);
  const maxDepth = args.depth || 3;
  let br;
  if (args.files && Array.isArray(args.files)) {
    br = analyzeMultiFileBlastRadius(args.files, result, maxDepth);
  } else if (args.file) {
    br = analyzeBlastRadius(args.file, result, maxDepth);
  } else {
    return "Error: provide 'file' (string) or 'files' (array) parameter.";
  }
  const lines = [];
  lines.push(`## Blast Radius for ${br.file}`);
  lines.push(`Depth: ${br.depth} hops
`);
  if (br.affectedFiles.length > 0) {
    lines.push(`### Affected Files (${br.affectedFiles.length})`);
    for (const f of br.affectedFiles.slice(0, 30)) {
      lines.push(`- ${f}`);
    }
    if (br.affectedFiles.length > 30) {
      lines.push(`- ... +${br.affectedFiles.length - 30} more`);
    }
    lines.push("");
  }
  if (br.affectedRoutes.length > 0) {
    lines.push(`### Affected Routes (${br.affectedRoutes.length})`);
    for (const r of br.affectedRoutes) {
      lines.push(`- ${r.method} ${r.path} \u2014 ${r.file}`);
    }
    lines.push("");
  }
  if (br.affectedModels.length > 0) {
    lines.push(`### Potentially Affected Models (${br.affectedModels.length})`);
    for (const m of br.affectedModels) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }
  if (br.affectedMiddleware.length > 0) {
    lines.push(`### Affected Middleware (${br.affectedMiddleware.length})`);
    for (const m of br.affectedMiddleware) {
      lines.push(`- ${m}`);
    }
    lines.push("");
  }
  if (br.affectedFiles.length === 0 && br.affectedRoutes.length === 0) {
    lines.push("No downstream dependencies found. This file change has minimal blast radius.");
  }
  return lines.join(`
`);
}
async function toolGetEnv(args) {
  const result = await getScanResult(args.directory);
  const envVars = result.config.envVars;
  if (args.required_only) {
    const required = envVars.filter((e) => !e.hasDefault);
    const lines2 = required.map((e) => `${e.name} **required** \u2014 ${e.source}`);
    return `${required.length} required env vars (no defaults):
${lines2.join(`
`)}`;
  }
  const lines = envVars.map((e) => {
    const status = e.hasDefault ? "(has default)" : "**required**";
    return `${e.name} ${status} \u2014 ${e.source}`;
  });
  return `${envVars.length} env vars:
${lines.join(`
`)}`;
}
async function toolGetHotFiles(args) {
  const result = await getScanResult(args.directory);
  const limit = args.limit || 15;
  const hotFiles = result.graph.hotFiles.slice(0, limit);
  if (hotFiles.length === 0)
    return "No import graph data. Run a full scan first.";
  const lines = hotFiles.map((h) => `${h.file} \u2014 imported by ${h.importedBy} files`);
  return `Top ${hotFiles.length} most-imported files (change carefully):
${lines.join(`
`)}`;
}
async function toolGetSummary(args) {
  const result = await getScanResult(args.directory);
  const { project, routes, schemas, components, config, middleware, graph, tokenStats } = result;
  const fw = project.frameworks.join(", ") || "generic";
  const orm = project.orms.join(", ") || "none";
  const lines = [];
  lines.push(`# ${project.name}`);
  lines.push(`Stack: ${fw} | ${orm} | ${project.componentFramework} | ${project.language}`);
  if (project.isMonorepo) {
    const repoLabel = project.repoType === "meta" ? "Meta-repo" : project.repoType === "microservices" ? "Microservices" : "Monorepo";
    lines.push(`${repoLabel}: ${project.workspaces.map((w) => w.name).join(", ")}`);
  }
  lines.push("");
  lines.push(`${routes.length} routes | ${schemas.length} models | ${components.length} components | ${config.envVars.length} env vars | ${middleware.length} middleware | ${graph.edges.length} import links`);
  lines.push(`Token savings: ~${tokenStats.saved.toLocaleString()} per conversation`);
  lines.push("");
  if (routes.length > 0) {
    lines.push(`Key API areas: ${[...new Set(routes.map((r) => r.path.split("/").slice(0, 3).join("/")))].slice(0, 8).join(", ")}`);
  }
  if (graph.hotFiles.length > 0) {
    lines.push(`High-impact files: ${graph.hotFiles.slice(0, 5).map((h) => h.file).join(", ")}`);
  }
  const required = config.envVars.filter((e) => !e.hasDefault);
  if (required.length > 0) {
    lines.push(`Required env: ${required.slice(0, 8).map((e) => e.name).join(", ")}${required.length > 8 ? ` +${required.length - 8} more` : ""}`);
  }
  lines.push("");
  lines.push("Use codesight_get_routes, codesight_get_schema, codesight_get_blast_radius for details.");
  return lines.join(`
`);
}
async function toolRefresh(args) {
  cachedResult = null;
  cachedRoot2 = null;
  const result = await getScanResult(args.directory);
  return `Refreshed. ${result.routes.length} routes, ${result.schemas.length} models, ${result.graph.edges.length} import links, ${result.config.envVars.length} env vars.`;
}
async function toolGetWikiIndex(args) {
  const result = await getScanResult(args.directory);
  const outputDir = join20(cachedRoot2, ".codesight");
  const index = await readWikiArticle(outputDir, "index");
  if (index)
    return index;
  return `Wiki not generated yet. Run \`npx codesight --wiki\` to generate the knowledge base.

For now, use codesight_get_summary for a quick overview.

Project: ${result.project.name} | ${result.routes.length} routes | ${result.schemas.length} models`;
}
async function toolGetWikiArticle(args) {
  if (!args.article)
    return "Error: provide 'article' parameter (e.g., 'overview', 'auth', 'database', 'payments')";
  await getScanResult(args.directory);
  const outputDir = join20(cachedRoot2, ".codesight");
  const content = await readWikiArticle(outputDir, args.article);
  if (content)
    return content;
  const available = await listWikiArticles(outputDir);
  if (available.length === 0) {
    return `Wiki not generated. Run \`npx codesight --wiki\` first.
Available articles will include: overview, database, auth, payments, and one per API domain.`;
  }
  return `Article '${args.article}' not found.
Available articles: ${available.join(", ")}`;
}
async function toolLintWiki(args) {
  const result = await getScanResult(args.directory);
  const outputDir = join20(cachedRoot2, ".codesight");
  return lintWiki(result, outputDir);
}
async function toolGetEvents(args) {
  const result = await getScanResult(args.directory);
  const events = result.events;
  if (!events || events.length === 0) {
    return "No async events or queues detected. Events are auto-detected from BullMQ, Celery, Kafka, Redis pub/sub, Socket.io, and EventEmitter usage.";
  }
  let filtered = events;
  if (args.system) {
    filtered = events.filter((e) => e.system === args.system);
    if (filtered.length === 0)
      return `No events found for system: ${args.system}`;
  }
  const lines = [`Events & Queues (${filtered.length} total)`, ""];
  const bySystem = new Map;
  for (const e of filtered) {
    if (!bySystem.has(e.system))
      bySystem.set(e.system, []);
    bySystem.get(e.system).push(e);
  }
  for (const [system, items] of bySystem) {
    lines.push(`## ${system}`);
    for (const item of items) {
      lines.push(`- ${item.name} [${item.type}] \u2014 ${item.file}`);
    }
    lines.push("");
  }
  return lines.join(`
`);
}
async function toolGetCoverage(args) {
  const result = await getScanResult(args.directory);
  const cov = result.testCoverage;
  if (!cov || cov.testFiles.length === 0) {
    return "No test files detected. Add test files matching *.test.ts, *.spec.ts, test_*.py, *_test.go, etc.";
  }
  const httpRoutes = result.routes.filter((r) => !["QUERY", "MUTATION", "SUBSCRIPTION", "RPC", "WS", "WS-ROOM"].includes(r.method));
  const uncoveredRoutes = httpRoutes.filter((r) => !cov.testedRoutes.includes(`${r.method}:${r.path}`));
  const uncoveredModels = result.schemas.filter((m) => !m.name.startsWith("enum:") && !cov.testedModels.includes(m.name));
  const lines = [
    `Test Coverage: ${cov.coveragePercent}%`,
    `Test files: ${cov.testFiles.length}`,
    `Covered routes: ${cov.testedRoutes.length}/${httpRoutes.length}`,
    `Covered models: ${cov.testedModels.length}/${result.schemas.filter((m) => !m.name.startsWith("enum:")).length}`,
    ""
  ];
  if (uncoveredRoutes.length > 0) {
    lines.push(`Uncovered routes (${uncoveredRoutes.length}):`);
    for (const r of uncoveredRoutes.slice(0, 20)) {
      lines.push(`  ${r.method} ${r.path} \u2014 ${r.file}`);
    }
    if (uncoveredRoutes.length > 20)
      lines.push(`  ... +${uncoveredRoutes.length - 20} more`);
    lines.push("");
  }
  if (uncoveredModels.length > 0) {
    lines.push(`Uncovered models: ${uncoveredModels.map((m) => m.name).join(", ")}`);
  }
  return lines.join(`
`);
}
async function toolGetKnowledge(args) {
  const dir = args.directory ? resolve3(args.directory) : process.cwd();
  const config = await loadConfig(dir);
  const outputDirName = config.outputDir ?? ".codesight";
  const knowledgePath = join20(dir, outputDirName, "KNOWLEDGE.md");
  try {
    return await readFile12(knowledgePath, "utf8");
  } catch {
    return `Knowledge map not found. Run \`npx codesight --mode knowledge\` in ${dir} to generate it.

This scans all .md/.mdx files and extracts decisions, open questions, people, and recurring themes into a compact AI context file.`;
  }
}
async function handleRequest(req) {
  if (req.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: req.id ?? null,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "codesight", version: "1.10.0" }
      }
    });
    return;
  }
  if (req.method === "notifications/initialized") {
    return;
  }
  if (req.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: req.id ?? null,
      result: {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema
        }))
      }
    });
    return;
  }
  if (req.method === "tools/call") {
    const toolName = req.params?.name;
    const args = req.params?.arguments || {};
    const tool = TOOLS.find((t) => t.name === toolName);
    if (tool) {
      try {
        const result = await tool.handler(args);
        send({
          jsonrpc: "2.0",
          id: req.id ?? null,
          result: {
            content: [{ type: "text", text: result }]
          }
        });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id: req.id ?? null,
          result: {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
          }
        });
      }
      return;
    }
    send({
      jsonrpc: "2.0",
      id: req.id ?? null,
      error: { code: -32601, message: `Unknown tool: ${toolName}` }
    });
    return;
  }
  if (req.id !== undefined) {
    send({
      jsonrpc: "2.0",
      id: req.id,
      error: { code: -32601, message: `Method not found: ${req.method}` }
    });
  }
}
async function startMCPServer() {
  transportMode = "framed";
  let buffer = "";
  const messageQueue = [];
  let processing = false;
  function enqueueRawJson(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
      return;
    try {
      const req = JSON.parse(trimmed);
      messageQueue.push(req);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
  }
  async function processQueue() {
    if (processing)
      return;
    processing = true;
    while (messageQueue.length > 0) {
      const req = messageQueue.shift();
      try {
        await handleRequest(req);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
    }
    processing = false;
  }
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const headerEnd = buffer.indexOf(`\r
\r
`);
      if (headerEnd === -1) {
        if (looksLikeFramedTransport(buffer))
          break;
        const newlineIndex = buffer.indexOf(`
`);
        if (newlineIndex === -1)
          break;
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        transportMode = "newline";
        enqueueRawJson(line);
        continue;
      }
      transportMode = "framed";
      const header = buffer.substring(0, headerEnd);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = buffer.substring(headerEnd + 4);
        continue;
      }
      const contentLength = parseInt(lengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + contentLength)
        break;
      const body = buffer.substring(bodyStart, bodyStart + contentLength);
      buffer = buffer.substring(bodyStart + contentLength);
      try {
        const req = JSON.parse(body);
        messageQueue.push(req);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
    }
    processQueue();
  });
  process.stdin.on("end", () => {
    if (buffer.trim()) {
      enqueueRawJson(buffer);
      buffer = "";
      processQueue();
    }
  });
  await new Promise(() => {});
}
var transportMode = "framed", cachedResult = null, cachedRoot2 = null, TOOLS;
var init_mcp_server = __esm(() => {
  init_scanner();
  init_config();
  init_routes();
  init_schema();
  init_components();
  init_libs();
  init_config2();
  init_middleware();
  init_graph();
  init_contracts();
  init_graphql();
  init_events();
  init_formatter();
  init_wiki();
  TOOLS = [
    {
      name: "codesight_scan",
      description: "Full codebase scan. Returns complete AI context map with routes, schema, components, libraries, config, middleware, and dependency graph. Use this for initial project understanding.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory to scan (defaults to cwd)" }
        }
      },
      handler: toolScan
    },
    {
      name: "codesight_get_summary",
      description: "Compact project summary (~500 tokens). Stack, key stats, high-impact files, required env vars. Use this first before diving deeper.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" }
        }
      },
      handler: toolGetSummary
    },
    {
      name: "codesight_get_routes",
      description: "Get API routes with methods, paths, params, tags, and handler files. Supports filtering by prefix, tag, or HTTP method.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          prefix: { type: "string", description: "Filter routes by path prefix (e.g., '/api/users')" },
          tag: { type: "string", description: "Filter routes by tag (e.g., 'auth', 'db', 'payment', 'ai')" },
          method: { type: "string", description: "Filter by HTTP method (e.g., 'GET', 'POST')" }
        }
      },
      handler: toolGetRoutes
    },
    {
      name: "codesight_get_schema",
      description: "Get database models with fields, types, constraints, and relations. Optionally filter by model name.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          model: { type: "string", description: "Filter by model name (partial match)" }
        }
      },
      handler: toolGetSchema
    },
    {
      name: "codesight_get_blast_radius",
      description: "Blast radius analysis. Given a file (or list of files), returns all transitively affected files, routes, models, and middleware. Use before making changes to understand impact.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          file: { type: "string", description: "Single file path (relative to project root)" },
          files: {
            type: "array",
            items: { type: "string" },
            description: "Multiple file paths for combined blast radius"
          },
          depth: { type: "number", description: "Max traversal depth (default: 3)" }
        }
      },
      handler: toolGetBlastRadius
    },
    {
      name: "codesight_get_env",
      description: "Get environment variables across the codebase with required/default status and source file.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          required_only: { type: "boolean", description: "Only show required vars (no defaults)" }
        }
      },
      handler: toolGetEnv
    },
    {
      name: "codesight_get_hot_files",
      description: "Get the most-imported files in the project. These have the highest blast radius \u2014 changes here affect the most other files.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          limit: { type: "number", description: "Number of files to return (default: 15)" }
        }
      },
      handler: toolGetHotFiles
    },
    {
      name: "codesight_refresh",
      description: "Force re-scan the project. Use after making significant changes to get updated context.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" }
        }
      },
      handler: toolRefresh
    },
    {
      name: "codesight_get_wiki_index",
      description: "Get the wiki index (~200 tokens). Lists all available wiki articles with one-line summaries. Read this at session start for instant project orientation. If wiki not generated, run `npx codesight --wiki` first.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" }
        }
      },
      handler: toolGetWikiIndex
    },
    {
      name: "codesight_get_wiki_article",
      description: "Read a specific wiki article by name. Each article covers one subsystem in narrative form (~300-500 tokens). Use for targeted questions: 'how does auth work?' \u2192 article='auth', 'what models exist?' \u2192 article='database', 'what routes are there?' \u2192 article='api'. Much cheaper than loading the full context map.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          article: {
            type: "string",
            description: "Article name without .md extension (e.g. 'overview', 'auth', 'payments', 'database', 'ui', or any domain name)"
          }
        },
        required: ["article"]
      },
      handler: toolGetWikiArticle
    },
    {
      name: "codesight_lint_wiki",
      description: "Health check the wiki. Finds orphan articles, missing cross-links, and articles that may be stale. Run after making significant changes to verify wiki integrity.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" }
        }
      },
      handler: toolLintWiki
    },
    {
      name: "codesight_get_events",
      description: "Get event queues, Kafka topics, Redis pub/sub channels, and EventEmitter events detected in the project. Useful for understanding async data flows.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" },
          system: { type: "string", description: "Filter by system: bullmq | celery | kafka | redis-pub-sub | socket.io | eventemitter" }
        }
      },
      handler: toolGetEvents
    },
    {
      name: "codesight_get_coverage",
      description: "Get test coverage summary: which routes and models have corresponding tests. Shows coverage percentage and lists uncovered endpoints.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" }
        }
      },
      handler: toolGetCoverage
    },
    {
      name: "codesight_get_knowledge",
      description: "Get the knowledge map for a second-brain or docs folder: decisions made, open questions, recurring themes, people mentioned, and an index of all notes by type (ADR, meeting, retro, spec, etc.). Run `npx codesight --mode knowledge` first to generate it.",
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Directory (defaults to cwd)" }
        }
      },
      handler: toolGetKnowledge
    }
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/eval.js
var exports_eval = {};
__export(exports_eval, {
  runEval: () => runEval
});
import { readFile as readFile13, writeFile as writeFile6, mkdir as mkdir3, rm } from "fs/promises";
import { join as join21, dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
function calcMetrics(detected, expected) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const item of detected) {
    if (expected.has(item))
      tp++;
    else
      fp++;
  }
  for (const item of expected) {
    if (!detected.has(item))
      fn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return {
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn
  };
}
async function createTempRepo(fixture) {
  const tmpDir = join21((await import("os")).tmpdir(), `codesight-eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  for (const [filePath, content] of Object.entries(fixture.files)) {
    const fullPath = join21(tmpDir, filePath);
    await mkdir3(dirname2(fullPath), { recursive: true });
    await writeFile6(fullPath, content);
  }
  return tmpDir;
}
async function evalFixture(fixturePath) {
  const repoJson = JSON.parse(await readFile13(join21(fixturePath, "repo.json"), "utf-8"));
  const groundTruth = JSON.parse(await readFile13(join21(fixturePath, "ground-truth.json"), "utf-8"));
  const tmpDir = await createTempRepo(repoJson);
  const startTime = Date.now();
  try {
    const project = await detectProject(tmpDir);
    const files = await collectFiles(tmpDir, 10);
    const [routes, schemas, components, config, middleware, graph] = await Promise.all([
      detectRoutes(files, project),
      detectSchemas(files, project),
      detectComponents(files, project),
      detectConfig(files, project),
      detectMiddleware(files, project),
      detectDependencyGraph(files, project)
    ]);
    const runtime = Date.now() - startTime;
    const detectedRoutes = new Set(routes.map((r) => `${r.method}:${r.path}`));
    const expectedRoutes = new Set((groundTruth.routes || []).map((r) => `${r.method}:${r.path}`));
    const detectedModels = new Set(schemas.map((s) => s.name.toLowerCase()));
    const expectedModels = new Set((groundTruth.models || []).map((m) => m.name.toLowerCase()));
    const detectedEnvVars = new Set(config.envVars.map((e) => e.name));
    const expectedEnvVars = new Set(groundTruth.envVars || []);
    const result = {
      name: repoJson.name,
      routes: calcMetrics(detectedRoutes, expectedRoutes),
      models: calcMetrics(detectedModels, expectedModels),
      envVars: calcMetrics(detectedEnvVars, expectedEnvVars),
      runtime
    };
    if (groundTruth.components && groundTruth.components.length > 0) {
      const detectedComps = new Set(components.map((c) => c.name));
      const expectedComps = new Set(groundTruth.components.map((c) => c.name));
      result.components = calcMetrics(detectedComps, expectedComps);
    }
    if (groundTruth.middleware && groundTruth.middleware.length > 0) {
      const detectedMw = new Set(middleware.map((m) => m.name));
      const expectedMw = new Set(groundTruth.middleware);
      result.middleware = calcMetrics(detectedMw, expectedMw);
    }
    if (groundTruth.envVarDefaults && Object.keys(groundTruth.envVarDefaults).length > 0) {
      const expectedNames = new Set(Object.keys(groundTruth.envVarDefaults));
      const detectedDefaults = new Set(config.envVars.filter((e) => expectedNames.has(e.name)).map((e) => `${e.name}=${e.hasDefault}`));
      const expectedDefaults = new Set(Object.entries(groundTruth.envVarDefaults).map(([n, d]) => `${n}=${d}`));
      result.envDefaults = calcMetrics(detectedDefaults, expectedDefaults);
    }
    if (groundTruth.graphEdges && groundTruth.graphEdges.length > 0) {
      const norm = (p) => p.replace(/\\/g, "/");
      const detectedEdges = new Set(graph.edges.map((e) => `${norm(e.from)} -> ${norm(e.to)}`));
      const expectedEdges = new Set(groundTruth.graphEdges.map((e) => `${norm(e.from)} -> ${norm(e.to)}`));
      result.graph = calcMetrics(detectedEdges, expectedEdges);
    }
    return result;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
function formatPercent(n) {
  return `${(n * 100).toFixed(1)}%`;
}
function printMetrics(label, m) {
  console.log(`    ${label.padEnd(14)} P: ${formatPercent(m.precision).padStart(6)}  R: ${formatPercent(m.recall).padStart(6)}  F1: ${formatPercent(m.f1).padStart(6)}  (TP:${m.truePositives} FP:${m.falsePositives} FN:${m.falseNegatives})`);
}
async function runEval() {
  const __dirname2 = dirname2(fileURLToPath2(import.meta.url));
  const evalDir = join21(__dirname2, "..", "eval", "fixtures");
  let fixtureNames;
  try {
    const { readdir: readdir6 } = await import("fs/promises");
    fixtureNames = await readdir6(evalDir);
  } catch {
    const altDir = join21(__dirname2, "..", "..", "eval", "fixtures");
    const { readdir: readdir6 } = await import("fs/promises");
    fixtureNames = await readdir6(altDir);
    return runEvalFromDir(altDir, fixtureNames);
  }
  return runEvalFromDir(evalDir, fixtureNames);
}
async function runEvalFromDir(evalDir, fixtureNames) {
  console.log(`
  codesight eval \u2014 precision/recall benchmarks
`);
  const results = [];
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalF1 = 0;
  let metricCount = 0;
  const scored = [];
  for (const name of fixtureNames) {
    const fixturePath = join21(evalDir, name);
    try {
      await import("fs/promises").then((fs) => fs.stat(join21(fixturePath, "repo.json")));
    } catch {
      continue;
    }
    process.stdout.write(`  ${name}...`);
    const result = await evalFixture(fixturePath);
    results.push(result);
    console.log(` ${result.runtime}ms`);
    const categories = [
      ["Routes", result.routes],
      ["Models", result.models],
      ["Env vars", result.envVars],
      ["Env defaults", result.envDefaults],
      ["Components", result.components],
      ["Middleware", result.middleware],
      ["Graph edges", result.graph]
    ];
    for (const [label, m] of categories) {
      if (!m)
        continue;
      printMetrics(label, m);
      scored.push({ fixture: result.name, category: label, m });
      totalPrecision += m.precision;
      totalRecall += m.recall;
      totalF1 += m.f1;
      metricCount++;
    }
    console.log("");
  }
  if (results.length === 0) {
    console.log("  No fixtures found. Add fixtures to eval/fixtures/");
    return;
  }
  const avgP = totalPrecision / metricCount;
  const avgR = totalRecall / metricCount;
  const avgF1 = totalF1 / metricCount;
  const totalRuntime = results.reduce((s, r) => s + r.runtime, 0);
  const worst = scored.reduce((a, b) => b.m.f1 < a.m.f1 ? b : a);
  console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  console.log(`  Fixtures:           ${results.length}`);
  console.log(`  Avg precision:      ${formatPercent(avgP)}`);
  console.log(`  Avg recall:         ${formatPercent(avgR)}`);
  console.log(`  Avg F1:             ${formatPercent(avgF1)}`);
  console.log(`  Min F1:             ${formatPercent(worst.m.f1)} (${worst.fixture} / ${worst.category})`);
  console.log(`  Total runtime:      ${totalRuntime}ms`);
  const fabricated = scored.filter(({ m }) => m.truePositives === 0 && m.falsePositives > 0);
  for (const { fixture, category, m } of fabricated) {
    console.log(`  \u26A0 ${fixture} / ${category}: 0 correct with ${m.falsePositives} false positives \u2014 output is fabricated, not incomplete`);
  }
  const failures = scored.filter(({ m }) => m.f1 < CATEGORY_F1_FLOOR);
  if (failures.length > 0) {
    console.log("");
    for (const { fixture, category, m } of failures) {
      console.log(`  FAIL ${fixture} / ${category}: F1 ${formatPercent(m.f1)} < floor ${formatPercent(CATEGORY_F1_FLOOR)}`);
    }
    console.log(`  Eval failed: ${failures.length} categor${failures.length === 1 ? "y" : "ies"} below the F1 floor.`);
    process.exitCode = 1;
  }
  console.log("");
}
var CATEGORY_F1_FLOOR = 0.5;
var init_eval = __esm(() => {
  init_scanner();
  init_routes();
  init_schema();
  init_components();
  init_config2();
  init_middleware();
  init_graph();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/monorepo/discover.js
import { readdir as readdir6, stat as stat5, readFile as readFile14 } from "fs/promises";
import { join as join22 } from "path";
async function discoverPackages(root, config) {
  const patterns = await readWorkspacePatterns(root, config.workspaceFile);
  if (patterns.length === 0) {
    throw new Error("No workspace patterns found. Add pnpm-workspace.yaml or a workspaces field to package.json.");
  }
  const positivePatterns = patterns.filter((p) => !p.startsWith("!"));
  const negativePatterns = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
  const candidateDirs = new Set;
  for (const pattern of positivePatterns) {
    for (const dir of await expandGlobPattern(root, pattern)) {
      candidateDirs.add(dir);
    }
  }
  const excludedDirs = new Set;
  for (const pattern of negativePatterns) {
    for (const dir of await expandGlobPattern(root, pattern)) {
      excludedDirs.add(dir);
    }
  }
  const minFiles = config.minFiles ?? 10;
  const qualified = [];
  for (const dir of candidateDirs) {
    if (excludedDirs.has(dir))
      continue;
    const pkgName = await readPackageName(dir);
    if (pkgName === null)
      continue;
    if (config.exclude?.includes(pkgName))
      continue;
    if (config.include?.includes(pkgName)) {
      qualified.push({ name: pkgName, dir });
      continue;
    }
    if (!await dirExists(join22(dir, "src")))
      continue;
    const count = await countSourceFiles(dir);
    if (count < minFiles)
      continue;
    qualified.push({ name: pkgName, dir });
  }
  return qualified;
}
async function readWorkspacePatterns(root, workspaceFile) {
  const yamlPath = join22(root, workspaceFile ?? "pnpm-workspace.yaml");
  try {
    const yaml = await readFile14(yamlPath, "utf-8");
    const patterns = [];
    let inPackages = false;
    for (const line of yaml.split(`
`)) {
      if (/^packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (/^[a-zA-Z]/.test(line))
          break;
        const match = line.match(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*(?:#.*)?$/);
        if (match)
          patterns.push(match[1].trim());
      }
    }
    if (patterns.length > 0)
      return patterns;
  } catch {}
  try {
    const pkg = JSON.parse(await readFile14(join22(root, "package.json"), "utf-8"));
    if (Array.isArray(pkg.workspaces))
      return pkg.workspaces;
    if (Array.isArray(pkg.workspaces?.packages))
      return pkg.workspaces.packages;
  } catch {}
  return [];
}
async function expandGlobPattern(root, pattern) {
  const parts = pattern.split("/");
  const baseParts = [];
  let isRecursive = false;
  for (const part of parts) {
    if (part.includes("*")) {
      isRecursive = part === "**";
      break;
    }
    baseParts.push(part);
  }
  const baseDir = join22(root, ...baseParts);
  if (isRecursive || pattern.includes("**")) {
    return walkForPackageDirs(baseDir);
  }
  if (pattern.includes("*")) {
    return shallowPackageDirs(baseDir);
  }
  return [join22(root, pattern)];
}
async function walkForPackageDirs(dir) {
  const results = [];
  await _walk(dir, results);
  return results;
}
async function _walk(dir, results) {
  let entries;
  try {
    entries = await readdir6(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const hasPackageJson = entries.some((e) => e.isFile() && e.name === "package.json");
  if (hasPackageJson) {
    results.push(dir);
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue;
    if (entry.name === "node_modules" || entry.name.startsWith("."))
      continue;
    await _walk(join22(dir, entry.name), results);
  }
}
async function shallowPackageDirs(baseDir) {
  const results = [];
  try {
    const entries = await readdir6(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("."))
        continue;
      const candidate = join22(baseDir, entry.name);
      try {
        await stat5(join22(candidate, "package.json"));
        results.push(candidate);
      } catch {}
    }
  } catch {}
  return results;
}
async function readPackageName(dir) {
  try {
    const pkg = JSON.parse(await readFile14(join22(dir, "package.json"), "utf-8"));
    return typeof pkg.name === "string" ? pkg.name : null;
  } catch {
    return null;
  }
}
async function dirExists(path) {
  try {
    const s = await stat5(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
async function countSourceFiles(dir, threshold = 50) {
  let count = 0;
  await _countFiles(dir, { count: 0 }, threshold, (c) => {
    count = c;
  });
  return count;
}
async function _countFiles(dir, state, threshold, onDone) {
  let entries;
  try {
    entries = await readdir6(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.count >= threshold) {
      onDone(state.count);
      return;
    }
    if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (SOURCE_EXTENSIONS.has(ext))
        state.count++;
    } else if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      await _countFiles(join22(dir, entry.name), state, threshold, onDone);
    }
  }
  onDone(state.count);
}
var SOURCE_EXTENSIONS;
var init_discover = __esm(() => {
  SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/monorepo/deps.js
import { readdir as readdir7, readFile as readFile15, writeFile as writeFile7, mkdir as mkdir4 } from "fs/promises";
import { join as join23, extname as extname8 } from "path";
async function extractCrossPackageDeps(packageDir, workspacePackageNames) {
  const nameSet = new Set(workspacePackageNames);
  const found = new Set;
  const files = await collectSourceFiles(packageDir);
  for (const file of files) {
    let content;
    try {
      content = await readFile15(file, "utf-8");
    } catch {
      continue;
    }
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importedPkg = match[1];
        if (nameSet.has(importedPkg))
          found.add(importedPkg);
      }
    }
  }
  return Array.from(found).sort();
}
async function writeDepsFile(packageDir, deps, outputDirName) {
  const outputDir = join23(packageDir, outputDirName);
  await mkdir4(outputDir, { recursive: true });
  const lines = [`## Cross-package dependencies
`];
  if (deps.length === 0) {
    lines.push(`_(none)_
`);
  } else {
    for (const dep of deps) {
      lines.push(`- ${dep}`);
    }
    lines.push("");
  }
  await writeFile7(join23(outputDir, "deps.md"), lines.join(`
`), "utf-8");
}
async function collectSourceFiles(dir) {
  const results = [];
  await _collectFiles(dir, results);
  return results;
}
async function _collectFiles(dir, results) {
  let entries;
  try {
    entries = await readdir7(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isFile() && SOURCE_EXTENSIONS2.has(extname8(entry.name))) {
      results.push(join23(dir, entry.name));
    } else if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      await _collectFiles(join23(dir, entry.name), results);
    }
  }
}
var SOURCE_EXTENSIONS2, IMPORT_PATTERNS;
var init_deps = __esm(() => {
  SOURCE_EXTENSIONS2 = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
  IMPORT_PATTERNS = [
    /(?:import|export)\s+(?:.*?from\s+)?['"](@[^'"]+)['"]/g,
    /require\s*\(\s*['"](@[^'"]+)['"]\s*\)/g
  ];
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/monorepo/orchestrator.js
var exports_orchestrator = {};
__export(exports_orchestrator, {
  runMonorepoScan: () => runMonorepoScan
});
import { writeFile as writeFile8, mkdir as mkdir5, stat as stat6 } from "fs/promises";
import { join as join24, relative as relative17 } from "path";
async function runMonorepoScan(root, userConfig, targetPackage) {
  const monorepoConfig = userConfig.monorepo ?? {};
  const outputDirName = userConfig.outputDir ?? ".codesight";
  const maxDepth = userConfig.maxDepth ?? 10;
  let packages = await discoverPackages(root, monorepoConfig);
  const allPackageNames = packages.map((p) => p.name);
  if (targetPackage) {
    const match = packages.find((p) => p.name === targetPackage);
    if (!match) {
      console.warn(`  codesight --refresh: package "${targetPackage}" not found or filtered out.`);
      return [];
    }
    packages = [match];
  }
  console.log(`
  codesight monorepo \u2014 scanning ${packages.length} package(s)
`);
  for (const pkg of packages) {
    process.stdout.write(`  [${pkg.name}]...`);
    try {
      await scan(pkg.dir, outputDirName, maxDepth, userConfig, true);
      const deps = await extractCrossPackageDeps(pkg.dir, allPackageNames);
      await writeDepsFile(pkg.dir, deps, outputDirName);
      console.log(` done`);
    } catch (err) {
      console.error(` ERROR: ${err.message}`);
    }
  }
  await writeGlobalIndex(root, packages.map((p) => p.dir), outputDirName);
  console.log(`
  Global index updated: ${GLOBAL_INDEX_FILENAME}
`);
  return packages;
}
async function writeGlobalIndex(root, qualifyingPackageDirs, outputDirName) {
  const confirmed = [];
  for (const dir of qualifyingPackageDirs) {
    try {
      await stat6(join24(dir, outputDirName));
      confirmed.push(relative17(root, dir));
    } catch {}
  }
  confirmed.sort();
  const lines = [
    "# CodeSight \u2014 Monorepo Index",
    "",
    "This project uses per-package CodeSight context files. Before using grep/find",
    "to explore a package, check if `.codesight/CODESIGHT.md` exists in that",
    "package's directory \u2014 it will be faster and cheaper.",
    "",
    "## Packages with CodeSight context",
    "",
    ...confirmed,
    ""
  ];
  const outDir = join24(root, outputDirName);
  await mkdir5(outDir, { recursive: true });
  await writeFile8(join24(outDir, GLOBAL_INDEX_FILENAME), lines.join(`
`), "utf-8");
}
var GLOBAL_INDEX_FILENAME = "CODESIGHT.md";
var init_orchestrator = __esm(() => {
  init_core();
  init_discover();
  init_deps();
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/monorepo/watch.js
var exports_watch = {};
__export(exports_watch, {
  watchMonorepo: () => watchMonorepo
});
import { watch } from "fs";
import { join as join25, relative as relative18 } from "path";
async function watchMonorepo(root, userConfig) {
  const monorepoConfig = userConfig.monorepo ?? {};
  const outputDirName = userConfig.outputDir ?? ".codesight";
  const maxDepth = userConfig.maxDepth ?? 10;
  let packages = await discoverPackages(root, monorepoConfig);
  const allPackageNames = packages.map((p) => p.name);
  const sortedDirs = packages.map((p) => p.dir).sort((a, b) => b.length - a.length);
  const debounceTimers = new Map;
  console.log(`  codesight monorepo watch \u2014 watching ${packages.length} packages (Ctrl+C to stop)
`);
  const watcher = watch(root, { recursive: true }, (eventType, filename) => {
    if (!filename)
      return;
    const absPath = join25(root, filename);
    if (filename.includes("node_modules") || filename.includes(`/${outputDirName}/`) || filename.startsWith(".") || filename.includes("/."))
      return;
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1)
      return;
    const ext = filename.slice(lastDot);
    if (!WATCH_EXTENSIONS.has(ext))
      return;
    const packageDir = sortedDirs.find((d) => absPath.startsWith(d + "/"));
    if (!packageDir)
      return;
    const existing = debounceTimers.get(packageDir);
    if (existing)
      clearTimeout(existing);
    debounceTimers.set(packageDir, setTimeout(async () => {
      debounceTimers.delete(packageDir);
      await rebuildPackage(packageDir, packages, allPackageNames, root, outputDirName, maxDepth, userConfig);
    }, DEBOUNCE_MS));
  });
  process.on("SIGINT", () => {
    watcher.close();
    console.log(`
  codesight watch stopped.`);
    process.exit(0);
  });
  await new Promise(() => {});
}
async function rebuildPackage(packageDir, packages, allPackageNames, root, outputDirName, maxDepth, userConfig) {
  const pkg = packages.find((p) => p.dir === packageDir);
  if (!pkg)
    return;
  process.stdout.write(`  [${pkg.name}] rebuilding...`);
  try {
    await scan(packageDir, outputDirName, maxDepth, userConfig, true);
    const deps = await extractCrossPackageDeps(packageDir, allPackageNames);
    await writeDepsFile(packageDir, deps, outputDirName);
    console.log(` done`);
  } catch (err) {
    console.error(` ERROR: ${err.message}`);
  }
  await refreshGlobalIndex(root, packages, outputDirName);
}
async function refreshGlobalIndex(root, packages, outputDirName) {
  const { writeFile: writeFile9, stat: stat7, mkdir: mkdir6 } = await import("fs/promises");
  const confirmed = [];
  for (const pkg of packages) {
    try {
      await stat7(join25(pkg.dir, outputDirName));
      confirmed.push(relative18(root, pkg.dir));
    } catch {}
  }
  confirmed.sort();
  const lines = [
    "# CodeSight \u2014 Monorepo Index",
    "",
    "This project uses per-package CodeSight context files. Before using grep/find",
    "to explore a package, check if `.codesight/CODESIGHT.md` exists in that",
    "package's directory \u2014 it will be faster and cheaper.",
    "",
    "## Packages with CodeSight context",
    "",
    ...confirmed,
    ""
  ];
  const outDir = join25(root, outputDirName);
  await mkdir6(outDir, { recursive: true });
  await writeFile9(join25(outDir, "CODESIGHT.md"), lines.join(`
`), "utf-8");
}
var WATCH_EXTENSIONS, DEBOUNCE_MS = 500;
var init_watch = __esm(() => {
  init_core();
  init_discover();
  init_deps();
  WATCH_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".vue",
    ".svelte",
    ".rb",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".env",
    ".prisma",
    ".graphql",
    ".gql"
  ]);
});

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/telemetry.js
var exports_telemetry = {};
__export(exports_telemetry, {
  runTelemetry: () => runTelemetry
});
import { readFile as readFile16 } from "fs/promises";
import { join as join26, relative as relative19 } from "path";
function countTokens(text) {
  return Math.ceil(text.length / 4);
}
async function readFileSafe4(path) {
  try {
    return await readFile16(path, "utf-8");
  } catch {
    return "";
  }
}
async function measureExplainArchitecture(root, result, codesightTokens) {
  const filesToRead = new Set;
  filesToRead.add(join26(root, "package.json"));
  for (const route of result.routes) {
    filesToRead.add(join26(root, route.file));
  }
  for (const _schema of result.schemas) {
    for (const lib of result.libs) {
      if (lib.file.includes("schema") || lib.file.includes("model") || lib.file.includes("db")) {
        filesToRead.add(join26(root, lib.file));
      }
    }
  }
  for (const cf of result.config.configFiles) {
    filesToRead.add(join26(root, cf));
  }
  for (const mw of result.middleware) {
    filesToRead.add(join26(root, mw.file));
  }
  for (const hf of result.graph.hotFiles.slice(0, 10)) {
    filesToRead.add(join26(root, hf.file));
  }
  let totalTokens = 0;
  const readFiles = [];
  for (const f of filesToRead) {
    const content = await readFileSafe4(f);
    if (content) {
      totalTokens += countTokens(content);
      readFiles.push(relative19(root, f));
    }
  }
  const toolCalls = Math.max(10, Math.ceil(filesToRead.size * 0.8));
  totalTokens += toolCalls * 75;
  const reduction = totalTokens > 0 ? Math.round(totalTokens / codesightTokens * 10) / 10 : 1;
  return {
    name: "Explain architecture",
    description: "Understand project stack, routes, schema, and dependencies",
    filesRead: readFiles,
    toolCalls,
    tokensWithout: totalTokens,
    tokensWith: codesightTokens,
    reduction
  };
}
async function measureAddRoute(root, result, codesightTokens) {
  const filesToRead = new Set;
  const routeFiles = [...new Set(result.routes.map((r) => r.file))];
  for (const f of routeFiles.slice(0, 5)) {
    filesToRead.add(join26(root, f));
  }
  for (const lib of result.libs) {
    if (lib.file.includes("schema") || lib.file.includes("model") || lib.file.includes("db")) {
      filesToRead.add(join26(root, lib.file));
    }
  }
  for (const mw of result.middleware) {
    filesToRead.add(join26(root, mw.file));
  }
  let totalTokens = 0;
  const readFiles = [];
  for (const f of filesToRead) {
    const content = await readFileSafe4(f);
    if (content) {
      totalTokens += countTokens(content);
      readFiles.push(relative19(root, f));
    }
  }
  const toolCalls = Math.max(6, Math.ceil(filesToRead.size * 0.7));
  totalTokens += toolCalls * 75;
  const withTokens = Math.ceil(codesightTokens * 0.4);
  const reduction = totalTokens > 0 ? Math.round(totalTokens / withTokens * 10) / 10 : 1;
  return {
    name: "Add new API route",
    description: "Find route patterns, check schema, apply middleware",
    filesRead: readFiles,
    toolCalls,
    tokensWithout: totalTokens,
    tokensWith: withTokens,
    reduction
  };
}
async function measureReviewDiff(root, result, codesightTokens) {
  const filesToRead = new Set;
  if (result.graph.hotFiles.length > 0) {
    const hotFile = result.graph.hotFiles[0];
    filesToRead.add(join26(root, hotFile.file));
    for (const edge of result.graph.edges) {
      if (edge.to === hotFile.file) {
        filesToRead.add(join26(root, edge.from));
      }
    }
  }
  const routeFiles = [...new Set(result.routes.map((r) => r.file))];
  for (const f of routeFiles.slice(0, 3)) {
    filesToRead.add(join26(root, f));
  }
  let totalTokens = 0;
  const readFiles = [];
  for (const f of filesToRead) {
    const content = await readFileSafe4(f);
    if (content) {
      totalTokens += countTokens(content);
      readFiles.push(relative19(root, f));
    }
  }
  const toolCalls = Math.max(8, Math.ceil(filesToRead.size * 0.6));
  totalTokens += toolCalls * 75;
  const withTokens = Math.ceil(codesightTokens * 0.5);
  const reduction = totalTokens > 0 ? Math.round(totalTokens / withTokens * 10) / 10 : 1;
  return {
    name: "Review diff / blast radius",
    description: "Trace imports, find affected routes and models",
    filesRead: readFiles,
    toolCalls,
    tokensWithout: totalTokens,
    tokensWith: withTokens,
    reduction
  };
}
async function runTelemetry(root, result, outputDir) {
  const codesightContent = await readFileSafe4(join26(outputDir, "CODESIGHT.md"));
  const codesightTokens = countTokens(codesightContent);
  const tasks = await Promise.all([
    measureExplainArchitecture(root, result, codesightTokens),
    measureAddRoute(root, result, codesightTokens),
    measureReviewDiff(root, result, codesightTokens)
  ]);
  const totalWithout = tasks.reduce((s, t) => s + t.tokensWithout, 0);
  const totalWith = tasks.reduce((s, t) => s + t.tokensWith, 0);
  const totalToolCalls = tasks.reduce((s, t) => s + t.toolCalls, 0);
  const report = {
    project: result.project.name,
    tasks,
    summary: {
      totalTokensWithout: totalWithout,
      totalTokensWith: totalWith,
      averageReduction: totalWith > 0 ? Math.round(totalWithout / totalWith * 10) / 10 : 1,
      totalToolCallsSaved: totalToolCalls
    }
  };
  const reportLines = [
    `# Token Telemetry: ${result.project.name}`,
    "",
    `> Measured by reading the actual files an AI agent would need for each task,`,
    `> then comparing against the codesight output (~${codesightTokens.toLocaleString()} tokens).`,
    "",
    "## Tasks",
    ""
  ];
  for (const task of tasks) {
    reportLines.push(`### ${task.name}`);
    reportLines.push(`_${task.description}_`);
    reportLines.push("");
    reportLines.push(`| Metric | Value |`);
    reportLines.push(`|---|---|`);
    reportLines.push(`| Files AI would read | ${task.filesRead.length} |`);
    reportLines.push(`| Tool calls (glob/grep/read) | ${task.toolCalls} |`);
    reportLines.push(`| Tokens without codesight | ~${task.tokensWithout.toLocaleString()} |`);
    reportLines.push(`| Tokens with codesight | ~${task.tokensWith.toLocaleString()} |`);
    reportLines.push(`| **Reduction** | **${task.reduction}x** |`);
    reportLines.push("");
    if (task.filesRead.length > 0) {
      reportLines.push("<details>");
      reportLines.push(`<summary>Files read (${task.filesRead.length})</summary>`);
      reportLines.push("");
      for (const f of task.filesRead) {
        reportLines.push(`- \`${f}\``);
      }
      reportLines.push("");
      reportLines.push("</details>");
      reportLines.push("");
    }
  }
  reportLines.push("## Summary");
  reportLines.push("");
  reportLines.push(`| Metric | Value |`);
  reportLines.push(`|---|---|`);
  reportLines.push(`| Total tokens without codesight | ~${report.summary.totalTokensWithout.toLocaleString()} |`);
  reportLines.push(`| Total tokens with codesight | ~${report.summary.totalTokensWith.toLocaleString()} |`);
  reportLines.push(`| **Average reduction** | **${report.summary.averageReduction}x** |`);
  reportLines.push(`| Tool calls saved | ${report.summary.totalToolCallsSaved} |`);
  reportLines.push("");
  reportLines.push("## Methodology");
  reportLines.push("");
  reportLines.push("Token counts are calculated by reading the actual source files an AI agent would");
  reportLines.push("need to explore for each task, using the ~4 chars/token heuristic (standard for");
  reportLines.push("GPT/Claude tokenizers). Tool call overhead is estimated at ~75 tokens per call");
  reportLines.push('(command text + result formatting). The "with codesight" count uses the real');
  reportLines.push("CODESIGHT.md output size, proportioned to the sections relevant to each task.");
  reportLines.push("");
  reportLines.push(`_Generated by codesight --telemetry_`);
  const { writeFile: wf } = await import("fs/promises");
  const { mkdir: mkdir6 } = await import("fs/promises");
  await mkdir6(outputDir, { recursive: true });
  await wf(join26(outputDir, "telemetry.md"), reportLines.join(`
`));
  return report;
}
var init_telemetry = () => {};

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/index.js
init_scanner();
init_formatter();
import { resolve as resolve4, join as join27 } from "path";
import { writeFile as writeFile9, stat as stat7, mkdir as mkdir6 } from "fs/promises";

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/detectors/knowledge.js
init_scanner();
import { relative as relative2 } from "path";
var GENERIC_FILENAMES = new Set([
  "readme.md",
  "changelog.md",
  "contributing.md",
  "license.md",
  "code_of_conduct.md",
  "security.md",
  "authors.md",
  "contributors.md",
  "todo.md"
]);
function detectNoteType(filename, content) {
  const base = filename.toLowerCase().split("/").pop() || "";
  if (GENERIC_FILENAMES.has(base))
    return "general";
  const lower = filename.toLowerCase();
  if (/\b(adr[-_]?\d*|decision|decide|decided)\b/.test(lower))
    return "decision";
  if (/\b(meeting|standup|stand-up|sync|1on1|one-on-one|call|interview)\b/.test(lower))
    return "meeting";
  if (/\b(retro|retrospective|post-mortem|postmortem)\b/.test(lower))
    return "retro";
  if (/\b(prd|spec|requirement|roadmap|brief|proposal)\b/.test(lower))
    return "spec";
  if (/\b(backlog|todo|tasks|issues|tickets)\b/.test(lower))
    return "backlog";
  if (/\b(research|analysis|study|investigation|benchmark|comparison)\b/.test(lower))
    return "research";
  if (/\b(session|log|journal|daily|weekly|standup)\b/.test(lower))
    return "session";
  if (/##\s*decision\b/i.test(content) && /##\s*(context|status|consequences)\b/i.test(content))
    return "decision";
  if (/^status:\s*(decided|accepted|rejected|proposed)/im.test(content))
    return "decision";
  if (/attendees:|action items:|participants:/i.test(content))
    return "meeting";
  if (/what went well|what could be better|stop doing|start doing|keep doing/i.test(content))
    return "retro";
  if (/##\s*(overview|goals?|requirements?|user stories)/i.test(content))
    return "spec";
  return "general";
}
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match)
    return {};
  const fm = {};
  const lines = match[1].split(`
`);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx < 1) {
      i++;
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();
    if (raw === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s*/, "").trim().replace(/^["']|["']$/g, ""));
        i++;
      }
      fm[key] = items;
      continue;
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      fm[key] = raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    } else {
      fm[key] = raw.replace(/^["']|["']$/g, "");
    }
    i++;
  }
  return fm;
}
function extractDate(filename, fm) {
  const fmDate = fm.date || fm.created || fm.createdAt;
  if (fmDate && typeof fmDate === "string") {
    const d = fmDate.match(/\d{4}-\d{2}-\d{2}/);
    if (d)
      return d[0];
  }
  const fileDate = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (fileDate)
    return fileDate[1];
  return;
}
function extractDecisions(content) {
  const decisions = [];
  const adrSection = content.match(/##\s*(?:Decision|Entscheidung)\s*\n+([\s\S]*?)(?=\n##|\n---|\n$)/i);
  if (adrSection) {
    const firstLine = adrSection[1].trim().split(`
`).find((l) => l.trim().length > 10);
    if (firstLine)
      return [cleanWikilinks(firstLine.replace(/^[-*>]\s*/, "").trim())];
  }
  const DECISION_NOISE = /^(reject|accept|propose|update|supersede|deprecate)\s+the\s+adr/i;
  const patterns = [
    /(?:we\s+)?decided?\s+to\s+([^.!?\n]{10,150})/gi,
    /going\s+with\s+([^.!?\n]{5,120})/gi,
    /chose?\s+([^.!?\n]{5,80})\s+(?:over|instead\s+of)/gi,
    /(?:^|\n)\s*decision:\s*([^\n]{10,150})/gi,
    /will\s+(?:be\s+)?using?\s+([^.!?\n]{5,80})/gi
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const d = cleanWikilinks(m[1].trim().replace(/[*_`]/g, ""));
      if (d.length >= 10 && d.length <= 160 && !DECISION_NOISE.test(d))
        decisions.push(d);
    }
  }
  return [...new Set(decisions)].slice(0, 3);
}
function stripCodeBlocks(content) {
  let stripped = content.replace(/^```[\s\S]*?^```/gm, "").replace(/^~~~[\s\S]*?^~~~/gm, "");
  stripped = stripped.replace(/`[^`\n]+`/g, "``");
  return stripped;
}
function extractOpenQuestions(content) {
  const questions = [];
  const prose = stripCodeBlocks(content);
  for (const line of prose.split(`
`)) {
    let t = line.trim();
    if (t.endsWith("?") && !t.startsWith("#") && !t.startsWith(">") && t.length >= 15 && t.length <= 200 && !/[^\x00-\x7F]/.test(t)) {
      t = cleanWikilinks(t.replace(/^[-*]\s*/, "").replace(/^(?:TODO|QUESTION|OPEN|FIXME):\s*/i, ""));
      if (t.length >= 15 && t.length <= 160)
        questions.push(t);
    }
  }
  const todoRe = /(?:TODO|QUESTION|OPEN|FIXME):\s*([^\n]{10,120})/gi;
  let m;
  while ((m = todoRe.exec(prose)) !== null) {
    const q = cleanWikilinks(m[1].trim());
    if (!q.endsWith("?"))
      questions.push(q);
  }
  return [...new Set(questions)].slice(0, 5);
}
var PEOPLE_BLACKLIST = new Set([
  "Decision Maker",
  "Decision Maker Name",
  "Decision Date",
  "Decision Title",
  "Decision Number",
  "Decision Reach",
  "Technical Story",
  "Team Members",
  "Team Members Present",
  "Key Points",
  "Action Items",
  "Next Steps",
  "Open Issues",
  "Related Decisions",
  "Related Work",
  "Follow Up",
  "Meeting Notes",
  "Meeting Date",
  "Meeting Time",
  "Attendees List",
  "Status Update",
  "Risk Assessment",
  "Success Metrics",
  "User Story",
  "Acceptance Criteria",
  "Definition Of",
  "Pull Request",
  "Issue Link",
  "Evaluate Charts",
  "Participants List",
  "Stakeholders Involved"
]);
var JSDOC_TAGS = new Set([
  "param",
  "returns",
  "return",
  "deprecated",
  "throws",
  "throw",
  "type",
  "example",
  "see",
  "link",
  "author",
  "since",
  "version",
  "todo",
  "ignore",
  "override",
  "abstract",
  "static",
  "public",
  "private",
  "protected",
  "readonly",
  "const",
  "enum",
  "interface",
  "typedef",
  "callback",
  "class",
  "constructor",
  "this",
  "extends",
  "implements",
  "fires",
  "emits",
  "listens",
  "mixes",
  "mixin",
  "namespace",
  "module",
  "exports",
  "requires",
  "external",
  "default",
  "augments",
  "yields",
  "yield",
  "summary",
  "description",
  "access",
  "alias",
  "async",
  "generator",
  "global",
  "hideconstructor",
  "inner",
  "instance",
  "memberof",
  "name",
  "override",
  "property",
  "prop",
  "template"
]);
var CSS_AT_RULES = new Set([
  "keyframes",
  "font",
  "media",
  "import",
  "charset",
  "namespace",
  "supports",
  "document",
  "page",
  "viewport",
  "counter",
  "layer",
  "scope",
  "starting",
  "fontface",
  "fontfeaturevalues",
  "swash",
  "annotation",
  "ornaments",
  "stylistic",
  "styleset",
  "colorprofile",
  "property"
]);
function extractPeople(content) {
  const people = new Set;
  const prose = stripCodeBlocks(content);
  const HANDLE_BLACKLIST = new Set(["example", "username", "yourname", "user", "name", "email"]);
  for (const m of prose.matchAll(/@([a-zA-Z][a-zA-Z0-9_]{1,})/g)) {
    const handle = m[1];
    const lower = handle.toLowerCase();
    if (HANDLE_BLACKLIST.has(lower))
      continue;
    if (JSDOC_TAGS.has(lower))
      continue;
    if (CSS_AT_RULES.has(lower))
      continue;
    const fullMatch = m[0];
    const afterIdx = m.index + fullMatch.length;
    if (prose[afterIdx] === "/")
      continue;
    people.add(handle);
  }
  for (const m of content.matchAll(/\[\[([A-Z][a-z]+ [A-Z][a-z]+)(?:\|[^\]]+)?\]\]/g)) {
    const name = m[1];
    if (!PEOPLE_BLACKLIST.has(name))
      people.add(name);
  }
  const isMeetingLike = /attendees:|participants:|meeting\b|standup|1on1/i.test(content);
  if (isMeetingLike) {
    for (const m of content.matchAll(/^([A-Za-z][a-z]+ [A-Z][a-z]+):/gm)) {
      const name = m[1];
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      if (days.includes(name))
        continue;
      if (PEOPLE_BLACKLIST.has(name))
        continue;
      people.add(name);
    }
  }
  return [...people].slice(0, 10);
}
function extractTags(fm, content) {
  const tags = new Set;
  const fmTags = fm.tags;
  if (fmTags) {
    const list = Array.isArray(fmTags) ? fmTags : String(fmTags).split(/[,\s]+/);
    for (const t of list) {
      const clean = t.trim().replace(/^#/, "");
      if (clean)
        tags.add(clean);
    }
  }
  for (const m of content.matchAll(/(?:^|\s)#([a-zA-Z][\w-]{1,30})\b/g)) {
    tags.add(m[1]);
  }
  return [...tags].slice(0, 12);
}
function cleanWikilinks(text) {
  return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1");
}
function extractSummary(content, maxLen = 160) {
  const withoutFm = content.replace(/^---[\s\S]*?---\r?\n/, "");
  for (const line of withoutFm.split(`
`)) {
    let t = line.trim();
    if (!t || t.length <= 20)
      continue;
    if (t.startsWith("#"))
      continue;
    if (t.startsWith("---") || t.startsWith("==="))
      continue;
    if (t.startsWith("!"))
      continue;
    if (t.startsWith("<"))
      continue;
    if (t.startsWith("http"))
      continue;
    if (t.startsWith("[!"))
      continue;
    if (/^\[.*\]\(.*\)$/.test(t))
      continue;
    if (/^```/.test(t))
      continue;
    if (/^\|/.test(t))
      continue;
    if (/^<!--/.test(t))
      continue;
    if (/^[A-Za-z][a-zA-Z ]{0,20}:\s+\S/.test(t) && !/[.!?]/.test(t.slice(0, 60)))
      continue;
    t = t.replace(/^[-*>]\s+/, "").replace(/^\d+\.\s+/, "");
    t = cleanWikilinks(t);
    if (t.length <= 15)
      continue;
    return t.length > maxLen ? t.slice(0, maxLen) + "\u2026" : t;
  }
  return "";
}
var SKIP_PATTERNS = [
  "node_modules",
  ".codesight",
  "CHANGELOG",
  "LICENSE",
  "CODE_OF_CONDUCT",
  "CONTRIBUTING",
  "SECURITY",
  ".github/",
  "dist/",
  "build/"
];
async function detectKnowledge(files, root) {
  const mdFiles = files.filter((f) => {
    if (!f.endsWith(".md") && !f.endsWith(".mdx"))
      return false;
    const rel = relative2(root, f).replace(/\\/g, "/");
    return !SKIP_PATTERNS.some((p) => rel.includes(p));
  });
  const notes = [];
  const allDecisions = [];
  const allQuestions = [];
  const allPeople = new Set;
  const themeMap = new Map;
  const projectSet = new Set;
  const contentByRel = new Map;
  for (const file of mdFiles) {
    const content = await readFileSafe(file);
    if (!content || content.trim().length < 30)
      continue;
    const rel = relative2(root, file).replace(/\\/g, "/");
    contentByRel.set(rel, content);
    const filename = rel.split("/").pop() || rel;
    const fm = extractFrontmatter(content);
    const h1 = content.match(/^#\s+(.+)/m)?.[1]?.trim();
    const fmTitle = typeof fm.title === "string" ? fm.title : undefined;
    const title = fmTitle || h1 || filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
    const type = detectNoteType(filename, content);
    const date = extractDate(filename, fm);
    const tags = extractTags(fm, content);
    const decisions = extractDecisions(content);
    const openQuestions = extractOpenQuestions(content);
    const people = extractPeople(content);
    const summary = extractSummary(content);
    const THEME_BLOCKLIST = new Set([
      "action items",
      "next steps",
      "attendees",
      "participants",
      "agenda",
      "background",
      "context",
      "consequences",
      "status",
      "summary",
      "overview",
      "notes",
      "details",
      "references",
      "links",
      "resources",
      "related",
      "conclusion",
      "timeline",
      "risks",
      "decision",
      "decisions",
      "rationale",
      "motivation",
      "options",
      "alternatives",
      "follow up",
      "follow-up",
      "open issues",
      "blockers",
      "updates",
      "discussion"
    ]);
    for (const m of content.matchAll(/^##\s+(.+)/gm)) {
      const raw = m[1].trim();
      if (/[^\x00-\x7F]/.test(raw))
        continue;
      const theme = raw.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim();
      if (theme.length >= 3 && theme.length <= 40 && !THEME_BLOCKLIST.has(theme)) {
        themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
      }
    }
    const fmProject = fm.project;
    if (fmProject && typeof fmProject === "string")
      projectSet.add(fmProject);
    const projMatch = content.match(/^project:\s*([^\n]{2,40})/im);
    if (projMatch)
      projectSet.add(projMatch[1].trim());
    for (const d of decisions) {
      allDecisions.push(date ? `[${date}] ${d}` : d);
    }
    allQuestions.push(...openQuestions);
    for (const p of people)
      allPeople.add(p);
    notes.push({ file: rel, title, type, date, tags, summary, decisions, openQuestions, people });
  }
  notes.sort((a, b) => {
    if (!a.date && !b.date)
      return 0;
    if (!a.date)
      return 1;
    if (!b.date)
      return -1;
    return b.date.localeCompare(a.date);
  });
  const templateCap = notes.length > 10 ? Math.floor(notes.length * 0.35) : Infinity;
  const recurringThemes = [...themeMap.entries()].filter(([, count]) => count > 1 && count <= templateCap).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  const stemToRel = new Map;
  for (const note of notes) {
    const stem = note.file.split("/").pop().replace(/\.mdx?$/, "").toLowerCase();
    stemToRel.set(stem, note.file);
    stemToRel.set(note.file.replace(/\.mdx?$/, "").toLowerCase(), note.file);
  }
  const backlinkCount = new Map;
  for (const [sourceRel, content] of contentByRel) {
    const sourceDir = sourceRel.includes("/") ? sourceRel.slice(0, sourceRel.lastIndexOf("/")) : "";
    for (const m of content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
      const target = m[1].trim().toLowerCase().replace(/\.mdx?$/, "");
      const resolved = stemToRel.get(target) || stemToRel.get(target.split("/").pop() || target);
      if (resolved && resolved !== sourceRel) {
        backlinkCount.set(resolved, (backlinkCount.get(resolved) || 0) + 1);
      }
    }
    for (const m of content.matchAll(/\[(?:[^\]]*)\]\(([^)]+\.mdx?)\)/g)) {
      let target = m[1].split("#")[0].trim();
      if (!target.startsWith("/") && sourceDir) {
        const parts = (sourceDir + "/" + target).split("/");
        const resolved = [];
        for (const p of parts) {
          if (p === "..")
            resolved.pop();
          else if (p !== ".")
            resolved.push(p);
        }
        target = resolved.join("/");
      }
      const targetRel = target.replace(/^\//, "");
      if (stemToRel.has(targetRel.toLowerCase().replace(/\.mdx?$/, ""))) {
        const resolved = stemToRel.get(targetRel.toLowerCase().replace(/\.mdx?$/, ""));
        if (resolved && resolved !== sourceRel) {
          backlinkCount.set(resolved, (backlinkCount.get(resolved) || 0) + 1);
        }
      }
    }
  }
  for (const note of notes) {
    const count = backlinkCount.get(note.file);
    if (count)
      note.backlinks = count;
  }
  const hubNotes = notes.filter((n) => (n.backlinks || 0) >= 2).sort((a, b) => (b.backlinks || 0) - (a.backlinks || 0)).slice(0, 10).map((n) => ({ file: n.file, title: n.title, refs: n.backlinks }));
  const datedNotes = notes.filter((n) => n.date);
  const dateRange = datedNotes.length >= 2 ? { from: datedNotes[datedNotes.length - 1].date, to: datedNotes[0].date } : undefined;
  return {
    notes,
    totalNotes: notes.length,
    decisions: [...new Set(allDecisions)].slice(0, 20),
    openQuestions: [...new Set(allQuestions)].slice(0, 10),
    recurringThemes,
    people: [...allPeople].slice(0, 20),
    projects: [...projectSet].slice(0, 10),
    dateRange,
    hubNotes: hubNotes.length > 0 ? hubNotes : undefined
  };
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/index.js
init_ai_config();

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/generators/html-report.js
import { writeFile as writeFile4 } from "fs/promises";
import { join as join4 } from "path";
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
async function generateHtmlReport(result, outputDir) {
  const filePath = join4(outputDir, "report.html");
  const html = buildHtml(result);
  await writeFile4(filePath, html);
  return filePath;
}
function buildHtml(r) {
  const { project, routes, schemas, components, libs, config, middleware, graph, tokenStats } = r;
  const fw = project.frameworks.join(", ") || "generic";
  const orm = project.orms.join(", ") || "none";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(project.name)} \u2014 codesight report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a0f;--card:#12121a;--border:#1e1e2e;--text:#e0e0e8;--muted:#6b6b80;--accent:#6366f1;--accent2:#22d3ee;--green:#22c55e;--orange:#f59e0b;--red:#ef4444;--pink:#ec4899}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:2rem;max-width:1400px;margin:0 auto;line-height:1.6}
h1{font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.25rem}
.subtitle{color:var(--muted);font-size:1rem;margin-bottom:2rem}
.stack-badge{display:inline-block;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:2px 10px;font-size:.85rem;color:var(--accent2);margin:0 4px 4px 0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin:2rem 0}
.stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.25rem;text-align:center}
.stat-value{font-size:2rem;font-weight:800;background:linear-gradient(135deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat-label{color:var(--muted);font-size:.85rem;margin-top:.25rem}
.token-hero{background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid var(--accent);border-radius:16px;padding:2rem;margin:2rem 0;text-align:center}
.token-saved{font-size:3rem;font-weight:900;color:var(--green)}
.token-detail{color:var(--muted);font-size:.9rem;margin-top:.5rem}
.section{margin:2.5rem 0}
.section h2{font-size:1.4rem;font-weight:700;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;transition:border-color .2s}
.card:hover{border-color:var(--accent)}
.card-title{font-weight:700;font-size:1rem;margin-bottom:.5rem}
.card-meta{color:var(--muted);font-size:.8rem}
.tag{display:inline-block;background:rgba(99,102,241,.15);color:var(--accent);border-radius:4px;padding:1px 6px;font-size:.75rem;margin:1px}
.tag-auth{background:rgba(239,68,68,.15);color:var(--red)}
.tag-db{background:rgba(34,211,238,.15);color:var(--accent2)}
.tag-ai{background:rgba(236,72,153,.15);color:var(--pink)}
.tag-payment{background:rgba(245,158,11,.15);color:var(--orange)}
.tag-email{background:rgba(34,197,94,.15);color:var(--green)}
.tag-queue{background:rgba(168,85,247,.15);color:#a855f7}
.tag-cache{background:rgba(245,158,11,.15);color:var(--orange)}
.method{font-weight:700;font-size:.8rem;padding:2px 6px;border-radius:4px;margin-right:6px}
.method-GET{background:rgba(34,197,94,.2);color:var(--green)}
.method-POST{background:rgba(99,102,241,.2);color:var(--accent)}
.method-PUT{background:rgba(245,158,11,.2);color:var(--orange)}
.method-PATCH{background:rgba(245,158,11,.2);color:var(--orange)}
.method-DELETE{background:rgba(239,68,68,.2);color:var(--red)}
.method-ALL{background:rgba(107,107,128,.2);color:var(--muted)}
.route-path{font-family:'Fira Code',monospace;font-size:.9rem}
.route-contract{color:var(--muted);font-size:.8rem;font-style:italic;margin-left:.5rem}
.field{display:flex;gap:.5rem;padding:3px 0;font-size:.9rem}
.field-name{font-family:monospace;color:var(--accent2)}
.field-type{color:var(--muted);font-family:monospace}
.field-flags{display:flex;gap:3px}
.flag{font-size:.7rem;padding:0 4px;border-radius:3px;background:rgba(99,102,241,.1);color:var(--accent)}
.flag-pk{background:rgba(245,158,11,.2);color:var(--orange)}
.flag-fk{background:rgba(34,211,238,.2);color:var(--accent2)}
.flag-unique{background:rgba(236,72,153,.2);color:var(--pink)}
.hot-bar{height:8px;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:4px;margin-top:4px}
.component-props{color:var(--muted);font-size:.85rem}
.badge-client{background:rgba(34,197,94,.15);color:var(--green);font-size:.75rem;padding:1px 6px;border-radius:4px}
.badge-server{background:rgba(99,102,241,.15);color:var(--accent);font-size:.75rem;padding:1px 6px;border-radius:4px}
.env-required{color:var(--red);font-weight:600;font-size:.8rem}
.env-default{color:var(--green);font-size:.8rem}
.footer{text-align:center;color:var(--muted);margin-top:4rem;padding-top:2rem;border-top:1px solid var(--border);font-size:.85rem}
.footer a{color:var(--accent);text-decoration:none}
table{width:100%;border-collapse:collapse}
table td,table th{padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);font-size:.9rem}
table th{color:var(--muted);font-size:.8rem;font-weight:600;text-transform:uppercase}
</style>
</head>
<body>

<h1>${escapeHtml(project.name)}</h1>
<div class="subtitle">AI Context Map \u2014 generated by codesight</div>

<div>
${project.frameworks.map((f) => `<span class="stack-badge">${escapeHtml(f)}</span>`).join("")}
${project.orms.map((o) => `<span class="stack-badge">${escapeHtml(o)}</span>`).join("")}
<span class="stack-badge">${escapeHtml(project.componentFramework)}</span>
<span class="stack-badge">${escapeHtml(project.language)}</span>
${project.repoType !== "single" ? `<span class="stack-badge">${escapeHtml(project.repoType)}</span>` : ""}
</div>

<div class="token-hero">
  <div class="token-saved">~${tokenStats.saved.toLocaleString()} tokens saved</div>
  <div class="token-detail">
    Output: ${tokenStats.outputTokens.toLocaleString()} tokens \u2014 Exploration cost without codesight: ~${tokenStats.estimatedExplorationTokens.toLocaleString()} tokens \u2014 ${tokenStats.fileCount} files scanned
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="stat-value">${routes.length}</div><div class="stat-label">Routes</div></div>
  <div class="stat"><div class="stat-value">${schemas.length}</div><div class="stat-label">Models</div></div>
  <div class="stat"><div class="stat-value">${components.length}</div><div class="stat-label">Components</div></div>
  <div class="stat"><div class="stat-value">${libs.length}</div><div class="stat-label">Libraries</div></div>
  <div class="stat"><div class="stat-value">${config.envVars.length}</div><div class="stat-label">Env Vars</div></div>
  <div class="stat"><div class="stat-value">${middleware.length}</div><div class="stat-label">Middleware</div></div>
  <div class="stat"><div class="stat-value">${graph.edges.length}</div><div class="stat-label">Import Links</div></div>
</div>

${routes.length > 0 ? `
<div class="section">
<h2>Routes</h2>
<table>
<tr><th>Method</th><th>Path</th><th>Contract</th><th>Tags</th><th>File</th></tr>
${routes.map((r2) => `<tr>
  <td><span class="method method-${escapeHtml(r2.method)}">${escapeHtml(r2.method)}</span></td>
  <td class="route-path">${escapeHtml(r2.path)}${r2.params ? ` <span class="route-contract">params: ${escapeHtml(r2.params.join(", "))}</span>` : ""}</td>
  <td>${r2.requestType ? `<span class="route-contract">in: ${escapeHtml(r2.requestType)}</span>` : ""}${r2.responseType ? `<span class="route-contract">out: ${escapeHtml(r2.responseType)}</span>` : ""}</td>
  <td>${r2.tags.map((t) => `<span class="tag tag-${escapeHtml(t)}">${escapeHtml(t)}</span>`).join("")}</td>
  <td class="card-meta">${escapeHtml(r2.file)}</td>
</tr>`).join(`
`)}
</table>
</div>` : ""}

${schemas.length > 0 ? `
<div class="section">
<h2>Schema</h2>
<div class="grid">
${schemas.map((m) => `<div class="card">
  <div class="card-title">${escapeHtml(m.name)} <span class="card-meta">${escapeHtml(m.orm)}</span></div>
  ${m.fields.map((f) => `<div class="field">
    <span class="field-name">${escapeHtml(f.name)}</span>
    <span class="field-type">${escapeHtml(f.type)}</span>
    <span class="field-flags">${f.flags.map((fl) => `<span class="flag flag-${escapeHtml(fl)}">${escapeHtml(fl)}</span>`).join("")}</span>
  </div>`).join(`
`)}
  ${m.relations.length > 0 ? `<div class="card-meta" style="margin-top:6px">Relations: ${escapeHtml(m.relations.join(", "))}</div>` : ""}
</div>`).join(`
`)}
</div>
</div>` : ""}

${components.length > 0 ? `
<div class="section">
<h2>Components</h2>
<div class="grid">
${components.map((c) => `<div class="card">
  <div class="card-title">${escapeHtml(c.name)} ${c.isClient ? '<span class="badge-client">client</span>' : ""}${c.isServer ? '<span class="badge-server">server</span>' : ""}</div>
  ${c.props.length > 0 ? `<div class="component-props">props: ${escapeHtml(c.props.join(", "))}</div>` : ""}
  <div class="card-meta">${escapeHtml(c.file)}</div>
</div>`).join(`
`)}
</div>
</div>` : ""}

${graph.hotFiles.length > 0 ? `
<div class="section">
<h2>Dependency Hot Files</h2>
<div class="grid">
${graph.hotFiles.slice(0, 12).map((h) => {
    const maxImports = graph.hotFiles[0]?.importedBy || 1;
    const pct = Math.round(h.importedBy / maxImports * 100);
    return `<div class="card">
  <div class="card-title" style="font-size:.9rem">${escapeHtml(h.file)}</div>
  <div class="card-meta">imported by ${h.importedBy} files</div>
  <div class="hot-bar" style="width:${pct}%"></div>
</div>`;
  }).join(`
`)}
</div>
</div>` : ""}

${config.envVars.length > 0 ? `
<div class="section">
<h2>Environment Variables</h2>
<table>
<tr><th>Variable</th><th>Status</th><th>Source</th></tr>
${config.envVars.map((e) => `<tr>
  <td><code>${escapeHtml(e.name)}</code></td>
  <td>${e.hasDefault ? '<span class="env-default">has default</span>' : '<span class="env-required">required</span>'}</td>
  <td class="card-meta">${escapeHtml(e.source)}</td>
</tr>`).join(`
`)}
</table>
</div>` : ""}

${middleware.length > 0 ? `
<div class="section">
<h2>Middleware</h2>
<div class="grid">
${middleware.map((m) => `<div class="card">
  <div class="card-title">${escapeHtml(m.name)} <span class="tag tag-${escapeHtml(m.type)}">${escapeHtml(m.type)}</span></div>
  <div class="card-meta">${escapeHtml(m.file)}</div>
</div>`).join(`
`)}
</div>
</div>` : ""}

<div class="footer">
  Generated by <a href="https://github.com/Houseofmvps/codesight">codesight</a> \u2014 see your codebase clearly
</div>

</body>
</html>`;
}

// ../../node_modules/.bun/codesight@1.19.0/node_modules/codesight/dist/index.js
init_wiki();
init_config();
init_native_loader();
init_core();
function printHelp() {
  console.log(`
  ${BRAND} v${VERSION} \u2014 See your codebase clearly

  Usage: ${BRAND} [options] [directory]

  Options:
    -o, --output <dir>       Output directory (default: .codesight)
    -d, --depth <n>          Max directory depth (default: 10)
    --wiki                   Generate wiki knowledge base (.codesight/wiki/)
    --init                   Generate AI config files (CLAUDE.md, .cursorrules, etc.)
    --watch                  Re-scan on file changes
    --hook                   Install git pre-commit hook
    --html                   Generate interactive HTML report
    --open                   Generate HTML report and open in browser
    --mcp                    Start as MCP server (for Claude Code, Cursor)
    --json                   Output JSON instead of markdown
    --benchmark              Show detailed token savings breakdown
    --profile <tool>         Generate optimized config (claude-code|cursor|codex|copilot|windsurf|agents)
    --blast <file>           Show blast radius for a file
    --telemetry              Run token telemetry (real before/after measurement)
    --eval                   Run precision/recall benchmarks on eval fixtures
    --max-tokens <n>         Trim output to fit token budget (e.g. --max-tokens 50000)
    --since <ref>            Show only routes from files changed since git ref/commit
    --mode <mode>            Scan mode: code (default) | knowledge (map .md notes)
    --refresh [pkg]          Rebuild monorepo package context (all or named package)
    --native-ast[=langs]     Use WASM AST plugins (=all default, =none to force off, or =rust,go,\u2026)
    --native-ast-strict      Like --native-ast, but report + fail if a named plugin is missing
    --plugin-dir <dir>       Extra directory to search for WASM plugins
    -v, --version            Show version
    -h, --help               Show this help

  Config (.codesightignore / codesight.config.json):
    Reads codesight.config.json, static codesight.config.(ts|js|mjs) literals, or package.json "codesight" field.
    .codesightignore: gitignore-style patterns for files/dirs to skip.
    Detectors: graphql, grpc, websocket, events auto-detected when present.
    See docs for disableDetectors, customRoutePatterns, plugins, maxTokens, and more.

  Examples:
    npx ${BRAND}                         # Scan current directory
    npx ${BRAND} --wiki                  # Scan + generate wiki knowledge base
    npx ${BRAND} --init                  # Scan + generate AI config files
    npx ${BRAND} --open                  # Scan + open visual report
    npx ${BRAND} --watch                 # Watch mode, re-scan on changes
    npx ${BRAND} --mcp                   # Start MCP server
    npx ${BRAND} --hook                  # Install git pre-commit hook
    npx ${BRAND} --max-tokens 50000      # Fit output in 50K token budget
    npx ${BRAND} --since HEAD~5          # Show routes from last 5 commits
    npx ${BRAND} --telemetry             # Measure real token savings
    npx ${BRAND} --eval                  # Run accuracy benchmarks
    npx ${BRAND} ./my-project            # Scan specific directory
    npx ${BRAND} --mode knowledge        # Map knowledge base (.md notes \u2192 KNOWLEDGE.md)
    npx ${BRAND} --mode knowledge ~/vault # Map Obsidian vault or any .md folder
    npx ${BRAND} --profile agents        # Generate AGENTS.md only (cross-platform agents)
`);
}
function parseLangs(token) {
  return token.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}
function applyNativeAstArg(cli, val, strict) {
  const v = val.trim().toLowerCase();
  if (v === "none") {
    cli.none = true;
    return;
  }
  cli.enabled = cli.enabled === "strict" || strict ? "strict" : true;
  if (v !== "" && v !== "all")
    cli.languages = parseLangs(v);
}
function parseNativeAstEnv(v) {
  if (!v)
    return;
  const t = v.trim().toLowerCase();
  if (t === "")
    return;
  if (t === "0" || t === "false" || t === "off" || t === "none")
    return { enabled: false };
  if (t === "strict")
    return { enabled: "strict" };
  if (t === "1" || t === "true" || t === "on" || t === "all")
    return { enabled: true };
  const langs = parseLangs(t);
  return langs.length ? { enabled: true, languages: langs } : undefined;
}
function resolveNativeAstCli(cli, cliPluginDir) {
  const pickDir = (cfg) => {
    const dir = cliPluginDir || process.env.CODESIGHT_PLUGIN_DIR;
    if (dir)
      cfg.pluginDir = dir;
    return cfg;
  };
  if (cli.none)
    return { enabled: false };
  if (cli.enabled) {
    const cfg = { enabled: cli.enabled };
    if (cli.languages?.length)
      cfg.languages = cli.languages;
    return pickDir(cfg);
  }
  const env = parseNativeAstEnv(process.env.CODESIGHT_NATIVE_AST);
  if (env) {
    if (env.enabled === false)
      return { enabled: false };
    const cfg = { enabled: env.enabled };
    if (env.languages?.length)
      cfg.languages = env.languages;
    return pickDir(cfg);
  }
  return;
}
async function resolveGitHooksDir(root) {
  try {
    const { execFileSync } = await import("child_process");
    const out = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: root }).toString().trim();
    if (out)
      return resolve4(root, out);
  } catch {}
  try {
    const info = await stat7(join27(root, ".git"));
    if (info.isDirectory())
      return join27(root, ".git", "hooks");
  } catch {}
  return null;
}
async function installGitHook(root, outputDirName) {
  const hooksDir = await resolveGitHooksDir(root);
  if (!hooksDir) {
    console.log("  No git repository found. Initialize a git repo first.");
    return;
  }
  const hookPath = join27(hooksDir, "pre-commit");
  await mkdir6(hooksDir, { recursive: true });
  let existingContent = "";
  try {
    const { readFile: readFile17 } = await import("fs/promises");
    existingContent = await readFile17(hookPath, "utf-8");
  } catch {}
  const safeOutputDir = outputDirName.replace(/[^a-zA-Z0-9._-]/g, "");
  const hookCommand = `
# codesight: regenerate AI context
npx codesight --wiki -o ${safeOutputDir}
git add ${safeOutputDir}/
`;
  if (existingContent.includes("codesight")) {
    console.log("  Git hook already installed.");
    return;
  }
  if (existingContent) {
    await writeFile9(hookPath, existingContent + hookCommand);
  } else {
    await writeFile9(hookPath, `#!/bin/sh
${hookCommand}`);
  }
  const { chmod } = await import("fs/promises");
  await chmod(hookPath, 493);
  console.log(`  Git pre-commit hook installed at ${hookPath}`);
}
async function watchMode(root, outputDirName, maxDepth, userConfig = {}, wikiMode = false) {
  console.log(`  Watching for changes... (Ctrl+C to stop)
`);
  const WATCH_EXTENSIONS2 = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".vue",
    ".svelte",
    ".rb",
    ".ex",
    ".exs",
    ".java",
    ".kt",
    ".rs",
    ".php",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".env",
    ".prisma",
    ".graphql",
    ".gql"
  ]);
  const IGNORE_DIRS2 = new Set([
    "node_modules",
    ".git",
    ".next",
    ".nuxt",
    ".svelte-kit",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    "out",
    ".output",
    "coverage",
    ".turbo",
    ".vercel",
    ".cache",
    outputDirName
  ]);
  let debounceTimer = null;
  let isScanning = false;
  let changedFiles = [];
  const runScan = async () => {
    if (isScanning)
      return;
    isScanning = true;
    const files = [...changedFiles];
    changedFiles = [];
    try {
      const fileList = files.length <= 5 ? files.join(", ") : `${files.length} files`;
      console.log(`
  Changes detected (${fileList}), re-scanning...
`);
      const watchResult = await scan(root, outputDirName, maxDepth, userConfig);
      if (wikiMode) {
        process.stdout.write("  Regenerating wiki...");
        const outputDir = join27(root, outputDirName);
        const wikiResult = await generateWiki(watchResult, outputDir);
        console.log(` ${wikiResult.articles.length} articles updated`);
      }
    } catch (err) {
      console.error("  Scan error:", err.message);
    }
    isScanning = false;
  };
  const { watch: watch2 } = await import("fs");
  const { extname: ext } = await import("path");
  const watcher = watch2(root, { recursive: true }, (_event, filename) => {
    if (!filename)
      return;
    const parts = filename.split("/");
    if (parts.some((p) => IGNORE_DIRS2.has(p)))
      return;
    const fileExt = ext(filename);
    if (!WATCH_EXTENSIONS2.has(fileExt))
      return;
    changedFiles.push(filename);
    if (debounceTimer)
      clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runScan, 500);
  });
  watcher.on("error", (err) => {
    if ((err == null ? void 0 : err.code) === "ENOSPC") {
      console.error("  codesight: file watcher hit the inotify limit (ENOSPC); some changes may be missed. Raise fs.inotify.max_user_watches / max_user_instances.");
      return;
    }
    throw err;
  });
  process.on("SIGINT", () => {
    watcher.close();
    console.log(`
  Watch mode stopped.`);
    process.exit(0);
  });
  await new Promise(() => {});
}
async function runKnowledgeScan(root, outputDirName, maxDepth) {
  const outputDir = join27(root, outputDirName);
  const projectName = root.split("/").pop() || "Project";
  console.log(`
  ${BRAND} v${VERSION}`);
  console.log(`  Knowledge scan: ${root}
`);
  const startTime = Date.now();
  process.stdout.write("  Collecting notes...");
  const files = await collectFiles(root, maxDepth, []);
  const mdFiles = files.filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
  console.log(` ${mdFiles.length} markdown files`);
  process.stdout.write("  Analyzing...");
  const map = await detectKnowledge(files, root);
  console.log(` done (${map.totalNotes} notes, ${map.decisions.length} decisions, ${map.openQuestions.length} questions)`);
  process.stdout.write("  Writing output...");
  await writeKnowledgeOutput(map, outputDir, projectName, VERSION);
  console.log(` ${outputDirName}/KNOWLEDGE.md`);
  const elapsed = Date.now() - startTime;
  const typeCounts = new Map;
  for (const note of map.notes) {
    typeCounts.set(note.type, (typeCounts.get(note.type) || 0) + 1);
  }
  const breakdown = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}: ${n}`).join(", ");
  console.log(`
  Results:
    Notes:        ${map.totalNotes}
    Decisions:    ${map.decisions.length}
    Questions:    ${map.openQuestions.length}
    Themes:       ${map.recurringThemes.length}
    People:       ${map.people.length}
    ${breakdown ? `Breakdown:    ${breakdown}` : ""}

  Done in ${elapsed}ms
`);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(`${BRAND} v${VERSION}`);
    process.exit(0);
  }
  let targetDir = process.cwd();
  let outputDirName = ".codesight";
  let maxDepth = 10;
  let jsonOutput = false;
  let doWiki = false;
  let doInit = false;
  let doWatch = false;
  let doHook = false;
  let doHtml = false;
  let doOpen = false;
  let doMcp = false;
  let doBenchmark = false;
  let doProfile = "";
  let doBlast = "";
  let doTelemetry = false;
  let doEval = false;
  let maxTokens = 0;
  let doSince = "";
  let mode = "code";
  let doRefresh = false;
  let refreshPackage = "";
  const nativeAstCli = {};
  let pluginDir = "";
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    if ((arg === "-o" || arg === "--output") && args[i + 1]) {
      outputDirName = args[++i];
    } else if ((arg === "-d" || arg === "--depth") && args[i + 1]) {
      maxDepth = parseInt(args[++i], 10);
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--wiki") {
      doWiki = true;
    } else if (arg === "--init") {
      doInit = true;
    } else if (arg === "--watch") {
      doWatch = true;
    } else if (arg === "--hook") {
      doHook = true;
    } else if (arg === "--html") {
      doHtml = true;
    } else if (arg === "--open") {
      doHtml = true;
      doOpen = true;
    } else if (arg === "--mcp") {
      doMcp = true;
    } else if (arg === "--benchmark") {
      doBenchmark = true;
    } else if (arg === "--profile" && args[i + 1]) {
      doProfile = args[++i];
    } else if (arg === "--blast" && args[i + 1]) {
      doBlast = args[++i];
    } else if (arg === "--telemetry") {
      doTelemetry = true;
    } else if (arg === "--eval") {
      doEval = true;
    } else if (arg === "--max-tokens" && args[i + 1]) {
      maxTokens = parseInt(args[++i], 10);
    } else if (arg === "--since" && args[i + 1]) {
      doSince = args[++i];
    } else if (arg === "--mode" && args[i + 1]) {
      mode = args[++i];
    } else if (arg === "--refresh") {
      doRefresh = true;
      if (args[i + 1] && !args[i + 1].startsWith("-")) {
        refreshPackage = args[++i];
      }
    } else if (arg === "--native-ast" || arg.startsWith("--native-ast=")) {
      applyNativeAstArg(nativeAstCli, arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "", false);
    } else if (arg === "--native-ast-strict" || arg.startsWith("--native-ast-strict=")) {
      applyNativeAstArg(nativeAstCli, arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : "", true);
    } else if (arg === "--plugin-dir" && args[i + 1]) {
      pluginDir = args[++i];
    } else if (!arg.startsWith("-")) {
      targetDir = resolve4(arg);
    }
  }
  if (doMcp) {
    const { startMCPServer: startMCPServer2 } = await Promise.resolve().then(() => (init_mcp_server(), exports_mcp_server));
    await startMCPServer2();
    return;
  }
  if (doEval) {
    const { runEval: runEval2 } = await Promise.resolve().then(() => (init_eval(), exports_eval));
    await runEval2();
    return;
  }
  const root = resolve4(targetDir);
  const nativeAst = resolveNativeAstCli(nativeAstCli, pluginDir);
  const fileConfig = await loadConfig(root);
  const config = mergeCliConfig(fileConfig, {
    maxDepth: maxDepth !== 10 ? maxDepth : undefined,
    outputDir: outputDirName !== ".codesight" ? outputDirName : undefined,
    profile: doProfile || undefined,
    maxTokens: maxTokens > 0 ? maxTokens : undefined,
    nativeAst
  });
  if (config.maxDepth)
    maxDepth = config.maxDepth;
  if (config.outputDir)
    outputDirName = config.outputDir;
  let sinceFiles = null;
  if (doSince) {
    try {
      const { execFileSync } = await import("child_process");
      const changed = execFileSync("git", ["diff", "--name-only", doSince], { cwd: root }).toString().trim();
      if (changed) {
        sinceFiles = new Set(changed.split(`
`).map((f) => f.trim()));
        console.log(`  --since ${doSince}: ${sinceFiles.size} changed files`);
      }
    } catch {
      console.warn(`  Warning: --since failed (not a git repo or invalid ref)`);
    }
  }
  if (doHook) {
    await installGitHook(root, outputDirName);
  }
  if (doRefresh) {
    const { runMonorepoScan: runMonorepoScan2 } = await Promise.resolve().then(() => (init_orchestrator(), exports_orchestrator));
    await runMonorepoScan2(root, config, refreshPackage || undefined);
    return;
  }
  if (config.monorepo?.enabled) {
    if (doWatch) {
      const { watchMonorepo: watchMonorepo2 } = await Promise.resolve().then(() => (init_watch(), exports_watch));
      await watchMonorepo2(root, config);
      return;
    }
    const { runMonorepoScan: runMonorepoScan2 } = await Promise.resolve().then(() => (init_orchestrator(), exports_orchestrator));
    const scannedPackages = await runMonorepoScan2(root, config);
    if (doInit) {
      const { generateMonorepoAIConfigs: generateMonorepoAIConfigs2 } = await Promise.resolve().then(() => (init_ai_config(), exports_ai_config));
      const generated = await generateMonorepoAIConfigs2(root, scannedPackages, outputDirName);
      if (generated.length > 0) {
        console.log(`  Generated: ${generated.join(", ")}`);
      }
    }
    return;
  }
  if (mode === "knowledge") {
    await runKnowledgeScan(root, outputDirName, maxDepth);
    return;
  }
  let result = await scan(root, outputDirName, maxDepth, config);
  if (sinceFiles && sinceFiles.size > 0) {
    result = {
      ...result,
      routes: result.routes.filter((r) => sinceFiles.has(r.file)),
      schemas: result.schemas
    };
    console.log(`  --since filter: showing ${result.routes.length} routes from changed files`);
  }
  if (config.maxTokens && config.maxTokens > 0) {
    result = applyTokenBudget(result, config.maxTokens);
  }
  if (config.plugins) {
    for (const plugin of config.plugins) {
      if (plugin.postProcessor) {
        try {
          result = await plugin.postProcessor(result);
        } catch (err) {
          console.warn(`  Warning: plugin "${plugin.name}" post-processor failed: ${err.message}`);
        }
      }
    }
  }
  if (doTelemetry) {
    const { runTelemetry: runTelemetry2 } = await Promise.resolve().then(() => (init_telemetry(), exports_telemetry));
    const outputDir = join27(root, outputDirName);
    process.stdout.write("  Running telemetry...");
    const report = await runTelemetry2(root, result, outputDir);
    console.log(` ${outputDirName}/telemetry.md`);
    console.log(`
  Telemetry Results:`);
    for (const task of report.tasks) {
      console.log(`    ${task.name}: ${task.reduction}x reduction (${task.tokensWithout.toLocaleString()} \u2192 ${task.tokensWith.toLocaleString()} tokens)`);
    }
    console.log(`    Average: ${report.summary.averageReduction}x | Tool calls saved: ${report.summary.totalToolCallsSaved}`);
    console.log("");
  }
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  }
  if (doWiki) {
    const outputDir = join27(root, outputDirName);
    process.stdout.write("  Generating wiki...");
    const wikiResult = await generateWiki(result, outputDir);
    const articleList = wikiResult.articles.join(", ");
    console.log(` ${outputDirName}/wiki/ (${wikiResult.articles.length} articles, ~${wikiResult.tokenEstimate.toLocaleString()} tokens total)`);
    console.log(`  Articles: ${articleList}`);
    console.log(`  Index:    ${outputDirName}/wiki/index.md`);
    console.log(`  Log:      ${outputDirName}/wiki/log.md`);
    console.log("");
    console.log(`  Session tip: read ${outputDirName}/wiki/index.md at session start (~200 tokens)`);
    console.log(`  vs full scan: ~${result.tokenStats.outputTokens.toLocaleString()} tokens \u2014 load targeted articles instead`);
    console.log("");
  }
  if (doInit) {
    process.stdout.write("  Generating AI configs...");
    const generated = await generateAIConfigs(result, root);
    if (generated.length > 0) {
      console.log(` ${generated.join(", ")}`);
    } else {
      console.log(" all configs already exist");
    }
  }
  if (doHtml) {
    const outputDir = join27(root, outputDirName);
    process.stdout.write("  Generating HTML report...");
    const reportPath = await generateHtmlReport(result, outputDir);
    console.log(` ${outputDirName}/report.html`);
    if (doOpen) {
      const { execFile: execFile2 } = await import("child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      execFile2(cmd, [reportPath]);
      console.log("  Opening in browser...");
    }
  }
  if (doBenchmark) {
    const ts = result.tokenStats;
    const r = result;
    console.log(`
  Token Savings Breakdown:
  \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
  \u2502 What codesight found         \u2502 Exploration cost   \u2502
  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524
  \u2502 ${String(r.routes.length).padStart(3)} routes                   \u2502 ~${(r.routes.length * 400).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(r.schemas.length).padStart(3)} schema models            \u2502 ~${(r.schemas.length * 300).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(r.components.length).padStart(3)} components              \u2502 ~${(r.components.length * 250).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(r.libs.length).padStart(3)} library files            \u2502 ~${(r.libs.length * 200).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(r.config.envVars.length).padStart(3)} env vars                \u2502 ~${(r.config.envVars.length * 100).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(r.middleware.length).padStart(3)} middleware              \u2502 ~${(r.middleware.length * 200).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(r.graph.hotFiles.length).padStart(3)} hot files               \u2502 ~${(r.graph.hotFiles.length * 150).toLocaleString().padStart(6)} tokens     \u2502
  \u2502 ${String(ts.fileCount).padStart(3)} files (search overhead) \u2502 ~${(Math.min(ts.fileCount, 50) * 80).toLocaleString().padStart(6)} tokens     \u2502
  \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524
  \u2502 codesight output             \u2502 ~${ts.outputTokens.toLocaleString().padStart(6)} tokens     \u2502
  \u2502 Manual exploration (1.3x)    \u2502 ~${ts.estimatedExplorationTokens.toLocaleString().padStart(6)} tokens     \u2502
  \u2502 SAVED PER CONVERSATION       \u2502 ~${ts.saved.toLocaleString().padStart(6)} tokens     \u2502
  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518

  How this is calculated:
  - Each route found saves ~400 tokens of file reading + grep exploration
  - Each schema model saves ~300 tokens of migration/ORM file parsing
  - Each component saves ~250 tokens of prop discovery
  - Search overhead: AI typically runs ${Math.min(ts.fileCount, 50)} glob/grep operations
  - 1.3x multiplier: AI revisits files during multi-turn exploration
`);
  }
  if (doBlast) {
    const { analyzeBlastRadius: analyzeBlastRadius2 } = await Promise.resolve().then(() => exports_blast_radius);
    const br = analyzeBlastRadius2(doBlast, result);
    console.log(`
  Blast Radius: ${doBlast}`);
    console.log(`  Depth: ${br.depth} hops
`);
    if (br.affectedFiles.length > 0) {
      console.log(`  Affected files (${br.affectedFiles.length}):`);
      for (const f of br.affectedFiles.slice(0, 20)) {
        console.log(`    ${f}`);
      }
      if (br.affectedFiles.length > 20)
        console.log(`    ... +${br.affectedFiles.length - 20} more`);
    }
    if (br.affectedRoutes.length > 0) {
      console.log(`
  Affected routes (${br.affectedRoutes.length}):`);
      for (const r of br.affectedRoutes) {
        console.log(`    ${r.method} ${r.path} \u2014 ${r.file}`);
      }
    }
    if (br.affectedModels.length > 0) {
      console.log(`
  Affected models: ${br.affectedModels.join(", ")}`);
    }
    if (br.affectedMiddleware.length > 0) {
      console.log(`
  Affected middleware: ${br.affectedMiddleware.join(", ")}`);
    }
    if (br.affectedFiles.length === 0) {
      console.log("  No downstream dependencies. Minimal blast radius.");
    }
    console.log("");
  }
  if (doProfile) {
    const { generateProfileConfig: generateProfileConfig2 } = await Promise.resolve().then(() => (init_ai_config(), exports_ai_config));
    process.stdout.write(`  Generating ${doProfile} profile...`);
    const file = await generateProfileConfig2(result, root, doProfile);
    console.log(` ${file}`);
  }
  if (result.nativeDiagnostics?.length) {
    console.error("");
    console.error(reportNativeDiagnostics(result.nativeDiagnostics));
    process.exitCode = 1;
  }
  if (doWatch) {
    await watchMode(root, outputDirName, maxDepth, config, doWiki);
  }
}
function applyTokenBudget(result, maxTokens) {
  const routeWeight = (r) => {
    const priority = ["auth", "payment", "ai", "queue"].filter((t) => r.tags.includes(t)).length;
    return priority * 100 + r.tags.length * 10;
  };
  let estimatedTokens = result.routes.length * 15 + result.schemas.reduce((s, m) => s + 8 + m.fields.length * 5, 0) + result.components.length * 10 + result.libs.length * 8;
  if (estimatedTokens <= maxTokens)
    return result;
  const sortedRoutes = [...result.routes].sort((a, b) => routeWeight(b) - routeWeight(a));
  let trimmedRoutes = sortedRoutes;
  let trimmedComponents = result.components;
  let trimmedLibs = result.libs;
  while (estimatedTokens > maxTokens && trimmedLibs.length > 0) {
    trimmedLibs = trimmedLibs.slice(0, Math.floor(trimmedLibs.length * 0.7));
    estimatedTokens = trimmedRoutes.length * 15 + result.schemas.reduce((s, m) => s + 8 + m.fields.length * 5, 0) + trimmedComponents.length * 10 + trimmedLibs.length * 8;
  }
  while (estimatedTokens > maxTokens && trimmedComponents.length > 0) {
    trimmedComponents = trimmedComponents.slice(0, Math.floor(trimmedComponents.length * 0.7));
    estimatedTokens = trimmedRoutes.length * 15 + result.schemas.reduce((s, m) => s + 8 + m.fields.length * 5, 0) + trimmedComponents.length * 10 + trimmedLibs.length * 8;
  }
  while (estimatedTokens > maxTokens && trimmedRoutes.length > 10) {
    trimmedRoutes = trimmedRoutes.slice(0, Math.floor(trimmedRoutes.length * 0.8));
    estimatedTokens = trimmedRoutes.length * 15 + result.schemas.reduce((s, m) => s + 8 + m.fields.length * 5, 0) + trimmedComponents.length * 10 + trimmedLibs.length * 8;
  }
  console.log(`  Token budget: trimmed to ~${estimatedTokens} tokens (limit: ${maxTokens})`);
  return { ...result, routes: trimmedRoutes, components: trimmedComponents, libs: trimmedLibs };
}
main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
