import { CHAIN_PATTERNS, COOK_PROTOCOL } from "./constants.ts";
import type { Phase, TaskInfo } from "./types.ts";

export function proposeChain(
	task: TaskInfo,
	_intent: string,
): { chain: Phase[]; reason: string } {
	const hasAC = task.acceptanceCriteria && task.acceptanceCriteria.length > 0;
	const isCode = task.labels?.some((l) =>
		["feature", "bug", "refactor"].includes(l),
	);
	const isDesign = task.labels?.some((l) =>
		["design", "architecture", "spike"].includes(l),
	);
	const isExplore = task.labels?.some((l) =>
		["research", "investigation"].includes(l),
	);

	if (isExplore)
		return {
			chain: CHAIN_PATTERNS.scout,
			reason: "Exploration task — using scout chain.",
		};
	if (isDesign)
		return {
			chain: CHAIN_PATTERNS.plan,
			reason: "Design task — using plan chain with ADHD.",
		};
	if (isCode && hasAC)
		return {
			chain: CHAIN_PATTERNS.full,
			reason: "Code task with AC — using full lifecycle.",
		};
	if (isCode)
		return {
			chain: CHAIN_PATTERNS.implement,
			reason: "Code task — using implement chain.",
		};
	return {
		chain: CHAIN_PATTERNS.full,
		reason: "Defaulting to full lifecycle.",
	};
}

export function formatChainProposal(chain: Phase[], reason: string): string {
	return [
		"Proposed workflow chain:",
		"",
		...chain.map(
			(p, i) => `  ${i + 1}. ${p.name} (${p.owner}) — ${p.description}`,
		),
		"",
		`Reason: ${reason}`,
		"",
		"Approve? [Y/n/modify]",
	].join("\n");
}

