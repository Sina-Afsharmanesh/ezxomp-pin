import {
	isOverlayDown,
	isOverlayEscape,
	isOverlayUp,
} from "@ezxomp/experiences/extensions/agent-experience/src/overlay-host.ts";
import { type Component, Key, type TUI } from "@oh-my-pi/pi-tui";
import type {
	DeleteMemoryResult,
	MemoryPartitionFilter,
	MemoryTypeFilter,
} from "./memory/commands.js";
import { confirmDeleteMemory, formatMemoryList } from "./memory/commands.js";
import {
	confirmApplyProposal,
	formatProposalForReview,
	type SkillPatchProposal,
} from "./promotion/promotion.js";
import type { ValidationReportItem } from "./store/storage.js";

type MemoryReport = ValidationReportItem & {
	entry: NonNullable<ValidationReportItem["entry"]>;
};
type Confirm = (title: string, body: string) => Promise<boolean>;
type Notify = (message: string, level: string) => void;
type DeleteMemory = (options: {
	id: string;
	partition?: "global" | "project";
}) => Promise<DeleteMemoryResult>;
type ApplyProposal = (
	proposal: SkillPatchProposal,
) => Promise<SkillPatchProposal>;

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function memoryDetail(report: MemoryReport): string[] {
	const entry = report.entry;
	return [
		`Memory: ${entry.id}`,
		`Title: ${entry.title}`,
		`Type: ${entry.type}`,
		`Partition: ${report.partition}`,
		`Path: ${report.path}`,
		`Confidence: ${entry.confidence}`,
		`Hits: ${entry.hits}`,
		`Updated: ${entry.updated_at}`,
		"",
		"Esc: back · d: delete · q: close",
	];
}

export class MemoryBrowserOverlay implements Component {
	#reports: ValidationReportItem[];
	#partition: MemoryPartitionFilter;
	#type: MemoryTypeFilter;
	#tui: TUI;
	#done: () => void;
	#confirm: Confirm;
	#deleteMemory: DeleteMemory;
	#notify: Notify;
	#index = 0;
	#detail = false;
	#busy = false;

	constructor(
		reports: ValidationReportItem[],
		partition: MemoryPartitionFilter,
		type: MemoryTypeFilter,
		tui: TUI,
		done: () => void,
		confirm: Confirm,
		deleteMemory: DeleteMemory,
		notify: Notify,
	) {
		this.#reports = reports;
		this.#partition = partition;
		this.#type = type;
		this.#tui = tui;
		this.#done = done;
		this.#confirm = confirm;
		this.#deleteMemory = deleteMemory;
		this.#notify = notify;
	}

	#validReports(): MemoryReport[] {
		return this.#reports.filter(
			(report): report is MemoryReport =>
				Boolean(report.entry) &&
				(this.#type === "all" || report.entry?.type === this.#type),
		);
	}

	render(_width: number): readonly string[] {
		const validReports = this.#validReports();
		if (this.#detail) {
			const selected = validReports[this.#index];
			return selected
				? memoryDetail(selected)
				: ["No memory selected.", "", "Esc: back · q: close"];
		}
		return [
			...formatMemoryList(this.#reports, {
				partition: this.#partition,
				type: this.#type,
			}).split("\n"),
			"",
			...validReports.map(
				(report, index) =>
					`${index === this.#index ? ">" : " "} ${report.entry.id}`,
			),
			"",
			"↑↓ select · Enter inspect · d delete · Esc/q close",
		];
	}

	invalidate(): void {
		this.#tui.requestRender();
	}

	handleInput(input: string): void {
		if (isOverlayEscape(input)) {
			if (this.#detail) {
				this.#detail = false;
				this.#tui.requestRender();
			} else {
				this.#done();
			}
			return;
		}
		const validReports = this.#validReports();
		if (isOverlayUp(input)) {
			this.#index = Math.max(0, this.#index - 1);
			this.#tui.requestRender();
			return;
		}
		if (isOverlayDown(input)) {
			this.#index = Math.min(
				Math.max(0, validReports.length - 1),
				this.#index + 1,
			);
			this.#tui.requestRender();
			return;
		}
		if (input === Key.enter) {
			if (!this.#detail && validReports[this.#index]) {
				this.#detail = true;
				this.#tui.requestRender();
			}
			return;
		}
		if (input === "d" && validReports[this.#index] && !this.#busy) {
			void this.#deleteSelected(validReports[this.#index]);
		}
	}

	async #deleteSelected(report: MemoryReport): Promise<void> {
		this.#busy = true;
		try {
			await confirmDeleteMemory({
				report,
				confirm: this.#confirm,
				deleteMemory: this.#deleteMemory,
				notify: this.#notify,
				onDeleted: () => {
					this.#reports = this.#reports.filter(
						(candidate) => candidate !== report,
					);
					this.#index = Math.min(
						this.#index,
						Math.max(0, this.#validReports().length - 1),
					);
				},
			});
		} catch (error) {
			this.#notify(
				`Unable to delete Skillforge memory ${report.entry.id}: ${formatError(error)}`,
				"error",
			);
		} finally {
			this.#busy = false;
			this.#tui.requestRender();
		}
	}
}

export class ProposalReviewOverlay implements Component {
	#index = 0;
	#proposals: SkillPatchProposal[];
	#tui: TUI;
	#done: () => void;
	#confirm: Confirm;
	#applyProposal: ApplyProposal;
	#notify: Notify;
	#busy = false;

	constructor(
		proposals: SkillPatchProposal[],
		tui: TUI,
		done: () => void,
		confirm: Confirm,
		applyProposal: ApplyProposal,
		notify: Notify,
	) {
		this.#proposals = proposals;
		this.#tui = tui;
		this.#done = done;
		this.#confirm = confirm;
		this.#applyProposal = applyProposal;
		this.#notify = notify;
	}

	render(_width: number): readonly string[] {
		const proposal = this.#proposals[this.#index];
		if (!proposal) return ["No pending Skillforge patches.", "", "Esc/q close"];
		return [
			...formatProposalForReview(proposal).split("\n"),
			"",
			"↑↓ select · Enter apply · Esc/q close",
		];
	}

	invalidate(): void {
		this.#tui.requestRender();
	}

	handleInput(input: string): void {
		if (isOverlayEscape(input)) {
			this.#done();
			return;
		}
		if (isOverlayUp(input)) {
			this.#index = Math.max(0, this.#index - 1);
			this.#tui.requestRender();
			return;
		}
		if (isOverlayDown(input)) {
			this.#index = Math.min(this.#proposals.length - 1, this.#index + 1);
			this.#tui.requestRender();
			return;
		}
		if (input === Key.enter && !this.#busy && this.#proposals[this.#index])
			void this.#applySelected(this.#proposals[this.#index]);
	}

	async #applySelected(proposal: SkillPatchProposal): Promise<void> {
		this.#busy = true;
		try {
			await confirmApplyProposal({
				proposal,
				confirm: this.#confirm,
				applyProposal: this.#applyProposal,
				notify: this.#notify,
			});
		} catch (error) {
			this.#notify(
				`Unable to apply Skillforge patch ${proposal.id}: ${formatError(error)}`,
				"error",
			);
		} finally {
			this.#busy = false;
			this.#tui.requestRender();
		}
	}
}
