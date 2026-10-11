/**
 * @ezxomp/gsd-web — OMP-native port of the GSD-Pi Web UI.
 *
 * W6/W8 wiring: /gsd-web command (start|stop|status|open|logs|url|set|unset),
 * three gsd_web_* tools, stale-registry sweep on session start, owned-instance
 * teardown on session shutdown (unless daemonMode).
 *
 * Server lifecycle: the standalone Next server (web/.next/standalone, built by
 * `npm run build` in web/) is spawned detached and registered in
 * ~/.omp/gsd-web/instances.json — it survives the OMP session by design.
 */

import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { readFileSync } from "node:fs";
import {
 detectTailnetIp,
 isPidAlive,
 launchWebServer,
 openInBrowser,
 readLogs,
 readRegistry,
 readTokenForInstance,
 resolveBindHost,
 sweepStale,
 stateRoot,
 stopInstance,
} from "./host-launcher.ts";
import type { WebInstance } from "./host-launcher.ts";
import { loadSettings, parseSettingValue } from "./settings.ts";

const COMMAND_DESCRIPTION = [
 "GSD Web UI:",
 "  start [--localhost] [path]  launch the server (default: tailnet IP if present, else loopback)",
 "  stop [port|all]             stop a server (default: this project's)",
 "  status [port]               list running instances",
 "  open [port]                 open the UI in a browser",
 "  url [port]                  print the token-bearing URL",
 "  logs [port]                 tail the server log",
 "  set <key> <value>           persist a setting (host, port, noAuth, daemonMode, openBrowser, allowedOrigins, ompBinary)",
 "  unset <key>                 clear a setting",
].join("\n");

function findInstance(matcher: { port?: number; projectCwd?: string } = {}): WebInstance | undefined {
 const instances = sweepStale();
 if (matcher.port !== undefined) {
  return instances.find((entry) => entry.port === matcher.port);
 }
 if (matcher.projectCwd) {
  return instances.find((entry) => entry.projectCwd === matcher.projectCwd);
 }
 return instances[0];
}

function formatStatus(instances: WebInstance[]): string {
 if (instances.length === 0) {
  return `No gsd-web instances running. Start one with /gsd-web start${detectTailnetIp() ? " (tailnet IP detected — binds tailnet-wide by default; use --localhost for loopback only)" : ""}`;
 }
 return instances
  .map(
   (entry) =>
    `port ${entry.port} · http://${entry.host}:${entry.port}/ · pid ${entry.pid}${isPidAlive(entry.pid) ? "" : " (dead)"} · project ${entry.projectCwd} · started ${entry.startedAt}${entry.authDisabled ? " · NO AUTH" : ""}${entry.daemonMode ? " · daemon" : ""}`,
  )
  .join("\n");
}

