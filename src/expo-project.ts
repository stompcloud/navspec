import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

import type { ExpoRouterOutputConfig } from "./types.js";

export interface ExpoProjectInspection {
  readonly projectDirectory: string;
  readonly routeRoot: string;
  readonly expoVersion: string;
  readonly expoRouterVersion: string;
  readonly warnings: readonly string[];
}

export interface ExpoInitializationResult extends ExpoProjectInspection {
  readonly routesDirectory: string;
  readonly integrationFile: string;
  readonly created: readonly string[];
}

interface PackageJson {
  readonly main?: unknown;
  readonly dependencies?: Readonly<Record<string, unknown>>;
  readonly devDependencies?: Readonly<Record<string, unknown>>;
}

function dependency(
  packageJson: PackageJson,
  name: string,
): string | undefined {
  const value =
    packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
  return typeof value === "string" ? value : undefined;
}

function hasRouterPlugin(value: unknown): boolean {
  if (typeof value === "string") return value === "expo-router";
  return Array.isArray(value) && value[0] === "expo-router";
}

function inspectAppConfig(projectDirectory: string): string[] {
  const dynamic = ["app.config.js", "app.config.ts"].find((name) =>
    existsSync(join(projectDirectory, name)),
  );
  if (dynamic !== undefined) {
    return [
      `NavSpec did not evaluate ${dynamic}; verify that the Expo config includes the expo-router plugin.`,
    ];
  }
  const appJsonPath = join(projectDirectory, "app.json");
  if (!existsSync(appJsonPath)) {
    return [
      "No app.json was found; verify that the Expo config includes the expo-router plugin.",
    ];
  }
  let contents: unknown;
  try {
    contents = JSON.parse(readFileSync(appJsonPath, "utf8"));
  } catch {
    throw new Error(`Cannot parse Expo app configuration at "${appJsonPath}".`);
  }
  const expo =
    typeof contents === "object" && contents !== null && "expo" in contents
      ? contents.expo
      : undefined;
  const plugins =
    typeof expo === "object" && expo !== null && "plugins" in expo
      ? expo.plugins
      : undefined;
  if (!Array.isArray(plugins) || !plugins.some(hasRouterPlugin)) {
    throw new Error(
      'Expo app configuration must include "expo-router" in expo.plugins before NavSpec initialization.',
    );
  }
  return [];
}

