# NavSpec Design Brief

## 1. Project goal

NavSpec is a developer tool for describing application navigation and related application structure in a small, human-friendly declarative specification.

A NavSpec source file is transformed into a framework-neutral semantic model, from which the tool can generate multiple products, including:

- application navigation code
- automated navigation tests
- documentation
- diagrams and graph representations
- other framework-specific artifacts

The initial use case is settings/configuration navigation, with Expo / React Native as the first likely application target.

The architecture should not, however, assume that navigation is a simple tree or that Expo is the only target.

NavSpec should behave more like a small compiler than a template-expansion utility.

Conceptually:

```text
NavSpec YAML
     ↓
Parser
     ↓
Semantic AST
     ↓
Validation + normalization
     ↓
Canonical framework-neutral IR
     ↓
 ┌──────────┬───────────┬──────────┬──────────┐
 ↓          ↓           ↓          ↓          ↓
Expo      SwiftUI     React      Tests      Docs
generator generator   generator  generator   generator
```

The canonical IR is the durable center of the architecture.

---

## 2. Implementation language

NavSpec should be implemented in TypeScript.

Reasons include:

- familiarity and development velocity
- strong modeling of AST/IR structures
- good YAML and structured-data libraries
- excellent testing ecosystem
- proximity to Expo, React, and web targets
- ability to expose a typed TypeScript API in the future
- ability to use TypeScript-aware code-generation tools for TypeScript/TSX targets

Performance is not a primary language-selection criterion.

NavSpec specifications should normally be small enough that clarity, correctness, maintainability, and generator extensibility matter considerably more than raw transformation speed.

---

## 3. Source format

The first NavSpec authoring format should be YAML.

The source should favor a flat representation rather than deeply nested YAML.

Example:

```yaml
root:
  items:
    - account
    - get-help

account:
  items:
    - email
    - password
    - privacy

get-help:
  items:
    - documentation
    - contact-support

security:
  items:
    - privacy

email:

password:

privacy:

documentation:
  type: external-link
  url: https://example.com/docs

contact-support:
  type: action
```

Each node is defined independently.

This is deliberate.

NavSpec navigation is a graph, not necessarily a tree.

For example, both `account` and `security` may navigate to the same `privacy` node:

```yaml
account:
  items:
    - privacy

security:
  items:
    - privacy
```

There is only one `privacy` node.

The flat representation also keeps individual screen definitions readable when navigation becomes deeply nested.

---

## 4. Stable node IDs

Stable IDs are the primary identifiers throughout the NavSpec source.

Prefer kebab-case IDs:

```text
account
get-help
delete-account
two-factor-authentication
privacy-and-security
```

The source DSL should not alternate between stable IDs and human-facing labels.

References between nodes always use IDs.

Example:

```yaml
account:
  items:
    - email
    - delete-account
```

Changing a node ID is a structural rename and may affect generated routes, filenames, references, tests, and other generated artifacts.

Human-visible labels are presentation data and must not define node identity.

---

## 5. Default display names

For v1, an English fallback display name should be derived deterministically from the stable ID.

The algorithm should intentionally be simple and unsurprising:

1. split the ID on `-`
2. uppercase the first character of each token
3. join the tokens with spaces
4. perform no additional linguistic processing

Examples:

```text
delete-account             -> Delete Account
two-factor-authentication  -> Two Factor Authentication
privacy-and-security       -> Privacy And Security
api-access                 -> Api Access
oauth-login                -> Oauth Login
```

This rule is intentionally not linguistically sophisticated.

V1 should not contain acronym dictionaries, stop-word rules, or other heuristics.

Future versions may support:

- acronym dictionaries
- configurable capitalization behavior
- localization resources
- explicit node-level label overrides

These features must not change node identity.

---

## 6. Localization

Stable IDs must survive parsing, normalization, IR generation, and target generation.

Localization should not replace IDs in the canonical IR.

For v1:

```text
localization key = node ID
```

For example:

```text
delete-account
```

remains the stable semantic identifier regardless of whether the rendered label becomes:

```text
Delete Account
Supprimer le compte
...
```

Different targets may have different canonical localization mechanisms.

Therefore localization should not necessarily be completely resolved before target generation.

A target generator must have access to stable IDs so that, for example:

- an Expo generator can emit integration with the application's localization mechanism
- a SwiftUI generator can use Apple's localization conventions
- another target can resolve strings during generation if appropriate

