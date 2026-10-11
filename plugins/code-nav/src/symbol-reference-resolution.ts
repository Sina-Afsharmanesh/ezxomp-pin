import type { BackendName } from './symbol-backends.ts';
import { scanReferences } from './symbol-fallback.ts';
import type { DefinitionResult, ReferenceResult, SymbolLocation } from './types.ts';

export interface ReferenceResolution {
  hits: ReferenceResult['hits'];
  backend: BackendName;
  fallback: boolean;
  confidence: 'high' | 'medium' | 'low';
  source: 'scan';
  definitionBackend?: BackendName;
  definitionConfidence?: 'high' | 'medium' | 'low';
  definitionFallback?: boolean;
  definitionFile?: string;
  definitionLine?: number;
}

export interface DefinitionLocationResolver {
  (symbol: string, fileHint: string | undefined): Promise<DefinitionResult>;
}

export async function resolveReferences(
  symbol: string,
  fileHint: string | undefined,
  limit: number,
  resolveDefinition: DefinitionLocationResolver,
): Promise<ReferenceResolution> {
  const definition = await resolveDefinition(symbol, fileHint);
  const definitionLocation = (definition.location ?? definition.details.location) as SymbolLocation | undefined;
  const definitionBackend = (definition.details.backend as BackendName | undefined) ?? 'fallback';
  const definitionConfidence = (definition.details.confidence as 'high' | 'medium' | 'low' | undefined)
    ?? definition.location?.confidence
    ?? (definitionLocation?.file ? 'medium' : 'low');
  const definitionFallback = definitionBackend !== 'lsp';
  const confidence = fileHint ? 'medium' : 'low';

  return {
    hits: scanReferences(symbol, fileHint, limit).map((hit) => ({
      ...hit,
      confidence,
      backend: 'fallback',
      fallback: true,
    })),
    backend: 'fallback',
    fallback: true,
    confidence,
    source: 'scan',
    definitionBackend,
    definitionConfidence,
    definitionFallback,
    definitionFile: definitionLocation?.file,
    definitionLine: definitionLocation?.line,
  };
}
