---
id: m-1
title: "Cook TUI/UX Update — Items 1–6"
---

## Description

Ship the recommended cook TUI updates (1-6): multi-line chain progress widget, /cook autocomplete, DAG status overlay, tool renderers for cook_* tools, working message + title during chains, and watch activity in the widget. Completion criteria: all six items implemented with tests, `just verify` passes, widget stays within the 10-line string-array cap, all custom UI guarded by ctx.hasUI with notify fallback. #7 (config wizard upgrade) is deferred.
