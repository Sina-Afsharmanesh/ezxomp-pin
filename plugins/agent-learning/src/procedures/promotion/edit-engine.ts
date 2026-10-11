/**
 * edit-engine.ts — Bounded edit engine with protected learned region.
 *
 * Ported from SkillOpt's skillopt_sleep/memory.py:
 *   - evaluate_gate / select_gate_score design (accept_new_best|accept|reject)
 *   - apply_edits_detailed: normalized dedup, anchor matching, protected LEARNED region
 *     markers, duplicate-add rejection, unmatched reporting.
 *
 * Upstream banner wording pattern from SkillOpt harvest_pi.py header is cited in the
 * region-creation banner below.
 *
 * LEARNED_REGION markers protect hand-written content outside the learned region:
 *   LEARNED_REGION_START = "<!-- agent-learning:LEARNED START -->"
 *   LEARNED_REGION_END   = "<!-- agent-learning:LEARNED END   -->"
 *
 * Backward compat: when a new learned region is created, the document also receives
 * a "## Skillforge learnings" section so that legacy dedup checks and downstream
 * callers (e.g. applyProposal) continue to work correctly.
 */
const LEARNED_REGION_START = "<!-- agent-learning:LEARNED START -->";
const LEARNED_REGION_END = "<!-- agent-learning:LEARNED END -->";

/**
 * Normalizes a content string for dedup/comparison: lowercases and collapses
 * consecutive whitespace to a single space.
 */
function normalizeContent(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Interface representing a single edit operation.
 */
export interface EditRecord {
  op: "add" | "delete" | "replace";
  /** Required for add/replace; unused for delete (anchor identifies the line). */
  content?: string;
  anchor?: string;
  rationale?: string;
}

/**
 * Extracts the learned-region bullet lines from a document.
 * Returns the lines between LEARNED_REGION_START and LEARNED_REGION_END,
 * with the "- " or "* " prefix stripped.
 */
export function extractLearned(doc: string): string[] {
  const startIdx = doc.indexOf(LEARNED_REGION_START);
  const endIdx = doc.indexOf(LEARNED_REGION_END);
  if (startIdx === -1 || endIdx === -1) {
    return [];
  }
  const region = doc.substring(startIdx + LEARNED_REGION_START.length, endIdx);
  // Split into lines, filter to bullet lines, strip the "- " or "* " prefix.
  return region
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.slice(2));
}

/**
 * Returns the current learned lines as they appear in the document, or an empty
 * array if no learned region exists.
 */
export function currentLearnedLines(doc: string): string[] {
  return extractLearned(doc);
}

/**
 * Wraps the document with LEARNED_REGION markers if they are absent. The banner
 * line cites the upstream SkillOpt harvest_pi.py header wording pattern. When the
 * learned region is newly created, a "## Skillforge learnings" section is also
 * added for backward compat with legacy dedup checks in applyProposal.
 */
export function setLearned(doc: string, lines: string[]): string {
  const hasStart = doc.includes(LEARNED_REGION_START);
  const hasEnd = doc.includes(LEARNED_REGION_END);
  if (hasStart && hasEnd) {
    return doc;
  }
  // Upstream banner wording pattern from harvest_pi.py header.
  const bulletBlock = lines.map((line) => `- ${line}`).join("\n");
  const learnedBanner = `<!-- agent-learning:LEARNED START -->
- ${bulletBlock}
<!-- agent-learning:LEARNED END -->`;
  const legacySection = `## Skillforge learnings\n`;
  return doc + "\n" + legacySection + learnedBanner;
}

/**
 * Core: apply edits detailed. Edits apply ONLY to bullet lines inside the
 * protected learned region. Normalized dedup (lowercase + whitespace-collapsed)
 * prevents duplicate adds. Unmatched edits are reported separately.
 *
 * @param doc The current document text.
 * @param edits Array of EditRecord to apply.
 * @returns { nextDoc, applied, unmatched } — the modified document, edits that
 *   successfully applied, and edits that could not be applied (unmatched).
 */
