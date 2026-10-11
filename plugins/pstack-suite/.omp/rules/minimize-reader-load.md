---
name: minimize-reader-load
description: "Minimize cognitive load: names should reveal intent, functions should do one thing, and bodies should be short"
condition:
  - 'function .+ \{'
  - '=> \{'
  - \.map\(
  - \.filter\(
  - \.reduce\(
scope: "tool_call"
---


## When to apply

When writing or reviewing functions, especially those longer than 20 lines or with more than 3 parameters.

## Good

```typescript
function activeSubscribers(users: User[]): User[] {
  return users.filter(u => u.subscribed && u.active);
}
```

## Bad

```typescript
// Does three things: validates, transforms, and persists
function p(d: any, c: any, f: any) {
  if (!d) throw new Error('...');
  const x = d.map(...);
  db.save(x);
  notify(c, f);
}
```

## Checklist

- [ ] Function name describes the outcome, not the mechanism
- [ ] Single responsibility — one conceptual action per function
- [ ] Parameters grouped in an options object if more than 3
- [ ] Body short enough that a reader doesn't need to scroll
