/**
 * Procedures lane (skillforge engine) — evidence capture → promotion → review.
 *
 * Consolidation change vs upstream skillforge: the `before_agent_start`
 * retrieval-injection hook is REMOVED. Native memory recall already injects
 * relevant context per turn; duplicate injection here was redundant. Capture,
 * promotion thresholds, human-gated patch apply, and the memory browser are
 * unchanged, now stored under <agentDir>/agent-learning.
 */
import { hostCenteredOverlay } from "@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts";
import type { TSchema } from "@oh-my-pi/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@oh-my-pi/pi-coding-agent";
import { createMemoryEntry, saveMemoryEntry } from "./memory/capture.js";
import type {
	DeleteMemoryResult,
	MemoryPartitionFilter,
} from "./memory/commands.js";
import {
	confirmDeleteMemory,
	deleteMemoryById,
	findMemoryById,
	formatMemoryList,
	formatSkillforgeHelp,
	listMemoryReports,
	parseSkillforgeCommand,
} from "./memory/commands.js";
import { MemoryBrowserOverlay, ProposalReviewOverlay } from "./overlay.js";
import type { SkillPatchProposal } from "./promotion/promotion.js";
import {
	applyProposal,
	confirmApplyProposal,
	formatProposalForReview,
	listPendingProposals,
	promoteMemoryIfEligible,
} from "./promotion/promotion.js";
import type {
	ConfidenceLevel,
	MemoryScope,
	MemoryType,
} from "./shared/types.js";
import type { MemoryPartition, ValidationReportItem } from "./store/storage.js";

export interface SkillforgeDependencies {
	listMemoryReports?: (
		cwd: string,
		partition: MemoryPartitionFilter,
	) => Promise<ValidationReportItem[]>;
	findMemoryById?: typeof findMemoryById;
	deleteMemoryById?: (options: {
		id: string;
		partition?: MemoryPartition;
	}) => Promise<DeleteMemoryResult>;
	listPendingProposals?: (skillName: string) => Promise<SkillPatchProposal[]>;
	applyProposal?: (proposal: SkillPatchProposal) => Promise<SkillPatchProposal>;
}

export async function openSkillforge(
	args: string,
	ctx: ExtensionCommandContext,
	dependencies: SkillforgeDependencies = {},
): Promise<void> {
	try {
		const command = parseSkillforgeCommand(args);
		if (ctx.hasUI && command.kind === "list") {
			const reports = await (
				dependencies.listMemoryReports ?? listMemoryReports
			)(ctx.cwd, command.partition);
			await hostCenteredOverlay(
				ctx,
				(tui, _theme, done) =>
					new MemoryBrowserOverlay(
						reports,
						command.partition,
						command.type,
						tui,
						() => done(undefined),
						(title, body) => ctx.ui.confirm(title, body),
						dependencies.deleteMemoryById ??
							((options) => deleteMemoryById(ctx.cwd, options)),
						(message, level) =>
							ctx.ui.notify(message, level as "error" | "info" | "warning"),
					),
			);
			return;
		}
		if (ctx.hasUI && command.kind === "review") {
			const proposals = await (
				dependencies.listPendingProposals ?? listPendingProposals
			)(command.skillName);
			if (proposals.length === 0) {
				ctx.ui.notify(
					`No pending Skillforge patches for ${command.skillName}.`,
					"info",
				);
				return;
			}
			await hostCenteredOverlay(
				ctx,
				(tui, _theme, done) =>
					new ProposalReviewOverlay(
						proposals,
						tui,
						() => done(undefined),
						(title, body) => ctx.ui.confirm(title, body),
						dependencies.applyProposal ?? applyProposal,
						(message, level) =>
							ctx.ui.notify(message, level as "error" | "info" | "warning"),
					),
			);
			return;
		}

		switch (command.kind) {
			case "help":
				ctx.ui.notify(formatSkillforgeHelp(), "info");
				return;
			case "list": {
				const reports = await (
					dependencies.listMemoryReports ?? listMemoryReports
				)(ctx.cwd, command.partition);
				ctx.ui.notify(
					formatMemoryList(reports, {
						partition: command.partition,
						type: command.type,
					}),
					"info",
				);
				return;
			}
			case "delete": {
				const matches = await (dependencies.findMemoryById ?? findMemoryById)(
					ctx.cwd,
					command.id,
					command.partition,
				);
				if (matches.length === 0) {
					ctx.ui.notify(
						`No memory found for id ${command.id}${command.partition ? ` in ${command.partition}` : ""}.`,
						"warning",
					);
					return;
				}
				if (matches.length > 1) {
					ctx.ui.notify(
						`Memory id ${command.id} is ambiguous. Use /skillforge delete global ${command.id} or /skillforge delete project ${command.id}.`,
						"warning",
					);
					return;
				}
				const [match] = matches;
				await confirmDeleteMemory({
					report: match,
					confirm: (title, body) => ctx.ui.confirm(title, body),
					deleteMemory:
						dependencies.deleteMemoryById ??
						((options) => deleteMemoryById(ctx.cwd, options)),
					notify: (message, level) =>
						ctx.ui.notify(message, level as "error" | "info" | "warning"),
				});
				return;
			}
			case "review":
				await reviewSkillPatches(command.skillName, ctx, dependencies);
				return;
			case "invalid":
				ctx.ui.notify(
					`${command.message}\n\n${formatSkillforgeHelp()}`,
					"warning",
				);
		}
	} catch (error) {
		ctx.ui.notify(formatError(error), "error");
	}
}

