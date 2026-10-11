// Vendor-web thin surface.
export const VISUAL_BRIEF_MODES = ["image","text"] as const;
export type VisualBriefMode = (typeof VISUAL_BRIEF_MODES)[number];
