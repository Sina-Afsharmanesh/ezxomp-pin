name: benny-setup
description: Configure and verify the Benny issue triage toolchain — backlog CLI, git remote, gh/glab CLI availability.

## Workflow

1. **Verify backlog CLI**: Run which backlog; if missing, guide install via npm i -g backlog.md.
2. **Check VCS remote**: Run git remote -v to confirm GitHub/GitLab remote exists; warn if none found.
3. **Check gh CLI**: Run which gh; if on GitHub remote and gh missing, guide install: https://cli.github.com/.
4. **Check glab CLI**: Run which glab; if on GitLab remote and glab missing, guide install: https://gitlab.com/gitlab-org/cli/-/releases.
5. **Verify auth**: Run gh auth status (or glab auth status); report unauthenticated state; guide through gh auth login.
6. **Test backlog**: Run backlog task list to confirm CLI responds; report errors.
7. **Print summary**: Output config report showing remote type, tool availability, and auth status.
8. **Blocker check**: If backlog missing or VCS unauthenticated, recommend --yes flag for auto-confirm flows.

## Dependencies
- backlog CLI (hard)
- git (hard)
- gh CLI (soft, GitHub remotes)
- glab CLI (soft, GitLab remotes)
