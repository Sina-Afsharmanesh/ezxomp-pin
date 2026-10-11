import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';
import type { TSchema } from '@oh-my-pi/pi-ai';
import { getPluginSettings } from '@oh-my-pi/pi-coding-agent/extensibility/plugins';
import type { CodesightControllerProvider } from './commands.ts';
import { openCodesightOverlay } from './overlay.ts';
import { formatCompactSection, truncateText } from './format.ts';
import {
  projectRoot,
  renderCodesightCommand,
  resolveProjectPath,
  runCodesight,
  type CodesightRunResult,
} from './codesight.ts';
import {
  readChangeImpact,
  readEnv,
  readHotFiles,
  readImportGraph,
  readRoutes,
  readSchema,
  readSummary,
  readSymbolIndex,
  readWikiArticle,
  readWikiIndex,
} from './queries.ts';
import { getArtifactStatus } from './stale.ts';
import {
  normalizeCodesightSettings,
  type CodesightSettings,
} from './watcher.ts';


let getArtifactStatusImpl = getArtifactStatus;



export function setArtifactStatusProviderForTest(fn: typeof getArtifactStatus) {
  getArtifactStatusImpl = fn;
}

const ROOT_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
  },
};


const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    prefix: { type: 'string', description: 'Filter routes by path prefix like /api/users' },
    tag: { type: 'string', description: 'Filter routes by tag or subsystem label' },
    method: { type: 'string', description: 'Filter by HTTP method like GET, POST, PUT, DELETE' },
  },
};

const SCHEMA_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    model: { type: 'string', description: 'Filter schema by model name' },
  },
};

const BLAST_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    file: { type: 'string', description: 'Project-relative file path to analyze' },
    depth: { type: 'number', description: 'Max traversal depth', minimum: 1, maximum: 20 },
  },
  required: ['file'],
};

const ENV_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    requiredOnly: { type: 'boolean', description: 'If true, only return required environment variables' },
  },
};

const HOT_FILES_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    limit: { type: 'number', description: 'Maximum number of files to return', minimum: 1, maximum: 50 },
  },
};

const IMPORT_GRAPH_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    file: { type: 'string', description: 'Project-relative file path to analyze (omit for repo-wide summary)' },
    depth: { type: 'number', description: 'Max traversal depth for transitive deps/dependents', minimum: 1, maximum: 5 },
  },
};

const SYMBOL_INDEX_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    query: { type: 'string', description: 'Symbol name or file path substring to search for' },
    kind: { type: 'string', enum: ['function', 'interface', 'class', 'type', 'const'], description: 'Filter by symbol kind' },
  },
};

const CHANGE_IMPACT_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to read from' },
    file: { type: 'string', description: 'Project-relative file path to analyze' },
  },
  required: ['file'],
};

const REFRESH_SCHEMA = {
  type: 'object',
  properties: {
    directory: { type: 'string', description: 'Project directory to refresh' },
    wiki: { type: 'boolean', description: 'Generate wiki artifacts' },
    init: { type: 'boolean', description: 'Generate AGENTS.md and related AI context files' },
  },
};

type ToolResult = {
  content: string;
  details: Record<string, unknown>;
};

function textResult(content: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text' as const, text: content }],
    details,
  };
}

function rootForParams(params: { directory?: string }) {
  return projectRoot(params.directory ?? '.');
}

function extractText(value: unknown) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === 'object' && 'text' in item ? String((item as { text?: unknown }).text ?? '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function normalizeQueryResult(result: { content: string | string[]; details: Record<string, unknown> }): ToolResult {
  return {
    content: extractText(result.content),
    details: result.details,
  };
}

async function runRefresh(root: string): Promise<ToolResult> {
  const result = await runCodesight([], root);
  const output = truncateText(result.stdout || result.stderr || 'No output returned.', 4000);
  const header = result.ok ? 'CodeSight refreshed' : 'CodeSight refresh failed';
  return {
    content: formatCompactSection(header, [
      `- command: ${renderCodesightCommand([])}`,
      `- status: ${result.ok ? 'ok' : `failed (${result.exitCode})`}`,
      `- output: ${output}`,
    ]),
    details: { command: result.command, ok: result.ok, exitCode: result.exitCode, stderr: result.stderr },
  };
}


function emitSessionMessage(pi: ExtensionAPI, kind: string, content: string, details: Record<string, unknown>) {
  pi.sendMessage({
    customType: `codesight-${kind}`,
    content,
    display: true,
    details,
  });
}

