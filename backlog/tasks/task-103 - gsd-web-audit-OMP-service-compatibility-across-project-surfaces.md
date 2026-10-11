---
id: TASK-103
title: 'gsd-web: audit OMP service compatibility across project surfaces'
status: Done
assignee: []
created_date: '2026-09-07 07:09'
updated_date: '2026-09-07 07:11'
labels:
  - investigation
  - architecture
  - bug
dependencies: []
priority: high
type: spike
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Exercise the live GSD web application against a real brownfield monorepo and record the adaptations needed for OMP services, portable project roots, bundled providers, skill discovery, and every visible UI surface. Audit is read-only: do not initialize or modify the attached project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard, Power Mode, Chat, Roadmap, Files, Activity, Visualize, Projects, Git, Settings, Recovery, and Theme surfaces are exercised against a live project attachment
- [x] #2 Each observed service failure or cross-project compatibility gap has objective UI or endpoint evidence and a separately actionable follow-up task
- [x] #3 Skill discovery findings distinguish OMP user/project skill roots from legacy GSD provider assumptions
- [x] #4 Audit records do not initialize the project or make product-source changes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Backlog notes capture evidence, affected source areas, and follow-up task IDs
- [x] #2 Final summary names the live UI and API checks used
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the project, GSD web, CodeSight, and CodeNav contracts before touching the live surface. 2. Launch a standalone GSD web server attached to a brownfield monorepo without initializing the project. 3. Exercise every safe visible surface and probe the corresponding read-only service endpoints. 4. Ground each failure in the owning source/provider path and distinguish stale artifact behavior from current source behavior. 5. Create independently actionable follow-up tasks for provider layout, OMP skill roots, recovery/settings, activity noise, artifact invalidation, project-root discovery, overlay lifecycle, and skill onboarding visibility. 6. Record evidence and leave product source unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Live read-only browser audit used a standalone server at http://127.0.0.1:47123 with GSD_WEB_PROJECT_CWD=/home/egsox/repo/ezxomp; no Initialize Project, Browse, Step, chat send, auth, or external side-effect controls were activated. Exercised Dashboard, Power Mode, Chat, Roadmap, Files (GSD/Project/Agent tabs plus AGENTS.md viewer), Activity, Visualize, Projects, Git, Settings sections (General/Model/Session Behavior/Recovery/Auth/Integrations/Workspace/Experimental/Admin), Recovery entrypoint, and Theme (Dark -> System -> Light -> Dark). Endpoint evidence: /api/boot 200 with project detection, empty milestones, validationIssues []; /api/visualizer 500 because service checks web/server/services-dist/visualizer.mjs while staged file is visualizer-data.mjs; /api/skill-health 500 because service checks legacy packageRoot/src/resources/extensions/gsd paths; /api/recovery 500 for the same legacy provider layout. UI evidence: Power Mode loaded obsolete terminal_resize failure from stale standalone output despite source dual-terminal.tsx using ChatPane and COMMANDS.md marking terminal_* unsupported; Activity appended [UI] setStatus every second while idle; Projects showed Set your development root despite an attached project; Settings General exposed Skills install only as a non-interactive checklist; Settings Recovery/Experimental remained loading/error; Projects and Settings sheets stayed mounted while switching main surfaces. Source evidence: web/server/visualizer-service.ts, skill-health-service.ts, recovery-diagnostics-service.ts, bridge/ts-subprocess-flags.ts, host-launcher.ts, vendor-gsd-core/coding-agent/core/utils.ts (getSkillDirectories returns []), vendor-gsd-core/gsd/git/preferences-skills.ts. Follow-ups: TASK-103.1 through TASK-103.8.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed a read-only live audit of GSD web against /home/egsox/repo/ezxomp. Browser checks covered Dashboard, Power Mode, Chat, Roadmap, Files (all tabs plus file viewer), Activity, Visualize, Projects, Git, all Settings sections, Recovery, and Theme; API probes covered boot, visualizer, skill-health, and recovery. Logged eight follow-ups TASK-103.1 through TASK-103.8 with source paths and observable acceptance criteria. No project initialization, chat submission, auth action, or product-source edit was performed.
<!-- SECTION:FINAL_SUMMARY:END -->
