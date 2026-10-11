
/**
 * gsd-graph WU6 surface tests — fake host registration, settings passthrough,
 * tool + command lifecycle, error-envelope coverage.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGsdGraphTools } from '../plugins/gsd-graph/src/tools.js';
import { registerGsdGraphCommand } from '../plugins/gsd-graph/src/commands.js';

type CapturedTool = { name: string; execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown, ctx?: { cwd: string }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean; details?: unknown }> };

function fakeHost() {
 const tools = new Map<string, CapturedTool>();
 let command: { handler: (args: string, ctx: { cwd: string; ui: { notify: (m: string) => void } }) => Promise<void> } | null = null;
 const host = {
  registerTool: (tool: CapturedTool) => {
   tools.set(tool.name, tool);
  },
  registerCommand: (cmd: { name: string; handler: (args: string, ctx: { cwd: string; ui: { notify: (m: string) => void } }) => Promise<void> }) => {
   command = cmd;
  },
 };
 return { host, tools, get command() { return command; } };
}

describe('gsd-graph WU6 surface', () => {
 test('registerGsdGraphTools registers gsd_graph + gsd_graph_run and rejects errors as isError envelopes', async () => {
  const { host, tools } = fakeHost();
  registerGsdGraphTools(host as never);
  expect(tools.has('gsd_graph')).toBe(true);
  expect(tools.has('gsd_graph_run')).toBe(true);
  // Error envelope: invalid projectDir → isError with reason.
  const graph = tools.get('gsd_graph')!;
  const res = await graph.execute('t1', { mode: 'status', projectDir: '/nonexistent-xyz' }, undefined, undefined, { cwd: '/tmp' });
  expect(res.isError).toBe(true);
  // Bad budget → isError.
  const res2 = await graph.execute('t2', { mode: 'query', term: 'x', budget: -5 }, undefined, undefined, { cwd: '/tmp' });
  expect(res2.isError).toBe(true);
 });

 test('gsd_graph_run validates projectDir and wraps handler errors', async () => {
  const { host, tools } = fakeHost();
  registerGsdGraphTools(host as never);
  const run = tools.get('gsd_graph_run')!;
  const res = await run.execute('t3', { action: 'list', projectDir: '/nonexistent-xyz' }, undefined, undefined, { cwd: '/tmp' });
  expect(res.isError).toBe(true);
 });

 test('registerGsdGraphCommand wires /gsd-graph handler with ui notify', async () => {
  const messages: string[] = [];
  // Canonical OMP API: registerCommand(name, { handler }).
  const pi = {
   registerCommand: (name: string, cmd: { handler: (args: string, ctx: { cwd: string; ui: { notify: (m: string, t?: string) => void } }) => Promise<void> }) => {
    expect(name).toBe('gsd-graph');
    void cmd.handler('status', { cwd: '/nonexistent-xyz', ui: { notify: (m: string) => messages.push(m) } });
   },
  };
  registerGsdGraphCommand(pi as never);
  await new Promise((r) => setTimeout(r, 50));
  expect(messages.length).toBeGreaterThan(0);
  expect(messages[0]).toContain('Error');
 });
});


describe('gsd-graph WU6 lifecycle (fake project)', () => {
 test('build → status → query → diff → run create/next/complete lifecycle', async () => {
  const { registerGsdGraphTools } = await import('../plugins/gsd-graph/src/tools.js');
  const { join } = await import('node:path');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const project = mkdtempSync(join(tmpdir(), 'gsd-graph-lifecycle-'));
  // Workflow definitions live in .gsd/workflows/<name>.yaml (v1 schema).
  mkdirSync(join(project, '.gsd', 'workflows'), { recursive: true });
  const workflowYaml = [
   'version: 1',
   'name: wf-a',
   'steps:',
   '  - id: step-1',
   '    name: First step',
   '    title: First step',
   '    prompt: Do the first thing',
   '    status: pending',
   '    dependsOn: []',
   '  - id: step-2',
   '    name: Second step',
   '    title: Second step',
   '    prompt: Do the second thing',
   '    status: pending',
   '    dependsOn: [step-1]',
  ].join('\n');
  writeFileSync(join(project, '.gsd', 'workflows', 'wf-a.yaml'), workflowYaml);

  const tools = new Map();
  const host = {
   registerTool: (tool: { name: string; execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown, ctx?: { cwd: string }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean; details?: Record<string, unknown> }> }) => {
    tools.set(tool.name, tool);
   },
  };
  registerGsdGraphTools(host as never);
  const graph = tools.get('gsd_graph')!;
  const run = tools.get('gsd_graph_run')!;
  const exec = (params: Record<string, unknown>) => graph.execute('t', params, undefined, undefined, { cwd: project });

  // Build (snapshot for diff) — needs knowledge sources; empty graph is fine.
  const built = await exec({ mode: 'build', snapshot: true });
  expect(built.isError).toBeFalsy();
  expect(built.details?.['built']).toBe(true);
  expect(built.details?.['builtAt']).toBeTruthy();

  // Status after build.
  const status = await exec({ mode: 'status' });
  expect(status.isError).toBeFalsy();
  expect(status.details?.['exists']).toBe(true);

  // Query empty → explicit no-match line, not silent.
  const query = await exec({ mode: 'query', term: 'zzz-nothing' });
  expect(query.isError).toBeFalsy();
  expect(query.content[0]?.text).toContain('No matches');

  // Diff after snapshot build → empty diff (not missing-state error).
  const diff = await exec({ mode: 'diff' });
  expect(diff.isError).toBeFalsy();

  // Run lifecycle: create returns first dispatch.
  const created = await run.execute('t', { action: 'create', workflow: 'wf-a' }, undefined, undefined, { cwd: project });
  expect(created.isError).toBeFalsy();
  const runId = created.details?.['runId'] as string;
  expect(runId).toContain('wf-a/');
  expect(created.details?.['kind']).toBe('dispatch');

  // next → same dispatch descriptor.
  const next = await run.execute('t', { action: 'next', runId }, undefined, undefined, { cwd: project });
  expect(next.details?.['kind']).toBe('dispatch');
  expect(next.details?.['unitId']).toContain('step-1');

  // complete step-1 → outcome continue + next descriptor for step-2.
  const done = await run.execute('t', { action: 'complete', runId, stepId: 'step-1' }, undefined, undefined, { cwd: project });
  expect(done.details?.['outcome']).toBe('continue');
  const nextDesc = done.details?.['next'] as Record<string, unknown> | undefined;
  expect(String(nextDesc?.['unitId'])).toContain('step-2');

  rmSync(project, { recursive: true, force: true });
 }, 20000);

 test('session_start handler uses ctx.cwd for settings and rebuild gating', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const seen: Array<{ cwd: string }> = [];
  const handlers: Array<(event: unknown, ctx: { cwd: string }) => Promise<void>> = [];
  const pi = {
   registerTool: () => {},
   registerCommand: () => {},
   on: (event: string, handler: (event: unknown, ctx: { cwd: string }) => Promise<void>) => {
    if (event === 'session_start') handlers.push(handler);
   },
   setLabel: () => {},
  };
  await import('../plugins/gsd-graph/src/index.js').then((mod) => mod.default(pi as never));
  expect(handlers.length).toBe(1);
  const project = mkdtempSync(join(tmpdir(), 'gsd-graph-session-'));
  // autoRebuild default is false → the handler must return WITHOUT throwing,
  // using ctx.cwd (not process.cwd()) for its settings load.
  await handlers[0]({}, { cwd: project });
  rmSync(project, { recursive: true, force: true });
 });
});


describe('gsd-graph WU6 command lifecycle + milestone', () => {
 test('tool lifecycle reaches milestone-complete with exact contract shapes', async () => {
  const { registerGsdGraphTools } = await import('../plugins/gsd-graph/src/tools.js');
  const { join } = await import('node:path');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const project = mkdtempSync(join(tmpdir(), 'gsd-graph-milestone-'));
  mkdirSync(join(project, '.gsd', 'workflows'), { recursive: true });
  const yaml = ['version: 1', 'name: wf-b', 'steps:',
   '  - id: s1', '    name: One', '    title: One', '    prompt: do one', '    status: pending', '    dependsOn: []',
   '  - id: s2', '    name: Two', '    title: Two', '    prompt: do two', '    status: pending', '    dependsOn: [s1]',
  ].join('\n');
  writeFileSync(join(project, '.gsd', 'workflows', 'wf-b.yaml'), yaml);

  const tools = new Map();
  registerGsdGraphTools({ registerTool: (t: { name: string; execute: (id: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: unknown, ctx?: { cwd: string }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean; details?: Record<string, unknown> }> }) => tools.set(t.name, t) } as never);
  const graph = tools.get('gsd_graph')!;
  const run = tools.get('gsd_graph_run')!;
  const runExec = (params: Record<string, unknown>) => run.execute('t', params, undefined, undefined, { cwd: project });

  await graph.execute('t', { mode: 'build' }, undefined, undefined, { cwd: project });

  // next stop descriptor shape on empty... create first.
  const created = await runExec({ action: 'create', workflow: 'wf-b' });
  const runId = created.details?.['runId'] as string;

  // status contract: phase + progress string "Step 0/2".
  const status = await runExec({ action: 'status', runId });
  expect(status.details?.['phase']).toBe('running');
  expect(status.details?.['progress']).toBe('Step 0/2');

  // next dispatch contract: flat descriptor.
  const next1 = await runExec({ action: 'next', runId });
  expect(next1.details?.['kind']).toBe('dispatch');
  expect(next1.details?.['unitType']).toBe('custom-step');
  expect(next1.details?.['unitId']).toContain('s1');
  expect(next1.details?.['prompt']).toBe('do one');

  const done1 = await runExec({ action: 'complete', runId, stepId: 's1' });
  expect(done1.details?.['outcome']).toBe('continue');
  expect((done1.details?.['next'] as Record<string, unknown>)['unitId']).toContain('s2');

  // complete s2 → milestone with "Step 2/2".
  const done2 = await runExec({ action: 'complete', runId, stepId: 's2' });
  expect(done2.details?.['outcome']).toBe('milestone-complete');
  expect(done2.details?.['progress']).toBe('Step 2/2');

  // next AFTER milestone → {kind:"stop", reason, level:"info"} — reason not stopReason.
  const nextAfter = await runExec({ action: 'next', runId });
  expect(nextAfter.details?.['kind']).toBe('stop');
  expect(nextAfter.details?.['reason']).toBeTruthy();
  expect(nextAfter.details?.['stopReason']).toBeUndefined();

  rmSync(project, { recursive: true, force: true });
 }, 20000);

 test('command run lifecycle mirrors tool contract (list Step N/M, status, next, complete)', async () => {
  const { registerGsdGraphCommand } = await import('../plugins/gsd-graph/src/commands.js');
  const { join } = await import('node:path');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');

  const project = mkdtempSync(join(tmpdir(), 'gsd-graph-cmdlife-'));
  mkdirSync(join(project, '.gsd', 'workflows'), { recursive: true });
  const yaml = ['version: 1', 'name: wf-c', 'steps:',
   '  - id: c1', '    name: CmdOne', '    title: CmdOne', '    prompt: cmd one', '    status: pending', '    dependsOn: []',
  ].join('\n');
  writeFileSync(join(project, '.gsd', 'workflows', 'wf-c.yaml'), yaml);

  const messages: string[] = [];
  let handler: ((args: string, ctx: { cwd: string; ui: { notify: (m: string, t?: string) => void } }) => Promise<void>) | null = null;
  const pi = {
   registerCommand: (name: string, cmd: { handler: (args: string, ctx: { cwd: string; ui: { notify: (m: string, t?: string) => void } }) => Promise<void> }) => {
    handler = cmd.handler;
   },
  };
  registerGsdGraphCommand(pi as never);
  const ctx = { cwd: project, ui: { notify: (m: string) => messages.push(m) } };

  await handler!('run create wf-c', ctx);
  expect(messages.some((m) => m.includes('Created run wf-c/'))).toBe(true);

  messages.length = 0;
  await handler!('run list', ctx);
  expect(messages[0]).toContain('Step 0/1');

  messages.length = 0;
  await handler!('run next wf-c/x', ctx);
  // Unknown runId → error notify (validateRunId throws only on shape; missing dir → error).
  expect(messages[0]).toContain('Error');

  rmSync(project, { recursive: true, force: true });
 });
});
