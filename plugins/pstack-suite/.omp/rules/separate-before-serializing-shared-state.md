---
name: separate-before-serializing-shared-state
description: "Separate independent writes before serializing them — parallel where safe, serialize only when state is truly shared"
condition:
  - 'for.*of.*await'
  - 'forEach.*async'
  - Promise\.all
  - 'await.*\n.*await'
  - 'race.?condition'
scope: "tool_call"
---


## When to apply

When managing concurrent async operations that may touch shared state, databases, or external services.

## Good

```typescript
// Independent fetches run in parallel
const [users, posts] = await Promise.all([fetchUsers(), fetchPosts()]);
```

## Bad

```typescript
// Serial when parallel is safe
for (const id of ids) {
  await fetchItem(id);
}

// forEach swallows async errors silently
items.forEach(async (i) => save(i));
```

## Checklist

- [ ] Independent operations batched with `Promise.all`
- [ ] Shared-state mutations serialized with a queue or lock
- [ ] No `forEach` with an async callback
- [ ] Sequential loops justified by documented dependency
