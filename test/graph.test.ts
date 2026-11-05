import { describe, expect, it } from "vitest";

import {
  findCycles,
  reachableNodeIds,
  shortestPathsFromRoot,
} from "../src/graph.js";
import type { NavigationIR } from "../src/types.js";

const source = {
  sourcePath: "nav.yaml",
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 1, line: 1, column: 2 },
};

function ir(edges: Record<string, string[]>): NavigationIR {
  return {
    version: 1,
    root: "root",
    nodes: Object.entries(edges).map(([id, items]) => ({
      id,
      type: items.length === 0 ? "page" : "menu",
      items,
      displayName: id,
      source,
    })),
  };
}

describe("graph utilities", () => {
  it("computes reachability and one deterministic shortest path", () => {
    const graph = ir({
      root: ["a", "b"],
      a: ["shared"],
      b: ["shared"],
      shared: [],
      orphan: [],
    });
    expect([...reachableNodeIds(graph)]).toEqual(["root", "a", "b", "shared"]);
    expect(shortestPathsFromRoot(graph).get("shared")).toEqual([
      "root",
      "a",
      "shared",
    ]);
  });

  it("detects and canonicalizes a deep cycle without recursion", () => {
    const count = 10000;
    const edges = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `n-${String(i).padStart(5, "0")}`,
        [`n-${String((i + 1) % count).padStart(5, "0")}`],
      ]),
    );
    const graph = ir(edges);
    expect(findCycles(graph)).toEqual([[...Object.keys(edges), "n-00000"]]);
  });

  it("detects cycles without treating them as invalid", () => {
    const graph = ir({ root: ["a"], a: ["b"], b: ["a"], self: ["self"] });
    expect(findCycles(graph)).toEqual([
      ["a", "b", "a"],
      ["self", "self"],
    ]);
  });
});
