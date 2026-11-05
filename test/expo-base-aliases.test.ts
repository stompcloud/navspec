import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import { compileNavigation } from "../src/compiler.js";
import { initializeExpoRouterProject } from "../src/expo-project.js";
import { generateExpoRouter } from "../src/expo-router-generator.js";
import {
  generatedArtifactsAreCurrent,
  materializeGeneratedArtifacts,
} from "../src/generated-output.js";
import { cleanupTempDirectories, makeTempDirectory } from "./temp-directory.js";

afterEach(cleanupTempDirectories);

const cli = resolve("dist/cli.js");

function linkDirectory(target: string, link: string): void {
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}

function projectWithAlias() {
  const root = realpathSync(makeTempDirectory("navspec-base-alias-"));
  const project = join(root, "project");
  mkdirSync(join(project, "src", "app"), { recursive: true });
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({
      main: "expo-router/entry",
      dependencies: { expo: "~57.0.0", "expo-router": "~57.0.0" },
    }),
  );
  writeFileSync(
    join(project, "app.json"),
    JSON.stringify({ expo: { plugins: ["expo-router"] } }),
  );
  writeFileSync(join(project, "tsconfig.json"), "{}");
  writeFileSync(join(project, "nav.yaml"), "root:\n");
  const alias = join(root, "project-alias");
  linkDirectory(project, alias);
  return { root, project, alias };
}

function expectNoScaffolds(project: string): void {
  expect(existsSync(join(project, "src", "app", "settings", "index.tsx"))).toBe(
    false,
  );
  expect(existsSync(join(project, "src", "navspec", "integration.ts"))).toBe(
    false,
  );
}

