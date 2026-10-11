---
name: experience-first
description: "Prioritize the user experience over implementation convenience — handle loading, error, and empty states"
condition:
  - loading
  - 'error.?state'
  - 'empty.?state'
  - skeleton
  - spinner
  - toast
  - banner
scope: "tool_call"
---


## When to apply

When building user-facing features, especially those involving async data or user input.

## Good

```typescript
function TaskList({ tasks, loading, error }: Props) {
  if (loading) return <TaskSkeleton />;
  if (error) return <ErrorBanner message={error} onRetry={refetch} />;
  if (tasks.length === 0) return <EmptyState title="No tasks" action={createTask} />;
  return <ul>{tasks.map(render)}</ul>;
}
```

## Bad

```typescript
function TaskList({ tasks }: Props) {
  return <ul>{tasks.map(render)}</ul>; // crashes if tasks is undefined
}
```

## Checklist

- [ ] Loading state shows a meaningful placeholder
- [ ] Error state is recoverable with a retry action
- [ ] Empty state guides the user toward their first action
- [ ] No null-ref crashes on missing or empty data
