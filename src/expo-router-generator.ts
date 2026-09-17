import { createHash } from "node:crypto";

import { planExpoRoutes } from "./expo-router-planner.js";
import { generateExpoNavigationTests } from "./expo-test-generator.js";
import { planNavigationTests } from "./test-planner.js";
import type {
  GeneratedArtifact,
  NavigationIR,
  TargetGenerationResult,
} from "./types.js";

export interface ExpoRouterGeneratorOptions {
  readonly publicPath: string;
  readonly sourcePath?: string;
  readonly sourceHash?: string;
}

interface ExpoManifest {
  readonly navspecVersion: 1;
  readonly target: "expo-router";
  readonly source: string;
  readonly sourceHash: string;
  readonly publicPath: string;
  readonly artifacts: readonly string[];
}

function artifact(path: string, contents: string): GeneratedArtifact {
  return {
    path,
    contents: contents.endsWith("\n") ? contents : `${contents}\n`,
    ownership: "generated",
  };
}

function hashIr(ir: NavigationIR): string {
  return createHash("sha256").update(JSON.stringify(ir)).digest("hex");
}

function typesSource(ir: NavigationIR): string {
  const ids = ir.nodes.map((node) => JSON.stringify(node.id)).join(" | ");
  const actionIds = ir.nodes
    .filter((node) => node.type === "action")
    .map((node) => JSON.stringify(node.id))
    .join(" | ");
  return `export type NavSpecNodeId = ${ids || "never"};
export type NavSpecActionId = ${actionIds || "never"};

export interface NavSpecIntegration {
  readonly label: (id: NavSpecNodeId, fallback: string) => string;
  readonly message?: (id: "not-found", fallback: string) => string;
  readonly invokeAction: (id: NavSpecActionId) => void | Promise<void>;
}
`;
}

function modelSource(ir: NavigationIR): string {
  const model = Object.fromEntries(
    ir.nodes.map((node) => [
      node.id,
      {
        id: node.id,
        type: node.type,
        items: node.items,
        displayName: node.displayName,
        ...(node.url === undefined ? {} : { url: node.url }),
      },
    ]),
  );
  return `import type { NavSpecNodeId } from "./types";

export interface GeneratedNavSpecNode {
  readonly id: NavSpecNodeId;
  readonly type: "menu" | "page" | "action" | "external-link";
  readonly items: readonly NavSpecNodeId[];
  readonly displayName: string;
  readonly url?: string;
}

export const navSpecRootId = ${JSON.stringify(ir.root)} as const;

export const navSpecNodes = ${JSON.stringify(model, null, 2)} as const satisfies Record<
  NavSpecNodeId,
  GeneratedNavSpecNode
>;
`;
}

function routesSource(ir: NavigationIR, publicPath: string): string {
  return `import type { Href } from "expo-router";

import { navSpecRootId } from "./model";
import type { NavSpecNodeId } from "./types";

export const navSpecPublicPath = ${JSON.stringify(publicPath)} as const;

export function routeForNavSpecNode(id: NavSpecNodeId): Href {
  if (id === navSpecRootId) return navSpecPublicPath as Href;
  return \`${publicPath === "/" ? "" : publicPath}/\${id}\` as Href;
}
`;
}

