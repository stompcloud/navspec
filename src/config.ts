import { isMap, isScalar, parseDocument } from "yaml";

import type { NavSpecConfig } from "./types.js";

export const defaultConfig: NavSpecConfig = { input: "nav.yaml", root: "root" };

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
    if (pair.key.value !== "input" && pair.key.value !== "root") {
      throw new Error(
        `Unknown NavSpec configuration property "${pair.key.value}".`,
      );
    }
    values.set(
      pair.key.value,
      isScalar(pair.value) ? pair.value.value : undefined,
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
  return { input, root };
}
