import type { AgentToolResult, ExtensionAPI } from '@oh-my-pi/pi-coding-agent';
import type { TSchema } from '@oh-my-pi/pi-ai';
import { astGrepReplaceTool } from './tools/ast-grep-replace.ts';
import { astGrepSearchTool } from './tools/ast-grep-search.ts';
import { buildCacheKey, getFileMtimeMs, readFreshCache, setCache } from './cache.ts';
import { formatCompactSection } from './format.ts';
import { formatNavigationPlan } from './plan-format.ts';
import { planNavigation } from './navigation-planner.ts';
import { rankContext } from './ranking.ts';
import { findDefinition, findReferences, getSymbolSlice } from './symbols.ts';
import { traceCallChain } from './trace.ts';
import { compareImplementations } from './compare.ts';
import type {
  CompareQuery,
  CompareResult,
  DefinitionQuery,
  DefinitionResult,
  NavigationPlan,
  PlannerQuery,
  ReferenceQuery,
  ReferenceResult,
  TraceQuery,
  TraceResult,
} from './types.ts';

const DEFINITION_CACHE_PREFIX = 'symbol:def';
const REFERENCES_CACHE_PREFIX = 'symbol:refs';
const TRACE_CACHE_PREFIX = 'symbol:trace';
const COMPARE_CACHE_PREFIX = 'symbol:compare';
const NAVIGATION_CACHE_PREFIX = 'nav:plan';
type ToolResult = AgentToolResult<unknown>;

function textToolResult(content: string, details: unknown = {}): ToolResult {
  return {
    content: [{ type: 'text' as const, text: content }],
    details,
  };
}

async function buildDefinitionResult(params: DefinitionQuery): Promise<DefinitionResult> {
  const cacheKey = buildCacheKey(DEFINITION_CACHE_PREFIX, {
    symbol: params.symbol.trim(),
    file: params.file,
  });
  const fileMtime = params.file ? getFileMtimeMs(params.file) : undefined;
  const cached = readFreshCache<DefinitionResult>(cacheKey, fileMtime);
  if (cached) return cached;

  const result = await findDefinition(params);
  setCache(cacheKey, result, fileMtime);
  return result;
}

async function buildReferenceResult(params: ReferenceQuery): Promise<ReferenceResult> {
  const limit = params.limit ?? 20;
  const cacheKey = buildCacheKey(REFERENCES_CACHE_PREFIX, {
    symbol: params.symbol.trim(),
    file: params.file,
    limit,
  });
  const fileMtime = params.file ? getFileMtimeMs(params.file) : undefined;
  const cached = readFreshCache<ReferenceResult>(cacheKey, fileMtime);
  if (cached) return cached;

  const result = await findReferences(params);
  setCache(cacheKey, result, fileMtime);
  return result;
}

async function buildTraceResult(params: TraceQuery): Promise<TraceResult> {
  const cacheKey = buildCacheKey(TRACE_CACHE_PREFIX, {
    symbol: params.symbol.trim(),
    file: params.file,
    depth: params.depth ?? 1,
    limit: params.limit ?? 8,
  });
  const fileMtime = params.file ? getFileMtimeMs(params.file) : undefined;
  const cached = readFreshCache<TraceResult>(cacheKey, fileMtime);
  if (cached) return cached;

  const result = await traceCallChain(params);
  setCache(cacheKey, result, fileMtime);
  return result;
}

async function buildCompareResult(params: CompareQuery): Promise<CompareResult> {
  const cacheKey = buildCacheKey(COMPARE_CACHE_PREFIX, {
    symbol: params.symbol,
    pattern: params.pattern,
    scope: params.scope,
    limit: params.limit ?? 8,
  });
  const cached = readFreshCache<CompareResult>(cacheKey);
  if (cached) return cached;

  const result = await compareImplementations(params);
  setCache(cacheKey, result);
  return result;
}

function buildNavigationPlanResult(params: PlannerQuery): NavigationPlan {
  const cacheKey = buildCacheKey(NAVIGATION_CACHE_PREFIX, {
    task: params.task,
    symbol: params.symbol,
    file: params.file,
    mode: params.mode,
    limit: params.limit,
    depth: params.depth,
  });
  const cached = readFreshCache<NavigationPlan>(cacheKey);
  if (cached) return cached;
  const result = planNavigation(params);
  setCache(cacheKey, result);
  return result;
}

