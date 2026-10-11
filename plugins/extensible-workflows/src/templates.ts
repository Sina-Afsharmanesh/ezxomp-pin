import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { globalWorkflowsDir, projectWorkflowsDir } from "./library.js";
import { contentHash, validateWorkflowDefinition, type WorkflowFileV2 } from "./runtime.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Recursively freeze a value so shared module state cannot be mutated by callers. */
function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object") {
		for (const child of Array.isArray(value) ? [...value] : [...Object.values(value as Record<string, unknown>)]) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}

const BUILTIN_TEMPLATES: readonly WorkflowFileV2[] = deepFreeze<WorkflowFileV2[]>([
{
 "schemaVersion": 2,
 "name": "plan",
 "description": "Decompose a task into an ordered implementation plan.",
 "inputs": {
  "task": {
   "description": "What to plan",
   "required": true
  },
  "context": {
   "description": "Existing context",
   "required": false,
   "default": ""
  }
 },
 "stages": [
  {
   "id": "plan",
   "label": "Plan",
   "tasks": [
    {
     "id": "planner",
     "prompt": "Read the task and produce a concrete numbered implementation plan.\\n\\nTask: {{input.task}}\\n\\nContext: {{input.context}}"
    }
   ],
   "gates": [
    {
     "id": "plan-ok",
     "type": "checkpoint",
     "prompt": "Approve the implementation plan?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "implement",
 "description": "Implement a task from an approved plan with a deterministic verify gate.",
 "inputs": {
  "task": {
   "description": "What to implement",
   "required": true
  },
  "plan": {
   "description": "Approved plan",
   "required": false,
   "default": ""
  }
 },
 "stages": [
  {
   "id": "implement",
   "label": "Implement",
   "tasks": [
    {
     "id": "implementer",
     "prompt": "Implement the task.\\n\\nTask: {{input.task}}\\n\\nPlan: {{input.plan}}"
    }
   ],
   "gates": [
    {
     "id": "scope-ok",
     "type": "checkpoint",
     "prompt": "Approve the implementation before verification?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "review-loop",
 "description": "Review a change and loop on review feedback until the review approves.",
 "inputs": {
  "scope": {
   "description": "What to review",
   "required": true
  },
  "criteria": {
   "description": "Review criteria",
   "required": false,
   "default": "correctness, security, and regression safety"
  }
 },
 "stages": [
  {
   "id": "review",
   "label": "Review",
   "tasks": [
    {
     "id": "reviewer",
     "prompt": "Review the change and return prioritized findings.\\n\\nScope: {{input.scope}}\\nCriteria: {{input.criteria}}"
    }
   ],
   "gates": [
    {
     "id": "review-pass",
     "type": "checkpoint",
     "prompt": "Accept these review findings and proceed?",
     "auto": false
    }
   ]
  },
  {
   "id": "fix",
   "label": "Fix",
   "tasks": [
    {
     "id": "fixer",
     "prompt": "Fix the accepted review findings.\\n\\nScope: {{input.scope}}\\nFindings: {{result.reviewer}}"
    }
   ],
   "gates": [
    {
     "id": "fix-pass",
     "type": "checkpoint",
     "prompt": "Are the findings resolved?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "fan-out-synthesize",
 "description": "Fan out independent perspectives in parallel then synthesize them.",
 "inputs": {
  "task": {
   "description": "What to analyze",
   "required": true
  }
 },
 "stages": [
  {
   "id": "fanout",
   "label": "Fan out",
   "tasks": [
    {
     "id": "view1",
     "prompt": "Perspective A: {{input.task}}"
    },
    {
     "id": "view2",
     "prompt": "Perspective B: {{input.task}}"
    },
    {
     "id": "view3",
     "prompt": "Perspective C: {{input.task}}"
    }
   ],
   "gates": []
  },
  {
   "id": "synth",
   "label": "Synthesize",
   "tasks": [
    {
     "id": "synthesizer",
     "prompt": "Synthesize.\\nA: {{result.view1}}\\nB: {{result.view2}}\\nC: {{result.view3}}"
    }
   ],
   "gates": [
    {
     "id": "synth-ok",
     "type": "checkpoint",
     "prompt": "Approve the synthesis?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "adversarial-verify",
 "description": "Produce a result and challenge it adversarially to harden the outcome.",
 "inputs": {
  "task": {
   "description": "What to build and verify",
   "required": true
  }
 },
 "stages": [
  {
   "id": "produce",
   "label": "Produce",
   "tasks": [
    {
     "id": "producer",
     "prompt": "Produce the result for: {{input.task}}"
    }
   ],
   "gates": []
  },
  {
   "id": "challenge",
   "label": "Adversarial verify",
   "tasks": [
    {
     "id": "adversary",
     "prompt": "Challenge the produced result.\\n\\nResult: {{result.producer}}"
    }
   ],
   "gates": [
    {
     "id": "challenge-ok",
     "type": "checkpoint",
     "prompt": "Are the challenges resolved?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "tournament",
 "description": "Generate multiple candidate answers and run a tournament to select the best.",
 "inputs": {
  "task": {
   "description": "What to solve",
   "required": true
  }
 },
 "stages": [
  {
   "id": "generate",
   "label": "Generate candidates",
   "tasks": [
    {
     "id": "candidate-a",
     "prompt": "Candidate A: {{input.task}}"
    },
    {
     "id": "candidate-b",
     "prompt": "Candidate B: {{input.task}}"
    },
    {
     "id": "candidate-c",
     "prompt": "Candidate C: {{input.task}}"
    }
   ],
   "gates": []
  },
  {
   "id": "select",
   "label": "Select",
   "tasks": [
    {
     "id": "selector",
     "prompt": "Compare and select.\\nA: {{result.candidate-a}}\\nB: {{result.candidate-b}}\\nC: {{result.candidate-c}}"
    }
   ],
   "gates": [
    {
     "id": "select-ok",
     "type": "checkpoint",
     "prompt": "Approve the winner?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "generate-filter",
 "description": "Generate many options then filter them against hard criteria.",
 "inputs": {
  "task": {
   "description": "What to generate",
   "required": true
  },
  "filter": {
   "description": "Hard filter criteria",
   "required": false,
   "default": "feasible, safe, high-signal"
  }
 },
 "stages": [
  {
   "id": "generate",
   "label": "Generate",
   "tasks": [
    {
     "id": "generator",
     "prompt": "Generate options for {{input.task}}."
    }
   ],
   "gates": []
  },
  {
   "id": "filter",
   "label": "Filter",
   "tasks": [
    {
     "id": "filterer",
     "prompt": "Filter the options against: {{input.filter}}.\\nOptions: {{result.generator}}"
    }
   ],
   "gates": [
    {
     "id": "filter-ok",
     "type": "checkpoint",
     "prompt": "Approve the filtered set?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "classify-act",
 "description": "Classify a situation and act according to the classification.",
 "inputs": {
  "signal": {
   "description": "Signal to classify",
   "required": true
  }
 },
 "stages": [
  {
   "id": "classify",
   "label": "Classify",
   "tasks": [
    {
     "id": "classifier",
     "prompt": "Classify the signal.\\nSignal: {{input.signal}}"
    }
   ],
   "gates": []
  },
  {
   "id": "act",
   "label": "Act",
   "tasks": [
    {
     "id": "actor",
     "prompt": "Act according to the classification.\\nClassification: {{result.classifier}}"
    }
   ],
   "gates": [
    {
     "id": "act-ok",
     "type": "checkpoint",
     "prompt": "Approve the action?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "loop-until-done",
 "description": "Repeat a bounded loop until a completion gate accepts the result.",
 "inputs": {
  "task": {
   "description": "What to iterate on",
   "required": true
  }
 },
 "stages": [
  {
   "id": "iterate",
   "label": "Iterate",
   "tasks": [
    {
     "id": "worker",
     "prompt": "Iterate on {{input.task}} until complete."
    }
   ],
   "gates": [
    {
     "id": "done",
     "type": "checkpoint",
     "prompt": "Is the result complete?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "goal",
 "description": "Persist a goal and work toward it with a completion gate.",
 "inputs": {
  "goal": {
   "description": "The goal",
   "required": true
  }
 },
 "stages": [
  {
   "id": "goal",
   "label": "Goal",
   "tasks": [
    {
     "id": "goal-keeper",
     "prompt": "Keep the goal in mind and work toward it.\\nGoal: {{input.goal}}"
    }
   ],
   "gates": [
    {
     "id": "goal-ok",
     "type": "checkpoint",
     "prompt": "Has the goal been achieved?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "ralph",
 "description": "Repeat a bounded attempt-loop until a hard acceptance gate passes.",
 "inputs": {
  "task": {
   "description": "What to attempt",
   "required": true
  }
 },
 "stages": [
  {
   "id": "attempt",
   "label": "Attempt",
   "tasks": [
    {
     "id": "worker",
     "prompt": "Attempt {{input.task}} until the acceptance gate passes."
    }
   ],
   "gates": [
    {
     "id": "accept",
     "type": "shell",
     "executable": "just",
     "args": [
      "check"
     ],
     "expect": {
      "exitCode": 0
     },
     "retries": 2,
     "repair": "Fix the failing check and re-attempt."
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "review-and-merge",
 "description": "Review a change and merge it after the review gate approves.",
 "inputs": {
  "scope": {
   "description": "Change to review and merge",
   "required": true
  }
 },
 "stages": [
  {
   "id": "review",
   "label": "Review",
   "tasks": [
    {
     "id": "reviewer",
     "prompt": "Review the change. Scope: {{input.scope}}"
    }
   ],
   "gates": [
    {
     "id": "review-ok",
     "type": "checkpoint",
     "prompt": "Approve the change for merge?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "research-and-verify",
 "description": "Research a topic from high-trust sources and verify claims.",
 "inputs": {
  "topic": {
   "description": "What to research",
   "required": true
  }
 },
 "stages": [
  {
   "id": "research",
   "label": "Research",
   "tasks": [
    {
     "id": "researcher",
     "prompt": "Research {{input.topic}} from primary sources and capture findings."
    }
   ],
   "gates": []
  },
  {
   "id": "verify",
   "label": "Verify",
   "tasks": [
    {
     "id": "verifier",
     "prompt": "Verify the research findings. Research: {{result.researcher}}"
    }
   ],
   "gates": [
    {
     "id": "verify-ok",
     "type": "checkpoint",
     "prompt": "Are the findings verified?",
     "auto": false
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "lint-and-fix",
 "description": "Lint a scope and fix the reported violations.",
 "inputs": {
  "scope": {
   "description": "Files or targets to lint",
   "required": true
  }
 },
 "stages": [
  {
   "id": "lint",
   "label": "Lint",
   "tasks": [
    {
     "id": "linter",
     "prompt": "Run the linter on {{input.scope}} and report violations."
    }
   ],
   "gates": [
    {
     "id": "lint-pass",
     "type": "exec",
     "executable": "just",
     "args": [
      "check"
     ],
     "expect": {
      "exitCode": 0
     },
     "retries": 2,
     "repair": "Fix the lint violations and re-run."
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "language-verify",
 "description": "Verify a language-tool check (rustc/go/tsc/python) passes for a scope.",
 "inputs": {
  "scope": {
   "description": "What to verify",
   "required": true
  },
  "tool": {
   "description": "Language tool to run",
   "required": false,
   "default": "tsc"
  }
 },
 "stages": [
  {
   "id": "verify",
   "label": "Verify",
   "tasks": [
    {
     "id": "checker",
     "prompt": "Run {{input.tool}} on {{input.scope}} and report results."
    }
   ],
   "gates": [
    {
     "id": "lang-pass",
     "type": "exec",
     "executable": "{{input.tool}}",
     "args": [
      "{{input.scope}}"
     ],
     "expect": {
      "exitCode": 0
     },
     "retries": 1,
     "repair": "Fix the failures and re-verify."
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "frontmatter-check",
 "description": "Validate YAML/JSON frontmatter on a set of markdown files.",
 "inputs": {
  "scope": {
   "description": "Files whose frontmatter to validate",
   "required": true
  }
 },
 "stages": [
  {
   "id": "frontmatter",
   "label": "Validate frontmatter",
   "tasks": [
    {
     "id": "check",
     "prompt": "Validate the frontmatter on {{input.scope}} and report violations."
    }
   ],
   "gates": [
    {
     "id": "frontmatter-pass",
     "type": "frontmatter",
     "optional": true
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "lsp-diagnostics",
 "description": "Collect LSP diagnostics for a scope and block on unresolved diagnostics.",
 "inputs": {
  "scope": {
   "description": "What to diagnose",
   "required": true
  }
 },
 "stages": [
  {
   "id": "diagnose",
   "label": "Diagnose",
   "tasks": [
    {
     "id": "diagnostician",
     "prompt": "Collect LSP diagnostics for {{input.scope}} and summarize findings."
    }
   ],
   "gates": [
    {
     "id": "diag-pass",
     "type": "lsp",
     "executable": "echo",
     "args": ["diagnostics"],
     "optional": true
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
{
 "schemaVersion": 2,
 "name": "fallow-health",
 "description": "Probe Fallow and adapter health for the current repository.",
 "inputs": {},
 "stages": [
  {
   "id": "probe",
   "label": "Probe",
   "tasks": [
    {
     "id": "prober",
     "prompt": "Probe Fallow and adapter health for this repository."
    }
   ],
   "gates": [
    {
     "id": "probe-pass",
     "type": "shell",
     "executable": "fallow",
     "args": [
      "--version"
     ],
     "expect": {
      "exitCode": 0
     },
     "optional": true
    }
   ]
  }
 ],
 "outputs": {
  "result": {
   "type": "string"
  }
 }
},
]);

/** Read-only, deep-frozen view of the builtin catalog. Mutation attempts,
 *  even against nested entries, cannot affect later lookups. */
export const builtinTemplates: readonly WorkflowFileV2[] = BUILTIN_TEMPLATES;

/** Read-only lookup: returns a deep copy of the named builtin template. */
export function builtinTemplate(name: string): WorkflowFileV2 | undefined {
	const found = BUILTIN_TEMPLATES.find(template => template.name === name);
	return found ? structuredClone(found) : undefined;
}

export function listBuiltinTemplates(): string[] {
	return BUILTIN_TEMPLATES.map(template => template.name);
}

/** Content hash of a builtin template, used for content-addressing. */
export function templateContentHash(name: string): string | undefined {
	const template = BUILTIN_TEMPLATES.find(item => item.name === name);
	return template ? contentHash(template) : undefined;
}

export interface ScaffoldRecipeOptions {
	templateName: string;
	targetName: string;
	ownerIds: string[];
	inputs?: Record<string, string>;
	overwrite?: boolean;
}

export interface ScaffoldRecipeResult {
	workflow?: WorkflowFileV2;
	path?: string;
	created?: boolean;
	error?: string;
}

/** Scaffold a builtin template into global scope (~/.omp/agent/workflows).
 *  Refuses overwrite unless requested. Requires a Backlog task/document owner
 *  before the durable write. */
export function scaffoldRecipeFromTemplate(options: ScaffoldRecipeOptions): ScaffoldRecipeResult {
	if (!options.ownerIds || options.ownerIds.length === 0) return { error: "a Backlog task/document owner is required before scaffold writes" };
	if (!options.templateName || !options.targetName) return { error: "templateName and targetName are required" };
	if (!SLUG_RE.test(options.targetName)) return { error: "targetName must be a valid slug" };
	const template = builtinTemplate(options.templateName);
	if (!template) return { error: 'unknown builtin template "' + options.templateName + '"' };
	const validation = validateWorkflowDefinition(template);
	if (validation) return { error: "builtin template is invalid: " + validation.code + ": " + validation.message };
	const workflow: WorkflowFileV2 = { ...structuredClone(template), name: options.targetName, description: template.description, owners: [...options.ownerIds], version: "1.0.0" };
	if (options.inputs) {
		for (const [key, value] of Object.entries(options.inputs)) {
			const input = workflow.inputs[key];
			if (input) input.default = value;
		}
	}
	workflow.contentHash = contentHash(workflow);
	const dir = globalWorkflowsDir();
	const path = join(dir, options.targetName + ".json");
	const existed = existsSync(path);
	if (existed && options.overwrite !== true) return { error: 'workflow "' + options.targetName + '" already exists; pass overwrite to replace' };
	try {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		writeFileSync(path, JSON.stringify(workflow, null, 2) + "\n", { mode: 0o600 });
		return { workflow, path, created: !existed };
	} catch (writeError) {
		return { error: String(writeError) };
	}
}

// Gate file types and helpers moved to gates.js (cycle break, TASK-40.5).
export {
	gateContentHash,
	validateGateFile,
	draftGate,
	approveGate,
	projectGatesDir,
	globalGatesDir,
	resolveGateFile,
	saveGateFile,
} from "./gates.js";
export type { GateTrust, GateFileV1, GateResolution } from "./gates.js";
