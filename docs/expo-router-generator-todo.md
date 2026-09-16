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

- [ ] Add an architecture note to `design.md` capturing the decisions below as
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

- [ ] Define a framework-neutral generated-artifact contract containing a
      normalized relative path, contents, and artifact ownership metadata.
- [ ] Define an Expo Router target result containing artifacts and
      target-specific diagnostics.
- [ ] Add Expo Router output configuration under `outputs.expo-router` in
      `navspec.config.yaml` parsing.
- [ ] Support configuration for:
  - generated source directory
  - route integration directory
  - public mount path
- [ ] Reject absolute paths, parent traversal, empty mount paths, and ambiguous
      configurations with deterministic diagnostics.
- [ ] Preserve the current `input` and `root` defaults and backwards
      compatibility for existing configuration files.
- [ ] Export the new public types and generator entry points from `src/index.ts`.
- [ ] Add unit tests for valid configuration, defaults, unknown properties, and
      invalid paths.

## Phase 2: Expo route planning

- [ ] Implement a pure route planner that consumes `NavigationIR` and Expo
      target options without reading YAML or the filesystem.
- [ ] Map the root ID to the mount index route.
- [ ] Map every other reachable node ID to an absolute route below the mount.
- [ ] Decide and document whether unreachable nodes are generated. Prefer
      matching the core warning semantics rather than silently discarding data.
- [ ] Generate links from stable IDs rather than display labels.
- [ ] Validate IDs against Expo Router special filenames and segments.
- [ ] Ensure shared destinations generate one route identity.
- [ ] Ensure cycles do not cause recursive generation or path enumeration.
- [ ] Keep route and artifact ordering deterministic.
- [ ] Add route-planner tests for root-only graphs, shared destinations, cycles,
      unreachable nodes, and escaped content.

## Phase 3: Pure code generator

- [ ] Implement `generateExpoRouter(ir, options)` as a pure function returning
      artifacts in memory.
- [ ] Generate a typed node model from canonical IR.
- [ ] Generate absolute route helpers for root and non-root nodes.
- [ ] Generate the Expo runtime and public barrel exports.
- [ ] Generate a deterministic English fallback message catalog keyed by node
      ID.
- [ ] Generate a manifest containing the NavSpec version, source hash, target,
      public mount, and owned artifact paths. Do not include timestamps.
- [ ] Use small structured renderers and explicit escaping helpers; do not build
      the target from one large interpolated template.
- [ ] Parse or type-check generated TypeScript/TSX in tests so invalid emitted
      syntax cannot pass snapshot assertions alone.
- [ ] Add golden-file tests and determinism tests.

## Phase 4: Generated runtime behavior

- [ ] Generate stable route adapters for:
  - the mount index, which renders the configured root
  - a dynamic node route, which validates and renders a node ID
  - a Stack layout for the NavSpec route island
- [ ] Render menu transitions with absolute Expo Router links or pushes.
- [ ] Render `page` nodes without assuming that pages cannot also have outgoing
      items.
- [ ] Open `external-link` nodes through the appropriate React Native linking
      API.
- [ ] Dispatch `action` nodes through an application-owned action registry.
- [ ] Produce a clear development error and test failure when an action has no
      handler; do not silently no-op.
- [ ] Handle an unknown route parameter deterministically.
- [ ] Set Stack titles from resolved presentation labels.
- [ ] Add stable accessibility labels and `testID` values derived from node and
      edge IDs.
- [ ] Keep the default UI small, usable, theme-aware, and replaceable without
      adding styling concepts to core IR.

## Phase 5: Localization integration

- [ ] Define a generated integration type with a label resolver resembling
      `label(id, fallback)` and an action dispatcher.
- [ ] Create an application-owned integration scaffold during initialization;
      never overwrite it during generation.
- [ ] Make the initial label resolver return the deterministic English fallback.
- [ ] Ensure every visible label, Stack title, accessibility label, and generated
      test expectation goes through the resolver rather than embedding English
      at the use site.
- [ ] Allow the integration component to react to locale changes through normal
      React context/rendering without regenerating routes.
- [ ] Document adapters for i18next and FormatJS as examples, without making
      either library a NavSpec dependency.
- [ ] Verify that translated labels never affect node IDs, URLs, filenames,
      action IDs, or test IDs.
- [ ] Add tests that change the resolver output while keeping navigation and
      identity stable.

## Phase 6: Project inspection and initialization

- [ ] Add `navspec init --target expo-router` as an explicit, deterministic
      one-time integration command.
- [ ] Inspect the host `package.json` and app configuration before proposing or
      making changes.
- [ ] Detect the installed Expo SDK and Expo Router versions rather than
      generating against an assumed latest version.
- [ ] Detect whether `src/app` or `app` is the active route root.
- [ ] Detect Expo Router entry-point and config-plugin setup.
- [ ] Detect TypeScript support and required path aliases without assuming the
      default template structure.
- [ ] Create only missing route adapters and the application-owned integration
      scaffold.