A temporary resolved presentation model may be useful for targets that want pre-resolved strings, but it should not replace the canonical IR.

---

## 7. AST and canonical IR

NavSpec should conceptually distinguish parsing from semantic normalization.

The pipeline should be:

```text
YAML source
    ↓
Parser
    ↓
Semantic AST
    ↓
Validation + normalization
    ↓
Canonical IR
```

The parsed AST may preserve what the author explicitly wrote.

For example:

```yaml
account:
  items:
    - email

email:
```

could initially represent approximately:

```ts
{
  id: "account",
  items: ["email"]
}

{
  id: "email"
}
```

Normalization then makes implicit semantics explicit:

```ts
{
  id: "account",
  type: "menu",
  items: ["email"]
}

{
  id: "email",
  type: "page",
  items: []
}
```

Target generators consume the canonical IR, not the raw YAML representation.

A target generator should not need to know which properties were implicit in the source DSL.

---

## 8. Framework-neutral core model

The canonical IR must not contain framework-specific concepts.

The core model may contain concepts such as:

```ts
interface NavigationNode {
  id: string;
  type: NodeType;
  items: string[];
}
```

It must not contain concepts such as:

```text
Stack.Screen
React.Component
SwiftUI.NavigationLink
Angular route component
Expo Router path object
```

Those belong exclusively to target generators.

Similarly, visual presentation details such as padding, font size, React component names, CSS properties, or SwiftUI modifiers must not be part of the core semantic model.

---

## 9. Node semantics

Whether a node has children is separate from what kind of node it is.

`items` answers:

> Which nodes are reachable from this node?

`type` answers:

> What semantic kind of node is this?

Candidate semantic node types include:

```text
menu
page
action
external-link
label
group
```

Not all of these need to exist in v1.

A reasonable initial set is:

```text
menu
page
action
external-link
```

Possible future semantic properties include:

```text
destructive
icon
hidden
condition
order
```

Do not add semantic concepts until there is a concrete use case for them.

### Type inference

V1 may infer types where the result is unsurprising.

For example:

- node with `items` and no explicit `type` -> `menu`
- node without `items` and no explicit `type` -> `page`

Other semantics should generally be explicit:

```yaml
delete-account:
  type: action

documentation:
  type: external-link
  url: https://example.com/docs
```

Normalization should convert all inferred types into explicit canonical IR values.

---

## 10. Source of truth

The NavSpec source is the source of truth.

Initial data flow should be one-directional:

```text
nav.yaml
   ├──> application code
   ├──> tests
   ├──> documentation
   └──> diagrams
```

Do not attempt to make arbitrary generated source code and the NavSpec DSL bidirectionally authoritative.

A future code-to-NavSpec importer may be useful as a migration or bootstrap tool, but lossless round-tripping is not a v1 requirement.

---

## 11. Target generators

Framework-specific output should be produced by target generators.

Potential target generators include:

```text
Expo / React Native
React web
Angular
SwiftUI
Markdown documentation
Mermaid or other graph visualization
automated tests
```

Prefer the term "target generator" in user-facing documentation.

Internally, "backend" may also be useful in the compiler sense.

Each target generator should operate on the canonical IR rather than parsing or interpreting YAML itself.

This ensures that parsing, validation, inference, and graph semantics are implemented once.

---

## 12. Code generation

Avoid making code generation primarily a collection of large string templates where better structured generation mechanisms exist.

For TypeScript and TSX targets, consider generating a TypeScript syntax tree using:

- the TypeScript compiler API
- `ts-morph`
- another appropriate TypeScript-aware code-generation library

Conceptually:

```text
NavSpec IR
    ↓
Expo target generator
    ↓
TypeScript AST
    ↓
TypeScript printer
    ↓
.ts / .tsx files
```

Small templates are acceptable where appropriate, but output correctness and maintainability should be favored over simple string concatenation.

Different target languages may use different appropriate generation strategies.

---

## 13. Automated tests are a first-class output

Generated automated testing is a fundamental feature of NavSpec, not an optional afterthought.

Because the canonical IR explicitly describes a navigation graph, NavSpec can derive navigation tests directly from the specification.

For example:

```yaml
account:
  items:
    - email
    - privacy

security:
  items:
    - privacy
```

defines edges:

```text
account -> email
account -> privacy
security -> privacy
```

The generated test model should be framework-neutral.

For example:

