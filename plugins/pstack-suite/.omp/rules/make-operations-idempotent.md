---
name: make-operations-idempotent
description: "Operations should be safe to retry — calling them twice must have the same effect as calling them once"
condition:
  - retry
  - idempoten
  - upsert
  - 'conflict.*do'
  - ON CONFLICT
  - POST /
scope: "tool_call"
---


## When to apply

When designing APIs, database mutations, or HTTP endpoints that may be retried by the client or infrastructure.

## Good

```typescript
// Upsert — safe to call multiple times with the same key
await db.user.upsert({
  where: { id: userId },
  create: { id: userId, name },
  update: { name },
});
```

## Bad

```typescript
// Not idempotent — retry creates a duplicate row
await db.user.create({ data: { id: userId, name } });
```

## Checklist

- [ ] Write operations use upsert or unique constraints
- [ ] HTTP endpoints accept idempotency headers
- [ ] GET/PUT/DELETE are naturally idempotent; POST is not
- [ ] Retry policy documented alongside the API
