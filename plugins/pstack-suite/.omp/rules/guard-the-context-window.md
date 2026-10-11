---
name: guard-the-context-window
description: "Context windows are finite — read only what you need, search before reading, and compress outputs"
condition:
  - cat
  - grep
  - 'read.*entire'
  - 'load.*all'
scope: "tool_call"
---


## When to apply

When reading files, exploring codebases, or building context for AI agents.

## Good

```
# Search for the symbol first (codesight / code_nav tools when available)
codesight_get_symbol_index(query="createUser")
code_nav_get_symbol(symbol="createUser")

# Read only the section you need (eval kernel)
read(path="src/auth.ts", offset=40, limit=30)
```

## Bad

```
# Read entire 400-line file to find one function
cat src/auth.ts

# Chain grep then read every match file
grep -rn "createUser" src/
```

## Checklist

- [ ] Search (not full-file reads) to find symbols or patterns
- [ ] Grounded symbol reads via codesight_*/code_nav_* when registered
- [ ] Line ranges specified when reading specific sections
- [ ] Large outputs compressed before inclusion in prompts
