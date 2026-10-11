---
name: sequence-verifiable-units
description: "Each change should be the smallest independently verifiable unit — commit by behavior, not by file"
condition:
  - git commit
  - git add
  - PR
  - 'pull.?request'
  - changelog
scope: "tool_call"
---


## When to apply

When committing changes, writing PR descriptions, or deciding what belongs in one logical change.

## Good

```
feat(auth): add PKCE code challenge to OAuth flow

- Generate code verifier and S256 challenge
- Attach challenge to auth request query params
- Verify challenge on token callback
```

## Bad

```
fix: stuff
feat: add feature and fix bug and refactor module
```

## Checklist

- [ ] Each commit covers one behavioral change
- [ ] Commit message follows `type(scope): description`
- [ ] PR description links to the task or issue
- [ ] Tests added for the specific new behavior