export function inspectExpoProject(
  projectDirectory: string,
): ExpoProjectInspection {
  const project = resolve(projectDirectory);
  const packagePath = join(project, "package.json");
  if (!existsSync(packagePath))
    throw new Error(`No package.json found in "${project}".`);
  let packageJson: PackageJson;
  try {
    packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
  } catch {
    throw new Error(`Cannot parse package.json in "${project}".`);
  }
  const expoVersion = dependency(packageJson, "expo");
  if (expoVersion === undefined)
    throw new Error("The project does not declare an Expo dependency.");
  const expoRouterVersion = dependency(packageJson, "expo-router");
  if (expoRouterVersion === undefined) {
    throw new Error(
      "The project does not declare expo-router. Install it with the SDK-compatible `npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar` command, then rerun init.",
    );
  }
  const warnings = inspectAppConfig(project);
  if (packageJson.main !== "expo-router/entry") {
    if (typeof packageJson.main !== "string") {
      throw new Error(
        'package.json "main" must be "expo-router/entry" or a custom entry file that imports it.',
      );
    }
    const customEntry = resolve(project, packageJson.main);
    if (
      !existsSync(customEntry) ||
      !/["']expo-router\/entry["']/u.test(readFileSync(customEntry, "utf8"))
    ) {
      throw new Error(
        `Custom entry "${packageJson.main}" must import "expo-router/entry" before NavSpec initialization.`,
      );
    }
    warnings.push(
      `Using custom Expo Router entry "${packageJson.main}"; NavSpec left it unchanged.`,
    );
  }
  if (!existsSync(join(project, "tsconfig.json"))) {
    throw new Error(
      "The Expo Router target generates TypeScript and requires a project tsconfig.json.",
    );
  }
  const srcApp = join(project, "src", "app");
  const app = join(project, "app");
  if (existsSync(srcApp) && existsSync(app)) {
    throw new Error(
      'Both "src/app" and "app" exist; NavSpec cannot choose a route root safely.',
    );
  }
  const routeRoot = existsSync(srcApp)
    ? srcApp
    : existsSync(app)
      ? app
      : srcApp;
  return {
    projectDirectory: project,
    routeRoot,
    expoVersion,
    expoRouterVersion,
    warnings,
  };
}

function moduleSpecifier(fromFile: string, target: string): string {
  let value = relative(dirname(fromFile), target).replaceAll("\\", "/");
  if (!value.startsWith(".")) value = `./${value}`;
  return value;
}

function routeScaffolds(
  routesDirectory: string,
  generatedDirectory: string,
  integrationFile: string,
): Readonly<Record<string, string>> {
  const layout = join(routesDirectory, "_layout.tsx");
  const index = join(routesDirectory, "index.tsx");
  const dynamic = join(routesDirectory, "[node-id].tsx");
  const generatedFromLayout = moduleSpecifier(layout, generatedDirectory);
  const integrationFromLayout = moduleSpecifier(
    layout,
    integrationFile.replace(/\.tsx?$/u, ""),
  );
  const generatedFromIndex = moduleSpecifier(index, generatedDirectory);
  const generatedFromDynamic = moduleSpecifier(dynamic, generatedDirectory);
  return {
    "_layout.tsx": `import { Stack } from "expo-router";

import { NavSpecProvider } from ${JSON.stringify(generatedFromLayout)};
import { navSpecIntegration } from ${JSON.stringify(integrationFromLayout)};

export default function NavSpecLayout() {
  return (
    <NavSpecProvider integration={navSpecIntegration}>
      <Stack />
    </NavSpecProvider>
  );
}
`,
    "index.tsx": `import { NavSpecScreen, navSpecRootId } from ${JSON.stringify(generatedFromIndex)};

export default function NavSpecRootRoute() {
  return <NavSpecScreen nodeId={navSpecRootId} />;
}
`,
    "[node-id].tsx": `import { useLocalSearchParams } from "expo-router";

import { NavSpecScreen } from ${JSON.stringify(generatedFromDynamic)};

export default function NavSpecNodeRoute() {
  const params = useLocalSearchParams<{ "node-id"?: string | string[] }>();
  const value = params["node-id"];
  const nodeId = Array.isArray(value) ? value[0] : value;
  return <NavSpecScreen nodeId={nodeId ?? ""} />;
}
`,
  };
}

function integrationScaffold(generatedSpecifier: string): string {
  return `import type { NavSpecIntegration } from ${JSON.stringify(generatedSpecifier)};

export const navSpecIntegration: NavSpecIntegration = {
  label: (_id, fallback) => fallback,
  message: (_id, fallback) => fallback,
  pageComponents: {},
  invokeAction: (id) => {
    throw new Error(\`No NavSpec action handler is registered for "\${id}".\`);
  },
};
`;
}

function routeFileAt(directory: string, segment: string): string | undefined {
  if (!existsSync(directory)) return undefined;
  const escaped = segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(
    `^${escaped}(?:\\.(?:ios|android|native|web))?\\.(?:js|jsx|ts|tsx)$`,
    "u",
  );
  return readdirSync(directory).find((entry) => pattern.test(entry));
}

function overlappingDynamicRoutes(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((entry) =>
    /^\[{1,2}(?:\.\.\.)?[a-zA-Z0-9_-]+\]{1,2}(?:\.(?:ios|android|native|web))?\.(?:js|jsx|ts|tsx)$/u.test(
      entry,
    ),
  );
}

export function initializeExpoRouterProject(
  projectDirectory: string,
  config: ExpoRouterOutputConfig,
  configBaseDirectory = projectDirectory,
): ExpoInitializationResult {
  const inspection = inspectExpoProject(projectDirectory);
  const configBase = resolve(configBaseDirectory);
  const publicSegments = config.publicPath.split("/").filter(Boolean);
  if (publicSegments.length === 0) {
    throw new Error(
      "Mounting NavSpec at the application root is not supported by additive initialization.",
    );
  }
  if (
    publicSegments.some(
      (segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(segment),
    )
  ) {
    throw new Error(
      "The Expo Router public path must contain only static kebab-case segments.",
    );
  }
  const expectedRoutesDirectory = join(inspection.routeRoot, ...publicSegments);
  const routesDirectory =
    config.routesDirectory === undefined
      ? expectedRoutesDirectory
      : resolve(configBase, config.routesDirectory);
  if (routesDirectory !== expectedRoutesDirectory) {
    throw new Error(
      `Configured routesDirectory must map to publicPath ${config.publicPath}; expected "${relative(inspection.projectDirectory, expectedRoutesDirectory)}".`,
    );
  }
  let routeParent = inspection.routeRoot;
  const warnings = [...inspection.warnings];
  for (const segment of publicSegments) {
    const conflict = routeFileAt(routeParent, segment);
    if (conflict !== undefined) {
      throw new Error(
        `Route conflict: "${join(routeParent, conflict)}" overlaps ${config.publicPath}.`,
      );
    }
    for (const dynamicRoute of overlappingDynamicRoutes(routeParent)) {
      warnings.push(
        `Dynamic route "${relative(inspection.projectDirectory, join(routeParent, dynamicRoute))}" overlaps the static NavSpec mount; Expo Router static-route precedence is required.`,
      );
    }
    routeParent = join(routeParent, segment);
  }
  const generatedDirectory = resolve(configBase, config.generatedDirectory);
  const sourceRoot =
    inspection.routeRoot === join(inspection.projectDirectory, "src", "app")
      ? join(inspection.projectDirectory, "src")
      : inspection.projectDirectory;
  const integrationFile = join(sourceRoot, "navspec", "integration.ts");
  const scaffolds = routeScaffolds(
    routesDirectory,
    generatedDirectory,
    integrationFile,
  );
  if (existsSync(routesDirectory)) {
    const existing = readdirSync(routesDirectory, { withFileTypes: true });
    for (const entry of existing) {
      if (!entry.isFile() || !(entry.name in scaffolds)) {
        throw new Error(
          `Refusing to initialize into nonempty unowned route directory "${routesDirectory}".`,
        );
      }
      const expected = scaffolds[entry.name]!;
      if (
        readFileSync(join(routesDirectory, entry.name), "utf8") !== expected
      ) {
        throw new Error(
          `Refusing to overwrite application-owned route "${join(routesDirectory, entry.name)}".`,
        );
      }
    }
  }
  const created: string[] = [];
  mkdirSync(routesDirectory, { recursive: true });
  for (const [name, contents] of Object.entries(scaffolds)) {
    const path = join(routesDirectory, name);
    if (!existsSync(path)) {
      writeFileSync(path, contents, "utf8");
      created.push(relative(inspection.projectDirectory, path));
    }
  }
  if (!existsSync(integrationFile)) {
    mkdirSync(dirname(integrationFile), { recursive: true });
    const generatedSpecifier = moduleSpecifier(
      integrationFile,
      generatedDirectory,
    );
    writeFileSync(
      integrationFile,
      integrationScaffold(generatedSpecifier),
      "utf8",
    );
    created.push(relative(inspection.projectDirectory, integrationFile));
  }
  return {
    ...inspection,
    warnings,
    routesDirectory,
    integrationFile,
    created,
  };
}
