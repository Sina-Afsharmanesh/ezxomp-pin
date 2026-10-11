import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { beginRun, saveRun, latestRun } from "../run.js";
import { loadPstackConfig, resolveRoleModelDetailed } from "../utils.js";
import { emitEvent } from "../events.js";
import { composePlaybookPrompt, extractSection, loadSkillBody } from "../playbook-dispatch.js";

const PLAYBOOKS = [
  "feature",
  "bug-fix",
  "investigation",
  "refactoring",
  "shipping",
  "autonomous-run",
  "opening-a-pr",
  "multi-phase-plan",
  "orchestrate",
  "hillclimb",
  "eval",
  "prototype",
  "perf-issue",
  "runtime-forensics",
  "trace-forensics",
  "visual-parity",
  "session-pickup",
  "pause-safely",
  "worktree-cleanup",
  "authoring-a-skill",
  "babysit",
  "autopilot-full",
  "autopilot-stack",
] as const;

type PlaybookName = (typeof PLAYBOOKS)[number];

const PLAYBOOK_ROLES: Record<PlaybookName, "architect" | "implementer" | "reviewer" | "writer"> = {
  // Architect
  "multi-phase-plan": "architect",
  orchestrate: "architect",
  "session-pickup": "architect",
  "pause-safely": "architect",
  investigation: "architect",
  // Reviewer
  shipping: "reviewer",
  "opening-a-pr": "reviewer",
  eval: "reviewer",
  // Writer
  "authoring-a-skill": "writer",
  // Implementer (everything else)
  feature: "implementer",
  "bug-fix": "implementer",
  refactoring: "implementer",
  "autonomous-run": "implementer",
  hillclimb: "implementer",
  prototype: "implementer",
  "perf-issue": "implementer",
  "runtime-forensics": "implementer",
  "trace-forensics": "implementer",
  "visual-parity": "implementer",
  "worktree-cleanup": "implementer",
  babysit: "implementer",
  "autopilot-full": "implementer",
  "autopilot-stack": "implementer",
};

const KEYWORD_MAP: Record<string, PlaybookName> = {
  bug: "bug-fix",
  fix: "bug-fix",
  bugfix: "bug-fix",
  feature: "feature",
  feat: "feature",
  investigation: "investigation",
  investigate: "investigation",
  probe: "investigation",
  refactor: "refactoring",
  clean: "refactoring",
  ship: "shipping",
  deploy: "shipping",
  release: "shipping",
  autonomous: "autonomous-run",
  "autonomous-run": "autonomous-run",
  pr: "opening-a-pr",
  pull: "opening-a-pr",
  "opening-a-pr": "opening-a-pr",
  plan: "multi-phase-plan",
  "multi-phase": "multi-phase-plan",
  orchestrate: "orchestrate",
  hillclimb: "hillclimb",
  eval: "eval",
  evaluate: "eval",
  prototype: "prototype",
  proto: "prototype",
  perf: "perf-issue",
  performance: "perf-issue",
  "perf-issue": "perf-issue",
  runtime: "runtime-forensics",
  "runtime-forensics": "runtime-forensics",
  trace: "trace-forensics",
  "trace-forensics": "trace-forensics",
  visual: "visual-parity",
  parity: "visual-parity",
  "visual-parity": "visual-parity",
  pickup: "session-pickup",
  resume: "session-pickup",
  "session-pickup": "session-pickup",
  pause: "pause-safely",
  "pause-safely": "pause-safely",
  cleanup: "worktree-cleanup",
  "worktree-cleanup": "worktree-cleanup",
  skill: "authoring-a-skill",
  "authoring-a-skill": "authoring-a-skill",
  babysit: "babysit",
  "autopilot-full": "autopilot-full",
  "autopilot-stack": "autopilot-stack",
  autopilot: "autopilot-full",
};

function resolvePlaybook(args: string): PlaybookName | undefined {
  const trimmed = args.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (PLAYBOOKS.includes(trimmed as PlaybookName)) return trimmed as PlaybookName;
  const key = KEYWORD_MAP[trimmed];
  if (key) return key;
  for (const [kw, pb] of Object.entries(KEYWORD_MAP)) {
    if (trimmed.includes(kw)) return pb;
  }
  return undefined;
}

/**
 * Parse explicit-task mode arguments.
 * "resume" / "--resume" pass through untouched (resume flow handled earlier).
 * Otherwise: lowercase first token = playbook candidate; remainder = task.
 */
export function parseModeArgs(args: string): { playbook?: string; task: string } {
  const trimmed = args.trim();
  if (trimmed === "resume" || trimmed === "--resume") {
    return { task: trimmed };
  }
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  const playbookCandidate = (tokens[0] ?? "").toLowerCase();
  const task = tokens.slice(1).join(" ").trim();
  return { ...(playbookCandidate ? { playbook: playbookCandidate } : {}), task };
}

