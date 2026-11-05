# NavSpec

NavSpec is a small compiler for declarative application navigation. It parses a flat YAML graph into a validated, normalized, framework-neutral intermediate representation (IR).

This repository contains the stable compiler core and an initial Expo Router application and navigation-test target. Other framework-specific application and test generators are yet to be added.

## Project documentation

- [`docs/design.md`](docs/design.md) contains the durable architecture and design constraints.
- [`docs/expo-router-generator-todo.md`](docs/expo-router-generator-todo.md) is the ordered implementation backlog for the Expo Router target.

## Requirements

- Node.js 20 or newer

## Install and develop

```bash
npm install
npm test
npm run check
```

`npm test` builds the package before running the unit and integration tests.

To use the working copy from a sibling project, build it and install the local
directory as a development dependency:

```bash
# In navspec
npm run build

# In the consuming project
npm install --save-dev ../navspec
npx navspec init --target expo-router
```

For ongoing linked development, `npm link` is also supported. Run `npm link`
in this repository, then `npm link navspec` in the consuming project. Both
local installation methods execute the compiled `dist` files, so rebuild
NavSpec after changing its TypeScript source.

## Navigation source

Create `nav.yaml`:

```yaml
root:
  items:
    - account
    - documentation

account:
  items:
    - email
    - save

email:

save:
  type: action

documentation:
  type: external-link
  url: https://example.com/docs
```

Every top-level key is a stable kebab-case node ID. References in `items` use those IDs. Nodes form a directed graph, so multiple nodes may reference the same destination and cycles are allowed.

Supported node types are:

- `menu`
- `page`
- `action`
- `external-link`

When `type` is omitted, a node with an `items` property becomes a `menu`; any other node becomes a `page`. An `external-link` requires an HTTP or HTTPS `url`. Node type and child edges are independent, so explicitly typed nodes may also contain `items`.

Display names are derived deterministically from IDs. For example, `privacy-and-security` becomes `Privacy And Security`. Display names do not define node identity.

## Configuration

Configuration is optional and separate from navigation semantics. Create `navspec.config.yaml` when the defaults are not suitable:

```yaml
input: config/navigation.yaml
root: settings-home

outputs:
  expo-router:
    generatedDirectory: src/generated/navspec/expo
    publicPath: /settings
```

`input` and configured output paths are resolved relative to the configuration file. Without configuration, the input defaults to `nav.yaml` and the root ID defaults to `root`.

Expo Router output defaults to `src/generated/navspec/expo` and the public
mount `/navspec`. The one-time initializer derives the corresponding route
directory from the active `src/app` or `app` root. Set `routesDirectory` only
when it exactly matches that public mount.

## Input and output safety

Output directories must stay below the configuration directory. NavSpec normalizes separators and dot components, rejects parent traversal and rooted/drive-relative paths, and refuses symlinks below the output base or in generated output. Initialization also refuses symlinked scaffold locations. Review configuration and existing ownership manifests before generating; these guards assume a stable filesystem and do not sandbox a hostile process modifying it concurrently.

Generated output must not overlap the route scaffold directory or the application-owned integration file. For example, `generatedDirectory: src/navspec` is invalid when initialization would create `src/navspec/integration.ts`.

Before planning initialization, NavSpec resolves the existing project and configuration directories with `realpath`, following symlinks in these trusted bases and their ancestry. This makes aliases such as macOS `/var/...` and `/private/var/...` use the same base when checking overlap and constructing relative imports. Generated folders need not exist yet: their validated relative paths are appended after resolving the bases. Configured relative spelling is preserved, and symlinks below the trusted bases are still rejected. The initialization API requires both trusted base directories to exist; the configuration base defaults to the project directory. Inspection and initialization return paths under the resolved project base. Resolving bases does not attempt to identify every filesystem alias, such as bind mounts.

Existing route scaffolds with older alias-based import paths are preserved. Re-running initialization can report a scaffold conflict if those imports differ from the newly planned text; review the application-owned imports before retrying. NavSpec does not automatically rewrite them.

Collision checks use the same portability rule on every platform: after path normalization, complete path components are compared ignoring ASCII letter case. Equal paths and ancestor/descendant overlaps are rejected even on a case-sensitive filesystem. Thus `src/app/SETTINGS` conflicts with `src/app/settings`, but `src/app/settings-old` does not. Mixed-case paths such as `src/Generated/navspec` remain allowed when they do not collide; their spelling is preserved for file writes. This is a fixed collision policy, not a probe of the local disk, so a team gets the same case-collision checks on Linux and macOS. Non-ASCII characters are compared exactly; this rule does not model Unicode case folding or normalization aliases. Use ASCII path components for portable naming. The collision comparison is never used to authorize containment; the trusted-base and symlink guards remain separate.