export function registerPiLspTools(pi: ExtensionAPI): void {
  pi.registerTool<TSchema>({
    name: 'code_nav_get_symbol',
    label: 'Code Nav Get Symbol',
    description: 'Read one exact grounded symbol definition with minimal code and jump-ready follow-up hints.',
    parameters: pi.zod.object({
      symbol: pi.zod.string().describe('Symbol name like runRefresh or UserService'),
      file: pi.zod.string().optional().describe('Optional file path hint to narrow lookup'),
      includeBody: pi.zod.boolean().optional().describe('Include the full definition body when possible'),
      contextLines: pi.zod.number().min(0).max(50).optional().describe('Extra lines around the symbol'),
    }),
    execute: async (
      _toolCallId: string,
      params: { symbol: string; file?: string; includeBody?: boolean; contextLines?: number },
    ): Promise<ToolResult> => {
      const result = await getSymbolSlice(params);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool<TSchema>({
    name: 'code_nav_find_definition',
    label: 'Code Nav Find Definition',
    description: 'Find the exact definition location for a grounded symbol.',
    parameters: pi.zod.object({
      symbol: pi.zod.string().describe('Symbol to resolve'),
      file: pi.zod.string().optional().describe('Optional file hint'),
    }),
    execute: async (_toolCallId: string, params: DefinitionQuery): Promise<ToolResult> => {
      const result = await buildDefinitionResult(params);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool<TSchema>({
    name: 'code_nav_find_references',
    label: 'Code Nav Find References',
    description: 'Find grounded symbol usages with grouped hits and prioritized caller files.',
    parameters: pi.zod.object({
      symbol: pi.zod.string().describe('Symbol to find usages for'),
      file: pi.zod.string().optional().describe('Optional file hint'),
      limit: pi.zod.number().int().min(1).max(100).optional().describe('Maximum number of matches'),
    }),
    execute: async (_toolCallId: string, params: ReferenceQuery): Promise<ToolResult> => {
      const result = await buildReferenceResult(params);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool<TSchema>({
    name: 'code_nav_trace',
    label: 'Code Nav Trace',
    description: 'Trace a bounded transitive call chain from a grounded symbol.',
    parameters: pi.zod.object({
      symbol: pi.zod.string().describe('Symbol to trace from'),
      file: pi.zod.string().optional().describe('Optional file hint for the symbol definition'),
      depth: pi.zod.number().int().min(1).max(3).optional().describe('Number of hops to trace'),
      limit: pi.zod.number().int().min(3).max(20).optional().describe('Maximum callers per hop'),
    }),
    execute: async (_toolCallId: string, params: TraceQuery): Promise<ToolResult> => {
      const result = await buildTraceResult(params);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool<TSchema>({
    name: 'code_nav_compare',
    label: 'Code Nav Compare',
    description: 'Compare similar implementations across files and identify common patterns and outliers.',
    parameters: pi.zod.object({
      symbol: pi.zod.string().optional().describe('Symbol name to compare'),
      pattern: pi.zod.string().optional().describe('AST pattern to compare instead of a symbol'),
      scope: pi.zod.string().optional().describe('Optional file or directory scope'),
      limit: pi.zod.number().int().min(2).max(15).optional().describe('Maximum implementations to compare'),
    }),
    execute: async (_toolCallId: string, params: CompareQuery): Promise<ToolResult> => {
      const result = await buildCompareResult(params);
      return textToolResult(result.content, result.details);
    },
  });

  pi.registerTool<TSchema>({
    name: 'code_nav_rank_context',
    label: 'Code Nav Rank Context',
    description: 'Prioritize files and symbols already observed in this OMP session; never use for first-pass discovery.',
    parameters: pi.zod.object({
      query: pi.zod.string().optional().describe('Task or question to prioritize'),
      limit: pi.zod.number().int().min(1).max(20).optional().describe('Maximum ranked items'),
    }),
    execute: async (_toolCallId: string, params: { query?: string; limit?: number }): Promise<ToolResult> => {
      const result = rankContext(params.query ?? '', params.limit ?? 10);
      const content = formatCompactSection(
        result.sessionState.hasConcreteEvidence ? 'Session context ranking' : 'Fresh-session warning',
        [
          `- query: ${result.query || '(empty)'}`,
          `- session files mentioned: ${result.sessionState.mentionedFiles}`,
          `- session files read: ${result.sessionState.readFiles}`,
          `- session symbols queried: ${result.sessionState.queriedSymbols}`,
          `- concrete session evidence: ${result.sessionState.hasConcreteEvidence ? 'yes' : 'no'}`,
          `- status: ${result.status}`,
          `- confidence: ${result.confidence}`,
          `- rerun after evidence: ${result.shouldRerunAfterEvidence ? 'recommended' : 'not needed'}`,
          `- note: ${result.note}`,
          ...result.guidance.map((line) => `- guidance: ${line}`),
          ...(result.items.length > 0
            ? result.items.map((item) => `- ${item.kind}: ${item.id} (${item.score}) — ${item.reason}`)
            : [result.sessionState.hasConcreteEvidence ? '- ranked items: none yet' : '- ranked items: withheld until some session evidence exists']),
        ],
      );
      return textToolResult(content, {
        query: result.query,
        items: result.items,
        sessionState: result.sessionState,
        note: result.note,
        guidance: result.guidance,
        status: result.status,
        confidence: result.confidence,
        shouldRerunAfterEvidence: result.shouldRerunAfterEvidence,
        freshSession: !result.sessionState.hasConcreteEvidence,
      });
    },
  });

  pi.registerTool<TSchema>({
    name: 'code_nav_plan_navigation',
    label: 'Code Nav Plan Navigation',
    description: 'Plan one to four bounded navigation hops using native glob, grep, read, lsp, ast_edit, code_nav tools, or answer-now.',
    parameters: pi.zod.object({
      task: pi.zod.string().describe('Task to route'),
      symbol: pi.zod.string().optional().describe('Optional exact symbol if already grounded'),
      file: pi.zod.string().optional().describe('Optional file hint'),
      mode: pi.zod.enum(['auto', 'inspect', 'trace', 'impact', 'debug', 'explain']).optional(),
      limit: pi.zod.number().int().min(1).max(4).optional(),
      depth: pi.zod.number().int().min(1).max(3).optional(),
    }),
    execute: async (_toolCallId: string, params: PlannerQuery): Promise<ToolResult> => {
      const plan = buildNavigationPlanResult(params);
      return textToolResult(formatNavigationPlan(plan), {
        intent: plan.intent,
        status: plan.status,
        confidence: plan.confidence,
        evidence: plan.evidence,
        steps: plan.steps,
        nextTool: plan.nextTool,
        nextArgs: plan.nextArgs,
        fallbackSteps: plan.fallbackSteps,
        stopWhen: plan.stopWhen,
        bestRoute: plan.bestRoute,
        freshSession: plan.freshSession,
      });
    },
  });

  pi.registerTool<TSchema>(astGrepSearchTool(pi));
  pi.registerTool<TSchema>(astGrepReplaceTool(pi));
}
