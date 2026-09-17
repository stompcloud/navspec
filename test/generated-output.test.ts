import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  generatedArtifactsAreCurrent,
  materializeGeneratedArtifacts,
} from "../src/generated-output.js";
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

describe("generated output", () => {
  it("materializes and checks a complete generated tree", () => {
    const root = makeTempDirectory("navspec-output-");
    const output = join(root, "generated");
    materializeGeneratedArtifacts(output, artifacts);
    expect(generatedArtifactsAreCurrent(output, artifacts)).toBe(true);
    writeFileSync(join(output, "index.ts"), "stale\n");
    expect(generatedArtifactsAreCurrent(output, artifacts)).toBe(false);
    materializeGeneratedArtifacts(output, artifacts);
    expect(readFileSync(join(output, "index.ts"), "utf8")).toBe("export {};\n");
  });

  it("refuses to replace an unowned directory", () => {
    const root = makeTempDirectory("navspec-output-");
    const output = join(root, "generated");
    mkdirSync(output);
    writeFileSync(join(output, "user.ts"), "keep me\n");
    expect(() => materializeGeneratedArtifacts(output, artifacts)).toThrow(
      /unowned/u,
    );
    expect(readFileSync(join(output, "user.ts"), "utf8")).toBe("keep me\n");
  });

  it("preserves output when staging fails and refuses unmanifested files", () => {
    const root = makeTempDirectory("navspec-output-");
    const output = join(root, "generated");
    materializeGeneratedArtifacts(output, artifacts);
    expect(() =>
      materializeGeneratedArtifacts(output, [
        ...artifacts,
        { path: "../escape.ts", contents: "bad\n", ownership: "generated" },
      ]),
    ).toThrow(/safe relative path/u);
    expect(readFileSync(join(output, "index.ts"), "utf8")).toBe("export {};\n");

    writeFileSync(join(output, "user.ts"), "keep\n");
    expect(() => materializeGeneratedArtifacts(output, artifacts)).toThrow(
      /not proven/u,
    );
    expect(readFileSync(join(output, "user.ts"), "utf8")).toBe("keep\n");
  });
});