For TypeScript callers, `materializeGeneratedArtifacts(directory, artifacts, baseDirectory)` and `generatedArtifactsAreCurrent(directory, artifacts, baseDirectory)` default their trusted base to the current working directory. Supply an explicit trusted base when using another directory, such as a temporary project. The destination must be below that base. The base itself and its ancestry are trusted.

Source/config selection can read caller-specified filesystem paths. Compilation has no general CPU/memory budget; applications accepting remote inputs should isolate and limit execution. CLI diagnostics escape terminal control characters, and JSON output preserves their values through Unicode escapes.

## CLI

Build the package then run:

```bash
node dist/cli.js validate
node dist/cli.js inspect
node dist/cli.js test-plan
node dist/cli.js init --target expo-router
node dist/cli.js generate --target expo-router
node dist/cli.js check --target expo-router
```

An explicit source, config, or root may be supplied:

```bash
node dist/cli.js validate path/to/nav.yaml
node dist/cli.js validate --config path/to/navspec.config.yaml
node dist/cli.js validate path/to/nav.yaml --root settings-home
node dist/cli.js validate --warnings-as-errors
```

Commands are deterministic and non-interactive:

- `validate` prints diagnostics and a short success summary.
- `inspect` prints the canonical IR as JSON.
- `test-plan` prints generic edge and root-path test intent as JSON.
- `init` adds stable route adapters and an application-owned integration file to a compatible Expo Router project.
- `generate` atomically replaces manifest-owned target output.
- `check` verifies generated output without changing files.

Errors return exit status 1. Warnings normally allow success; `--warnings-as-errors` makes them fail validation. Invalid CLI usage returns status 2.

## Expo Router target

Start with an Expo Router TypeScript project. NavSpec composes with
`create-expo-app`; it does not scaffold or migrate the entire Expo application.
The project must declare `expo` and `expo-router`, use `expo-router/entry`
directly or from a custom entry file, and configure the `expo-router` plugin
before initialization.

Run initialization once, then generate whenever `nav.yaml` changes:

```bash
npx navspec init --target expo-router
npx navspec generate --target expo-router
```

For the `/settings` example, initialization creates a route island like:

```text
src/app/settings/
  _layout.tsx
  index.tsx
  [node-id].tsx

src/navspec/integration.ts
```

Generation writes only the configured generated directory. NavSpec will not
overwrite application-owned route files or rewrite the root layout, tabs, or
custom navigation. Link or push to `/settings` from application-owned UI.

The target uses one Stack and absolute stable-ID routes. Shared destinations
and cycles therefore remain graph relationships rather than being duplicated
as folder trees.

### Route identity and Stack history

Routes identify nodes rather than the path used to reach them. With a `/navspec`
mount, representative routes are `/navspec/account` and `/navspec/email`, not
`/navspec/account/email`. A node can have multiple incoming edges, and cycles
are valid, so encoding traversal into a canonical URL would duplicate node
identity or require an arbitrary parent. The active Stack retains the actual
navigation history instead.

