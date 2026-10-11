/**
 * src/commands.ts — command surface (WU-8).
 *
 * Single command `pi.registerCommand("gsd-loop", ...)` with strict
 * subcommand parsing (flags --verbose, --dry-run, --wedge <id>,
 * --brief/--brief-file/--verify/--retries/--subagent). Unknown subcommand
 * and bare freeform → usage text. All behavior via the core.ts facade.
 */
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import * as core from "./core.js";

export const GSD_LOOP_COMMAND_NAME = "gsd-loop";

export const SUBCOMMANDS = [
 "", // smart entry
 "start",
 "next",
 "stop",
 "pause",
 "resume",
 "status",
 "enqueue",
 "list",
] as const;

export interface ParsedArgs {
 subcommand: string;
 flags: Record<string, string | boolean>;
 positional: string[];
}

/** Flags that take a value (next token). */
const VALUE_FLAGS: Record<string, true> = {
 wedge: true,
 brief: true,
 "brief-file": true,
 verify: true,
 retries: true,
 subagent: true,
};

/** Strict subcommand parse; throws Error with usage text on unknown input. */
export function parseArgs(args: string): ParsedArgs {
 const tokens = args.trim().split(/\s+/).filter(Boolean);
 const parsed: ParsedArgs = { subcommand: "", flags: {}, positional: [] };
 if (tokens.length && !tokens[0].startsWith("--")) {
  const sub = tokens.shift()!;
  if (!(SUBCOMMANDS as readonly string[]).includes(sub)) {
   throw new Error(usageText(`Unknown subcommand: "${sub}"`));
  }
  parsed.subcommand = sub;
 } else if (tokens.length) {
  // bare freeform (no subcommand, starts with a flag-looking token or words) — smart entry only takes flags
  throw new Error(usageText(`Unrecognized input: "${args.trim()}"`));
 }
 for (let i = 0; i < tokens.length; i++) {
  const token = tokens[i];
  if (!token.startsWith("--")) {
   parsed.positional.push(token);
   continue;
  }
  const flag = token.slice(2);
  if (VALUE_FLAGS[flag]) {
   let value = tokens[++i];
   if (value === undefined) {
    // --subagent optionally names an agent; bare --subagent is boolean.
    if (flag === "subagent") {
     parsed.flags[flag] = true;
     continue;
    }
    throw new Error(usageText(`Flag --${flag} requires a value`));
   }
   // The host passes the raw input string; quoted values keep their quotes.
   if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'"))) {
    // join until the matching close quote
    const quote = value[0];
    while (!value.endsWith(quote) || value.length < 2) {
     const next = tokens[++i];
     if (next === undefined) break;
     value += ` ${next}`;
    }
    value = value.slice(1, value.endsWith(quote) ? -1 : undefined);
   }
   parsed.flags[flag] = value;
  } else {
   parsed.flags[flag] = true;
  }
 }
 return parsed;
}

export function usageText(prefix?: string): string {
 const lines = [
  ...(prefix ? [prefix, ""] : []),
  "Usage: /gsd-loop [subcommand] [flags]",
  "",
  "  /gsd-loop                        smart entry (wedge / running / queue summary)",
  "  /gsd-loop start [--verbose]      activate the auto loop driver",
  "  /gsd-loop next [--dry-run]       step mode: one unit, then auto-pause",
  "  /gsd-loop stop                   graceful stop (foreign lock → STOP flag)",
  "  /gsd-loop pause [reason words]   pause with reason",
  "  /gsd-loop resume [--wedge <id>]  resume; --wedge acknowledges the wedge",
  "  /gsd-loop status                 rendered run/queue/counters status",
  "  /gsd-loop enqueue <id> <title> [--brief <text>|--brief-file <path>] [--verify \"<cmd>\"] [--retries <n>] [--subagent <agent>]",
  "  /gsd-loop list                   tabular queue view",
 ];
 return lines.join("\n");
}

function numberFlag(parsed: ParsedArgs, name: string): number | undefined {
 const raw = parsed.flags[name];
 if (typeof raw !== "string") return undefined;
 // Lexically strict: only plain digit strings. "1e2", "0x10", "+1" are
 // usage errors, not silent defaults.
 if (!/^[0-9]+$/.test(raw)) throw new Error(usageText(`Flag --${name} requires a non-negative integer (got "${raw}")`));
 return Number(raw);
}

