import ts from "typescript";
import { describe, expect, it } from "vitest";

import { compileNavigation } from "../src/compiler.js";
import { generateExpoRouter } from "../src/expo-router-generator.js";
import { planExpoRoutes } from "../src/expo-router-planner.js";

function ir(source: string) {
  const result = compileNavigation(source);
  expect(result.ir).toBeDefined();
  return result.ir!;
}

describe("Expo Router target", () => {
  it("maps a graph to stable flat absolute routes", () => {
    const navigation = ir(`root:
  items: [account, security]
account:
  items: [privacy]
security:
  items: [privacy]
privacy:
  items: [root]
orphan:
`);
    const plan = planExpoRoutes(navigation, "/settings/");
    expect(plan.routes).toEqual([
      { nodeId: "root", path: "/settings", isRoot: true },
      { nodeId: "account", path: "/settings/account", isRoot: false },
      { nodeId: "security", path: "/settings/security", isRoot: false },
      { nodeId: "privacy", path: "/settings/privacy", isRoot: false },
      { nodeId: "orphan", path: "/settings/orphan", isRoot: false },
    ]);
  });

  it("generates deterministic localization-aware TypeScript artifacts", () => {
    const navigation = ir(`root:
  items: [account, save, docs]
account:
save:
  type: action
docs:
  type: external-link
  url: https://example.com/docs
`);
    const first = generateExpoRouter(navigation, {
      publicPath: "/settings",
      sourcePath: "nav.yaml",
      sourceHash: "abc",
    });
    const second = generateExpoRouter(navigation, {
      publicPath: "/settings",
      sourcePath: "nav.yaml",
      sourceHash: "abc",
    });
    expect(first).toEqual(second);
    expect(first.artifacts.map(({ path }) => path)).toEqual([
      "types.ts",
      "model.ts",
      "routes.ts",
      "runtime.tsx",
      "index.ts",
      "messages.en.json",
      "navigation-tests.ts",
      "manifest.json",
    ]);
    const manifest = JSON.parse(
      first.artifacts.find(({ path }) => path === "manifest.json")!.contents,
    );
    expect(manifest.artifacts).toEqual([
      "index.ts",
      "manifest.json",
      "messages.en.json",
      "model.ts",
      "navigation-tests.ts",
      "routes.ts",
      "runtime.tsx",
      "types.ts",
    ]);
    const runtime = first.artifacts.find(({ path }) => path === "runtime.tsx")!;
    expect(runtime.contents).toContain(
      "integration.label(node.id, node.displayName)",
    );
    expect(runtime.contents).toContain("navspec:edge:");
    expect(runtime.contents).toContain("style={StyleSheet.flatten([");
    expect(runtime.contents).not.toContain(
      '<Link href={routeForNavSpecNode(target.id)} asChild key={target.id}>\n              <Pressable\n                accessibilityLabel={targetLabel}\n                accessibilityRole="link"\n                style={[',
    );
    const messages = JSON.parse(
      first.artifacts.find(({ path }) => path === "messages.en.json")!.contents,
    );
    expect(messages).toEqual({
      root: "Root",
      account: "Account",
      save: "Save",
      docs: "Docs",
    });
    expect(
      first.artifacts.find(({ path }) => path === "navigation-tests.ts")!
        .contents,
    ).toContain("runNavSpecEdgeTests");

    for (const artifact of first.artifacts.filter(({ path }) =>
      /\.tsx?$/u.test(path),
    )) {
      const parsed = ts.createSourceFile(
        artifact.path,
        artifact.contents,
        ts.ScriptTarget.Latest,
        true,
        artifact.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const diagnostics = (
        parsed as ts.SourceFile & {
          readonly parseDiagnostics: readonly ts.Diagnostic[];
        }
      ).parseDiagnostics;
      expect(diagnostics, artifact.path).toEqual([]);
    }
  });

  it("keeps route identity stable when presentation labels change", () => {
    const navigation = ir("root:\n  items: [account]\naccount:\n");
    const localized = {
      ...navigation,
      nodes: navigation.nodes.map((node) => ({
        ...node,
        displayName: node.id === "account" ? "Compte" : "Accueil",
      })),
    };
    expect(planExpoRoutes(localized, "/settings")).toEqual(
      planExpoRoutes(navigation, "/settings"),
    );
    const original = generateExpoRouter(navigation, {
      publicPath: "/settings",
    });
    const translated = generateExpoRouter(localized, {
      publicPath: "/settings",
    });
    expect(
      original.artifacts.find(({ path }) => path === "routes.ts")?.contents,
    ).toBe(
      translated.artifacts.find(({ path }) => path === "routes.ts")?.contents,
    );
  });
});
