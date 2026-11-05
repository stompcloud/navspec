#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileNavigation } from "./compiler.js";
import {
  defaultConfig,
  defaultExpoRouterOutput,
  parseConfig,
} from "./config.js";
import {
  escapeTerminalText,
  formatDiagnostic,
  formatTerminalJson,
  hasErrors,
} from "./diagnostics.js";
import { generateExpoRouter } from "./expo-router-generator.js";
import { initializeExpoRouterProject } from "./expo-project.js";
import {
  generatedArtifactsAreCurrent,
  materializeGeneratedArtifacts,
} from "./generated-output.js";
import { planNavigationTests } from "./test-planner.js";
import type { NavSpecConfig } from "./types.js";

const usage = `NavSpec 0.1.0

Usage:
  navspec validate [nav.yaml] [--config path] [--root node-id] [--warnings-as-errors]
  navspec inspect [nav.yaml] [--config path] [--root node-id]
  navspec test-plan [nav.yaml] [--config path] [--root node-id]
  navspec init [--config path] [--target expo-router]
  navspec generate [nav.yaml] [--config path] [--root node-id] [--target expo-router]
  navspec check [nav.yaml] [--config path] [--root node-id] [--target expo-router]

Commands:
  validate   Parse and validate a navigation specification.
  inspect    Print the normalized canonical IR as JSON.
  test-plan  Print the framework-neutral navigation test plan as JSON.
  init       Add the stable Expo Router integration scaffold to a project.
  generate   Generate configured target output atomically.
  check      Verify generated output is current without changing files.

When no input is given, NavSpec reads navspec.config.yaml if present, then defaults
to nav.yaml. The configured root defaults to "root".`;

interface CliArguments {
  command: string;
  input?: string;
  configPath?: string;
  root?: string;
  target?: string;
  warningsAsErrors: boolean;
}

