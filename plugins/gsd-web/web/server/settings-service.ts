import { existsSync } from "node:fs"
import { join } from "node:path"

import { resolveBridgeRuntimeConfig } from "./bridge/bridge-service.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { SettingsData } from "../../web/lib/settings-types.ts"

const SETTINGS_MAX_BUFFER = 2 * 1024 * 1024

export async function collectSettingsData(projectCwdOverride?: string): Promise<SettingsData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config

  const prefsResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "preferences.mjs"), useCompiledJs: true }
  const routerResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "model-router.mjs"), useCompiledJs: true }
  const budgetResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "context-budget.mjs"), useCompiledJs: true }
  const historyResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "routing-history.mjs"), useCompiledJs: true }
  const metricsResolution = { modulePath: join(packageRoot, "web", "server", "services-dist", "metrics.mjs"), useCompiledJs: true }

  const prefsPath = prefsResolution.modulePath
  const routerPath = routerResolution.modulePath
  const budgetPath = budgetResolution.modulePath
  const historyPath = historyResolution.modulePath
  const metricsPath = metricsResolution.modulePath

  if (!prefsResolution.useCompiledJs) {
    const requiredPaths = [prefsPath, routerPath, budgetPath, historyPath, metricsPath]
    for (const p of requiredPaths) {
      if (!existsSync(p)) {
        throw new Error(`settings data provider not found; missing=${p}`)
      }
    }
  } else {
    const requiredPaths = [prefsPath, routerPath, budgetPath, historyPath, metricsPath]
    for (const p of requiredPaths) {
      if (!existsSync(p)) {
        throw new Error(`settings data provider not found; missing=${p}`)
      }
    }
  }

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    'const prefsMod = await import(pathToFileURL(process.env.GSD_SETTINGS_PREFS_MODULE).href);',
    'const routerMod = await import(pathToFileURL(process.env.GSD_SETTINGS_ROUTER_MODULE).href);',
    'const budgetMod = await import(pathToFileURL(process.env.GSD_SETTINGS_BUDGET_MODULE).href);',
    'const historyMod = await import(pathToFileURL(process.env.GSD_SETTINGS_HISTORY_MODULE).href);',
    'const metricsMod = await import(pathToFileURL(process.env.GSD_SETTINGS_METRICS_MODULE).href);',
    'const loaded = prefsMod.loadEffectiveGSDPreferences(process.env.GSD_SETTINGS_BASE || undefined);',
    'let preferences = null;',
    'if (loaded) {',
    '  const p = loaded.preferences;',
    '  const models = {};',
    '  if (p.models && typeof p.models === "object") {',
    '    for (const [phase, value] of Object.entries(p.models)) {',
    '      if (typeof value === "string") {',
    '        models[phase] = value;',
    '        continue;',
    '      }',
    '      if (value && typeof value === "object" && typeof value.model === "string") {',
    '        models[phase] = typeof value.provider === "string" && value.provider && !value.model.includes("/") ? `${value.provider}/${value.model}` : value.model;',
    '      }',
    '    }',
    '  }',
    '  preferences = {',
    '    mode: p.mode,',
    '    models: Object.keys(models).length > 0 ? models : undefined,',
    '    budgetCeiling: p.budget_ceiling,',
    '    budgetEnforcement: p.budget_enforcement,',
    '    tokenProfile: p.token_profile,',
    '    dynamicRouting: p.dynamic_routing,',
    '    customInstructions: p.custom_instructions,',
    '    alwaysUseSkills: p.always_use_skills,',
    '    preferSkills: p.prefer_skills,',
    '    avoidSkills: p.avoid_skills,',
    '    autoSupervisor: p.auto_supervisor ? { enabled: true, softTimeoutMinutes: p.auto_supervisor.soft_timeout_minutes } : undefined,',
    '    uatDispatch: p.uat_dispatch,',
    '    autoVisualize: p.auto_visualize,',
    '    phases: p.phases,',
    '    contextSelection: p.context_selection,',
    '    reactiveExecution: p.reactive_execution,',
    '    gateEvaluation: p.gate_evaluation,',
    '    sliceParallel: p.slice_parallel,',
    '    serviceTier: p.service_tier,',
    '    showTokenCost: p.show_token_cost,',
    '    contextWindowOverride: p.context_window_override,',
    '    language: p.language,',
    '    remoteQuestions: p.remote_questions ? { channel: p.remote_questions.channel, channelId: String(p.remote_questions.channel_id), timeoutMinutes: p.remote_questions.timeout_minutes, pollIntervalSeconds: p.remote_questions.poll_interval_seconds } : undefined,',
    '    scope: loaded.scope,',
    '    path: loaded.path,',
    '    warnings: loaded.warnings,',
    '    experimental: p.experimental ? { rtk: p.experimental.rtk } : undefined,',
    '  };',
    '}',
    'const defaults = routerMod.defaultRoutingConfig();',
    'const dynamicRouting = loaded?.preferences.dynamic_routing;',
    'const routingConfig = dynamicRouting ? { ...defaults, ...dynamicRouting } : defaults;',
    'const budgetAllocation = budgetMod.computeBudgets(200000);',
    'historyMod.initRoutingHistory(process.env.GSD_SETTINGS_BASE);',
    'const routingHistory = historyMod.getRoutingHistory();',
    'const ledger = metricsMod.loadLedgerFromDisk(process.env.GSD_SETTINGS_BASE);',
    'const projectTotals = ledger ? metricsMod.getProjectTotals(ledger.units) : null;',
    'process.stdout.write(JSON.stringify({ preferences, routingConfig, budgetAllocation, routingHistory, projectTotals }));',
  ].join(" ")

  return await runSubprocess<SettingsData>({
    packageRoot,
    script,
    env: {
      GSD_SETTINGS_PREFS_MODULE: prefsPath,
      GSD_SETTINGS_ROUTER_MODULE: routerPath,
      GSD_SETTINGS_BUDGET_MODULE: budgetPath,
      GSD_SETTINGS_HISTORY_MODULE: historyPath,
      GSD_SETTINGS_METRICS_MODULE: metricsPath,
      GSD_SETTINGS_BASE: projectCwd,
    },
    label: "settings-data",
    maxBuffer: SETTINGS_MAX_BUFFER,
  })
}