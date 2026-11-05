import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertSafeOutputPath,
  outputPathsOverlap,
} from "../src/output-path.js";
import { cleanupTempDirectories, makeTempDirectory } from "./temp-directory.js";

afterEach(cleanupTempDirectories);

describe("portable output collisions", () => {
  it.each([
    ["src/app/SETTINGS", "src/app/settings"],
    ["src/APP", "src/app/settings"],
    ["src/app/settings/generated", "SRC/APP/SETTINGS"],
    [".//src/./app//SETTINGS/", "src/app/settings"],
    ["src\\app\\SETTINGS", "src/app/settings"],
  ])(
    "rejects equal or nested paths %s and %s regardless of ASCII case",
    (left, right) => {
      expect(outputPathsOverlap(left, right)).toBe(true);
      expect(outputPathsOverlap(right, left)).toBe(true);
    },
  );

  it.each([
    ["src/app/settings-old", "src/app/settings"],
    ["src/Generated/navspec", "src/app/settings"],
    ["src/generated-one", "src/generated-two"],
    ["src/ÄPP", "src/äpp/settings"],
  ])(
    "keeps nonoverlapping path components %s and %s distinct",
    (left, right) => {
      expect(outputPathsOverlap(left, right)).toBe(false);
      expect(outputPathsOverlap(right, left)).toBe(false);
    },
  );
});

describe("output containment", () => {
  it.skipIf(process.platform === "win32")(
    "does not use collision case folding to authorize a sibling base",
    () => {
      const root = makeTempDirectory("navspec-path-containment-");
      const base = join(root, "project");
      const outside = join(root, "PROJECT", "out");
      // Neither sibling needs to exist: POSIX lexical containment must reject
      // this even when the filesystem would resolve the names to one directory.
      expect(() => assertSafeOutputPath(base, outside)).toThrow(
        /must stay below/u,
      );
    },
  );

  it("permits a missing child while rejecting the base and outside siblings", () => {
    const root = makeTempDirectory("navspec-path-containment-");
    const base = join(root, "project");
    expect(() =>
      assertSafeOutputPath(base, join(base, "missing", "out")),
    ).not.toThrow();
    expect(() => assertSafeOutputPath(base, base)).toThrow(/must stay below/u);
    expect(() =>
      assertSafeOutputPath(base, join(root, "outside", "out")),
    ).toThrow(/must stay below/u);
  });
});
