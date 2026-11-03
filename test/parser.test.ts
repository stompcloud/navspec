import { describe, expect, it } from "vitest";

import { parseNavigationYaml } from "../src/parser.js";

describe("parseNavigationYaml", () => {
  it("preserves source locations", () => {
    const result = parseNavigationYaml(
      "root:\n  items:\n    - account\naccount:\n",
      "example.yaml",
    );
    expect(result.ast?.nodes[0]?.idSpan).toMatchObject({
      sourcePath: "example.yaml",
      start: { line: 1, column: 1 },
    });
    expect(result.ast?.nodes[0]?.itemSpans.account?.[0]).toMatchObject({
      start: { line: 3, column: 7 },
    });
  });

  it.each([
    ["- root", "NAVP002"],
    ["root: page", "NAVP004"],
    ["root:\n  items: account", "NAVP008"],
    ["root:\n  label: Root", "NAVP010"],
  ])("reports invalid source shape", (source, code) => {
    expect(
      parseNavigationYaml(source).diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    ).toContain(code);
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "preserves repeated item spans for prototype-like key %s",
    (id) => {
      const result = parseNavigationYaml(
        `root:\n  items:\n    - ${id}\n    - ${id}\n`,
        "example.yaml",
      );
      expect(result.diagnostics).toEqual([]);
      const node = result.ast?.nodes[0];
      expect(node?.items).toEqual([id, id]);
      expect(Object.hasOwn(node!.itemSpans, id)).toBe(true);
      expect(node?.itemSpans[id]).toMatchObject([
        { sourcePath: "example.yaml", start: { line: 3, column: 7 } },
        { sourcePath: "example.yaml", start: { line: 4, column: 7 } },
      ]);
    },
  );

  it("rejects duplicate node IDs", () => {
    const result = parseNavigationYaml("root:\nroot:\n");
    expect(result.diagnostics[0]?.code).toBe("NAVP001");
  });
});
