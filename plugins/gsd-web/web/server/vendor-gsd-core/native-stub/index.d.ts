export function isNativeAddonLoaded(): boolean;
export function gitCurrentBranch(cwd?: string): string | null;
export function gitHasChanges(cwd?: string): boolean;
export function parseFrontmatter(text: string): Record<string, unknown>;
export function extractSection(text: string, section: string): string | null;
export function batchParseGsdFiles(paths: string[]): Array<{ path: string; frontmatter: Record<string, unknown> | null; error?: string }>;
export function highlightCode(code: string, language: string): string;
export function supportsLanguage(language: string): boolean;
export declare const native: Record<string, unknown>;
