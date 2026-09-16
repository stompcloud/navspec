# NavSpec

NavSpec is a small compiler for declarative application navigation. It parses a flat YAML graph into a validated, normalized, framework-neutral intermediate representation (IR).

This repository currently contains the stable core milestone. Framework-specific application and test generators are intentionally deferred.

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
```

`input` is resolved relative to the configuration file. Without configuration, the input defaults to `nav.yaml` and the root ID defaults to `root`.

## CLI

Build the package, then run:

```bash
node dist/cli.js validate
node dist/cli.js inspect
node dist/cli.js test-plan
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

Errors return exit status 1. Warnings normally allow success; `--warnings-as-errors` makes them fail validation. Invalid CLI usage returns status 2.

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
