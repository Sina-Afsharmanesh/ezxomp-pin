---
name: boundary-discipline
description: "Enforce module boundaries — no cross-module reach, no leaking internals through public APIs"
condition:
  - 'import.*from.*\.\./\.\./'
  - 'import.*from.*internal'
  - 'export \* from'
  - 'export \{.*\} from'
scope: "tool_call"
---


## When to apply

When importing across directory boundaries or exporting symbols that expose implementation internals.

## Good

```typescript
// Import from the module's public barrel
import { userService } from '@/services/user/index.js';
```

## Bad

```typescript
// Reaches into another module's internals
import { rawQuery } from '../../infra/db/raw.js';

// Star-export leaks all internals
export * from './internal-helpers.js';
```

## Checklist

- [ ] Imports stay within the module's public API boundary
- [ ] No `..` chains deeper than the current package
- [ ] No star-exports of internal files
- [ ] Public barrel re-exports only intended surface area
