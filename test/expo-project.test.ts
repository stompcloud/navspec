import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { initializeExpoRouterProject } from "../src/expo-project.js";
import { cleanupTempDirectories, makeTempDirectory } from "./temp-directory.js";

function expoProject(): string {
  const root = makeTempDirectory("navspec-expo-");
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
    JSON.stringify({ extends: "expo/tsconfig.base" }),
  );
  return root;
}

afterEach(cleanupTempDirectories);

const config = {
  generatedDirectory: "src/generated/navspec/expo",
  publicPath: "/settings",
} as const;

describe("Expo project initialization", () => {
  it("creates stable route and application integration scaffolds idempotently", () => {
    const root = expoProject();
    const first = initializeExpoRouterProject(root, config);
    expect(first.created).toEqual([
      "src/app/settings/_layout.tsx",
      "src/app/settings/index.tsx",
      "src/app/settings/[node-id].tsx",
      "src/navspec/integration.ts",
    ]);
    expect(initializeExpoRouterProject(root, config).created).toEqual([]);
    expect(
      readFileSync(join(root, "src", "navspec", "integration.ts"), "utf8"),
    ).toContain("label: (_id, fallback) => fallback");
    expect(
      readFileSync(join(root, "src", "navspec", "integration.ts"), "utf8"),
    ).toContain("message: (_id, fallback) => fallback");
  });

  it("refuses route and application-owned file conflicts", () => {
    const root = expoProject();
    writeFileSync(
      join(root, "src", "app", "settings.tsx"),
      "export default null;\n",
    );
    expect(() => initializeExpoRouterProject(root, config)).toThrow(
      /Route conflict/u,
    );
    expect(existsSync(join(root, "src", "app", "settings"))).toBe(false);
  });

  it("reports overlapping dynamic routes and rejects platform route variants", () => {
    const dynamicRoot = expoProject();
    writeFileSync(
      join(dynamicRoot, "src", "app", "[slug].tsx"),
      "export default null;\n",
    );
    expect(initializeExpoRouterProject(dynamicRoot, config).warnings).toEqual([
      expect.stringContaining("Dynamic route"),
    ]);

    const platformRoot = expoProject();
    writeFileSync(
      join(platformRoot, "src", "app", "settings.web.tsx"),
      "export default null;\n",
    );
    expect(() => initializeExpoRouterProject(platformRoot, config)).toThrow(
      /Route conflict/u,
    );
  });

  it("rejects projects without Expo Router", () => {
    const root = expoProject();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { expo: "~57.0.0" } }),
    );
    expect(() => initializeExpoRouterProject(root, config)).toThrow(
      /expo-router/u,
    );
  });

  it("rejects projects without TypeScript configuration", () => {
    const root = expoProject();
    rmSync(join(root, "tsconfig.json"));
    expect(() => initializeExpoRouterProject(root, config)).toThrow(
      /requires a project tsconfig/u,
    );
  });

  it("accepts a custom entry that registers Expo Router", () => {
    const root = expoProject();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        main: "index.js",
        dependencies: { expo: "~57.0.0", "expo-router": "~57.0.0" },
      }),
    );
    writeFileSync(join(root, "index.js"), 'import "expo-router/entry";\n');
    expect(initializeExpoRouterProject(root, config).warnings).toEqual([
      expect.stringContaining("custom Expo Router entry"),
    ]);
  });
});
