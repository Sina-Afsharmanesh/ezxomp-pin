/**
 * Canonical Backlog.md agent instructions, injected by extensions/index.ts as
 * the DEFAULT system-prompt overlay for all work (not gated on any workflow).
 *
 * Strings below are the verbatim output of `backlog instructions overview`,
 * `backlog instructions task-creation`, `backlog instructions task-execution`,
 * and `backlog instructions task-finalization` (backlog.md 1.50.1). If the CLI
 * ships new guide text, regenerate these constants from `backlog instructions`
 * so the overlay never drifts into a paraphrase.
 */

export const BACKLOG_OVERVIEW = `## Backlog.md Overview (CLI)

This project uses Backlog.md to track features, bugs, and structured work as tasks.

### When to Use Backlog

Create a task when the work requires planning, decisions, or handoff notes.

Ask: "Do I need to think about HOW to do this?"

- Yes: search for an existing task first, then create one if needed.
- No: do the small mechanical change directly.

Create tasks for work like bug fixes that need investigation, feature work, API changes, refactors, or anything that should be reviewed as a commitment. Skip task creation for questions, explanations, quick lookups, and obvious mechanical edits.

### Start Every Request Here

Use this overview to decide what to read or run next.

Search and read before changing anything:

- \`backlog search "query" --plain\`
- \`backlog task list --status "<todo status>" --plain\`
- \`backlog task list --status "<active status>" --plain\`
- \`backlog task list --search "login" --labels frontend,bug --limit 20 --plain\`
- \`backlog task view TASK-123 --plain\`

Use \`--json\` instead of \`--plain\` on \`task list\`, \`task view\`, \`task <id>\`, or \`search\` when a script needs stable versioned fields. Do not combine the two flags.

### Detailed Guides

**Required: read the matching guide below before creating, executing, or finalizing tasks. Do not rely on this overview alone for these actions.** The overview only tells you when to act; the guides define the required procedure, and skipping them produces inconsistent tasks and metadata.

- \`backlog instructions task-creation\`
  -> Read before creating tasks: how to search, scope, and create tasks
- \`backlog instructions task-execution\`
  -> Read before planning or updating task work: how to plan, update, and work through tasks
- \`backlog instructions task-finalization\`
  -> Read before finishing tasks: how to verify, summarize, and finish tasks

Use \`backlog <command> --help\` before unfamiliar operations. Command help includes input fields, read/write behavior, output shape, and examples.

### Core Principle

Backlog tracks committed work: what will be built, fixed, or changed. Use the CLI for Backlog changes so metadata, file names, relationships, and history stay consistent.

Important: Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use Backlog commands so automatic metadata stays complete.`;