/** Resolve a single command token to a playbook (exact name → keyword → substring on the token only). */
export function resolvePlaybookFromToken(token: string): PlaybookName | undefined {
  const t = token.trim().toLowerCase();
  if (!t) return undefined;
  if (PLAYBOOKS.includes(t as PlaybookName)) return t as PlaybookName;
  const key = KEYWORD_MAP[t];
  if (key) return key;
  for (const [kw, pb] of Object.entries(KEYWORD_MAP)) {
    if (t.includes(kw)) return pb;
  }
  return undefined;
}

/** Map lastConfirmedAction to next safe action */
export function nextSafeAction(lastConfirmedAction: string | undefined, playbook: string): string {
  if (!lastConfirmedAction) return "select/start";
  switch (lastConfirmedAction) {
    case "verify":
      return "push";
    case "push":
      if (playbook === "opening-a-pr") return "pr";
      return "pr/merge";
    case "pr":
      return "merge";
    default:
      return "continue";
  }
}

function isKnownPlaybook(args: string): boolean {
  const trimmed = args.trim().toLowerCase();
  if (!trimmed) return true;
  if (PLAYBOOKS.includes(trimmed as PlaybookName)) return true;
  if (KEYWORD_MAP[trimmed]) return true;
  for (const kw of Object.keys(KEYWORD_MAP)) {
    if (trimmed.includes(kw)) return true;
  }
  return false;
}

export interface HandleModeOptions {
  defaultModel?: string;
  /** Deliver a composed prompt to the LLM (injected for testing). */
  send?: (text: string) => void;
  /** Skill body loader override (injected for testing). */
  loadSkillBody?: (name: string) => string | null;
}

export function handleModeWithDefaultModel(
  options: HandleModeOptions,
): (args: string, ctx: ExtensionCommandContext) => Promise<void> {
  return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
    await handleMode(args, ctx, options);
  };
}

