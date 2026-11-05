import { lstatSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep } from "node:path";

export function normalizeOutputPath(value: string, property: string): string {
  const path = value.replaceAll("\\", "/");
  const normalized = posix.normalize(path);
  if (
    path.startsWith("/") ||
    /^[A-Za-z]:/u.test(normalized) ||
    path.split("/").includes("..") ||
    path.includes("\0")
  ) {
    throw new Error(
      `${property} must be a relative path without ".." segments.`,
    );
  }
  if (normalized === ".")
    throw new Error(`${property} must not resolve to the project root.`);
  return normalized.replace(/\/$/u, "");
}

// Portable collision policy only; never use case folding to authorize writes.
// Fold ASCII explicitly so the rule is independent of locale and filesystem.
export function outputPathsOverlap(left: string, right: string): boolean {
  const segments = (value: string): string[] => {
    const normalized = posix.normalize(value.replaceAll("\\", "/"));
    if (normalized === ".") return [];
    return normalized
      .replace(/[A-Z]/gu, (letter) => letter.toLowerCase())
      .replace(/\/$/u, "")
      .split("/");
  };
  const leftSegments = segments(left);
  const rightSegments = segments(right);
  const sharedLength = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftSegments[index] !== rightSegments[index]) return false;
  }
  return true;
}

// The caller supplies the trusted base. Symlinks in that base's own ancestry
// (e.g. the system temp directory) are allowed; links below it are not.
export function assertSafeOutputPath(
  baseDirectory: string,
  destination: string,
): void {
  const base = resolve(baseDirectory);
  const path = resolve(destination);
  const suffix = relative(base, path);
  if (
    suffix === "" ||
    suffix === ".." ||
    suffix.startsWith(`..${sep}`) ||
    isAbsolute(suffix)
  ) {
    throw new Error(`Output path "${path}" must stay below "${base}".`);
  }
  let current = base;
  for (const segment of suffix.split(sep)) {
    current = join(current, segment);
    let entry;
    try {
      entry = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
    if (entry.isSymbolicLink())
      throw new Error(`Refusing output through symbolic link "${current}".`);
  }
}