export const BACKLOG_TASK_CREATION = `## Task Creation Guide

Use this guide when \`backlog instructions\` or the user indicates that new Backlog tasks are needed.

### Step 1: Search First

Always check whether the work is already tracked.

Recommended CLI commands:

- \`backlog search "desktop app" --plain\`
- \`backlog task list --status "<todo status>" --plain\`
- \`backlog task list --status "<active status>" --plain\`
- \`backlog task list --exclude-status "<terminal status>" --plain\`
- \`backlog task list --type "bug" --plain\`
- \`backlog task list --search "desktop app" --labels frontend,bug --limit 20 --plain\`

Avoid broad unfiltered listing when the project may have many tasks. Use \`--status\`, \`--exclude-status\`, \`--type\`, \`--assignee\`, \`--unassigned\`, \`--parent\`, \`--priority\`, \`--labels\`, \`--search\`, or \`--limit\` where applicable. Repeat \`--exclude-status\` or pass comma-separated configured statuses to exclude multiple states. Repeat \`--type\` or pass comma-separated configured task types to include multiple types.

Use \`backlog task view TASK-123 --plain\` to read full context for likely matches.

### Step 2: Assess Scope Before Creating Tasks

Decide whether the request is:

- A single atomic task that can be completed in one focused PR.
- A multi-task feature or initiative that needs subtasks or dependencies.

Ask:

1. Can this be completed in a single focused pull request?
2. Would a reviewer be comfortable reviewing all changes at once?
3. Are there natural independent delivery points?
4. Does the work span multiple subsystems, layers, or ownership areas?
5. Are multiple tasks likely to touch the same component?

### Step 3: Choose Task Structure

Use subtasks when the work shares one goal and one subsystem:

\`\`\`bash
backlog task create "Desktop application"
backlog task create -p TASK-10 "Set up shell"
backlog task create -p TASK-10 "Wire IPC"
\`\`\`

Use \`--parent\`/\`-p\` only with an existing task ID returned by \`backlog task create\`, \`backlog task list\`, or \`backlog task view\`. Do not pass milestone IDs such as \`m-0\` to \`--parent\`; assign a task to a milestone with \`--milestone\`/\`-m\`.

Use separate tasks with dependencies when work spans independent components:

\`\`\`bash
backlog task create "Add bulk update API"
backlog task create "Add bulk update UI" --dep TASK-21
\`\`\`

### Step 4: Create Tasks

Write tasks so a future agent can act on them without prior conversation context.

Include:

- A clear title.
- A description explaining the outcome and why it matters.
- Acceptance criteria that are specific, testable, and independent.
- References or documentation when they are needed for implementation.
- Dependencies when work must happen in order.
- An assignee with \`-a\` when the task has a known owner; omitting it applies the project's configured \`defaultAssignee\` when one is set, and \`-a ""\` leaves the task unassigned instead.

For future work, do **not** add an implementation plan or speculative code approach during task creation. Creation
captures the durable intent, context, scope, acceptance criteria, references, and dependencies. The worker researches
the current system and records the plan after picking up and activating the task, because the codebase or constraints may
change before then. The narrow exception is already-started work being created directly in a configured active status
(for example, In Progress); its current researched plan may be supplied at creation.

Examples:

\`\`\`bash
backlog task create "Add project search" \\
  -d "Users can search tasks, docs, and decisions from one CLI command." \\
  --ac "Search returns matching tasks by title and description" \\
  --ac "Search supports --plain output" \\
  --ac "Tests cover task, document, and decision results"
\`\`\`

\`\`\`bash
backlog task create "Add settings docs" \\
  --doc docs/settings.md \\
  --ref https://example.com/spec
\`\`\`

### Shell Quoting for Literal Backticks

When task text includes Markdown code spans, quote it so the shell passes the backticks literally. Unescaped backticks in double-quoted or unquoted arguments are command substitution in many shells, and Backlog.md cannot recover the original text after the shell has already executed it.

Use single-quoted CLI arguments for values that contain literal backticks:

\`\`\`bash
backlog task create 'Document \`backlog init\` setup' \\
  --ac 'Instructions mention \`backlog init --defaults\` literally'
\`\`\`

If single quotes are not practical in your shell, escape each literal backtick before running the command. Do not rely on Backlog.md to sanitize accidental command output after substitution.

### Acceptance Criteria

Acceptance criteria define the expected behavior, not implementation steps.

Good criteria:

- Are testable.
- Include edge cases when relevant.
- Include documentation and test expectations when required.

Avoid criteria like "Implement helper function" unless the helper itself is the user-visible deliverable.

### Definition of Done

Project-level Definition of Done defaults apply automatically. Add task-specific DoD items only when this task needs extra completion hygiene:

\`\`\`bash
backlog task create "Ship audit export" --dod "Manual export checked with sample data"
\`\`\`

### After Creation

Report the created task IDs, titles, and key acceptance criteria to the user. If the user asks for changes, update tasks through \`backlog task edit\`.

If you will continue from task creation into implementation in the same session, stop and read \`backlog instructions task-execution\` before viewing, assigning, planning, editing, or implementing a task. Task creation is complete once the work is tracked; execution uses a separate workflow.`;

