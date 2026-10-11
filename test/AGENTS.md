# test

## Purpose

Test suite for the ezxomp monorepo. Contains unit tests, integration tests, and smoke tests for plugins.

## Ownership

Test files follow the same ownership as their corresponding plugins. Smoke tests cover cross-plugin integration.

## Local Contracts

- Tests use Bun's built-in test runner (`bun test`)
- Test files follow `<name>.test.ts` naming convention
- Smoke tests (`smoke-*.test.ts`) verify plugin loading and basic functionality
- Tests should be deterministic and isolated — no shared mutable state

## Work Guidance

- Write tests that defend observable contracts, not implementation details
- Use `bun test test/<name>.test.ts` to run specific test files
- Smoke tests should be fast and catch integration issues early

## Verification

- `just test` runs the full test suite
- `just smoke` runs smoke tests only (faster feedback)

## Child DOX Index

No child docs yet.
