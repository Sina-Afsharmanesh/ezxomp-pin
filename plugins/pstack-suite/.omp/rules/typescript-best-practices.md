---
name: typescript-best-practices
description: "Write idiomatic TypeScript: strict mode, exhaustive checks, literal types, const assertions, and no enums"
condition:
  - enum
  - interface
  - type .+
  - satisfies
  - as const
  - never
scope: "tool_call"
---


## When to apply

When defining types, type guards, discriminated unions, or exhaustive type checks.

## Good

```typescript
type Status = 'idle' | 'loading' | 'success' | 'error';

const STATUSES = ['idle', 'loading', 'success', 'error'] as const;

function label(status: Status): string {
  switch (status) {
    case 'idle': return 'Waiting';
    case 'loading': return 'Processing';
    case 'success': return 'Done';
    case 'error': return 'Failed';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}
```

## Bad

```typescript
enum Status { Idle, Loading, Success, Error } // runtime overhead

const s: Status = data.status as Status; // unsafe cast
```

## Checklist

- [ ] String literal types preferred over enums
- [ ] `as const` for literal arrays and config objects
- [ ] Exhaustive `switch` with `never` fallback
- [ ] `satisfies` operator for structural validation without widening
- [ ] No `declare` for local types — only ambient declarations