```ts
{
  type: "navigate",
  from: "account",
  via: "privacy",
  expect: "privacy"
}
```

A separate target-specific test generator can translate this into an appropriate test framework.

Potential test targets include:

```text
React Native Testing Library
Maestro
Detox
Playwright
XCUITest
```

---

## 14. Generated test coverage

Do not attempt exhaustive path coverage by default.

Navigation is a graph and may contain cycles. Complete path enumeration may therefore become combinatorially large or infinite.

Initial generated test coverage should favor:

### Edge coverage

Exercise every declared navigation transition at least once.

### Node coverage

Visit every reachable node.

### Root-to-node coverage

Verify at least one valid path from the configured root to every reachable node.

### Back-navigation testing

Where applicable to a target, verify expected back-stack behavior.

### Semantic leaf testing

Tests should reflect node semantics.

Examples:

```text
page
  -> activate navigation item
  -> verify expected destination

external-link
  -> activate item
  -> verify expected external URL request

action
  -> activate item
  -> verify expected action/handler invocation

destructive action
  -> potentially verify required confirmation behavior
```

A framework-neutral test planning phase should derive these cases once.

Target-specific test generators should translate that plan into executable code.

---

## 15. Static validation

Validation should occur before target generation.

Possible validation rules include:

- all referenced node IDs exist
- node IDs are unique
- required properties for each node type exist
- external-link URLs are syntactically valid
- required action metadata exists
- root node exists
- unreachable nodes can be detected
- cycles can be detected
- localization keys or fallback labels can be resolved
- target-specific constraints may be checked by individual generators

Cycles are not inherently invalid because NavSpec describes a graph.

An unusual graph condition should not automatically be promoted to an error merely because it would be unusual in a tree.

---

## 16. Diagnostic severity

Diagnostics should distinguish at least:

```text
ERROR
WARNING
INFO
```

### Error

The specification is invalid or generation cannot safely proceed.

Example:

```text
account references undefined node "privacy-setting"
```

### Warning

The specification is valid but the structure may be unintended.

Example:

```text
node "legacy-help" is unreachable from root
```

### Info

A potentially useful structural observation.

For example, cycle reporting may often belong here:

```text
cycle detected:
get-help -> documentation -> get-help
```

Diagnostic severity should remain configurable as the project develops.

---

## 17. Diagnostics should retain source locations

The parser and semantic layers should preserve enough source-location information to associate semantic errors with the original YAML.

Diagnostics should be compiler-like.

Example:

```text
nav.yaml:18:7 error NAV001:
Unknown node "privacy-setting"

  16 | account:
  17 |   items:
> 18 |     - privacy-setting
     |       ^^^^^^^^^^^^^^^
  19 |     - password

Did you mean "privacy-settings"?
```

Source-location preservation should be considered an architectural requirement from the beginning rather than retrofitted later.

---

## 18. CLI installation and usage

NavSpec is primarily a development/build tool and should normally be installed as a development dependency:

```bash
npm install --save-dev navspec
```

A minimal project may contain:

```text
nav.yaml
```

The user can run:

```bash
npx navspec generate nav.yaml
```

or configure npm scripts:

```json
{
  "scripts": {
    "nav:generate": "navspec generate",
    "nav:validate": "navspec validate"
  }
}
```

Equivalent `npm exec` and `pnpm exec` workflows should also work.

---

## 19. CLI subcommands

Use explicit subcommands rather than making the YAML filename itself imply generation.

Expected commands should include:

```bash
navspec generate nav.yaml
navspec validate nav.yaml
navspec check
navspec graph nav.yaml
```

A future command may include:

```bash
navspec init
```

which could create starter files such as:

```text
nav.yaml
navspec.config.yaml
```

Potential future diagnostic/debugging commands may include test-plan or IR inspection commands if useful.

---

## 20. Non-interactive operation

Normal NavSpec commands should be deterministic and non-interactive.

Do not require prompts such as:

```text
Cycle found. Continue? (y/N)
```

Interactive questions make the tool difficult to use in:

- CI
- npm scripts
- IDE tasks
- Git hooks
- automated agents such as Codex
- other build tooling

Warnings should normally be printed and generation should continue if the specification remains valid.

Support stricter policy through flags such as:

```bash
navspec generate --warnings-as-errors
```

and possibly:

```bash
navspec generate --strict
```

An explicitly requested interactive mode may be considered later but should not be the normal execution model.

---

## 21. Configuration file

