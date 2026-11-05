import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { parseConfig } from "../src/config.js";
import {
  materializeGeneratedArtifacts,
  generatedArtifactsAreCurrent,
} from "../src/generated-output.js";
import { initializeExpoRouterProject } from "../src/expo-project.js";
import type { GeneratedArtifact } from "../src/types.js";
import { cleanupTempDirectories, makeTempDirectory } from "./temp-directory.js";

afterEach(cleanupTempDirectories);
const artifacts: readonly GeneratedArtifact[] = [
  { path: "index.ts", contents: "export {};\n", ownership: "generated" },
  {
    path: "manifest.json",
    contents:
      '{"target":"expo-router","artifacts":["index.ts","manifest.json"]}\n',
    ownership: "generated",
  },
];
const cli = resolve("dist/cli.js");
function config(path: string) {
  return stringify({
    outputs: { "expo-router": { generatedDirectory: path } },
  });
}
function expo(root: string) {
  mkdirSync(join(root, "src", "app"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      main: "expo-router/entry",
      dependencies: { expo: "~57.0.0", "expo-router": "~57.0.0" },
    }),
  );
  writeFileSync(join(root, "tsconfig.json"), "{}");
  writeFileSync(
    join(root, "app.json"),
    JSON.stringify({ expo: { plugins: ["expo-router"] } }),
  );
}

describe("output security", () => {
  it.each([
    "\\outside",
    "\\\\server\\share",
    "C:outside",
    "C:\\outside",
    ".",
    "./.",
    ".//.",
    "foo/../bar",
  ])("rejects unsafe output path %s", (path) => {
    expect(() => parseConfig(config(path))).toThrow();
  });
  it("normalizes separators and dots before comparing output directories", () => {
    expect(
      parseConfig(config(".//src/./generated//expo/")).outputs.expoRouter
        ?.generatedDirectory,
    ).toBe("src/generated/expo");
    expect(() =>
      parseConfig(
        stringify({
          outputs: {
            "expo-router": {
              generatedDirectory: "src/./app",
              routesDirectory: "src/app/settings",
            },
          },
        }),
      ),
    ).toThrow(/overlap/);
  });
  it.each(["backslash", "dot-slash"])(
    "does not replace an outside owned directory via %s config",
    (kind) => {
      const root = makeTempDirectory("navspec-security-");
      const project = join(root, "project");
      mkdirSync(project);
      const outside = join(root, "outside");
      materializeGeneratedArtifacts(outside, artifacts, root);
      const path =
        kind === "backslash" ? outside.replaceAll("/", "\\") : `./${outside}`;
      writeFileSync(join(project, "nav.yaml"), "root:\n");
      writeFileSync(join(project, "navspec.config.yaml"), config(path));
      spawnSync(process.execPath, [cli, "generate"], {
        cwd: project,
        encoding: "utf8",
      });
      expect(readFileSync(join(outside, "index.ts"), "utf8")).toBe(
        "export {};\n",
      );
      expect(readdirSync(outside).sort()).toEqual([
        "index.ts",
        "manifest.json",
      ]);
    },
  );
  it("refuses symlinked parents with an explicit output base", () => {
    const root = makeTempDirectory("navspec-security-");
    const project = join(root, "project");
    mkdirSync(project);
    const outside = join(root, "outside");
    materializeGeneratedArtifacts(outside, artifacts, root);
    symlinkSync(root, join(project, "link"));
    expect(() =>
      materializeGeneratedArtifacts(
        join(project, "link", "outside"),
        artifacts,
        project,
      ),
    ).toThrow(/symbolic link/);
    expect(() =>
      generatedArtifactsAreCurrent(
        join(project, "link", "outside"),
        artifacts,
        project,
      ),
    ).toThrow(/symbolic link/);
    expect(readFileSync(join(outside, "index.ts"), "utf8")).toBe(
      "export {};\n",
    );
  });
  it("rejects symlinked manifests and dangling output targets", () => {
    const root = makeTempDirectory("navspec-security-");
    const output = join(root, "out");
    mkdirSync(output);
    const manifest = join(root, "manifest.json");
    writeFileSync(manifest, artifacts[1]!.contents);
    symlinkSync(manifest, join(output, "manifest.json"));
    expect(() =>
      materializeGeneratedArtifacts(output, artifacts, root),
    ).toThrow(/symbolic link/);
    const dangling = join(root, "dangling");
    symlinkSync(join(root, "missing"), dangling);
    expect(() =>
      materializeGeneratedArtifacts(dangling, artifacts, root),
    ).toThrow(/symbolic link/);
    expect(existsSync(join(root, "missing"))).toBe(false);
  });
  it.each(["parent", "dangling-file", "route-parent"])(
    "preflights init before any writes for %s symlink",
    (kind) => {
      const root = makeTempDirectory("navspec-security-");
      const project = join(root, "project");
      expo(project);
      const outside = join(root, "outside");
      mkdirSync(outside);
      if (kind === "parent")
        symlinkSync(outside, join(project, "src", "navspec"));
      else if (kind === "route-parent")
        symlinkSync(outside, join(project, "src", "app", "settings"));
      else {
        mkdirSync(join(project, "src", "navspec"));
        symlinkSync(
          join(outside, "new.ts"),
          join(project, "src", "navspec", "integration.ts"),
        );
      }
      expect(() =>
        initializeExpoRouterProject(project, {
          generatedDirectory: "src/generated/navspec/expo",
          publicPath: "/settings",
        }),
      ).toThrow(/symbolic link/);
      expect(readdirSync(outside)).toEqual([]);
      expect(
        existsSync(join(project, "src", "app", "settings", "index.tsx")),
      ).toBe(false);
    },
  );
  it("requires an explicit trusted base for destinations outside the working directory", () => {
    const root = makeTempDirectory("navspec-security-");
    const output = join(root, "out");
    expect(() => materializeGeneratedArtifacts(output, artifacts)).toThrow(
      /must stay below/,
    );
    expect(existsSync(output)).toBe(false);
    materializeGeneratedArtifacts(output, artifacts, root);
    expect(generatedArtifactsAreCurrent(output, artifacts, root)).toBe(true);
  });

  it("rejects a destination outside an explicitly supplied base", () => {
    const root = makeTempDirectory("navspec-security-");
    const base = join(root, "base");
    mkdirSync(base);
    const outside = join(root, "outside");
    expect(() =>
      materializeGeneratedArtifacts(outside, artifacts, base),
    ).toThrow(/must stay below/);
    expect(existsSync(outside)).toBe(false);
  });

  it("CLI refuses linked parents before writing", () => {
    const root = makeTempDirectory("navspec-security-");
    const project = join(root, "project");
    mkdirSync(project);
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(project, "link"));
    writeFileSync(join(project, "nav.yaml"), "root:\n");
    writeFileSync(join(project, "navspec.config.yaml"), config("link/out"));
    const result = spawnSync(process.execPath, [cli, "generate"], {
      cwd: project,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("symbolic link");
    expect(readdirSync(outside)).toEqual([]);
  });
});
