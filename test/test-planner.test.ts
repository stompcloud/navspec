import { describe, expect, it } from "vitest";

import { compileNavigation } from "../src/compiler.js";
import { planNavigationTests } from "../src/test-planner.js";

describe("planNavigationTests", () => {
  it("derives edge semantics and one root path for every reachable node", () => {
    const compiled = compileNavigation(`
root:
  items: [account, save, docs]
account:
  items: [privacy]
save:
  type: action
docs:
  type: external-link
  url: https://example.com/docs
privacy:
orphan:
`);
    const plan = planNavigationTests(compiled.ir!);
    expect(plan.reachableNodes).toEqual([
      "root",
      "account",
      "save",
      "docs",
      "privacy",
    ]);
    expect(
      plan.edgeCases.map(({ from, target, intent }) => ({
        from,
        target,
        intent,
      })),
    ).toEqual([
      { from: "root", target: "account", intent: "navigate" },
      { from: "root", target: "save", intent: "invoke-action" },
      { from: "root", target: "docs", intent: "open-external-link" },
      { from: "account", target: "privacy", intent: "navigate" },
    ]);
    expect(
      plan.rootPathCases.find(({ target }) => target === "privacy")?.path,
    ).toEqual(["root", "account", "privacy"]);
  });
});