NavSpec should support an optional configuration file, for example:

```text
navspec.config.yaml
```

The navigation specification and tool configuration should remain separate.

Example:

```yaml
input: nav.yaml

outputs:
  expo:
    directory: src/generated/nav

  tests:
    directory: e2e/generated

  docs:
    directory: docs/generated
```

Then normal generation becomes:

```bash
navspec generate
```

Conceptually:

```text
nav.yaml
    describes application navigation semantics

navspec.config.yaml
    describes how NavSpec processes and emits that specification
```

Do not mix target-generation configuration unnecessarily into the navigation specification itself.

---

## 22. Output directory

A configurable output directory should be supported.

Default:

```text
generated/nav/
```

Override:

```bash
navspec generate --out-dir src/generated/nav
```

A possible generated structure is:

```text
generated/
  nav/
    manifest.json
    expo/
    tests/
    docs/
```

Do not assume generated files must or must not be committed to version control.

That should remain a project-level choice.

---

## 23. Generated manifest

Consider generating a manifest alongside output.

Example:

```json
{
  "navspecVersion": "1.0.0",
  "source": "nav.yaml",
  "sourceHash": "...",
  "targets": [
    "expo",
    "maestro",
    "markdown"
  ]
}
```

Avoid nondeterministic fields such as generation timestamps unless they provide sufficient value.

A source hash can support stale-output detection.

This could enable:

```bash
navspec check
```

to verify that checked-in generated files correspond to the current NavSpec source.

This is especially useful in CI.

---

## 24. Atomic generation

Generation must not leave partially updated output after failure.

Conceptually:

```text
parse
  ↓
validate
  ↓
build complete canonical IR
  ↓
generate all requested outputs in temporary location or memory
  ↓
all targets succeed?
  ├── yes -> replace generated output
  └── no  -> preserve previous generated output
```

Desired invariant:

> A successful NavSpec generation produces a self-consistent generated output tree. A failed generation leaves the previous generated tree intact.

---

## 25. Suggested package/module boundaries

Keep major architectural responsibilities separate.

A possible organization is:

```text
packages/
  core/
    AST / IR types
    normalization
    validation
    graph algorithms
    diagnostics

  yaml/
    YAML parsing
    source locations

  generator-expo/
    Expo / React Native generation

  generator-tests/
    framework-neutral test planning

  generator-maestro/
    Maestro output

  generator-docs/
    Markdown documentation

  cli/
    command-line interface
```

A monorepo is not mandatory for the initial implementation.

The important principle is separation of responsibility, not a particular repository layout.

A single package with clear internal modules may be preferable for v0.1.

---

## 26. Potential future TypeScript API

YAML should be the first authoring format, but the architecture should not make YAML synonymous with NavSpec itself.

A future typed API might allow:

```ts
defineNavigation({
  account: {
    items: ["email", "password"],
  },
});
```

Both YAML and TypeScript authoring should ultimately produce the same canonical IR.

Potential future package organization could include concepts such as:

```text
@navspec/core
@navspec/yaml
@navspec/expo
@navspec/playwright
@navspec/swiftui
```

Do not implement this package split prematurely.

---

## 27. Initial implementation scope

Keep v0.1 deliberately small.

Recommended sequence:

1. Define TypeScript types for the parsed model and canonical IR.
2. Parse flat YAML.
3. Preserve source locations.
4. Support stable kebab-case node IDs.
5. Support:
   - `menu`
   - `page`
   - `action`
   - `external-link`
6. Implement default type inference.
7. Normalize the parsed representation into canonical IR.
8. Validate references.
9. Validate node-type-specific properties.
10. Compute graph reachability.
11. Detect/report unreachable nodes.
12. Detect/report cycles.
13. Implement deterministic fallback display-name derivation.
14. Produce a readable debug representation of the canonical IR.
15. Implement framework-neutral navigation test planning.
16. Add one initial application target, likely Expo / React Native.
17. Add one appropriate test target.
18. Generate Markdown documentation from the same IR.
19. Implement the initial CLI:
    - `validate`
    - `generate`
    - `check`
    - potentially `graph`

Do not attempt to implement every planned backend or semantic node type in the first iteration.

---

## 28. Architectural principles to preserve

The following should be treated as core design constraints:

