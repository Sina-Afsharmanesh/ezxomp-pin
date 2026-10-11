// OMP's marketplace install does not run npm/bun install — peer/runtime
// packages like @oh-my-pi/omptype are not on the plugin's module resolution
// path. OMP ships the original typebox package in the host's plugin
// node_modules, so import the JSON-Schema builder from there instead.
import { Type } from "typebox";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { TSchema } from "@oh-my-pi/pi-ai";
import type { BacklogToolsContext } from "./types.ts";
import { runBacklogCli } from "./helpers.ts";

export function registerBacklogTools(pi: ExtensionAPI, sc: BacklogToolsContext): void {
	function registerBacklogCliTool<P>(config: {
		name: string;
		description: string;
		parameters: TSchema;
		args: (params: P) => string[];
	}): void {
		pi.registerTool<TSchema>({
			name: config.name,
			label: config.name,
			description: config.description,
			parameters: config.parameters,
			async execute(_id, params: P, _signal, _onUpdate, ctx) {
				sc.currentCwd = ctx.cwd;
				const r = await runBacklogCli(pi, config.args(params), ctx.cwd);
				return {
					content: [{ type: "text", text: r.stdout || r.stderr }],
					isError: r.code !== 0,
				};
			},
		});
	}

	registerBacklogCliTool({
		name: "backlog_task_create",
		description: "Create a task in Backlog.md. Wraps the full `backlog task create` flag set.",
		parameters: Type.Object({
			title: Type.String(),
			description: Type.Optional(Type.String()),
			assignee: Type.Optional(Type.String()),
			status: Type.Optional(Type.String()),
			priority: Type.Optional(Type.String()),
			type: Type.Optional(Type.String()),
			labels: Type.Optional(Type.Array(Type.String())),
			acceptance_criteria: Type.Optional(Type.Array(Type.String())),
			definition_of_done: Type.Optional(Type.Array(Type.String())),
			no_dod_defaults: Type.Optional(Type.Boolean()),
			plan: Type.Optional(Type.String()),
			notes: Type.Optional(Type.String()),
			final_summary: Type.Optional(Type.String()),
			dependencies: Type.Optional(Type.Array(Type.String())),
			references: Type.Optional(Type.Array(Type.String())),
			documentation: Type.Optional(Type.Array(Type.String())),
			parent: Type.Optional(Type.String()),
			draft: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { title: string; description?: string; assignee?: string; status?: string; priority?: string; type?: string; labels?: string[]; acceptance_criteria?: string[]; definition_of_done?: string[]; no_dod_defaults?: boolean; plan?: string; notes?: string; final_summary?: string; dependencies?: string[]; references?: string[]; documentation?: string[]; parent?: string; draft?: boolean }) => {
			const a = ["task", "create", params.title];
			if (params.description) a.push("-d", params.description);
			if (params.assignee) a.push("-a", params.assignee);
			if (params.status) a.push("-s", params.status);
			if (params.priority) a.push("--priority", params.priority);
			if (params.type) a.push("--type", params.type);
			if (params.labels) a.push("--labels", params.labels.join(","));
			if (params.acceptance_criteria)
				for (const ac of params.acceptance_criteria) a.push("--ac", ac);
			if (params.definition_of_done)
				for (const d of params.definition_of_done) a.push("--dod", d);
			if (params.no_dod_defaults) a.push("--no-dod-defaults");
			if (params.plan) a.push("--plan", params.plan);
			if (params.notes) a.push("--notes", params.notes);
			if (params.final_summary) a.push("--final-summary", params.final_summary);
			if (params.dependencies) a.push("--dep", params.dependencies.join(","));
			if (params.references)
				for (const r of params.references) a.push("--ref", r);
			if (params.documentation)
				for (const d of params.documentation) a.push("--doc", d);
			if (params.parent) a.push("-p", params.parent);
			if (params.draft) a.push("--draft");
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_task_edit",
		description: "Edit a task in Backlog.md. Wraps the full `backlog task edit` flag set: status, plan, notes (replace/append), comments, final-summary (set/append/clear), AC operations (check/uncheck/remove), DoD operations (check/uncheck/remove), assignee, labels, priority, dependencies.",
		parameters: Type.Object({
			task_id: Type.String(),
			status: Type.Optional(Type.String()),
			assignee: Type.Optional(Type.String()),
			labels: Type.Optional(Type.Array(Type.String())),
			priority: Type.Optional(Type.String()),
			type: Type.Optional(Type.String()),
			plan: Type.Optional(Type.String()),
			notes: Type.Optional(Type.String()),
			append_notes: Type.Optional(Type.String()),
			comment: Type.Optional(Type.String()),
			comment_author: Type.Optional(Type.String()),
			final_summary: Type.Optional(Type.String()),
			append_final_summary: Type.Optional(Type.String()),
			clear_final_summary: Type.Optional(Type.Boolean()),
			check_ac: Type.Optional(Type.Array(Type.Number())),
			uncheck_ac: Type.Optional(Type.Array(Type.Number())),
			remove_ac: Type.Optional(Type.Array(Type.Number())),
			check_dod: Type.Optional(Type.Array(Type.Number())),
			uncheck_dod: Type.Optional(Type.Array(Type.Number())),
			remove_dod: Type.Optional(Type.Array(Type.Number())),
			add_dod: Type.Optional(Type.Array(Type.String())),
			add_ac: Type.Optional(Type.Array(Type.String())),
			dependencies: Type.Optional(Type.Array(Type.String())),
		}) as unknown as TSchema,
		args: (params: { task_id: string; status?: string; assignee?: string; labels?: string[]; priority?: string; type?: string; plan?: string; notes?: string; append_notes?: string; comment?: string; comment_author?: string; final_summary?: string; append_final_summary?: string; clear_final_summary?: boolean; check_ac?: number[]; uncheck_ac?: number[]; remove_ac?: number[]; check_dod?: number[]; uncheck_dod?: number[]; remove_dod?: number[]; add_dod?: string[]; add_ac?: string[]; dependencies?: string[] }) => {
			const a = ["task", "edit", params.task_id];
			if (params.status) a.push("-s", params.status);
			if (params.assignee) a.push("-a", params.assignee);
			if (params.labels) a.push("-l", params.labels.join(","));
			if (params.priority) a.push("--priority", params.priority);
			if (params.type) a.push("--type", params.type);
			if (params.plan) a.push("--plan", params.plan);
			if (params.notes) a.push("--notes", params.notes);
			if (params.append_notes) a.push("--append-notes", params.append_notes);
			if (params.comment) a.push("--comment", params.comment);
			if (params.comment_author)
				a.push("--comment-author", params.comment_author);
			if (params.final_summary) a.push("--final-summary", params.final_summary);
			if (params.append_final_summary)
				a.push("--append-final-summary", params.append_final_summary);
			if (params.clear_final_summary) a.push("--clear-final-summary");
			if (params.add_ac) for (const ac of params.add_ac) a.push("--ac", ac);
			if (params.check_ac)
				for (const n of params.check_ac) a.push("--check-ac", String(n));
			if (params.uncheck_ac)
				for (const n of params.uncheck_ac) a.push("--uncheck-ac", String(n));
			if (params.remove_ac)
				for (const n of params.remove_ac) a.push("--remove-ac", String(n));
			if (params.add_dod) for (const d of params.add_dod) a.push("--dod", d);
			if (params.check_dod)
				for (const n of params.check_dod) a.push("--check-dod", String(n));
			if (params.uncheck_dod)
				for (const n of params.uncheck_dod) a.push("--uncheck-dod", String(n));
			if (params.remove_dod)
				for (const n of params.remove_dod) a.push("--remove-dod", String(n));
			if (params.dependencies) a.push("--dep", params.dependencies.join(","));
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_task_list",
		description: "List tasks in Backlog.md. Wraps the full `backlog task list` flag set.",
		parameters: Type.Object({
			status: Type.Optional(Type.String()),
			assignee: Type.Optional(Type.String()),
			unassigned: Type.Optional(Type.Boolean()),
			parent: Type.Optional(Type.String()),
			milestone: Type.Optional(Type.String()),
			labels: Type.Optional(Type.Array(Type.String())),
			type: Type.Optional(Type.Array(Type.String())),
			ready: Type.Optional(Type.Boolean()),
			search: Type.Optional(Type.String()),
			limit: Type.Optional(Type.Number()),
		}) as unknown as TSchema,
		args: (params: { status?: string; assignee?: string; unassigned?: boolean; parent?: string; milestone?: string; labels?: string[]; type?: string[]; ready?: boolean; search?: string; limit?: number }) => {
			const a = ["task", "list", "--json"];
			if (params.status) a.push("-s", params.status);
			if (params.assignee) a.push("-a", params.assignee);
			if (params.unassigned) a.push("--unassigned");
			if (params.parent) a.push("-p", params.parent);
			if (params.milestone) a.push("-m", params.milestone);
			if (params.type) a.push("--type", params.type.join(","));
			if (params.ready) a.push("--ready");
			if (params.labels) a.push("--labels", params.labels.join(","));
			if (params.search) a.push("--search", params.search);
			if (params.limit) a.push("--limit", String(params.limit));
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_task_view",
		description: "View a task in Backlog.md.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["task", params.task_id, "--json"];
		},
	});
	pi.registerTool<TSchema>({
		name: "backlog_doc_create",
		label: "backlog_doc_create",
		description:
			"Create a doc in Backlog.md. type is REQUIRED (spec, research, adr, guide, report).",
		parameters: Type.Object({
			title: Type.String(),
			content: Type.String(),
			type: Type.Union([
				Type.Literal("spec"),
				Type.Literal("research"),
				Type.Literal("adr"),
				Type.Literal("guide"),
				Type.Literal("report"),
			]),
			path: Type.Optional(Type.String()),
			tags: Type.Optional(Type.Array(Type.String())),
		}) as unknown as TSchema,
		async execute(_id, params: { title: string; content: string; type: "spec" | "research" | "adr" | "guide" | "report"; path?: string; tags?: string[] }, _signal, _onUpdate, ctx) {
			sc.currentCwd = ctx.cwd;
			const cliType = {
				spec: "specification",
				research: "other",
				adr: "other",
				guide: "guide",
				report: "other",
			}[params.type];
			const args = [
				"doc",
				"create",
				params.title,
				"-t",
				cliType,
			];
			if (params.path) args.push("-p", params.path);
			if (params.tags) args.push("--tags", params.tags.join(","));
			const created = await runBacklogCli(pi, args, ctx.cwd);
			if (created.code !== 0) {
				return {
					content: [{ type: "text", text: created.stdout || created.stderr }],
					isError: true,
				};
			}
			const docId = created.stdout.match(/Created document (\S+)/)?.[1];
			if (!docId) {
				return {
					content: [{ type: "text", text: created.stdout || created.stderr }],
					isError: false,
				};
			}
			const updated = await runBacklogCli(
				pi,
				["doc", "update", docId, "--content", params.content],
				ctx.cwd,
			);
			const warning = updated.code !== 0
				? ` Warning: created document ${docId}, but content update failed: ${updated.stderr || updated.stdout}`
				: "";
			return {
				content: [{ type: "text", text: `${created.stdout}${warning}` }],
				isError: false,
			};
		},
	});
	registerBacklogCliTool({
		name: "backlog_task_archive",
		description: "Archive a task in Backlog.md.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["task", "archive", params.task_id];
		},
	});
	registerBacklogCliTool({
		name: "backlog_task_demote",
		description: "Demote a task to draft in Backlog.md.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["task", "demote", params.task_id];
		},
	});
	registerBacklogCliTool({
		name: "backlog_search",
		description: "Fuzzy search across tasks, docs, and decisions in Backlog.md. Returns JSON.",
		parameters: Type.Object({
			query: Type.String(),
			type: Type.Optional(Type.String()),
			task_type: Type.Optional(Type.Array(Type.String())),
			status: Type.Optional(Type.String()),
			exclude_status: Type.Optional(Type.Array(Type.String())),
			priority: Type.Optional(Type.String()),
			modified_file: Type.Optional(Type.String()),
			limit: Type.Optional(Type.Number()),
		}) as unknown as TSchema,
		args: (params: { query: string; type?: string; task_type?: string[]; status?: string; exclude_status?: string[]; priority?: string; modified_file?: string; limit?: number }) => {
			const a = ["search", params.query, "--json"];
			if (params.type) a.push("--type", params.type);
			if (params.task_type) a.push("--task-type", params.task_type.join(","));
			if (params.status) a.push("--status", params.status);
			if (params.exclude_status) for (const es of params.exclude_status) a.push("--exclude-status", es);
			if (params.priority) a.push("--priority", params.priority);
			if (params.modified_file) a.push("--modified-file", params.modified_file);
			if (params.limit) a.push("--limit", String(params.limit));
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_decision_create",
		description: "Create a decision record (ADR) in Backlog.md.",
		parameters: Type.Object({
			title: Type.String(),
			status: Type.Optional(
				Type.Union([
					Type.Literal("proposed"),
					Type.Literal("accepted"),
					Type.Literal("rejected"),
					Type.Literal("superseded"),
				]),
			),
		}) as unknown as TSchema,
		args: (params: { title: string; status?: "proposed" | "accepted" | "rejected" | "superseded" }) => {
			const a = ["decision", "create", params.title];
			if (params.status) a.push("-s", params.status);
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_milestone_list",
		description: "List milestones in Backlog.md.",
		parameters: Type.Object({
			show_completed: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { show_completed?: boolean }) => {
			const a = ["milestone", "list", "--plain"];
			if (params.show_completed) a.push("--show-completed");
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_milestone_add",
		description: "Add a milestone in Backlog.md.",
		parameters: Type.Object({
			name: Type.String(),
			description: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		args: (params: { name: string; description?: string }) => {
			const a = ["milestone", "add", params.name];
			if (params.description) a.push("--description", params.description);
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_milestone_rename",
		description: "Rename a milestone in Backlog.md.",
		parameters: Type.Object({
			old_name: Type.String(),
			new_name: Type.String(),
			no_update_tasks: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { old_name: string; new_name: string; no_update_tasks?: boolean }) => {
			const a = ["milestone", "rename", params.old_name, params.new_name];
			if (params.no_update_tasks) a.push("--no-update-tasks");
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_milestone_remove",
		description: "Remove a milestone in Backlog.md. task_handling: clear (default), keep, or reassign (requires reassign_to).",
		parameters: Type.Object({
			name: Type.String(),
			task_handling: Type.Optional(
				Type.Union([
					Type.Literal("clear"),
					Type.Literal("keep"),
					Type.Literal("reassign"),
				]),
			),
			reassign_to: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		args: (params: { name: string; task_handling?: "clear" | "keep" | "reassign"; reassign_to?: string }) => {
			const a = ["milestone", "remove", params.name];
			if (params.task_handling) a.push("--task-handling", params.task_handling);
			if (params.reassign_to) a.push("--reassign-to", params.reassign_to);
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_milestone_archive",
		description: "Archive a milestone in Backlog.md.",
		parameters: Type.Object({
			milestone_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { milestone_id: string }) => {

			return ["milestone", "archive", params.milestone_id];
		},
	});
	registerBacklogCliTool({
		name: "backlog_doc_update",
		description: "Update a doc in Backlog.md: content, title, type, tags, or path. Omitted fields are preserved.",
		parameters: Type.Object({
			doc_id: Type.String(),
			content: Type.Optional(Type.String()),
			title: Type.Optional(Type.String()),
			type: Type.Optional(
				Type.Union([
					Type.Literal("spec"),
					Type.Literal("research"),
					Type.Literal("adr"),
					Type.Literal("guide"),
					Type.Literal("report"),
				]),
			),
			tags: Type.Optional(Type.Array(Type.String())),
			path: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		args: (params: { doc_id: string; content?: string; title?: string; type?: "spec" | "research" | "adr" | "guide" | "report"; tags?: string[]; path?: string }) => {
			const a = ["doc", "update", params.doc_id];
			if (params.content) a.push("--content", params.content);
			if (params.title) a.push("--title", params.title);
			if (params.type) a.push("-t", params.type);
			if (params.tags) a.push("--tags", params.tags.join(","));
			if (params.path) a.push("-p", params.path);
			return a;
		},
	});
	registerBacklogCliTool({ name: "backlog_doc_list", description: "List docs in Backlog.md.", parameters: Type.Object({}) as unknown as TSchema, args: () => ["doc", "list"] });
	registerBacklogCliTool({
		name: "backlog_doc_search",
		description: "Search docs in Backlog.md with plain text output.",
		parameters: Type.Object({
			query: Type.String(),
			limit: Type.Optional(Type.Number()),
		}) as unknown as TSchema,
		args: (params: { query: string; limit?: number }) => {
			const a = ["doc", "search", params.query];
			if (params.limit) a.push("--limit", String(params.limit));
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_doc_view",
		description: "View a doc in Backlog.md.",
		parameters: Type.Object({
			doc_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { doc_id: string }) => {

			return ["doc", "view", params.doc_id];
		},
	});
	registerBacklogCliTool({
		name: "backlog_board_export",
		description: "Export the Kanban board to a markdown file for sharing. Returns the export path.",
		parameters: Type.Object({
			file: Type.Optional(Type.String()),
			export_version: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		args: (params: { file?: string; export_version?: string }) => {
			const a = ["board", "export"];
			if (params.file) a.push(params.file);
			if (params.export_version)
				a.push("--export-version", params.export_version);
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_init",
		description: "Initialize Backlog.md in the current project. Creates the backlog structure with a minimal flow.",
		parameters: Type.Object({
			project_name: Type.Optional(Type.String()),
			no_git: Type.Optional(Type.Boolean()),
			defaults: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { project_name?: string; no_git?: boolean; defaults?: boolean }) => {
			const a = ["init"];
			if (params.project_name) a.push(params.project_name);
			if (params.no_git) a.push("--no-git");
			if (params.defaults) a.push("--defaults");
			return a;
		},
	});
	registerBacklogCliTool({
		name: "backlog_instructions",
		description: "Read Backlog.md workflow guides. Pass a guide name (overview, task-creation, task-execution, task-finalization, init-required) or use list=true to see available guides. Omit both for the guide index.",
		parameters: Type.Object({
			guide: Type.Optional(
				Type.Union([
					Type.Literal("overview"),
					Type.Literal("task-creation"),
					Type.Literal("task-execution"),
					Type.Literal("task-finalization"),
					Type.Literal("init-required"),
				]),
			),
			list: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { guide?: "overview" | "task-creation" | "task-execution" | "task-finalization" | "init-required"; list?: boolean }) => {
			let a: string[];
			if (params.list) {
				a = ["instructions", "--list"];
			} else if (params.guide) {
				a = ["instructions", params.guide];
			} else {
				a = ["instructions"];
			}
			return a;
		},
	});

	// ── task_complete ──────────────────────────────────────────────────────────

	registerBacklogCliTool({
		name: "backlog_task_complete",
		description: "Cleanup/archive a terminal-status task into completed. Use after a task is Done to move it to the completed folder.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["task", "complete", params.task_id];
		},
	});

	// ── Draft surfaces ─────────────────────────────────────────────────────────

	registerBacklogCliTool({ name: "backlog_draft_list", description: "List all drafts in Backlog.md.", parameters: Type.Object({}) as unknown as TSchema, args: () => ["draft", "list", "--plain"] });

	registerBacklogCliTool({
		name: "backlog_draft_create",
		description: "Create a draft in Backlog.md.",
		parameters: Type.Object({
			title: Type.String(),
			description: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		args: (params: { title: string; description?: string }) => {
			const a = ["draft", "create", params.title];
			if (params.description) a.push("-d", params.description);
			return a;
		},
	});

	registerBacklogCliTool({
		name: "backlog_draft_archive",
		description: "Archive a draft in Backlog.md.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["draft", "archive", params.task_id];
		},
	});

	registerBacklogCliTool({
		name: "backlog_draft_promote",
		description: "Promote a draft to a task in Backlog.md.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["draft", "promote", params.task_id];
		},
	});

	registerBacklogCliTool({
		name: "backlog_draft_view",
		description: "View a draft in Backlog.md.",
		parameters: Type.Object({
			task_id: Type.String(),
		}) as unknown as TSchema,
		args: (params: { task_id: string }) => {

			return ["draft", "view", params.task_id, "--plain"];
		},
	});

	// ── decision_list ──────────────────────────────────────────────────────────

	registerBacklogCliTool({ name: "backlog_decision_list", description: "List decisions in Backlog.md.", parameters: Type.Object({}) as unknown as TSchema, args: () => ["decision", "list"] });

	// ── board_view ─────────────────────────────────────────────────────────────

	registerBacklogCliTool({
		name: "backlog_board_view",
		description: "Display the Kanban board. Use layout='vertical' for vertical mode, milestones=true to group by milestone.",
		parameters: Type.Object({
			layout: Type.Optional(
				Type.Union([Type.Literal("horizontal"), Type.Literal("vertical")]),
			),
			milestones: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { layout?: "horizontal" | "vertical"; milestones?: boolean }) => {
			const a = ["board", "view"];
			if (params.layout === "vertical") a.push("--vertical");
			if (params.milestones) a.push("-m");
			return a;
		},
	});

	// ── overview ───────────────────────────────────────────────────────────────

	registerBacklogCliTool({ name: "backlog_overview", description: "Display project statistics and metrics.", parameters: Type.Object({}) as unknown as TSchema, args: () => ["overview"] });

	// ── config ─────────────────────────────────────────────────────────────────

	registerBacklogCliTool({
		name: "backlog_config",
		description: "Manage Backlog.md configuration. action='list' to list all, 'get' to read a key, 'set' to write a key+value.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("list"),
				Type.Literal("get"),
				Type.Literal("set"),
			]),
			key: Type.Optional(Type.String()),
			value: Type.Optional(Type.String()),
		}) as unknown as TSchema,
		args: (params: { action: "list" | "get" | "set"; key?: string; value?: string }) => {
			const a = ["config"];
			if (params.action === "list") a.push("list");
			else if (params.action === "get") a.push("get", params.key ?? "");
			else if (params.action === "set") a.push("set", params.key ?? "", params.value ?? "");
			return a;
		},
	});

	// ── agents ─────────────────────────────────────────────────────────────────

	registerBacklogCliTool({
		name: "backlog_agents",
		description: "Manage the Backlog.md CLI nudge in agent instruction files. Pass update_instructions=true to refresh the nudge.",
		parameters: Type.Object({
			update_instructions: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { update_instructions?: boolean }) => {
			const a = ["agents"];
			if (params.update_instructions) a.push("--update-instructions");
			return a;
		},
	});

	// ── doctor ─────────────────────────────────────────────────────────────────

	registerBacklogCliTool({
		name: "backlog_doctor",
		description: "Diagnose duplicate task, document, and decision IDs. Pass fix=true to apply repairs, yes=true to skip confirmation.",
		parameters: Type.Object({
			fix: Type.Optional(Type.Boolean()),
			yes: Type.Optional(Type.Boolean()),
		}) as unknown as TSchema,
		args: (params: { fix?: boolean; yes?: boolean }) => {
			const a = ["doctor"];
			if (params.fix) a.push("--fix");
			if (params.yes) a.push("--yes");
			return a;
		},
	});

	// ── cleanup ────────────────────────────────────────────────────────────────

	registerBacklogCliTool({ name: "backlog_cleanup", description: "Move completed tasks to the completed folder based on age.", parameters: Type.Object({}) as unknown as TSchema, args: () => ["cleanup"] });

	// ── Definition of Done defaults ────────────────────────────────────────────

	registerBacklogCliTool({ name: "backlog_definition_of_done_defaults_get", description: "Get project-level Definition of Done default checklist items.", parameters: Type.Object({}) as unknown as TSchema, args: () => ["config", "get", "definitionOfDone"] });

	registerBacklogCliTool({
		name: "backlog_definition_of_done_defaults_upsert",
		description: "Replace project-level Definition of Done default checklist items. Pass items as a JSON array string.",
		parameters: Type.Object({
			items: Type.Array(Type.String()),
		}) as unknown as TSchema,
		args: (params: { items: string[] }) => {

			return ["config", "set", "definitionOfDone", JSON.stringify(params.items)];
		},
	});
}
