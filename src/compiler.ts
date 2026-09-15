import { hasErrors, sortDiagnostics } from "./diagnostics.js";
import { findCycles, reachableNodeIds } from "./graph.js";
import { parseNavigationYaml } from "./parser.js";
import type {
  CompileOptions,
  CompileResult,
  Diagnostic,
  NavigationIR,
  NavigationNode,
  NavigationNodeType,
  ParsedNavigationNode,
  SourceSpan,
} from "./types.js";

const nodeTypes = new Set<NavigationNodeType>([
  "menu",
  "page",
  "action",
  "external-link",
]);
const stableIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function deriveDisplayName(id: string): string {
  return id
    .split("-")
    .map((token) =>
      token.length === 0 ? token : token[0]!.toUpperCase() + token.slice(1),
    )
    .join(" ");
}

function itemSpan(
  node: ParsedNavigationNode,
  target: string,
  occurrence = 0,
): SourceSpan {
  return node.itemSpans[target]?.[occurrence] ?? node.span;
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex] ?? 0;
      row[rightIndex] = Math.min(
        (row[rightIndex] ?? 0) + 1,
        (row[rightIndex - 1] ?? 0) + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length] ?? 0;
}

function suggestion(
  id: string,
  candidates: readonly string[],
): string | undefined {
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: editDistance(id, candidate) }))
    .sort(
      (a, b) =>
        a.distance - b.distance || a.candidate.localeCompare(b.candidate),
    );
  const best = ranked[0];
  if (
    best === undefined ||
    best.distance > Math.max(2, Math.floor(id.length / 3))
  )
    return undefined;
  return best.candidate;
}

function validExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function compileNavigation(
  source: string,
  options: CompileOptions = {},
): CompileResult {
  const sourcePath = options.sourcePath ?? "nav.yaml";
  const root = options.root ?? "root";
  const parsed = parseNavigationYaml(source, sourcePath);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics];
  if (parsed.ast === undefined || hasErrors(diagnostics)) {
    return {
      ...(parsed.ast === undefined ? {} : { ast: parsed.ast }),
      diagnostics: sortDiagnostics(diagnostics),
    };
  }

  const ast = parsed.ast;
  const knownIds = ast.nodes.map((node) => node.id);
  const knownIdSet = new Set(knownIds);
  const nodes: NavigationNode[] = [];

  for (const node of ast.nodes) {
    if (!stableIdPattern.test(node.id)) {
      diagnostics.push({
        code: "NAV001",
        severity: "error",
        message: `Node ID "${node.id}" must use stable kebab-case.`,
        span: node.idSpan,
      });
    }

    const inferredType =
      node.type ?? (node.items === undefined ? "page" : "menu");
    const targetOccurrences = new Map<string, number>();
    for (const target of node.items ?? []) {
      const occurrence = targetOccurrences.get(target) ?? 0;
      targetOccurrences.set(target, occurrence + 1);
      if (!knownIdSet.has(target)) {
        const nearest = suggestion(target, knownIds);
        diagnostics.push({
          code: "NAV003",
          severity: "error",
          message: `Node "${node.id}" references unknown node "${target}".`,
          span: itemSpan(node, target, occurrence),
          ...(nearest === undefined
            ? {}
            : { hint: `Did you mean "${nearest}"?` }),
        });
      }
      if (occurrence > 0) {
        diagnostics.push({
          code: "NAV102",
          severity: "warning",
          message: `Node "${node.id}" references "${target}" more than once; duplicate edges are ignored.`,
          span: itemSpan(node, target, occurrence),
        });
      }
    }

    if (!nodeTypes.has(inferredType as NavigationNodeType)) {
      diagnostics.push({
        code: "NAV002",
        severity: "error",
        message: `Unsupported node type "${inferredType}" on node "${node.id}".`,
        span: node.typeSpan ?? node.span,
        hint: "Supported types are menu, page, action, and external-link.",
      });
      continue;
    }

    if (inferredType === "external-link") {
      if (node.url === undefined) {
        diagnostics.push({
          code: "NAV005",
          severity: "error",
          message: `External-link node "${node.id}" requires a "url" property.`,
          span: node.span,
        });
      } else if (!validExternalUrl(node.url)) {
        diagnostics.push({
          code: "NAV006",
          severity: "error",
          message: `External-link node "${node.id}" has an invalid HTTP(S) URL.`,
          span: node.urlSpan ?? node.span,
        });
      }
    } else if (node.url !== undefined) {
      diagnostics.push({
        code: "NAV007",
        severity: "error",
        message: `Property "url" is only valid on external-link nodes, not "${node.id}".`,
        span: node.urlSpan ?? node.span,
      });
    }

    nodes.push({
      id: node.id,
      type: inferredType as NavigationNodeType,
      items: [...new Set(node.items ?? [])],
      displayName: deriveDisplayName(node.id),
      ...(node.url === undefined ? {} : { url: node.url }),
      source: node.span,
    });
  }

  if (!knownIdSet.has(root)) {
    diagnostics.push({
      code: "NAV004",
      severity: "error",
      message: `Configured root node "${root}" does not exist.`,
      hint: `Define "${root}" in ${sourcePath} or configure a different root.`,
    });
  }

  const candidate: NavigationIR = { version: 1, root, nodes };
  if (knownIdSet.has(root)) {
    const reachable = reachableNodeIds(candidate);
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        diagnostics.push({
          code: "NAV101",
          severity: "warning",
          message: `Node "${node.id}" is unreachable from root "${root}".`,
          span:
            ast.nodes.find((parsedNode) => parsedNode.id === node.id)?.idSpan ??
            node.source,
        });
      }
    }
  }

  for (const cycle of findCycles(candidate)) {
    const first = ast.nodes.find((node) => node.id === cycle[0]);
    diagnostics.push({
      code: "NAV201",
      severity: "info",
      message: `Cycle detected: ${cycle.join(" -> ")}.`,
      ...(first === undefined ? {} : { span: first.idSpan }),
    });
  }

  const sorted = sortDiagnostics(diagnostics);
  return {
    ast,
    ...(!hasErrors(sorted) ? { ir: candidate } : {}),
    diagnostics: sorted,
  };
}
