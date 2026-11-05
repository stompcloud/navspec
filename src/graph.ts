import type { NavigationIR } from "./types.js";

function adjacency(ir: NavigationIR): ReadonlyMap<string, readonly string[]> {
  return new Map(ir.nodes.map((node) => [node.id, node.items]));
}

export function reachableNodeIds(ir: NavigationIR): ReadonlySet<string> {
  const edges = adjacency(ir);
  const visited = new Set<string>();
  const queue = [ir.root];

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    for (const target of edges.get(id) ?? []) {
      if (!visited.has(target)) queue.push(target);
    }
  }
  return visited;
}

export function shortestPathsFromRoot(
  ir: NavigationIR,
): ReadonlyMap<string, readonly string[]> {
  const edges = adjacency(ir);
  const paths = new Map<string, readonly string[]>([[ir.root, [ir.root]]]);
  const queue = [ir.root];

  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === undefined) continue;
    const path = paths.get(id);
    if (path === undefined) continue;
    for (const target of edges.get(id) ?? []) {
      if (!paths.has(target)) {
        paths.set(target, [...path, target]);
        queue.push(target);
      }
    }
  }
  return paths;
}

export function findCycles(ir: NavigationIR): readonly (readonly string[])[] {
  const edges = adjacency(ir);
  const state = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const found = new Map<string, readonly string[]>();

  const canonicalize = (cycle: readonly string[]): readonly string[] => {
    const body = cycle.slice(0, -1);
    // A cycle contains distinct node IDs, so its smallest ID determines the
    // lexicographically smallest rotation without building every rotation.
    let first = 0;
    for (let index = 1; index < body.length; index += 1) {
      if (body[index]! < body[first]!) first = index;
    }
    const best = [...body.slice(first), ...body.slice(0, first)];
    return [...best, best[0] ?? ""];
  };

  const visit = (id: string): void => {
    const frames = [{ id, next: 0 }];
    state.set(id, "visiting");
    stack.push(id);
    const positions = new Map<string, number>([[id, 0]]);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const targets = edges.get(frame.id) ?? [];
      if (frame.next === targets.length) {
        state.set(frame.id, "visited");
        positions.delete(frame.id);
        frames.pop();
        stack.pop();
        continue;
      }
      const target = targets[frame.next++]!;
      if (state.get(target) === "visiting") {
        const start = positions.get(target)!;
        const cycle = canonicalize([...stack.slice(start), target]);
        found.set(cycle.join("\0"), cycle);
      } else if (state.get(target) === undefined && edges.has(target)) {
        state.set(target, "visiting");
        positions.set(target, stack.length);
        stack.push(target);
        frames.push({ id: target, next: 0 });
      }
    }
  };

  for (const node of ir.nodes) {
    if (state.get(node.id) === undefined) visit(node.id);
  }
  return [...found.values()].sort((left, right) =>
    left.join("\0").localeCompare(right.join("\0")),
  );
}
