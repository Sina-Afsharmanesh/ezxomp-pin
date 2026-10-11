import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { handleSetup } from "./commands/setup.js";
import { handleModeWithDefaultModel, HandleModeOptions, PLAYBOOKS, resolvePlaybookFromToken } from "./commands/mode.js";
import { handleReview } from "./commands/review.js";
import { handlePrCanvas } from "./commands/pr-canvas.js";
import { handleQuality } from "./commands/quality.js";
import { handleDocs } from "./commands/docs.js";
import { handleShip } from "./commands/ship.js";
import { handleCi } from "./commands/ci.js";
import { handlePr } from "./commands/pr.js";
import { handleVerify } from "./commands/verify.js";
import { handleDeslop } from "./commands/deslop.js";
import { handleWeekly } from "./commands/weekly.js";
import { handleWhy } from "./commands/why.js";
import { handleHow } from "./commands/how.js";
import { handleArena } from "./commands/arena.js";
import { handleBlast } from "./commands/blast.js";
import { handleTdd } from "./commands/tdd.js";
import { handleBenny } from "./commands/benny.js";
import { checkDependencies } from "./utils.js";

const PLUGIN_NAME = "@ezxomp/pstack-suite";
const PLUGIN_VERSION = "1.0.0-ezxomp.0";

/** Workflow subcommand handlers — dispatched by the single "pstack" command router. */
interface SubcommandDef {
  name: string;
  description: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

const WORKFLOW_COMMANDS: SubcommandDef[] = [
  { name: "review", description: "Deep branch/PR review", handler: handleReview },
  { name: "pr-canvas", description: "Render PR diff as HTML review", handler: handlePrCanvas },
  { name: "quality", description: "Code quality audit", handler: handleQuality },
  { name: "docs", description: "Render architecture/API docs", handler: handleDocs },
  { name: "ship", description: "Review + verify + merge", handler: handleShip },
  { name: "ci", description: "Monitor/fix CI failures", handler: handleCi },
  { name: "pr", description: "Create branch + PR", handler: handlePr },
  { name: "verify", description: "Run smoke tests + type checks", handler: handleVerify },
  { name: "deslop", description: "Remove comments, dead code", handler: handleDeslop },
  { name: "weekly", description: "Weekly work summary", handler: handleWeekly },
  { name: "why", description: "Git archaeology investigation", handler: handleWhy },
  { name: "how", description: "Design critique", handler: handleHow },
  { name: "arena", description: "Multi-runner exploration", handler: handleArena },
  { name: "blast", description: "Blast radius analysis", handler: handleBlast },
  { name: "tdd", description: "TDD loop", handler: handleTdd },
  { name: "benny", description: "Issue triage automation", handler: handleBenny },
];

/** Resolve plugin settings: pi.settings first, then PluginManager fallback */
async function resolvePluginSettings(pi: ExtensionAPI): Promise<Record<string, unknown>> {
  const piSettings = (pi as unknown as { settings?: Record<string, unknown> }).settings;
  const settings: Record<string, unknown> = piSettings ? { ...piSettings } : {};

  return settings;
}

/** Build the merged info + menu help text */
function createHelpText(settings: Record<string, unknown>): string {
  const lines = [
    `pstack-suite v${PLUGIN_VERSION}`,
    `Plugin: ${PLUGIN_NAME}`,
    `Default model: ${settings.defaultModel || "not configured"}`,
    ``,
    `Utility commands (4):`,
    `  /pstack info   —  Show this help`,
    `  /pstack help   —  Show this help`,
    `  /pstack setup  —  Configure model-per-role mapping`,
    `  /pstack mode [playbook] [task]  —  Engineering mode with playbook routing`,
    ``,
    `Workflow commands (${WORKFLOW_COMMANDS.length}):`,
  ];
  for (const cmd of WORKFLOW_COMMANDS) {
    lines.push(`  /pstack ${cmd.name}  —  ${cmd.description}`);
  }
  lines.push(`23 playbooks — /pstack mode <playbook> [task]  |  /pstack <playbook> [task]`);
  return lines.join("\n");
}

let registeredCommandCount: number = 0;

export function getRegisteredCommandCount(): number {
  return registeredCommandCount;
}

/** Reset registration counter — for testing isolation */
export function resetRegisteredCommandCount(): void {
  registeredCommandCount = 0;
}

/** Notify backlog.md missing on first command invocation */
let backlogMissingNotified = false;
const BACKLOG_ERROR_MSG =
  "backlog.md CLI is required for pstack-suite.\n" +
  "Install: npm i -g backlog.md\n" +
  "Run /pstack setup for more information.";
function wrapWithBacklogCheck(
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
  backlogOk: boolean,
): (args: string, ctx: ExtensionCommandContext) => Promise<void> {
  if (backlogOk) return handler;
  return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    if (!backlogMissingNotified) {
      backlogMissingNotified = true;
      ctx.ui.notify(BACKLOG_ERROR_MSG, "error");
    }
    return handler(args, ctx);
  };
}

