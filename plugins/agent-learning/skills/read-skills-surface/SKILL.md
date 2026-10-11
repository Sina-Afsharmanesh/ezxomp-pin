---
name: read-skills-surface
description: read_skills tool contract — catalog listing, skills.sh search then source+name fetch flow, resource reference/copy modes, safe-language-only install policy, command-directive safety gating. Use when loading ezxomp plugin guidance or fetching curated remote skills.
---
# read_skills surface contract

## Modes

| Call | Effect |
|------|--------|
| read_skills() | list catalog + cached remote entries |
| read_skills(name="code-nav") | description only |
| read_skills(name="code-nav", full=true) | full body (directives interpolated locally) |
| read_skills(name="x", resource="references/api.md") | read reference into context |
| read_skills(name="x", resource="scripts/a.sh", output="tools/a.sh") | copy bytes into project |
| read_skills(search="rust macros") | skills.sh search (no download) |
| read_skills(source="owner/repo", name="s", full=true) | fetch+cache+load |

## Safety model

- Local full loads run !backtick-command directives through the gate policy: shell metacharacters blocked; critical/dangerous/risky gate rules blocked; survivors run shell-free with output fenced inline.
- Remote content is NEVER executed while being read and is prefixed with an untrusted-content notice.

## Safe-language install policy

Load only programming-language/framework/dev-tooling skills from skills.sh. The search formatter flags results so off-topic entries are visible. Non-language packs (personality/behavior) are out of policy.

## DO / DON'T

- DO prefer native skill://<name> for user/project skills; this tool is catalog+skills.sh scoped.
- DON'T refresh caches gratuitously; cached loads are validated by frontmatter name.
- DON'T copy scripts to paths outside the project; output is project-relative enforced.