describe("trusted Expo base aliases", () => {
  it.each([
    ["project", "src/navspec"],
    ["config", "src/navspec"],
    ["project", "src/app/settings"],
    ["config", "src/app/settings"],
    ["project", "src/app/SETTINGS"],
    ["config", "src/app/SETTINGS"],
  ])(
    "rejects %s base alias overlap at %s before writing scaffolds",
    (aliasedBase, generatedDirectory) => {
      const { project, alias } = projectWithAlias();
      expect(() =>
        initializeExpoRouterProject(
          aliasedBase === "project" ? alias : project,
          { generatedDirectory, publicPath: "/settings" },
          aliasedBase === "config" ? alias : project,
        ),
      ).toThrow(/must not overlap/u);
      expectNoScaffolds(project);
      expect(readdirSync(join(project, "src", "app"))).toEqual([]);
    },
  );

  it("accepts an explicit route directory through an aliased config base", () => {
    const { project, alias } = projectWithAlias();
    const result = initializeExpoRouterProject(
      project,
      {
        generatedDirectory: "src/Generated/Expo",
        routesDirectory: "src/app/settings",
        publicPath: "/settings",
      },
      alias,
    );
    expect(result.projectDirectory).toBe(project);
    expect(result.routesDirectory).toBe(
      join(project, "src", "app", "settings"),
    );
    expect(result.created).toHaveLength(4);
  });

  it("keeps imports and repeated generation stable across base spellings", () => {
    const { project, alias } = projectWithAlias();
    const config = {
      generatedDirectory: "src/Generated/Expo",
      publicPath: "/settings",
    };
    const first = initializeExpoRouterProject(alias, config, project);
    expect(first.created).toHaveLength(4);
    expect(
      readFileSync(join(first.routesDirectory, "index.tsx"), "utf8"),
    ).toContain('"../../Generated/Expo"');
    expect(readFileSync(first.integrationFile, "utf8")).toContain(
      '"../Generated/Expo"',
    );
    expect(initializeExpoRouterProject(project, config, alias).created).toEqual(
      [],
    );
    const generated = generateExpoRouter(compileNavigation("root:\n").ir!, {
      publicPath: "/settings",
    });
    const output = join(alias, config.generatedDirectory);
    materializeGeneratedArtifacts(output, generated.artifacts, alias);
    expect(
      generatedArtifactsAreCurrent(output, generated.artifacts, alias),
    ).toBe(true);
    const physicalOutput = join(project, config.generatedDirectory);
    materializeGeneratedArtifacts(physicalOutput, generated.artifacts, project);
    expect(
      generatedArtifactsAreCurrent(
        physicalOutput,
        generated.artifacts,
        project,
      ),
    ).toBe(true);
    expect(initializeExpoRouterProject(alias, config, project).created).toEqual(
      [],
    );
  });

  it("preserves older alias-based imports when reinitialization reports a conflict", () => {
    const { project, alias } = projectWithAlias();
    const config = {
      generatedDirectory: "src/Generated/Expo",
      publicPath: "/settings",
    };
    const initialized = initializeExpoRouterProject(project, config);
    const indexFile = join(initialized.routesDirectory, "index.tsx");
    const legacyImport = relative(
      dirname(indexFile),
      join(alias, config.generatedDirectory),
    ).replaceAll("\\", "/");
    const original = readFileSync(indexFile, "utf8").replace(
      '"../../Generated/Expo"',
      JSON.stringify(legacyImport),
    );
    expect(original).toContain("project-alias");
    writeFileSync(indexFile, original);
    const integration = readFileSync(initialized.integrationFile, "utf8");
    expect(() => initializeExpoRouterProject(project, config, alias)).toThrow(
      /application-owned route/u,
    );
    expect(readFileSync(indexFile, "utf8")).toBe(original);
    expect(readFileSync(initialized.integrationFile, "utf8")).toBe(integration);
  });

  it.each([
    ["init-first", "src/navspec"],
    ["generate-first", "src/navspec"],
    ["init-first", "src/app/settings"],
    ["generate-first", "src/app/settings"],
  ])(
    "CLI rejects aliased config overlap (%s, %s) and preserves generated output",
    (order, generatedDirectory) => {
      const { project, alias } = projectWithAlias();
      writeFileSync(
        join(project, "navspec.config.yaml"),
        stringify({
          outputs: {
            "expo-router": { generatedDirectory, publicPath: "/settings" },
          },
        }),
      );
      const run = (command: string) =>
        spawnSync(
          process.execPath,
          [cli, command, "--config", join(alias, "navspec.config.yaml")],
          {
            cwd: project,
            encoding: "utf8",
            timeout: 10000,
          },
        );
      if (order === "generate-first") expect(run("generate").status).toBe(0);
      const init = run("init");
      expect(init.status, init.stderr).toBe(1);
      expect(init.stderr).toMatch(/must not overlap/u);
      expectNoScaffolds(project);
      if (order === "init-first") expect(run("generate").status).toBe(0);
      expect(run("check").status).toBe(0);
    },
  );

  it("CLI initializes and regenerates a valid mixed-case layout through a config alias", () => {
    const { project, alias } = projectWithAlias();
    writeFileSync(
      join(project, "navspec.config.yaml"),
      stringify({
        outputs: {
          "expo-router": {
            generatedDirectory: "src/Generated/Expo",
            routesDirectory: "src/app/settings",
            publicPath: "/settings",
          },
        },
      }),
    );
    const run = (command: string) =>
      spawnSync(
        process.execPath,
        [cli, command, "--config", join(alias, "navspec.config.yaml")],
        { cwd: project, encoding: "utf8", timeout: 10000 },
      );
    for (const command of [
      "init",
      "generate",
      "check",
      "init",
      "generate",
      "check",
    ]) {
      const result = run(command);
      expect(result.status, result.stderr).toBe(0);
    }
    expect(
      readFileSync(
        join(project, "src", "app", "settings", "index.tsx"),
        "utf8",
      ),
    ).toContain('"../../Generated/Expo"');
  });

  it.each(["generated", "route", "integration"])(
    "still rejects a below-base %s symlink when the base has an alias",
    (kind) => {
      const { root, project, alias } = projectWithAlias();
      const outside = join(root, "outside");
      mkdirSync(outside);
      const location =
        kind === "generated"
          ? join(project, "src", "Generated")
          : kind === "route"
            ? join(project, "src", "app", "settings")
            : join(project, "src", "navspec");
      linkDirectory(outside, location);
      expect(() =>
        initializeExpoRouterProject(
          project,
          { generatedDirectory: "src/Generated/Expo", publicPath: "/settings" },
          alias,
        ),
      ).toThrow(/symbolic link/u);
      expectNoScaffolds(project);
      expect(readdirSync(outside)).toEqual([]);
    },
  );

  it("resolves aliases in a trusted base ancestor without accepting overlap", () => {
    const { root, project } = projectWithAlias();
    const ancestorAlias = join(root, "ancestor-alias");
    linkDirectory(root, ancestorAlias);
    expect(() =>
      initializeExpoRouterProject(
        join(ancestorAlias, "project"),
        { generatedDirectory: "src/navspec", publicPath: "/settings" },
        project,
      ),
    ).toThrow(/must not overlap/u);
    expectNoScaffolds(project);
  });

  it("rejects a missing trusted config base before scaffold writes", () => {
    const { root, project } = projectWithAlias();
    expect(() =>
      initializeExpoRouterProject(
        project,
        { generatedDirectory: "src/Generated/Expo", publicPath: "/settings" },
        join(root, "missing"),
      ),
    ).toThrow(/ENOENT/u);
    expectNoScaffolds(project);
  });
});
