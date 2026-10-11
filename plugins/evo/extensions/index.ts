/**
 * omp-evo-mode — composes evo-main and evo-sub controllers through OMP hooks
 * and slash commands.
 *
 * Slash commands:
 *   /evo {on, off, refresh, debug}          — main agent (setActiveTools + tool_call block)
 *   /evo-sub {on, off, refresh, regenerate, debug} — subagents (profile frontmatter rewrite)
 *
 * Sub-modules (./evo/*.ts):
 *   paths.ts       — OMP_HOME resolution + file locations
 *   config.ts      — YAML persistence for extensions.evo-mode section
 *   tools.ts       — Evo allowlist builder (every registered tool minus natives, read for protocol URIs only)
 *   frontmatter.ts — Markdown profile `tools:` key rewriter
 *   substate.ts    — sub-state.json persistence (byte-exact backup)
 *   atomic.ts      — tmp+rename file writes
 *   routing.ts     — canonical routing ladder + stable reason codes + per-turn violation tracker
 *   preflight.ts   — cook-* task-dispatch preflight against the committed sub generation
 *   generation-state.ts — per-lane durable generation records + transition boundary
 *   evoMain.ts     — main-agent controller (setActiveTools + snapshot)
 *   evoSub.ts      — subagent controller (profile rewrite + restore)
 */

import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ToolCallEvent,
} from "@oh-my-pi/pi-coding-agent";

import { readEvoConfig } from "./evo/config.ts";
import { MainEvoController } from "./evo/evoMain.ts";
import { SubEvoController } from "./evo/evoSub.ts";
import { ompAgentProfilesDir, ompStateFile } from "./evo/paths.ts";
import { preflightSubTaskDispatch } from "./evo/preflight.ts";
import {
  PerTurnViolationTracker,
  REASON_FS_READ_USE_NAV,
  REASON_REPEAT_VIOLATION,
  buildRoutingLadder,
  isProtocolUri,
} from "./evo/routing.ts";
import { readSubState } from "./evo/substate.ts";
import {
  NATIVE_BLOCK_LIST,
  buildEvoMainTools,
  type PiToolsSurface,
} from "./evo/tools.ts";
import * as fs from "node:fs/promises";

function notify(
  ctx: ExtensionCommandContext,
  msg: string,
  kind?: "info" | "warning" | "error",
): void {
  if (ctx.hasUI) ctx.ui.notify(msg, kind ?? "info");
}

