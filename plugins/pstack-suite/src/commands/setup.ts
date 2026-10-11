import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { loadPstackConfig, savePstackConfig, detectCursorMigration, type PstackModelsConfig } from "../utils.js";

/** Configure model-per-role mapping
 * @implements TASK-37.4
 */
export async function handleSetup(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const projectRoot = ctx.cwd;
  const argParts = args.trim().split(/\s+/);
  const isFirstArg = argParts[0]?.toLowerCase();

  // "setup edit" mode
  if (isFirstArg === "edit") {
    await handleSetupEdit(projectRoot, ctx, argParts.slice(1));
    return;
  }

  // Default: create or show config
  const existingConfig = loadPstackConfig(projectRoot);

  if (existingConfig) {
    // Config exists — show current state and offer edit
    const roleEntries = Object.entries(existingConfig.roles)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`);
    const lines = [
      `pstack-models.json already exists at .omp/pstack-models.json`,
      ``,
      `Current config:`,
      `  default: ${existingConfig.default || "(not set)"}`,
      ``,
      `Roles:`,
      ...roleEntries,
      ``,
      `Run "pstack setup edit" to update.`,
    ];
    ctx.ui.notify(lines.join("\n"), "info");
  } else {
    // No config — create default with placeholder role mappings (empty = session default)
    const config: PstackModelsConfig = {
      roles: {
        architect: '',
        implementer: '',
        reviewer: '',
        writer: '',
      },
      default: '',
    };

    // Auto-detect Cursor migration
    const cursorRoles = detectCursorMigration();
    if (cursorRoles) {
      // Merge Cursor role mappings into the new config
      if (cursorRoles.architect) config.roles.architect = cursorRoles.architect;
      if (cursorRoles.implementer) config.roles.implementer = cursorRoles.implementer;
      if (cursorRoles.reviewer) config.roles.reviewer = cursorRoles.reviewer;
      if (cursorRoles.writer) config.roles.writer = cursorRoles.writer;
      if (cursorRoles.default) config.default = cursorRoles.default;
    }

    savePstackConfig(projectRoot, config);

    let msg: string[] = [
      `Created .omp/pstack-models.json`,
      ``,
      `Config:`,
      `  default: ${config.default || "(session default)"}`,
      ``,
      `Roles:`,
      ...Object.entries(config.roles).map(([k, v]) => `  ${k}: ${v || "(session default)"}`),
      ``,
      `Run "pstack setup edit" to update.`,
    ];

    if (cursorRoles) {
      msg.unshift("Migrated roles from ~/.cursor/rules/pstack-models.mdc");
      msg.push("");
    }

    ctx.ui.notify(msg.join("\n"), "info");
  }
}

/** Edit mode: show current config and rewrite */
async function handleSetupEdit(
  projectRoot: string,
  ctx: ExtensionCommandContext,
  remainingArgs: string[],
): Promise<void> {
  const config = loadPstackConfig(projectRoot);
  if (!config) {
    ctx.ui.notify('No config found at .omp/pstack-models.json. Run "pstack setup" first.', "error");
    return;
  }

  // Parse key=value args from remaining args
  const updates: Record<string, string> = {};
  for (const arg of remainingArgs) {
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0) {
      const key = arg.substring(0, eqIdx).trim();
      const value = arg.substring(eqIdx + 1).trim();
      if (key === "default") {
        updates.default = value;
      } else {
        updates[key] = value;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    // No updates provided — just show current config
    const roleEntries = Object.entries(config.roles)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k}: ${v}`);
    const lines = [
      `Current pstack-models.json:`,
      `  default: ${config.default || "(not set)"}`,
      ``,
      `Roles:`,
      ...roleEntries,
      ``,
      `Update: pstack setup edit <role>=<model> [default=<model>]`,
    ];
    ctx.ui.notify(lines.join("\n"), "info");
    return;
  }

  // Apply updates
  if ("default" in updates) {
    if (updates["default"]) { config.default = updates["default"]; } else { delete config.default; }
    delete updates["default"];
  }
  for (const [role, model] of Object.entries(updates)) {
    config.roles[role] = model;
  }

  savePstackConfig(projectRoot, config);
  ctx.ui.notify(`Updated pstack-models.json with: ${Object.keys(updates).join(", ")}`, "info");
}
