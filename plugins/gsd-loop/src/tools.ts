/**
 * src/tools.ts — tool surface (WU-7).
 *
 * Pattern A typebox (standalone `typebox` import, `as unknown as TSchema`),
 * 10 registerTool calls: gsd_loop_{start,stop,pause,resume,status,advance,
 * record_result,next,enqueue,list}. approval: "read" for status/list,
 * "exec" for the rest. All behavior via the core.ts facade; envelope
 * {content:[{type:"text",text}], isError?, details?}.
 */
import { Type } from "typebox";
import type { TSchema } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import * as core from "./core.js";

export const gsdLoopToolNames = [
	"gsd_loop_start",
	"gsd_loop_stop",
	"gsd_loop_pause",
	"gsd_loop_resume",
	"gsd_loop_status",
	"gsd_loop_advance",
	"gsd_loop_record_result",
	"gsd_loop_next",
	"gsd_loop_enqueue",
	"gsd_loop_list",
] as const;

const RecordResultParams = Type.Object({
	unitId: Type.String(),
	status: Type.Union([Type.Literal("completed"), Type.Literal("failed"), Type.Literal("crashed")]),
	errorClass: Type.Optional(
		Type.Union([
			Type.Literal("rate-limit"),
			Type.Literal("infrastructure"),
			Type.Literal("model-policy"),
			Type.Literal("unknown"),
		]),
	),
	summary: Type.String(),
});

const EnqueueParams = Type.Object({
	id: Type.String(),
	title: Type.String(),
	brief: Type.Optional(Type.String()),
	briefFile: Type.Optional(Type.String()),
	verifyCommand: Type.Optional(Type.String()),
	maxRetries: Type.Optional(Type.Number()),
	dispatch: Type.Optional(Type.Union([Type.Literal("inline"), Type.Literal("subagent")])),
	subagentAgent: Type.Optional(Type.String()),
});

export interface GsdLoopToolRegistration {
	name: string;
	label: string;
	description: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	params: any;
	approval: "read" | "exec";
	execute: (params: Record<string, unknown>) => Promise<core.FacadeResult> | core.FacadeResult;
}

/** The 10 registrations: name/params/description + the facade op they invoke. */
export function buildGsdLoopToolRegistrations(): GsdLoopToolRegistration[] {
	return [
		{
			name: "gsd_loop_start",
			label: "gsd_loop_start",
			description: "Start (or resume) the gsd-loop run: kernel start, lock acquisition, auto driver activation. Returns the per-turn operating contract.",
			params: Type.Object({
				verbose: Type.Optional(Type.Boolean()),
				mode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("step")])),
			}) as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doStart(p as { verbose?: boolean; mode?: "auto" | "step" }),
		},
		{
			name: "gsd_loop_stop",
			label: "gsd_loop_stop",
			description: "Graceful stop of the gsd-loop run (same-session direct stop; foreign live lock gets a STOP flag file).",
			params: Type.Object({}) as unknown as TSchema,
			approval: "exec",
			execute: () => core.doStop(),
		},
		{
			name: "gsd_loop_pause",
			label: "gsd_loop_pause",
			description: "Pause the running loop, persisting reason and the in-flight unit.",
			params: Type.Object({ reason: Type.Optional(Type.String()) }) as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doPause(p as { reason?: string }),
		},
		{
			name: "gsd_loop_resume",
			label: "gsd_loop_resume",
			description: "Resume a paused/stopped/wedged run. With wedge: the only sanctioned wedge re-entry (must match the active wedge id).",
			params: Type.Object({ wedge: Type.Optional(Type.String()) }) as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doResume(p as { wedge?: string }),
		},
		{
			name: "gsd_loop_status",
			label: "gsd_loop_status",
			description: "Rendered run status: pointer, per-unit lines, counters, lock, wedge, last journal events.",
			params: Type.Object({}) as unknown as TSchema,
			approval: "read",
			execute: () => core.doStatus(),
		},
		{
			name: "gsd_loop_advance",
			label: "gsd_loop_advance",
			description: "Run the guard pipeline and claim the next unit; returns the unit + execution instructions, or a terminal stop. Call this every turn while the loop is running.",
			params: Type.Object({ dryRun: Type.Optional(Type.Boolean()) }) as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doAdvance(p as { dryRun?: boolean }),
		},
		{
			name: "gsd_loop_record_result",
			label: "gsd_loop_record_result",
			description: "Record the outcome for the claimed unit (runs the verify gate + finalize ladders) and returns the next-action envelope. Report errorClass honestly; never mark completed for work you did not do.",
			params: RecordResultParams as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doRecordResult(p as Parameters<typeof core.doRecordResult>[0]),
		},
		{
			name: "gsd_loop_next",
			label: "gsd_loop_next",
			description: "Step mode: advance exactly one unit, then auto-pause. --dry-run previews without claiming.",
			params: Type.Object({ dryRun: Type.Optional(Type.Boolean()) }) as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doNext(p as { dryRun?: boolean }),
		},
		{
			name: "gsd_loop_enqueue",
			label: "gsd_loop_enqueue",
			description: "Add a pending unit to the queue (unique id, brief XOR briefFile, optional verify command and retries).",
			params: EnqueueParams as unknown as TSchema,
			approval: "exec",
			execute: (p) => core.doEnqueue(p as Parameters<typeof core.doEnqueue>[0]),
		},
		{
			name: "gsd_loop_list",
			label: "gsd_loop_list",
			description: "Tabular view of the unit queue (id, status, attempts, title).",
			params: Type.Object({}) as unknown as TSchema,
			approval: "read",
			execute: () => core.doList(),
		},
	];
}

function envelope(result: core.FacadeResult) {
	return {
		content: [{ type: "text" as const, text: result.text }],
		...(result.isError ? { isError: true } : {}),
		...(result.details !== undefined ? { details: result.details } : {}),
	};
}

/** Registers the 10 tools on pi via the shared facade. */
export function registerGsdLoopTools(pi: ExtensionAPI): void {
	for (const tool of buildGsdLoopToolRegistrations()) {
		pi.registerTool({
			name: tool.name,
			label: tool.label,
			description: tool.description,
			parameters: tool.params,
			approval: tool.approval,
			async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
				try {
					core.setFacadeContext({ cwd: ctx.cwd, hasUI: ctx.hasUI });
					return envelope(await tool.execute((params ?? {}) as Record<string, unknown>));
				} catch (e) {
					// Error envelope, never a throw: the model gets actionable text.
					const message = e instanceof Error ? e.message : String(e);
					return {
						content: [{ type: "text" as const, text: `ERROR: ${message}` }],
						isError: true,
					};
				}
			},
		});
	}
}
