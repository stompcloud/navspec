# AGENTS.md

Read `DESIGN.md` before making architectural changes.

## Language

Use TypeScript for core implementation.

## Core rules

- Treat NavSpec as a small compiler: YAML → AST → validation/normalization → canonical IR → target generators.
- Use flat YAML node definitions.
- Model navigation as a directed graph, not a tree.
- Use stable kebab-case IDs for node identity and references.
- Preserve stable IDs through localization; localization affects presentation, not identity.
- Keep the canonical IR framework-neutral.
- Do not put Expo, React, SwiftUI, Angular, test-framework, or styling concepts in the core model.
- Target generators consume canonical IR, not raw YAML.
- Generated automated tests are a first-class output.
- Derive generic test intent once, then translate it in target-specific test generators.
- Preserve source locations for useful diagnostics.
- CLI behavior should be deterministic and non-interactive by default.
- Generation should be atomic: failed generation must not leave partial output.
- `nav.yaml` is the source of truth; do not design around lossless generated-code round-tripping.

## Scope discipline

Keep v0.1 small. Prefer concrete current requirements over speculative abstractions.

When adding logic:
- YAML syntax → parser
- defaults/inference → normalization
- invalid or suspicious model → validator
- graph traversal → core graph utilities
- generic test semantics → test planner
- framework-specific behavior → target generator
- localization/styling → presentation layer

Add regression tests for bugs and unit tests for core semantic behavior.