- NavSpec source uses stable IDs.
- Navigation is a graph, not necessarily a tree.
- Flat YAML is preferred over physical nesting.
- The canonical IR is framework-neutral.
- Framework-specific concepts do not belong in the core model.
- Stable IDs survive localization.
- Localization is presentation, not identity.
- Parsing and normalization are separate concerns.
- Target generators consume canonical IR rather than YAML.
- Generated automated tests are first-class outputs.
- Test semantics should be derived from the graph, not manually duplicated.
- Static validation occurs before generation.
- CLI commands are deterministic and non-interactive by default.
- Errors prevent generation; warnings need not.
- Diagnostics retain source locations.
- Generation should be atomic.
- NavSpec source is the source of truth.
- Avoid premature generalization and unnecessary semantic concepts.

---

## 29. Initial Expo Router target architecture

The initial Expo Router target maps the canonical graph into one flat route
namespace managed by a Stack. Graph edges produce navigation transitions; they
do not become nested route folders or nested navigators.

The configured root node maps to the mount index (for example, `/settings`).
Every other node maps to an absolute stable-ID route below that mount (for
example, `/settings/privacy`). Shared destinations therefore retain one route
identity, and cycles require no special route structure.

These URLs identify nodes, not traversal history. The Stack records the path a
user actually followed. Encoding that path into the URL would give shared
destinations multiple identities, require an arbitrary parent, or produce
unbounded paths for cycles. Web addresses and native deep links therefore use
the same flat canonical routes.

A cold link to a non-root node has no uniquely correct predecessor because a
graph node may have multiple incoming edges. The generated route island does
not synthesize one. An application may opt into Expo Router's `anchor` setting
to provide the mount index as a deterministic fallback back destination, but
that is presentation/navigation policy rather than graph lineage.

All validated canonical nodes are generated, including nodes reported as
unreachable. Reachability remains a core diagnostic; a target must not silently
discard valid canonical data.

The target has two ownership layers:

- one-time route adapters and an application-owned integration module created
  by explicit initialization
- repeatable generated source and a manifest replaced atomically during normal
  generation

Localization uses stable node IDs as keys. Generated English display names are
fallback presentation data supplied to an application-owned label resolver;
translated text never changes routes, filenames, action IDs, or test IDs.

Existing Expo Router applications are supported through an explicitly reserved,
conflict-free route subtree. NavSpec does not parse or rewrite arbitrary root
layouts, tab definitions, React Navigation configuration, or other handwritten
navigation logic. Automatic migration and semantic merging are outside the v0.1
scope.

The host application owns presentation at that boundary. In particular, when a
root Stack contains the NavSpec Stack, the host can hide the outer route header
with `headerShown: false` so the nested NavSpec Stack is the only visible header.
Initialization must not rewrite the root layout to impose this choice.

Application-owned React Native components may provide the content for `page`
nodes through the Expo integration module. The generated integration contract
keys those components by stable page ID and passes the active page ID as a prop.
The generated runtime continues to own the Stack title, scrolling container,
and any outgoing navigation items declared on the page. A missing registration
uses the generated fallback UI. React component names and imports remain target
integration details and must not enter YAML or canonical IR.


## Untrusted input boundaries

Configured output paths normalize separators and dot components before validation; rooted/drive-relative paths, parent traversal, and the base directory itself are rejected. Output paths must remain below their trusted base. CLI generation and checking use the configuration directory as that base. The exported materialization/checking APIs default to the working directory and accept an explicit third `baseDirectory` argument for other trusted roots. Symlinks below that base, at output destinations, and within existing generated trees are refused. System aliases in a trusted base's own ancestry are allowed. Initialization preflights route, integration, and generated locations before writing and creates new scaffold files exclusively. These checks assume the filesystem is not concurrently mutated by a hostile process; manifest ownership remains a deletion guard, not authentication.

Target route prefixes are validated at the public planner/generator boundary as well as during configuration parsing. Emitted route code uses a JSON-quoted constant rather than placing user text directly inside executable template syntax. Component registries require own-property lookups, so valid IDs such as `constructor` cannot select inherited functions.

Cycle discovery uses iterative DFS and preserves deterministic traversal and canonical cycle reporting without consuming the JavaScript call stack. This does not impose a general input-size or resource budget: callers offering compilation of untrusted inputs as a service must separately bound resources and source/config filesystem access. Human-readable diagnostics escape terminal controls and bidi overrides per field; source pointers account for the escaped widths. JSON CLI output escapes such characters without changing parsed values. Unexpected CLI failures return a controlled error rather than an uncaught stack trace.