function runtimeSource(): string {
  return `import { Link, Stack } from "expo-router";
import { createContext, useContext } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { navSpecNodes } from "./model";
import { routeForNavSpecNode } from "./routes";
import type {
  NavSpecActionId,
  NavSpecIntegration,
  NavSpecNodeId,
} from "./types";

const missingIntegration: NavSpecIntegration = {
  label: (_id, fallback) => fallback,
  invokeAction: (id) => {
    throw new Error(\`No NavSpec action handler is registered for "\${id}".\`);
  },
};

const NavSpecIntegrationContext = createContext<NavSpecIntegration>(missingIntegration);

export function NavSpecProvider({
  integration,
  children,
}: {
  readonly integration: NavSpecIntegration;
  readonly children: React.ReactNode;
}) {
  return (
    <NavSpecIntegrationContext.Provider value={integration}>
      {children}
    </NavSpecIntegrationContext.Provider>
  );
}

function isNavSpecNodeId(value: string): value is NavSpecNodeId {
  return Object.prototype.hasOwnProperty.call(navSpecNodes, value);
}

export function NavSpecScreen({ nodeId }: { readonly nodeId: string }) {
  const integration = useContext(NavSpecIntegrationContext);
  const colorScheme = useColorScheme();
  const foreground = colorScheme === "dark" ? "#f5f5f5" : "#171717";
  const separator = colorScheme === "dark" ? "#454545" : "#d4d4d4";
  if (!isNavSpecNodeId(nodeId)) {
    const notFound = integration.message?.(
      "not-found",
      "Navigation destination not found",
    ) ?? "Navigation destination not found";
    return (
      <View style={styles.centered} testID="navspec:not-found">
        <Text accessibilityRole="header" style={{ color: foreground }}>
          {notFound}
        </Text>
      </View>
    );
  }

  const node = navSpecNodes[nodeId];
  const title = integration.label(node.id, node.displayName);

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.container}
        testID={\`navspec:node:\${node.id}\`}
      >
        {node.type === "page" && node.items.length === 0 ? (
          <Text style={[styles.title, { color: foreground }]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {node.items.map((targetId) => {
          const target = navSpecNodes[targetId];
          const targetLabel = integration.label(target.id, target.displayName);
          const testID = \`navspec:edge:\${node.id}->\${target.id}\`;

          if (target.type === "action") {
            return (
              <Pressable
                accessibilityLabel={targetLabel}
                accessibilityRole="button"
                key={target.id}
                onPress={() => void integration.invokeAction(target.id as NavSpecActionId)}
                style={[styles.row, { borderBottomColor: separator }]}
                testID={testID}
              >
                <Text style={[styles.rowLabel, { color: foreground }]}>{targetLabel}</Text>
              </Pressable>
            );
          }

          if (target.type === "external-link") {
            return (
              <Pressable
                accessibilityLabel={targetLabel}
                accessibilityRole="link"
                key={target.id}
                onPress={() => void Linking.openURL(target.url)}
                style={[styles.row, { borderBottomColor: separator }]}
                testID={testID}
              >
                <Text style={[styles.rowLabel, { color: foreground }]}>{targetLabel}</Text>
              </Pressable>
            );
          }

          return (
            <Link href={routeForNavSpecNode(target.id)} asChild key={target.id}>
              <Pressable
                accessibilityLabel={targetLabel}
                accessibilityRole="link"
                style={StyleSheet.flatten([
                  styles.row,
                  { borderBottomColor: separator },
                ])}
                testID={testID}
              >
                <Text style={[styles.rowLabel, { color: foreground }]}>{targetLabel}</Text>
              </Pressable>
            </Link>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  container: {
    gap: 12,
    padding: 16,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 17,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
});
`;
}

function indexSource(): string {
  return `export { navSpecNodes, navSpecRootId } from "./model";
export { routeForNavSpecNode, navSpecPublicPath } from "./routes";
export { NavSpecProvider, NavSpecScreen } from "./runtime";
export type {
  NavSpecActionId,
  NavSpecIntegration,
  NavSpecNodeId,
} from "./types";
`;
}

export function generateExpoRouter(
  ir: NavigationIR,
  options: ExpoRouterGeneratorOptions,
): TargetGenerationResult {
  const routePlan = planExpoRoutes(ir, options.publicPath);
  if (routePlan.diagnostics.some(({ severity }) => severity === "error")) {
    return { artifacts: [], diagnostics: routePlan.diagnostics };
  }

  const fallbackLabels = Object.fromEntries(
    ir.nodes.map((node) => [node.id, node.displayName]),
  );
  const generated = [
    artifact("types.ts", typesSource(ir)),
    artifact("model.ts", modelSource(ir)),
    artifact("routes.ts", routesSource(ir, routePlan.publicPath)),
    artifact("runtime.tsx", runtimeSource()),
    artifact("index.ts", indexSource()),
    artifact("messages.en.json", JSON.stringify(fallbackLabels, null, 2)),
    generateExpoNavigationTests(planNavigationTests(ir)),
  ];
  const manifest: ExpoManifest = {
    navspecVersion: 1,
    target: "expo-router",
    source: options.sourcePath ?? "nav.yaml",
    sourceHash: options.sourceHash ?? hashIr(ir),
    publicPath: routePlan.publicPath,
    artifacts: [...generated.map(({ path }) => path), "manifest.json"].sort(),
  };
  return {
    artifacts: [
      ...generated,
      artifact("manifest.json", JSON.stringify(manifest, null, 2)),
    ],
    diagnostics: routePlan.diagnostics,
  };
}
