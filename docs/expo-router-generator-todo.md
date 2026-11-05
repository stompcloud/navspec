# Expo Router Target Generator TODO

This is the ordered implementation backlog for NavSpec's first application
target. Agents working on the Expo Router target should read
[`design.md`](design.md) and the root [`AGENTS.md`](../AGENTS.md) before using
this list.

Update this file as work lands:

- Check an item only after its implementation and relevant tests pass.
- Add newly discovered work to the phase where it belongs.
- Record durable architectural rules in `design.md`; keep this file focused on
  actionable work and acceptance criteria.
- Do not broaden the v0.1 scope merely to complete a checkbox.

## v0.1 outcome

Generate a deterministic, localization-friendly Expo Router navigation stack
from canonical `NavigationIR`, and safely mount it in new or compatible
existing Expo Router projects without overwriting application-owned code.

The initial supported integration modes are:

- A new Expo project created with a Router-enabled template.
- A new TypeScript Expo project to which Expo Router is added during explicit
  initialization.
- An existing Expo Router project with a conflict-free, explicitly configured
  route mount.

Automatic migration or semantic merging of arbitrary React Navigation or
custom navigation code is deferred.

## Fixed design decisions

- [x] Add an architecture note to `design.md` capturing the decisions below as
      durable constraints before implementation begins.
- Use a single Stack for NavSpec navigation. Do not infer tabs, drawers, or a
  nested navigator per menu from the current IR.
- Map the graph into a flat, absolute route namespace. Navigation history is a
  stack; graph edges are not filesystem nesting.
- Map the configured root node to the mount index, such as `/settings`, and
  other nodes to stable ID paths, such as `/settings/privacy`.
- Use stable node IDs as localization keys and route identities.
- Keep Expo-specific configuration and types out of canonical IR.
- Keep repeated generation separate from one-time host-project integration.
- Never overwrite an unowned route or source file.
- Compose with existing Expo Router navigation at a reserved route boundary;
  do not parse arbitrary TSX in an attempt to merge navigation semantics.

## Phase 1: Target and configuration contracts

- [x] Define a framework-neutral generated-artifact contract containing a
      normalized relative path, contents, and artifact ownership metadata.
- [x] Define an Expo Router target result containing artifacts and
      target-specific diagnostics.
- [x] Add Expo Router output configuration under `outputs.expo-router` in
      `navspec.config.yaml` parsing.
- [x] Support configuration for:
  - generated source directory
  - route integration directory
  - public mount path
- [x] Normalize output paths before checking containment; reject rooted and drive-relative forms.
- [x] Apply a platform-independent ASCII case-insensitive collision rule to normalized output paths, with exact path components and preserved write spelling.
- [x] Reject absolute paths, parent traversal, empty mount paths, and ambiguous
      configurations with deterministic diagnostics.
- [x] Preserve the current `input` and `root` defaults and backwards
      compatibility for existing configuration files.
- [x] Export the new public types and generator entry points from `src/index.ts`.
- [x] Add unit tests for valid configuration, defaults, unknown properties, and
      invalid paths.

## Phase 2: Expo route planning

- [x] Implement a pure route planner that consumes `NavigationIR` and Expo
      target options without reading YAML or the filesystem.
- [x] Map the root ID to the mount index route.
- [x] Map every other reachable node ID to an absolute route below the mount.
- [x] Decide and document whether unreachable nodes are generated. Prefer
      matching the core warning semantics rather than silently discarding data.
- [x] Generate links from stable IDs rather than display labels.
- [x] Validate IDs against Expo Router special filenames and segments.
- [x] Ensure shared destinations generate one route identity.
- [x] Ensure cycles do not cause recursive generation or path enumeration.
- [x] Keep route and artifact ordering deterministic.
- [x] Validate public API route prefixes and keep user text out of executable template syntax.
- [x] Add route-planner tests for root-only graphs, shared destinations, cycles,
      unreachable nodes, and escaped content.

## Phase 3: Pure code generator

- [x] Implement `generateExpoRouter(ir, options)` as a pure function returning
      artifacts in memory.
- [x] Generate a typed node model from canonical IR.
- [x] Generate absolute route helpers for root and non-root nodes.
- [x] Generate the Expo runtime and public barrel exports.
- [x] Generate a deterministic English fallback message catalog keyed by node
      ID.
- [x] Generate a manifest containing the NavSpec version, source hash, target,
      public mount, and owned artifact paths. Do not include timestamps.
- [x] Keep the manifest's owned artifact paths alphabetically ordered.
- [x] Use small structured renderers and explicit escaping helpers; do not build
      the target from one large interpolated template.
- [x] Parse or type-check generated TypeScript/TSX in tests so invalid emitted
      syntax cannot pass snapshot assertions alone.
