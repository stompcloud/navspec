import { describe, expect, it, vi } from "vitest";

import { compileNavigation } from "../src/compiler.js";
import { generateExpoNavigationTests } from "../src/expo-test-generator.js";
import { planNavigationTests } from "../src/test-planner.js";

describe("Expo navigation test generation", () => {
  it("translates generic edge intent without re-planning the graph", () => {
    const compiled = compileNavigation(`root:
  items: [account, save, docs]
account:
save:
  type: action
docs:
  type: external-link
  url: https://example.com/docs
`);
    const plan = planNavigationTests(compiled.ir!);
    const artifact = generateExpoNavigationTests(plan);
    expect(artifact.path).toBe("navigation-tests.ts");
    expect(artifact.contents).toContain('"intent": "navigate"');
    expect(artifact.contents).toContain('"intent": "invoke-action"');
    expect(artifact.contents).toContain('"intent": "open-external-link"');
    expect(vi.isMockFunction(planNavigationTests)).toBe(false);
  });
});
