export type { ExtractSegmentsResult, SliceResult };
export { EllipsisKind } from "./text-types.js";
export declare function wrapTextWithAnsi(text: string, maxWidth: number, options?: { indent?: string }): string[];
export declare function truncateToWidth(text: string, maxWidth: number, ellipsisKind: number, pad: boolean, tabWidth?: number): string;
export declare function sliceWithWidth(line: string, startCol: number, length: number, strict: boolean, tabWidth?: number): import("./text-types.js").SliceResult;
export declare function extractSegments(line: string, beforeEnd: number, afterStart: number, afterLen: number, strictAfter: boolean, tabWidth?: number): import("./text-types.js").ExtractSegmentsResult;
export declare function sanitizeText(text: string): string;
export declare function visibleWidth(text: string, tabWidth?: number): number;