export async function handleMode(
  args: string,
  ctx: ExtensionCommandContext,
  options: HandleModeOptions = {},
): Promise<void> {
  const cwd = ctx.cwd;

  // Handle --resume or "resume" flag (read-only, no mutation)
  const trimmedArgs = args.trim().toLowerCase();
  if (trimmedArgs === "--resume" || trimmedArgs === "resume") {
    const rec = latestRun(cwd);
    if (!rec) {
      const lines = [
        "PSTACK MODE — Resume",
        "══════════════════════════════════════════════════════",
        "",
        "No previous run found.",
        "",
        "Start a new run: /pstack mode <playbook>",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
      return;
    }
    const nextAction = nextSafeAction(rec.lastConfirmedAction, rec.playbook);
    const lines = [
      "PSTACK MODE — Resume",
      "══════════════════════════════════════════════════════",
      "",
      `Playbook: ${rec.playbook}`,
      `Phase: ${rec.phase}`,
      `Status: ${rec.status}`,
      `Last confirmed action: ${rec.lastConfirmedAction ?? "(none)"}`,
      `Next safe action: ${nextAction}`,
      `Run ID: ${rec.runId}`,
      `Started: ${rec.startedAt}`,
      rec.finishedAt ? `Finished: ${rec.finishedAt}` : "",
      "",
      "Run history:",
    ];
    if (rec.actions.length) {
      for (const a of rec.actions) {
        const marker = a.action === rec.lastConfirmedAction ? " ◀" : "";
        lines.push(`  ${a.result === "ok" ? "✓" : "✗"} ${a.action}${a.detail ? ` (${a.detail})` : ""}${marker}`);
      }
    } else {
      lines.push("  (no actions yet)");
    }
    lines.push("");
    lines.push("Resume: /pstack mode " + rec.playbook);

    ctx.ui.notify(lines.join("\n").replace(/\n$/, ""), "info");
    if (rec.lastConfirmedAction) { try { emitEvent({ type: "check", at: new Date().toISOString(), meta: { playbook: rec.playbook }, payload: { check: "last_confirmed_action", status: "ok", detail: rec.lastConfirmedAction } }); } catch {} }
    return;
  }

  // Explicit-task dispatch: "<playbook> <task...>" sends the composed prompt to the LLM
  const parsed = parseModeArgs(args);
  if (parsed.task.length > 0 && parsed.playbook !== undefined) {
    const playbookToken = parsed.playbook;
    const selectedPlaybook = resolvePlaybookFromToken(playbookToken);
    if (!selectedPlaybook) {
      const lines = [
        `Unknown playbook: "${playbookToken}"`,
        "",
        "Available playbooks:",
        ...PLAYBOOKS.map((pb) => `  ${pb}`),
        "",
        "Select: /pstack mode <playbook>",
      ];
      ctx.ui.notify(lines.join("\n"), "error");
      return;
    }
    const primaryRoleDispatch: "architect" | "implementer" | "reviewer" | "writer" = PLAYBOOK_ROLES[selectedPlaybook];
    const resolvedModelDispatch = resolveRoleModelDetailed(cwd, primaryRoleDispatch, options.defaultModel);
    const rec = resolvedModelDispatch
      ? beginRun({ playbook: selectedPlaybook, phase: "dispatched", target: cwd, resolvedModel: { role: primaryRoleDispatch, model: resolvedModelDispatch.model, source: resolvedModelDispatch.source } })
      : beginRun({ playbook: selectedPlaybook, phase: "dispatched", target: cwd });
    saveRun(rec, cwd);

    const loader = options.loadSkillBody ?? loadSkillBody;
    const body = loader(selectedPlaybook);
    if (body === null) {
      ctx.ui.notify(`pstack mode: playbook skill body not found at skills/${selectedPlaybook}/SKILL.md`, "error");
      return;
    }
    const principles = extractSection(loader("mode") ?? "", "## Core Principles");
    options.send?.(composePlaybookPrompt({
      playbook: selectedPlaybook,
      role: primaryRoleDispatch,
      model: resolvedModelDispatch?.model,
      skillBody: body,
      principles,
      task: parsed.task,
    }));
    try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: selectedPlaybook }, payload: { phase: "dispatched", playbook: selectedPlaybook } }); } catch {}
    ctx.ui.notify(`pstack mode: '${selectedPlaybook}' dispatched (${primaryRoleDispatch}) — task: ${parsed.task}`, "info");
    return;
  }

  // "help" is treated as menu (no-arg behavior)
  if (trimmedArgs === "help") {
    // fall through to menu
  }
  // Handle unknown playbook name — error, no run started
  else if (args.trim().length > 0 && !isKnownPlaybook(args)) {
    const lines = [
      `Unknown playbook: "${args.trim()}"`,
      "",
      "Available playbooks:",
      ...PLAYBOOKS.map((pb) => `  ${pb}`),
      "",
      "Select: /pstack mode <playbook>",
    ];
    ctx.ui.notify(lines.join("\n"), "error");
    return;
  }

  const selected = resolvePlaybook(args);
  const config = loadPstackConfig(cwd);

  // Import overlay for confirmation
  const { showConfirmOverlay } = await import("../overlay/confirm-overlay.js");

  // Resolve role from playbook mapping; menu mode defaults to implementer
  const primaryRole: "architect" | "implementer" | "reviewer" | "writer" = selected ? PLAYBOOK_ROLES[selected] : "implementer";
  const resolvedModel = resolveRoleModelDetailed(cwd, primaryRole, options.defaultModel);

  // Selection → run state: beginRun + saveRun so selection is observable
  if (selected && args.trim().length > 0) {
    const rec = resolvedModel
      ? beginRun({ playbook: selected, phase: "selected", target: cwd, resolvedModel: { role: primaryRole, model: resolvedModel.model, source: resolvedModel.source } })
      : beginRun({ playbook: selected, phase: "selected", target: cwd });
    saveRun(rec, cwd);
    try { emitEvent({ type: "phase", at: new Date().toISOString(), meta: { playbook: selected }, payload: { phase: "selected", playbook: selected } }); } catch {}

    // Show confirmation overlay when TUI available
    const confirmed = await showConfirmOverlay(ctx, {
      title: "Playbook Selection",
      lines: [
        `Playbook: ${selected}`,
        `Role: ${primaryRole}`,
        resolvedModel ? `Model: ${resolvedModel.model} (${resolvedModel.source})` : "Model: N/A",
        "",
        "Start this playbook?",
      ],
      confirmLabel: "Start",
      cancelLabel: "Cancel",
    });
    if (confirmed === false) {
      ctx.ui.notify(`pstack mode: playbook selection cancelled for '${selected}'`, "info");
      return;
    }
  }

  // Model info line — raw config roles for reference
  const modelLine = config
    ? Object.entries(config.roles)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v!}`)
        .join(", ")
    : "not configured";

  const lines: string[] = [];
  lines.push("PSTACK MODE — Engineering Playbook Routing");
  lines.push("══════════════════════════════════════════════════════");
  lines.push("");

  if (selected) {
    lines.push(`► Selected: ${selected}`);
    lines.push(`Role: ${primaryRole}`);
    if (resolvedModel) {
      lines.push(`Model: ${resolvedModel.model} (source: ${resolvedModel.source})`);
    } else {
      lines.push("Model: unavailable");
    }
    lines.push("");
    lines.push(`Confirm with: /pstack mode ${selected}`);
    lines.push("Or pick another from the menu below.");
  }

  if (modelLine) {
    lines.push("");
    lines.push(`Models: ${modelLine}`);
  }

  lines.push("");
  lines.push("Available playbooks (23):");
  lines.push("");

  for (const pb of PLAYBOOKS) {
    const marker = pb === selected ? " ◀" : "";
    lines.push(`  ${pb}${marker}`);
  }

  lines.push("");
  lines.push("Select: /pstack mode <playbook>");
  lines.push("Resume: /pstack mode --resume");
  lines.push("");

  lines.push("⚠ Guidance notes:");
  lines.push("  • Irreversible actions will pause for human confirmation");
  lines.push("  • Parallel work runs in isolated git worktrees per task branch");
  lines.push("  • Use /pstack mode with no args to see this menu anytime");

  ctx.ui.notify(lines.join("\n"), "info");
}

// Re-exported for testing
export { PLAYBOOK_ROLES, PLAYBOOKS };