export function registerCodesightTools(pi: ExtensionAPI, getController?: CodesightControllerProvider) {
  const toolDefinitions = [
    {
      name: 'codesight_get_wiki_index',
      label: 'CodeSight Wiki Index',
      description: 'Read the codesight wiki index for fast repo orientation',
      parameters: ROOT_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string }) => {
        const result = readWikiIndex(rootForParams(params));
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_wiki_article',
      label: 'CodeSight Wiki Article',
      description: 'Read one codesight wiki article by subsystem name',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project directory to read from' },
          article: { type: 'string', description: 'Wiki article name like auth, database, payments, overview' },
        },
        required: ['article'],
      },
      execute: async (_toolCallId: string, params: { directory?: string; article: string }) => {
        const result = readWikiArticle(rootForParams(params), params.article);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_summary',
      label: 'CodeSight Summary',
      description: 'Get compact codesight project overview',
      parameters: ROOT_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string }) => {
        const result = readSummary(rootForParams(params));
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_routes',
      label: 'CodeSight Routes',
      description: 'Get routes filtered by prefix, tag, or HTTP method',
      parameters: ROUTE_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; prefix?: string; tag?: string; method?: string }) => {
        const result = readRoutes(rootForParams(params), { prefix: params.prefix, tag: params.tag, method: params.method });
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_schema',
      label: 'CodeSight Schema',
      description: 'Get schema or one model summary',
      parameters: SCHEMA_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; model?: string }) => {
        const result = readSchema(rootForParams(params), params.model);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_blast_radius',
      label: 'CodeSight Blast Radius',
      description: 'Analyze impact before changing a file',
      parameters: BLAST_SCHEMA,
      execute: async (
        _toolCallId: string,
        params: { directory?: string; file: string; depth?: number },
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ExtensionContext,
      ) => {
        const root = rootForParams(params);
        const target = resolveProjectPath(root, params.file);
        if (!target) {
          return textResult(
            formatCompactSection('Invalid blast target', [`- file: ${params.file}`, `- root: ${root}`, '- hint: file must stay inside the selected project root']),
            { file: params.file, root, ok: false },
          );
        }

        const args = ['--blast', params.file];
        if (typeof params.depth === 'number') args.push('--depth', String(params.depth));
        const result = await runCodesight(args, root);
        const output = truncateText(result.stdout || result.stderr || 'No output returned.', 4000);
        const header = result.ok ? 'CodeSight blast radius' : 'CodeSight blast radius failed';
        return textResult(
          formatCompactSection(header, [
            `- file: ${params.file}`,
            `- command: ${renderCodesightCommand(args)}`,
            `- status: ${result.ok ? 'ok' : `failed (${result.exitCode})`}`,
            `- output: ${output}`,
          ]),
          { file: params.file, root, command: result.command, ok: result.ok, exitCode: result.exitCode, stderr: result.stderr },
        );
      },
    },
    {
      name: 'codesight_get_env',
      label: 'CodeSight Env',
      description: 'Get environment variables detected by codesight',
      parameters: ENV_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; required_only?: boolean; requiredOnly?: boolean }) => {
        const result = readEnv(rootForParams(params), params.required_only ?? params.requiredOnly ?? false);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_hot_files',
      label: 'CodeSight Hot Files',
      description: 'Get the most imported high-impact files',
      parameters: HOT_FILES_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; limit?: number }) => {
        const result = readHotFiles(rootForParams(params), params.limit ?? 10);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_import_graph',
      label: 'CodeSight Import Graph',
      description: 'Get structured dependency data from codesight import map',
      parameters: IMPORT_GRAPH_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; file?: string; depth?: number }) => {
        const result = readImportGraph(rootForParams(params), params.file, params.depth ?? 1);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_symbol_index',
      label: 'CodeSight Symbol Index',
      description: 'Search symbols across the codebase from codesight library data',
      parameters: SYMBOL_INDEX_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; query?: string; kind?: string }) => {
        const result = readSymbolIndex(rootForParams(params), params.query, params.kind);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_get_change_impact',
      label: 'CodeSight Change Impact',
      description: 'Assess edit risk by combining import graph, coverage, and related routes/models',
      parameters: CHANGE_IMPACT_SCHEMA,
      execute: async (_toolCallId: string, params: { directory?: string; file: string; symbol?: string }) => {
        const result = readChangeImpact(rootForParams(params), params.file);
        return textResult(result.content, result.details as Record<string, unknown>);
      },
    },
    {
      name: 'codesight_refresh',
      label: 'CodeSight Refresh',
      description: 'Re-scan CodeSight-generated artifacts',
      parameters: REFRESH_SCHEMA,
      execute: async (
        _toolCallId: string,
        params: { directory?: string },
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ExtensionContext,
      ) => {
        if (getController && !params.directory) {
          const result = await getController(ctx).refresh();
          return textResult(formatCommandResult('CodeSight refreshed', result), {
            command: result.command,
            ok: result.ok,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
          });
        }
        const result = await runRefresh(rootForParams(params));
        return textResult(result.content, result.details);
      },
    },
  ] as const;

  for (const definition of toolDefinitions) {
    pi.registerTool<TSchema>({
      name: definition.name,
      label: definition.label,
      description: definition.description,
      parameters: definition.parameters,
      execute: definition.execute,
    });
  }
}

