---
name: migrate-callers-then-delete-legacy-apis
description: "Migrate every caller to the new API before removing the old one — never leave deprecated code alive"
condition:
  - '@deprecated'
  - legacy
  - 'backward.?compatible'
  - compat
  - shim
scope: "tool_call"
---


## When to apply

When renaming, replacing, or refactoring a public API surface.

## Good

```typescript
// Single commit: callers use new name, old function is gone
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
```

## Bad

```typescript
export function formatCurrency(amount: number, currency: string): string { ... }

/** @deprecated use formatCurrency */
export function formatMoney(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}
```

## Checklist

- [ ] All callers updated to the new API
- [ ] Legacy function removed in the same commit
- [ ] No shim, alias, or deprecated marker left behind
- [ ] Tests exercise the new surface, not the old