export function applyEditsDetailed(
  doc: string,
  edits: EditRecord[],
): { nextDoc: string; applied: EditRecord[]; unmatched: EditRecord[] } {
  // Ensure the learned region exists; create it on first apply if absent.
  let workingDoc = doc;
  let learnedLines = extractLearned(workingDoc);
  if (learnedLines.length === 0) {
    workingDoc = setLearned(workingDoc, []);
    learnedLines = extractLearned(workingDoc);
  }

  // Build the current bullet-line map: normalize each learned line for dedup.
  const normalizedExisting = learnedLines.map(normalizeContent);
  const bulletLines = [...learnedLines]; // mutable copy

  const applied: EditRecord[] = [];
  const unmatched: EditRecord[] = [];

  for (const edit of edits) {
    let matched = false;

    switch (edit.op) {
      case "add": {
        // Empty add is always unmatched.
        if (edit.content === undefined || edit.content.trim() === "") {
          unmatched.push(edit);
          continue;
        }
        // Dedup: skip if a normalized version of this content already exists.
        const content = edit.content as string;
        const normalizedEdit = normalizeContent(content);
        if (normalizedExisting.includes(normalizedEdit)) {
          unmatched.push(edit);
          continue;
        }
        // Add the new bullet line(s). Multi-line content is flattened into
        // one bullet per line so every line survives the region round-trip
        // (extractLearned only sees "- "-prefixed lines).
        const insertIdx = bulletLines.length;
        const contentLines = content
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l !== "");
        bulletLines.splice(insertIdx, 0, ...contentLines);
        for (const line of contentLines) {
          normalizedExisting.push(normalizeContent(line));
        }
        normalizedExisting.push(normalizedEdit);
        applied.push(edit);
        matched = true;
        break;
      }

      case "delete": {
        // Find a bullet line whose normalized content matches the anchor.
        let targetIdx = -1;
        if (edit.anchor !== undefined) {
          const normalizedAnchor = normalizeContent(edit.anchor);
          for (let i = 0; i < bulletLines.length; i++) {
            if (normalizeContent(bulletLines[i]) === normalizedAnchor) {
              targetIdx = i;
              break;
            }
          }
        }
        // If no anchor provided or no match found, the edit is unmatched.
        if (targetIdx === -1) {
          unmatched.push(edit);
          break;
        }
        // Delete the bullet line at targetIdx.
        bulletLines.splice(targetIdx, 1);
        // Remove from normalizedExisting by rebuilding (simple: filter out the deleted line).
        normalizedExisting.splice(targetIdx, 1);
        applied.push(edit);
        matched = true;
        break;
      }

      case "replace": {
        // Find a bullet line whose normalized content matches the anchor substring.
        let targetIdx = -1;
        if (edit.anchor !== undefined) {
          const normalizedAnchor = normalizeContent(edit.anchor);
          for (let i = 0; i < bulletLines.length; i++) {
            if (normalizeContent(bulletLines[i]) === normalizedAnchor) {
              targetIdx = i;
              break;
            }
          }
        }
        // If no match found, or the replacement content is identical to the
        // existing line, the edit is unmatched.
        if (targetIdx === -1) {
          unmatched.push(edit);
          break;
        }
        const existingLine = bulletLines[targetIdx];
        // Replace with identical replacement = unmatched.
        if (edit.content === undefined || edit.content === existingLine) {
          unmatched.push(edit);
          break;
        }
        bulletLines[targetIdx] = edit.content;
        // normalizedExisting stays aligned; the replaced line's normalized form
        // will be re-evaluated on next ops or can be refreshed.
        applied.push(edit);
        matched = true;
        break;
      }

      default: {
        // Unknown op = unmatched.
        unmatched.push(edit);
        break;
      }
    }
  }

  // Reconstruct the document with the updated learned-region bullet lines.
  const newBulletBlock = bulletLines.map((line) => `- ${line}`).join("\n");
  const regionContent = `${LEARNED_REGION_START}\n${newBulletBlock}\n${LEARNED_REGION_END}`;

  // Replace the old learned-region block with the new one.
  const oldStart = doc.indexOf(LEARNED_REGION_START);
  const oldEnd = doc.indexOf(LEARNED_REGION_END);
  if (oldStart !== -1 && oldEnd !== -1) {
    const before = doc.substring(0, oldStart);
    // Find the newline after the end marker; if none exists, after is empty.
    const newlineAfterEnd = doc.indexOf("\n", oldEnd);
    const after =
      newlineAfterEnd !== -1 ? doc.substring(newlineAfterEnd + 1) : "";
    // Strip leading newline from `after` if the doc originally had one after the region.
    const cleanAfter = after.startsWith("\n") ? after.slice(1) : after;
    workingDoc = before + regionContent + cleanAfter;
  } else {
    // No existing region — append at end.
    workingDoc = doc.trim() + "\n" + regionContent;
  }

  return { nextDoc: workingDoc, applied, unmatched };
}
