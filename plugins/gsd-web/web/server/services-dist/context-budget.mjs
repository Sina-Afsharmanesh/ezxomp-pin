import { createRequire as __gwbCreateRequireInit } from "node:module";

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/token-counter.ts
var CHARS_PER_TOKEN_BY_PROVIDER = {
  anthropic: 3.5,
  "claude-code": 3.5,
  openai: 4,
  google: 4,
  mistral: 3.8,
  bedrock: 3.5,
  unknown: 4
};
var encoder = null;
function countTokensSync(text, provider) {
  if (encoder) {
    return encoder.encode(text).length;
  }
  return estimateTokensForProvider(text, provider ?? "unknown");
}
function isAccurateCountingAvailable() {
  return encoder !== null;
}
function getCharsPerToken(provider) {
  return CHARS_PER_TOKEN_BY_PROVIDER[provider] ?? CHARS_PER_TOKEN_BY_PROVIDER.unknown;
}
function estimateTokensForProvider(text, provider) {
  const ratio = getCharsPerToken(provider);
  return Math.ceil(text.length / ratio);
}

// ../../../../../../../../tmp/gsd-pi/src/resources/extensions/gsd/context-budget.ts
var SUMMARY_RATIO = 0.15;
var INLINE_CONTEXT_RATIO = 0.4;
var VERIFICATION_RATIO = 0.1;
var CHARS_PER_TOKEN = 4;
var DEFAULT_CONTEXT_WINDOW = 2e5;
var CLAUDE_CODE_EFFECTIVE_CONTEXT_WINDOW = 2e5;
var _empiricalCharsPerTokenByProvider = /* @__PURE__ */ new Map();
function _resetEmpiricalCacheForTest() {
  _empiricalCharsPerTokenByProvider.clear();
}
var CONTINUE_THRESHOLD_PERCENT = 70;
var TASK_COUNT_MIN = 2;
var TASK_COUNT_TIERS = [
  [5e5, 8],
  // 500K+ tokens → up to 8 tasks
  [2e5, 6],
  // 200K+ tokens → up to 6 tasks
  [128e3, 5],
  // 128K+ tokens → up to 5 tasks
  [0, 3]
  // anything smaller → up to 3 tasks
];
function computeBudgets(contextWindow, provider) {
  const effectiveWindow = contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;
  const charsPerToken = provider ? getCharsPerToken(provider) : CHARS_PER_TOKEN;
  let totalChars;
  if (isAccurateCountingAvailable()) {
    const providerKey = provider ?? "__default__";
    let empirical = _empiricalCharsPerTokenByProvider.get(providerKey);
    if (empirical === void 0) {
      const probe = "the quick brown fox jumps over the lazy dog ".repeat(64);
      const probeTokens = countTokensSync(probe, provider);
      empirical = probeTokens > 0 ? probe.length / probeTokens : charsPerToken;
      _empiricalCharsPerTokenByProvider.set(providerKey, empirical);
    }
    totalChars = effectiveWindow * empirical;
  } else {
    totalChars = effectiveWindow * charsPerToken;
  }
  return {
    summaryBudgetChars: Math.floor(totalChars * SUMMARY_RATIO),
    inlineContextBudgetChars: Math.floor(totalChars * INLINE_CONTEXT_RATIO),
    verificationBudgetChars: Math.floor(totalChars * VERIFICATION_RATIO),
    continueThresholdPercent: CONTINUE_THRESHOLD_PERCENT,
    taskCountRange: {
      min: TASK_COUNT_MIN,
      max: resolveTaskCountMax(effectiveWindow)
    }
  };
}
function truncateAtSectionBoundary(content, budgetChars) {
  if (!content || content.length <= budgetChars) {
    return { content, droppedSections: 0 };
  }
  const sections = splitIntoSections(content);
  if (sections.length <= 1) {
    const truncated = content.slice(0, budgetChars);
    return { content: truncated + "\n\n[...truncated 1 sections]", droppedSections: 1 };
  }
  let usedChars = 0;
  let keptCount = 0;
  for (const section of sections) {
    const sectionLen = section.length;
    if (usedChars + sectionLen > budgetChars && keptCount > 0) {
      break;
    }
    usedChars += sectionLen;
    keptCount++;
    if (usedChars >= budgetChars) break;
  }
  const droppedCount = sections.length - keptCount;
  if (droppedCount === 0) {
    return { content, droppedSections: 0 };
  }
  const kept = sections.slice(0, keptCount).join("");
  return {
    content: kept.trimEnd() + `

[...truncated ${droppedCount} sections]`,
    droppedSections: droppedCount
  };
}
function resolveExecutorContextWindow(registry, preferences, sessionContextWindow, sessionProvider) {
  if (preferences?.models?.execution && registry) {
    const executionConfig = preferences.models.execution;
    const modelId = typeof executionConfig === "string" ? executionConfig : executionConfig.model;
    if (modelId) {
      const model = findModelById(registry, modelId);
      if (model && model.contextWindow > 0) {
        return resolveEffectiveContextWindow(model.contextWindow, model.provider);
      }
    }
  }
  if (sessionContextWindow && sessionContextWindow > 0) {
    return resolveEffectiveContextWindow(sessionContextWindow, sessionProvider);
  }
  return DEFAULT_CONTEXT_WINDOW;
}
function reduceToFit(content, budgetChars) {
  if (!content || content.length <= budgetChars) {
    return { content, droppedSections: 0 };
  }
  return truncateAtSectionBoundary(content, budgetChars);
}
function resolveTaskCountMax(contextWindow) {
  for (const [threshold, max] of TASK_COUNT_TIERS) {
    if (contextWindow >= threshold) return max;
  }
  return 3;
}
function resolveEffectiveContextWindow(contextWindow, provider) {
  if (provider?.toLowerCase() === "claude-code" && contextWindow > CLAUDE_CODE_EFFECTIVE_CONTEXT_WINDOW) {
    return CLAUDE_CODE_EFFECTIVE_CONTEXT_WINDOW;
  }
  return contextWindow;
}
function splitIntoSections(content) {
  const pattern = /^(?=### |\-{3,}\s*$)/m;
  const parts = content.split(pattern).filter((p) => p.length > 0);
  return parts;
}
function findModelById(registry, modelId) {
  const allModels = registry.getAll();
  const slashIdx = modelId.indexOf("/");
  if (slashIdx !== -1) {
    const provider = modelId.substring(0, slashIdx).toLowerCase();
    const id = modelId.substring(slashIdx + 1).toLowerCase();
    return allModels.find(
      (m) => m.provider.toLowerCase() === provider && m.id.toLowerCase() === id
    );
  }
  return allModels.find((m) => m.id === modelId);
}
export {
  _resetEmpiricalCacheForTest,
  computeBudgets,
  reduceToFit,
  resolveExecutorContextWindow,
  truncateAtSectionBoundary
};
