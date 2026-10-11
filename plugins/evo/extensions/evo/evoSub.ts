import * as fs from "node:fs/promises";
import * as path from "node:path";
import { atomicWriteFile } from "./atomic.ts";
import { ompAgentProfilesDir, ompStateFile, projectAgentProfilesDir } from "./paths.ts";
import { readEvoConfig, writeEvoConfig } from "./config.ts";
import { EVO_SUB_BRIEF_START, injectEvoSubInstructions, parseToolsFrontmatter, rewriteToolsFrontmatter, selectProjectNearestProfiles } from "./frontmatter.ts";
import { buildEvoSubTools, evoSubCatalogHash, SUB_POLICY_VERSION, type PiToolsSurface } from "./tools.ts";
import { contentHash, deleteSubGeneration, migrateLegacySharedRecord, newSubGeneration, readSubGeneration, serializeTransition, writeSubGeneration, type GenerationProfile, type SubGenerationRecord } from "./generation-state.ts";

const COOK_SUB_PROFILES: ReadonlySet<string> = new Set(["cook-judge.md", "cook-planner.md", "cook-researcher.md", "cook-scout.md", "cook-validator.md", "cook-worker.md", "cook-council.md", "cook-council-synthesis.md", "cook-audit.md", "cook-refute.md"]);
export interface SubOnResult { changed: boolean; msg: string; rewritten: number }
export interface SubOffResult { changed: boolean; msg: string; restored: number; sacrificed: number }

export class SubEvoController {
  private active = false;
  private lastAllowlist: string[] | null = null;
  private cwd?: string;
  constructor(private piTools: PiToolsSurface, cwd?: string) { this.cwd = cwd; }
  setCwd(cwd: string): void { this.cwd = cwd; }
  isActive(): boolean { return this.active; }
  allowlistSize(): number { return this.lastAllowlist?.length ?? 0; }

  private roots(): string[] { return this.cwd ? [this.cwd] : []; }

  private async resolveLegacy(): Promise<boolean> {
    // Legacy shared record is not recovery authority; only a record whose
    // project profiles all belong to the current authorized project cwd can
    // be proven. Ambiguous or foreign evidence stays retained and fails
    // closed — activation must never overwrite it.
    const result = await migrateLegacySharedRecord(this.roots());
    return result !== "retained";
  }

  async hydrate(): Promise<void> {
    if (!await this.resolveLegacy()) { this.active = false; return; }
    const cfg = await readEvoConfig();
    const state = await readSubGeneration(this.roots());
    this.active = cfg.sub && state?.status === "active" && state.profiles.length > 0;
    if (this.active) this.lastAllowlist = buildEvoSubTools();
  }

