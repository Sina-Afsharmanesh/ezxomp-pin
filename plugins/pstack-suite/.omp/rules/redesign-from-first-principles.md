---
name: redesign-from-first-principles
description: "When a module is fundamentally broken, rewrite from the invariant — not by patching the existing code"
condition:
  - rewrit
  - 'from.?scratch'
  - 'rip.?and.?replace'
  - 'fundamental.*problem'
  - 'tech.?debt'
  - 'legacy.*spaghetti'
scope: "tool_call"
---


## When to apply

When a module has so many patches that its behavior is unclear, or a core invariant is violated in multiple places.

## Good

```typescript
// Invariant: a user has exactly one active session
interface SessionStore {
  activate(userId: string): void;
  deactivate(sessionId: string): void;
  current(userId: string): Session | null;
}
```

## Bad

```typescript
// Patch #12: handle the case where session exists but user is
// marked inactive in the DB but the cache still thinks they're in...
if (session && !user.active && cache.has(session.id)) {
  // workaround...
}
```

## Checklist

- [ ] Core invariant stated before writing any code
- [ ] Tests for the invariant written first (RED phase)
- [ ] Interface designed around the invariant, not legacy paths
- [ ] Existing behavior captured in tests before deletion
