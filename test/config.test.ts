import { describe, expect, it } from "vitest";

import { defaultConfig, parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("applies deterministic defaults", () => {
    expect(parseConfig("")).toEqual(defaultConfig);
    expect(parseConfig("root: home\n")).toEqual({
      input: "nav.yaml",
      root: "home",
    });
  });

  it("rejects unknown or invalid configuration", () => {
    expect(() => parseConfig("outputs: {}\n")).toThrow(/Unknown/);
    expect(() => parseConfig("root: []\n")).toThrow(/non-empty string/);
  });
});
