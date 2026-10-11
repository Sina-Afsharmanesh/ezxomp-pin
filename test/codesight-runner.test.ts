import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  formatCodesightInvocation,
  resolveCodesightInvocation,
  type CodesightRunResult,
} from '../plugins/codesight/src/codesight.ts';
import {
  CodesightWatcherController,
  DEFAULT_CODESIGHT_SETTINGS,
  normalizeCodesightSettings,
} from '../plugins/codesight/src/watcher.ts';
import { readWikiArticle } from '../plugins/codesight/src/queries.ts';

describe('CodeSight bundled CLI runner', () => {
  test('uses the git-tracked bundle for invocation', () => {
    const invocation = resolveCodesightInvocation(['--wiki']);

    expect(invocation.executable).toEndWith('plugins/codesight/codesight.bundle.js');
    expect(invocation.executable).not.toBe(process.execPath);
    expect(invocation.args).toEqual(['--wiki']);
    expect(formatCodesightInvocation(invocation)).toContain('codesight.bundle.js');
  });

  test('refreshes call the runner without strategy', async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const result: CodesightRunResult = {
      command: 'test',
      cwd: '/tmp',
      exitCode: 0,
      stdout: '',
      stderr: '',
      ok: true,
    };
    const controller = new CodesightWatcherController({
      cwd: '/tmp',
      hasUI: false,
      ui: { setStatus() {} },
    } as never, {
      runner: async (args, cwd) => {
        calls.push({ args, cwd: cwd ?? '/tmp' });
        return result;
      },
    });

    await controller.refresh();

    expect(calls).toEqual([{ args: ['--wiki'], cwd: '/tmp' }]);
  });

  test('settings only normalize watcher/display booleans', () => {
    expect(DEFAULT_CODESIGHT_SETTINGS.watchFiles).toBe(true);
    expect(normalizeCodesightSettings({ watchFiles: false }).watchFiles).toBe(false);
    expect(normalizeCodesightSettings({ watchFiles: 'no' as never }).watchFiles).toBe(false);
  });

  test('ignores executable project codesight config while scanning', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'ezxomp-codesight-config-'));
    const sentinel = join(fixture, 'sentinel');
    try {
      mkdirSync(join(fixture, 'src'), { recursive: true });
      writeFileSync(join(fixture, 'src', 'index.ts'), 'export const value = 1;\n');
      writeFileSync(
        join(fixture, 'codesight.config.js'),
        `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(sentinel)}, 'pwned');
export default { outputDir: '.codesight', maxDepth: 1 };
`,
      );

      const invocation = resolveCodesightInvocation(['--wiki']);
      const result = spawnSync(invocation.executable, invocation.args, {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 20_000,
      });

      expect(result.status).toBe(0);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

describe('CodeSight wiki queries', () => {
  test('rejects escaped article names before reading files', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'ezxomp-codesight-wiki-'));
    try {
      mkdirSync(join(fixture, '.codesight', 'wiki'), { recursive: true });
      writeFileSync(join(fixture, '.codesight', 'wiki', 'valid-article.md'), '# Valid\n');
      writeFileSync(join(fixture, '.codesight', 'secret.md'), 'secret sibling\n');

      const escaped = readWikiArticle(fixture, '../secret');
      expect(escaped.details).toEqual({ article: '../secret', exists: false, error: 'invalid-article' });
      expect(escaped.content).toContain('Invalid codesight wiki article');
      expect(escaped.content).not.toContain('secret sibling');

      const valid = readWikiArticle(fixture, 'valid-article');
      expect(valid.details).toEqual({
        article: 'valid-article',
        path: join(fixture, '.codesight', 'wiki', 'valid-article.md'),
        exists: true,
      });
      expect(valid.content).toBe('# Valid\n');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