function formatCommandResult(title: string, result: CodesightRunResult): string {
  return formatCompactSection(title, [
    `- command: ${result.command}`,
    `- status: ${result.ok ? 'ok' : `failed (${result.exitCode})`}`,
    `- output: ${truncateText(result.stdout || result.stderr || result.error || 'No output returned.', 4000)}`,
  ]);
}

function settingsFromManifest(raw: Record<string, unknown>): CodesightSettings {
  const settings: Partial<CodesightSettings> = {};
  for (const key of ['watchFiles', 'regenerateWiki', 'showFooter', 'showStartupModal', 'notifyOnWatchError'] as const) {
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
  }
  return normalizeCodesightSettings(settings);
}

export function registerCodesightCommands(pi: ExtensionAPI, getController: CodesightControllerProvider) {
  pi.registerCommand('codesight-refresh', {
    description: 'Re-scan CodeSight-generated artifacts',
    handler: async (_args, ctx) => {
      const result = await getController(ctx).refresh();
      const text = formatCommandResult('CodeSight refreshed', result);
      ctx.ui.notify(text, result.ok ? 'info' : 'warning');
      emitSessionMessage(pi, 'refresh', text, {
        command: result.command,
        ok: result.ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      });
    },
  });

  pi.registerCommand('codesight-init', {
    description: 'Generate CodeSight wiki and AI context artifacts',
    handler: async (_args, ctx) => {
      const result = await getController(ctx).init();
      const text = formatCommandResult('CodeSight init completed', result);
      ctx.ui.notify(text, result.ok ? 'info' : 'warning');
      emitSessionMessage(pi, 'init', text, {
        command: result.command,
        ok: result.ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      });
    },
  });

  pi.registerCommand('wiki', {
    description: 'Read the CodeSight wiki index or article',
    handler: async (args, ctx) => {
      const root = projectRoot(ctx.cwd);
      const article = args.trim();
      const result = article ? normalizeQueryResult(readWikiArticle(root, article)) : normalizeQueryResult(readWikiIndex(root));
      ctx.ui.notify(result.content, 'info');
      emitSessionMessage(pi, 'wiki', result.content, result.details);
    },
  });

  pi.registerCommand('blast', {
    description: 'Run a CodeSight blast-radius query for a file',
    handler: async (args, ctx) => {
      const file = args.trim();
      if (!file) {
        ctx.ui.notify('Usage: /blast <file>', 'warning');
        return;
      }
      const root = projectRoot(ctx.cwd);
      const target = resolveProjectPath(root, file);
      if (!target) {
        ctx.ui.notify('Blast target must stay inside the project root', 'warning');
        return;
      }

      const result = await getController(ctx).run(['--blast', file]);
      const text = truncateText(result.stdout || result.stderr || result.error || 'No output returned.', 4000);
      ctx.ui.notify(text, result.ok ? 'info' : 'warning');
      emitSessionMessage(pi, 'blast', text, {
        file,
        command: result.command,
        ok: result.ok,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      });
    },
  });
}

export function registerSessionNotice(pi: ExtensionAPI, getController: CodesightControllerProvider) {
  let reconciler: Timer | undefined;
  pi.on('session_start', async (_event, ctx: ExtensionContext) => {
    const controller = getController(ctx);
    const raw = await getPluginSettings('@ezxomp/codesight', ctx.cwd).catch(() => ({}));
    const settings = settingsFromManifest(raw);
    controller.updateSettings(settings);
    await controller.reconcile(settings);

    const status = getArtifactStatusImpl(ctx.cwd);
    if (status.missing.length > 0) {
      const needsInit = status.missing.some((path) => path.endsWith('AGENTS.md'));
      ctx.ui.notify(
        needsInit
          ? 'CodeSight setup incomplete: AGENTS.md missing. Use /codesight-init.'
          : `CodeSight artifacts missing: ${status.missing.join(', ')}. Use /codesight-refresh.`,
      );
    } else if (status.stale) {
      ctx.ui.notify('CodeSight artifacts may be stale. Use /codesight-refresh when the repo changes.', 'warning');
    }

    if (ctx.hasUI && settings.showStartupModal && (status.missing.length > 0 || status.stale)) {
      await openCodesightOverlay(ctx, controller);
    }

    reconciler = ctx.setInterval(() => {
      void getPluginSettings('@ezxomp/codesight', ctx.cwd)
        .then((next) => controller.reconcile(settingsFromManifest(next)))
        .catch(() => undefined);
    }, 1000);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    if (reconciler) ctx.clearTimer(reconciler);
    await getController(ctx).dispose();
  });
}
