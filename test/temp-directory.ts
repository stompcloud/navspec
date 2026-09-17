import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectories = new Set<string>();

export function makeTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.add(directory);
  return directory;
}

export function cleanupTempDirectories(): void {
  const failures: unknown[] = [];
  for (const directory of temporaryDirectories) {
    try {
      rmSync(directory, { force: true, recursive: true });
    } catch (error) {
      failures.push(error);
    } finally {
      temporaryDirectories.delete(directory);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Failed to remove test temporary directories.",
    );
  }
}