export default function gsdWeb(pi: ExtensionAPI): void {
 pi.setLabel("GSD Web");

 pi.registerCommand("gsd-web", {
  description: COMMAND_DESCRIPTION,
  async handler(args: string, ctx: ExtensionCommandContext) {
   const tokens = args.trim().split(/\s+/).filter(Boolean);
   const action = tokens[0] ?? "status";
   const flags = tokens.filter((t) => t.startsWith("--"));
   const positional = tokens.filter((t) => !t.startsWith("--")).slice(1);
   const forceLocalhost = flags.includes("--localhost");
   const notify = (message: string, level: "info" | "warning" | "error" = "info") => ctx.ui.notify(message, level);

   try {
    switch (action) {
     case "start": {
      const projectCwd = positional[0] ?? ctx.cwd;
      const settings = await loadSettings(ctx.cwd);
      const result = await launchWebServer({
       settings,
       projectCwd,
       forceLocalhost,
       portOverride: positional[1] ? Number.parseInt(positional[1], 10) : undefined,
      });
      notify(
       `GSD Web UI: ${result.url}\nBind: ${result.instance.host}:${result.instance.port}${forceLocalhost ? " (forced loopback)" : ""}\nState: ${stateRoot()}`,
       "info",
      );
      if (settings.openBrowser) openInBrowser(result.url);
      return;
     }
     case "stop": {
      const target = positional[0];
      if (target === "all") {
       const instances = sweepStale();
       const results = await Promise.all(instances.map((entry) => stopInstance(entry)));
       notify(`Stopped ${results.filter((r) => r === "stopped").length} instance(s).`, "info");
       return;
      }
      const port = target ? Number.parseInt(target, 10) : undefined;
      const instance = findInstance({ port, projectCwd: ctx.cwd }) ?? findInstance({ port });
      if (!instance) {
       notify("No matching gsd-web instance.", "warning");
       return;
      }
      const outcome = await stopInstance(instance);
      notify(`gsd-web on port ${instance.port}: ${outcome}.`, "info");
      return;
     }
     case "status": {
      notify(formatStatus(sweepStale()), "info");
      return;
     }
     case "open": {
      const port = positional[0] ? Number.parseInt(positional[0], 10) : undefined;
      const instance = findInstance({ port, projectCwd: ctx.cwd }) ?? findInstance({ port });
      if (!instance) {
       notify("No running gsd-web instance. Start one with /gsd-web start.", "warning");
       return;
      }
      const url = `http://${instance.host}:${instance.port}/`;
      const opened = openInBrowser(url);
      notify(opened ? `Opened ${url}` : `Could not open a browser. URL: ${url}`, opened ? "info" : "warning");
      return;
     }
     case "url": {
      const port = positional[0] ? Number.parseInt(positional[0], 10) : undefined;
      const instance = findInstance({ port, projectCwd: ctx.cwd }) ?? findInstance({ port });
      if (!instance) {
       notify("No running gsd-web instance.", "warning");
       return;
      }
      notify(instanceUrl(instance), "info");
      return;
     }
     case "logs": {
      const port = positional[0] ? Number.parseInt(positional[0], 10) : undefined;
      const instance = findInstance({ port, projectCwd: ctx.cwd }) ?? findInstance({ port });
      if (!instance) {
       notify("No running gsd-web instance.", "warning");
       return;
      }
      notify(readLogs(instance), "info");
      return;
     }
     case "set":
     case "unset": {
      const manager = new PluginManager(ctx.cwd);
      const key = positional[0];
      if (!key) {
       notify("Usage: /gsd-web set <key> <value>. Known keys: host, port, noAuth, daemonMode, openBrowser, allowedOrigins, ompBinary, nodeBinary, devRoot", "warning");
       return;
      }
      if (action === "unset") {
       await manager.deletePluginSetting(PLUGIN_NAME_KEY, key);
       notify(`Unset ${key}.`, "info");
       return;
      }
      const value = positional[1];
      if (value === undefined) {
       notify("Usage: /gsd-web set <key> <value>", "warning");
       return;
      }
      await manager.setPluginSetting(PLUGIN_NAME_KEY, key, parseSettingValue(value));
      notify(`Set ${key} = ${parseSettingValue(value)}.`, "info");
      return;
     }
     default:
      notify(`Unknown action "${action}".\n${COMMAND_DESCRIPTION}`, "warning");
    }
   } catch (error) {
    notify(`gsd-web: ${error instanceof Error ? error.message : String(error)}`, "error");
   }
  },
 });

 registerTools(pi);

 // session hooks: stale sweep only — never auto-start. Guarded: fake-pi smoke
 // harnesses register only the command surface.
 if (typeof pi.on === "function") {
  pi.on("session_start", () => {
   sweepStale();
  });

  // session_shutdown: owned-instance teardown is deliberately NOT automatic:
  // the server is designed to outlive the session (daemonMode / tailnet use).
  // A sweep keeps the registry honest; servers keep running.
  pi.on("session_shutdown", () => {
   sweepStale();
  });
 }
}

const PLUGIN_NAME_KEY = "@ezxomp/gsd-web";

