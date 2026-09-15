import { reachableNodeIds, shortestPathsFromRoot } from "./graph.js";
import type { NavigationIR, NavigationNodeType } from "./types.js";

export type NavigationIntent =
  "navigate" | "invoke-action" | "open-external-link";

export interface EdgeTestCase {
  readonly id: string;
  readonly kind: "edge";
  readonly intent: NavigationIntent;
  readonly from: string;
  readonly target: string;
  readonly targetType: NavigationNodeType;
  readonly expectedUrl?: string;
}

export interface RootPathTestCase {
  readonly id: string;
  readonly kind: "root-path";
  readonly target: string;
  readonly path: readonly string[];
}

export interface NavigationTestPlan {
  readonly root: string;
  readonly reachableNodes: readonly string[];
  readonly edgeCases: readonly EdgeTestCase[];
  readonly rootPathCases: readonly RootPathTestCase[];
}

export function planNavigationTests(ir: NavigationIR): NavigationTestPlan {
  const byId = new Map(ir.nodes.map((node) => [node.id, node]));
  const reachable = reachableNodeIds(ir);
  const paths = shortestPathsFromRoot(ir);
  const edgeCases: EdgeTestCase[] = [];

  for (const from of ir.nodes) {
    if (!reachable.has(from.id)) continue;
    for (const targetId of from.items) {
      const target = byId.get(targetId);
      if (target === undefined) continue;
      const intent: NavigationIntent =
        target.type === "action"
          ? "invoke-action"
          : target.type === "external-link"
            ? "open-external-link"
            : "navigate";
      edgeCases.push({
        id: `edge:${from.id}->${target.id}`,
        kind: "edge",
        intent,
        from: from.id,
        target: target.id,
        targetType: target.type,
        ...(target.url === undefined ? {} : { expectedUrl: target.url }),
      });
    }
  }

  return {
    root: ir.root,
    reachableNodes: ir.nodes
      .filter((node) => reachable.has(node.id))
      .map((node) => node.id),
    edgeCases,
    rootPathCases: ir.nodes
      .filter((node) => reachable.has(node.id) && node.id !== ir.root)
      .map((node) => ({
        id: `root-path:${ir.root}->${node.id}`,
        kind: "root-path" as const,
        target: node.id,
        path: paths.get(node.id) ?? [],
      })),
  };
}
