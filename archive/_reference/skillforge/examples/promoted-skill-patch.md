# Skill patch proposal

Generated proposal example:

```json
{
	"version": 1,
	"id": "omp-extensions__omp-extension-imports-use-js-suffix",
	"status": "pending",
	"partition": "project",
	"project_id": "omp-skillforge-a1b2c3d4",
	"target_skill": "omp-extensions",
	"target_path": "/home/user/.omp/agent/skills/omp-extensions/SKILL.md",
	"source_memory_id": "omp-extension-imports-use-js-suffix",
	"source_memory_path": "getAgentDir()/skillforge/memory/projects/omp-skillforge-a1b2c3d4/gotchas/omp-extension-imports-use-js-suffix.md",
	"memory_title": "Use .js suffixes for NodeNext OMP package imports",
	"memory_type": "gotcha",
	"proposed_guidance": "- With NodeNext ESM, write relative imports with runtime .js suffixes, even when importing OMP TypeScript sources.",
	"rationale": "gotcha memory 'Use .js suffixes for NodeNext OMP package imports' is confirmed, has 3 hit(s), and targets the omp-extensions skill.",
	"verification": [
		"TypeScript typecheck and OMP package loading passed after using .js import suffixes."
	],
	"created_at": "2026-05-06",
	"updated_at": "2026-05-06"
}
```

Review and apply with:

```text
/skillforge omp-extensions
```