/**
 * Split args into the first token and the remainder while preserving the
 * original casing and spacing of the remainder.
 */
function splitFirstToken(input: string): { token: string; rest: string } {
  const trimmedStart = input.trimStart();
  const match = /^(\S+)([\s\S]*)$/.exec(trimmedStart);
  if (!match) return { token: "", rest: "" };
  let rest = match[2] ?? "";
  if (rest.startsWith(" ")) rest = rest.slice(1);
  return { token: match[1] ?? "", rest };
}

export default async function pstackSuite(pi: ExtensionAPI): Promise<void> {

  // Dependency checks at startup — soft deps warn via console, hard deps tracked
  const backlogOk = checkDependencies();

  const settings = await resolvePluginSettings(pi);
  const failures: string[] = [];

  // Register the mode command handler with plugin settings (passes defaultModel)
  const rawDefaultModel = settings.defaultModel;
  const baseModeOptions: HandleModeOptions = typeof rawDefaultModel === "string" && rawDefaultModel.length > 0
    ? { defaultModel: rawDefaultModel }
    : {};
  const sendTarget = pi as unknown as { sendUserMessage?: (text: string) => void };
  const modeHandler = handleModeWithDefaultModel({
    ...baseModeOptions,
    send: (text) => {
      sendTarget.sendUserMessage?.(text);
    },
  });

  // Single "pstack" command with in-handler subcommand routing.
  // OMP resolves only the first whitespace-delimited token after "/" via an
  // exact Map lookup, so exactly one registration ("pstack") can ever dispatch.
  async function pstackRouter(args: string, ctx: ExtensionCommandContext): Promise<void> {
    const trimmed = args.trim();
    if (trimmed === "" || trimmed === "help" || trimmed === "info") {
      ctx.ui.notify(createHelpText(settings), "info");
      return;
    }
    if (trimmed.startsWith("setup")) {
      await handleSetup(trimmed.slice("setup".length).trim(), ctx);
      return;
    }
    const { token, rest } = splitFirstToken(trimmed);
    if (token === "resume" || token === "--resume") {
      await modeHandler(args, ctx);
      return;
    }
    if (token === "mode") {
      await modeHandler(rest, ctx);
      return;
    }
    const workflow = WORKFLOW_COMMANDS.find((cmd) => cmd.name === token);
    if (workflow) {
      await workflow.handler(rest, ctx);
      return;
    }
    if (resolvePlaybookFromToken(token)) {
      await modeHandler(args, ctx);
      return;
    }
    const lines = [
      `Unknown pstack command or playbook: "${token}"`,
      "",
      "Subcommands: info, help, setup, mode",
      ...WORKFLOW_COMMANDS.map((cmd) => `  ${cmd.name} — ${cmd.description}`),
      "",
      "Available playbooks:",
      ...PLAYBOOKS.map((pb) => `  ${pb}`),
      "",
      "Usage: /pstack <subcommand|playbook> [task]",
    ];
    ctx.ui.notify(lines.join("\n"), "error");
  }

  try {
    pi.registerCommand("pstack", {
      description: "pstack suite — engineering playbooks, reviews, and automation",
      handler: wrapWithBacklogCheck(pstackRouter, backlogOk),
    });
    registeredCommandCount++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pstack-suite] Failed to register "pstack": ${message}`);
    failures.push("pstack");
  }

  // Log any registration failures
  if (failures.length > 0) {
    console.warn(
      `[pstack-suite] ${failures.length} command(s) failed to register: ${failures.join(", ")}`,
    );
  }

  // Recall/reflect hook: inject pstack context into recall and reflect queries
  try {
    pi.on("tool_call", (event) => {
      if (event.toolName !== "recall" && event.toolName !== "reflect") {
        return undefined;
      }
      const query = event.input.query;
      if (typeof query !== "string") {
        return undefined;
      }
      if (!query.toLowerCase().includes("pstack")) {
        const revised = query + " (pstack context: see backlog docs/decisions/research for current state)";
        return { input: { ...event.input, query: revised } };
      }
      return undefined;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pstack-suite] Failed to register recall/reflect hook: ${message}`);
  }

}