/** `/gsd-loop` smart entry: wedge → wedge hint; running/foreign → status; else queue + start hint. */
export function smartEntry(): core.FacadeResult {
 const s = core.loadOrCreateState();
 const wedge = s.wedge;
 if (wedge && !wedge.acknowledged) {
  return {
   text: `WEDGE ACTIVE: ${wedge.id} (unit ${wedge.unitId}, signature ${wedge.signature})\nSanctioned re-entry: /gsd-loop resume --wedge ${wedge.id}`,
   details: { wedge, branch: "wedge" },
  };
 }
 if (s.run.status === "running") {
  const status = core.doStatus();
  return {
   text: `gsd-loop is RUNNING.\n\n${status.text}\n\nOptions: /gsd-loop pause · /gsd-loop stop · keep calling gsd_loop_advance.`,
   details: { branch: "running", ...(status.details as object) },
  };
 }
 const queue = s.queue.filter((u) => u.status === "pending").length;
 if (core.isForeignLockHeld()) {
  const lock = core.readLockInfo();
  return {
   text: `gsd-loop idle, but a live foreign session (pid ${lock?.ownerPid}) holds loop.lock.\n/gsd-loop stop writes the STOP flag for that session; otherwise wait for it to finish.`,
   details: { branch: "foreign-lock", status: s.run.status, pending: queue },
  };
 }
 return {
  text: `gsd-loop idle (${s.run.status}). ${queue} pending unit(s) in queue.\nStart the loop: /gsd-loop start — or enqueue units first: /gsd-loop enqueue <id> <title> --brief "<text>"`,
  details: { branch: "fresh", status: s.run.status, pending: queue },
 };
}

/** Facade op dispatch for one parsed subcommand. */
export function executeSubcommand(parsed: ParsedArgs): core.FacadeResult | Promise<core.FacadeResult> {
 switch (parsed.subcommand) {
  case "":
   return smartEntry();
  case "start":
   return core.doStart({ verbose: parsed.flags.verbose === true, mode: "auto" });
  case "next":
   return core.doNext({ dryRun: parsed.flags["dry-run"] === true });
  case "stop":
   return core.doStop();
  case "pause":
   return core.doPause({
    reason: parsed.positional.length ? parsed.positional.join(" ") : undefined,
   });
  case "resume":
   return core.doResume({ wedge: typeof parsed.flags.wedge === "string" ? parsed.flags.wedge : undefined });
  case "status":
   return core.doStatus();
  case "enqueue": {
   const [id, title] = parsed.positional;
   if (!id || !title) throw new Error(usageText("enqueue requires <id> <title>"));
   return core.doEnqueue({
    id,
    title,
    brief: typeof parsed.flags.brief === "string" ? parsed.flags.brief : undefined,
    briefFile: typeof parsed.flags["brief-file"] === "string" ? parsed.flags["brief-file"] : undefined,
    verifyCommand: typeof parsed.flags.verify === "string" ? parsed.flags.verify : undefined,
    maxRetries: numberFlag(parsed, "retries"),
    dispatch: parsed.flags.subagent !== undefined ? "subagent" : undefined,
    subagentAgent: typeof parsed.flags.subagent === "string" ? parsed.flags.subagent : undefined,
   });
  }
  case "list":
   return core.doList();
  default:
   throw new Error(usageText());
 }
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning" | "error"): void {
 // Headless/RPC contexts must not receive RPC-visible UI calls.
 if ((ctx as { hasUI?: boolean }).hasUI === false) return;
 if (typeof ctx.ui?.notify === "function") ctx.ui.notify(message, level);
}

/** Registers the gsd-loop command on pi. */
export function registerGsdLoopCommand(pi: ExtensionAPI): void {
 pi.registerCommand(GSD_LOOP_COMMAND_NAME, {
  description: "GSD loop kernel: start/stop/pause/resume/advance the autonomous unit queue",
  async handler(input: string, ctx: ExtensionContext): Promise<void> {
   core.setFacadeContext({ cwd: ctx.cwd, hasUI: ctx.hasUI });
   let result: core.FacadeResult;
   try {
    const parsed = parseArgs(input ?? "");
    result = await executeSubcommand(parsed);
   } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify(ctx, message, "error");
    return;
   }
   notify(ctx, result.text, result.isError ? "error" : "info");
  },
 });
}
