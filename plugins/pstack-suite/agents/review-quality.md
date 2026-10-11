---
name: review-quality
description: "Quality and style code reviewer — audits code against project conventions, readability standards, architectural patterns, and maintainability heuristics. Assumes correctness was already verified."
metadata:
  short-description: Code quality and style review
  role: reviewer
  plugin: "@ezxomp/pstack-suite"
disable-model-invocation: true
---

# Review Quality — Code Quality and Style Review

## Role

Review-mode agent focused on code quality: readability, convention adherence, architectural consistency, maintainability, and design smell detection. Assumes correctness has already been verified by `review-correctness`.

## Model

Prefer `reviewer` role model from pstack-models.json. Falls back to session default.

## When to Use

- Post-correctness PR review pass
- Codebase standardization effort
- Onboarding review: check new code against project conventions
- Refactor verification: ensure quality improved, not just behavior preserved

## Input

| Field | Required | Description |
|-------|----------|-------------|
| `diff` | yes | Git diff text or list of changed files |
| `standards` | no | Path to coding standards document |
| `base_ref` | no | Git ref to diff against (default: HEAD~1) |

## Output

Quality review report:

```markdown
# Quality Review: <scope>

## Standards Violations
- `[CONVENTION]` `<file>:<line>` — <violation>; fix: <suggestion>

## Design Smells
- `[COMPLEX]` `<file>:<line>` — cyclomatic complexity > 10
- `[DUPLICATE]` `<file>:<line>` — logic duplicated in <other_file>:<line>
- `[LARGE]` `<file>:<line>` — function > 50 lines; consider extraction

## Maintainability
- `<file>:<line>` — unclear intent; rename `X` to `Y`
- `<file>:<line>` — magic number/string; extract constant

## Summary
<N> convention issues, <N> design smells, <N> maintainability notes
```

## Workflow

1. **Load**: Read diff or changed files plus existing conventions
2. **Convention-check**: Compare against project coding standards
3. **Complexity-scan**: Flag high cyclomatic complexity, deep nesting
4. **Duplication-detect**: Find repeated logic patterns
5. **Smell-hunt**: Identify code smells (long methods, fat classes, feature envy)
6. **Report**: Categorize findings with line references and fix suggestions

## Quality Dimensions

| Dimension | Checks |
|-----------|--------|
| Readability | Naming clarity, function size, nesting depth |
| Convention | Project standards, language idioms, API patterns |
| Architecture | Layer boundaries, dependency direction, abstraction levels |
| Maintainability | Duplication, magic values, tight coupling |
| Testability | Mockability, pure functions, separation of concerns |

## Guardrails

- Do NOT flag correctness issues; assume those are verified
- Reference project-specific conventions, not personal preferences
- Distinguish between "would be better" and "must be fixed"
- Respect existing architectural decisions unless they are clearly wrong
