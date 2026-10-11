/**
 * omp-lean-ctx — OMP-native lean-ctx integration extension.
 *
 * Wires lean-ctx's 83 MCP context-intelligence tools into OMP's hook system so
 * the agent uses them by default — no steering rules required.
 *
 * Hooks:
 *   tool_call   → block native read/grep/glob with redirect to ctx_*;
 *                 intercept ctx_knowledge(decision/preference) → Mnemopi retain;
 *                 bridge checkpoint/rewind to ctx_session save/restore
 *   tool_result → truncate oversized bash output with ctx_expand recovery hint
 *   context     → inject lean-ctx session briefing + pressure hints
 *   session_start → run ctx_overview, set status line
 *   session_before_compact → ctx_session save before context collapses
 *
 * Memory layering:
 *   lean-ctx  → operational/task-scoped (code graph, session, gotchas)
 *   Mnemopi   → durable cross-session (decisions, preferences)
 *   Hook routes ctx_knowledge category=decision|preference to Mnemopi retain.
 */

import type { AgentToolResult, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { TSchema } from "@oh-my-pi/pi-ai";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { disposeAllGateways, ensureGateway } from "./gateway.js";
// OMP's marketplace install does not run npm/bun install — peer/runtime
// packages like @oh-my-pi/omptype are not on the plugin's module resolution
// path. OMP ships the original typebox package in the host's plugin
// node_modules, so import the JSON-Schema builder from there instead.
import { Type } from "typebox";

// ── Constants ────────────────────────────────────────────────────────────────────

const MOD_ID = "lean-ctx";

/** Native tools to block + redirect to lean-ctx equivalents. */
const REDIRECTS: Record<string, string> = {
  read: "ctx_read",
  grep: "ctx_search",
  glob: "ctx_glob",
};

/** Mnemopi-routed knowledge categories (durable, cross-session). */
const MNEMOPI_CATEGORIES = new Set(["decision", "preference", "convention"]);

/** Threshold (chars) above which bash output gets truncated with a recovery hint. */
const BASH_TRUNCATE_THRESHOLD = 12_000;

/** Verbose command patterns where ctx_shell would save the most. */
const VERBOSE_CMD_RE =
  /\b(cargo|npm|pnpm|yarn|bun|deno|go|make|mvn|gradle|docker|kubectl|helm|terraform|ansible|tsc|eslint|prettier|ruff|pytest|jest|vitest|playwright)\b/;

/** Progressive search throttling: threshold for ctx_search advisory. */
const CTX_SEARCH_THRESHOLD = 3;

/**
 * Check if evo-mode main is active by reading OMP config.yml.
 * When evo-mode is active, it manages the tool set via setActiveTools().
 * lean-ctx should defer its read/grep/glob redirects to evo in that case
 * to avoid double-blocking with conflicting messages.
 * Returns false if evo-mode is off or config can't be read.
 */
function isEvoMainActive(): boolean {
  try {
    // Synchronous read — this is a hot path (tool_call hook).
    // Use require to avoid top-level import issues.
    const fsSync = require("node:fs");
    const configPath = path.join(
      process.env.OMP_HOME || path.join(process.env.HOME ?? "~", ".omp"),
      "agent", "config.yml",
    );
    const raw = fsSync.readFileSync(configPath, "utf-8");
    // Match `evo-mode:` block and check `main: true`
    const evoBlock = raw.match(/evo-mode:\s*\n\s*main:\s*(true|false)/);
    return evoBlock ? evoBlock[1] === "true" : false;
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function redirectReason(native: string, replacement: string): string {
  const examples: Record<string, string> = {
    read: 'ctx_read(path, mode="full"|"map"|"signatures"|"anchored"|"lines:N-M")',
    grep: "ctx_search(pattern, path)  — also: action=semantic|symbol",
    glob: "ctx_glob(pattern, path)",
  };
  return [
    `lean-ctx active: use ${replacement} instead of native ${native}.`,
    examples[native] ? `e.g. ${examples[native]}` : "",
    "Cached, compressed, ~13 tokens on re-read. (omp-lean-ctx hook)",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Mirror package SKILL.md into OMP's agent skills dir for discoverability. */
async function ensureSkillDiscoverable(): Promise<void> {
  try {
    const pkgSkillPath = path.join(__dirname, "..", "skills", "lean-ctx", "SKILL.md");
    const targetDir = path.join(process.env.OMP_HOME || path.join(process.env.HOME ?? "~", ".omp"), "agent", "skills", "lean-ctx");
    const targetPath = path.join(targetDir, "SKILL.md");

    const source = await fs.readFile(pkgSkillPath, "utf-8");

    // Idempotent: skip if target exists with same content.
    try {
      const existing = await fs.readFile(targetPath, "utf-8");
      if (existing === source) return;
    } catch {
      // File doesn't exist yet, proceed with write.
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, source);
  } catch {
    // Non-fatal: skill discoverability is nice-to-have.
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────────

export default function leanCtxExtension(pi: ExtensionAPI): void {
  pi.setLabel("LeanCTX Context Engine");

  // ── Client mode detection (tui/rpc/json/print) ─────────────────────────────────
  let detectedMode: string = "tui";

  // ── Progressive search throttling state (per-session, in-memory) ─────────────
  let ctxSearchCallCount = 0;

  const confirmed = new Set<string>();

  // ── session_start: ctx_overview + status ──────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    // Detect OMP client mode for UI gating.
    detectedMode = ctx.mode ?? "tui";

    // TASK-33.3 AC#2: initialize the default active tool list to exactly the
    // core collapsed six — no 69-tool MCP mount required. On-demand expansion
    // of optional names is TASK-33.4 scope. Best-effort: hosts without the
    // active-tools API simply keep their own defaults.
    if (typeof (pi as ExtensionAPI & { setActiveTools?: unknown }).setActiveTools === "function") {
      try {
        await (pi as ExtensionAPI & {
          setActiveTools: (names: string[]) => Promise<void>;
        }).setActiveTools([...CORE_CTX_TOOLS, "ctx_call"]);
      } catch {
        // Non-fatal — active-tool management is advisory on this host.
      }
    }

    // Mirror lean-ctx SKILL.md into OMP's agent skills dir for discoverability.
    await ensureSkillDiscoverable();

    confirmed.clear();

    // Fire ctx_overview in the background — non-blocking, best-effort.
    // This primes lean-ctx's task-relevance scoring for the session.
    try {
      await pi.exec("lean-ctx", ["overview","--quiet"], { cwd: ctx.cwd });
    } catch {
      // lean-ctx binary missing or overview failed — non-fatal.
    }

    // Query cognitive mode status — active features and anti-interruption score.
    let cognitiveSummary = "";
    try {
      const cognitiveResult = await pi.exec("lean-ctx", ["cognitive"], { cwd: ctx.cwd });
      const output = cognitiveResult.stdout;
      // Parse anti-interruption score
      const scoreMatch = output.match(/Anti-Interruption Score:\s*(\d+)%/);
      const score = scoreMatch ? scoreMatch[1] : null;
      // Count active features (✓ active markers vs total [F##] features)
      const activeFeatures = (output.match(/✓ active/g) || []).length;
      const totalFeatures = (output.match(/\[F\d+\]/g) || []).length;
      if (score !== null && totalFeatures > 0) {
        cognitiveSummary = ` | cognitive: ${activeFeatures}/${totalFeatures} (score: ${score}%)`;
      } else if (totalFeatures > 0) {
        cognitiveSummary = ` | cognitive: ${activeFeatures}/${totalFeatures}`;
      }
    } catch {
      // Non-fatal — lean-ctx works without cognitive mode status.
    }

    // Configure terse mode to reduce lean-ctx status line token overhead.
    let terseActive = false;
    try {
      await pi.exec("lean-ctx", ["compression", "max"], { cwd: ctx.cwd });
      terseActive = true;
    } catch {
      // Non-fatal — lean-ctx works without terse mode.
    }

    if (ctx.hasUI && detectedMode === "tui") {
      const status = `lean-ctx: active (${detectedMode})${cognitiveSummary}`;
      ctx.ui.setStatus(MOD_ID, status);
    }
  });

  // Explicitly dispose session-owned lean-ctx children. Without this hook,
  // completed subagents can leave their gateway processes registered as live.
  pi.on("session_shutdown", async () => {
    await disposeAllGateways();
  });

  // ── tool_call: redirect native read/grep/glob → ctx_* ─────────────────────────

  pi.on("tool_call", async (event, ctx) => {
    const tool = event.toolName;

    // 0. Progressive search throttling advisory: track ctx_search invocations.
    //    After CTX_SEARCH_THRESHOLD calls per session, inject advisory suggesting
    //    ctx_knowledge remember to persist findings instead of re-searching.
    if (tool === "ctx_search") {
      ctxSearchCallCount++;
      if (ctxSearchCallCount >= CTX_SEARCH_THRESHOLD) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `[lean-ctx advisory] ${ctxSearchCallCount} ctx_search calls this session — ` +
              `use ctx_knowledge remember to persist findings instead of re-searching.`,
            "info",
          );
        }
      }
    }

    // 1. Redirect native context tools to lean-ctx equivalents.
    if (REDIRECTS[tool]) {
      // Never block reads/writes on protocol URIs (skill://, agent://, memory://,
      // artifact://, local://, issue://, pr://, omp://, mcp://, history://, xd://,
      // ssh://, http://, https://) — ctx_* tools only handle filesystem paths.
      if (typeof event.input === "object" && event.input !== null) {
        const inp = event.input as Record<string, unknown>;
        const pathVal = inp["path"];
        if (typeof pathVal === "string" && /^[a-z]+:\/\//.test(pathVal)) {
          return undefined;
        }
      }

      // If evo-mode (main) is active, it manages the tool set via setActiveTools().
      // evo already blocks read/grep/glob on filesystem paths with its own redirect.
      // Defer to evo to avoid double-blocking with conflicting messages.
      if (isEvoMainActive()) {
        return undefined;
      }

      // In "print" mode (subagent), skip blocking if the specific ctx_* replacement
      // hasn't been confirmed via a successful tool_result — lean-ctx MCP may not
      // be connected in subagent environments.
      if (detectedMode === "print" && !confirmed.has(REDIRECTS[tool])) {
        return undefined;
      }
      return {
        block: true,
        reason: redirectReason(tool, REDIRECTS[tool]),
      };
    }

    // 1b. Redirect ctx_read on protocol URIs to native read — lean-ctx only
    //     handles filesystem paths; OMP protocol URIs (skill://, agent://,
    //     memory://, artifact://, history://, issue://, pr://, local://,
    //     omp://) resolve through OMP-internal infrastructure that lean-ctx
    //     cannot access. Block the ctx_read call and tell the agent to use
    //     native `read` for protocol URIs.
    if (tool === "ctx_read" && typeof event.input === "object" && event.input !== null) {
      const inp = event.input as Record<string, unknown>;
      const pathVal = inp["path"];
      if (typeof pathVal === "string" && /^[a-z]+:\/\//.test(pathVal)) {
        return {
          block: true,
          reason:
            `lean-ctx: ctx_read cannot resolve OMP protocol URIs (${pathVal}). ` +
            `Use the native read tool for ${pathVal.split("://")[0]}:// URIs. ` +
            `ctx_read only handles filesystem paths. (omp-lean-ctx hook)`,
        };
      }
    }

    // 2. Memory routing: ctx_knowledge(decision|preference) → also Mnemopi retain.
    if (tool === "ctx_knowledge" && ctx.memory && event.input && typeof event.input === "object") {
      const inp = event.input as Record<string, unknown>;
      const action = inp["action"];
      const category = inp["category"];
      const content = inp["content"];
      if (
        action === "remember" &&
        typeof category === "string" &&
        MNEMOPI_CATEGORIES.has(category) &&
        typeof content === "string"
      ) {
        // Fire-and-forget: also persist to Mnemopi for durable cross-session recall.
        // lean-ctx keeps its own copy for operational use; Mnemopi gets the durable one.
        try {
          await ctx.memory.save({
            content,
            context: `category=${category}; key=${typeof inp["key"] === "string" ? inp["key"] : "(none)"}`,
            source: "omp-lean-ctx:knowledge-bridge",
            importance: 1,
          });
        } catch {
          // Mnemopi save failed — non-fatal, lean-ctx still has the fact.
        }
      }
    }

    // 3. Checkpoint bridge: checkpoint tool → ctx_session save.
    if (tool === "checkpoint") {
      try {
        await pi.exec("lean-ctx", ["session", "save"], { cwd: ctx.cwd });
      } catch {
        // Non-fatal — checkpoint still works, just without lean-ctx snapshot.
      }
    }

    // 4. Checkpoint bridge: rewind tool → restore lean-ctx session after rewind.
    //    We save *before* the rewind collapses context, so lean-ctx state survives.
    if (tool === "rewind") {
      try {
        await pi.exec("lean-ctx", ["session", "save"], { cwd: ctx.cwd });
      } catch {
        // Non-fatal.
      }
    }
  });

  // ── tool_result: truncate oversized bash output ───────────────────────────────

  pi.on("tool_result", async (event, ctx) => {
    // Track confirmed ctx_* tools — once any succeeds, blocking activates.
    if (event.toolName.startsWith("ctx_") && !event.isError) {
      confirmed.add(event.toolName);
    }

    // Graph-aware [related: ...] hints for file reads
    if ((event.toolName === "ctx_read" || event.toolName === "read") && !event.isError) {
      try {
        const input = event.input as Record<string, unknown> | undefined;
        const path = input?.["path"] as string | undefined;
        if (path) {
          const graphResult = await pi.exec("lean-ctx", ["graph", "related", path], { cwd: ctx.cwd });
          if (graphResult.stdout?.trim()) {
            const related = graphResult.stdout.trim().slice(0, 200);
            return {
              content: [...event.content, { type: "text" as const, text: `\n[related: ${related}]` }],
            };
          }
        }
      } catch {
        // Graph query failed — non-fatal
      }
    }
    if (event.toolName !== "bash" || event.isError) return;

    let changed = false;
    const truncated = event.content.map((chunk) => {
      if (chunk.type !== "text") return chunk;
      const text = chunk.text;
      if (text.length <= BASH_TRUNCATE_THRESHOLD) return chunk;

      changed = true;
      const head = text.slice(0, BASH_TRUNCATE_THRESHOLD);
      const ctxShellHint =
        "\n\n[... truncated by omp-lean-ctx hook — use ctx_shell for compressed output, or ctx_expand to retrieve the full original]";
      return { ...chunk, text: head + ctxShellHint };
    });

    if (changed) return { content: truncated };
  });

  // ── context: inject lean-ctx session briefing ─────────────────────────────────

  pi.on("context", async (event) => {
    // Only inject on the first LLM call of the session (heuristic: short message list).
    // Avoid re-injecting on every turn — that would bloat context, not reduce it.
    if (event.messages.length > 6) return;

    // Skip briefing if print mode and no ctx_* tools confirmed yet.
    if (detectedMode === "print" && confirmed.size === 0) return;

    const alreadyInjected = event.messages.some((msg) => {
      if (msg.role !== "developer") return false;
      const content = msg.content;
      if (typeof content !== "string") return false;
      return content.includes("[lean-ctx: session active]");
    });
    if (alreadyInjected) return;

    const briefing = [
      "[lean-ctx: session active]",
      "Context tools: ctx_read (10 modes, cached ~13 tok re-read), ctx_search (regex/semantic/symbol),",
      "ctx_shell (95+ compression patterns), ctx_glob, ctx_tree, ctx_compose (call first), ctx_knowledge,",
      "ctx_session. Use ctx_* directly for explicit control. Native read/grep/glob are redirected by hook.",
      "Default active surface is the collapsed core six (ctx_glob/read/search/shell/tree/call); other ctx_* capabilities run through ctx_call and are activated on demand for the session.",
      "Memory: ctx_knowledge for operational facts; for durable decisions use category=decision (auto-routed to Mnemopi).",
      "Checkpoint/rewind pairs with ctx_session save/restore. See skill://lean-ctx for full reference.",
      "Recovery: if ctx_read output is triage-filtered (shows [lean-ctx: N lines filtered]),",
      "use ctx_retrieve(path=X, query=\"keyword\") to search within cached content for specific lines.",
    ].join(" ");

    return {
      messages: [
        ...event.messages,
        {
          role: "developer",
          content: briefing,
          timestamp: Date.now(),
        },
      ],
    };
  });

  // ── session_before_compact: save lean-ctx session before context collapse ──────

  pi.on("session_before_compact", async (_event, ctx) => {
    try {
      await pi.exec("lean-ctx", ["session", "save"], { cwd: ctx.cwd });
    } catch {
      // Non-fatal — compaction proceeds without lean-ctx snapshot.
    }
    // Don't cancel — let compaction proceed.
  });

  // ── Slash command: /lean-ctx status ────────────────────────────────────────────

  pi.registerCommand("lean-ctx", {
    description: "Show lean-ctx session status, savings, and tool availability",
    handler: async (_args, ctx) => {
      try {
        const result = await pi.exec("lean-ctx", ["session", "status"], { cwd: ctx.cwd });
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx: ${result.stdout.trim().slice(0, 200)}`, "info");
        }
      } catch {
        if (ctx.hasUI) {
          ctx.ui.notify("lean-ctx: status unavailable (binary not found?)", "warning");
        }
      }
    },
  });

  // ── Slash command: /lean-ctx gain — savings dashboard ─────────────────────────

  pi.registerCommand("lean-ctx-gain", {
    description: "Show lean-ctx token savings dashboard",
    handler: async (_args, ctx) => {
      try {
        const result = await pi.exec("lean-ctx", ["gain"], { cwd: ctx.cwd });
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx gain: see terminal output`, "info");
        }
      } catch {
        if (ctx.hasUI) {
          ctx.ui.notify("lean-ctx: gain unavailable", "warning");
        }
      }
    },
  });

  // ── Tool: lean-ctx-resources — bridge to MCP resources/prompts ────────────────

  pi.registerTool<TSchema>({
    name: "lean-ctx-resources",
    label: "lean-ctx-resources",
    description:
      "List and read lean-ctx MCP resources (context/summary, pressure, plan, pinned, bounce) and prompts (context-focus, review, reset, pin, budget).",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("read")]),
      uri: Type.Optional(Type.String()),
    }) as unknown as TSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { action, uri } = params as { action: "list" | "read"; uri?: string };

      try {
        if (action === "list") {
          const result = await pi.exec("lean-ctx", ["resources", "list"], { cwd: ctx.cwd });
          return { content: [{ type: "text" as const, text: result.stdout }] };
        }

        if (action === "read") {
          if (!uri) {
            return {
              content: [{ type: "text" as const, text: "Error: uri is required for action=read" }],
              isError: true,
            };
          }
          const result = await pi.exec("lean-ctx", ["resources", "read", uri], { cwd: ctx.cwd });
          return { content: [{ type: "text" as const, text: result.stdout }] };
        }

        return {
          content: [{ type: "text" as const, text: `Error: unknown action '${action}'` }],
          isError: true,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error executing lean-ctx-resources: ${msg}` }],
          isError: true,
        };
      }
    },
  });

  // ── Slash command: /lean-ctx-serve — daemon management ──────────────────────

  pi.registerCommand("lean-ctx-serve", {
    description:
      "Start, stop, or check lean-ctx HTTP daemon (serves ctx_* tools over HTTP for non-MCP clients)",
    handler: async (args, ctx) => {
      const sub = (args?.[0] as string) || "status";
      const validSubs = ["start", "stop", "status"];
      if (!validSubs.includes(sub)) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `lean-ctx-serve: unknown sub-command '${sub}'. Use: start, stop, status`,
            "warning",
          );
        }
        return;
      }

      try {
        if (sub === "start") {
          const result = await pi.exec(
            "lean-ctx",
            ["daemon", "start"],
            { cwd: ctx.cwd },
          );
          const output = result.stdout.trim();
          if (ctx.hasUI) {
            ctx.ui.notify(
              `lean-ctx daemon: started\n${output.slice(0, 300)}`,
              "info",
            );
          }
        } else if (sub === "stop") {
          const result = await pi.exec(
            "lean-ctx",
            ["daemon", "stop"],
            { cwd: ctx.cwd },
          );
          if (ctx.hasUI) {
            ctx.ui.notify(
              `lean-ctx daemon: stopped\n${result.stdout.trim().slice(0, 200)}`,
              "info",
            );
          }
        } else {
          // status
          const result = await pi.exec(
            "lean-ctx",
            ["daemon", "status"],
            { cwd: ctx.cwd },
          );
          const output = result.stdout.trim();
          if (ctx.hasUI) {
            ctx.ui.notify(
              `lean-ctx daemon status:\n${output.slice(0, 300)}`,
              "info",
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx-serve ${sub} failed: ${msg.slice(0, 200)}`, "warning");
        }
      }
    },
  });

  // ── Slash command: /lean-ctx-snapshot — time machine snapshots ──────────────
  pi.registerCommand("lean-ctx-snapshot", {
    description:
      "Context Time Machine: git-anchored signed snapshots (create/list/show/restore)",
    handler: async (_args, ctx) => {
      try {
        const subcommand = _args?.trim() || "list";
        const result = await pi.exec(
          "lean-ctx",
          ["snapshot", ...subcommand.split(/\s+/)],
          { cwd: ctx.cwd },
        );
        if (ctx.hasUI) {
          ctx.ui.notify(
            `lean-ctx snapshot: ${result.stdout.trim().slice(0, 200)}`,
            "info",
          );
        }
      } catch {
        if (ctx.hasUI)
          ctx.ui.notify("lean-ctx snapshot: unavailable", "warning");
      }
    },
  });

  // ── Slash command: /lean-ctx-pack — portability context packages ──────────────
  pi.registerCommand("lean-ctx-pack", {
    description: "Manage .ctxpkg context packages (create/list/info/export/import/install)",
    handler: async (args, ctx) => {
      try {
        const sub = (args?.[0] as string) || "list";
        const rest = args?.slice(1) ?? [];
        const result = await pi.exec("lean-ctx", ["pack", sub, ...rest], { cwd: ctx.cwd });
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx pack ${sub}: ${result.stdout.trim().slice(0, 200)}`, "info");
        }
      } catch {
        if (ctx.hasUI) ctx.ui.notify("lean-ctx pack: unavailable", "warning");
      }
    },
  });

  // ── Slash command: /lean-ctx-addon — addon/plugin discovery gateway ───────────

  pi.registerCommand("lean-ctx-addon", {
    description: "Search, add, and list lean-ctx addons/plugins (lean-ctx addon search|add|list)",
    handler: async (_args, ctx) => {
      const raw = _args?.trim() || "";
      const parts = raw.split(/\s+/);
      const sub = parts[0] || "list";
      const query = parts.slice(1).join(" ");

      const validSubs = ["search", "add", "list"];
      if (!validSubs.includes(sub)) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `lean-ctx-addon: unknown sub-command '${sub}'. Use: search, add, list`,
            "warning",
          );
        }
        return;
      }

      try {
        const args = ["addon", sub];
        if (sub === "search" && query) {
          args.push(query);
        } else if (sub === "add" && query) {
          args.push(query);
        }
        const result = await pi.exec("lean-ctx", args, { cwd: ctx.cwd });
        const output = result.stdout.trim();
        if (ctx.hasUI) {
          ctx.ui.notify(
            `lean-ctx addon ${sub}:\n${output.slice(0, 400)}`,
            "info",
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx addon ${sub} failed: ${msg.slice(0, 200)}`, "warning");
        }
      }
    },
  });

  // ── Slash command: /lean-ctx-shadow — shadow mode savings proof ─────────────────
  pi.registerCommand("lean-ctx-shadow", {
    description: "Shadow mode: compare lean-ctx treatment with baseline for savings proof",
    handler: async (args, ctx) => {
      try {
        const sub = (args?.[0] as string) || "--latest";
        const rest = args?.slice(1) ?? [];
        const result = await pi.exec("lean-ctx", ["shadow", sub, ...rest], { cwd: ctx.cwd });
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx shadow: ${result.stdout.trim().slice(0, 200)}`, "info");
        }
      } catch {
        if (ctx.hasUI) ctx.ui.notify("lean-ctx shadow: unavailable", "warning");
      }
    },
  });

  // ── Tool: lean-ctx-enterprise — enterprise features (proxy, policy, dashboard) ──

  pi.registerTool<TSchema>({
    name: "lean-ctx-enterprise",
    label: "lean-ctx-enterprise",
    description:
      "Manage lean-ctx enterprise features: proxy configuration, policy gate management, dashboard launch.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("proxy"),
        Type.Literal("policy"),
        Type.Literal("dashboard"),
      ]),
      config: Type.Optional(Type.Record(Type.String(), Type.Any())),
    }) as unknown as TSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { action, config } = params as {
        action: "proxy" | "policy" | "dashboard";
        config?: Record<string, unknown>;
      };
      try {
        const args = ["enterprise", action];
        if (config) {
          args.push(JSON.stringify(config));
        }
        const result = await pi.exec("lean-ctx", args, { cwd: ctx.cwd });
        const output = result.stdout.trim();
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx enterprise ${action}: completed`, "info");
        }
        return {
          content: [{ type: "text" as const, text: output || `lean-ctx enterprise ${action}: completed` }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ctx.hasUI) {
          ctx.ui.notify(`lean-ctx enterprise ${action} failed: ${msg.slice(0, 200)}`, "warning");
        }
        return {
          content: [{ type: "text" as const, text: `Error: lean-ctx enterprise ${action} failed: ${msg}` }],
        };
      }
    },
  });

  // ── Tool: lean-ctx-gateway — proxy calls to downstream MCP servers ────────────
  //
  // Spawns lean-ctx as an MCP server over stdio JSON-RPC and forwards a
  // tools/call. lean-ctx's compression layer sits in the middle, keeping
  // tool_result tokens bounded even for verbose downstream servers.

  pi.registerTool<TSchema>({
    name: "lean-ctx-gateway",
    label: "lean-ctx-gateway",
    description:
      "Gateway to downstream MCP servers — unlimited external tools at ~constant cost. " +
      "Proxies a tool call through lean-ctx's compression layer.",
    parameters: Type.Object({
      tool: Type.String({ description: "Name of the downstream MCP tool to call" }),
      args: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description: "Arguments to pass to the downstream tool",
        })
      ),
    }) as unknown as TSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { tool: toolName, args } = params as {
        tool: string;
        args?: Record<string, unknown>;
      };
      try {
        // Reuse the same module-scope gateway that runCtxTool uses, so a
        // // downstream-MCP call shares the lean-ctx MCP session with the
        // native ctx_* tools. No new spawn, no cold-start.
        const gateway = await ensureGateway(ctx.cwd);
        const result = await gateway.callTool(toolName, args);
        return (result.isError
          ? { content: result.content, isError: true }
          : result) as unknown as AgentToolResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error in lean-ctx-gateway: ${msg}` }],
          isError: true,
        };
      }
    },
  });

  // ── Tool: lean-ctx-load-tools — dynamic tool category management ─────────────
  //
  // Lets agents load, unload, or list dynamic tool categories on demand
  // without editing config. Categories: core, arch, debug, memory, metrics, session.
  pi.registerTool<TSchema>({
    name: "lean-ctx-load-tools",
    label: "lean-ctx-load-tools",
    description:
      "Load, unload, or list dynamic tool categories (core, arch, debug, memory, metrics, session) for on-demand MCP tool management.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("load"),
        Type.Literal("unload"),
        Type.Literal("list"),
      ]),
      categories: Type.Optional(Type.Array(Type.String())),
    }) as unknown as TSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { action, categories } = params as {
        action: "load" | "unload" | "list";
        categories?: string[];
      };
      try {
        if (action === "list") {
          const result = await pi.exec("lean-ctx", ["tools", "list"], { cwd: ctx.cwd });
          return { content: [{ type: "text" as const, text: result.stdout.trim() }] };
        }
        if (!categories || categories.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Error: categories are required for ${action} action.` }],
            isError: true,
          };
        }
        const result = await pi.exec("lean-ctx", ["tools", action, ...categories], { cwd: ctx.cwd });
        return { content: [{ type: "text" as const, text: result.stdout.trim() }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error executing lean-ctx-load-tools: ${msg}` }],
          isError: true,
        };
      }
    },
  });

  // ── Tool: lean-ctx-refactor — LSP-powered refactoring bridge ────────────────

  pi.registerTool<TSchema>({
    name: "lean-ctx-refactor",
    label: "lean-ctx-refactor",
    description:
      "LSP-powered refactoring via lean-ctx: rename, references, definition, implementations. Bridges ctx_refactor to OMP's tool surface.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("references"),
        Type.Literal("definition"),
        Type.Literal("implementations"),
        Type.Literal("rename"),
        Type.Literal("rename_preview"),
        Type.Literal("rename_apply"),
        Type.Literal("declaration"),
        Type.Literal("type_hierarchy"),
        Type.Literal("symbols_overview"),
        Type.Literal("inspections"),
        Type.Literal("move_preview"),
        Type.Literal("move_apply"),
        Type.Literal("safe_delete_preview"),
        Type.Literal("safe_delete_apply"),
        Type.Literal("inline_preview"),
        Type.Literal("inline_apply"),
        Type.Literal("replace_symbol_body"),
        Type.Literal("insert_before_symbol"),
        Type.Literal("insert_after_symbol"),
        Type.Literal("reformat"),
      ]),
      path: Type.String({ description: "File path (project-relative or absolute)" }),
      line: Type.Number({ description: "1-indexed line number" }),
      column: Type.Optional(Type.Number({ description: "0-indexed column" })),
      new_name: Type.Optional(Type.String({ description: "New symbol name (for rename actions)" })),
      name_path: Type.Optional(Type.String({ description: "Qualified symbol path for disambiguation" })),
      scope: Type.Optional(Type.Union([Type.Literal("project"), Type.Literal("all")])),
      target_path: Type.Optional(Type.String({ description: "Destination path (for move actions)" })),
      new_text: Type.Optional(Type.String({ description: "Replacement text (for replace_symbol_body)" })),
      text: Type.Optional(Type.String({ description: "Text to insert (for insert actions)" })),
    }) as unknown as TSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      try {
        const { action, path, line, column, new_name, name_path, scope, target_path, new_text, text } = params as {
          action: string;
          path: string;
          line: number;
          column?: number;
          new_name?: string;
          name_path?: string;
          scope?: string;
          target_path?: string;
          new_text?: string;
          text?: string;
        };

        const toolParams: Record<string, unknown> = { action, path, line };
        if (column !== undefined) toolParams.column = column;
        if (new_name !== undefined) toolParams.new_name = new_name;
        if (name_path !== undefined) toolParams.name_path = name_path;
        if (scope !== undefined) toolParams.scope = scope;
        if (target_path !== undefined) toolParams.target_path = target_path;
        if (new_text !== undefined) toolParams.new_text = new_text;
        if (text !== undefined) toolParams.text = text;

        const result = await pi.exec(
          "lean-ctx",
          ["call", "ctx_refactor", "--project-root", ctx.cwd, "--json", JSON.stringify(toolParams)],
          { cwd: ctx.cwd },
        );
        return { content: [{ type: "text" as const, text: result.stdout }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  });

  // ── Core collapsed surface: native ctx_* tools via CLI-first path ─────────────
  //
  // TASK-33.3: omp-lean-ctx owns the core ctx_* tool names natively. Every tool
  // executes through the same CLI-first dispatch: `lean-ctx call <tool> --project-root <cwd> --json`.
  // Caller JSON is forwarded verbatim; the decoded structured result is returned
  // on success, and CLI failures propagate as structured error results
  // (isError) rather than raw throws.

  const CORE_CTX_TOOLS = [
    "ctx_glob",
    "ctx_read",
    "ctx_search",
    "ctx_shell",
    "ctx_tree",
  ] as const;

  /** Structured CLI failure: prefer the stderr JSON-RPC payload verbatim. */
  function structuredCliError(
    toolName: string,
    err: { code?: number; message?: string; stderr?: string },
  ): { content: Array<{ type: "text"; text: string }>; isError: true } {
    let detailText = err.message ?? String(err);
    const stderrText = typeof err.stderr === "string" ? err.stderr.trim() : "";
    if (stderrText) {
      try {
        detailText = JSON.stringify(JSON.parse(stderrText));
      } catch {
        detailText = stderrText;
      }
    }
    return {
      content: [{ type: "text", text: `lean-ctx ${toolName} failed: ${detailText}` }],
      isError: true,
    };
  }

  async function runCtxTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: { cwd: string },
  ): Promise<unknown> {
    try {
      // Route every native ctx_* tool through a shared, module-scope lean-ctx
      // MCP gateway. Stateful tools (ctx_shell, ctx_read, ctx_session) need an
      // MCP session that the per-call `lean-ctx call` subcommand does not
      // open; the gateway opens one at spawn time and reuses it for every
      // tools/call in the same OMP session.
      const gateway = await ensureGateway(ctx.cwd);
      const result = await gateway.callTool(toolName, args);
      if (result.isError) {
        return structuredCliError(toolName, {
          message: result.content.map((c) => c.text).join("\n"),
        });
      }
      return result;
    } catch (err) {
      return structuredCliError(toolName, err as { message?: string; stderr?: string });
    }
  }

  for (const toolName of CORE_CTX_TOOLS) {
    pi.registerTool<TSchema>({
      name: toolName,
      label: toolName,
      description: `Native ${toolName} bridged through the shared lean-ctx MCP gateway (tools/call).`,
      parameters: Type.Object({}) as unknown as TSchema,
      async execute(_id, params, _signal, _onUpdate, ctx) {
        return runCtxTool(toolName, (params ?? {}) as Record<string, unknown>, ctx) as unknown as AgentToolResult;
      },
    });
  }

  // TASK-33.4: complete ctx_* capability set eligible for on-demand
  // activation via setActiveTools when requested through ctx_call. The core six
  // (ctx_glob/read/search/shell/tree/call) are always active — membership here
  // is harmless/idempotent for already-active names; non-core names expand on
  // first use. Validated locally so unknown names are rejected deterministically
  // without spawning the CLI.
  //
  // Regenerate (non-mutating source of truth):
  //   LEAN_CTX_TOOL_PROFILE=power lean-ctx tools health --all --json \
  //     | jq -r '.tools[].name' | grep '^ctx_'
  // (equivalently MCP tools/list under LEAN_CTX_TOOL_PROFILE=power).
  // Last verified 2026-08-25: 68 ctx_* names.
  const EXPANDABLE_CTX_TOOLS = new Set([
    "ctx_agent",
    "ctx_analyze",
    "ctx_architecture",
    "ctx_artifacts",
    "ctx_benchmark",
    "ctx_cache",
    "ctx_call",
    "ctx_callgraph",
    "ctx_checkpoint",
    "ctx_compare",
    "ctx_compile",
    "ctx_compose",
    "ctx_compress",
    "ctx_cognitive",
    "ctx_context",
    "ctx_control",
    "ctx_crush",
    "ctx_delta",
    "ctx_edit",
    "ctx_expand",
    "ctx_execute",
    "ctx_explore",
    "ctx_fill",
    "ctx_glob",
    "ctx_graph",
    "ctx_git_read",
    "ctx_handoff",
    "ctx_impact",
    "ctx_index",
    "ctx_knowledge",
    "ctx_ledger",
    "ctx_live_zone",
    "ctx_memory",
    "ctx_multi_repo",
    "ctx_optimize",
    "ctx_outline",
    "ctx_overview",
    "ctx_pack",
    "ctx_package",
    "ctx_patch",
    "ctx_perf",
    "ctx_plan",
    "ctx_plugins",
    "ctx_proof",
    "ctx_provider",
    "ctx_quality",
    "ctx_quality_lab",
    "ctx_read",
    "ctx_refactor",
    "ctx_repomap",
    "ctx_retrieve",
    "ctx_review",
    "ctx_routes",
    "ctx_rules",
    "ctx_search",
    "ctx_session",
    "ctx_share",
    "ctx_shell",
    "ctx_skillify",
    "ctx_smells",
    "ctx_summary",
    "ctx_task",
    "ctx_tools",
    "ctx_transcript_compact",
    "ctx_tree",
    "ctx_url_read",
    "ctx_verify",
    "ctx_workflow",
  ]);
  const DEFAULT_ACTIVE_TOOLS = [...CORE_CTX_TOOLS, "ctx_call"];

  /** Best-effort on-demand activation of a non-core ctx_* tool. */
  async function expandActiveTools(toolName: string): Promise<void> {
    const host = pi as ExtensionAPI & {
      getActiveTools?: () => string[];
      setActiveTools?: (names: string[]) => Promise<void>;
    };
    if (typeof host.setActiveTools !== "function") return;
    try {
      const current =
        typeof host.getActiveTools === "function" && host.getActiveTools().length > 0
          ? host.getActiveTools()
          : DEFAULT_ACTIVE_TOOLS;
      if (!current.includes(toolName)) {
        await host.setActiveTools([...current, toolName]);
      }
    } catch {
      // Non-fatal — expansion is advisory; the CLI dispatch below still runs.
    }
  }

  function structuredUnknownToolError(toolName: string): {
    content: Array<{ type: "text"; text: string }>;
    isError: true;
  } {
    return {
      content: [
        {
          type: "text",
          text:
            `lean-ctx ${toolName} failed: unknown tool "${toolName}". ` +
            `Known capabilities: [${[...DEFAULT_ACTIVE_TOOLS, ...EXPANDABLE_CTX_TOOLS].sort().join(", ")}]. ` +
            "Core tools are active by default; non-core tools are activated on demand via ctx_call.",
        },
      ],
      isError: true,
    };
  }

  // Generic CLI fallback invoker: routes any lean-ctx capability (core or
  // non-core, e.g. ctx_compose) through the same CLI-first dispatch.
  pi.registerTool<TSchema>({
    name: "ctx_call",
    label: "ctx_call",
    description:
      "Generic invoker for any lean-ctx capability via `lean-ctx call <tool> --project-root <cwd> --json`. " +
      "Receives {tool, args}; forwards args JSON verbatim; returns the decoded structured result.",
    parameters: Type.Object({
      tool: Type.String({ description: "lean-ctx capability to invoke, e.g. ctx_compose" }),
      args: Type.Optional(
        Type.Record(Type.String(), Type.Any(), { description: "Arguments payload for the tool" }),
      ),
    }) as unknown as TSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { tool: toolName, args } = params as { tool: string; args?: Record<string, unknown> };
      // TASK-33.4 compatibility gate: reject unknown names deterministically,
      // before any process spawn. Known non-core names are activated on demand.
      if (typeof toolName !== "string" || toolName.length === 0) {
        return structuredUnknownToolError(String(toolName));
      }
      const isCore = (CORE_CTX_TOOLS as readonly string[]).includes(toolName) || toolName === "ctx_call";
      if (!isCore && !EXPANDABLE_CTX_TOOLS.has(toolName)) {
        return structuredUnknownToolError(toolName);
      }
      if (!isCore) await expandActiveTools(toolName);
      return runCtxTool(toolName, args ?? {}, ctx) as unknown as AgentToolResult;
    },
  });
}
