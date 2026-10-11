import { classifyNavigationIntent } from './navigation-intent.ts';
import type { IntentResult } from './navigation-intent.ts';
import { snapshotNavigationEvidence } from './navigation-evidence.ts';
import { setLastPlannerResult } from './state.ts';
import type { EvidenceSnapshot, NavigationPlan, NavigationStep, PlannerQuery, ToolRoute } from './types.ts';

function clampLimit(limit?: number) {
  if (typeof limit !== 'number' || Number.isNaN(limit)) return 3;
  return Math.max(1, Math.min(4, Math.floor(limit)));
}

function ladderForFamily(family: NavigationStep['toolFamily']): 1 | 2 | 3 | 4 {
  switch (family) {
    case 'discovery': return 1;
    case 'code_nav': return 2;
    case 'lsp': return 2;
    case 'read': return 4;
    case 'answer': return 4;
    default: return 4;
  }
}

function step(order: number, toolFamily: NavigationStep['toolFamily'], tool: string, reason: string, args?: Record<string, unknown>, stopIfResolved = false): NavigationStep {
  return { order, toolFamily, tool, args, reason, stopIfResolved, ladderPosition: ladderForFamily(toolFamily) };
}

function nativeLspAction(operation: NonNullable<IntentResult['rawLspOperation']>): string {
  switch (operation) {
    case 'signatureHelp':
      return 'hover';
    case 'incomingCalls':
    case 'outgoingCalls':
      return 'references';
    case 'workspaceSymbol':
      return 'symbols';
    default:
      return operation;
  }
}

function rawLspSeed(query: PlannerQuery, evidence: EvidenceSnapshot, operation: NonNullable<IntentResult['rawLspOperation']>) {
  const action = nativeLspAction(operation);
  if (evidence.lastResolvedDefinition?.file && typeof evidence.lastResolvedDefinition.line === 'number') {
    return {
      action,
      file: evidence.lastResolvedDefinition.file,
      line: evidence.lastResolvedDefinition.line,
      symbol: evidence.symbol ?? query.symbol,
    };
  }

  if (evidence.symbol || query.symbol) {
    return {
      action,
      query: evidence.symbol ?? query.symbol,
      file: evidence.file ?? query.file,
    };
  }

  if (evidence.file || query.file) {
    return {
      action,
      file: evidence.file ?? query.file,
    };
  }

  return undefined;
}

