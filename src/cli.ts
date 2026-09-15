#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { compileNavigation } from "./compiler.js";
import { defaultConfig, parseConfig } from "./config.js";
import { formatDiagnostic, hasErrors } from "./diagnostics.js";
import { planNavigationTests } from "./test-planner.js";

const usage = `NavSpec 0.1.0

Usage:
  navspec validate [nav.yaml] [--config path] [--root node-id] [--warnings-as-errors]
  navspec inspect [nav.yaml] [--config path] [--root node-id]
  navspec test-plan [nav.yaml] [--config path] [--root node-id]

Commands:
  validate   Parse and validate a navigation specification.
  inspect    Print the normalized canonical IR as JSON.
  test-plan  Print the framework-neutral navigation test plan as JSON.

When no input is given, NavSpec reads navspec.config.yaml if present, then defaults
to nav.yaml. The configured root defaults to "root".`;

interface CliArguments {
  command: string;
  input?: string;
  configPath?: string;
  root?: string;
  warningsAsErrors: boolean;
}

function parseArguments(argv: readonly string[]): CliArguments {
  const command = argv[0] ?? "help";
  let input: string | undefined;
  let configPath: string | undefined;
  let root: string | undefined;
  let warningsAsErrors = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--config" || argument === "--root") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${argument} requires a value.`);
      if (argument === "--config") configPath = value;
      else root = value;
      index += 1;
    } else if (argument === "--warnings-as-errors") {
      warningsAsErrors = true;
    } else if (argument === "--help" || argument === "-h") {
      return { command: "help", warningsAsErrors: false };
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option "${argument}".`);
    } else if (input === undefined) {
      input = argument;
    } else {
      throw new Error(`Unexpected argument "${argument}".`);
    }
  }
  return {
    command,
    ...(input === undefined ? {} : { input }),
    ...(configPath === undefined ? {} : { configPath }),
    ...(root === undefined ? {} : { root }),
    warningsAsErrors,
  };
}

function readProject(arguments_: CliArguments): {
  source: string;
  sourcePath: string;
  root: string;
} {
  const cwd = process.cwd();
  const explicitConfigPath =
    arguments_.configPath === undefined
      ? undefined
      : resolve(cwd, arguments_.configPath);
  const automaticConfigPath = resolve(cwd, "navspec.config.yaml");
  const configPath =
    explicitConfigPath ??
    (existsSync(automaticConfigPath) ? automaticConfigPath : undefined);
  const config =
    configPath === undefined
      ? defaultConfig
      : parseConfig(readFileSync(configPath, "utf8"));
  const inputPath =
    arguments_.input === undefined
      ? resolve(
          configPath === undefined ? cwd : dirname(configPath),
          config.input,
        )
      : resolve(cwd, arguments_.input);
  return {
    source: readFileSync(inputPath, "utf8"),
    sourcePath: relative(cwd, inputPath) || inputPath,
    root: arguments_.root ?? config.root,
  };
}

export function runCli(argv: readonly string[]): number {
  let arguments_: CliArguments;
  try {
    arguments_ = parseArguments(argv);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${usage}\n`,
    );
    return 2;
  }

  if (
    arguments_.command === "help" ||
    arguments_.command === "--help" ||
    arguments_.command === "-h"
  ) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  if (!new Set(["validate", "inspect", "test-plan"]).has(arguments_.command)) {
    process.stderr.write(
      `Unknown command "${arguments_.command}".\n\n${usage}\n`,
    );
    return 2;
  }

  let project: ReturnType<typeof readProject>;
  try {
    project = readProject(arguments_);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  const result = compileNavigation(project.source, {
    sourcePath: project.sourcePath,
    root: project.root,
  });
  if (result.diagnostics.length > 0) {
    process.stderr.write(
      `${result.diagnostics.map((diagnostic) => formatDiagnostic(diagnostic, project.source)).join("\n\n")}\n`,
    );
  }
  const failed =
    hasErrors(result.diagnostics) ||
    (arguments_.warningsAsErrors &&
      result.diagnostics.some(
        (diagnostic) => diagnostic.severity === "warning",
      ));
  if (failed || result.ir === undefined) return 1;

  if (arguments_.command === "inspect") {
    process.stdout.write(`${JSON.stringify(result.ir, null, 2)}\n`);
  } else if (arguments_.command === "test-plan") {
    process.stdout.write(
      `${JSON.stringify(planNavigationTests(result.ir), null, 2)}\n`,
    );
  } else {
    const nodeCount = result.ir.nodes.length;
    process.stdout.write(
      `Valid NavSpec: ${nodeCount} node${nodeCount === 1 ? "" : "s"}, root "${result.ir.root}".\n`,
    );
  }
  return 0;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runCli(process.argv.slice(2));
}