Expo Router URLs also serve as native deep links, so stable flat routes are
useful outside the web. See Expo's documentation for
[universal route URLs](https://docs.expo.dev/router/basics/core-concepts/).

A browser reload or direct deep link to `/navspec/email` starts without a prior
NavSpec screen, so there is no organic back destination. Applications that want
the mount index to be a deterministic fallback can add an Expo Router anchor to
the one-time NavSpec route layout:

```ts
export const unstable_settings = {
  anchor: "index",
};
```

This supplies a back route to the NavSpec root; it does not reconstruct one
particular graph traversal. See Expo's
[anchor documentation](https://docs.expo.dev/router/advanced/router-settings/).

### Host Stack presentation

If the host root layout and the NavSpec route island both render Stack headers,
the application can hide the outer header for the mount while preserving the
generated node title and back button. For the default `/navspec` mount:

```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="navspec" options={{ headerShown: false }} />
    </Stack>
  );
}
```

The root layout is application-owned, so NavSpec documents this integration but
does not rewrite it. Expo documents per-screen header configuration in
[navigation layouts](https://docs.expo.dev/router/basics/navigation-layouts/).

### Localization and actions

The initializer creates `src/navspec/integration.ts` once and never overwrites
it. Its default label and message resolvers return generated English fallbacks.
Connect an application's localization system there while continuing to use the
stable node ID as the translation key:

```ts
export const navSpecIntegration: NavSpecIntegration = {
  label: (id, fallback) => i18n.t(id, { defaultValue: fallback }),
  message: (id, fallback) =>
    i18n.t(`navspec.${id}`, { defaultValue: fallback }),
  invokeAction: async (id) => {
    await actionHandlers[id]();
  },
};
```

An equivalent FormatJS adapter can call
`intl.formatMessage({ id, defaultMessage: fallback })`. Translation changes
affect presentation only; IDs, routes, filenames, action keys, and test IDs
remain stable.

Action nodes require an application handler. The default scaffold throws a
clear error rather than silently ignoring an action.

### Custom page content

Register application-owned React Native components in the integration module
to populate `page` nodes. Component keys are checked against the generated page
IDs, and the components are never overwritten during generation.

A node with `items` normally infers the `menu` type. Give it an explicit
`page` type when it needs both custom content and outgoing navigation:

```yaml
account:
  type: page
  items:
    - email
```

```tsx
// src/navspec/pages/account-page.tsx
import { Text, View } from "react-native";

export default function AccountPage() {
  return (
    <View>
      <Text>Your custom account content</Text>
    </View>
  );
}
```

```ts
// src/navspec/integration.ts
import { defineNavSpecPageComponents } from "../generated/navspec/expo";
import type { NavSpecIntegration } from "../generated/navspec/expo";
import AccountPage from "./pages/account-page";

export const navSpecIntegration: NavSpecIntegration = {
  label: (_id, fallback) => fallback,
  message: (_id, fallback) => fallback,
  pageComponents: defineNavSpecPageComponents({
    account: AccountPage,
  }),
  invokeAction: async (id) => {
    await actionHandlers[id]();
  },
};
```

The generated runtime retains the Stack title and renders any outgoing items
declared for the page below the custom content. Without a registered component,
the page uses the generated fallback UI. Components can live anywhere outside
the Expo Router route directory; `src/navspec/pages` is only a convention.

Use `defineNavSpecPageComponents` for empty registries too. The helper checks the supplied page IDs and component types, then copies own registrations into a registry without a prototype. A valid page ID such as `constructor` therefore uses fallback content unless explicitly registered with a React component. When updating an existing integration that uses a plain registry object, wrap it with this helper; regeneration does not overwrite the application-owned integration module.

### Existing navigation boundary

v0.1 mounts into a conflict-free Expo Router subtree. It does not automatically
migrate plain React Navigation, parse arbitrary TSX, add tab triggers, or merge
handwritten navigation into canonical IR. The host application decides whether
the NavSpec entry route is shown as a tab, linked from a screen, or pushed by an
action.

To remove the integration, delete the configured generated directory, the
NavSpec route subtree, and the application-owned integration file. Review any
application links to the public mount before removing those files; NavSpec does
not delete host-project integration automatically.

### Validated project matrix

The Expo target is currently validated against the official
`create-expo-app` default TypeScript template on Expo SDK 57 after running its
`reset-project` workflow to remove the example NativeTabs application. The
separate UI validation performs strict TypeScript checking, starts Expo web,
and verifies `Root -> Account -> Email -> back to Account` in the generated
Stack. The unreset default template, tabs, blank, blank-typescript,
bare-minimum, and older SDK matrices remain tracked in the implementation TODO
and are not yet formal compatibility claims.

Install Playwright's Chromium build once, then run the networked validation:

```bash
npx playwright install chromium
npm run test:expo-ui
```

The command creates a new temporary SDK 57 project and deletes it after stopping
Metro. To stop Metro but retain the complete fixture for inspection:

```bash
npm run test:expo-ui -- --no-clean
```

This validation is intentionally separate from `npm test`, which remains the
fast, offline-friendly unit and integration suite.

## Diagnostics

NavSpec reports source-aware diagnostics with three severities:

- Errors prevent a canonical IR from being returned.
- Warnings identify valid but suspicious input, such as unreachable or duplicate edges.
- Informational diagnostics describe valid structure, such as cycles.

Unknown references include a spelling suggestion when a sufficiently close node ID exists.

## Library API

```ts
import { compileNavigation, planNavigationTests } from "navspec";

const result = compileNavigation(source, {
  sourcePath: "nav.yaml",
  root: "root",
});

if (result.ir) {
  const testPlan = planNavigationTests(result.ir);
}
```

The parsed AST preserves what the author wrote and retains source spans. The canonical IR contains explicit node types, item arrays, display names, and stable IDs. Generic test planning consumes canonical IR rather than YAML.

## License

NavSpec, including its documentation and generated template/runtime, scaffold, and test code, is licensed under [MIT No Attribution (MIT-0)](LICENSE). You may use, modify, and distribute it without including NavSpec's copyright or license text in your projects or generated output. No NavSpec notice is inserted into generated files. Third-party dependencies retain their own licenses and any applicable notice requirements.
