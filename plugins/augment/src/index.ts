import type { ExtensionAPI, ExtensionContext, RegisteredCommand } from "@oh-my-pi/pi-coding-agent";
import { PluginManager } from "@oh-my-pi/pi-coding-agent/extensibility/plugins";
import { EXTENSION_COMMAND } from "./constants.js";
import { resolveAugmentSettings } from "./settings.js";
import { openAugmentSettings } from "./settings-overlay.js";
export default function augmentExtension(pi: ExtensionAPI): void {
  const augmentCommand: Omit<RegisteredCommand, "name"> = {
    description: "Enhance a prompt using the Prompt Leverage framework",
    async handler(args, ctx) {
      const draft = args.trim();
      if (!draft) {
        ctx.ui.notify(`Usage: /${EXTENSION_COMMAND} <your prompt>`, "info");
        return;
      }

      try {
        const { enhance } = await import("./enhance.js");
        const result = await enhance(ctx, pi.exec.bind(pi), draft);
        if (!result) {
          ctx.ui.notify("Enhancement cancelled.", "info");
          return;
        }

        if (await shouldReview(ctx)) {
          ctx.ui.setEditorText(result.enhanced);
          ctx.ui.notify(
            `Enhanced (${result.intent}, ${result.mode}, ${result.family}). Review and press Enter.`,
            "info",
          );
        } else {
          pi.sendUserMessage(result.enhanced);
          ctx.ui.notify(
            `Enhanced (${result.intent}, ${result.mode}, ${result.family}). Sent.`,
            "info",
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Enhancement failed.";
        ctx.ui.notify(message, "error");
      }
    },
  };

  pi.registerCommand(EXTENSION_COMMAND, augmentCommand);
  pi.registerCommand("aug", {
    ...augmentCommand,
    description: "Short alias for /augment",
  });

  pi.registerCommand("augment-settings", {
    description: "Configure pi-augment enhancement settings",
    async handler(_args, ctx) {
      await openAugmentSettings(ctx);
    },
  });
}
async function shouldReview(ctx: ExtensionContext): Promise<boolean> {
  const persisted = await new PluginManager(ctx.cwd)
    .getPluginSettings("@ezxomp/augment")
    .catch(() => ({}));
  return resolveAugmentSettings(persisted).reviewBeforeSend;
}
