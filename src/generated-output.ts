import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import { assertSafeOutputPath } from "./output-path.js";
import type { GeneratedArtifact } from "./types.js";

function validateArtifactPath(path: string): void {
  if (
    path === "" ||
    path.startsWith("/") ||
    path.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(
      `Generated artifact path "${path}" is not a safe relative path.`,
    );
  }
}

function filesBelow(directory: string, prefix = ""): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(
        `Refusing generated output containing symbolic link "${join(directory, entry.name)}".`,
      );
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory())
      result.push(...filesBelow(join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}

function assertOwnedOutput(directory: string): void {
  const files = filesBelow(directory);
  if (files.length === 0) return;
  const manifestPath = join(directory, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Refusing to replace unowned output directory "${directory}" because it has no NavSpec manifest.`,
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new Error(
      `Refusing to replace output with an unreadable manifest at "${manifestPath}".`,
    );
  }
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("target" in manifest) ||
    manifest.target !== "expo-router"
  ) {
    throw new Error(
      `Refusing to replace output not owned by the Expo Router target at "${directory}".`,
    );
  }
  const owned =
    "artifacts" in manifest &&
    Array.isArray(manifest.artifacts) &&
    manifest.artifacts.every((path) => typeof path === "string")
      ? new Set(manifest.artifacts)
      : undefined;
  if (owned === undefined || files.some((path) => !owned.has(path))) {
    throw new Error(
      `Refusing to remove files not proven to be NavSpec-owned in "${directory}".`,
    );
  }
}

function assertGeneratedManifest(
  artifacts: readonly GeneratedArtifact[],
): void {
  const paths = artifacts.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Generated artifacts contain duplicate paths.");
  }
  const manifest = artifacts.find(({ path }) => path === "manifest.json");
  if (manifest === undefined) {
    throw new Error("Generated Expo Router output must include manifest.json.");
  }
  let value: unknown;
  try {
    value = JSON.parse(manifest.contents);
  } catch {
    throw new Error("Generated Expo Router manifest is not valid JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("target" in value) ||
    value.target !== "expo-router"
  ) {
    throw new Error(
      "Generated manifest does not identify the Expo Router target.",
    );
  }
}

function writeArtifacts(
  directory: string,
  artifacts: readonly GeneratedArtifact[],
): void {
  for (const artifact of artifacts) {
    validateArtifactPath(artifact.path);
    const destination = resolve(directory, artifact.path);
    if (!destination.startsWith(`${resolve(directory)}${sep}`)) {
      throw new Error(
        `Generated artifact "${artifact.path}" escapes its output directory.`,
      );
    }
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, artifact.contents, "utf8");
  }
}

export function materializeGeneratedArtifacts(
  directory: string,
  artifacts: readonly GeneratedArtifact[],
  baseDirectory = process.cwd(),
): void {
  assertSafeOutputPath(baseDirectory, directory);
  assertGeneratedManifest(artifacts);
  const output = resolve(directory);
  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  assertOwnedOutput(output);
  const staging = mkdtempSync(
    join(parent, `.${basename(output)}.navspec-stage-`),
  );
  let backup: string | undefined;
  try {
    writeArtifacts(staging, artifacts);
    if (existsSync(output)) {
      backup = mkdtempSync(
        join(parent, `.${basename(output)}.navspec-backup-`),
      );
      rmSync(backup, { recursive: true });
      renameSync(output, backup);
    }
    try {
      renameSync(staging, output);
    } catch (error) {
      if (backup !== undefined && existsSync(backup))
        renameSync(backup, output);
      throw error;
    }
    if (backup !== undefined) rmSync(backup, { recursive: true, force: true });
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

export function generatedArtifactsAreCurrent(
  directory: string,
  artifacts: readonly GeneratedArtifact[],
  baseDirectory = process.cwd(),
): boolean {
  assertSafeOutputPath(baseDirectory, directory);
  const expected = [...artifacts].sort((a, b) => a.path.localeCompare(b.path));
  const actualFiles = filesBelow(resolve(directory));
  if (actualFiles.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const artifact = expected[index]!;
    if (actualFiles[index] !== artifact.path) return false;
    if (
      readFileSync(resolve(directory, artifact.path), "utf8") !==
      artifact.contents
    ) {
      return false;
    }
  }
  return true;
}
