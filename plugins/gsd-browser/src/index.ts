/**
 * @ezxomp/gsd-browser — entry point.
 *
 * Registers the six `gsd_browser_*` tools, the `gsd-browser` command, and
 * disposes the CDP browser manager on session shutdown. Tools are registered
 * on-demand; the browser backend starts lazily on the first CDP-needing call.
 */
import { registerGsdBrowserTools } from "./tools.js";
import { registerGsdBrowserCommand } from "./commands.js";
import { browserManager } from "./cdp/browser.js";

export default function gsdBrowser(pi: {
 registerTool?: (definition: unknown) => void;
 registerCommand?: (name: string, config: {
  description?: string;
  handler: (args: string, ctx: {
   cwd: string;
   ui?: { notify: (message: string, type?: "info" | "warning" | "error") => void };
  }) => Promise<void>;
  getArgumentCompletions?: (args: string) => string[];
 }) => void;
 on?: (event: "session_shutdown", handler: () => void | Promise<void>) => void;
}): void {
 // Defensive guard (compact-eng precedent): skip when the host does not
 // provide the extension registration surface.
 if (typeof pi.registerTool !== "function") {
  return;
 }

 // Register the six gsd_browser_* tools with default settings provider
 registerGsdBrowserTools(pi);

 // Register the /gsd-browser command
 if (typeof pi.registerCommand === "function") {
  registerGsdBrowserCommand(pi);
 }

 // Dispose browser manager on session shutdown
 if (typeof pi.on === "function") {
  pi.on("session_shutdown", () => browserManager.dispose());
 }
}