function parseArguments(argv: readonly string[]): CliArguments {
  const command = argv[0] ?? "help";
  let input: string | undefined;
  let configPath: string | undefined;
  let root: string | undefined;
  let target: string | undefined;
  let warningsAsErrors = false;

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (
      argument === "--config" ||
      argument === "--root" ||
      argument === "--target"
    ) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${argument} requires a value.`);
      if (argument === "--config") configPath = value;
      else if (argument === "--root") root = value;
      else target = value;
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
    ...(target === undefined ? {} : { target }),
    warningsAsErrors,
  };
}

interface LoadedConfiguration {
  readonly config: NavSpecConfig;
  readonly configPath?: string;
  readonly baseDirectory: string;
}

function readConfiguration(arguments_: CliArguments): LoadedConfiguration {
  const cwd = process.cwd();
  const explicitConfigPath =
    arguments_.configPath === undefined
      ? undefined
      : resolve(cwd, arguments_.configPath);
  const automaticConfigPath = resolve(cwd, "navspec.config.yaml");
  const configPath =
    explicitConfigPath ??
    (existsSync(automaticConfigPath) ? automaticConfigPath : undefined);
  return {
    config:
      configPath === undefined
        ? defaultConfig
        : parseConfig(readFileSync(configPath, "utf8")),
    ...(configPath === undefined ? {} : { configPath }),
    baseDirectory: configPath === undefined ? cwd : dirname(configPath),
  };
}

function readProject(arguments_: CliArguments): {
  source: string;
  sourcePath: string;
  root: string;
  configuration: LoadedConfiguration;
} {
  const cwd = process.cwd();
  const configuration = readConfiguration(arguments_);
  const { config } = configuration;
  const inputPath =
    arguments_.input === undefined
      ? resolve(configuration.baseDirectory, config.input)
      : resolve(cwd, arguments_.input);
  return {
    source: readFileSync(inputPath, "utf8"),
    sourcePath: relative(cwd, inputPath) || inputPath,
    root: arguments_.root ?? config.root,
    configuration,
  };
}

function executeCli(argv: readonly string[]): number {
  let arguments_: CliArguments;
  try {
    arguments_ = parseArguments(argv);
  } catch (error) {
    process.stderr.write(
      `${escapeTerminalText(error instanceof Error ? error.message : String(error))}\n\n${usage}\n`,
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
  if (
    !new Set([
      "validate",
      "inspect",
      "test-plan",
      "init",
      "generate",
      "check",
    ]).has(arguments_.command)
  ) {
    process.stderr.write(
      `Unknown command "${escapeTerminalText(arguments_.command)}".\n\n${usage}\n`,
    );
    return 2;
  }

  if (arguments_.target !== undefined && arguments_.target !== "expo-router") {
    process.stderr.write(
      `Unsupported target "${escapeTerminalText(arguments_.target)}". Supported target: expo-router.\n`,
    );
    return 2;
  }

  if (arguments_.command === "init") {
    try {
      const configuration = readConfiguration(arguments_);
      const expo =
        configuration.config.outputs.expoRouter ?? defaultExpoRouterOutput;
      const initialized = initializeExpoRouterProject(
        process.cwd(),
        expo,
        configuration.baseDirectory,
      );
      for (const warning of initialized.warnings) {
        process.stderr.write(
          `WARNING EXPO101: ${escapeTerminalText(warning)}\n`,
        );
      }
      const created = initialized.created.length;
      process.stdout.write(
        `Initialized Expo Router mount ${expo.publicPath}: ${created} file${created === 1 ? "" : "s"} created.\n`,
      );
      process.stdout.write(
        `Link or push to ${expo.publicPath} from application-owned navigation.\n`,
      );
      return 0;
    } catch (error) {
      process.stderr.write(
        `${escapeTerminalText(error instanceof Error ? error.message : String(error))}\n`,
      );
      return 1;
    }
  }

  let project: ReturnType<typeof readProject>;
  try {
    project = readProject(arguments_);
  } catch (error) {
    process.stderr.write(
      `${escapeTerminalText(error instanceof Error ? error.message : String(error))}\n`,
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

  if (arguments_.command === "generate" || arguments_.command === "check") {
    const expo =
      project.configuration.config.outputs.expoRouter ??
      defaultExpoRouterOutput;
    const generated = generateExpoRouter(result.ir, {
      publicPath: expo.publicPath,
      sourcePath: project.sourcePath,
      sourceHash: createHash("sha256").update(project.source).digest("hex"),
    });
    if (generated.diagnostics.length > 0) {
      process.stderr.write(
        `${generated.diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join("\n\n")}\n`,
      );
    }
    if (hasErrors(generated.diagnostics)) return 1;
    const outputDirectory = resolve(
      project.configuration.baseDirectory,
      expo.generatedDirectory,
    );
    try {
      if (arguments_.command === "check") {
        if (
          !generatedArtifactsAreCurrent(
            outputDirectory,
            generated.artifacts,
            project.configuration.baseDirectory,
          )
        ) {
          process.stderr.write(
            `Generated Expo Router output is missing or stale at "${escapeTerminalText(relative(process.cwd(), outputDirectory))}".\n`,
          );
          return 1;
        }
        process.stdout.write("Generated Expo Router output is current.\n");
        return 0;
      }
      materializeGeneratedArtifacts(
        outputDirectory,
        generated.artifacts,
        project.configuration.baseDirectory,
      );
    } catch (error) {
      process.stderr.write(
        `${escapeTerminalText(error instanceof Error ? error.message : String(error))}\n`,
      );
      return 1;
    }
    process.stdout.write(
      `Generated ${generated.artifacts.length} Expo Router artifacts in "${escapeTerminalText(relative(process.cwd(), outputDirectory))}".\n`,
    );
    return 0;
  }

  if (arguments_.command === "inspect") {
    process.stdout.write(`${formatTerminalJson(result.ir)}\n`);
  } else if (arguments_.command === "test-plan") {
    process.stdout.write(
      `${formatTerminalJson(planNavigationTests(result.ir))}\n`,
    );
  } else {
    const nodeCount = result.ir.nodes.length;
    process.stdout.write(
      `Valid NavSpec: ${nodeCount} node${nodeCount === 1 ? "" : "s"}, root "${result.ir.root}".\n`,
    );
  }
  return 0;
}

export function runCli(argv: readonly string[]): number {
  try {
    return executeCli(argv);
  } catch (error) {
    process.stderr.write(
      `${escapeTerminalText(error instanceof Error ? error.message : String(error))}\n`,
    );
    return 1;
  }
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }

  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = runCli(process.argv.slice(2));
}
