import { describe, expect, it } from "vitest";
import { COOK_PROTOCOL } from "../extensions/constants.ts";

describe("COOK_PROTOCOL prose contracts", () => {
  it("pins the exact facts-only packet caveat", () => {
    const caveat = "a map, not an authority: use it to skip discovery; verify only entries you rely on; correct stale facts if writable, otherwise report them";
    expect(COOK_PROTOCOL).toContain(caveat);
    expect(COOK_PROTOCOL).toContain("facts-only context packet");
    expect(COOK_PROTOCOL).toContain("structured section of task notes");
    expect(COOK_PROTOCOL).toContain("optional everywhere, never a gate");
    expect(COOK_PROTOCOL).toContain("consumers never reconstruct it independently");
    expect(COOK_PROTOCOL).not.toMatch(/context packet[^\n]*(conclusion|recommendation)/i);
  });

  it("requires both crash-safe resume rules", () => {
    expect(COOK_PROTOCOL).toContain("A dangling specialist intent (intent with no later matching record for the same stage)");
    expect(COOK_PROTOCOL).toContain("dispatch a fresh specialist and never count the orphan as cycle consumption");
    expect(COOK_PROTOCOL).toContain("A dangling external intent means query the external system first");
    expect(COOK_PROTOCOL).toContain("repeat the side effect only when it is genuinely absent");
    expect(COOK_PROTOCOL).toContain("Before EVERY specialist dispatch, journal intent with cook_journal");
  });

  it("pins all eight drain steps and safety invariants", () => {
    for (const step of [
      "1. Freshly read the ready set and claims with cook_ready and cook_claims.",
      "2. While unclaimed ready tasks exist and claims are below maxParallelTasks, claim the",
      "3. Journal a drain intent before opening each lane, then open the lane.",
      "4. If 2+ tasks are claimed simultaneously, every claimed task gets its own git worktree",
      "5. Integrate serialized at main in completion order: capture old main OID O",
      "6. Verify ancestry O->G, atomically advance main O->G",
      "7. A landing conflict is a discovered hidden edge and becomes a scoped kickback.",
      "8. Report stale claims (>24h with no journal record) and never auto-break them.",
    ]) {
      expect(COOK_PROTOCOL).toContain(step);
    }
    expect(COOK_PROTOCOL).toContain("lane-local stop does not stop the drain");
    expect(COOK_PROTOCOL).toContain("all claims are resolved");
  });

  it("pins blind parallel refutes and dual review", () => {
    expect(COOK_PROTOCOL).toContain("more than one blocking finding exists");
    expect(COOK_PROTOCOL).toContain("ALL source-bound refute specialists");
    expect(COOK_PROTOCOL).toContain("one fresh specialist per finding");
    expect(COOK_PROTOCOL).toContain("each blind to the others");
    expect(COOK_PROTOCOL).toContain("any recording order is valid");
    expect(COOK_PROTOCOL).toContain("two cook-judge instances with decorrelated briefs");
    expect(COOK_PROTOCOL).toContain("Pass requires both");
    expect(COOK_PROTOCOL).toContain("union of both findings, deduplicated while keeping the stricter class");
  });

  it("pins typed kickbacks, red gates, and AC integrity", () => {
    expect(COOK_PROTOCOL).toContain("typed findings with contract {source,file,line,what,kickTo}");
    expect(COOK_PROTOCOL).toContain("kickTo is plan, implement, or verify");
    expect(COOK_PROTOCOL).toContain("The full gate ALWAYS re-runs after any repair.");
    expect(COOK_PROTOCOL).toContain("Never dispatch cook-judge on a red gate");
    expect(COOK_PROTOCOL).toContain("validator failure routes as a typed kickback");
    expect(COOK_PROTOCOL).toContain("A pass verdict whose acceptance criteria are unverified is rejected.");
  });
});