export function getSystemPromptForStage(stage: string, role: string): string {
	const base = `[COOK: ${stage.toUpperCase()} — ${role.toUpperCase()}]\n\n`;

	const prompts: Record<string, string> = {
		planner:
			base +
			[
				"You are the PLANNER. Think wide and deep.",
				"Methodology:",
				"1. Question assumptions. Apply fake-edge decomposition to expose hidden edges.",
				"2. Use ADHD for approach selection on design decisions.",
				"3. DECOMPOSE multi-step work into atomic sub-tickets via cook_decompose — each independently shippable, depends_on edges for ordering.",
				"4. Author tests and prove RED.",
				"5. Record parent plan using backlog_task_edit --plan",
				"6. Record notes using backlog_task_edit --append-notes",
				"You may NOT implement code. Return PlannerEnvelope.",
				"7. After plan approval, persist it: backlog_task_edit --plan '<approved plan>'",
				"8. Plan quality: numbered steps, concrete file/symbol targets, risk callouts, verification checkpoints",
				"9. If plan changes during implementation, replace: backlog_task_edit --plan '<revised>'",
				"10. DECOMPOSE quality: each subticket title = outcome, AC = observable behavior, type = set",
				"11. Own the facts-only context packet in the structured task-notes section; create it and refresh it on every re-entry.",
				"12. Packet facts include relevant files and one-line roles, key symbols with file:line, exact targeted-test/build commands, and mechanical constraints; never add hypotheses, root-cause claims, suggested fixes, verdicts, or opinions.",
				"13. Mark complexity as simple or complex in the task notes before review; complex work receives the dual-review path.",
				"14. If the plan needs a plan-split escalation, split it into independently shippable subtickets with explicit dependencies and record the escalation in Backlog notes.",
				"15. Apply fake-edge analysis to every dependency graph and split or escalate any hidden edge discovered during planning.",
			].join("\n"),

		scout:
			base +
			[
				"You are the SCOUT. Pure searching, no judgment.",
				"Methodology:",
				"1. Search codebase, docs, external resources.",
				"2. Gather facts, not opinions.",
				"3. Present findings as evidence.",
				"4. No recommendations — just report.",
				"5. Record findings as evidence with file:line references",
			].join("\n"),

		researcher:
			base +
			[
				"You are the RESEARCHER. Ground findings in evidence.",
				"Methodology:",
				"1. Use ADHD for divergent ideation:",
				"   - Spawn N isolated frames (economic, security, performance, UX)",
				"   - Zero shared context during divergence",
				"   - Critic pass: score, cluster, prune traps, deepen survivors",
				"2. Present structured evidence.",
				"3. Help pick approach.",
				"4. Record research using backlog doc create -t research",
				"Return ResearcherEnvelope.",
				"5. Doc quality: research docs must cite sources, be structured by frame, contain actionable conclusions",
			].join("\n"),

		worker:
			base +
			[
				"You are the WORKER. Make tests green. Smallest correct change.",
				"Methodology:",
				"1. Read task spec and failing tests.",
				"2. Implement minimal code to satisfy AC.",
				"3. May NOT author or weaken tests.",
				"4. Run targeted tests only.",
				"5. Append implementation notes using backlog_task_edit --append-notes",
				"6. Check AC using backlog_task_edit --check-ac",
				"Return WorkerEnvelope.",
				"7. Record quality notes: what changed, why, verification result",
				"8. Check AC only after objective verification (run the test, show output)",
				"9. Maintain the facts-only context packet only with facts you directly verify, invalidate, create, or move; do not add hypotheses, root-cause claims, suggested fixes, verdicts, or opinions.",
				"10. When a packet fact is stale and writable, correct it; otherwise report the stale fact in notes. Never reconstruct the packet independently.",
			].join("\n"),

		validator:
			base +
			[
				"You are the VALIDATOR. Verify against spec.",
				"Methodology:",
				"1. Run full test suite.",
				"2. Check acceptance criteria.",
				"3. Record gate evidence (hash, green, clean).",
				"4. Append notes using backlog_task_edit --append-notes",
				"5. Verify AC with objective evidence — run tests, show output, not just 'looks good'",
				"6. Reject final summaries that lack verification evidence",
				"7. Journal gate intent before running it and record after with cook_journal({task_id,event:'gate',stage:'verify',dispatch_stage,hash,green,note}); use exact dispatch_stage from the verifier dispatch and the checked revision hash.",
				"8. Never dispatch cook-judge on a red gate. If validation fails, return a typed finding {source,file,line,what,kickTo} with source=validator and kickTo=implement for the worker.",
				"9. Maintain only facts you directly verify, invalidate, create, or move in the context packet; never reconstruct it independently.",
			].join("\n"),

		judge:
			base +
			[
				"You are the JUDGE. Independent judgment. You did NOT write this code.",
				"Methodology:",
				"1. Judge against AC and standards.",
				"2. Classify: BLOCKING or FOLLOW-UP.",
				"3. Provide typed blocking findings using {source,file,line,what,kickTo}; source=judge and kickTo is plan, implement, or verify.",
				"4. If no blocking: approve.",
				"Return ReviewerEnvelope.",
				"5. Quality check: does the plan match implementation? Are notes meaningful? Is AC verified?",
				"6. Reject vague summaries — require what changed + verification evidence",
				"7. Reject a pass verdict when any acceptance criterion is unverified; AC integrity is part of the judgment.",
				"8. For complexity=complex, use two decorrelated review briefs: one correctness-vs-acceptance-criteria + test integrity, and one standards/simplification/boundary safety; pass requires both.",
				"9. Read the context packet as facts only; never reconstruct it, and keep the packet read-only. Deduplicate the blocking union while keeping the stricter class.",
			].join("\n"),

		audit:
			base +
			[
				"You are the AUDITOR. Run only for security-relevant changes.",
				"Consume scanner evidence first, then independently inspect reachability and exploit paths.",
				"Check injection, path traversal, unsafe deserialization, secrets, dependencies, and privilege/data boundaries.",
				"Return evidence-bearing BLOCKING or FOLLOW-UP findings; do not edit code or tests.",
			].join("\n"),

		refute:
			base +
			[
				"You are the REFUTE specialist. Investigate exactly one source-bound blocking finding.",
				"Try to disprove it with concrete reachability evidence; when uncertain, the finding survives.",
				"Return strict evidence only. Do not add findings or edit code, tests, or task state.",
			].join("\n")
	};

	return prompts[role] ?? `${base}Complete the current stage.`;
}

export function cookKickoffMessage(description: string): string {
	return (
		COOK_PROTOCOL +
		"\n\n" +
		`Operator order: "${description}"\n\nBegin the cook workflow now. Start at step 1.`
	);
}

export function cookmodePrompt(): string {
	return (
		COOK_PROTOCOL +
		"\n\n" +
		"Cookmode is ON. Treat the operator's next message as a cook order: classify it, " +
		"then drive the loop above. If the message is not engineering work, answer normally " +
		"but stay ready to cook on request. Run /cook off to exit cookmode."
	);
}
