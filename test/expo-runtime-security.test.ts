import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { compileNavigation } from "../src/compiler.js";
import { generateExpoRouter } from "../src/expo-router-generator.js";

// Execute the emitted component with a minimal JSX renderer; no native platform
// is needed to check whether the registry lookup uses an own property.
function render(pageComponents: Record<string, unknown>, useHelper = false) {
  let registry = pageComponents;
  const compiled = compileNavigation(
    "root:\n  items: [constructor]\nconstructor:\n",
  );
  const generated = generateExpoRouter(compiled.ir!, {
    publicPath: "/navspec",
  });
  const source = generated.artifacts.find(
    ({ path }) => path === "runtime.tsx",
  )!.contents;
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const rendered: unknown[] = [];
  const jsx = (component: unknown) => {
    rendered.push(component);
    return null;
  };
  const context = {
    exports: {} as {
      NavSpecScreen: (props: { nodeId: string }) => unknown;
      defineNavSpecPageComponents: (
        components: Record<string, unknown>,
      ) => Record<string, unknown>;
    },
    require(name: string): unknown {
      if (name === "react/jsx-runtime")
        return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react")
        return {
          createContext: () => null,
          useContext: () => ({
            label: (_id: string, fallback: string) => fallback,
            pageComponents: registry,
          }),
        };
      if (name === "expo-router") return { Stack: { Screen: "Screen" } };
      if (name === "react-native")
        return {
          Text: "Text",
          StyleSheet: { create: (value: unknown) => value },
          useColorScheme: () => null,
        };
      if (name === "./model")
        return {
          navSpecNodes: Object.fromEntries(
            compiled.ir!.nodes.map((n) => [n.id, n]),
          ),
        };
      if (name === "./routes") return {};
      throw new Error(`Unexpected module ${name}`);
    },
  };
  runInNewContext(js, context, { timeout: 1000 });
  if (useHelper) {
    registry = context.exports.defineNavSpecPageComponents(pageComponents);
    expect(Object.getPrototypeOf(registry)).toBeNull();
  }
  context.exports.NavSpecScreen({ nodeId: "constructor" });
  return rendered;
}

describe("generated page component lookup", () => {
  it("renders fallback content instead of inherited Object.constructor", () => {
    const rendered = render({});
    expect(rendered).not.toContain(Object);
    expect(rendered).toContain("Text");
  });
  it("renders an explicitly registered constructor page", () => {
    const component = () => null;
    const rendered = render({ constructor: component });
    expect(rendered).toContain(component);
    expect(rendered).not.toContain("Text");
  });
  it("copies only own registrations into a null-prototype registry", () => {
    const inheritedComponent = () => null;
    const rendered = render(
      Object.create({ constructor: inheritedComponent }) as Record<
        string,
        unknown
      >,
      true,
    );
    expect(rendered).not.toContain(inheritedComponent);
    expect(rendered).toContain("Text");
  });
  it("preserves an explicitly registered constructor through the helper", () => {
    const component = () => null;
    expect(render({ constructor: component }, true)).toContain(component);
  });
});
