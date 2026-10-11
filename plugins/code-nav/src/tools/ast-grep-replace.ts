/** Plugin-owned AST-grep replacement tool backed by the local `sg` executable. */

import type { AgentToolResult, ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import { formatMatches, sgAvailable, sgReplaceApply, sgReplaceDry } from '../sg-runner.ts';
import { LANGUAGES } from './shared.ts';

export function astGrepReplaceTool(pi: ExtensionAPI) {
  return {
    name: 'ast_grep_replace' as const,
    label: 'AST Replace',
    description:
      'Replace code with an AST-aware pattern. Dry-run by default; use apply=true only after reviewing the scoped preview. This plugin-owned tool is distinct from native ast_edit.',
    parameters: pi.zod.object({
      pattern: pi.zod.string().describe('AST pattern to match'),
      rewrite: pi.zod.string().describe('Replacement using metavariables from pattern'),
      lang: pi.zod.string().describe(`Target language (${LANGUAGES.join(', ')})`),
      paths: pi.zod.array(pi.zod.string()).optional().describe('Specific files or folders'),
      apply: pi.zod.boolean().optional().describe('Apply changes; defaults to dry-run'),
    }),
    execute: async (
      _toolCallId: string,
      params: { pattern: string; rewrite: string; lang: string; paths?: string[]; apply?: boolean },
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

      const searchPaths = params.paths?.length ? params.paths : [ctx.cwd];
      const result = params.apply
        ? await sgReplaceApply(params.pattern, params.rewrite, params.lang, searchPaths)
        : await sgReplaceDry(params.pattern, params.rewrite, params.lang, searchPaths);

      if (result.error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
          isError: true,
          details: {},
        };
      }

      return {
        content: [{ type: 'text' as const, text: formatMatches(result.matches, !params.apply, true) }],
        details: { matchCount: result.matches.length, applied: params.apply ?? false },
      };
    },
  };
}
