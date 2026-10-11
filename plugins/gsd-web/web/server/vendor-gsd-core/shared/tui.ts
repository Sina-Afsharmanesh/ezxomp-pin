// Barrel — TUI-dependent exports.
// Import from here when your code needs makeUI, showInterviewRound,
// showNextAction, or showConfirm.  These all have a transitive dependency
// on @gsd/pi-tui and must not be imported from shared/mod.

export { makeUI } from "./ui.ts";
export type { UI } from "./ui.ts";
export { showInterviewRound } from "./interview-ui.ts";
export type { Question, QuestionOption, RoundResult } from "./interview-ui.ts";
export { showNextAction } from "./next-action-ui.ts";
export { showConfirm } from "./confirm-ui.ts";
