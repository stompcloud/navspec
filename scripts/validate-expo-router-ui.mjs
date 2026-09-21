#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = dirname(scriptDirectory);
const navSpecCli = join(repositoryDirectory, "dist", "cli.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage: npm run test:expo-ui -- [--no-clean]

Creates and resets an Expo SDK 57 project, mounts generated NavSpec routes,
and verifies Root -> Account -> Email -> back to Account in Chromium.

By default the temporary project is deleted after Metro stops. Pass
--no-clean to retain it for inspection.`);
  process.exit(0);
}

const unknownArgs = args.filter((arg) => arg !== "--no-clean");
if (unknownArgs.length > 0) {
  throw new Error(
    `Unknown argument${unknownArgs.length === 1 ? "" : "s"}: ${unknownArgs.join(", ")}`,
  );
}

const shouldClean = !args.includes("--no-clean");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "navspec-expo-ui-"));
const projectDirectory = join(temporaryDirectory, "app");
let browser;
let expoProcess;
let expoLog = "";

function stage(message) {
  console.log(`\n[expo-ui] ${message}`);
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: [
        options.input === undefined ? "inherit" : "pipe",
        "inherit",
        "inherit",
      ],
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${commandArgs.join(" ")} exited with ${signal === null ? `code ${code}` : `signal ${signal}`}.`,
        ),
      );
    });
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address !== null && typeof address === "object");
  const { port } = address;
  await new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return port;
}

function appendExpoLog(chunk) {
  expoLog = `${expoLog}${chunk.toString()}`.slice(-30_000);
}

