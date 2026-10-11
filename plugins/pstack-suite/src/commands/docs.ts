import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { createBacklogDoc, execBacklogCapture, writeBacklogBody } from "./backlog-doc.js";
import { execFile } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

/** Render architecture/API docs as structured guide.
 * Source file → extract top-level comments/exports; README → summary.
 * Creates a backlog doc -t guide under guides/.
 * @implements TASK-37.12
 */
export async function handleDocs(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = ctx.cwd || process.cwd();
  const target = args.trim();

  if (!target) {
    ctx.ui.notify("pstack docs: provide a file path (source file or README)", "error");
    return;
  }

  const filePath = target.startsWith("/") ? target : `${cwd}/${target}`;
  if (!existsSync(filePath)) {
    ctx.ui.notify(`pstack docs: file not found — ${filePath}`, "error");
    return;
  }

  const content = readFileSync(filePath, "utf-8");
  const isReadme = /readme/i.test(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const sourceExts = new Set(["ts","tsx","js","jsx","mts","cts","mjs","cjs","py","rs","go","java","rb","cs","cpp","c","h","hpp"]);
  const isSource = sourceExts.has(ext);

  let body: string;
  if (isSource) {
    body = extractSourceStructure(content, filePath);
  } else {
    body = extractReadmeStructure(content, filePath);
  }

  const slug = filePath.split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "docs";
  const title = `Docs-${slug}`;

  const createResult = await execBacklogCapture(
    "backlog",
    ["doc", "create", title, "-p", "guides", "-t", "guide"],
    cwd,
    ctx,
  );
  const docPaths = writeBacklogBody(createResult, body, cwd, "docs", ctx);
  if (!docPaths) {
    return;
  }

  ctx.ui.notify(`pstack docs: guide created under guides/ ✓`, "info");
}

function extractSourceStructure(content: string, filePath: string): string {
  const exports = parseExports(content);
  const topComments = extractTopComments(content);
  const imports = parseImports(content);

  let body = `## Overview

Analysis of \`${filePath}\`.
${topComments ? `\n${topComments}` : ""}

## Structure

`;

  if (imports.length) {
    body += `### Imports\n\n\`\`\`\n${imports.join("\n")}\n\`\`\`\n\n`;
  }

  if (exports.length) {
    body += `### Exports/API\n\n| Export | Kind |\n|--------|------|\n`;
    for (const e of exports) {
      body += `| \`${e.name}\` | ${e.kind} |\n`;
    }
    body += "\n";
  }

  body += `## Cross-references

- Source: \`${filePath}\`
- Exports: ${exports.length}
- Imports: ${imports.length}
`;
  return body;
}

function extractReadmeStructure(content: string, filePath: string): string {
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
  const links = (content.match(/\[([^\]]+)\]\([^)]+\)/g) || []).slice(0, 20);

  let body = `## Overview

Documentation guide extracted from \`${filePath}\`.

`;

  if (headings.length) {
    body += `## Structure\n\n`;
    for (const h of headings) {
      const level = h.match(/^#+/)?.[0].length || 1;
      const text = h.replace(/^#+\s+/, "");
      const indent = "  ".repeat(level - 1);
      body += `${indent}- ${text}\n`;
    }
    body += "\n";
  }

  if (codeBlocks) {
    body += `- **Code blocks:** ${codeBlocks}\n\n`;
  }

  if (links.length) {
    body += `## Cross-references\n\n`;
    for (const link of links) {
      body += `- ${link}\n`;
    }
    body += "\n";
  }

  return body;
}

function extractTopComments(content: string): string {
  // Match block comments at top of file (/* ... */ or /** ... */)
  const blockMatch = content.match(/^\s*(\/\*\*[\s\S]*?\*\/)/m);
  if (blockMatch) return blockMatch[1]!.trim();
  // Match line comments at top (// ...)
  const lines = content.split("\n");
  const commentLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
      commentLines.push(trimmed.replace(/^(\/\/|#)\s*/, ""));
    } else if (trimmed === "" && commentLines.length) {
      // allow blank line between comment blocks at top
      continue;
    } else {
      break;
    }
  }
  return commentLines.length ? commentLines.join("\n") : "";
}

interface ExportEntry {
  name: string;
  kind: string;
}

function parseExports(content: string): ExportEntry[] {
  const entries: ExportEntry[] = [];
  const seen = new Set<string>();

  // export default ...
  const defaultMatch = content.match(/export\s+default\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/);
  if (defaultMatch && !seen.has("default")) {
    entries.push({ name: "default", kind: "default export" });
    seen.add("default");
  }

  // export function/const/class/interface/type/enum ...
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
    /export\s+interface\s+(\w+)/g,
    /export\s+type\s+(\w+)/g,
    /export\s+enum\s+(\w+)/g,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const name = m[1]!;
      if (!seen.has(name)) {
        const kind = pattern.toString().match(/\+(function|const|class|interface|type|enum)/)?.[1] || "export";
        entries.push({ name, kind: kind === "const" ? "const" : kind === "function" ? "function" : kind });
        seen.add(name);
      }
    }
  }

  // export { ... }
  const namedMatch = content.match(/export\s*\{([^}]+)\}/g);
  if (namedMatch) {
    for (const block of namedMatch) {
      const names = block.replace(/export\s*\{/, "").replace(/\}/, "").split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[1]?.trim() || s.trim().split(/\s+/)[0]!.trim()).filter((n): n is string => Boolean(n));
      for (const name of names) {
        if (!seen.has(name)) {
          entries.push({ name, kind: "named export" });
          seen.add(name);
        }
      }
    }
  }

  return entries;
}

function parseImports(content: string): string[] {
  const imports: string[] = [];
  const seen = new Set<string>();
  const re = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const from = m[1]!;
    if (!seen.has(from)) {
      imports.push(`import ... from "${from}"`);
      seen.add(from);
    }
  }
  return imports;
}
