# Benchmarks

Release proof should stay narrow.

## Primary publish comparison

- baseline = OMP + `codesight` + native `lsp`
- treatment = OMP + `codesight` + native `lsp` + `@ezxomp/code-nav`

## Secondary diagnostic comparison

- baseline raw = OMP only
- treatment raw = OMP + `@ezxomp/code-nav`

## Mandatory commands

```bash
npm run bench:harness:pilot
npm run bench:live:smoke
npm run bench:live:raw:smoke
```

## Gate shape

- Gate A: exact symbol value
- Gate B: reference and impact value
- Gate C: planner routing value
- Gate D: no control regression
- Gate E: headline eligibility

## Current release wording

- current live runs show strongest gains on exact symbol tasks while preserving answer quality
- planner helps choose when to use discovery, exact symbol tools, or raw LSP follow-up
