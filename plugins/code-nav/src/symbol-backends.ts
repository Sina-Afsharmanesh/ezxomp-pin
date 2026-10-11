import type { MatchKind } from './symbol-normalization.ts';
import type { ReferenceHit, SymbolCandidate } from './types.ts';
import { detectLangFromPath, findFileHintCandidates, findWorkspaceCandidates } from './symbol-fallback.ts';
/** Backends retained for result metadata; navigation now uses local filesystem scans only. */
export type BackendName = 'lsp' | 'ast' | 'fallback';
export type { MatchKind } from './symbol-normalization.ts';
export { detectLangFromPath } from './symbol-fallback.ts';

/** Detect an ast-grep language from a source path. */

/** Parameters used by the plugin-owned AST-grep runner. */
export function astGrepSearchParams(pattern: string, scope: string, lang?: string): Record<string, unknown> {
  return {
    pattern,
    lang: lang ?? detectLangFromPath(scope),
    paths: [scope],
  };
}

/**
 * Resolve symbols through the local scanner. OMP's native `lsp` remains the
 * authoritative semantic tool; this extension deliberately does not dispatch
 * into another tool from inside a tool call.
 */
export async function findLspCandidates(symbol: string, fileHint: string | undefined): Promise<SymbolCandidate[]> {
  return fileHint ? findFileHintCandidates(symbol, fileHint) : findWorkspaceCandidates(symbol, fileHint);
}

/** AST fallback uses the same containment-checked local declaration scanner. */
export async function findAstCandidates(symbol: string, fileHint: string | undefined): Promise<SymbolCandidate[]> {
  return fileHint ? findFileHintCandidates(symbol, fileHint) : findWorkspaceCandidates(symbol, fileHint);
}

/** Native `lsp` handles semantic references; this package uses its own scan fallback. */
export async function findLspReferences(
  _symbol: string,
  _fileHint: string | undefined,
  _limit: number,
  _resolveDefinition: (symbol: string, fileHint: string | undefined) => Promise<{ file?: string; line?: number; character?: number } | null>,
): Promise<ReferenceHit[] | null> {
  return null;
}