interface CaptureToolParams {
	id?: string;
	type: MemoryType;
	title: string;
	scope: MemoryScope;
	skills?: string[];
	compatible_skills?: string[];
	excluded_skills?: string[];
	confidence?: ConfidenceLevel;
	hits?: number;
	trigger: string[];
	symptom: string[];
	root_cause: string[];
	fix: string[];
	verification: string[];
	overwrite?: boolean;
	partition?: MemoryPartition;
}

export function proceduresExtension(pi: ExtensionAPI): void {
	const z = pi.zod;
	const memoryTypeSchema = z.enum(["gotcha", "decision", "pattern"]);
	const confidenceSchema = z.enum([
		"draft",
		"observed",
		"confirmed",
		"deprecated",
	]);
	const stringListSchema = z.array(z.string());
	const scopeSchema = z.object({
		languages: stringListSchema.optional(),
		tools: stringListSchema.optional(),
		files: stringListSchema.optional(),
		projects: stringListSchema.optional(),
	});
	pi.registerTool<TSchema>({
		name: "skillforge_capture_memory",
		label: "Capture Skillforge Memory",
		description:
			"Store a verified Skillforge memory entry when a reusable gotcha, decision, or pattern has concrete evidence. Prefer project memories for project-specific lessons and global memories only for reusable lessons; include narrow scope, trigger, symptom, root cause, fix, and verification evidence.",
		parameters: z.object({
			id: z
				.string()
				.describe(
					"Optional kebab-case id. Generated from type and title if omitted.",
				)
				.optional(),
			type: memoryTypeSchema,
			title: z.string().describe("Concise human-readable title."),
			scope: scopeSchema,
			skills: stringListSchema.optional(),
			compatible_skills: stringListSchema.optional(),
			excluded_skills: stringListSchema.optional(),
			confidence: confidenceSchema.optional(),
			hits: z.number().int().min(1).optional(),
			trigger: stringListSchema,
			symptom: stringListSchema,
			root_cause: stringListSchema,
			fix: stringListSchema,
			verification: stringListSchema,
			overwrite: z.boolean().optional(),
			partition: z
				.enum(["project", "global"])
				.describe(
					"Logical memory partition. Defaults to project; use global only for cross-project learnings.",
				)
				.optional(),
		}),
		approval: "write",
		loadMode: "essential",
		async execute(
			_toolCallId,
			params: CaptureToolParams,
			_signal,
			_onUpdate,
			ctx,
		) {
			try {
				const entry = createMemoryEntry(params);
				const partition = params.partition ?? "project";
				const result = await saveMemoryEntry(ctx.cwd, entry, {
					overwrite: params.overwrite,
					partition,
				});
				const proposals = await promoteMemoryIfEligible(ctx.cwd, {
					entry: result.entry,
					partition,
					memoryPath: result.path,
				});
				const proposalText = proposals.length
					? ` Created ${proposals.length} skill patch proposal(s).`
					: "";
				return {
					content: [
						{
							type: "text" as const,
							text: `Saved ${partition} ${result.entry.type} memory ${result.entry.id} to ${result.path}. Indexed ${result.index.entries.length} total memory file(s).${proposalText}`,
						},
					],
					details: { ...result, proposals },
				};
			} catch (error) {
				return {
					content: [{ type: "text" as const, text: formatError(error) }],
					details: {},
					isError: true,
				};
			}
		},
	});

	pi.registerCommand("skillforge", {
		description: "Manage Skillforge memories and review pending skill patches",
		handler: async (args, ctx) => {
			await openSkillforge(args, ctx);
		},
	});
}

async function reviewSkillPatches(
	skillName: string,
	ctx: ExtensionCommandContext,
	dependencies: SkillforgeDependencies = {},
): Promise<void> {
	const proposals = await (
		dependencies.listPendingProposals ?? listPendingProposals
	)(skillName);
	if (proposals.length === 0) {
		ctx.ui.notify(`No pending Skillforge patches for ${skillName}.`, "info");
		return;
	}

	for (const proposal of proposals) {
		const review = formatProposalForReview(proposal);
		ctx.ui.notify(review, "info");
		await confirmApplyProposal({
			proposal,
			confirm: (title, body) => ctx.ui.confirm(title, body),
			applyProposal: dependencies.applyProposal ?? applyProposal,
			notify: (message, level) =>
				ctx.ui.notify(message, level as "error" | "info" | "warning"),
		});
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
