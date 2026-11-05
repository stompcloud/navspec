import { normalizeExpoPublicPath } from "./expo-public-path.js";
import type { Diagnostic, NavigationIR } from "./types.js";

export interface ExpoRoute {
  readonly nodeId: string;
  readonly path: string;
  readonly isRoot: boolean;
}

export interface ExpoRoutePlan {
  readonly publicPath: string;
  readonly rootNodeId: string;
  readonly routes: readonly ExpoRoute[];
  readonly diagnostics: readonly Diagnostic[];
}

function joinRoute(base: string, segment: string): string {
  return base === "/" ? `/${segment}` : `${base}/${segment}`;
}

export function planExpoRoutes(
  ir: NavigationIR,
  publicPath: string,
): ExpoRoutePlan {
  const diagnostics: Diagnostic[] = [];
  const normalized = normalizeExpoPublicPath(publicPath);
  if (normalized === undefined) {
    diagnostics.push({
      code: "EXPO001",
      severity: "error",
      message: `Expo Router public path "${publicPath}" must be an absolute URL path containing only static kebab-case segments.`,
    });
  }
  if (normalized === undefined)
    return { publicPath, rootNodeId: ir.root, routes: [], diagnostics };
  const routes = ir.nodes.map((node) => ({
    nodeId: node.id,
    path: node.id === ir.root ? normalized : joinRoute(normalized, node.id),
    isRoot: node.id === ir.root,
  }));
  return {
    publicPath: normalized,
    rootNodeId: ir.root,
    routes,
    diagnostics,
  };
}
