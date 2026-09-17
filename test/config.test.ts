import { describe, expect, it } from "vitest";

import { defaultConfig, parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("applies deterministic defaults", () => {
    expect(parseConfig("")).toEqual(defaultConfig);
    expect(parseConfig("root: home\n")).toEqual({
      input: "nav.yaml",
      root: "home",
      outputs: {},
    });
  });

  it("rejects unknown or invalid configuration", () => {
    expect(parseConfig("outputs: {}\n").outputs).toEqual({});
    expect(() => parseConfig("root: []\n")).toThrow(/non-empty string/);
  });

  it("parses and validates Expo Router output configuration", () => {
    expect(
      parseConfig(`outputs:
  expo-router:
    generatedDirectory: generated/expo
    routesDirectory: src/app/settings
    publicPath: /settings
`),
    ).toMatchObject({
      outputs: {
        expoRouter: {
          generatedDirectory: "generated/expo",
          routesDirectory: "src/app/settings",
          publicPath: "/settings",
        },
      },
    });
    expect(() =>
      parseConfig(
        "outputs:\n  expo-router:\n    generatedDirectory: ../outside\n",
      ),
    ).toThrow(/relative path/u);
    expect(() =>
      parseConfig("outputs:\n  expo-router:\n    publicPath: settings\n"),
    ).toThrow(/absolute URL path/u);
    expect(() => parseConfig("outputs:\n  other: {}\n")).toThrow(
      /Unknown outputs/u,
    );
    expect(() =>
      parseConfig(`outputs:
  expo-router:
    generatedDirectory: src/generated
    routesDirectory: src/generated/routes
`),
    ).toThrow(/must not overlap/u);
  });
});
