import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cli = resolve("dist/cli.js");

function project(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "navspec-test-"));
  for (const [name, contents] of Object.entries(files))
    writeFileSync(join(directory, name), contents);
  return directory;
}

describe("CLI", () => {
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
});