function instanceUrl(instance: WebInstance): string {
 const base = `http://${instance.host === "localhost" ? "127.0.0.1" : instance.host}:${instance.port}/`;
 if (instance.authDisabled) return base;
 const token = readTokenFor(instance);
 return token
  ? `${base}#token=${token}`
  : `${base} (token unavailable outside Linux — restart via /gsd-web start to mint a fresh URL)`;
}

const readTokenFor = readTokenForInstance;

function registerTools(pi: ExtensionAPI): void {
 if (typeof pi.registerTool !== "function" || !pi.typebox?.Type) return;
 const Type = pi.typebox.Type;

 pi.registerTool({
  name: "gsd_web_start",
  label: "GSD Web Start",
  description:
   "Launch the GSD Web UI server (detached Next standalone). Binds the tailnet IP by default when a tailscale interface exists (reachable from other tailnet devices); pass localhost: true to force loopback. Returns the token-bearing URL.",
  parameters: Type.Object({
   projectCwd: Type.Optional(Type.String({ description: "Project directory the UI manages. Defaults to the current session cwd." })),
   localhost: Type.Optional(Type.Boolean({ description: "Force loopback bind (127.0.0.1) instead of the tailnet-first default." })),
   port: Type.Optional(Type.Number({ description: "Explicit port. 0/omitted = reserve a random free port." })),
  }),
  approval: "exec",
  async execute(_id, params, _signal, _onUpdate, ctx) {
   const settings = await loadSettings(ctx.cwd);
   const result = await launchWebServer({
    settings,
    projectCwd: params.projectCwd ?? ctx.cwd,
    forceLocalhost: params.localhost === true,
    portOverride: params.port,
   });
   const text = `GSD Web UI running: ${result.url}\nBind ${result.instance.host}:${result.instance.port} · pid ${result.instance.pid} · state ${stateRoot()}`;
   return { content: [{ type: "text", text }], details: result.instance };
  },
 });

 pi.registerTool({
  name: "gsd_web_stop",
  label: "GSD Web Stop",
  description: "Stop a running GSD Web UI server (SIGTERM, escalating to SIGKILL). Stops the caller's project instance unless a port or all is specified.",
  parameters: Type.Object({
   port: Type.Optional(Type.Number({ description: "Stop the instance bound to this port." })),
   all: Type.Optional(Type.Boolean({ description: "Stop every running gsd-web instance." })),
  }),
  approval: "exec",
  async execute(_id, params, _signal, _onUpdate, _ctx) {
   if (params.all === true) {
    const instances = sweepStale();
    const results = await Promise.all(instances.map((entry) => stopInstance(entry)));
    const text = `Stopped ${results.filter((r) => r === "stopped").length}/${instances.length} instance(s).`;
    return { content: [{ type: "text", text }], details: { stopped: results } };
   }
   const instances = sweepStale();
   const instance = (params.port !== undefined ? instances.find((e) => e.port === params.port) : undefined)
    ?? instances[0];
   if (!instance) {
    return { content: [{ type: "text", text: "No running gsd-web instance." }], details: null };
   }
   const outcome = await stopInstance(instance);
   const text = `gsd-web on port ${instance.port}: ${outcome}.`;
   return { content: [{ type: "text", text }], details: { port: instance.port, outcome } };
  },
 });

 pi.registerTool({
  name: "gsd_web_status",
  label: "GSD Web Status",
  description:
   "Report running GSD Web UI instances: bind host/port, pid liveness, project, daemon mode, auth state, and the tailnet/loopback bind decision for the next start.",
  parameters: Type.Object({}),
  approval: "read",
  async execute(_id, _params, _signal, _onUpdate, _ctx) {
   const instances = readRegistry();
   const alive = sweepStale();
   const bind = resolveBindHost(undefined, false);
   const text = `${formatStatus(alive)}\nNext start binds: ${bind.host} (${bind.source})${detectTailnetIp() ? ` · tailnet IP ${detectTailnetIp()}` : ""}`;
   return { content: [{ type: "text", text }], details: { instances, alive, nextBind: bind } };
  },
 });
}