- [x] Add determinism tests for complete artifact sets.
- [ ] Add reviewed golden-file fixtures for representative generated projects.
- [ ] Type-check complete generated projects whose graphs omit page or external-link nodes; handle runtime literal-type narrowing and navigation-test `expectedUrl` access for absent node kinds.

## Phase 4: Generated runtime behavior

- [x] Generate stable route adapters for:
  - the mount index, which renders the configured root
  - a dynamic node route, which validates and renders a node ID
  - a Stack layout for the NavSpec route island
- [x] Render menu transitions with absolute Expo Router links or pushes.
- [x] Flatten styles on `Link asChild` children for Expo Router SDK 57 Slot
      compatibility.
- [x] Render `page` nodes without assuming that pages cannot also have outgoing
      items.
- [x] Open `external-link` nodes through the appropriate React Native linking
      API.
- [x] Dispatch `action` nodes through an application-owned action registry.
- [x] Produce a clear development error and test failure when an action has no
      handler; do not silently no-op.
- [x] Handle an unknown route parameter deterministically.
- [x] Set Stack titles from resolved presentation labels.
- [x] Add stable accessibility labels and `testID` values derived from node and
      edge IDs.
- [x] Keep the default UI small, usable, theme-aware, and replaceable without
      adding styling concepts to core IR.
- [x] Use own-property component lookups and test the unregistered constructor page fallback.
- [x] Keep explicit page registrations component-only with a typed own-key registry helper and positive/negative generated-project type checks.
- [x] Allow application-owned React Native components to populate `page` nodes
      through a stable-ID component registry while preserving Stack titles,
      outgoing items, and the generated fallback UI.

## Phase 5: Localization integration

- [x] Define a generated integration type with a label resolver resembling
      `label(id, fallback)` and an action dispatcher.
- [x] Create an application-owned integration scaffold during initialization;
      never overwrite it during generation.
- [x] Make the initial label resolver return the deterministic English fallback.
- [x] Ensure every visible label, Stack title, accessibility label, and generated
      test expectation goes through the resolver rather than embedding English
      at the use site.
- [x] Allow the integration component to react to locale changes through normal
      React context/rendering without regenerating routes.
- [x] Document adapters for i18next and FormatJS as examples, without making
      either library a NavSpec dependency.
- [x] Verify that translated labels never affect node IDs, URLs, filenames,
      action IDs, or test IDs.
- [x] Add tests that change the resolver output while keeping navigation and
      identity stable.

## Phase 6: Project inspection and initialization

- [x] Add `navspec init --target expo-router` as an explicit, deterministic
      one-time integration command.
- [x] Inspect the host `package.json` and app configuration before proposing or
      making changes.
- [x] Detect the installed Expo SDK and Expo Router versions rather than
      generating against an assumed latest version.
- [x] Detect whether `src/app` or `app` is the active route root.
- [x] Detect Expo Router entry-point and config-plugin setup.
- [x] Detect TypeScript support and avoid requiring path aliases or the
      default template structure.
- [x] Create only missing route adapters and the application-owned integration
      scaffold.
- [x] Refuse to initialize into nonempty, unowned route directories.
- [x] Keep dependency installation outside normal generation.
- Dependency installation is not offered in v0.1. If added later, require an
  explicit flag and use SDK-compatible `expo install` rather than a raw
  package-manager add.
- [x] For dynamic `app.config.js` or `app.config.ts`, report required changes
      instead of rewriting arbitrary executable configuration in v0.1.
- [x] Make repeated initialization idempotent when existing files match the
      NavSpec scaffold or ownership manifest.

## Phase 7: Existing navigation and conflict detection

- [x] Scan relevant existing Expo Router filenames into normalized public route
      patterns for the configured static mount.
- [x] Detect direct filesystem conflicts in the configured integration subtree.
- [x] Detect duplicate public paths such as `settings.tsx` versus
      `settings/index.tsx`.
- [x] Define and test how dynamic and catch-all routes affect the reserved mount.
- [x] Distinguish NavSpec-owned output from application-owned files using the
      generated manifest.
- [x] Fail on conflicts with actionable diagnostics that name the path and
      suggested remedies.
- [x] Never choose a new public path or append a numeric suffix automatically.
- [x] Do not rewrite an existing root `_layout.tsx` or tab configuration.
- [x] Print the generated entry route and the minimal host integration required
      to link or push to it.
- [x] Detect projects using plain React Navigation or unknown custom navigation
      and stop with an explanation of the v0.1 boundary.

## Phase 8: Atomic generation and CLI integration

- [x] Resolve npm executable symlinks when detecting direct CLI invocation so
      local installs and `npm link` execute normally.
- [x] Add `navspec generate --target expo-router`.
- [x] Add `navspec check --target expo-router` to compare current input and
      configuration with the generated manifest and files.
