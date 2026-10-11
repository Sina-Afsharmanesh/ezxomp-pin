import { PluginManager } from '@oh-my-pi/pi-coding-agent/extensibility/plugins';
import type { ExtensionContext, Theme } from '@oh-my-pi/pi-coding-agent';
import { Container, SettingsList, TabBar, Text, type Component, type SettingItem, type SettingsListTheme, type Tab, type TabBarTheme, type TUI } from '@oh-my-pi/pi-tui';
import { formatArtifactStatus } from './stale.ts';
import { formatCompactSection, truncateText } from './format.ts';
import {
  CodesightWatcherController,
  DEFAULT_CODESIGHT_SETTINGS,
  normalizeCodesightSettings,
  type CodesightSettings,
} from './watcher.ts';

import { hostCenteredOverlay } from '@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts';

const PLUGIN_NAME = '@ezxomp/codesight';
const SETTING_KEYS = [
  'watchFiles',
  'regenerateWiki',
  'showFooter',
  'showStartupModal',
  'notifyOnWatchError',
] as const satisfies readonly (keyof CodesightSettings)[];

type OverlayTab = 'status' | 'settings';

function tabTheme(theme: Theme): TabBarTheme {
  return {
    label: (text) => theme.fg('muted', text),
    activeTab: (text) => theme.fg('accent', text),
    inactiveTab: (text) => theme.fg('muted', text),
    hint: (text) => theme.fg('dim', text),
  };
}

function settingsTheme(theme: Theme): SettingsListTheme {
  return {
    label: (text, selected) => theme.fg(selected ? 'accent' : 'text', text),
    value: (text, selected) => theme.fg(selected ? 'accent' : 'muted', text),
    description: (text) => theme.fg('dim', text),
    cursor: theme.fg('accent', '→'),
    hint: (text) => theme.fg('dim', text),
  };
}

function formatRefreshTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleString() : 'never';
}

export function buildCodesightStatus(controller: CodesightWatcherController): string {
  const snapshot = controller.snapshot;
  const artifacts = snapshot.artifactStatus;
  const artifactHealth = artifacts.missing.length > 0
    ? `missing (${artifacts.missing.join(', ')})`
    : artifacts.stale
      ? 'stale'
      : 'healthy';
  return formatCompactSection('CodeSight', [
    `- project root: ${snapshot.root}`,
    `- artifacts: ${artifactHealth}`,
    `- watcher: ${snapshot.watcherState}`,
    `- CLI: bundled codesight.bundle.js`,
    `- last refresh: ${formatRefreshTime(snapshot.lastRefresh)}`,
    `- last error: ${snapshot.lastError ?? 'none'}`,
  ]);
}

function settingsItems(
  current: CodesightSettings,
  onChange: (key: keyof CodesightSettings, value: string) => void,
  onCancel: () => void,
  theme: Theme,
): SettingItem[] {
  const descriptions: Record<keyof CodesightSettings, string> = {
    watchFiles: 'Run the bundled CodeSight CLI in watch mode during interactive sessions.',
    regenerateWiki: 'Pass --wiki to the watcher so wiki artifacts stay current.',
    showFooter: 'Show watcher and artifact health in the OMP footer.',
    showStartupModal: 'Open this overlay at session start when artifacts are missing or stale (opt-in; default off).',
    notifyOnWatchError: 'Warn once when the watcher exits unexpectedly.',
  };
  return SETTING_KEYS.map((key) => ({
    id: key,
    label: key,
    description: descriptions[key],
    currentValue: current[key] ? 'on' : 'off',
    values: ['off', 'on'],
    changed: current[key] !== DEFAULT_CODESIGHT_SETTINGS[key],
  } satisfies SettingItem));
}

class CodesightOverlay implements Component {
  #controller: CodesightWatcherController;
  #ctx: ExtensionContext;
  #manager: PluginManager;
  #theme: Theme;
  #tui: TUI;
  #done: (result: unknown) => void;
  #tabBar: TabBar;
  #settingsList: SettingsList;
  #activeTab: OverlayTab = 'status';
  #settings: CodesightSettings;
  #busy = false;

