import { describe, expect, it } from "vitest";

import { compileNavigation, deriveDisplayName } from "../src/compiler.js";

describe("deriveDisplayName", () => {
  it.each([
    ["delete-account", "Delete Account"],
    ["two-factor-authentication", "Two Factor Authentication"],
    ["api-access", "Api Access"],
    ["oauth-login", "Oauth Login"],
  ])("derives %s deterministically", (id, expected) => {
    expect(deriveDisplayName(id)).toBe(expected);
  });
});

describe("compileNavigation", () => {
  it("compiles an 8000-node chain without using the JavaScript call stack", () => {
    const count = 8000;
    const source =
      Array.from(
        { length: count },
        (_, index) =>
          `${index === 0 ? "root" : `n-${index}`}:${index + 1 < count ? `\n  items: [n-${index + 1}]` : ""}`,
      ).join("\n") + "\n";
    const result = compileNavigation(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.nodes).toHaveLength(count);
  });

  it("compiles constructor as a valid navigation destination", () => {
    const result = compileNavigation(
      "root:\n  items: [constructor]\nconstructor:\n",
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.ir).toMatchObject({
      root: "root",
      nodes: [
        { id: "root", type: "menu", items: ["constructor"] },
        { id: "constructor", type: "page", items: [] },
      ],
    });
  });

  it.each(["__proto__", "toString", "hasOwnProperty"])(
    "reports invalid prototype-like ID %s without throwing",
    (id) => {
      const result = compileNavigation(`root:\n  items: [${id}]\n${id}:\n`, {
        sourcePath: "example.yaml",
      });
      expect(result.ir).toBeUndefined();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "NAV001",
          severity: "error",
          message: `Node ID "${id}" must use stable kebab-case.`,
          span: expect.objectContaining({
            sourcePath: "example.yaml",
            start: expect.objectContaining({ line: 3, column: 1 }),
          }),
        }),
      ]);
    },
  );

  it("normalizes inferred types and empty definitions", () => {
    const result = compileNavigation(`root:\n  items: [account]\naccount:\n`);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.nodes).toMatchObject([
      { id: "root", type: "menu", items: ["account"], displayName: "Root" },
      { id: "account", type: "page", items: [], displayName: "Account" },
    ]);
  });

  it("supports all v0.1 node types and orthogonal child edges", () => {
    const result = compileNavigation(`
root:
  type: page
  items: [save, docs]
save:
  type: action
docs:
  type: external-link
  url: https://example.com/docs
`);
    expect(result.ir?.nodes.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: "root", type: "page" },
      { id: "save", type: "action" },
      { id: "docs", type: "external-link" },
    ]);
  });

  it("uses a configured root", () => {
    const result = compileNavigation("home:\n", { root: "home" });
    expect(result.ir?.root).toBe("home");
  });

  it("rejects invalid IDs, references, types, and properties", () => {
    const result = compileNavigation(`
Root Node:
  type: screen
  items: [privacy-setting]
privacy-settings:
  url: ftp://example.com
`);
    expect(result.ir).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "NAV004",
      "NAV001",
      "NAV002",
      "NAV003",
      "NAV007",
    ]);
  });

  it("requires a valid URL for external links", () => {
    const missing = compileNavigation("root:\n  type: external-link\n");
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "NAV005",
    );

    const invalid = compileNavigation(
      "root:\n  type: external-link\n  url: file:///tmp/a\n",
    );
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "NAV006",
    );
  });

  it("reports reference locations and typo hints", () => {
    const source =
      "root:\n  items:\n    - privacy-setting\nprivacy-settings:\n";
    const result = compileNavigation(source);
    const diagnostic = result.diagnostics.find(({ code }) => code === "NAV003");
    expect(diagnostic).toMatchObject({
      hint: 'Did you mean "privacy-settings"?',
      span: { start: { line: 3, column: 7 } },
    });
  });

  it("reports unreachable nodes as warnings and cycles as info", () => {
    const result = compileNavigation(`
root:
  items: [account]
account:
  items: [root]
orphan:
`);
    expect(result.ir).toBeDefined();
    expect(
      result.diagnostics.map(({ code, severity }) => ({ code, severity })),
    ).toEqual([
      { code: "NAV201", severity: "info" },
      { code: "NAV101", severity: "warning" },
    ]);
  });

  it("warns about duplicate references and normalizes them to one graph edge", () => {
    const result = compileNavigation(
      "root:\n  items: [account, account]\naccount:\n",
    );
    expect(result.diagnostics).toMatchObject([
      {
        code: "NAV102",
        severity: "warning",
        span: { start: { line: 2, column: 20 } },
      },
    ]);
    expect(result.ir?.nodes[0]?.items).toEqual(["account"]);
  });
});
