import { readFileSync } from 'node:fs';
import { findReferences } from './symbols.ts';
import { formatCompactSection } from './format.ts';
import { rememberReadFile, rememberQueriedSymbol, recordSymbolRelationship } from './state.ts';
import type { TraceCaller, TraceQuery, TraceResult } from './types.ts';
import type { ReferenceFileGroup } from './types.ts';
import { resolveWorkspaceFile } from './workspace-path.ts';
import { extractCallsFromPreview, extractImportsFromLines, inferFunctionRole } from './code-context.ts';
import { sgSearch } from './sg-runner.ts';

async function extractCallerContext(
  file: string,
  symbol: string,
  previewLine: number | undefined,
): Promise<{ callsInContext: string[]; importsFrom: string[] }> {
  const callsInContext: string[] = [];
  let importsFrom: string[] = [];
  const safePath = resolveWorkspaceFile(file);

  if (safePath) {
    try {
      const result = await sgSearch(
        '$FUNC($$$ARGS)',
        safePath.endsWith('.ts') || safePath.endsWith('.tsx') ? 'typescript' : safePath.endsWith('.js') || safePath.endsWith('.jsx') ? 'javascript' : 'typescript',
        [safePath],
      );
      for (const match of result.matches) {
        const matchLine = match.range.start.line + 1;
        if (previewLine && Math.abs(matchLine - previewLine) > 10) continue;
        callsInContext.push(...extractCallsFromPreview(match.text, symbol));
      }
    } catch {
      // ast-grep is optional; continue with source-line imports when unavailable.
    }

    try {
      const fileContent = readFileSync(safePath, 'utf8');
      importsFrom = extractImportsFromLines(fileContent.split(/\r?\n/));
    } catch {
      // File may have disappeared between reference scan and context extraction.
    }
  }

  return {
    callsInContext: [...new Set(callsInContext)].slice(0, 10),
    importsFrom: [...new Set(importsFrom)].slice(0, 10),
  };
}

export async function traceCallChain(params: TraceQuery): Promise<TraceResult> {
  rememberQueriedSymbol(params.symbol);
  const depth = Math.max(1, Math.min(3, params.depth ?? 1));
  const limit = Math.max(3, Math.min(20, params.limit ?? 8));

  const refResult = await findReferences({ symbol: params.symbol, file: params.file, limit });
  const groupedHits = refResult.details.groupedHits as ReferenceFileGroup[] | undefined;
  if (!groupedHits || groupedHits.length === 0) {
    return {
      root: { symbol: params.symbol, file: params.file },
      callers: [],
      depth,
      totalCallers: 0,
      content: formatCompactSection('Trace result', [
        `- symbol: ${params.symbol}`,
        `- depth: ${depth}`,
        '- callers found: 0',
        '- next: no references found; try code_nav_find_definition to verify the symbol exists',
      ]),
      details: {
        symbol: params.symbol,
        depth,
        callers: [],
        totalCallers: 0,
        suggestedNextTool: 'code_nav_find_definition',
        suggestedNextReason: 'No references found; verify the symbol definition exists first.',
      },
    };
  }

  const topGroups = groupedHits.slice(0, Math.min(5, groupedHits.length));
  const callers: TraceCaller[] = [];
  for (const group of topGroups) {
    for (const lineInfo of group.lines.slice(0, 2)) {
      rememberReadFile(group.file);
      const context = await extractCallerContext(group.file, params.symbol, lineInfo.line);
      callers.push({
        file: group.file,
        line: lineInfo.line,
        preview: lineInfo.preview,
        callsInContext: context.callsInContext,
        importsFrom: context.importsFrom,
      });

      recordSymbolRelationship({
        fromSymbol: params.symbol,
        fromFile: (refResult.details.definitionFile as string | undefined) ?? params.file ?? '',
        toSymbol: params.symbol,
        toFile: group.file,
        relationType: 'calls',
      });

      for (const calledSymbol of context.callsInContext.slice(0, 3)) {
        recordSymbolRelationship({
          fromSymbol: params.symbol,
          fromFile: group.file,
          toSymbol: calledSymbol,
          toFile: group.file,
          relationType: 'calls',
        });
      }

      for (const importPath of context.importsFrom.slice(0, 3)) {
        recordSymbolRelationship({
          fromSymbol: params.symbol,
          fromFile: group.file,
          toSymbol: importPath,
          toFile: importPath,
          relationType: 'imports',
        });
      }
    }
  }

  return {
    root: {
      symbol: params.symbol,
      file: (refResult.details.definitionFile as string | undefined) ?? (refResult.details.owningFile as string | undefined) ?? params.file,
      line: refResult.details.groupedHits?.[0]?.topPreview?.line,
    },
    callers,
    depth,
    totalCallers: refResult.hits.length,
    content: formatCompactSection('Trace result', [
      `- symbol: ${params.symbol}`,
      `- root file: ${refResult.details.definitionFile ?? refResult.details.owningFile ?? params.file ?? 'unknown'}`,
      `- depth: ${depth}`,
      `- callers found: ${callers.length}`,
      `- total references: ${refResult.hits.length}`,
      ...callers.map((caller, i) => {
        const role = inferFunctionRole(caller.file);
        const calls = caller.callsInContext.length > 0 ? ` -> calls: ${caller.callsInContext.join(', ')}` : '';
        const imports = caller.importsFrom.length > 0 ? ` (imports from: ${caller.importsFrom.slice(0, 3).join(', ')})` : '';
        return `- caller ${i + 1}: ${caller.file}:${caller.line} [${role}]${caller.preview ? ` — ${caller.preview}` : ''}${calls}${imports}`;
      }),
      ...callers.filter((c) => c.callsInContext.length > 0).slice(0, 3).map((caller) =>
        depth > 1
          ? `- follow-up: trace ${caller.callsInContext[0]} from ${caller.file} for deeper chain (${depth - 1} hops remaining)`
          : `- context: ${caller.callsInContext[0]} is called from ${caller.file}:${caller.line}`
      ),
    ]),
    details: {
      symbol: params.symbol,
      root: refResult.details.definitionFile ?? refResult.details.owningFile ?? params.file,
      depth,
      callers,
      totalCallers: refResult.hits.length,
      suggestedNextTool: depth > 1 && callers.length > 0 && callers[0].callsInContext.length > 0 ? 'code_nav_trace' : 'read',
      suggestedNextArgs: depth > 1 && callers.length > 0 && callers[0].callsInContext.length > 0
        ? { symbol: callers[0].callsInContext[0], file: callers[0].file, depth: depth - 1 }
        : { path: callers[0]?.file ?? params.file },
      suggestedNextReason: depth > 1 && callers.length > 0 && callers[0].callsInContext.length > 0
        ? `First caller invokes ${callers[0].callsInContext[0]}; trace it for deeper chain (${depth - 1} hops remaining).`
        : 'Read the caller file for full context of the usage.',
    },
  };
}