  constructor(
    controller: CodesightWatcherController,
    ctx: ExtensionContext,
    manager: PluginManager,
    settings: CodesightSettings,
    tui: TUI,
    theme: Theme,
    done: (result: unknown) => void,
  ) {
    this.#controller = controller;
    this.#ctx = ctx;
    this.#manager = manager;
    this.#settings = { ...settings };
    this.#tui = tui;
    this.#theme = theme;
    this.#done = done;
    const tabs: Tab[] = [
      { id: 'status', label: 'Status' },
      { id: 'settings', label: 'Watch & Display' },
    ];
    this.#tabBar = new TabBar('CodeSight', tabs, tabTheme(theme));
    this.#tabBar.showHint = false;
    this.#tabBar.onTabChange = (tab) => {
      this.#activeTab = tab.id as OverlayTab;
      this.#tui.requestRender();
    };
    const close = () => done(undefined);
    this.#settingsList = new SettingsList(
      settingsItems(this.#settings, (key, value) => void this.#setSetting(key, value), close, theme),
      SETTING_KEYS.length,
      settingsTheme(theme),
      (id, value) => void this.#setSetting(id as keyof CodesightSettings, value),
      close,
      { typeToSearch: false, hint: '↑↓ move · Enter/Space change · Tab switch · Esc close' },
    );
  }

  render(width: number): readonly string[] {
    const body = new Container();
    body.addChild(this.#tabBar);
    body.addChild(new Text(''));
    if (this.#activeTab === 'status') {
      body.addChild(new Text(buildCodesightStatus(this.#controller), 1, 0));
      body.addChild(new Text(''));
      const external = this.#controller.watcherState === 'external';
      body.addChild(new Text(external
        ? 'Watcher owned by another OMP session; refresh and init are disabled.'
        : this.#busy
          ? 'Working…'
          : 'r refresh · i init · Tab switch · Esc/q close', 1, 0));
    } else {
      body.addChild(this.#settingsList);
    }
    return body.render(Math.max(20, width - 2));
  }

  invalidate(): void {
    this.#settingsList.setItems(settingsItems(this.#settings, (key, value) => void this.#setSetting(key, value), () => this.#done(undefined), this.#theme));
  }

  handleInput(data: string): void {
    if (data === '\u001b' || data === 'q') {
      this.#done(undefined);
      return;
    }
    if (this.#tabBar.handleInput(data)) {
      this.#tui.requestRender();
      return;
    }
    if (this.#activeTab === 'settings') {
      this.#settingsList.handleInput(data);
      this.#tui.requestRender();
      return;
    }
    if (data === 'r' || data === 'i') {
      if (this.#controller.watcherState === 'external' || this.#busy) return;
      this.#busy = true;
      this.#tui.requestRender();
      const operation = data === 'r' ? this.#controller.refresh() : this.#controller.init();
      void operation.then((result) => {
        this.#ctx.ui.notify(result.ok ? 'CodeSight completed.' : result.error ?? 'CodeSight failed.', result.ok ? 'info' : 'warning');
      }).catch((error) => {
        this.#ctx.ui.notify(`CodeSight ${data === 'r' ? 'refresh' : 'init'} failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
      }).finally(() => {
        this.#busy = false;
        this.#tui.requestRender();
      });
      return;
    }
  }

  #setSetting(key: keyof CodesightSettings, value: string): Promise<void> {
    const next: Partial<CodesightSettings> = { ...this.#settings, [key]: value === 'on' };
    this.#settings = normalizeCodesightSettings(next);
    this.#controller.updateSettings(this.#settings);
    this.invalidate();
    this.#tui.requestRender();
    return this.#manager.setPluginSetting('@ezxomp/codesight', key, this.#settings[key])
      .then(() => this.#controller.reconcile(this.#settings))
      .catch((error) => {
        this.#ctx.ui.notify(`Unable to save CodeSight setting ${key}: ${error instanceof Error ? error.message : String(error)}`, 'warning');
      });
  }
}

export async function openCodesightOverlay(ctx: ExtensionContext, controller: CodesightWatcherController): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify(buildCodesightStatus(controller), 'info');
    return;
  }

  const manager = new PluginManager(ctx.cwd);
  const persisted = (await manager.getPluginSettings(PLUGIN_NAME).catch(() => ({}))) as Record<string, unknown>;
  const settings = normalizeCodesightSettings({
    ...controller.settings,
    watchFiles: typeof persisted.watchFiles === 'boolean' ? persisted.watchFiles : controller.settings.watchFiles,
    regenerateWiki: typeof persisted.regenerateWiki === 'boolean' ? persisted.regenerateWiki : controller.settings.regenerateWiki,
    showFooter: typeof persisted.showFooter === 'boolean' ? persisted.showFooter : controller.settings.showFooter,
    showStartupModal: typeof persisted.showStartupModal === 'boolean' ? persisted.showStartupModal : controller.settings.showStartupModal,
    notifyOnWatchError: typeof persisted.notifyOnWatchError === 'boolean' ? persisted.notifyOnWatchError : controller.settings.notifyOnWatchError,
  });
  controller.updateSettings(settings);
  await hostCenteredOverlay(ctx, (tui, theme, done) => new CodesightOverlay(controller, ctx, manager, settings, tui, theme, done));
}

export function formatHeadlessStatus(controller: CodesightWatcherController): string {
  const snapshot = controller.snapshot;
  const artifact = formatArtifactStatus(snapshot.root);
  return truncateText(`${buildCodesightStatus(controller)}\n- artifact detail: ${artifact}`, 4000);
}