export default function evoModeExtension(pi: ExtensionAPI): void {
  pi.setLabel("Evo Mode");

  const piTools = pi as unknown as PiToolsSurface;
  const mainCtl = new MainEvoController(piTools);
  const subCtl = new SubEvoController(piTools);
  const violations = new PerTurnViolationTracker();

  // ── Hooks ─────────────────────────────────────────────────────────────────

  pi.on("session_start", async () => {
    violations.reset();
    await mainCtl.hydrate();
    await subCtl.hydrate();
  });

  pi.on("turn_start", async () => {
    violations.reset();
    await mainCtl.refreshFromConfig();
    await subCtl.hydrate();
  });

  pi.on("before_agent_start", (event: BeforeAgentStartEvent) => {
    // Canonical concise routing injected only while the main lane is active.
    // One ladder, no tool inventory: the hook stays small and deterministic.
    if (!mainCtl.isActive()) return undefined;
    return { systemPrompt: [...event.systemPrompt, buildRoutingLadder()] };
  });

  pi.on(
    "tool_call",
    async (event: ToolCallEvent, ctx: ExtensionContext) => {
      const tool = event.toolName;
      if (typeof tool !== "string") return undefined;

      // Sub-lane preflight: cook-* dispatch must prove the committed sub
      // generation (block+reason, never automatic substitution). The preflight
      // gates internally on Persisted config.sub (re-read from disk), so it
      // runs even when the process-local controller hydrate failed — invalid
      // or foreign sub state can never fall back to the original cook
      // profiles while config still requests sub evo.
      if (tool === "task") {
        const preflight = await preflightSubTaskDispatch(event.input.agent, ctx.cwd);
        if (preflight.block) return { block: true, reason: preflight.reason };
      }

      if (!mainCtl.isActive()) return undefined;
      if (!NATIVE_BLOCK_LIST.has(tool)) return undefined;

      if (tool === "read") {
        const p = event.input?.path;
        if (typeof p === "string" && isProtocolUri(p)) return undefined;
      }
      // glob is not in the allowlist — branch kept as defense-in-depth.
      if (tool === "glob") {
        const pattern = "pattern" in event.input ? event.input.pattern : undefined;
        if (typeof pattern === "string" && isProtocolUri(pattern)) return undefined;
      }

      // Teach once per native tool per turn, then hard-block without
      // re-teaching: repeated violations never create redirect loops.
      if (violations.alreadyTaught(tool)) {
        return {
          block: true,
          reason: `${REASON_REPEAT_VIOLATION}: evo mode: native ${tool} blocked (already routed this turn); use eval (persistent kernel) for writes/shell and the codesight/code-nav ladder for context.`,
        };
      }
      violations.markTaught(tool);

      // Route the agent to the cheapest correct surface at the moment of
      // misuse: context work belongs to the codesight/code-nav ladder; eval
      // is for mutations and shell. This message teaches exactly once per
      // tool per turn, so it must teach, not just refuse.
      const contextTool =
        tool === "read" || tool === "grep"
          ? " For context (read/search/symbols), climb the ladder: codesight_get_summary / codesight_get_symbol_index, then code_nav_get_symbol / code_nav_find_references — they return exact slices at a fraction of the tokens."
          : tool === "glob"
            ? " For code shapes use ast_grep_search; for non-code patterns use eval glob."
            : "";
      return {
        block: true,
        reason:
          tool === "read"
            ? `${REASON_FS_READ_USE_NAV}: evo mode: native ${tool} blocked on filesystem paths. Use eval (persistent kernel) for writes/shell/batch ops.${contextTool}`
            : `evo mode: native ${tool} blocked. ` +
              `Use eval (persistent kernel) for writes/shell/batch ops.` +
              contextTool,
      };
    },
  );

  // ── /evo ─────────────────────────────────────────────────────────────────

  pi.registerCommand("evo", {
    description: "Toggle evo mode for the main agent: on | off | refresh | debug",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "on") {
        const r = await mainCtl.activate();
        notify(ctx, `evo: ${r.msg}`);
        return;
      }
      if (arg === "off") {
        const r = await mainCtl.deactivate();
        notify(ctx, `evo: ${r.msg}`);
        return;
      }
      if (arg === "refresh") {
        const r = await mainCtl.refresh();
        notify(ctx, `evo: ${r.msg}`, r.changed ? "info" : "warning");
        return;
      }
      if (arg === "debug" || arg === "status" || arg === "") {
        const persisted = await readEvoConfig();
        const currentActive = piTools.getActiveTools ? await piTools.getActiveTools() : [];
        const evoCandidates = await buildEvoMainTools(piTools);
        notify(
          ctx,
          [
            `evo main: ${mainCtl.isActive() ? "ON" : "OFF"}`,
            `persisted: { main: ${persisted.main}, sub: ${persisted.sub} }`,
            `current active tool count: ${currentActive.length}`,
            `evo target tool count: ${evoCandidates.length}`,
            `snapshot size: ${mainCtl.snapshotSize()}`,
            `sample evo tools: ${evoCandidates.slice(0, 5).join(", ")}`,
          ].join("\n"),
        );
        return;
      }
      notify(ctx, `evo: unknown arg "${arg}" — use on | off | refresh | debug`, "warning");
    },
  });

  // ── /evo-sub ──────────────────────────────────────────────────────────────

  pi.registerCommand("evo-sub", {
    description:
      "Toggle evo mode for subagents (profile frontmatter): on | off | refresh | regenerate | debug",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = (args ?? "").trim().toLowerCase();
      if (arg === "on") {
        subCtl.setCwd(ctx.cwd);
        const r = await subCtl.activate();
        notify(ctx, r.msg, r.changed ? "info" : "warning");
        return;
      }
      if (arg === "off") {
        subCtl.setCwd(ctx.cwd);
        const r = await subCtl.deactivate();
        notify(ctx, r.msg, r.sacrificed > 0 ? "warning" : "info");
        return;
      }
      if (arg === "refresh") {
        subCtl.setCwd(ctx.cwd);
        const r = await subCtl.refresh();
        notify(ctx, r.msg, r.changed ? "info" : "warning");
        return;
      }
      if (arg === "regenerate") {
        subCtl.setCwd(ctx.cwd);
        try {
          const r = await subCtl.regenerate();
          notify(ctx, r.msg, r.changed ? "info" : "warning");
        } catch (error) {
          notify(ctx, `evo-sub regenerate: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
        return;
      }
      if (arg === "debug" || arg === "status" || arg === "") {
        const persisted = await readEvoConfig();
        const state = await readSubState();
        const profileDir = ompAgentProfilesDir();
        let profileCount = 0;
        try {
          const entries = await fs.readdir(profileDir, { withFileTypes: true });
          profileCount = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).length;
        } catch {
          profileCount = 0;
        }
        notify(
          ctx,
          [
            `evo-sub: ${subCtl.isActive() ? "ON" : "OFF"}`,
            `persisted.sub: ${persisted.sub}`,
            `state file: ${state ? `present (${state.files.length} entries @ ${state.timestamp})` : "absent"} (${ompStateFile()})`,
            `profile dir: ${profileDir} (${profileCount} files)`,
            `allowlist size: ${subCtl.allowlistSize()}`,
          ].join("\n"),
        );
        return;
      }
      notify(ctx, `evo-sub: unknown arg "${arg}" — use on | off | refresh | regenerate | debug`, "warning");
    },
  });
}