function startExpo(port) {
  const child = spawn(
    npxCommand,
    ["expo", "start", "--web", "--host", "localhost", "--port", String(port)],
    {
      cwd: projectDirectory,
      env: {
        ...process.env,
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
        EXPO_OFFLINE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", appendExpoLog);
  child.stderr.on("data", appendExpoLog);
  return child;
}

async function waitForExpo(url, timeoutMilliseconds = 60_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (expoProcess.exitCode !== null) {
      throw new Error(`Expo exited before becoming ready.\n\n${expoLog}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Metro is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Expo at ${url}.\n\n${expoLog}`);
}

async function stopExpo() {
  if (expoProcess === undefined || expoProcess.exitCode !== null) return;
  expoProcess.kill("SIGINT");
  await Promise.race([once(expoProcess, "exit"), delay(5_000)]);
  if (expoProcess.exitCode === null) {
    expoProcess.kill("SIGTERM");
    await Promise.race([once(expoProcess, "exit"), delay(2_000)]);
  }
  if (expoProcess.exitCode === null) expoProcess.kill("SIGKILL");
}

async function expectOneVisible(locator, description) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  assert.equal(
    await locator.count(),
    1,
    `Expected one visible ${description}.`,
  );
}

const navigationSource = `root:
  items:
    - account
    - documentation

account:
  type: page
  items:
    - email
    - save

email:

save:
  type: action

documentation:
  type: external-link
  url: https://example.com/docs
`;

const indexSource = `import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text>NavSpec Expo Router UI validation</Text>
      <Link href="/navspec" asChild>
        <Pressable style={styles.link}>
          <Text style={styles.linkText}>Enter Navspec</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  link: {
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  linkText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
`;

const layoutSource = `import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Home" }} />
      <Stack.Screen name="navspec" options={{ headerShown: false }} />
    </Stack>
  );
}
`;

const accountPageSource = `import { Text, View } from "react-native";

export default function AccountPage() {
  return (
    <View>
      <Text>Custom account content</Text>
    </View>
  );
}
`;

const integrationSource = `import type { NavSpecIntegration } from "../generated/navspec/expo";
import AccountPage from "./pages/account-page";

export const navSpecIntegration: NavSpecIntegration = {
  label: (_id, fallback) => fallback,
  message: (_id, fallback) => fallback,
  pageComponents: { account: AccountPage },
  invokeAction: (id) => {
    throw new Error(\`No NavSpec action handler is registered for "\${id}".\`);
  },
};
`;

try {
  stage(`Creating Expo SDK 57 project in ${projectDirectory}`);
  await run(
    npxCommand,
    [
      "--yes",
      "create-expo-app",
      projectDirectory,
      "--template",
      "default@57",
      "--yes",
    ],
    { cwd: repositoryDirectory },
  );

  stage("Resetting the template and deleting its example application");
  await run(npmCommand, ["run", "reset-project"], {
    cwd: projectDirectory,
    input: "n\n",
  });
  assert.deepEqual(
    (await readdir(join(projectDirectory, "src", "app"))).sort(),
    ["_layout.tsx", "index.tsx"],
  );

  stage("Initializing and generating the NavSpec route island");
  await writeFile(join(projectDirectory, "nav.yaml"), navigationSource, "utf8");
  await run(process.execPath, [navSpecCli, "init", "--target", "expo-router"], {
    cwd: projectDirectory,
  });
  await run(
    process.execPath,
    [navSpecCli, "generate", "--target", "expo-router"],
    {
      cwd: projectDirectory,
    },
  );
  await mkdir(join(projectDirectory, "src", "navspec", "pages"), {
    recursive: true,
  });
  await writeFile(
    join(projectDirectory, "src", "navspec", "pages", "account-page.tsx"),
    accountPageSource,
    "utf8",
  );
  await writeFile(
    join(projectDirectory, "src", "navspec", "integration.ts"),
    integrationSource,
    "utf8",
  );
  await writeFile(
    join(projectDirectory, "src", "app", "index.tsx"),
    indexSource,
    "utf8",
  );
  await writeFile(
    join(projectDirectory, "src", "app", "_layout.tsx"),
    layoutSource,
    "utf8",
  );

  stage("Type-checking the reset project and generated routes");
  await run(npxCommand, ["tsc", "--noEmit"], { cwd: projectDirectory });

  const port = await availablePort();
  const baseUrl = `http://localhost:${port}`;
  stage(`Starting Expo web at ${baseUrl}`);
  expoProcess = startExpo(port);
  await waitForExpo(baseUrl);

  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      `Chromium could not start. Run \`npx playwright install chromium\` and retry.\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  stage("Verifying Root -> Account -> Email -> back to Account");
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const entry = page.getByRole("link", { name: "Enter Navspec", exact: true });
  await expectOneVisible(entry, "Enter Navspec link");
  await entry.click();
  await page.waitForURL(`${baseUrl}/navspec`);

  await expectOneVisible(page.getByTestId("navspec:node:root"), "root screen");
  const account = page.getByTestId("navspec:edge:root->account");
  await expectOneVisible(account, "Account navigation item");
  await expectOneVisible(
    page.getByTestId("navspec:edge:root->documentation"),
    "Documentation navigation item",
  );
  assert.equal(await account.getByText("Account", { exact: true }).count(), 1);
  await account.click();
  await page.waitForURL(`${baseUrl}/navspec/account`);

  await expectOneVisible(
    page.getByTestId("navspec:node:account"),
    "Account screen",
  );
  await expectOneVisible(
    page.getByText("Custom account content", { exact: true }),
    "custom Account page content",
  );
  const email = page.getByTestId("navspec:edge:account->email");
  await expectOneVisible(email, "Email navigation item");
  await expectOneVisible(
    page.getByTestId("navspec:edge:account->save"),
    "Save action",
  );
  await email.click();
  await page.waitForURL(`${baseUrl}/navspec/email`);
  await expectOneVisible(
    page.getByTestId("navspec:node:email"),
    "Email screen",
  );

  const accountBack = page.getByRole("link", {
    name: "Account, back",
    exact: true,
  });
  await expectOneVisible(accountBack, "Account back link");
  await accountBack.click();
  await page.waitForURL(`${baseUrl}/navspec/account`);
  await expectOneVisible(
    page.getByTestId("navspec:node:account"),
    "Account screen after back navigation",
  );
  assert.deepEqual(
    runtimeErrors,
    [],
    `Browser runtime errors:\n${runtimeErrors.join("\n")}`,
  );

  stage("UI validation passed");
} catch (error) {
  process.exitCode = 1;
  console.error(
    `\n[expo-ui] Validation failed:\n${error instanceof Error ? error.stack : error}`,
  );
  if (expoLog !== "") console.error(`\n[expo-ui] Expo log tail:\n${expoLog}`);
} finally {
  if (browser !== undefined) await browser.close();
  await stopExpo();
  if (shouldClean) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    stage(`Cleaned ${temporaryDirectory}`);
  } else {
    stage(`Retained fixture at ${projectDirectory}`);
  }
}
