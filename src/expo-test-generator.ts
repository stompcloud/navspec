import type { NavigationTestPlan } from "./test-planner.js";
import type { GeneratedArtifact } from "./types.js";

export function generateExpoNavigationTests(
  plan: NavigationTestPlan,
): GeneratedArtifact {
  return {
    path: "navigation-tests.ts",
    ownership: "generated",
    contents: `export interface NavSpecNavigationTestHarness {
  readonly openNode: (id: string) => void | Promise<void>;
  readonly press: (testID: string) => void | Promise<void>;
  readonly expectNode: (id: string, testID: string) => void | Promise<void>;
  readonly expectAction: (id: string) => void | Promise<void>;
  readonly expectExternalUrl: (url: string) => void | Promise<void>;
}

export const navSpecNavigationTestPlan = ${JSON.stringify(plan, null, 2)} as const;

export async function runNavSpecEdgeTests(harness: NavSpecNavigationTestHarness) {
  for (const edge of navSpecNavigationTestPlan.edgeCases) {
    await harness.openNode(edge.from);
    await harness.press(\`navspec:edge:\${edge.from}->\${edge.target}\`);
    if (edge.intent === "invoke-action") {
      await harness.expectAction(edge.target);
    } else if (edge.intent === "open-external-link") {
      await harness.expectExternalUrl(edge.expectedUrl);
    } else {
      await harness.expectNode(edge.target, \`navspec:node:\${edge.target}\`);
    }
  }
}

export async function runNavSpecRootPathTests(harness: NavSpecNavigationTestHarness) {
  for (const testCase of navSpecNavigationTestPlan.rootPathCases) {
    await harness.openNode(navSpecNavigationTestPlan.root);
    for (let index = 1; index < testCase.path.length; index += 1) {
      const from = testCase.path[index - 1]!;
      const target = testCase.path[index]!;
      const edge = navSpecNavigationTestPlan.edgeCases.find(
        (candidate) => candidate.from === from && candidate.target === target,
      );
      if (edge === undefined) {
        throw new Error(\`Missing generated edge test for \${from}->\${target}.\`);
      }
      await harness.press(\`navspec:edge:\${from}->\${target}\`);
      if (edge.intent === "invoke-action") {
        await harness.expectAction(target);
      } else if (edge.intent === "open-external-link") {
        await harness.expectExternalUrl(edge.expectedUrl);
      } else {
        await harness.expectNode(target, \`navspec:node:\${target}\`);
      }
    }
  }
}
`,
  };
}
