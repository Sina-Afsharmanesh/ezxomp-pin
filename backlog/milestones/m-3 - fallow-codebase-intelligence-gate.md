---
id: m-3
title: "Fallow codebase intelligence gate"
---

## Description

Integrate the Fallow CLI (MIT, deterministic static analysis — no LLM in the loop) into the ezxomp tooling and gates. Completion criteria: (1) `fallow-audit` wired into `just verify` as a new-only gate against the base ref; (2) `.fallowrc.json` committed with audit gate, production mode for dead-code, and CSS analysis off (no CSS in repo); (3) initial baselines captured in `fallow-baselines/` and current findings triaged into tickets; (4) all pre-existing dead code, duplication, and circular dependencies found by the initial scan either fixed or ticketed; (5) `just verify` passes end-to-end with the new gate.