  async activate(): Promise<SubOnResult> { return serializeTransition(() => this.activateUnlocked()); }
  private async activateUnlocked(): Promise<SubOnResult> {
    if (this.active) return { changed: false, msg: "evo-sub already active — /evo-sub off first", rewritten: 0 };
    const roots = this.roots();
    if (!await this.resolveLegacy()) return { changed: false, msg: "evo-sub refusal: legacy recovery evidence is ambiguous or foreign — retained; remove it manually before retrying", rewritten: 0 };
    const prior = await readSubGeneration(roots);
    if (prior !== null) return { changed: false, msg: "evo-sub refusal: a sub recovery record is already present — run /evo-sub off first", rewritten: 0 };
    // Fail-closed: a present-but-unreadable or foreign sub record must never
    // be overwritten — it is the only byte-exact recovery evidence.
    try {
      await fs.access(ompStateFile());
      return { changed: false, msg: "evo-sub refusal: sub recovery record is present but unreadable or foreign — remove it manually before retrying", rewritten: 0 };
    } catch { /* record file absent — fresh activation is safe */ }
    const global: string[] = [], project: string[] = [], errors: string[] = [];
    const scan = async (dir: string, out: string[]) => { try { for (const e of await fs.readdir(dir, { withFileTypes: true })) if (e.isFile() && COOK_SUB_PROFILES.has(e.name)) out.push(path.join(dir, e.name)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") errors.push(`${dir}: ${e instanceof Error ? e.message : String(e)}`); } };
    await scan(ompAgentProfilesDir(), global); if (this.cwd) await scan(projectAgentProfilesDir(this.cwd), project);
    const files = selectProjectNearestProfiles(global, project);
    if (!files.length && errors.length) return { changed: false, msg: `evo-sub: cannot read profiles: ${errors.join("; ")}`, rewritten: 0 };
    const profiles: GenerationProfile[] = [], rewrites: Array<{ path: string; content: string }> = [];
    for (const file of files) {
      const orig = await fs.readFile(file, "utf8"); const originalTools = parseToolsFrontmatter(orig) ?? [];
      const tools = buildEvoSubTools(path.basename(file), originalTools);
      if (orig.includes(EVO_SUB_BRIEF_START)) throw new Error("EVO_RESTORE_CONFLICT");
      const next = injectEvoSubInstructions(rewriteToolsFrontmatter(orig, tools).content); const canonicalPath = await fs.realpath(file);
      profiles.push({ canonicalPath, scope: this.cwd && canonicalPath.startsWith(path.resolve(projectAgentProfilesDir(this.cwd)) + path.sep) ? "project" : "global", originalContent: orig, originalHash: contentHash(orig), effectiveContentHash: contentHash(next), originalToolNames: parseToolsFrontmatter(orig) ?? [], effectiveToolNames: parseToolsFrontmatter(next) ?? [], phase: "pending" });
      if (next !== orig) rewrites.push({ path: file, content: next });
    }
    this.lastAllowlist = buildEvoSubTools();
    const hasProjectProfiles = profiles.some((p) => p.scope === "project");
    const generation = newSubGeneration({
      policyVersion: SUB_POLICY_VERSION,
      catalogHash: evoSubCatalogHash(
        profiles.map((p) => ({
          basename: path.basename(p.canonicalPath),
          originalTools: p.originalToolNames,
        })),
      ),
      status: "pending",
      ownerProjectCwd: hasProjectProfiles && this.cwd ? path.resolve(this.cwd) : undefined,
      profiles,
    });
    try {
      await writeSubGeneration(generation, roots);
      for (const rewrite of rewrites) {
        const current = await fs.readFile(rewrite.path, "utf8");
        const canonicalPath = await fs.realpath(rewrite.path);
        const p = profiles.find(x => x.canonicalPath === canonicalPath);
        if (!p || contentHash(current) !== p.originalHash) throw new Error("EVO_RESTORE_CONFLICT");
        await atomicWriteFile(rewrite.path, rewrite.content);
        p.phase = "applied";
      }
      for (const p of profiles) if (p.phase === "pending") p.phase = "applied";
      generation.status = "active"; generation.updatedAt = new Date().toISOString(); await writeSubGeneration(generation, roots);
      const cfg = await readEvoConfig(); await writeEvoConfig({ main: cfg.main, sub: true }); this.active = true;
    } catch (error) {
      const results = await Promise.allSettled(profiles.filter(p => p.phase === "applied").map(async p => {
        try {
          const current = await fs.readFile(p.canonicalPath, "utf8");
          if (contentHash(current) !== p.effectiveContentHash) throw new Error("EVO_RESTORE_CONFLICT");
          await atomicWriteFile(p.canonicalPath, p.originalContent);
        } catch (error) { throw error; }
      }));
      if (results.some(r => r.status === "rejected")) { generation.status = "failed"; generation.updatedAt = new Date().toISOString(); try { await writeSubGeneration(generation, roots); } catch {} }
      else if (prior) {
        try { await writeSubGeneration(prior, roots); } catch { /* retain pending evidence */ }
      } else try { await deleteSubGeneration(); } catch {}
      this.active = false; this.lastAllowlist = null; throw error;
    }
    return { changed: true, msg: `evo-sub activated: ${rewrites.length}/${files.length} profiles rewritten`, rewritten: rewrites.length };
  }

  async deactivate(): Promise<SubOffResult> { return serializeTransition(() => this.deactivateUnlocked()); }
  private async deactivateUnlocked(): Promise<SubOffResult> {
    const roots = this.roots(); const state = await readSubGeneration(roots);
    if (!await this.resolveLegacy()) return { changed: false, msg: "evo-sub refusal: legacy recovery evidence is ambiguous or foreign — retained; cannot restore over it", restored: 0, sacrificed: 1 };
    if (!state) {
      // A record file bound to another project cwd (or unreadable) must never
      // be deleted or restored from here — fail-closed, keep the evidence.
      try { await fs.access(ompStateFile()); } catch { return { changed: false, msg: "evo-sub not active — nothing to restore", restored: 0, sacrificed: 0 }; }
      return { changed: false, msg: "evo-sub refusal: sub recovery record is unreadable or foreign (not owned by this project cwd) — recovery evidence retained", restored: 0, sacrificed: 1 };
    }
    if (!this.active && !state.profiles.length) return { changed: false, msg: "evo-sub not active — nothing to restore", restored: 0, sacrificed: 0 };
    if (state.status !== "active") return await this.restoreConflict(state, `generation is ${state.status}`);
    for (const p of state.profiles) { let current: string; try { current = await fs.readFile(p.canonicalPath, "utf8"); } catch { return await this.restoreConflict(state, "profile missing") } if (p.effectiveContentHash && contentHash(current) !== p.effectiveContentHash) return await this.restoreConflict(state, "profile drift detected"); }
    for (const p of state.profiles) await atomicWriteFile(p.canonicalPath, p.originalContent);
    const cfg = await readEvoConfig();
    const restoredCount = state.profiles.length;
    try { await deleteSubGeneration(); } catch {}
    this.active = false; this.lastAllowlist = null; await writeEvoConfig({ main: cfg.main, sub: false });
    return { changed: true, msg: `evo-sub deactivated: ${restoredCount} restored`, restored: restoredCount, sacrificed: 0 };
  }
  private async restoreConflict(state: SubGenerationRecord, reason: string): Promise<SubOffResult> { state.status = "failed"; state.updatedAt = new Date().toISOString(); await writeSubGeneration(state, this.roots()); this.active = true; this.lastAllowlist = buildEvoSubTools(); return { changed: false, msg: `EVO_RESTORE_CONFLICT: ${reason}; recovery evidence retained`, restored: 0, sacrificed: 1 }; }

  async refresh(): Promise<SubOnResult> {
    return serializeTransition(async () => {
      const roots = this.roots();
      if (!await this.resolveLegacy()) return { changed: false, msg: "evo-sub refresh refused: legacy recovery evidence is ambiguous or foreign — retained", rewritten: 0 };
      const state = await readSubGeneration(roots);
      if (!state || state.status !== "active" || !state.profiles.length) return { changed: false, msg: "evo-sub refresh refused: no active generation", rewritten: 0 };
      const next = newSubGeneration({
        policyVersion: SUB_POLICY_VERSION,
        catalogHash: evoSubCatalogHash(
          state.profiles.map((p) => ({
            basename: path.basename(p.canonicalPath),
            originalTools: p.originalToolNames,
          })),
        ),
        status: "pending",
        ownerProjectCwd: state.ownerProjectCwd,
        profiles: state.profiles.map((p) => ({ ...p, phase: "pending", effectiveContentHash: undefined, effectiveToolNames: undefined })),
      });
      const rewrites: Array<{ profile: GenerationProfile; content: string }> = [];
      for (const p of next.profiles) {
        const current = await fs.readFile(p.canonicalPath, "utf8");
        if (contentHash(current) !== state.profiles.find(x => x.canonicalPath === p.canonicalPath)?.effectiveContentHash) { const conflict = await this.restoreConflict(state, "profile drift detected"); return { changed: false, msg: conflict.msg, rewritten: 0 }; }
        const content = injectEvoSubInstructions(rewriteToolsFrontmatter(p.originalContent, buildEvoSubTools(path.basename(p.canonicalPath), p.originalToolNames)).content);
        p.effectiveContentHash = contentHash(content); p.effectiveToolNames = parseToolsFrontmatter(content) ?? []; rewrites.push({ profile: p, content });
      }
      await writeSubGeneration(next, roots);
      try {
        for (const { profile, content } of rewrites) { const current = await fs.readFile(profile.canonicalPath, "utf8"); if (contentHash(current) !== state.profiles.find(x => x.canonicalPath === profile.canonicalPath)?.effectiveContentHash) throw new Error("EVO_RESTORE_CONFLICT"); await atomicWriteFile(profile.canonicalPath, content); profile.phase = "applied"; }
        next.status = "active"; next.updatedAt = new Date().toISOString(); await writeSubGeneration(next, roots); this.active = true; return { changed: true, msg: `evo-sub refreshed: ${rewrites.length} profiles`, rewritten: rewrites.length };
      } catch (error) { next.status = "failed"; next.updatedAt = new Date().toISOString(); await writeSubGeneration(next, roots); throw error; }
    });
  }
  async regenerate(): Promise<SubOnResult> {
    return serializeTransition(async () => {
      const restored = await this.deactivateUnlocked();
      if (!restored.changed) return { changed: false, msg: restored.msg, rewritten: 0 };
      return this.activateUnlocked();
    });
  }
}
