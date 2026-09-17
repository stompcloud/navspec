import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDirectories, makeTempDirectory } from "./temp-directory.js";

const cli = resolve("dist/cli.js");

function project(files: Record<string, string>): string {
  const directory = makeTempDirectory("navspec-test-");
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(join(directory, name, ".."), { recursive: true });
    writeFileSync(join(directory, name), contents);
  }
  return directory;
}

afterEach(cleanupTempDirectories);

describe("CLI", () => {
  it("runs through an npm-style executable symlink", () => {
    const cwd = project({
      "nav.yaml": "root:\n  items: [account]\naccount:\n",
    });
    const executable = join(cwd, "node_modules", ".bin", "navspec");
    mkdirSync(join(executable, ".."), { recursive: true });
    symlinkSync(cli, executable);

    expect(
      execFileSync(process.execPath, [executable, "validate"], {
        cwd,
        encoding: "utf8",
      }),
    ).toBe('Valid NavSpec: 2 nodes, root "root".\n');
  });

  it("validates the default nav.yaml non-interactively", () => {
    const cwd = project({
      "nav.yaml": "root:\n  items: [account]\naccount:\n",
    });
    expect(
      execFileSync(process.execPath, [cli, "validate"], {
        cwd,
        encoding: "utf8",
      }),
    ).toBe('Valid NavSpec: 2 nodes, root "root".\n');
  });

  it("loads input and root relative to the config file", () => {
    const cwd = project({
      "navspec.config.yaml": "input: navigation.yaml\nroot: home\n",
      "navigation.yaml": "home:\n",
    });
    expect(
      execFileSync(process.execPath, [cli, "validate"], {
        cwd,
        encoding: "utf8",
      }),
    ).toContain('root "home"');
  });

  it("returns failure for errors and optionally for warnings", () => {
    const invalid = project({ "nav.yaml": "root:\n  items: [missing]\n" });
    const invalidResult = spawnSync(process.execPath, [cli, "validate"], {
      cwd: invalid,
      encoding: "utf8",
    });
    expect(invalidResult.status).toBe(1);
    expect(invalidResult.stderr).toContain("ERROR NAV003");

    const warning = project({ "nav.yaml": "root:\norphan:\n" });
    const warningResult = spawnSync(
      process.execPath,
      [cli, "validate", "--warnings-as-errors"],
      {
        cwd: warning,
        encoding: "utf8",
      },
    );
    expect(warningResult.status).toBe(1);
    expect(warningResult.stderr).toContain("WARNING NAV101");
  });

  it("prints deterministic canonical IR and test plans", () => {
    const cwd = project({
      "nav.yaml": "root:\n  items: [save]\nsave:\n  type: action\n",
    });
    const first = execFileSync(process.execPath, [cli, "inspect"], {
      cwd,
      encoding: "utf8",
    });
    const second = execFileSync(process.execPath, [cli, "inspect"], {
      cwd,
      encoding: "utf8",
    });
    expect(first).toBe(second);
    expect(JSON.parse(first)).toMatchObject({ version: 1, root: "root" });

    const plan = JSON.parse(
      execFileSync(process.execPath, [cli, "test-plan"], {
        cwd,
        encoding: "utf8",
      }),
    );
    expect(plan.edgeCases[0]).toMatchObject({
      intent: "invoke-action",
      target: "save",
    });
  });

  it("generates and checks Expo Router output", () => {
    const cwd = project({
      "nav.yaml": "root:\n  items: [account]\naccount:\n",
      "navspec.config.yaml": `outputs:
  expo-router:
    generatedDirectory: generated/expo
    publicPath: /settings
`,
    });
    expect(
      execFileSync(
        process.execPath,
        [cli, "generate", "--target", "expo-router"],
        {
          cwd,
          encoding: "utf8",
        },
      ),
    ).toContain("Generated 8 Expo Router artifacts");
    expect(
      execFileSync(
        process.execPath,
        [cli, "check", "--target", "expo-router"],
        {
          cwd,
          encoding: "utf8",
        },
      ),
    ).toBe("Generated Expo Router output is current.\n");

    writeFileSync(join(cwd, "generated", "expo", "model.ts"), "stale\n");
    const stale = spawnSync(
      process.execPath,
      [cli, "check", "--target", "expo-router"],
      { cwd, encoding: "utf8" },
    );
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain("missing or stale");
  });

  it("initializes a compatible Expo Router project without rewriting it", () => {
    const cwd = project({
      "package.json": JSON.stringify({
        main: "expo-router/entry",
        dependencies: { expo: "~57.0.0", "expo-router": "~57.0.0" },
      }),
      "app.json": JSON.stringify({ expo: { plugins: ["expo-router"] } }),
      "tsconfig.json": JSON.stringify({ extends: "expo/tsconfig.base" }),
      "src/app/index.tsx": "export default function Home() { return null; }\n",
      "navspec.config.yaml": `outputs:
  expo-router:
    generatedDirectory: src/generated/navspec/expo
    publicPath: /settings
`,
    });
    const output = execFileSync(
      process.execPath,
      [cli, "init", "--target", "expo-router"],
      { cwd, encoding: "utf8" },
    );
    expect(output).toContain("4 files created");
    expect(existsSync(join(cwd, "src", "app", "settings", "index.tsx"))).toBe(
      true,
    );
    expect(
      readFileSync(join(cwd, "src", "app", "index.tsx"), "utf8"),
    ).toContain("function Home");
    expect(
      execFileSync(process.execPath, [cli, "init", "--target", "expo-router"], {
        cwd,
        encoding: "utf8",
      }),
    ).toContain("0 files created");
  });
});
