/** Plugin-owned AST-grep search tool backed by the local `sg` executable. */

import type { AgentToolResult, ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { formatMatches, sgAvailable, sgSearch } from '../sg-runner.ts';
import { LANGUAGES } from './shared.ts';

function looksLikeRuleYamlOrPlainText(pattern: string): boolean {
  const text = pattern.trim();
  if (!text) return true;

  const lower = text.toLowerCase();
  if (/(^|\n)\s*(id|language|rule|rules|kind|pattern|message|severity)\s*:/.test(lower)) return true;
  if (/\b(id|language|rule|rules|kind|pattern|message|severity)\s*:\s*[a-z0-9_-]+/i.test(text)) return true;
  if (/^[-*]\s+/.test(text)) return true;

  const hasAstSignals = /[$(){}\[\].;:'"`]/.test(text);
  const hasWhitespace = /\s/.test(text);
  return hasWhitespace && !hasAstSignals;
}

export function astGrepSearchTool(pi: ExtensionAPI) {
  return {
    name: 'ast_grep_search' as const,
    label: 'AST Search',
    description:
      'Search code with AST-aware pattern matching. Use a specific code pattern, scope paths narrowly, and use selector/context when needed. This plugin-owned tool is distinct from native ast_edit.',
    parameters: pi.zod.object({
      pattern: pi.zod.string().describe('AST code pattern, not plain text or rule YAML'),
      lang: pi.zod.string().describe(`Target language (${LANGUAGES.join(', ')})`),
      paths: pi.zod.array(pi.zod.string()).optional().describe('Specific files or folders to search'),
      selector: pi.zod.string().optional().describe('AST node selector such as name or body'),
      context: pi.zod.number().int().min(0).optional().describe('Lines before and after each match'),
    }),
    execute: async (
      _toolCallId: string,
      params: { pattern: string; lang: string; paths?: string[]; selector?: string; context?: number },
      _signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<Record<string, unknown>>> => {
      if (!sgAvailable()) {
        return {
          content: [{ type: 'text' as const, text: 'ast-grep (sg) not found in PATH.' }],
          isError: true,
          details: {},
        };
      }

      if (looksLikeRuleYamlOrPlainText(params.pattern)) {
        return {
          content: [{ type: 'text' as const, text: 'Error: ast_grep_search expects a valid AST code pattern. Use native grep/read for plain text.' }],
          isError: true,
          details: {},
        };
      }

      const searchPaths = params.paths?.length ? params.paths : [ctx.cwd];
      const result = await sgSearch(params.pattern, params.lang, searchPaths, {
        selector: params.selector,
        context: params.context,
      });

      if (result.error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
          isError: true,
          details: {},
        };
      }

      return {
        content: [{ type: 'text' as const, text: formatMatches(result.matches) }],
        details: { matchCount: result.matches.length },
      };
    },
  };
}
