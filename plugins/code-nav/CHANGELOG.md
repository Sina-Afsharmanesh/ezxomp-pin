# Changelog

## 0.4.0

- rename tool prefix `pi_lsp_` → `code_nav_` across all tools, planner, and types
- multi-language support: file scanner, lang detection, and declaration patterns now cover CSS, Python, Go, Rust, Java, Kotlin, Ruby, PHP, Swift, Dart, Elixir, Scala, Lua, Haskell, HTML (layers 1-3)

## 0.2.0

- add `code_nav_plan_navigation` tool and `/nav` command
- add deterministic planner modules for intent, evidence, bounded next-hop routing, and plan formatting
- replace legacy cross-tool dispatch with containment-checked filesystem and symbol backends
- adapt tests and registration smoke coverage to the native OMP extension API
- update package metadata for publish-ready extension packaging
- rewrite README and add workflow, chooser, claims, and benchmark docs
- add MIT license and CI/release workflows