- [x] Build all requested artifacts and diagnostics before writing any output.
- [x] Stage output on the same filesystem as the destination.
- [x] Atomically replace the generated directory only after every target
      succeeds.
- [x] Preserve the previous generated tree after parse, validation, generation,
      formatting, type-check, or write failure.
- [x] Remove stale files only when the previous manifest proves NavSpec owns
      them.
- [x] Keep output, diagnostics, exit codes, and manifest hashes deterministic.
- [x] Reject symlinked output/scaffold paths and preflight initialization before writes.
- [x] Reject generated output overlapping the integration scaffold before initialization writes; cover init-first and generate-first workflows.
- [x] Share diagnostic and JSON control escaping, including every Unicode bidi control, while preserving JSON values.
- [x] Add CLI integration tests for success, warnings-as-errors, conflicts,
      check mode, stale output, and rollback after failure.

## Phase 9: Generated navigation tests

- [x] Translate `NavigationTestPlan` into target-specific Expo/React Native
      tests rather than re-deriving graph semantics in the target.
- [x] Cover every planned internal navigation edge.
- [x] Cover at least one root-to-node path for every reachable node.
- [x] Verify external URL requests.
- [x] Verify action-handler invocation.
- [ ] Verify Stack back behavior where the target harness can do so reliably.
- [x] Use generated stable test IDs, not translated text, as primary selectors.
- [x] Keep test generation a distinct target module even if it ships in the same
      release as the application generator.

## Phase 10: Template and runtime validation

- [ ] Maintain minimal fixture projects for the supported integration matrix.
- [x] Validate a fresh `create-expo-app` default template after its
      `reset-project` workflow produces a root Stack.
- [ ] Validate a fresh tabs template and document that the application owns the
      decision to expose NavSpec as a tab or a pushed screen.
- [ ] Validate a fresh `blank-typescript` project after Router initialization.
- [ ] Evaluate the plain JavaScript `blank` template only after deterministic
      TypeScript bootstrapping is covered by tests.
- [ ] Evaluate `bare-minimum` separately; do not claim support until native
      project behavior is verified.
- [x] Validate an existing Stack application with a free mount.
- [ ] Validate route, file-ownership, and custom-layout conflict fixtures.
- [x] Run TypeScript checking and Expo/Metro web bundling for generated fixtures.
- [x] Automate a browser-level reset-project Stack fixture that follows a menu
      edge and asserts the destination URL and visible child nodes.
- [x] Use the official `expo-overview`, `expo-project-structure`, and
      `expo-router` skills while implementing fixture-specific behavior.
- [x] Use the repository's Expo dev-server validation workflow after dependency
      or generated-runtime changes.

## Documentation and release readiness

- [x] Document the supported Expo SDK and template matrix based on tested
      fixtures, not assumptions.
- [x] Document scratch setup as composition with `create-expo-app`, not as a
      NavSpec-owned Expo scaffolder.
- [x] Document initialization, generation, checking, regeneration, and removal.
- [x] Document the generated/application-owned file boundary.
- [x] Document localization and action integration examples.
- [x] Document how to link to the NavSpec mount from an existing stack or tab.
- [x] Document flat graph route identity, optional cold-link anchors, and
      application-owned `headerShown: false` integration.
- [x] Document unsupported existing-navigation cases and manual alternatives.
- [x] Update the root README when the Expo target is usable.
- [x] Document the portable collision rule and registry helper in README and the durable design constraints.

## Deferred beyond v0.1

- Automatic migration from plain React Navigation to Expo Router.
- Parsing arbitrary TSX to append screens or tab triggers.
- Importing existing application routes into canonical NavSpec IR.
- Bidirectional or lossless generated-code round-tripping.
- Inferring tabs, drawers, modals, or presentation styles from `menu` and `page`.
- Dynamic route parameters described by NavSpec semantics.
- Locale-specific URLs or localized node identity.
- Formal `bare-minimum` support until native-project fixtures pass.
- A NavSpec wrapper around the entire `create-expo-app` scaffolding lifecycle.

## Definition of done for v0.1

- [x] A validated `nav.yaml` generates deterministic Expo Router output solely
      from canonical IR.
- [x] Shared destinations and cycles work without duplicating node identity.
- [x] New and currently supported template projects compile and start with the generated
      route island.
- [x] A compatible existing Expo Router project can mount the route island
      without NavSpec modifying application-owned navigation files.
- [x] Conflicting or unsupported projects fail before any partial output is
      written.
- [x] Labels can be supplied by an application localization system while stable
      IDs and routes remain unchanged.
- [x] Action and external-link behavior is explicit and tested.
- [x] Generated navigation tests consume the framework-neutral test plan.
- [x] `npm test` and `npm run check` pass.
