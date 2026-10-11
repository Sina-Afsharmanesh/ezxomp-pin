// Shared playbook dispatch helpers — load bundled SKILL.md bodies and compose
// LLM prompts for explicit-task playbook invocation (/pstack mode <pb> <task>).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load the body of a bundled playbook skill: <skillsDir>/<skillName>/SKILL.md,
 * YAML frontmatter stripped. Returns null when missing or unreadable.
 */
export function loadSkillBody(skillName: string, skillsDir?: string): string | null {
  const dir = skillsDir ?? path.resolve(MODULE_DIR, "../skills");
  try {
    const raw = fs.readFileSync(path.join(dir, skillName, "SKILL.md"), "utf-8");
    return raw.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, "");
  } catch {
    return null;
  }
}

/**
 * Extract the text under a "## Heading" line up to the next "## " heading
 * (or EOF), trimmed. Returns null when the heading is absent.
 */
export function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  // Match the heading exactly or with an annotation suffix ("## Core
  // Principles (10)") so drift can never silently drop the section.
  const start = lines.findIndex(
    (line) => line.trim() === heading || line.trim().startsWith(heading + " "),
  );
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

/** Compose the LLM prompt delivered for an explicit-task playbook run. */
export function composePlaybookPrompt(input: {
  playbook: string;
  role: string;
  model?: string;
  skillBody: string;
  principles?: string | null;
  task: string;
}): string {
  const parts: string[] = [
    `# PSTACK Playbook: ${input.playbook}`,
    `Role: ${input.role}. Model: ${input.model ?? "unspecified"}.`,
    "",
    input.skillBody,
    "",
  ];
  if (input.principles) {
    parts.push("## Core Principles", input.principles, "");
  }
  parts.push(
    "## Task",
    input.task,
    "",
    "Execute every phase above in order. Satisfy each phase Gate with observable proof before advancing. Finish by verifying every Done-when bullet.",
  );
  return parts.join("\n");
}
