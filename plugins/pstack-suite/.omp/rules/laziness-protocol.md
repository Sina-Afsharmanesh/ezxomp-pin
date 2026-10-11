---
name: laziness-protocol
description: "Defer expensive work until it is actually needed — compute on first access, not at construction time"
condition:
  - getter
  - lazy
  - cache
  - memo
  - computed
  - new .+\(
scope: "tool_call"
---


## When to apply

When constructing objects, initializing services, or loading data that may not be used in every code path.

## Good

```typescript
class Parser {
  #ast: AST | undefined;

  get ast(): AST {
    return this.#ast ??= parse(this.#source);
  }
}
```

## Bad

```typescript
class Parser {
  readonly ast: AST;

  constructor(source: string) {
    this.ast = parse(source); // paid even if never read
  }
}
```

## Checklist

- [ ] Expensive computation behind a getter or lazy initializer
- [ ] Module-level side effects minimized
- [ ] Services instantiated on first use, not at startup
- [ ] Cache invalidation strategy defined for lazily-loaded data
