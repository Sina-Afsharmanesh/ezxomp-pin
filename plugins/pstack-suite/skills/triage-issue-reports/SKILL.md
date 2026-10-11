name: triage-issue-reports
description: Triage incoming issue reports — detect duplicates, create backlog tasks, and optionally file remote issues.

## Workflow

1. **Parse input**: Extract title and description from args or user message; validate title is non-empty.
2. **Duplicate check**: Run backlog task search <title>; if exact title match found, report existing task ID and stop.
3. **Quality gate**: If description is empty or under 50 characters, tag with needs-investigation label.
4. **Create backlog task**: Run backlog task create <title> -d <description> --type bug -l <labels>.
5. **Remote detection**: Run git remote -v to detect GitHub/GitLab; skip remote issue if no remote.
6. **Remote issue creation**:
   - With --yes flag: create via gh issue create or glab issue create using argv (no shell interpolation).
   - Without --yes: notify user with manual command to run.
7. **Failure handling**: If backlog or remote creation fails, log error and continue (fail closed).
8. **Report**: Print summary with task ID, remote issue URL (if created), and any warnings.

## Guardrails
- NEVER interpolate user input into shell strings; pass via argv to spawnSync.
- Fail closed on missing deps — log error, do not block user.
- One triage per invocation; no batch mode.
