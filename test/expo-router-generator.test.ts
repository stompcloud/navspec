import { runInNewContext } from "node:vm";

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
  it.each([
    "/${globalThis.injected = true}",
    "/x`;/globalThis.injected=true;//",
    "/a\\b",
    "//host",
    "//",
    "/a?x=1",
    "/a#fragment",
    "/a/../b",
    "/a\n",
    "/a\u001b[2J",
    '/a"b',
    "/a//b",
  ])(
    "rejects an unsafe API publicPath %s before emitting code",
    (publicPath) => {
      const navigation = ir("root:\n");
      expect(planExpoRoutes(navigation, publicPath).diagnostics).toMatchObject([
        { code: "EXPO001", severity: "error" },
      ]);
      expect(generateExpoRouter(navigation, { publicPath }).artifacts).toEqual(
        [],
      );
    },
  );

  it.each(["/", "/settings", "/settings/account/"])(
    "emits working route code for %s",
    (publicPath) => {
      const generated = generateExpoRouter(
        ir("root:\n  items: [details]\ndetails:\n"),
        { publicPath },
      );
      const source = generated.artifacts.find(
        ({ path }) => path === "routes.ts",
      )!.contents;
      const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText;
      const context = {
        exports: {} as { routeForNavSpecNode: (id: string) => string },
        require: () => ({ navSpecRootId: "root" }),
      };
      runInNewContext(js, context, { timeout: 1000 });
      const normalized =
        publicPath === "/" ? "/" : publicPath.replace(/\/$/u, "");
      expect(context.exports.routeForNavSpecNode("root")).toBe(normalized);
      expect(context.exports.routeForNavSpecNode("details")).toBe(
        `${normalized === "/" ? "" : normalized}/details`,
      );
    },
  );

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
    const types = first.artifacts.find(({ path }) => path === "types.ts")!;
    expect(types.contents).toContain('export type NavSpecPageId = "account";');
    expect(types.contents).toContain(
      "readonly pageComponents?: NavSpecPageComponents;",
    );
    expect(types.contents).not.toContain('Object["constructor"]');
    expect(runtime.contents).toContain(
      "integration.label(node.id, node.displayName)",
    );
    expect(runtime.contents).toContain(
      "integration.pageComponents[node.id as NavSpecPageId]",
    );
    expect(runtime.contents).toContain(
      "<PageComponent nodeId={node.id as NavSpecPageId} />",
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

  it("limits custom page components to page node IDs", () => {
    const navigation = ir(`root:
  items: [details, save, docs]
details:
  type: page
  items: [more-details]
more-details:
save:
  type: action
docs:
  type: external-link
  url: https://example.com/docs
`);
    const generated = generateExpoRouter(navigation, {
      publicPath: "/settings",
    });
    const types = generated.artifacts.find(({ path }) => path === "types.ts")!;
    const runtime = generated.artifacts.find(
      ({ path }) => path === "runtime.tsx",
    )!;

    expect(types.contents).toContain(
      'export type NavSpecPageId = "details" | "more-details";',
    );
    expect(types.contents).not.toContain('export type NavSpecPageId = "root"');
    expect(runtime.contents.indexOf("<PageComponent")).toBeLessThan(
      runtime.contents.indexOf("node.items.map"),
    );
  });

  it("generates an empty page ID type when the graph has no page nodes", () => {
    const navigation = ir(`root:
  type: menu
  items: [save]
save:
  type: action
`);
    const generated = generateExpoRouter(navigation, {
      publicPath: "/settings",
    });
    const types = generated.artifacts.find(({ path }) => path === "types.ts")!;

    expect(types.contents).toContain("export type NavSpecPageId = never;");
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
