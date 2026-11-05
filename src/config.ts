import { isMap, isScalar, parseDocument } from "yaml";

import { normalizeOutputPath } from "./output-path.js";

import type {
  ExpoRouterOutputConfig,
  NavSpecConfig,
  NavSpecOutputsConfig,
} from "./types.js";

export const defaultExpoRouterOutput: ExpoRouterOutputConfig = {
  generatedDirectory: "src/generated/navspec/expo",
  publicPath: "/navspec",
};

export const defaultConfig: NavSpecConfig = {
  input: "nav.yaml",
  root: "root",
  outputs: {},
};

function mappingValue(value: unknown, context: string): Map<string, unknown> {
  if (!isMap(value)) throw new Error(`${context} must be a mapping.`);
  const values = new Map<string, unknown>();
  for (const pair of value.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      throw new Error(`${context} keys must be strings.`);
    }
    values.set(pair.key.value, pair.value);
  }
  return values;
}

function scalarString(value: unknown, property: string): string | undefined {
  if (value === undefined) return undefined;
  if (
    !isScalar(value) ||
    typeof value.value !== "string" ||
    value.value === ""
  ) {
    throw new Error(`${property} must be a non-empty string.`);
  }
  return value.value;
}

function publicPath(value: string): string {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new Error(
      "outputs.expo-router.publicPath must be an absolute URL path without a query or fragment.",
    );
  }
  const normalized = value === "/" ? value : value.replace(/\/$/u, "");
  const segments = normalized.split("/").slice(1);
  if (
    segments.some((segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(segment))
  ) {
    throw new Error(
      "outputs.expo-router.publicPath must contain only static kebab-case segments.",
    );
  }
  return normalized;
}

function parseExpoRouterOutput(value: unknown): ExpoRouterOutputConfig {
  const values = mappingValue(value, "outputs.expo-router");
  const allowed = new Set([
    "generatedDirectory",
    "routesDirectory",
    "publicPath",
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) {
      throw new Error(
        `Unknown outputs.expo-router configuration property "${key}".`,
      );
    }
  }
  const generatedDirectory = normalizeOutputPath(
    scalarString(
      values.get("generatedDirectory"),
      "outputs.expo-router.generatedDirectory",
    ) ?? defaultExpoRouterOutput.generatedDirectory,
    "outputs.expo-router.generatedDirectory",
  );
  if (generatedDirectory === "") {
    throw new Error(
      "outputs.expo-router.generatedDirectory must not resolve to the project root.",
    );
  }
  const routesValue = scalarString(
    values.get("routesDirectory"),
    "outputs.expo-router.routesDirectory",
  );
  const routesDirectory =
    routesValue === undefined
      ? undefined
      : normalizeOutputPath(routesValue, "outputs.expo-router.routesDirectory");
  if (routesDirectory === "") {
    throw new Error(
      "outputs.expo-router.routesDirectory must not resolve to the project root.",
    );
  }
  const configuredPublicPath = scalarString(
    values.get("publicPath"),
    "outputs.expo-router.publicPath",
  );
  const result: ExpoRouterOutputConfig = {
    generatedDirectory,
    ...(routesDirectory === undefined ? {} : { routesDirectory }),
    publicPath: publicPath(
      configuredPublicPath ?? defaultExpoRouterOutput.publicPath,
    ),
  };
  if (
    routesDirectory !== undefined &&
    (routesDirectory === generatedDirectory ||
      routesDirectory.startsWith(`${generatedDirectory}/`) ||
      generatedDirectory.startsWith(`${routesDirectory}/`))
  ) {
    throw new Error(
      "outputs.expo-router generatedDirectory and routesDirectory must not overlap.",
    );
  }
  return result;
}

function parseOutputs(value: unknown): NavSpecOutputsConfig {
  if (value === undefined) return {};
  const values = mappingValue(value, "outputs");
  for (const key of values.keys()) {
    if (key !== "expo-router") {
      throw new Error(`Unknown outputs configuration target "${key}".`);
    }
  }
  const expoRouter = values.get("expo-router");
  return expoRouter === undefined
    ? {}
    : { expoRouter: parseExpoRouterOutput(expoRouter) };
}

export function parseConfig(source: string): NavSpecConfig {
  const document = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(
      `Invalid NavSpec configuration: ${document.errors[0]!.message}`,
    );
  }
  if (document.contents === null) return defaultConfig;
  if (!isMap(document.contents))
    throw new Error("NavSpec configuration must be a mapping.");

  const values = new Map<string, unknown>();
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      throw new Error("NavSpec configuration keys must be strings.");
    }
    if (
      pair.key.value !== "input" &&
      pair.key.value !== "root" &&
      pair.key.value !== "outputs"
    ) {
      throw new Error(
        `Unknown NavSpec configuration property "${pair.key.value}".`,
      );
    }
    values.set(
      pair.key.value,
      pair.key.value === "outputs"
        ? pair.value
        : isScalar(pair.value)
          ? pair.value.value
          : undefined,
    );
  }

  const input = values.has("input") ? values.get("input") : defaultConfig.input;
  const root = values.has("root") ? values.get("root") : defaultConfig.root;
  if (typeof input !== "string" || input.length === 0) {
    throw new Error(
      'NavSpec configuration property "input" must be a non-empty string.',
    );
  }
  if (typeof root !== "string" || root.length === 0) {
    throw new Error(
      'NavSpec configuration property "root" must be a non-empty string.',
    );
  }
  return {
    input,
    root,
    outputs: parseOutputs(values.get("outputs")),
  };
}
