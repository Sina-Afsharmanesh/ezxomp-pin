/**
 * Facts lane — thin adapter over the native memory backend.
 *
 * OMP natively provides fact storage + recall (memory.backend: mnemopi with
 * recall/retain/reflect tools and session-start <memories> injection). This
 * module adds NO storage and NO injection; it only documents the lane contract
 * and exposes a pure classifier used by /learning status and tests.
 */

export type LessonKind = "fact" | "gotcha" | "decision" | "pattern" | "habit";

export type LearningLane =
	| { lane: "facts"; tooling: "native memory backend (learn/retain/recall)" }
	| { lane: "procedures"; tooling: "skillforge_capture_memory → promotion review" }
	| { lane: "habits"; tooling: "/experience capture → analyze → review" };

/** Map a lesson kind onto its owning lane. */
export function laneForLesson(kind: LessonKind): LearningLane {
	switch (kind) {
		case "fact":
			return { lane: "facts", tooling: "native memory backend (learn/retain/recall)" };
		case "habit":
			return { lane: "habits", tooling: "/experience capture → analyze → review" };
		case "gotcha":
		case "decision":
		case "pattern":
			return {
				lane: "procedures",
				tooling: "skillforge_capture_memory → promotion review",
			};
	}
}
