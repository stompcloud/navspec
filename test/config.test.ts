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

  it.each([
    ["src/app/SETTINGS", "src/app/settings"],
    ["src/APP", "src/app/settings"],
    ["src/app/settings/generated", "SRC/APP/SETTINGS"],
    [".//src/./app//SETTINGS/", "src/app/settings"],
    ["src\\app\\SETTINGS", "src/app/settings"],
  ])(
    "rejects portable output overlap between %s and %s",
    (generatedDirectory, routesDirectory) => {
      expect(() =>
        parseConfig(`outputs:
  expo-router:
    generatedDirectory: ${generatedDirectory}
    routesDirectory: ${routesDirectory}
    publicPath: /settings
`),
      ).toThrow(/must not overlap/u);
    },
  );

  it("preserves mixed-case spelling when normalized directories do not overlap", () => {
    expect(
      parseConfig(`outputs:
  expo-router:
    generatedDirectory: .//src/Generated//expo/
    routesDirectory: src/app/settings
    publicPath: /settings
`).outputs.expoRouter,
    ).toEqual({
      generatedDirectory: "src/Generated/expo",
      routesDirectory: "src/app/settings",
      publicPath: "/settings",
    });
    expect(() =>
      parseConfig(`outputs:
  expo-router:
    generatedDirectory: src/app/settings-old
    routesDirectory: src/app/settings
    publicPath: /settings
`),
    ).not.toThrow();
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
