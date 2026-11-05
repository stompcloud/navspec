import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileNavigation } from "../src/compiler.js";
import { generateExpoRouter } from "../src/expo-router-generator.js";
import { initializeExpoRouterProject } from "../src/expo-project.js";
import { materializeGeneratedArtifacts } from "../src/generated-output.js";
import { cleanupTempDirectories, makeTempDirectory } from "./temp-directory.js";

afterEach(cleanupTempDirectories);

describe("generated Expo project fixture", () => {
  it("type-checks generated runtime and integration files together", () => {
    const root = makeTempDirectory("navspec-expo-fixture-");
    mkdirSync(join(root, "src", "app"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        main: "expo-router/entry",
        dependencies: { expo: "~57.0.0", "expo-router": "~57.0.0" },
      }),
    );
    writeFileSync(
      join(root, "app.json"),
      JSON.stringify({ expo: { plugins: ["expo-router"] } }),
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          skipLibCheck: true,
        },
        include: ["src/**/*.ts", "src/**/*.tsx", "types.d.ts"],
      }),
    );
    writeFileSync(
      join(root, "types.d.ts"),
      `declare namespace React { type ReactNode = unknown; }
declare namespace JSX { interface Element {} interface IntrinsicElements { [name: string]: unknown; } }
declare module "react/jsx-runtime" { export const Fragment: unknown; export function jsx(...args: unknown[]): JSX.Element; export function jsxs(...args: unknown[]): JSX.Element; }
declare module "react" {
  export type ComponentType<P = {}> = (props: P) => JSX.Element;
  export interface Context<T> { Provider: any; }
  export function createContext<T>(value: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
}
declare module "expo-router" {
  export type Href = string | Readonly<Record<string, unknown>>;
  export const Link: any;
  export const Stack: any;
  export function useLocalSearchParams<T>(): T;
}
declare module "react-native" {
  export const Linking: { openURL(url: string): Promise<unknown> };
  export const Pressable: any;
  export const ScrollView: any;
  export const Text: any;
  export const View: any;
  export const StyleSheet: {
    hairlineWidth: number;
    create<T>(value: T): T;
    flatten<T>(value: T): T;
  };
  export function useColorScheme(): "light" | "dark" | null;
}
`,
    );

    const config = {
      generatedDirectory: "src/generated/navspec/expo",
      publicPath: "/settings",
    } as const;
    initializeExpoRouterProject(root, config);
    mkdirSync(join(root, "src", "navspec", "pages"), { recursive: true });
    writeFileSync(
      join(root, "src", "navspec", "pages", "account-page.tsx"),
      `import { Text, View } from "react-native";

export default function AccountPage() {
  return <View><Text>Account content</Text></View>;
}
`,
    );
    writeFileSync(
      join(root, "src", "navspec", "integration.ts"),
      `import { defineNavSpecPageComponents } from "../generated/navspec/expo";
import type { NavSpecIntegration } from "../generated/navspec/expo";
import AccountPage from "./pages/account-page";

export const navSpecIntegration: NavSpecIntegration = {
  label: (_id, fallback) => fallback,
  message: (_id, fallback) => fallback,
  pageComponents: defineNavSpecPageComponents({ account: AccountPage }),
  invokeAction: (id) => {
    throw new Error(\`No NavSpec action handler is registered for "\${id}".\`);
  },
};
`,
    );
    const compiled = compileNavigation(`root:
  items: [account, save, docs, constructor]
constructor:
account:
save:
  type: action
docs:
  type: external-link
  url: https://example.com/docs
`);
    const generated = generateExpoRouter(compiled.ir!, {
      publicPath: config.publicPath,
    });
    materializeGeneratedArtifacts(
      join(root, config.generatedDirectory),
      generated.artifacts,
      root,
    );
    const noPages = generateExpoRouter(
      compileNavigation(
        "root:\n  type: menu\n  items: [save]\nsave:\n  type: action\n",
      ).ir!,
      { publicPath: "/empty" },
    );
    writeFileSync(
      join(root, "src/no-page-types.ts"),
      noPages.artifacts.find(({ path }) => path === "types.ts")!.contents,
    );
    writeFileSync(
      join(root, "src/navspec/registry-type-checks.ts"),
      `import { defineNavSpecPageComponents } from "../generated/navspec/expo";
import type { NavSpecIntegration, NavSpecPageComponents } from "../generated/navspec/expo";
import type { NavSpecPageComponents as NoPageComponents } from "../no-page-types";
import AccountPage from "./pages/account-page";

const ordinaryRegistry = { account: AccountPage };
const empty: NavSpecPageComponents = defineNavSpecPageComponents({});
const ordinary: NavSpecPageComponents = defineNavSpecPageComponents(ordinaryRegistry);
const ownConstructor: NavSpecPageComponents = defineNavSpecPageComponents({ constructor: AccountPage });
const integration: NavSpecIntegration = {
  label: (_id, fallback) => fallback,
  invokeAction: () => {},
  pageComponents: ownConstructor,
};
defineNavSpecPageComponents({ account: ({ nodeId }) => {
  const id: "constructor" | "account" = nodeId;
  return AccountPage();
} });

// @ts-expect-error A non-React class cannot be registered as a page component.
defineNavSpecPageComponents({ constructor: class NotAReactComponent {} });
// @ts-expect-error Direct registrations must also remain component-only.
const invalidDirectRegistry: NavSpecPageComponents = { constructor: class NotAReactComponent {} };
// @ts-expect-error Invalid component values are rejected for ordinary IDs too.
defineNavSpecPageComponents({ account: 42 });
// @ts-expect-error Unknown node IDs are not page registry keys.
defineNavSpecPageComponents({ unknown: AccountPage });
// @ts-expect-error Action IDs are not page registry keys.
defineNavSpecPageComponents({ save: AccountPage });
const noPagesEmpty: NoPageComponents = {};
// @ts-expect-error A graph without pages cannot have registrations.
const noPagesRegistration: NoPageComponents = { constructor: AccountPage };
`,
    );

    const checked = spawnSync(
      resolve("node_modules", ".bin", "tsc"),
      ["--project", root],
      { cwd: root, encoding: "utf8", timeout: 10000 },
    );
    expect(checked.error).toBeUndefined();
    expect(checked.status, `${checked.stdout}\n${checked.stderr}`).toBe(0);
  });
});
