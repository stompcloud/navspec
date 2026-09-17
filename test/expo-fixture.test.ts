import { execFileSync } from "node:child_process";
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
    const compiled = compileNavigation(`root:
  items: [account, save, docs]
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
    );

    expect(() =>
      execFileSync(
        resolve("node_modules", ".bin", "tsc"),
        ["--project", root],
        {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe",
        },
      ),
    ).not.toThrow();
  });
});
