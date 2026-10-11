/**
 * test/smoke-workflowz.ts — Exercise saved native workflows without a model.
 * Tests omp_workflow_save, omp_workflow_list, omp_workflow_render via the library module.
 */
import { mkdirSync, rmSync, writeFileSync, mkdtempSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "..");

const { listWorkflows, resolveWorkflow, saveWorkflow, resolveInputs, renderWorkflow, globalWorkflowsDir } =
	await import(join(ROOT, "plugins", "extensible-workflows", "src", "library.ts"));

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string): void {
	if (cond) { passed++; console.log(`  PASS: ${msg}`); }
	else { failed++; console.error(`  FAIL: ${msg}`); }
}

const tempProject = mkdtempSync(join(tmpdir(), "ezxomp-wf-"));

try {
	// 1. Save global "review" recipe
	const reviewWf = {
		schemaVersion: 1, name: "review", description: "Review a change",
		inputs: { focus: { description: "What to review", required: false, default: "all changes" } },
		stages: [
			{ id: "analyze", label: "Analyze changes", tasks: [
				{ id: "read-diff", prompt: "Read the git diff. Focus: {{input.focus}}" } ] },
			{ id: "review", label: "Review changes", tasks: [
				{ id: "review-code", prompt: "Review changes. Analysis: {{result.read-diff}}" } ] },
		],
	};
	const globalResult = saveWorkflow(reviewWf, "global", true);
	assert(globalResult.result !== undefined, "save global review workflow");

	// 2. Save project recipe with same name
	const projectWf = {
		schemaVersion: 1, name: "review", description: "Project review",
		inputs: {},
		stages: [{ id: "lint", label: "Lint", tasks: [{ id: "run-lint", prompt: "Run linter" }] }],
	};
	const projResult = saveWorkflow(projectWf, "project", false, tempProject);
	assert(projResult.result !== undefined, "save project review workflow");

	// 3. effective resolves project
	const effList = listWorkflows(tempProject, "effective");
	const effReview = effList.workflows.find((w: { name: string; scope: string }) => w.name === "review");
	assert(effReview?.scope === "project", "effective resolves project file");

	// 4. explicit global resolves global
	const globalList = listWorkflows(tempProject, "global");
	assert(globalList.workflows.find((w: { name: string; scope: string }) => w.name === "review")?.scope === "global", "explicit global resolves global file");

	// 5. Render rejects missing required inputs
	const wfReq = {
		schemaVersion: 1, name: "deploy", description: "Deploy",
		inputs: { env: { description: "Target env", required: true } },
		stages: [{ id: "build", label: "Build", tasks: [{ id: "build-app", prompt: "Build for {{input.env}}" }] }],
	};
	saveWorkflow(wfReq, "global", false);
	assert(resolveInputs(wfReq, {}).error?.details.code === "WORKFLOW_INPUT_MISSING", "rejects missing required inputs");

	// 6. Render rejects unknown inputs
	assert(resolveInputs(wfReq, { env: "prod", extra: "x" }).error?.details.code === "WORKFLOW_INPUT_UNKNOWN", "rejects unknown inputs");

	// 7. Render generates valid JS
	const { workflow: revWf } = resolveWorkflow("review", tempProject, "global");
	const { inputs: revInputs } = resolveInputs(revWf!, { focus: "security" });
	const code = renderWorkflow(revWf!, revInputs!);
	assert(code.includes("phase("), "rendered code uses phase()");
	assert(code.includes("parallel("), "rendered code uses parallel()");
	assert(code.includes("agent("), "rendered code uses agent()");
	assert(code.includes('return { workflow, results }'), "returns { workflow, results }");
	assert(code.includes("security"), "substitutes input.focus=security");

	// 8. Malformed file diagnostic
	const badPath = join(globalWorkflowsDir(), "bad.json");
	writeFileSync(badPath, "{ not valid }");
	assert(listWorkflows(tempProject, "global").diagnostics.some((d: { path: string }) => d.path === badPath), "malformed file produces diagnostic");
	rmSync(badPath, { force: true });

	// 9. Execute in fake harness
	const fakePhase = (_l: string) => {};
	const fakeAgent = async (p: string, _o: unknown) => `result: ${p.substring(0, 20)}`;
const fakeParallel = async (t: Array<() => Promise<[string, unknown]>>) => Promise.all(t.map(f => f()));
	const fn = new Function("phase", "agent", "parallel", `return (async () => { ${code} })()`);
	const result = await fn(fakePhase, fakeAgent, fakeParallel);
	assert(result.workflow === "review", "executed code returns workflow name");
	assert(result.results["read-diff"] !== undefined, "results has read-diff");
	assert(result.results["review-code"] !== undefined, "results has review-code with prior result");

	// 10. Forward reference rejected
	const fwdWf = {
		schemaVersion: 1, name: "fwd-test", description: "Forward ref test",
		inputs: {},
		stages: [
			{ id: "s1", label: "S1", tasks: [{ id: "t1", prompt: "{{result.t2}}" }] },
			{ id: "s2", label: "S2", tasks: [{ id: "t2", prompt: "later task" }] },
		],
	};
	assert(saveWorkflow(fwdWf, "global", false).error?.details.code === "WORKFLOW_INVALID", "forward reference rejected");

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
} finally {
	rmSync(tempProject, { recursive: true, force: true });
}
