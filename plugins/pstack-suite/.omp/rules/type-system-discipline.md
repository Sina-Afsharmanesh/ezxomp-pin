---
name: type-system-discipline
description: "Let TypeScript enforce invariants at compile time instead of using runtime checks"
condition:
  - ': any\b'
  - ' as any\b'
  - as unknown as
  - instanceof
  - 'typeof .+ === "undefined"'
scope: "tool_call"
---


## When to apply

When writing or refactoring type annotations, discriminated unions, and type guards.

## Good

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return { ok: false, error: 'division by zero' };
  return { ok: true, value: a / b };
}
```

## Bad

```typescript
const data = JSON.parse(raw) as any;

if (result instanceof Success) { /* runtime check for a type boundary */ }
```

## Checklist

- [ ] No `any` or `as any` casts
- [ ] Discriminated unions encode state instead of runtime checks
- [ ] Type guards used for narrowing, not `instanceof`
- [ ] `unknown` at API boundaries, narrowed immediately