- [ ] Refuse to initialize into nonempty, unowned route directories.
- [ ] Keep dependency installation outside normal generation.
- [ ] If dependency installation is offered, require an explicit flag and use
      SDK-compatible `expo install` rather than a raw package-manager add.
- [ ] For dynamic `app.config.js` or `app.config.ts`, report required changes
      instead of rewriting arbitrary executable configuration in v0.1.
- [ ] Make repeated initialization idempotent when existing files match the
      NavSpec scaffold or ownership manifest.

## Phase 7: Existing navigation and conflict detection

- [ ] Scan existing Expo Router filenames into normalized public route patterns.
- [ ] Detect direct filesystem conflicts in the configured integration subtree.
- [ ] Detect duplicate public paths such as `settings.tsx` versus
      `settings/index.tsx`.
- [ ] Define and test how dynamic and catch-all routes affect the reserved mount.
- [ ] Distinguish NavSpec-owned output from application-owned files using the
      generated manifest.
- [ ] Fail on conflicts with actionable diagnostics that name the path and
      suggested remedies.
- [ ] Never choose a new public path or append a numeric suffix automatically.
- [ ] Do not rewrite an existing root `_layout.tsx` or tab configuration.
- [ ] Print the generated entry route and the minimal host integration required
      to link or push to it.
- [ ] Detect projects using plain React Navigation or unknown custom navigation
      and stop with an explanation of the v0.1 boundary.

## Phase 8: Atomic generation and CLI integration

- [ ] Add `navspec generate --target expo-router`.
- [ ] Add `navspec check --target expo-router` to compare current input and
      configuration with the generated manifest and files.
- [ ] Build all requested artifacts and diagnostics before writing any output.
- [ ] Stage output on the same filesystem as the destination.
- [ ] Atomically replace the generated directory only after every target
      succeeds.
- [ ] Preserve the previous generated tree after parse, validation, generation,
      formatting, type-check, or write failure.
- [ ] Remove stale files only when the previous manifest proves NavSpec owns
      them.
- [ ] Keep output, diagnostics, exit codes, and manifest hashes deterministic.
- [ ] Add CLI integration tests for success, warnings-as-errors, conflicts,
      check mode, stale output, and rollback after failure.

## Phase 9: Generated navigation tests

- [ ] Translate `NavigationTestPlan` into target-specific Expo/React Native
      tests rather than re-deriving graph semantics in the target.
- [ ] Cover every planned internal navigation edge.
- [ ] Cover at least one root-to-node path for every reachable node.
- [ ] Verify external URL requests.
- [ ] Verify action-handler invocation.
- [ ] Verify Stack back behavior where the target harness can do so reliably.
- [ ] Use generated stable test IDs, not translated text, as primary selectors.
- [ ] Keep test generation a distinct target module even if it ships in the same
      release as the application generator.

## Phase 10: Template and runtime validation

- [ ] Maintain minimal fixture projects for the supported integration matrix.
- [ ] Validate a fresh `create-expo-app` default template.
- [ ] Validate a fresh tabs template and document that the application owns the
      decision to expose NavSpec as a tab or a pushed screen.
- [ ] Validate a fresh `blank-typescript` project after Router initialization.
- [ ] Evaluate the plain JavaScript `blank` template only after deterministic
      TypeScript bootstrapping is covered by tests.
- [ ] Evaluate `bare-minimum` separately; do not claim support until native
      project behavior is verified.
- [ ] Validate an existing Stack application with a free mount.
- [ ] Validate route, file-ownership, and custom-layout conflict fixtures.
- [ ] Run TypeScript checking and Expo/Metro web bundling for generated fixtures.
- [ ] Use the official `expo-overview`, `expo-project-structure`, and
      `expo-router` skills while implementing fixture-specific behavior.
- [ ] Use the repository's Expo dev-server validation workflow after dependency
      or generated-runtime changes.

## Documentation and release readiness

- [ ] Document the supported Expo SDK and template matrix based on tested
      fixtures, not assumptions.
- [ ] Document scratch setup as composition with `create-expo-app`, not as a
      NavSpec-owned Expo scaffolder.
- [ ] Document initialization, generation, checking, regeneration, and removal.
- [ ] Document the generated/application-owned file boundary.
- [ ] Document localization and action integration examples.
- [ ] Document how to link to the NavSpec mount from an existing stack or tab.
- [ ] Document unsupported existing-navigation cases and manual alternatives.
- [ ] Update the root README when the Expo target is usable.

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

- [ ] A validated `nav.yaml` generates deterministic Expo Router output solely
      from canonical IR.
- [ ] Shared destinations and cycles work without duplicating node identity.
- [ ] New and supported template projects compile and start with the generated
      route island.
- [ ] A compatible existing Expo Router project can mount the route island
      without NavSpec modifying application-owned navigation files.
- [ ] Conflicting or unsupported projects fail before any partial output is
      written.
- [ ] Labels can be supplied by an application localization system while stable
      IDs and routes remain unchanged.
- [ ] Action and external-link behavior is explicit and tested.
- [ ] Generated navigation tests consume the framework-neutral test plan.
- [ ] `npm test` and `npm run check` pass.