export const BACKLOG_TASK_EXECUTION = `## Task Execution Guide

Use this guide when you are working on an existing Backlog task.

### Planning Workflow

Before writing code for non-trivial work:

1. Read the task before mutating it:
   - \`backlog task view TASK-123 --plain\`
2. Review its current status, description, acceptance criteria, dependencies, references, and documentation. Confirm the
   task is eligible to start and remains within the requested scope.
3. Mark it in progress and assign yourself:
   - Inspect accepted statuses if needed: \`backlog task edit TASK-123 --help\`
   - \`backlog task edit TASK-123 -s "<active status>" -a @your-name\`
4. Research the current system, including relevant code, tests, conventions, and recent changes. Do not rely on an
   implementation approach proposed when the task was created.
5. Draft an implementation plan.
6. Record the current plan in the task before implementation:
   - \`backlog task edit TASK-123 --plan "1. ..."\`
7. If the plan contains a material product, architecture, or workflow decision, or the project or user requires plan
   review, present it and wait for explicit approval before implementation. Routine plans need not block when no review
   was requested and they stay within confirmed scope.

Keep the Backlog task as the plan of record. If the approach changes, replace it with \`--plan\` or extend it with one
or more repeatable \`--append-plan\` values. When both options are provided, \`--plan\` replaces the existing plan first,
then each \`--append-plan\` value is appended in CLI order:

- \`backlog task edit TASK-123 --append-plan "5. Verify the revised approach"\`
- \`backlog task edit TASK-123 --plan "1. Revised approach" --append-plan "2. Verify it"\`

### Execution Workflow

Work in short loops:

1. Implement a focused slice.
2. Run relevant tests or checks.
3. Record useful progress:
   - \`backlog task edit TASK-123 --append-notes "Implemented parser and added tests."\`
4. Add comments for discussion or review questions:
   - \`backlog task edit TASK-123 --comment "Question for review" --comment-author @your-name\`

Use \`backlog task edit TASK-123 --help\` before changing unfamiliar fields.

Do not check acceptance criteria, write the final summary, or move the task to the terminal status from this guide alone. When implementation appears complete, read the finalization guide and verify each acceptance criterion with objective evidence before checking it.

### Scope Changes

If you discover work that is outside the task's acceptance criteria, stop and ask the user whether to add scope to the current task or create follow-up work. Do not silently expand the task.

### Working With Subtasks

If the user assigns a parent task and all subtasks, complete subtasks one at a time. Each subtask should have its own plan, notes, checked acceptance criteria, and final summary.

If the user assigns only one subtask, finish that subtask and ask before moving to the next one.

### Reading and Writing Backlog Data

Use CLI commands for Backlog changes:

- Read: \`backlog task view TASK-123 --plain\`
- Search: \`backlog search "query" --plain\`
- List with task filters: \`backlog task list --status "<active status>" --assignee @your-name --labels backend --search "auth" --limit 20 --plain\`
- Update: \`backlog task edit TASK-123 ...\`
- Create docs: \`backlog doc create "Title"\`
- Update docs: \`backlog doc update doc-1 --content "Markdown"\`

For programmatic reads, \`task list\`, \`task view\`, \`task <id>\`, and \`search\` accept \`--json\`. JSON mode is noninteractive, versioned, and cannot be combined with \`--plain\`.

Do not edit Backlog markdown files directly. The CLI preserves metadata, IDs, filenames, relationships, and structured sections.

### Finishing

When implementation is complete, continue with:

\`\`\`bash
backlog instructions task-finalization
\`\`\``;