export function planNavigation(query: PlannerQuery): NavigationPlan {
  const evidence = snapshotNavigationEvidence(query);
  const intentResult = classifyNavigationIntent(query.task, query.mode ?? 'auto');
  const limit = clampLimit(query.limit);
  const steps: NavigationStep[] = [];
  const fallbackSteps: NavigationStep[] = [];
  const stopWhen: string[] = [];
  let status: NavigationPlan['status'] = 'grounded-next-hop';
  let bestRoute: ToolRoute;

  if (intentResult.rawLspOperation) {
    const args = rawLspSeed(query, evidence, intentResult.rawLspOperation);
    if (args) {
      bestRoute = {
        primary: 'lsp',
        toolName: 'lsp',
        args,
        reason: 'Native OMP LSP handles the semantic operation more directly than a code_nav wrapper.',
        ladderPosition: ladderForFamily('lsp'),
      };
      steps.push(step(1, 'lsp', 'lsp', bestRoute.reason, args, true));
      fallbackSteps.push(step(1, 'read', 'read', 'If native LSP remains ambiguous, read owning file near the resolved symbol.', evidence.file ? { path: evidence.file } : undefined, true));
      stopWhen.push('Stop once native LSP returns the requested semantic fact or target location.', 'Do not fall back to broad repository search unless symbol or file grounding is still missing.');
    }
    else {
      status = 'needs-discovery';
      bestRoute = {
        primary: 'discovery',
        toolName: 'glob',
        args: { path: '*' },
        reason: 'Raw LSP op needs file or symbol grounding first. Use discovery tools for orientation, then trace symbols.',
        ladderPosition: ladderForFamily('discovery'),
      };
      steps.push(step(1, 'discovery', 'glob', bestRoute.reason, { path: '*' }, true));
      fallbackSteps.push(step(1, 'read', 'read', 'Read likely file once narrowed.', evidence.file ? { path: evidence.file } : undefined, true));
      stopWhen.push('Stop after repo area or target file becomes grounded, then rerun planner.');
    }
  } else if (intentResult.intent === 'debug' && intentResult.crossSubsystem && !evidence.symbol) {
    status = 'needs-discovery';
    bestRoute = {
      primary: 'discovery',
      toolName: 'glob',
      args: { path: '*' },
      reason: 'Cross-subsystem bug. Orient on ONE subsystem first with discovery, then code-nav across the rest. Do not discover all subsystems at once.',
      ladderPosition: ladderForFamily('discovery'),
    };
    steps.push(step(1, 'discovery', 'glob', bestRoute.reason, { path: '*' }, true));
    steps.push(step(2, 'code_nav', 'code_nav_find_references', 'Once entry symbol is grounded from the oriented subsystem, trace callers across boundaries.', { symbol: '<grounded-symbol>', limit }, true));
    fallbackSteps.push(step(1, 'discovery', 'read', 'Pick one likely subsystem and read its key docs for orientation.', { path: 'README.md' }, true));
    stopWhen.push('Orient on one subsystem, then trace symbols across boundaries.', 'Do not read all subsystem docs simultaneously.');
  } else if (!evidence.symbol) {
    status = evidence.freshSession ? 'needs-discovery' : 'needs-narrowing';
    bestRoute = evidence.file
      ? {
          primary: 'read',
          toolName: 'read',
          args: { path: evidence.file },
          reason: 'File grounded, symbol not. Read local source before exact-symbol follow-up.',
          ladderPosition: ladderForFamily('read'),
        }
      : {
          primary: 'discovery',
          toolName: 'glob',
          args: { path: '*' },
          reason: 'Task still ungrounded. Start with repo discovery (structural orientation first), not code_nav_rank_context.',
          ladderPosition: ladderForFamily('discovery'),
        };
    steps.push(step(1, bestRoute.primary, bestRoute.toolName ?? 'glob', bestRoute.reason, bestRoute.args, true));
    fallbackSteps.push(step(1, 'discovery', 'glob', 'If task still broad, inspect high-impact source files next.', { path: '**/*.{ts,js,tsx,jsx}', limit: 20 }, true));
    stopWhen.push('Stop discovery once exact symbol name or file is grounded.', 'Do not call code_nav_* until exact symbol or caller target is known.');
  } else if (intentResult.intent === 'define') {
    const matchesLastDefinition = evidence.lastResolvedDefinition?.symbol === evidence.symbol;
    if (matchesLastDefinition && evidence.lastResolvedDefinition?.file) {
      status = 'answer-now';
      bestRoute = {
        primary: 'answer',
        reason: 'Definition already grounded in session state.',
        ladderPosition: ladderForFamily('answer'),
      };
      stopWhen.push(`Answer with ${evidence.lastResolvedDefinition.file}:${evidence.lastResolvedDefinition.line}.`);
    } else {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_find_definition',
        args: { symbol: evidence.symbol, file: evidence.file },
        reason: 'Exact symbol grounded. Definition-first hop is shortest path.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_find_definition', bestRoute.reason, bestRoute.args, true));
      fallbackSteps.push(step(1, 'discovery', 'glob', 'If exact symbol still fails, verify repo structure and name first.', { path: '*' }, true));
      stopWhen.push('Stop if definition file and line answer request directly.');
    }
  } else if (intentResult.intent === 'trace' || intentResult.intent === 'impact') {
    const hasCallerEvidence = evidence.lastTopCallerFiles.length > 0 && evidence.queriedSymbols.includes(evidence.symbol);
    if (hasCallerEvidence) {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_trace',
        args: { symbol: evidence.symbol, file: evidence.file, depth: query.depth ?? 1, limit },
        reason: 'Caller evidence exists. Trace the transitive call chain to find deeper callers.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_trace', bestRoute.reason, bestRoute.args, false));
      fallbackSteps.push(step(1, 'read', 'read', 'If trace chain is shallow, read the strongest caller file for full context.', evidence.lastTopCallerFiles[0] ? { path: evidence.lastTopCallerFiles[0].file } : undefined, true));
      stopWhen.push('Continue tracing into callers if the root cause is not yet identified.',
        'Use code_nav_trace for transitive follow-up on strong caller files.',
        'Stop when the call chain no longer leads toward the bug or feature under investigation.');
    } else {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_find_references',
        args: { symbol: evidence.symbol, file: evidence.file, limit },
        reason: 'Grouped references give best first caller or impact hop.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_find_references', bestRoute.reason, bestRoute.args, true));
      steps.push(step(2, 'code_nav', 'code_nav_trace', 'After references resolve, trace the transitive call chain from the strongest caller.', { symbol: evidence.symbol, file: evidence.file, depth: 1, limit }, false));
      fallbackSteps.push(step(1, 'read', 'read', 'If refs return strong caller file, read only that caller next.', evidence.lastTopCallerFiles[0] ? { path: evidence.lastTopCallerFiles[0].file } : undefined, true));
      stopWhen.push('Continue tracing into callers if the root cause is not yet identified.',
        'Use code_nav_trace for transitive follow-up on strong caller files.',
        'Stop only when grouped hits plus one caller hop answer the question.');
    }
  } else if (intentResult.intent === 'inspect') {
    bestRoute = {
      primary: 'code_nav',
      toolName: 'code_nav_get_symbol',
      args: { symbol: evidence.symbol, file: evidence.file, includeBody: true },
      reason: 'Exact symbol grounded. Minimal body slice is best next hop.',
      ladderPosition: ladderForFamily('code_nav'),
    };
    steps.push(step(1, 'code_nav', 'code_nav_get_symbol', bestRoute.reason, bestRoute.args, true));
    fallbackSteps.push(step(1, 'code_nav', 'code_nav_find_definition', 'If file hint still wrong, resolve owning file first.', { symbol: evidence.symbol, file: evidence.file }, true));
    stopWhen.push('Stop if symbol body already answers request.');
  } else if (intentResult.intent === 'debug' && intentResult.crossSubsystem) {
    if (evidence.symbol) {
      bestRoute = {
        primary: 'code_nav',
        toolName: 'code_nav_trace',
        args: { symbol: evidence.symbol, file: evidence.file, depth: 1, limit },
        reason: 'Cross-subsystem bug with grounded symbol. Trace transitive callers across boundaries instead of reading all subsystems.',
        ladderPosition: ladderForFamily('code_nav'),
      };
      steps.push(step(1, 'code_nav', 'code_nav_trace', bestRoute.reason, bestRoute.args, false));
      steps.push(step(2, 'code_nav', 'code_nav_find_references', 'If trace reveals a boundary caller, find its references to map the full subsystem bridge.', { symbol: '<follow-up-symbol>', limit }, true));
      fallbackSteps.push(step(1, 'discovery', 'read', 'If references are sparse, orient on one subsystem\'s key docs to find entry points.', { path: 'README.md' }, true));
      stopWhen.push('Continue tracing until boundary calls between subsystems are identified.',
        'Stop when the root cause is found or the chain no longer crosses subsystem boundaries.',
        'Do not wiki-read every subsystem simultaneously.');
    } else {
      status = 'needs-discovery';
      bestRoute = {
        primary: 'discovery',
        toolName: 'glob',
        args: { path: '*' },
        reason: 'Cross-subsystem bug. Orient on ONE subsystem first with discovery, then code-nav across the rest. Do not discover all subsystems at once.',
        ladderPosition: ladderForFamily('discovery'),
      };
      steps.push(step(1, 'discovery', 'glob', bestRoute.reason, { path: '*' }, true));
      steps.push(step(2, 'code_nav', 'code_nav_find_references', 'Once entry symbol is grounded from the oriented subsystem, trace callers across boundaries.', evidence.symbol ? { symbol: evidence.symbol, file: evidence.file, limit } : { symbol: '<grounded-symbol>', limit }, true));
      fallbackSteps.push(step(1, 'discovery', 'read', 'Pick one likely subsystem and read its key docs for orientation.', { path: 'README.md' }, true));
      stopWhen.push('Orient on one subsystem, then trace symbols across boundaries.', 'Do not read all subsystem docs simultaneously.');
    }
  } else if (intentResult.intent === 'debug' && evidence.symbol) {
    bestRoute = {
      primary: 'code_nav',
      toolName: 'code_nav_trace',
      args: { symbol: evidence.symbol, file: evidence.file, depth: query.depth ?? 1, limit },
      reason: 'Debug task with grounded symbol. Trace the call chain to find the root cause.',
      ladderPosition: ladderForFamily('code_nav'),
    };
    steps.push(step(1, 'code_nav', 'code_nav_trace', bestRoute.reason, bestRoute.args, false));
    fallbackSteps.push(step(1, 'read', 'read', 'If trace chain is shallow, read the strongest caller file for full context.', evidence.lastTopCallerFiles[0] ? { path: evidence.lastTopCallerFiles[0].file } : undefined, true));
    stopWhen.push('Continue tracing into callers if the root cause is not yet identified.',
      'Use code_nav_trace for transitive follow-up on strong caller files.',
      'Stop when the call chain no longer leads toward the bug under investigation.');
  } else if (intentResult.intent === 'debug') {
    status = 'needs-discovery';
    bestRoute = {
      primary: 'discovery',
      toolName: 'glob',
      args: { path: '*' },
      reason: 'Debug task without grounded symbol. Discover the repo structure first, then trace.',
      ladderPosition: ladderForFamily('discovery'),
    };
    steps.push(step(1, 'discovery', 'glob', bestRoute.reason, { path: '*' }, true));
    steps.push(step(2, 'code_nav', 'code_nav_trace', 'Once a suspect symbol is grounded, trace its call chain.', { symbol: '<grounded-symbol>', depth: 1, limit }, false));
    fallbackSteps.push(step(1, 'discovery', 'read', 'Read likely entry point files for orientation.', { path: 'README.md' }, true));
    stopWhen.push('Ground one suspect symbol, then trace its call chain.',
      'Do not read every file in the repo; trace from one entry point.');
  } else {
    bestRoute = evidence.file
      ? {
          primary: 'read',
          toolName: 'read',
          args: { path: evidence.file },
          reason: 'Task not exact enough for code_nav_* yet. Narrow with current source first.',
          ladderPosition: ladderForFamily('read'),
        }
      : {
          primary: 'discovery',
          toolName: 'glob',
          args: { path: '*' },
          reason: 'Task still mixed or explanatory. Start with repo discovery (structural orientation), then exact hop.',
          ladderPosition: ladderForFamily('discovery'),
        };
    status = bestRoute.primary === 'read' ? 'needs-narrowing' : 'needs-discovery';
    steps.push(step(1, bestRoute.primary, bestRoute.toolName ?? 'glob', bestRoute.reason, bestRoute.args, true));
    if (evidence.symbol) {
      steps.push(step(2, 'code_nav', 'code_nav_get_symbol', 'Once current source confirms symbol, take exact body slice.', { symbol: evidence.symbol, file: evidence.file }, true));
    }
    fallbackSteps.push(step(1, 'discovery', 'glob', 'If still broad, inspect top-impact source files instead of thrashing across random reads.', { path: '**/*.{ts,js,tsx,jsx}', limit: 20 }, true));
    stopWhen.push('Stop once one concrete file or symbol becomes grounded enough for exact follow-up.');
  }

  const plan: NavigationPlan = {
    intent: intentResult.intent,
    status,
    confidence: intentResult.confidence,
    evidence,
    steps: steps.slice(0, limit),
    nextTool: steps[0]?.tool,
    nextArgs: steps[0]?.args,
    fallbackSteps: fallbackSteps.slice(0, Math.max(1, Math.min(2, limit))),
    stopWhen,
    bestRoute,
    freshSession: evidence.freshSession,
  };

  setLastPlannerResult({
    intent: plan.intent,
    route: plan.bestRoute.primary,
    nextTool: plan.nextTool,
  });

  return plan;
}
