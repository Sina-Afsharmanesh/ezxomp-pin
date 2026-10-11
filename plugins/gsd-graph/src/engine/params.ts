/**
 * params.ts — Parameter substitution for workflow definitions.
 * Re-export of the substituteParams/substitutePromptString surface from
 * definition-loader.ts (kept in its own module so callers that only need
 * substitution don't import the loader — mirrors the plan's module layout).
 */

export { substituteParams, substitutePromptString, PARAM_PATTERN } from './definition-loader.js';
export type { WorkflowDefinition, StepDefinition } from './definition-loader.js';