export const BACKLOG_TASK_FINALIZATION = `## Task Finalization Guide

Use this guide when implementation is complete and you are ready to hand off the task.

### Finalization Workflow

1. Review the task and identify the evidence needed for each acceptance criterion:
   - \`backlog task view TASK-123 --plain\`
2. Run objective verification before checking acceptance criteria. Use automated tests, command output, scripted UI checks, or explicit manual verification of the behavior. For UI or interactive work, exercise the behavior through a browser, DOM script, test runner, or documented manual interaction result. Do not check acceptance criteria from code presence, grep output, or implementation intent alone.
3. Check only the acceptance criteria that the verification evidence proves:
   - \`backlog task edit TASK-123 --check-ac 1\`
4. Verify Definition of Done items:
   - \`backlog task edit TASK-123 --check-dod 1\`
5. Run relevant automated checks and note results.
6. Update implementation notes if important context changed:
   - \`backlog task edit TASK-123 --append-notes "Validation passed: bun test ..."\`
7. Write a concise final summary that names the verification evidence:
   - \`backlog task edit TASK-123 --final-summary "Changed X, verified with Y."\`
8. Mark the task with the configured terminal status:
   - Inspect accepted statuses if needed: \`backlog task edit TASK-123 --help\`
   - \`backlog task edit TASK-123 -s "<terminal status>"\`

Tasks in the terminal status stay there until periodic cleanup moves them to completed. Do not archive completed work.

### Definition of Done Checklist

Confirm:

- The implementation plan exists and matches the final solution.
- Acceptance criteria are checked only after objective verification evidence proves the behavior.
- Definition of Done items are checked.
- The task uses the configured terminal status.
- Relevant tests or checks pass.
- Documentation/configuration updates are complete when required.
- Implementation notes contain useful decisions or validation results.
- Final summary explains what changed, why, and how it was verified.

### Comments, Notes, and Final Summary

- Comments are for discussion and review questions.
- Implementation Notes are for progress, decisions, blockers, and validation details.
- Final Summary is the concise completion summary.

Commands:

\`\`\`bash
backlog task edit TASK-123 --comment "Ready for review" --comment-author @your-name
backlog task edit TASK-123 --append-notes "Chose approach A because ..."
backlog task edit TASK-123 --final-summary "Implemented ..., verified with ..."
\`\`\`

### Follow-up Work

Do not create or start follow-up tasks without user approval. If follow-up work is needed, describe it and ask the user how to proceed.`;

/**
 * Quality standards previously injected by @ezxomp/cook alongside stage prompts.
 * Kept byte-stable so cook keeps its exact historical behavior after the move.
 */
export const BACKLOG_QUALITY_STANDARDS = [
	"",
	"[BACKLOG.MD — Quality Standards]",
	"Record ALL artifacts in Backlog.md with quality:",
	"",
	"Plans → backlog_task_edit --plan: numbered steps, concrete file/symbol targets, risk callouts, verification checkpoints. After plan approval, persist it.",
	"Notes → backlog_task_edit --append-notes: decisions, progress, validation results",
	"Findings → backlog_task_edit --comment: file:line + reason + fix",
	"Summary → backlog_task_edit --final-summary: what changed + verification evidence",
	"AC → backlog_task_edit --check-ac: only after objective verification",
	"DoD → backlog_task_edit --check-dod: only after verification",
	"",
	"Docs → backlog_doc_create (type REQUIRED):",
	"  spec: problem, constraints, interface contracts, non-goals, edge cases",
	"  research: evidence-grounded, cites sources, structured by frame",
	"  adr: context, decision, consequences, alternatives",
	"  guide: task-oriented steps, not reference dumps",
	"  report: data-driven, dated, actionable findings",
	"ADRs → backlog_decision_create",
	"Search → backlog_search (supports type, task_type, exclude_status filters)",
	"Milestones → backlog_milestone_add: name = deliverable outcome, description = completion criteria",
	"Archive done → backlog_task_archive",
	"Export board → backlog_board_export",
	"",
	"Tickets → backlog_task_create: title = outcome, description = context, AC = observable behavior, type = bug/feature/enhancement/task/chore/docs/spike",
	"Labels: feature/bug/refactor/design/architecture/spike/research/investigation — these select the workflow chain",
].join("\n");

/** Full default overlay injected before every agent start. */
export function defaultOverlay(): string {
	return [
		BACKLOG_OVERVIEW,
		BACKLOG_TASK_CREATION,
		BACKLOG_TASK_EXECUTION,
		BACKLOG_TASK_FINALIZATION,
		BACKLOG_QUALITY_STANDARDS,
	].join("\n\n");
}
